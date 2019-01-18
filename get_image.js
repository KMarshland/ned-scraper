const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));

/**
 * Downloads the images for a given object, eg 2MASX J06032313+0619195
 *
 * @param {String} objectID             - object to download images for
 * @param {Object} [browser]            - optional instance of a puppeteer browser to avoid repeated startups
 * @param {Object} [existingMetaData]   - optional object metadata to merge with the image data
 */
async function getImagesFor(objectID, { browser, existingMetaData }) {
    const startTime = Date.now();
    console.log(`Getting images for ${objectID}...`);

    const createdBrowser = !browser;
    if (createdBrowser) {
        browser = await puppeteer.launch();
    }

    const page = await browser.newPage();

    const url = `https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(objectID)}&hconst=67.8&omegam=0.308&omegav=0.692&wmap=4&corr_z=1`;

    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.click('a#ui-id-7'); // images tab

    const rows = (await page.$$('#imagetable tr')).slice(2);
    const imageData = await Promise.all(rows.map(async row => {
        return await page.evaluate((row) => {
            const cells = row.querySelectorAll('td');

            return {
                src: cells[0].querySelector('img').src,
                fileSize: cells[1].innerText.trim(),
                information: cells[2].querySelector('a').href,
                lambda: cells[3].innerText.trim(),
                clambda: cells[4].innerText.trim(),
                spectralRegion: cells[5].innerText.trim(),
                band: cells[6].innerText.trim(),
                fov1: cells[7].innerText.trim(),
                fov2: cells[8].innerText.trim(),
                res: cells[9].innerText.trim(),
                telescope: cells[10].innerText.trim(),
                refCode: cells[11].querySelector('a').href
            };
        }, row);
    }));

    const imageUrls = imageData.map(datum => datum.src);

    const objectDir = `data/objects/${objectID}`;

    await mkdirp(objectDir);

    imageUrls.forEach((imageURL, i) => {
        request(imageURL).on('response',  function (res) {
            const ending = res.headers['content-type'].split('/')[1];
            const imageFile = `${objectDir}/image-${i}.${ending}`;
            res.pipe(fs.createWriteStream(imageFile));
        });
    });

    const metadataFile = `${objectDir}/metadata.json`;
    const metadata = Object.assign({}, existingMetaData, {
        objectID,
        images: imageData
    });

    await promisify(fs.writeFile)(metadataFile, JSON.stringify(metadata, null, 4));

    if (createdBrowser) {
        await browser.close();
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Finished getting images for ${objectID} (${imageUrls.length} total, ${elapsedTime}ms)`);
}

module.exports = getImagesFor;
