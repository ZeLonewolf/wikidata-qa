const fs = require('fs');
const xml2js = require('xml2js');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const recommendedTagsFile = process.argv[3];

if (!osmFilePath || !recommendedTagsFile) {
    console.error('Usage: node tagpatch.js <osm-file> <recommended-tags-file>');
    process.exit(1);
}

fs.readFile(osmFilePath, 'utf8', async (err, data) => {
    if (err) {
        console.error('Error reading OSM file:', err);
        return;
    }

    // Read recommended tags file
    let recommendedTags;
    try {
        recommendedTags = JSON.parse(fs.readFileSync(recommendedTagsFile));
    } catch (err) {
        console.error('Error reading recommended tags file:', err);
        return;
    }

    const parser = new xml2js.Parser();
    try {
        const result = await parser.parseStringPromise(data);
        let modified = false;

        // Process relations
        const relations = result.osm.relation || [];
        for (const relation of relations) {
            const relationId = relation.$.id;
            
            // Prepend 'r' prefix when looking up in recommendedTags
            const recommendedChanges = recommendedTags[`r${relationId}`];
            if (!recommendedChanges) continue;

            // Initialize tags array if needed
            if (!relation.tag) {
                relation.tag = [];
            }

            // Apply recommended changes
            for (const [key, value] of Object.entries(recommendedChanges)) {
                const existingTag = relation.tag.find(tag => tag.$.k === key);
                
                if (existingTag) {
                    existingTag.$.v = value;
                } else {
                    relation.tag.push({
                        $: {
                            k: key,
                            v: value
                        }
                    });
                }

                // Add action="modify" to the relation
                if (!relation.$.action) {
                    relation.$.action = 'modify';
                }

                modified = true;
            }
        }

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

    } catch (parseErr) {
        console.error('Error parsing OSM file:', parseErr);
    }
});
