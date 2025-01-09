const { readOsmFile, writeOsmFile } = require('../osm/osm-edit');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const roleToRemove = process.argv[3];

if (!osmFilePath || !roleToRemove) {
    console.error('Usage: node roleclear.js <osm-file> <role-to-remove>');
    process.exit(1);
}

readOsmFile(osmFilePath)
    .then(result => {
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
            return writeOsmFile(osmFilePath, result)
                .then(() => {
                    console.log('OSM file updated successfully.');
                })
                .catch(err => {
                    console.error('Error writing updated OSM file:', err);
                });
        } else {
            console.log('No modifications were necessary.');
        }
    })
    .catch(err => {
        console.error('Error reading/parsing OSM file:', err);
    });
