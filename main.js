const downloadIndices = require('./download_indices');

(async () => {
    console.log(await downloadIndices());
})();