const fs = require('fs');
const xml2js = require('xml2js');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const roleToRemove = process.argv[3];

if (!osmFilePath || !roleToRemove) {
    console.error('Usage: node roleclear.js <osm-file> <role-to-remove>');
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
            const originalLength = members.length;

            // Remove members with matching role
            const newMembers = members.filter(member => member.$.role !== roleToRemove);

            if (newMembers.length < originalLength) {
                relation.member = newMembers;
                
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
