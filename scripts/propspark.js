    const fs = require('fs');
    const xml2js = require('xml2js');
    const { createObjectCsvWriter } = require('csv-writer');

    // Load and parse the OSM file
    const osmFilePath = process.argv[2];
    const sourceTag = process.argv[3];
    const propertyId = process.argv[4];

    if (!osmFilePath || !sourceTag || !propertyId) {
        console.error('Usage: node propspark.js <osm-file> <source-tag> <property-id>');
        process.exit(1);
    }

    fs.readFile(osmFilePath, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading OSM file:', err);
            return;
        }

        const parser = new xml2js.Parser();
        try {
            const result = await parser.parseStringPromise(data);
            const statements = [];

            // Process all element types
            for (const elementType of ['node', 'way', 'relation']) {
                const elements = result.osm[elementType] || [];
                
                for (const element of elements) {
                    const tags = element.tag || [];
                    const wikidataTag = tags.find(tag => tag.$.k === 'wikidata');
                    const sourceTagObj = tags.find(tag => tag.$.k === sourceTag);
                    
                    if (!wikidataTag || !sourceTagObj) continue;

                    statements.push({
                        qid: wikidataTag.$.v,
                        [propertyId]: `en:"${sourceTagObj.$.v}"`
                    });
                }
            }

            if (statements.length > 0) {
                // Write quickstatements CSV
                const csvWriter = createObjectCsvWriter({
                    path: 'quickstatements.csv',
                    header: [
                        {id: 'qid', title: 'qid'},
                        {id: propertyId, title: propertyId}
                    ]
                });

                await csvWriter.writeRecords(statements);
                console.log(`Generated quickstatements.csv with ${statements.length} statements`);
            } else {
                console.log('No statements to generate');
            }

        } catch (parseErr) {
            console.error('Error parsing OSM file:', parseErr);
        }
    });
