const puppeteer = require('puppeteer');
const PromisePool = require('es6-promise-pool');
const { parseIndexFile, parseIndex } = require('./parse_index');
const getImagesFor = require('./get_image');

async function downloadFromIndexFile(indexFile, concurrency) {
    const index = await parseIndexFile(indexFile);
    return downloadIndexObject(index, concurrency);
}

function downloadFromIndex(indexText, concurrency) {
    const index = parseIndex(indexText);
    return downloadIndexObject(index, concurrency);
}

/**
 *
 * @param {Array<Object>} index - parsed index
 * @param {Number} concurrency - number of images to download in parallel
 */
async function downloadIndexObject(index, concurrency=5) {
    const startTime = Date.now();

    console.log(`Downloading images for ${index.length} objects (concurrency ${concurrency})...`);
    const browser = await puppeteer.launch();

    // download them in a pool
    let i = -1;
    const pool = new PromisePool(() => {
        i++;

        if (i >= index.length) {
            return null;
        }

        return getImagesFor(index[i].objectID, {
            browser,
            existingMetaData: index[i],
            debugPrefix: `\t(${i+1}/${index.length}) `
        }).catch((err) => {
            console.log(err.message);
        });
    }, concurrency);

    await pool.start();
    await browser.close();

    const elapsedTime = Date.now() - startTime;
    console.log(`Downloaded images for ${index.length} objects in ${Math.round(elapsedTime/1000)}s`);
}

(async () => {
    if (process.argv.length < 3) {
        throw new Error("No index file provided");
    }

    const concurrency = process.argv.length >= 4 ? parseInt(process.argv[3]) : undefined;
    await downloadFromIndexFile(process.argv[2], concurrency);
})();

module.exports = {
    downloadFromIndexFile,
    downloadFromIndex
};