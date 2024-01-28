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
  <body>
      <h1>US State Boundary Quality Assurance Checks</h1>
      <ul>
  `;

  for (const stateAbbrev in stateData) {
    if (stateData.hasOwnProperty(stateAbbrev)) {
      const findings = stateData[stateAbbrev];
      const stateName = getStateName(stateAbbrev)
      console.log(stateAbbrev);

      // Replace spaces with underscores for file names
      let stateFileName = stateName.replace(/ /g, '_');
      htmlContent += `
        <li>
          ${stateName} <b>${findings}</b> flagged issues
          (<a href="${stateFileName}_flagged.csv">CSV</a>, 
          <a href="${stateFileName}_flagged.html">HTML</a>) 
          all boundaries
          (<a href="${stateFileName}.csv">CSV</a>, 
          <a href="${stateFileName}.html">HTML</a>) 
        </li>
      `;
    }
  }

  htmlContent += `
      </ul>
  </body>
  </html>`;


  // Generate and write the HTML file
  fs.writeFileSync(`${outputDir}/index.html`, htmlContent, (err) => {
    if (err) throw err;
    console.log(`${outputDir}/index.html has been created!`);
  });
}

module.exports = { generateHTML };