const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));

/**
 * Downloads the images for a given object, eg 2MASX J06032313+0619195
 *
 * @param {String} objectID             - object to download images for
 * @param {Promise} [browserPromise]    - optional instance of a puppeteer browser to avoid repeated startups
 * @param {Object} [existingMetaData]   - optional object metadata to merge with the image data
 * @param {String} [debugPrefix]        - optional prefix for debug info
 * @param {Boolean} [guessSource]       - whether or not to try guessing the image url
 */
async function getImagesFor(objectID, { browserPromise, existingMetaData, debugPrefix, guessSource }) {
    // debug info
    const startTime = Date.now();
    debugPrefix = debugPrefix || '';
    console.log(`${debugPrefix}Getting images for ${objectID}${guessSource ? ' (guessing)' : ''}...`);

    // create directories
    const objectDir = `data/objects/${objectID}`;
    await mkdirp(objectDir);
    const metadataFile = `${objectDir}/metadata.json`;

    // check if it's already been downloaded
    if (fs.existsSync(metadataFile)) {
        const existingMetadata = JSON.parse(await promisify(fs.readFile)(metadataFile));

        let allDownloaded = true;
        for (let i = 0; i < existingMetadata.images.length; i++) {
            allDownloaded = allDownloaded && (
                fs.existsSync(`${objectDir}/image-${i}.jpeg`) ||
                fs.existsSync(`${objectDir}/image-${i}.jpg`) ||
                fs.existsSync(`${objectDir}/image-${i}.gif`) ||
                fs.existsSync(`${objectDir}/image-${i}.png`)
            );
            if (!allDownloaded) break;
        }

        // if it guessed before but we're not guessing now, we can't know that it actually did download everything
        if (!guessSource && existingMetadata.guessSource) {
            allDownloaded = false;
        }

        if (allDownloaded) {
            console.log(`${debugPrefix}Images for ${objectID} (${existingMetadata.images.length} total) already downloaded`);
            return;
        }
    }

    // go to the right place
    const createdBrowser = !browserPromise;
    if (createdBrowser) {
        browserPromise = puppeteer.launch();
    }

    const browser = await browserPromise;

    const page = await browser.newPage();

    let imageData;
    let extractionTime = 0;
    let navigationTime = 0;

    if (guessSource) {
        imageData = [
            {
                src: `https://ned.ipac.caltech.edu/uri/IRSA::getImage/${encodeURIComponent(objectID)}`
            }
        ];
    } else {
        const url = `https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(objectID)}&hconst=67.8&omegam=0.308&omegav=0.692&wmap=4&corr_z=1`;

        // if there's a navigation timeout, clean up before re-throwing
        try {
            await page.goto(url, {waitUntil: 'networkidle2'});
        } catch (e) {
            await page.close();
            throw e;
        }

        await page.click('a#ui-id-7'); // images tab

        navigationTime = Date.now() - startTime;

        // extract all the data
        const rows = (await page.$$('#imagetable tr')).slice(2);
        imageData = (await Promise.all([
                page.evaluate(() => {
                    return {
                        src: document.querySelector('#IRSA-Finderchart img').src
                    };
                }),
                ...rows.map(async row => {
                    return await page.evaluate((row) => {
                        const cells = row.querySelectorAll('td');

                        if (!cells[0].querySelector('img')) {
                            return null;
                        }

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
                })
            ])
        ).filter((value) => !!value);

        extractionTime = Date.now() - startTime - navigationTime;
    }

    // download all images
    const imageUrls = imageData.map(datum => datum.src);
    await Promise.all(imageUrls.map((imageURL, i) => downloadImage(imageURL, objectDir, i)));

    const downloadTime = Date.now() - startTime - navigationTime - extractionTime;

    // store metadata
    const metadata = Object.assign({}, existingMetaData, {
        objectID,
        guessSource: !!guessSource,
        images: imageData
    });

    await promisify(fs.writeFile)(metadataFile, JSON.stringify(metadata, null, 4));

    // clean up
    await page.close();

    if (createdBrowser) {
        await browser.close();
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`${debugPrefix}Finished getting images for ${objectID} (${imageUrls.length} total, ${elapsedTime}ms ${navigationTime}/${extractionTime}/${downloadTime})`);
}

function downloadImage(imageURL, objectDir, i) {
    return new Promise((resolve, reject) => {
        request(imageURL)
            .on('error', reject)
            .on('response',  function (res) {
                if (!res.headers['content-type']) {
                    reject('No content type header -- image likely does not exist');
                    return;
                }

                const ending = res.headers['content-type'].split('/')[1];
                const imageFile = `${objectDir}/image-${i}.${ending}`;
                const imagePipe = fs.createWriteStream(imageFile);
                res.pipe(imagePipe);

                imagePipe.on('finish', resolve);
            });
    })
}

module.exports = getImagesFor;
