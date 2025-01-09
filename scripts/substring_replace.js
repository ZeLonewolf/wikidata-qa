const { readOsmFile, writeOsmFile, getTags, getTagValue, setTag, markAsModified } = require('../osm/osm-edit');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const searchTag = process.argv[3];
const searchString = process.argv[4]; 
const replaceString = process.argv[5];

if (!osmFilePath || !searchTag || !searchString || !replaceString) {
    console.error('Usage: node substring_replace.js <osm-file> <tag> <search-string> <replace-string>');
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
                const tagValue = getTagValue(element, searchTag);
                if (tagValue && tagValue.includes(searchString)) {
                    // Replace all occurrences of the search string
                    const newValue = tagValue.split(searchString).join(replaceString);
                    
                    // Update the tag
                    setTag(element, searchTag, newValue);
                    markAsModified(element);
                    
                    modified = true;
                    updateCount++;
                    console.log(`Updated ${type} ${element.$.id}: "${tagValue}" -> "${newValue}"`);
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

