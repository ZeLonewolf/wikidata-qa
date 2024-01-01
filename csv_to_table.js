const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

function convertCsvToHtml(csvFilePath) {
    if (path.extname(csvFilePath) !== '.csv') {
        console.error("The file must have a .csv extension.");
        return;
    }

    const htmlFilePath = csvFilePath.replace('.csv', '.html');

    // Read CSV file
    fs.readFileSync(csvFilePath, 'utf8', function(err, data) {
        if (err) {
            console.error("Could not read file: ", err);
            return;
        }

        // Parse CSV file
        Papa.parse(data, {
            header: true,
            complete: function(results) {
                const rows = results.data;
                let html = '<html><body><table border="1">';

                // Generate table headers
                html += '<tr>';
                Object.keys(rows[0]).forEach(function(key) {
                    html += `<th>${key}</th>`;
                });
                html += '</tr>';

                // Generate table rows
                rows.forEach(function(row) {
                    if(row.length < 2) {
                        return;
                    }
                    html += '<tr>';
                    Object.values(row).forEach(function(value) {
                        // Convert cell values with semi-colons into bulleted lists
                        if (value.includes(';')) {
                            const listItems = value.split(';').map(item => `<li>${item.trim()}</li>`).join('');
                            value = `<ul>${listItems}</ul>`;
                        }
                        // Link OSM relations
                        value = value.replace(/r(\d+)/g, '<a href="https://openstreetmap.org/relation/$1">r$1</a>');
                        // Link Wikidata items
                        value = value.replace(/Q(\d+)/g, '<a href="https://www.wikidata.org/wiki/Q$1">Q$1</a>');
                        html += `<td>${value}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</table></body></html>';

                // Write HTML file
                fs.writeFileSync(htmlFilePath, html, function(writeErr) {
                    if (writeErr) {
                        console.error("Could not write file: ", writeErr);
                    } else {
                        console.log(`HTML file has been created at ${htmlFilePath}`);
                    }
                });
            }
        });
    });
}

module.exports = { convertCsvToHtml };
