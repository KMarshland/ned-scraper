const puppeteer = require('puppeteer');
const timeout = ms => new Promise(res => setTimeout(res, ms));

async function downloadIndices() {
    const browser = await puppeteer.launch();

    const page = await browser.newPage();

    await page.goto('https://ned.ipac.caltech.edu/byparams', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: 'data/screenshots/page-1.png', fullPage: true });

    await solveCaptcha(page);
    await page.screenshot({ path: 'data/screenshots/page-2.png', fullPage: true });

    await setSkyAreaConstraints(page, {
        raMin: '00:00:00',
        raMax: '00:01:00',
        decMin: '00:00:00',
        decMax: '12:00:00',
    });
    await page.screenshot({ path: 'data/screenshots/page-3.png', fullPage: true });

    await setTypeConstraints(page, 'G');
    await page.screenshot({ path: 'data/screenshots/page-4.png', fullPage: true });

    await page.close();
    await browser.close();
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
