const fs = require('fs');

/**
 * Format of each entry in citiesAndTowns:
 * 
 * {
 *   "city": {
 *     "type": "uri",
 *     "value": "http://www.wikidata.org/entity/Q239870"
 *   },
 *   "cityLabel": {
 *     "xml:lang": "en",
 *     "type": "literal",
 *     "value": "Columbus"
 *   }
 * }
 */
function saveCitiesAndTownsToHTML(citiesAndTowns, stateName) {
    // Remove duplicates and sort cities and towns by name
    const uniqueCitiesAndTowns = [...new Map(citiesAndTowns.map(item =>
        [item.cityLabel.value, item]
    )).values()].sort((a, b) => 
        a.cityLabel.value.localeCompare(b.cityLabel.value)
    );

    const html = `
        <html>
        <head>
            <style>
                table {
                    border-collapse: collapse;
                    width: 100%;
                }
                th, td {
                    border: 1px solid black;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f2f2f2;
                }
            </style>
        </head>
        <body>
            <h1>Administrative boundaries in ${stateName} from Wikidata</h1>
            <p>Total number of cities and towns: <b>${uniqueCitiesAndTowns.length}</b></p>
            <table>
                <tr>
                    <th>Name</th>
                    <th>Wikidata ID</th>
                </tr>
                ${uniqueCitiesAndTowns.map(entry => {
                    const qid = entry.city.value.split('/').pop();
                    return `
                        <tr>
                            <td>${entry.cityLabel.value}</td>
                            <td><a href="${entry.city.value}" target="_blank">${qid}</a></td>
                        </tr>
                    `;
                }).join('')}
            </table>
            <p>Total number of cities and towns: <b>${uniqueCitiesAndTowns.length}</b></p>
        </body>
        </html>
    `;
    const safeStateName = stateName.replace(/\s/g, '_');
    fs.writeFileSync(`output/${safeStateName}_citiesAndTowns.html`, html);
}

module.exports = { saveCitiesAndTownsToHTML }