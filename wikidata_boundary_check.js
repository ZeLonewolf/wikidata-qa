const fs = require('fs');
const axios = require('axios');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const inputCSV = process.argv[2];
const outputCSV = process.argv[3];

if (!inputCSV) {
    console.error("Please provide an input CSV file name.");
    process.exit(1);
}

if (!outputCSV) {
    console.error("Please provide an output CSV file name.");
    process.exit(1);
}

const outputIssuesCSV = outputCSV.replace('.csv', '_flagged.csv');
const outputP402CSV = outputCSV.replace('.csv', '_P402_entry.csv');

const csvWriter = createObjectCsvWriter({
    path: outputCSV,
    header: [
        { id: '@id', title: '@id' },
        { id: 'wikidata', title: 'wikidata' },
        { id: 'boundary', title: 'boundary' },
        { id: 'admin_level', title: 'admin_level' },
        { id: 'name', title: 'name' },
        { id: 'wikidata_name', title: 'wikidata_name' },
        { id: 'P31', title: 'P31' },
        { id: 'P31_name', title: 'P31_name' },
        { id: 'P131', title: 'P131' },
        { id: 'P131_name', title: 'P131_name' },
        { id: 'P402', title: 'P402' },
        { id: 'P402_reverse', title: 'P402_reverse' },
        { id: 'flags', title: 'flags' }
    ]
});

const csvIssuesWriter = createObjectCsvWriter({
    path: outputIssuesCSV,
    header: [
        { id: '@id', title: '@id' },
        { id: 'wikidata', title: 'wikidata' },
        { id: 'boundary', title: 'boundary' },
        { id: 'admin_level', title: 'admin_level' },
        { id: 'name', title: 'name' },
        { id: 'wikidata_name', title: 'wikidata_name' },
        { id: 'P31', title: 'P31' },
        { id: 'P31_name', title: 'P31_name' },
        { id: 'P131', title: 'P131' },
        { id: 'P131_name', title: 'P131_name' },
        { id: 'P402', title: 'P402' },
        { id: 'P402_reverse', title: 'P402_reverse' },
        { id: 'flags', title: 'flags' }
    ]
});

const P402Writer = createObjectCsvWriter({
    path: outputP402CSV,
    header: [
        { id: 'qid', title: 'qid' },
        { id: 'P402', title: 'P402' }
    ]
});

// Cache object
const wdCache = new Map();

const getNameFromWikidata = async (qid) => {
    // Check if the result is in the cache
    if (wdCache.has(qid)) {
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

async function checkWikidataRedirect(qid) {
  const url = `https://www.wikidata.org/w/api.php`;

  try {
    const response = await axios.get(url, {
      params: {
        action: 'wbgetentities',
        ids: qid,
        format: 'json',
        redirects: 'yes'
      }
    });

    if (response.data && response.data.entities) {
      if (response.data.entities[qid]) {
        // No redirection
        return null;
      } else {
        // Find the redirect target
        const redirectTarget = Object.keys(response.data.entities)[0];
        return redirectTarget;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking Wikidata redirect:', error);
    return null;
  }
}

const fetchData = async (qid) => {
    try {
        const response = await axios.get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`);
        const claims = response.data.entities[qid].claims;
        const P31 = claims.P31?.[0]?.mainsnak?.datavalue?.value?.id || '';
        const P31_name = await getNameFromWikidata(P31);
        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id || '';
        const P402 = claims.P402?.[0]?.mainsnak?.datavalue?.value || '';
        const P131_name = await getNameFromWikidata(P131);
        const wikidata_name = await getNameFromWikidata(qid);
        return { P131, P131_name, wikidata_name, P402, P31, P31_name };
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return { P131: '', P131_name: '', wikidata_name: '', P402: '', P31: '', P31_name: '' };
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
            const flaggedData = [];
            const quickStatementsP402 = [];

            for (const row of results) {
                // console.log('Processing row:', row); // Debugging line

                const P402_reverse_array = await queryWikidataForOSMID(row['@id']);
                const qids = P402_reverse_array.map(itemUrl => itemUrl.substring(itemUrl.lastIndexOf('/') + 1));
                row['P402_reverse'] = qids.join(', ');

                let processedRow;

                if (row.wikidata) { // Make sure this matches your CSV column name
                    const { P131, P131_name, wikidata_name, P402, P31, P31_name } = await fetchData(row.wikidata);
                    processedRow = { ...row, P131, P131_name, wikidata_name, P402, P31, P31_name };
                } else {
                    processedRow = { ...row, P131: '', P131_name: '', wikidata_name: '', P402: '', P31: '', P31_name: '' };
                }

                const flags = [];

                if(isNullOrEmpty(processedRow.wikidata)) {
                    flags.push("Missing wikidata");
                    if(!isNullOrEmpty(processedRow.P402_reverse)) {
                        flags.push("P402 link found");
                    }
                } else {

                    const wdRedirect = await checkWikidataRedirect(processedRow.wikidata)

                    if(wdRedirect) {
                        flags.push(`OSM wikidata ${processedRow.wikidata} redirects to ${wdRedirect}`);
                    }

                    if(processedRow.wikidata_name != processedRow.name) {
                        flags.push("Wikidata name mismatch");
                    } else if(isNullOrEmpty(processedRow.P402)) {
                        flags.push("Missing OSM Relation ID (P402) in wikidata");
                        quickStatementsP402.push({ qid: row.wikidata, P402: `"${processedRow['@id']}"` });
                    } else {
                        if(processedRow['@id'] != processedRow.P402) {
                            flags.push("Mismatched OSM ID");
                        }
                        //Add check for P402 but no wikidata
                        if(processedRow.wikidata != processedRow.P402_reverse) {
                            flags.push("Mismatched P402 link");                    
                        }
                    }
                    if(processedRow.P31 === "Q498162" && processedRow.boundary == "administrative") { //CDP
                        flags.push("Wikidata CDP / OSM admin boundary");                    
                    }
                    if(processedRow.P31 !== "Q498162" && processedRow.boundary == "census") { //CDP
                        flags.push("OSM CDP / missing wikidata CDP");
                    }
                }

                processedRow.flags = flags.join(";");

                console.log(processedRow);
                processedData.push(processedRow);
                if(flags.length > 0) {
                    flaggedData.push(processedRow);
                }
            }

            csvWriter.writeRecords(processedData)
                .then(() => console.log('The CSV file was written successfully'));

            csvIssuesWriter.writeRecords(flaggedData)
                .then(() => console.log('The CSV flagged-problems file was written successfully'));

            if(quickStatementsP402.length > 0) {
                P402Writer.writeRecords(quickStatementsP402)
                    .then(() => console.log('The P402 CSV file was written successfully'));
            }

        });
};

processCSV();
