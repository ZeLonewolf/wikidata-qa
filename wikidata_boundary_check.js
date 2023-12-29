const fs = require('fs');
const axios = require('axios');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const inputCSV = process.argv[2];
if (!inputCSV) {
    console.error("Please provide an input CSV file name.");
    process.exit(1);
}

const outputCSV = inputCSV.replace('.csv', '_wd.csv');

const csvWriter = createObjectCsvWriter({
    path: outputCSV,
    header: [
        { id: '@id', title: '@id' },
        { id: 'wikidata', title: 'wikidata' },
        { id: 'name', title: 'name' },
        { id: 'wikidata_name', title: 'wikidata_name' },
        { id: 'P131', title: 'P131' },
        { id: 'P131_name', title: 'P131_name' },
        { id: 'P402', title: 'P402' },
        { id: 'P402_reverse', title: 'P402_reverse' },
        { id: 'flags', title: 'flags' }
    ]
});

// Cache object
const wdCache = new Map();

const getNameFromWikidata = async (qid) => {
    // Check if the result is in the cache
    if (wdCache.has(qid)) {
        console.log(`Cache hit for QID: ${qid}`);
        return wdCache.get(qid);
    }

    try {
        const response = await axios.get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json`);
        const label = response.data.entities[qid].labels.en.value;

        // Cache the result
        wdCache.set(qid, label);

        return label;
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return null;
    }
};

const queryWikidataForOSMID = async (osmId) => {
    const sparqlQuery = `
        SELECT ?item WHERE {
            ?item wdt:P402 "${osmId}".
        }`;

    const url = "https://query.wikidata.org/sparql";
    const params = {
        query: sparqlQuery,
        format: 'json'
    };

    try {
        const response = await axios.get(url, { params });
        const items = response.data.results.bindings.map(binding => binding.item.value);
        return items;
    } catch (error) {
        console.error('Error querying Wikidata:', error);
        return [];
    }
};

const fetchData = async (qid) => {
    try {
        const response = await axios.get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`);
        const claims = response.data.entities[qid].claims;
        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id || '';
        const P402 = claims.P402?.[0]?.mainsnak?.datavalue?.value || '';
        const P131_name = await getNameFromWikidata(P131);
        const wikidata_name = await getNameFromWikidata(qid);
        return { P131, P131_name, wikidata_name, P402 };
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return { P131: '', P131_name: '', wikidata_name: '', P402: '' };
    }
};

function isNullOrEmpty(str) {
    return !str || str.trim().length === 0;
}

const processCSV = async () => {
    const results = [];

    fs.createReadStream(inputCSV)
        .pipe(csv())
        .on('data', (data) => {
            // console.log('Read row:', data); // Debugging line
            results.push(data);
        })
        .on('end', async () => {
            const processedData = [];

            for (const row of results) {
                // console.log('Processing row:', row); // Debugging line

                const P402_reverse_array = await queryWikidataForOSMID(row['@id']);
                const qids = P402_reverse_array.map(itemUrl => itemUrl.substring(itemUrl.lastIndexOf('/') + 1));
                row['P402_reverse'] = qids.join(', ');

                let processedRow;

                if (row.wikidata) { // Make sure this matches your CSV column name
                    const { P131, P131_name, wikidata_name, P402 } = await fetchData(row.wikidata);
                    processedRow = { ...row, P131, P131_name, wikidata_name, P402 };
                } else {
                    processedRow = { ...row, P131: '', P131_name: '', wikidata_name: '', P402: '' };
                }

                const flags = [];

                if(isNullOrEmpty(processedRow.wikidata)) {
                    flags.push("Missing wikidata");
                } else {
                    if(processedRow['@id'] != processedRow.P402) {
                        flags.push("Mismatched OSM ID");
                    }
                    if(processedRow.wikidata_name != processedRow.name) {
                        flags.push("Wikidata name mismatch");
                    }
                }

                if(processedRow.wikidata != processedRow.P402_reverse) {
                    flags.push("Mismatched P402 link");                    
                }

                processedRow.flags = flags.join(";");

                console.log(processedRow);
                processedData.push(processedRow);
            }

            csvWriter.writeRecords(processedData)
                .then(() => console.log('The CSV file was written successfully'));
        });
};

processCSV();
