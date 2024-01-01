const fs = require('fs');
const axios = require('axios');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const { checkWikipediaMatch } = require('./wikipedia_match.js');

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

//QIDs that correspond to a boundary=census
const CDP_QID = ["Q498162", "Q56064719"];

const outputIssuesCSV = outputCSV.replace('.csv', '_flagged.csv');
const outputP402CSV = outputCSV.replace('.csv', '_P402_entry.csv');

csvHeader = [
        { id: '@id', title: '@id' },
        { id: 'boundary', title: 'boundary' },
        { id: 'admin_level', title: 'admin_level' },
        { id: 'name', title: 'name' },
        { id: 'wikidata', title: 'wikidata' },
        { id: 'wikidata_name', title: 'wikidata_name' },
        { id: 'P31', title: 'P31' },
        { id: 'P31_name', title: 'instance of' },
        { id: 'P131', title: 'P131' },
        { id: 'P131_name', title: 'contained in admin entity' },
        { id: 'P402', title: 'P402' },
        { id: 'P402_reverse', title: 'P402_reverse' },
        { id: 'flags', title: 'flags' }
    ];

const csvWriter = createObjectCsvWriter({
    path: outputCSV,
    header: csvHeader
});

const csvIssuesWriter = createObjectCsvWriter({
    path: outputIssuesCSV,
    header: csvHeader
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
        return "Invalid QID";
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
        const P31Claims = claims.P31 || [];
        const P31Values = [];
        for (const claim of P31Claims) {
            const claimValue = claim.mainsnak.datavalue.value.id;
            if (claimValue) {
                P31Values.push(claimValue);
            }
        }
        const P31 = P31Values.join('; ');

        // Fetch names for each P31 value
        const P31Names = await Promise.all(P31Values.map(getNameFromWikidata));
        const P31_name = P31Names.join('; ');
        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id || '';
        let P402 = claims.P402?.[0]?.mainsnak?.datavalue?.value || '';
        if(!isNullOrEmpty(P402)) {
            P402 = `r${P402}`;
        }
        const P402_count = claims.P402?.length;
        const P131_name = await getNameFromWikidata(P131);
        const wikidata_name = await getNameFromWikidata(qid);
        return { P131, P131_name, wikidata_name, P402, P402_count, P31, P31_name };
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return { P131: '', P131_name: '', wikidata_name: '', P402: '', P402_count: '', P31: '', P31_name: '' };
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
            results.push(data);
        })
        .on('end', async () => {
            const processedData = [];
            const flaggedData = [];
            const quickStatementsP402 = [];

            let rowCount = 0;

            for (const row of results) {

                const P402_reverse_array = await queryWikidataForOSMID(row['@id']);
                const qids = P402_reverse_array.map(itemUrl => itemUrl.substring(itemUrl.lastIndexOf('/') + 1));
                row['P402_reverse'] = qids.join(', ');

                let processedRow;

                const flags = [];

                if (row.wikidata) { // Make sure this matches your CSV column name
                    const { P131, P131_name, wikidata_name, P402, P402_count, P31, P31_name } = await fetchData(row.wikidata);
                    if(P402_count > 1) {
                        flags.push(`Wikidata item points to ${P402_count} different OSM relations`);
                    }
                    processedRow = { ...row, P131, P131_name, wikidata_name, P402, P31, P31_name };
                } else {
                    processedRow = { ...row, P131: '', P131_name: '', wikidata_name: '', P402: '', P31: '', P31_name: '' };
                }

                processedRow['@id'] = `r${processedRow['@id']}`; 

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
                    if (CDP_QID.some(qid => processedRow.P31.includes(qid)) && processedRow.boundary == "administrative") {
                        flags.push("Wikidata says CDP, OSM says admin boundary");
                    }
                    if (!CDP_QID.some(qid => processedRow.P31.includes(qid)) && processedRow.boundary == "census") {
                        flags.push("OSM says CDP but wikidata is missing CDP statement");
                    }
                    if(!isNullOrEmpty(processedRow.admin_level) && processedRow.boundary == "census") { //CDP
                        flags.push("Census boundary should not have admin_level");
                    }
                    if(processedRow.wikipedia) {
                        wpFlag = await checkWikipediaMatch(processedRow.wikidata, processedRow.wikipedia);
                        if(wpFlag) {
                            flags.push(wpFlag);
                        }
                    }
                    
                }

                processedRow.flags = flags.join(";");

                processedData.push(processedRow);
                if(flags.length > 0) {
                    flaggedData.push(processedRow);
                }

                ++rowCount;
                if(rowCount % 100 == 0) {
                    console.log(`Processed: ${rowCount} / ${results.length}`);
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
