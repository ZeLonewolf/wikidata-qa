const { generateHTML } = require('./generate_index.js');
const fs = require('fs');
const path = require('path');

function loadIndexFiles(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    const results = {};
    const filePattern = /^state-[a-z]{2}-findings\.csv$/;

    for (const file of files) {
      if (filePattern.test(file)) {
        const filePath = path.join(folderPath, file);
        const content = fs.readFileSync(filePath, 'utf8');

        const [state, findings] = content.split(',');
        results[state] = parseInt(findings);
      }
    }

    return results;
  } catch (error) {
    console.error('Error reading files:', error);
    return null;
  }
}

const results = loadIndexFiles(process.argv[2]);
console.log(results);
generateHTML(results, process.argv[2]);
