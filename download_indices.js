const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const timeout = ms => new Promise(res => setTimeout(res, ms));

async function downloadIndices() {
    const browser = await puppeteer.launch();
    await mkdirp('data/indices');

    await downloadIndex(browser, {
        raMin: '00:00:00',
        raMax: '00:01:00',
        decMin: '00:00:00',
        decMax: '12:00:00',
        type: 'G'
    });

    await browser.close();
}

async function downloadIndex(browser, constraints) {
    const name = `${constraints.type}-${constraints.raMin}-${constraints.raMax}-${constraints.decMin}-${constraints.decMax}`.replace(/:/g, '');
    const outputPath = `data/indices/${name}.txt`;
    if (fs.existsSync(outputPath)) {
        console.log(`Already downloaded ${name}`);
        return outputPath;
    }

    console.log(`Downloading ${name}...`);
    const page = await browser.newPage();

    await page.goto('https://ned.ipac.caltech.edu/byparams', { waitUntil: 'networkidle2' });

    await solveCaptcha(page);
    await setSkyAreaConstraints(page, constraints);
    await setTypeConstraints(page, constraints.type);

    const whenPageOpened = new Promise((resolve) => {
        browser.on('targetcreated', async target => {
            const openedPage = await target.page();
            resolve(openedPage)
        });
    });

    await page.click('#edit-submit');

    const openedPage = await whenPageOpened;
    await page.close(); // we can safely close the opening page
    console.log(`Request for ${name} dispatched`);

    const url = await getDataUrl(openedPage);
    await downloadData(url, outputPath);

    console.log(`${name} downloaded`);
    return outputPath;
}

function downloadData(dataUrl, outputPath) {
    return new Promise((resolve, reject) => {
        request(dataUrl)
            .on('error', reject)
            .on('response',  function (res) {
                const dataPipe = fs.createWriteStream(outputPath);
                res.pipe(dataPipe);

                dataPipe.on('finish', resolve);
            });
    })
}

async function getDataUrl(page) {
    await page.waitFor('a[target=out]');
    return await page.evaluate(() => document.querySelector('a[target=out]').href);
}

/**
 * Sets sky area constrains on page
 *
 * @param page
 * @param {String} raMin
 * @param {String} raMax
 * @param {String} decMin
 * @param {String} decMax
 * @return {Promise<*>}
 */
async function setSkyAreaConstraints(page, { raMin, raMax, decMin, decMax }) {
    await page.click('#bt');
    await page.select('#edit-rarange', 'Between');
    await page.select('#edit-decrange', 'Between');

    await page.waitFor('#edit-ra1');
    await page.evaluate((value) => document.querySelector('#edit-ra1').value = value, raMin);
    await page.waitFor('#edit-ra2');
    await page.evaluate((value) => document.querySelector('#edit-ra2').value = value, raMax);

    await page.waitFor('#edit-dec1');
    await page.evaluate((value) => document.querySelector('#edit-dec1').value = value, decMin);
    await page.waitFor('#edit-dec2');
    await page.evaluate((value) => document.querySelector('#edit-dec2').value = value, decMax);
}

/**
 * Sets what type of objects you're querying on
 *
 * @param page
 * @param {String} type - type of object to select
 * @return {Promise<void>}
 */
async function setTypeConstraints(page, type) {
    await page.click('#bt[tooltip="Include or exclude objects of specified type"]');

    // TODO: there are more here
    const typeToID = {
        'G': [1, 0],
        'GPair': [1, 1],
        'GTrpl': [1, 2],
        'GGroup': [1, 3],
        'GClstr': [1, 4],
        'QSO': [1, 5],
        'QGroup': [1, 6]
    };

    if (!typeToID[type]) {
        throw new Error(`Invalid type ${type}`);
    }

    const idIndices = typeToID[type];
    const selector = `#ui-multiselect-edit-in-objtypes${idIndices[0]}-option-${idIndices[1]}`;
    // await timeout(1000);
    await page.waitFor(selector);
    await page.evaluate((selector) => document.querySelector(selector).click(), selector);
}

/**
 * Solves captcha on page
 *
 * @param page
 * @return {Promise<*>}
 */
async function solveCaptcha(page) {
    return page.evaluate(() => {
        const matches = document.querySelector('label[for=edit-cortcap-t]').innerText.match(/(\d+) \+ (\d+)/);
        const answer = parseInt(matches[1]) + parseInt(matches[2]);

        document.querySelector('#edit-cortcap-t').value = answer;

        return answer;
    });
}

module.exports = downloadIndices;
