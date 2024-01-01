const fs = require('fs');

// Function to generate the HTML content
function generateHTML(states) {
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

  states.forEach(state => {
    // Replace spaces with underscores for file names
    let stateFileName = state.replace(/ /g, '_');
    htmlContent += `
      <li>
        ${state} 
        (<a href="${stateFileName}_flagged.csv">flagged issues</a>, 
        <a href="${stateFileName}.csv">all boundaries</a>)
      </li>
    `;
  });

  htmlContent += `
      </ul>
  </body>
  </html>`;


  // Generate and write the HTML file
  fs.writeFile('output/index.html', htmlContent, (err) => {
    if (err) throw err;
    console.log('output/index.html has been created!');
  });
}

module.exports = { generateHTML };