const fs = require('fs');
const request = require('sync-request');
const { createObjectCsvWriter } = require('csv-writer');
const { checkWikipediaMatch } = require('./wikipedia_match.js');
const { parse } = require('csv-parse/sync');

//QIDs that correspond to a non-admin boundary (CDP, unincorporated)
const CDP_QID = ["Q498162", "Q56064719", "Q17343829"];

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

function expandAbbreviations(text) {
    if(isNullOrEmpty(text)) {
        return text;
    }
    const abbreviations = {
            "St.": "Saint",
            //Add other cases here
    };
    return text.replace(new RegExp(Object.keys(abbreviations).join("|"), 'g'), matched => abbreviations[matched]);
}

// Cache object
const wdCache = new Map();
const wdClaimsCache = new Map();

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Refactored function to handle fetching and caching of both data types
function cacheWikidataData(qids, cacheClaimsFunction, cacheNamesFunction) {
    const chunkedQids = chunkArray(qids, 50);

    chunkedQids.forEach(chunk => {
        try {
            const res = request('GET', `https://www.wikidata.org/w/api.php`, {
                qs: {
                    action: 'wbgetentities',
                    ids: chunk.join('|'),
                    props: 'claims|labels',
                    languages: 'en', // Only necessary for labels
                    format: 'json'
                }
            });
            const data = JSON.parse(res.getBody('utf8'));

            chunk.forEach(qid => {
                try {
                    if (cacheClaimsFunction) {
                        const claims = data.entities[qid].claims;
                        cacheClaimsFunction(qid, claims);
                    }
                    if (cacheNamesFunction) {
                        const label = data.entities[qid].labels.en.value;
                        cacheNamesFunction(qid, label);
                    }
                } catch (error) {
                    console.log(`Error fetching data for QID [${qid}]:`);
                }
            });

            console.log(`Cached ${chunk.length} wikidata entities (claims and labels)`);
        } catch (error) {
            console.error(`General error fetching data for chunk of QIDs:`, error);
        }
    });
}

// Function to cache both Wikidata claims and names
function cacheWikidataClaimsAndNames(qids) {
    cacheWikidataData(qids, 
        (qid, claims) => wdClaimsCache.set(qid, claims), 
        (qid, label) => wdCache.set(qid, label));
}

function fetchAndCacheWikidataName(qid) {
    try {
        const res = request('GET', `https://www.wikidata.org/w/api.php`, {
            qs: {
                action: 'wbgetentities',
                ids: qid,
                props: 'labels',
                languages: 'en',
                format: 'json'
            }
        });
        const body = JSON.parse(res.getBody('utf8'));
        const label = body.entities[qid].labels.en.value;

        // Cache the result
        wdCache.set(qid, label);

        return label;
    } catch (error) {
        console.error(`Error fetching data for QID [${qid}]:`, error);
        return "Invalid QID";
    }
}

function getNameFromWikidata (qid) {
    if(isNullOrEmpty(qid)) {
        return "";
    } 
    // Check if the result is in the cache
    if (wdCache.has(qid)) {
        return wdCache.get(qid);
    }
    return fetchAndCacheWikidataName(qid);
};

function queryWikidataForOSMID(osmId) {
    const sparqlQuery = `
        SELECT ?item WHERE {
            ?item wdt:P402 "${osmId}".
        }`;

    const url = "https://query.wikidata.org/sparql";

    try {
        const res = request('GET', url, { 
            qs: {
                query: sparqlQuery,
                format: 'json'
            },
            headers: {
                'User-Agent': 'ZeLonewolf-Wikidata-QA-Scripts/1.0 (https://github.com/ZeLonewolf/wikidata-qa)'
            }
        });
        const body = JSON.parse(res.getBody('utf8'));
        const items = body.results.bindings.map(binding => binding.item.value);
        return items;
    } catch (error) {
        console.error(`Error querying Wikidata, OSM ID ${osmId}:`);
        return [];
    }
};

