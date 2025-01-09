const { readOsmFile, writeOsmFile, getTagValue, setTag, markAsModified } = require('../osm/osm-edit');
const { queryWikidata } = require('../wikidata/wikidata_query_service');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const keyValuePairs = process.argv[3];
const wikidataQID = process.argv[4];

if (!osmFilePath || !keyValuePairs || !wikidataQID) {
    console.error('Usage: node wikidata_find.js <osm-file> <key=value;key=value...> <wikidata-qid>');
    process.exit(1);
}

// Parse key=value pairs
const kvPairs = keyValuePairs.split(';').map(pair => {
    const [key, value] = pair.split('=');
    return { key, value };
});

async function getAllWikidataMatches(names, instanceQID) {
    const query = `
        SELECT ?item ?label WHERE {
            ?item wdt:P31 wd:${instanceQID};
                  rdfs:label|skos:altLabel ?label.
            FILTER(LANG(?label) = "en")
            VALUES ?lcLabel { ${names.map(name => `"${name.toLowerCase()}"`).join(' ')} }
            FILTER(LCASE(STR(?label)) = ?lcLabel)
        }
    `;

    const results = await queryWikidata(query);
    const matches = new Map();
    
    results.forEach(result => {
        const item = result.item.value.split('/').pop();
        const label = result.label.value.toLowerCase();
        matches.set(label, item);
    });
    
    return matches;
}

(async () => {
    try {
        const result = await readOsmFile(osmFilePath);
        let modified = false;
        let updateCount = 0;

        // First collect all names that need matching
        const namesToMatch = new Set();
        for (const type of ['node', 'way', 'relation']) {
            if (!result.osm[type]) continue;

            for (const element of result.osm[type]) {
                if (getTagValue(element, 'wikidata')) continue;

                const matches = kvPairs.every(({key, value}) => {
                    const tagValue = getTagValue(element, key);
                    return tagValue === value;
                });

                if (matches) {
                    const name = getTagValue(element, 'name');
                    if (name) {
                        namesToMatch.add(name);
                    }
                }
            }
        }

        // Get all wikidata matches at once
        const wikidataMatches = await getAllWikidataMatches([...namesToMatch], wikidataQID);

        // Apply matches to elements
        for (const type of ['node', 'way', 'relation']) {
            if (!result.osm[type]) continue;

            for (const element of result.osm[type]) {
                if (getTagValue(element, 'wikidata')) continue;

                const matches = kvPairs.every(({key, value}) => {
                    const tagValue = getTagValue(element, key);
                    return tagValue === value;
                });

                if (matches) {
                    const name = getTagValue(element, 'name');
                    if (name) {
                        const wikidataID = wikidataMatches.get(name.toLowerCase());
                        if (wikidataID) {
                            setTag(element, 'wikidata', wikidataID);
                            markAsModified(element);
                            modified = true;
                            updateCount++;
                            console.log(`Added wikidata=${wikidataID} to ${type} ${element.$.id} (${name})`);
                        }
                    }
                }
            }
        }

        if (modified) {
            await writeOsmFile(osmFilePath, result);
            console.log(`OSM file updated successfully. Added wikidata tags to ${updateCount} elements.`);
        } else {
            console.log('No modifications were necessary.');
        }

    } catch (err) {
        console.error('Error processing OSM file:', err);
    }
})();
