const { readOsmFile, writeOsmFile, getTags, setTag, markAsModified } = require('../osm/osm-edit');
const { queryWikidata } = require('../wikidata/wikidata_query_service');

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
        const query = `
            SELECT ?item ?value WHERE {
                VALUES ?item { ${uncachedQids.map(qid => `wd:${qid}`).join(' ')} }
                ?item wdt:${propertyId} ?value .
            }
        `;

        const results = await queryWikidata(query);

        // Process and cache results
        for (const qid of uncachedQids) {
            const result = results.find(r => r.item.value.endsWith(qid));
            if (!result) {
                wikidataCache.set(qid, null);
                continue;
            }

            const value = result.value.value;
            wikidataCache.set(qid, value);
        }

    } catch (error) {
        console.error(`Error querying Wikidata:`, error.message);
        // Cache failures as null
        uncachedQids.forEach(qid => wikidataCache.set(qid, null));
    }

    return qids.map(qid => wikidataCache.get(qid));
}

(async () => {
    try {
        const result = await readOsmFile(osmFilePath);
        let modified = false;

        // First collect all QIDs
        const elementQids = [];
        const elementsByQid = new Map();

        for (const elementType of ['node', 'way', 'relation']) {
            const elements = result.osm[elementType] || [];
            
            for (const element of elements) {
                const tags = getTags(element);
                const wikidataTag = tags.find(tag => tag.$.k === 'wikidata');
                if (!wikidataTag) continue;

                const qid = wikidataTag.$.v;
                elementQids.push(qid);
                elementsByQid.set(qid, {element, elementType});
            }
        }

        // Process QIDs in batches of 50
        for (let i = 0; i < elementQids.length; i += 50) {
            const batchQids = elementQids.slice(i, i + 50);
            const values = await getWikidataValues(batchQids, propertyId);

            for (let j = 0; j < batchQids.length; j++) {
                const qid = batchQids[j];
                const value = values[j];
                const {element, elementType} = elementsByQid.get(qid);

                if (!value) continue;

                // Check if dest tag already exists
                const tags = getTags(element);
                const destTagExists = tags.some(tag => tag.$.k === destTag);
                if (destTagExists) {
                    console.error(`Warning: Destination tag '${destTag}' already exists on ${elementType} ${element.$.id}`);
                    continue;
                }

                // Add the new tag
                setTag(element, destTag, value);
                markAsModified(element);
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
