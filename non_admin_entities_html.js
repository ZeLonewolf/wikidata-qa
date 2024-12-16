const { nonAdminQIDsAndLabels } = require('./non_admin_entities');

async function saveNonAdminEntitiesToHTML() {
    const labels = await nonAdminQIDsAndLabels();
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Non-Administrative Entities</title>
    <style>
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
    </style>
</head>
<body>
    <h1>Non-Administrative Entities</h1>

    <p>
        These are the QIDs of entities that are not classified as administrative entities in OSM.
        They are listed on Wikidata as subclasses of Q17361443 (admin. territorial entity of the US)
        but are not tagged as <code>boundary=administrative</code> in OSM.
    </p>

    <table>
        <tr>
            <th>QID</th>
            <th>Label</th>
        </tr>
        ${Object.entries(labels).map(([qid, label]) => `
        <tr>
            <td><a href="https://www.wikidata.org/wiki/${qid}">${qid}</a></td>
            <td>${label}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>`;

    const fs = require('fs');
    const path = require('path');
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)){
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'non_admin_entities.html');
    fs.writeFileSync(outputPath, htmlContent);
    console.log(`HTML file saved to: ${outputPath}`);
}

saveNonAdminEntitiesToHTML();
