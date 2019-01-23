const fs = require('fs');
const { promisify } = require('util');
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

    return index.length;
}

(async () => {
    if (process.argv.length < 3) {
        throw new Error("No index file provided");
    }

    const concurrency = process.argv.length >= 4 ? parseInt(process.argv[3]) : undefined;

    if (process.argv[2] === 'all') {
        const indexDir = 'data/indices';
        const indices = (await promisify(fs.readdir)(indexDir)).filter((filename) => {
            return /\.txt$/.test(filename) && !/\.request\.txt$/.test(filename);
        }).map((filename) => indexDir + '/' + filename);

        console.log(`Downloading all objects from ${indices.length} index files`);
        let downloadCount = 0;
        for (let i = 0; i < indices.length; i++) {
            console.log(`[${new Date().toLocaleString()}] ${downloadCount} complete (out of ${Math.round(indices.length/1000)} million estimated); starting ${indices[i]}`);
            downloadCount += await downloadFromIndexFile(indices[i], concurrency);
        }

        return;
    }

    await downloadFromIndexFile(process.argv[2], concurrency);
})();

module.exports = {
    downloadFromIndexFile,
    downloadFromIndex
};