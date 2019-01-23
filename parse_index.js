const fs = require('fs');
const { promisify } = require('util');

/**
 * Reads a file and dispatches it to parseIndex
 *
 * @param {String} indexFile - file to read from
 * @return {Promise<Array>}
 */
async function parseIndexFile(indexFile) {
    const indexBuffer = await promisify(fs.readFile)(indexFile);

    return parseIndex(indexBuffer.toString('utf8'));
}

/**
 * Parses the text of an index query to a useful javascript object
 *
 * @param {String} indexText - the text of the index
 * @return {Array}
 */
function parseIndex(indexText) {
    const lines = indexText.split("\n").filter((line) => /\|/.test(line)); // only lines with pipe symbols

    // mapping from names to camel case for convenience elsewhere
    const fixedNames = {
        'No.': 'number',
        'Object Name': 'objectID',
        'RA(deg)': 'rightAscensionDegrees',
        'DEC(deg)': 'declinationDegrees',
        'Type': 'type',
        'Velocity': 'velocity',
        'Redshift': 'redshift',
        'Redshift Flag': 'redshiftFlag',
        'Magnitude and Filter': 'magnitudeAndFilter',
        'Separation': 'separation',
        'References': 'references',
        'Notes': 'notes',
        'Photometry Points': 'photometryPoints',
        'Positions': 'positions',
        'Redshift Points': 'redshiftPoints',
        'Diameter Points': 'diameterPoints',
        'Associations': 'associations'
    };

    if (lines.length === 0) {
        return [];
    }

    const header = lines[0].split('|').map((part) => {
        return fixedNames[part] || part;
    });
    const data = lines.slice(1).map(line => line.split('|'));

    return data.map((parts) => {
        const point = {};

        header.forEach((heading, i) => {
            let value = parts[i].trim();

            if (/^\d+(\.\d+)?$/.test(value)) {
                value = parseFloat(value);
            }

            point[heading] = value;
        });

        return point;
    });
}

module.exports = {
    parseIndexFile,
    parseIndex
};
