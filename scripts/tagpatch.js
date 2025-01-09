const { readOsmFile, writeOsmFile, setTag, markAsModified } = require('../osm/osm-edit');
const fs = require('fs');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const recommendedTagsFile = process.argv[3];

if (!osmFilePath || !recommendedTagsFile) {
    console.error('Usage: node tagpatch.js <osm-file> <recommended-tags-file>');
    process.exit(1);
}

(async () => {
    try {
        // Read recommended tags file
        let recommendedTags;
        try {
            recommendedTags = JSON.parse(fs.readFileSync(recommendedTagsFile));
        } catch (err) {
            console.error('Error reading recommended tags file:', err);
            return;
        }

        const result = await readOsmFile(osmFilePath);
        let modified = false;

        // Process relations
        const relations = result.osm.relation || [];
        for (const relation of relations) {
            const relationId = relation.$.id;
            
            // Prepend 'r' prefix when looking up in recommendedTags
            const recommendedChanges = recommendedTags[`r${relationId}`];
            if (!recommendedChanges) continue;

            // Apply recommended changes
            for (const [key, value] of Object.entries(recommendedChanges)) {
                setTag(relation, key, value);
                markAsModified(relation);
                modified = true;
            }
        }

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
