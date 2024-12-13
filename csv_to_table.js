const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

function convertCsvToHtml(csvFilePath, stateName) {

    // Check if the file path is valid
    if (!fs.existsSync(csvFilePath)) {
        console.error(`The specified file ${csvFilePath} does not exist.`);
        return;
    }
    
    // Check file size
    const stats = fs.statSync(csvFilePath);
    const fileSizeInBytes = stats.size;
    console.log("File size in bytes: ", fileSizeInBytes);

    if (path.extname(csvFilePath) !== '.csv') {
        console.error("The file must have a .csv extension.");
        return;
    }
    const htmlFilePath = csvFilePath.replace('.csv', '.html');

    try {
        const data = fs.readFileSync(csvFilePath, 'utf8');

        // Parse CSV file
        Papa.parse(data, {
            header: true,
            complete: function(results) {
                const rows = results.data;
                if (rows.length === 0) {
                    console.error("No data found in the CSV file.");
                    return;
                }

                let html = `
                    <html><body>
                    Updated on <b>${new Date()}</b><br />
                    <a href="https://github.com/ZeLonewolf/wikidata-qa">Source code on GitHub</a><br />
                    <a href="https://overpass-turbo.eu/s/1JzB">border_type Map view (overpass)</a><br />
                    <a href="https://overpass-turbo.eu/s/1FPV">admin_level Map view (overpass)</a><br />
                    <a href="${stateName.replace(" ", "_")}_P402_entry.csv.txt">P402 Entries</a> for <a href="https://quickstatements.toolforge.org/#/batch">quickstatements</a><br />
                    <a href="${stateName.replace(" ", "_")}_citiesAndTowns.html">${stateName} city/town list</a><br />
                    Findings: <b>${rows.length -1}</b><br />
                    <table border="1">
                `;

                // Generate table headers
                html += '<tr>';
                Object.keys(rows[0]).forEach(function(key) {
                    html += `<th>${key}</th>`;
                });
                html += '</tr>';

                // Generate table rows
                rows.forEach(function(row) {
                    if (Object.keys(row).length < 2) {
                        return; // Skip empty rows
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
                        // Link OSM ways
                        value = value.replace(/w(\d+)/g, '<a href="https://openstreetmap.org/way/$1">w$1</a>');
                        // Link Wikidata items
                        value = value.replace(/Q(\d+)/g, '<a href="https://www.wikidata.org/wiki/Q$1">Q$1</a>');
                        html += `<td>${value}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</table></body></html>';

                // Write HTML file
                try {
                    fs.writeFileSync(htmlFilePath, html);
                    console.log(`HTML file has been created at ${htmlFilePath}`);
                } catch (writeErr) {
                    console.error("Could not write file: ", writeErr);
                }
            }
        });

    } catch (err) {
        console.error("Error reading the file: ", err);
        return;
    }


}

module.exports = { convertCsvToHtml };
