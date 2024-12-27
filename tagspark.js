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

async function getWikidataValues(qids, propertyId) {
    // Filter out QIDs we already have cached
    const uncachedQids = qids.filter(qid => !wikidataCache.has(qid));
    
    if (uncachedQids.length === 0) {
        return qids.map(qid => wikidataCache.get(qid));
    }

    try {
        const response = await axios.get(`https://www.wikidata.org/w/api.php`, {
            params: {
                action: 'wbgetentities',
                ids: uncachedQids.join('|'),
                props: 'claims',
                format: 'json'
            }
        });

        const entities = response.data.entities;
        
        // Process and cache results
        for (const qid of uncachedQids) {
            const claims = entities[qid]?.claims?.[propertyId];
            if (!claims || claims.length === 0) {
                wikidataCache.set(qid, null);
                continue;
            }

            const value = claims[0].mainsnak.datavalue?.value;
            if (typeof value === 'object' && value.text) {
                wikidataCache.set(qid, value.text);
            } else {
                wikidataCache.set(qid, value);
            }
        }

    } catch (error) {
        console.error(`Error fetching Wikidata batch:`, error.message);
        // Cache failures as null
        uncachedQids.forEach(qid => wikidataCache.set(qid, null));
    }

    return qids.map(qid => wikidataCache.get(qid));
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

        // First collect all QIDs
        const elementQids = [];
        const elementsByQid = new Map();

        for (const elementType of ['node', 'way', 'relation']) {
            const elements = result.osm[elementType] || [];
            
            for (const element of elements) {
                const tags = element.tag || [];
                const wikidataTag = tags.find(tag => tag.$.k === 'wikidata');
                if (!wikidataTag) continue;

                const qid = wikidataTag.$.v;
                elementQids.push(qid);
                elementsByQid.set(qid, {element, tags, elementType});
            }
        }

        // Process QIDs in batches of 50
        for (let i = 0; i < elementQids.length; i += 50) {
            const batchQids = elementQids.slice(i, i + 50);
            const values = await getWikidataValues(batchQids, propertyId);

            for (let j = 0; j < batchQids.length; j++) {
                const qid = batchQids[j];
                const value = values[j];
                const {element, tags, elementType} = elementsByQid.get(qid);

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
