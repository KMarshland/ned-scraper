const process = require('process');
const downloadIndices = require('./download_indices');

(async () => {
    const concurrency = process.argv.length >= 3 ? parseInt(process.argv[2]) : undefined;
    await downloadIndices(concurrency);
})();