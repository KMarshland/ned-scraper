const getImagesFor = require('./get_image');
const { parseIndexFile } = require('./parse_index');
(async () => {
    console.log(await parseIndexFile('data/indices/result.txt'));
})();