const axios = require('axios');
const fs = require('fs');
const csvWriter = require('csv-write-stream');

const writer = csvWriter();
writer.pipe(fs.createWriteStream('missing_labels.csv'));

const queryWikidata = async () => {
    const query = `
        SELECT ?item ?osmId WHERE {
            ?item wdt:P402 ?osmId.
            FILTER NOT EXISTS { ?item rdfs:label ?label. }
        } LIMIT 100
    `;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;

    try {
        const response = await axios.get(url);
        return response.data.results.bindings;
    } catch (error) {
        console.error('Error querying Wikidata:', error);
        return [];
    }
};

const getOSMName = async (osmId) => {
    try {
        const response = await axios.get(`https://api.openstreetmap.org/api/0.6/relation/${osmId}/full`);
        const relationData = response.data;
        // You will need to parse the XML and extract the name tag
        // This part is left as an exercise, as it requires XML parsing
        const name = extractNameFromOSMData(relationData); // Implement this function
        return name;
    } catch (error) {
        console.error('Error fetching from OpenStreetMap:', error);
        return null;
    }
};

const extractNameFromOSMData = (data) => {
    // Implement XML parsing to extract the 'name' tag
    // This is a placeholder function
    return 'Example Name';
};

const main = async () => {
    const items = await queryWikidata();
    console.log(`Got items, count=${items.length}`);
    for (const item of items) {
        const osmId = item.osmId.value;
        const name = await getOSMName(osmId);
        if (name) {
            console.log({ wikidataQID: item.item.value, name });
            writer.write({ wikidataQID: item.item.value, name });
        }
    }

    writer.end();
};

main();
