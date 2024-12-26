const fs = require('fs');
const xml2js = require('xml2js');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
if (!osmFilePath) {
    console.error('Please provide an OSM file path as a command line argument');
    process.exit(1);
}

fs.readFile(osmFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading OSM file:', err);
        return;
    }

    const parser = new xml2js.Parser();
    parser.parseString(data, (parseErr, result) => {
        if (parseErr) {
            console.error('Error parsing OSM file:', parseErr);
            return;
        }

        let modified = false;

        // Iterate through relations
        const relations = result.osm.relation || [];
        relations.forEach((relation) => {
            const members = relation.member || [];
            let hasAdminCentre = false;
            let hasLabel = false;

            // Check roles within the relation
            members.forEach((member) => {
                if (member.$.role === 'admin_centre') {
                    hasAdminCentre = true;
                }
                if (member.$.role === 'label') {
                    hasLabel = true;
                }
            });

            // If it has admin_centre but no label, modify it
            if (hasAdminCentre && !hasLabel) {
                members.forEach((member) => {
                    if (member.$.role === 'admin_centre') {
                        member.$.role = 'label';
                    }
                });

                // Add action="modify" to the relation
                if (!relation.$.action) {
                    relation.$.action = 'modify';
                }

                modified = true;
            }
        });

        if (modified) {
            const builder = new xml2js.Builder({ headless: true });
            const updatedXml = builder.buildObject(result);

            // Write the modified data back to the OSM file
            fs.writeFile(osmFilePath, updatedXml, (writeErr) => {
                if (writeErr) {
                    console.error('Error writing updated OSM file:', writeErr);
                } else {
                    console.log('OSM file updated successfully.');
                }
            });
        } else {
            console.log('No modifications were necessary.');
        }
    });
});
