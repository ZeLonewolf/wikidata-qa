const fs = require('fs');
const xml2js = require('xml2js');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const sourceTag = process.argv[3];
const destTag = process.argv[4];

if (!osmFilePath || !sourceTag || !destTag) {
    console.error('Usage: node tagcp.js <osm-file> <source-tag> <dest-tag>');
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
            const tags = relation.tag || [];
            
            // Find source tag value
            const sourceTagObj = tags.find(tag => tag.$.k === sourceTag);
            if (!sourceTagObj) {
                return; // Skip if source tag not found
            }

            // Check if dest tag already exists
            const destTagExists = tags.some(tag => tag.$.k === destTag);
            if (destTagExists) {
                console.error(`Error: Destination tag '${destTag}' already exists on relation ${relation.$.id}`);
                process.exit(1);
            }

            // Copy source tag value to dest tag
            tags.push({
                $: {
                    k: destTag,
                    v: sourceTagObj.$.v
                }
            });

            // Add action="modify" to the relation
            if (!relation.$.action) {
                relation.$.action = 'modify';
            }

            modified = true;
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
