const { readOsmFile, writeOsmFile, getTagValue, setTag, markAsModified } = require('../osm/osm-edit');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const sourceTag = process.argv[3];
const destTag = process.argv[4];
const searchString = process.argv[5];
const replaceString = process.argv[6] || ''; // Allow empty string as replacement

if (!osmFilePath || !sourceTag || !destTag || !searchString || replaceString === undefined) {
    console.error('Usage: node tag_transform.js <osm-file> <source-tag> <dest-tag> <search-string> <replace-string>');
    process.exit(1);
}

(async () => {
    try {
        const result = await readOsmFile(osmFilePath);
        let modified = false;
        let updateCount = 0;

        // Process all elements that could have tags
        ['node', 'way', 'relation'].forEach(type => {
            if (!result.osm[type]) return;

            result.osm[type].forEach(element => {
                const tagValue = getTagValue(element, sourceTag);
                if (tagValue && tagValue.includes(searchString)) {
                    // Replace all occurrences of the search string
                    const newValue = tagValue.split(searchString).join(replaceString);
                    
                    // Update the destination tag
                    setTag(element, destTag, newValue);
                    markAsModified(element);
                    
                    modified = true;
                    updateCount++;
                    console.log(`Updated ${type} ${element.$.id}: Set ${destTag}="${newValue}" from ${sourceTag}="${tagValue}"`);
                }
            });
        });

        if (modified) {
            await writeOsmFile(osmFilePath, result);
            console.log(`OSM file updated successfully. Modified ${updateCount} elements.`);
        } else {
            console.log('No modifications were necessary.');
        }

    } catch (err) {
        console.error('Error processing OSM file:', err);
    }
})();
