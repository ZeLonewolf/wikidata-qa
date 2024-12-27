const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');

// Load and parse the OSM file
const osmFilePath = process.argv[2];
const propertyId = process.argv[3];
const destTag = process.argv[4];

if (!osmFilePath || !propertyId || !destTag) {
    console.error('Usage: node tagspark.js <osm-file> <property-id> <dest-tag>');
    process.exit(1);
}

// Cache for Wikidata API results
const wikidataCache = new Map();

async function getWikidataValue(qid, propertyId) {
    if (wikidataCache.has(qid)) {
        return wikidataCache.get(qid);
    }

    try {
        const response = await axios.get(`https://www.wikidata.org/w/api.php`, {
            params: {
                action: 'wbgetclaims',
                property: propertyId,
                entity: qid,
                format: 'json'
            }
        });

        const claims = response.data.claims[propertyId];
        if (!claims || claims.length === 0) {
            wikidataCache.set(qid, null);
            return null;
        }

        // Get the first value - assumes string/text value
        const value = claims[0].mainsnak.datavalue?.value;
        wikidataCache.set(qid, value);
        return value;

    } catch (error) {
        console.error(`Error fetching Wikidata for ${qid}:`, error.message);
        return null;
    }
}

fs.readFile(osmFilePath, 'utf8', async (err, data) => {
    if (err) {
        console.error('Error reading OSM file:', err);
        return;
    }

    const parser = new xml2js.Parser();
    try {
        const result = await parser.parseStringPromise(data);
        let modified = false;

        // Process all types of OSM elements
        for (const elementType of ['node', 'way', 'relation']) {
            const elements = result.osm[elementType] || [];
            
            for (const element of elements) {
                const tags = element.tag || [];
                
                // Find wikidata tag
                const wikidataTag = tags.find(tag => tag.$.k === 'wikidata');
                if (!wikidataTag) continue;

                const qid = wikidataTag.$.v;
                const value = await getWikidataValue(qid, propertyId);
                
                if (!value) continue;

                // Check if dest tag already exists
                const destTagExists = tags.some(tag => tag.$.k === destTag);
                if (destTagExists) {
                    console.error(`Warning: Destination tag '${destTag}' already exists on ${elementType} ${element.$.id}`);
                    continue;
                }

                // Add the new tag
                tags.push({
                    $: {
                        k: destTag,
                        v: value
                    }
                });

                // Add action="modify" to the element
                if (!element.$.action) {
                    element.$.action = 'modify';
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
