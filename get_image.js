const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));

/**
 * Downloads the images for a given object, eg 2MASX J06032313+0619195
 *
 * @param {String} objectID     - object to download images for
 * @param {Object} [browser]    - optional instance of a puppeteer browser to avoid repeated startups
 */
async function getImagesFor(objectID, browser) {
    const startTime = Date.now();
    console.log(`Getting images for ${objectID}...`);

    const createdBrowser = !browser;
    if (createdBrowser) {
        browser = await puppeteer.launch();
    }

    const page = await browser.newPage();

    const url = `https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(objectID)}&hconst=67.8&omegam=0.308&omegav=0.692&wmap=4&corr_z=1`;

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.pdf({ path: 'data/screenshots/page-1.pdf', format: 'A4' });

    await page.click('a#ui-id-7');
    await page.pdf({ path: 'data/screenshots/page-2.pdf', format: 'A4' });

    const imageElements = await page.$$('#imagetable img');
    const imageUrls = (await Promise.all(imageElements.map(imageEl => imageEl.getProperty('src'))))
        .map(url => url._remoteObject.value);

    const imageDir = `data/images/${objectID}`;

    await mkdirp(imageDir);

    imageUrls.forEach((imageURL, i) => {
        request(imageURL).on('response',  function (res) {
            const ending = res.headers['content-type'].split('/')[1];
            res.pipe(fs.createWriteStream(`${imageDir}/image-${i}.${ending}`));
        });
    });

    if (createdBrowser) {
        await browser.close();
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Finished getting images for ${objectID} (${imageUrls.length} total, ${elapsedTime}ms)`);
}

module.exports = getImagesFor;