function checkWikidataRedirect(qid) {
  const url = `https://www.wikidata.org/w/api.php`;

  try {
    const res = request('GET', url, {
      qs: {
        action: 'wbgetentities',
        ids: qid,
        format: 'json',
        redirects: 'yes'
      },
      headers: {
        'User-Agent': 'ZeLonewolf-Wikidata-QA-Scripts/1.0 (https://github.com/ZeLonewolf/wikidata-qa)'
      }
    });
    const data = JSON.parse(res.getBody('utf8'));

    if (data && data.entities) {
      if (data.entities[qid]) {
        // No redirection
        return null;
      } else {
        // Find the redirect target
        const redirectTarget = Object.keys(data.entities)[0];
        return redirectTarget;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking Wikidata redirect:', error);
    return null;
  }
}

function fetchData(qid) {
    try {
        const claims = wdClaimsCache.get(qid);

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
        const P31Names = P31Values.map(value => getNameFromWikidata(value));
        const P31_name = P31Names.join('; ');

        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id || '';
        let P402 = claims.P402?.[0]?.mainsnak?.datavalue?.value || '';
        if (!isNullOrEmpty(P402)) {
            P402 = `r${P402}`;
        }
        const P402_count = claims.P402?.length;
        const P131_name = getNameFromWikidata(P131);
        const wikidata_name = getNameFromWikidata(qid);

        return { P131, P131_name, wikidata_name, P402, P402_count, P31, P31_name };
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return { P131: '', P131_name: '', wikidata_name: '', P402: '', P402_count: '', P31: '', P31_name: '' };
    }
};

function isNullOrEmpty(value) {
    return value === null || value === undefined || value === '';
}

async function boundaryCheck(inputCSV, outputCSV, stateAbbrev, CDPs) {

    const outputIssuesCSV = outputCSV.replace('.csv', '_flagged.csv');
    const outputP402CSV = outputCSV.replace('.csv', '_P402_entry.csv');

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

    const writers = {
        csvWriter,
        csvIssuesWriter,
        P402Writer
    }

    // Read the entire file into memory
    const input = fs.readFileSync(inputCSV);

    // Parse the CSV file
    const results = parse(input, {
        columns: true,
        skip_empty_lines: true
    });

    await processCSV(results, writers, stateAbbrev, CDPs);
}

async function processCSV(results, writers, stateAbbrev, CDPs) {

    const processedData = [];
    const flaggedData = [];
    const quickStatementsP402 = [];

    const qids = results
        .map(row => row.wikidata)
        .filter(qid => /^Q\d+$/.test(qid));

    //Pre-cache names
    cacheWikidataClaimsAndNames(qids);

    let unfoundCDPs = [...CDPs];

    let rowCount = 0;
    for (const row of results) {

        if(!isNullOrEmpty(row['name:en'])) {
            //Let English name override main name tag
            row['name'] = row['name:en'];
            delete row['name:en'];
        }

        if(row['boundary'] == 'census') {
            unfoundCDPs = unfoundCDPs.filter(item => item !== row['name']);
        }

        const P402_reverse_array = queryWikidataForOSMID(row['@id']);
        const qids = P402_reverse_array.map(itemUrl => itemUrl.substring(itemUrl.lastIndexOf('/') + 1));
        row['P402_reverse'] = qids.join(', ');

        let processedRow;

        const flags = [];

        if (row.wikidata) { // Make sure this matches your CSV column name
            const { P131, P131_name, wikidata_name, P402, P402_count, P31, P31_name } = fetchData(row.wikidata);
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

            const wdRedirect = checkWikidataRedirect(processedRow.wikidata)

            if(wdRedirect) {
                flags.push(`OSM wikidata ${processedRow.wikidata} redirects to ${wdRedirect}`);
            }

            if(expandAbbreviations(processedRow.wikidata_name) != expandAbbreviations(processedRow.name)) {
                flags.push("Wikidata name mismatch");
            }
            if(isNullOrEmpty(processedRow.P402)) {
                flags.push("Missing OSM Relation ID (P402) in wikidata");
                quickStatementsP402.push({ qid: row.wikidata, P402: `"${processedRow['@id'].substring(1)}"` });
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
                flags.push("Wikidata says CDP/unincorporated, OSM says admin boundary");
            }
            if (!CDP_QID.some(qid => processedRow.P31.includes(qid)) && processedRow.boundary == "census") {
                flags.push("OSM says CDP but wikidata is missing CDP statement");
            }
            if(processedRow.boundary == "census" && !CDPs.includes(processedRow.name)) {
                flags.push(`OSM boundary=census ${processedRow.name} is not on the census bureau <a href="https://tigerweb.geo.census.gov/tigerwebmain/Files/tab20/tigerweb_tab20_cdp_2020_${stateAbbrev}.html">list</a> of CDPs`);
            }
            if(!isNullOrEmpty(processedRow.admin_level) && processedRow.boundary == "census") { //CDP
                flags.push("Census boundary should not have admin_level");
            }
            if(processedRow.wikipedia) {
                wpFlag = checkWikipediaMatch(processedRow.wikidata, processedRow.wikipedia);
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
        if(rowCount % 50 == 0) {
            console.log(`Processed: ${rowCount} / ${results.length}`);
        }
    }

    unfoundCDPs.forEach(cdp =>
        flaggedData.push(
            {
                name: cdp,
                flags: [`${cdp} is missing from OSM but is listed on the Census Bureau <a href="https://tigerweb.geo.census.gov/tigerwebmain/Files/tab20/tigerweb_tab20_cdp_2020_${stateAbbrev}.html">list</a> of CDPs`]
            }
        )    
    );

    await writers.csvWriter.writeRecords(processedData)
        .then(() => console.log('The CSV file was written successfully'));

    await writers.csvIssuesWriter.writeRecords(flaggedData)
        .then(() => console.log('The CSV flagged-problems file was written successfully'));

    if(quickStatementsP402.length > 0) {
        await writers.P402Writer.writeRecords(quickStatementsP402)
            .then(() => console.log('The P402 CSV file was written successfully'));
    }
}

module.exports = { boundaryCheck }
