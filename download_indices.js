const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const process = require('process');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));
const PromisePool = require('es6-promise-pool');

// Do we really want _all_ of these?
const typeToID = {
    'G': [1,0],
    'GPair': [1,1],
    'GTrpl': [1,2],
    'GGroup': [1,3],
    'GClstr': [1,4],
    'QSO': [1,5],
    'QGroup': [1,6],
    'G_Lens-Q_Lens': [1,7],
    'AbLS': [1,8],
    'EmLS': [1,9],

    'SN': [3,0],
    'HII': [3,1],
    'PN': [3,2],
    'SNR': [3,3],
    '*Ass': [3,4],
    '*Cl': [3,5],
    'MCld': [3,6],
    'Nova': [3,7],
    'V*': [3,8],
    'WR*': [3,9],
    'C*': [3,10],
    'PofG': [3,11],
    'Other': [3,12],
    '*': [3,13],
    'Blue*': [3,14],
    'Red*': [3,15],
    'Psr': [3,16],
    'RfN': [3,17],
    '**': [3,18],
    'EmObj': [3,19],
    'Neb': [3,20],
    'WD': [3,21],

    'RadioS': [2,0],
    'SmmS': [2,1],
    'IrS': [2,2],
    'VisS': [2,3],
    'UvS': [2,4],
    'UvES': [2,5],
    'XrayS': [2,6],
    'GammaS': [2,7]
};

const outputDir = 'data/indices';

async function downloadIndices(concurrency=100) {
    process.setMaxListeners(concurrency + 10);

    const browser = await puppeteer.launch();
    await mkdirp(outputDir);

    const constraintPermutations = [];

    const types = Object.keys(typeToID);
    const raMinuteIncrement = 2;
    const declinationHourIncrement = 12;

    const hourToHMS = (hour) => `${hour}:00:00`;
    const minuteToHMS = (minute) => `${Math.floor(minute/60)}:${minute % 60}:00`;

    for (let raMinute = 0; raMinute < 24*60; raMinute += raMinuteIncrement) {
        for (let declinationHour = 0; declinationHour < 24; declinationHour += declinationHourIncrement) {
            types.forEach((type) => {
                constraintPermutations.push({
                    raMin: minuteToHMS(raMinute),
                    raMax: minuteToHMS(raMinute + raMinuteIncrement),
                    decMin: hourToHMS(declinationHour),
                    decMax: hourToHMS(declinationHour + declinationHourIncrement),
                    type
                });
            })
        }
    }

    const totalPermutations = constraintPermutations.length;

    const pool = new PromisePool(() => {
        if (constraintPermutations.length === 0) {
            return null;
        }

        console.log(`${constraintPermutations.length} left (${totalPermutations-constraintPermutations.length} done out of ${totalPermutations} total)`);
        const constraints = constraintPermutations.shift();

        return downloadIndex(browser, constraints).catch((err) => {
            console.log(err.message);
        });
    }, concurrency);

    await pool.start();

    await browser.close();
}

async function downloadIndex(browser, constraints) {
    const startTime = Date.now();

    const name = `${constraints.type}-${constraints.raMin}-${constraints.raMax}-${constraints.decMin}-${constraints.decMax}`.replace(/:/g, '');
    const outputPath = `${outputDir}/${name}.txt`;
    if (fs.existsSync(outputPath)) {
        console.log(`\t[${name}] Already downloaded`);
        return outputPath;
    }

    // check if there's been a request dispatched that we can try
    const partialPath = `${outputDir}/${name}.request.txt`;
    if (fs.existsSync(partialPath)) {
        console.log(`\t[${name}] Dispatched request in earlier run, checking existing request...`);
        const requestURL = (await promisify(fs.readFile)(partialPath)).toString('utf-8');

        try {
            const openedPage = await browser.newPage();
            await openedPage.goto(requestURL, {waitUntil: 'networkidle2'});
            console.log(`\t[${name}] Awaiting job completion (url: ${openedPage.url()})`);
            const url = await getDataUrl(openedPage, name);
            await downloadData(url, outputPath);
            await promisify(fs.unlink)(partialPath); // clean up partial request

            return outputPath;
        } catch (e) {
            await promisify(fs.unlink)(partialPath);
            console.log(`\t[${name}] Reading from existing request failed`);
        }
    }

    console.log(`\t[${name}] Downloading...`);
    const page = await browser.newPage();

    await page.goto('https://ned.ipac.caltech.edu/byparams', { waitUntil: 'networkidle2' });

    await solveCaptcha(page);
    await setSkyAreaConstraints(page, constraints);
    await setTypeConstraints(page, constraints.type);

    const whenPageOpened = new Promise((resolve) => {
        const handleCreation = async function(target) {
            if (!target.opener()) {
                return;
            }

            const opener = await target.opener().page();
            if (opener !== page) {
                return;
            }

            const openedPage = await target.page();
            resolve(openedPage);

            browser.off('targetcreated', handleCreation);
        };

        browser.on('targetcreated', handleCreation);
    });

    await page.click('#edit-submit');
    console.log(`\t[${name}] Request dispatched`);

    const openedPage = await whenPageOpened;
    await promisify(fs.writeFile)(partialPath, openedPage.url());
    console.log(`\t[${name}] Awaiting job completion (url: ${openedPage.url()})`);
    await page.close(); // we can safely close the opening page

    const url = await getDataUrl(openedPage, name);
    await downloadData(url, outputPath);
    await promisify(fs.unlink)(partialPath); // clean up partial request

    const elapsedTime = Date.now() - startTime;
    console.log(`\t[${name}] Downloaded in ${Math.round(elapsedTime/1000)}s`);
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

/**
 * Waits for job completion and then returns the data url
 *
 * @param page
 * @param {String} name
 * @param {Number} maxAttempts - max number of waitFor timeouts to wait (typically happens within one or two but is poisson distributed)
 * @return {Promise<String>}
 */
async function getDataUrl(page, name, maxAttempts = 120) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            await page.waitFor('a[target=out]');
        } catch (e) { // odds are chrome just didn't detect it, so check manually
            console.log(`\t[${name}] Not complete after attempt ${attempt}`);
            const exists = await page.evaluate(() => !!document.querySelector('a[target=out]'));

            if (!exists && attempt === maxAttempts - 1) {
                page.screenshot({ path: `data/screenshots/err-${Date.now()}.png`, fullPage: true });
                throw new Error('Failed to get data url, rip');
            }
        }
    }
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
    if (raMax === '24:00:00') {
        raMax = '23:59:59';
    }

    if (decMax === '24:00:00') {
        decMax = '23:59:59';
    }

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
