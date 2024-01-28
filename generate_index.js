const { getStateName } = require('./state_abbreviation');
const fs = require('fs');
const path = require('path');

// Function to generate the HTML content
function generateHTML(stateData, outputDir) {
  let htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Boundary Quality Assurance Checks</title>
  </head>
  <style>
    table {
      border-collapse: collapse; /* Ensures that the borders between cells are shared */
    }
    td, th {
      border: 1px solid black; /* Adds a 1px solid black border around each table cell */
    }
  </style>
  <body>
      <h1>US State Boundary Quality Assurance Checks</h1>
      <table>
      <tr><th>State</th><th colspan="3">Flagged Issues</th>
  `;

  for (const stateAbbrev in stateData) {
    if (stateData.hasOwnProperty(stateAbbrev)) {
      const findings = stateData[stateAbbrev];
      const stateName = getStateName(stateAbbrev)
      console.log(stateAbbrev);

      // Replace spaces with underscores for file names
      let stateFileName = stateName.replace(/ /g, '_');
      htmlContent += `
        <tr>
          <td>${stateName}</td>
          <td><b>${findings}</b></td>
          <td><a href="${stateFileName}_flagged.csv">CSV</a></td>
          <td><a href="${stateFileName}_flagged.html">HTML</a></td>
        </tr>
      `;
    }
  }

  htmlContent += `
      </table>
  </body>
  </html>`;


  // Generate and write the HTML file
  fs.writeFileSync(`${outputDir}/index.html`, htmlContent, (err) => {
    if (err) throw err;
    console.log(`${outputDir}/index.html has been created!`);
  });
}

module.exports = { generateHTML };