const puppeteer = require('puppeteer');
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
 */
async function downloadIndexObject(index) {
    const startTime = Date.now();

    console.log(`Downloading images for ${index.length} objects...`);
    const browser = await puppeteer.launch();

    for (let i = 0; i < index.length; i++) {
        await getImagesFor(index[i].objectID, {
            browser,
            existingMetaData: index[i],
            debugPrefix: '\t'
        });
    }

    await browser.close();

    const elapsedTime = Date.now() - startTime;
    console.log(`Downloaded images for ${index.length} objects in ${Math.round(elapsedTime/1000)}s`);
}

module.exports = {
    downloadFromIndexFile,
    downloadFromIndex
};