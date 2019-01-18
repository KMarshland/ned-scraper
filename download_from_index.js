const puppeteer = require('puppeteer');
const PromisePool = require('es6-promise-pool');
const { parseIndexFile, parseIndex } = require('./parse_index');
const getImagesFor = require('./get_image');

async function downloadFromIndexFile(indexFile) {
    const index = await parseIndexFile(indexFile);
    return downloadIndexObject(index);
}

function downloadFromIndex(indexText) {
    const index = parseIndex(indexText);
    return downloadIndexObject(index);
}

/**
 *
 * @param {Array<Object>} index - parsed index
 * @param {Number} concurrency - number of images to download in parallel
 */
async function downloadIndexObject(index, concurrency=5) {
    const startTime = Date.now();

    console.log(`Downloading images for ${index.length} objects...`);
    const browser = await puppeteer.launch();

    // download them in a pool
    let i = 0;
    const pool = new PromisePool(() => {
        i++;

        if (i >= index.length) {
            return null;
        }

        return getImagesFor(index[i].objectID, {
            browser,
            existingMetaData: index[i],
            debugPrefix: `\t(${i+1}/${index.length}) `
        });
    }, concurrency);

    await pool.start();
    await browser.close();

    const elapsedTime = Date.now() - startTime;
    console.log(`Downloaded images for ${index.length} objects in ${Math.round(elapsedTime/1000)}s`);
}

module.exports = {
    downloadFromIndexFile,
    downloadFromIndex
};