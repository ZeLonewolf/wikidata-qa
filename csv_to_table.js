const fs = require('fs');
const Papa = require('papaparse');
const path = require('path');

function applyOSMAndWikidataLinks(value) {
    let linkedValue = value;
    // Link OSM relations
    linkedValue = linkedValue.replace(/^r(\d+)$/g, '<a href="https://openstreetmap.org/relation/$1">r$1</a>');
    // Link OSM ways  
    linkedValue = linkedValue.replace(/^w(\d+)$/g, '<a href="https://openstreetmap.org/way/$1">w$1</a>');
    // Link Wikidata items
    linkedValue = linkedValue.replace(/^Q(\d+)$/g, '<a href="https://www.wikidata.org/wiki/Q$1">Q$1</a>');
    return linkedValue;
}

function convertCsvToHtml(csvFilePath, state, bulkFile) {

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
                    <a href="${state.urlName}_P402_entry.csv.txt">P402 Entries</a> for <a href="https://quickstatements.toolforge.org/#/batch">quickstatements</a><br />
                    <a href="${state.urlName}_citiesAndTowns.html">${state.name} city/town list</a><br />`;

                if (bulkFile) {
                    html += `<a href="#bulk_tools">Jump to bulk edit tools</a><br />`;
                }

                html += `
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
                            const items = value.split(';').map(item => item.trim());
                            // Apply OSM and Wikidata linking to each item
                            const linkedItems = items.map(item => {
                                return `<li>${applyOSMAndWikidataLinks(item)}</li>`;
                            }).join('');
                            value = `<ul>${linkedItems}</ul>`;
                        } else {
                            value = applyOSMAndWikidataLinks(value);
                        }
                        html += `<td>${value}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</table>';

                // Add bulk findings section if bulkFile exists
                if (bulkFile && fs.existsSync(bulkFile)) {
                    const bulkData = JSON.parse(fs.readFileSync(bulkFile, 'utf8'));
                    if (bulkData && bulkData.length > 0) {
                        html += `
                            <h2 id="bulk_tools">Bulk Edit Tools</h2>
                            <p>The following JOSM filters can be used to identify groups of objects that may need attention:</p>
                        `;
                        
                        bulkData.forEach(filter => {
                            html += `
                                <div style="margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px;">
                                    <h3>${filter.title}</h3>
                                    <p>${filter.description}</p>
                                    <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 3px;">${filter.filter}</pre>
                                </div>
                            `;
                        });
                    }
                }

                html += '</body></html>';

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
