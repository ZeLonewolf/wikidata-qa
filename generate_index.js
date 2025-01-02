const { getStateName } = require('./state_abbreviation');
const fs = require('fs');
const path = require('path');

/**
 * Generates an HTML index page summarizing boundary QA findings across all states
 * @param {Object} stateData - Object mapping state abbreviations to number of findings
 * @param {string} outputDir - Directory to write the output HTML file
 */
function generateHTML(stateData, outputDir) {
    // Calculate total findings across all states
    const totalFindings = Object.values(stateData).reduce((sum, count) => sum + count, 0);

    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Boundary Quality Assurance Checks</title>
    <style>
        table {
            border-collapse: collapse;
            margin: 20px 0;
        }
        td, th {
            border: 1px solid black;
            padding: 8px;
        }
        a {
            text-decoration: none;
            color: #0066cc;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <h1>US State Boundary Quality Assurance Checks</h1>
    <table>
        <tr>
            <th>State</th>
            <th colspan="3"><b>${totalFindings.toLocaleString()}</b> Flagged Issues</th>
            <th colspan="2">All Boundaries</th>
        </tr>`;

    // Generate a row for each state
    for (const stateAbbrev in stateData) {
        if (stateData.hasOwnProperty(stateAbbrev)) {
            const findings = stateData[stateAbbrev];
            const stateName = getStateName(stateAbbrev);
            
            // Replace spaces with underscores for filenames
            const stateFileName = stateName.replace(/ /g, '_');
            
            htmlContent += `
            <tr>
                <td>${stateName}</td>
                <td><b>${findings.toLocaleString()}</b></td>
                <td><a href="${stateFileName}_flagged.csv">CSV</a></td>
                <td><a href="${stateFileName}_flagged.html">HTML</a></td>
                <td><a href="${stateFileName}.csv">CSV</a></td>
                <td><a href="${stateFileName}.html">HTML</a></td>
            </tr>`;
        }
    }

    htmlContent += `
    </table>
</body>
</html>`;

    // Write the HTML file
    const outputPath = path.join(outputDir, 'index.html');
    fs.writeFileSync(outputPath, htmlContent);
    console.log(`Generated index page at ${outputPath}`);
}

module.exports = { generateHTML };