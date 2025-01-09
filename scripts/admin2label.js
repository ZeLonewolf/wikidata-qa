const { readOsmFile, writeOsmFile, getTags, getTagValue, markAsModified, getMembers } = require('../osm/osm-edit');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
if (!osmFilePath) {
    console.error('Please provide an OSM file path as a command line argument');
    process.exit(1);
}

(async () => {
    try {
        const result = await readOsmFile(osmFilePath);
        let modified = false;

        // Iterate through relations
        const relations = result.osm.relation || [];
        relations.forEach((relation) => {
            const tags = getTags(relation);
            
            // Check if relation matches criteria
            let isValidBoundary = false;
            let hasValidAdminLevel = false;
            
            const boundaryValue = getTagValue(relation, 'boundary');
            if (boundaryValue) {
                if (['census', 'statistical'].includes(boundaryValue)) {
                    isValidBoundary = true;
                } else if (boundaryValue === 'administrative') {
                    // Check for admin_level
                    const adminLevel = getTagValue(relation, 'admin_level');
                    if (adminLevel === '7' || adminLevel === '8') {
                        hasValidAdminLevel = true;
                    }
                }
            }

            // Only process if boundary type matches criteria
            if (isValidBoundary || hasValidAdminLevel) {
                const members = getMembers(relation);
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

                    markAsModified(relation);
                    modified = true;
                }
            }
        });

        if (modified) {
            await writeOsmFile(osmFilePath, result);
            console.log('OSM file updated successfully.');
        } else {
            console.log('No modifications were necessary.');
        }

    } catch (err) {
        console.error('Error processing OSM file:', err);
    }
})();
