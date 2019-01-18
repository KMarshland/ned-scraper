const { downloadFromIndexFile } = require('./download_from_index');

(async () => {
    console.log(await downloadFromIndexFile('data/indices/result.txt'));
})();