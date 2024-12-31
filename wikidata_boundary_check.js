const fs = require('fs');
const request = require('sync-request');
const { createObjectCsvWriter } = require('csv-writer');
const { parse } = require('csv-parse/sync');
const {
    matchStringsIgnoringDiacritics,
    splitFirstCommaComponent,
    cleanAndNormalizeString,
    expandAbbreviations,
    isNullOrEmpty
} = require('./util-strings');
const { 
    retrieveWikidataData, 
    fetchOSMIDLinks 
} = require('./wikidata_query_service');

//QIDs that correspond to a non-admin boundary (CDP, unincorporated)
const CDP_QID = ["Q498162", "Q56064719", "Q17343829"];

//Map of required tag->key combinations
const validBoundaryTags = {
    "administrative": {
        "required": {
            "name": true,
            "admin_level": true,
            "wikidata": true,
            "border_type": true,
            "type": "boundary"
        },
        "disallowed": ["place"]
    },
    "census": {
        "required": {
            "name": true,
            "wikidata": true,
            "type": "boundary"
        },
        "disallowed": ["place"]
    },
    "place": {
        "required": {
            "name": true,
            "wikidata": true,
            "type": "boundary",
            "place": true
        },
        "disallowed": ["admin_level", "border_type"]
    }
}

const tagPropertyPairs = {
    "official_name": "P1448",
    "short_name": "P1813"
}

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

function validateTags(row, flags) {
    const boundaryType = row.boundary;
    const validTags = validBoundaryTags[boundaryType];

    if (!validTags) {
        console.log(`No validator rules for boundary type: ${boundaryType}`);
        return;
    }

    for (const key in validTags.required) {
        const value = validTags.required[key];
        if (!row[key]) {
            if (value === true) {
                flags.push(`boundary=${boundaryType}: Missing expected tag: ${key}`);
            } else {
                flags.push(`boundary=${boundaryType}: Tag ${key}=${value} is expected but actual value is ${key}=${row[key]}`);
            }
        }
    }

    for (const key of validTags.disallowed) {
        if (row[key]) {
            flags.push(`boundary=${boundaryType} is set but ${key}=* is unexpected`);
        }
    }

    /**
     * Check if OSM tags match corresponding Wikidata properties. 
     * These tag/property pairs should be both present or both absent, otherwise a finding is flagged.
     */
    const qid = row.wikidata;

    if(qid) {
        const claims = wdClaimsCache.get(qid);

        for (const [tag, property] of Object.entries(tagPropertyPairs)) {
            const hasOsmTag = !isNullOrEmpty(row[tag]);
            const hasWikidataProperty = claims && claims[property]?.length > 0;

            // Flag if one exists without the other
            if (hasOsmTag !== hasWikidataProperty) {
                if (hasOsmTag) {
                    flags.push(`${tag} exists in OSM but no ${property} in Wikidata`);
                } else {
                    flags.push(`${property} exists in Wikidata but no ${tag} in OSM. Use <code>node tagspark.js <osm-file> ${property} ${tag}</code> to copy this value to OSM.`);
                }
            }
            // If both exist, check if values match
            else if (hasOsmTag && hasWikidataProperty) {
                const wikidataValues = claims[property].map(claim => 
                    claim.mainsnak.datavalue.value.text
                );
                
                if (!wikidataValues.includes(row[tag])) {
                    flags.push(`${tag}=${row[tag]} does not match Wikidata ${property} value`);
                }
            }
        }
    }
}

// Cache object
const wdCache = new Map();
const wdClaimsCache = new Map();
const wdRedirects = new Map();
const wdSitelinksCache = new Map();
const wdAliasesCache = new Map();
const wdOSMRelReverseLink = new Map();
const CHUNK_SIZE = 50;

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

function retrieveWikidataDataInChunks(qids) {
    const chunkedQids = chunkArray(qids, CHUNK_SIZE);
    const results = chunkedQids.map(chunk => retrieveWikidataData(chunk));
    // Merge all the results into a single object
    return results.reduce((merged, result) => {
        return {
            ...merged,
            entities: {
                ...merged.entities,
                ...result.entities
            }
        };
    }, { entities: {} });
}
// Refactored function to handle fetching and caching of both data types
function cacheWikidataData(qids, cacheClaimsFunction, cacheNamesFunction, cacheSitelinksFunction, cacheAliasesFunction) {
    const chunkedQids = chunkArray(qids, CHUNK_SIZE);

    chunkedQids.forEach(chunk => {
        try {
            const data = retrieveWikidataData(chunk);
            chunk.forEach(qid => {
                try {
                    if (cacheClaimsFunction) {
                        const claims = data.entities[qid].claims;
                        cacheClaimsFunction(qid, claims);
                    }
                    if (cacheNamesFunction) {
                        const names = data.entities[qid].labels.en.value;
                        cacheNamesFunction(qid, names);
                    }
                    if (cacheSitelinksFunction) {
                        // Retrieve and process sitelinks
                        const sitelinks = data.entities[qid].sitelinks;
                        cacheSitelinksFunction(qid, sitelinks);
                    }
                    if (cacheAliasesFunction) {
                        let aliases = data.entities[qid].aliases || {};

                        // Initialize aliases.en if it doesn't exist
                        if (!aliases.en) {
                            aliases.en = [];
                        }

                        // Also allow the OSM name to be the official name
                        // Resolves, e.g., Town of XYZ, New York
                        if (data.entities[qid].claims?.P1448) {
                            const officialNames = data.entities[qid].claims.P1448
                                .filter(claim => claim.mainsnak?.datavalue?.value?.text)
                                .map(claim => claim.mainsnak.datavalue.value.text);
                            
                            // Add each official name as an alias with language tag
                            officialNames.forEach(name => {
                                aliases.en.push({language: 'en', value: name});
                            });
                        }
                        cacheAliasesFunction(qid, aliases);
                    }
                } catch (error) {
                    console.log(`Error fetching data for QID [${qid}]:`, error);
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
        (qid, label) => wdCache.set(qid, label),
        (qid, sitelinks) => wdSitelinksCache.set(qid, sitelinks),
        (qid, aliases) => wdAliasesCache.set(qid, aliases)
    );
}

function getNamesFromWikidata (qid) {
    if(isNullOrEmpty(qid)) {
        return "";
    } 
    // Check if the result is in the cache
    if (wdCache.has(qid)) {
        const mainName = wdCache.get(qid);
        const aliasArray = wdAliasesCache.get(qid)?.en?.map(a => splitFirstCommaComponent(a.value)) || [];
        // Create set with main name and aliases, then convert back to array
        const uniqueNames = new Set([mainName, ...aliasArray]);
        return Array.from(uniqueNames);
    }
    // On cache miss, fetch and cache the data
    const data = retrieveWikidataData([qid]);
    if (data.entities[qid]) {
        const label = data.entities[qid].labels?.en?.value;
        const aliases = data.entities[qid].aliases;
        if (label) {
            wdCache.set(qid, label);
            wdAliasesCache.set(qid, aliases);
            const aliasArray = aliases?.en?.map(a => a.value.split(',')[0]) || [];
            const uniqueNames = new Set([label, ...aliasArray]);
            return Array.from(uniqueNames);
        }
    }
    console.log(`Error! Failed to fetch data for ${qid}`);
    return [];
};

function cacheWikidataToOSMIDLinks(osmIds) {
    // Split the OSM IDs into chunks of 50
    const chunks = chunkArray(osmIds, 50);

    for (const chunk of chunks) {
        const body = fetchOSMIDLinks(chunk);
        
        if (body) {
            body.results.bindings.forEach(binding => {
                // Extract QID from the URL
                const qid = binding.item.value.split('/').pop();
                const osmId = binding.osmId.value;

                if (wdOSMRelReverseLink.has(osmId)) {
                    wdOSMRelReverseLink.get(osmId).push(qid);
                } else {
                    wdOSMRelReverseLink.set(osmId, [qid]);
                }
            });
            console.log(`Cached ${chunk.length} P402 reverse wikidata references`);
        }
    }
};
function cacheWikidataRedirects(qids) {
  const url = `https://www.wikidata.org/w/api.php`;

    if (qids.length === 0) {
        return;
    }

    const chunkedQids = chunkArray(qids, CHUNK_SIZE);
    chunkedQids.forEach(chunk => {

        try {
            const res = request('GET', url, {
            qs: {
                action: 'wbgetentities',
                ids: chunk.join('|'),
                format: 'json',
                redirects: 'yes'
            },
            headers: {
                'User-Agent': 'ZeLonewolf-Wikidata-QA-Scripts/1.0 (https://github.com/ZeLonewolf/wikidata-qa)'
            }
            });
            const data = JSON.parse(res.getBody('utf8'));

            if (data && data.entities) {
                chunk.forEach(qid => {
                    if (data.entities[qid]) {
                        // No redirection
                        wdRedirects.set(qid, null);
                    } else {
                        // Find the redirect target
                        const redirectTarget = Object.keys(data.entities).find(key => key !== qid);
                        wdRedirects.set(qid, redirectTarget);
                    }
                });
            }
            console.log(`Cached ${chunk.length} wikidata redirect checks`);

        } catch (error) {
            console.error('Error checking Wikidata redirects:', error);
        }
    });
}

function checkWikidataRedirect(qid) {
    return wdRedirects.get(qid);
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

        // Fetch first name for each P31Values value
        const P31_name = P31Values.map(id => getNamesFromWikidata(id)[0]).join('; ');

        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id || '';
        let P402 = claims.P402?.[0]?.mainsnak?.datavalue?.value || '';
        if (!isNullOrEmpty(P402)) {
            P402 = `r${P402}`;
        }
        const P402_count = claims.P402?.length;
        const P131_name = getNamesFromWikidata(P131)[0];
        const wikidata_names = getNamesFromWikidata(qid);

        return { P131, P131_name, wikidata_names, P402, P402_count, P31, P31_name };
    } catch (error) {
        console.error(`Error fetching data for QID ${qid}:`, error);
        return { P131: '', P131_name: '', wikidata_names: [], P402: '', P402_count: '', P31: '', P31_name: '' };
    }
};

async function boundaryCheck(inputCSV, outputCSV, state, censusPlaces, citiesAndTowns) {

    const outputIssuesCSV = outputCSV.replace('.csv', '_flagged.csv');
    const outputP402CSV = outputCSV.replace('.csv', '_P402_entry.csv.txt');

    const csvWriter = createObjectCsvWriter({
        path: outputCSV,
        header: csvHeader,
        fieldDelimiter: ',',
        quote: '"'
    });

    const csvIssuesWriter = createObjectCsvWriter({
        path: outputIssuesCSV,
        header: csvHeader,
        fieldDelimiter: ',',
        quote: '"'
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

    return await processCSV(results, writers, state, censusPlaces, citiesAndTowns);
}

function simplifyWDNames(names) {
    if (!Array.isArray(names)) {
        return [];
    }
    return names.map(name => name.split(',')[0]);
}

function getClaimWDQIDsForLookup() {
    const distinctQIDs = new Set();

    for (const claims of wdClaimsCache.values()) {
        if(claims === undefined) {
            continue;
        }
        const P31Claims = claims.P31 || [];
        for (const claim of P31Claims) {
            const claimValue = claim.mainsnak.datavalue.value.id;
            if (claimValue) {
                distinctQIDs.add(claimValue);
            }
        }
        const P131 = claims.P131?.[0]?.mainsnak?.datavalue?.value?.id;
        if (P131) distinctQIDs.add(P131);
    }

    return Array.from(distinctQIDs);
}
async function processCSV(results, writers, state, censusPlaces, citiesAndTowns) {
    const processedData = [];
    const flaggedData = [];
    const quickStatementsP402 = [];
    const bulkFindings = [];

    const qids = results
        .map(row => row.wikidata)
        .filter(qid => /^Q\d+$/.test(qid));

    //Pre-cache names
    cacheWikidataClaimsAndNames(qids);
    cacheWikidataRedirects(qids);
    cacheWikidataClaimsAndNames(getClaimWDQIDsForLookup());
    cacheWikidataToOSMIDLinks(results.map(row => row['@id']));

    // Generate list of duplicate city names
    const cityNameCounts = citiesAndTowns.reduce((acc, entry) => {
        const name = cleanAndNormalizeString(entry.cityLabel.value);
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});

    const duplicateCityNames = Object.entries(cityNameCounts)
        .filter(([_, count]) => count > 1)
        .map(([name]) => name);

    console.log(`Found ${duplicateCityNames.length} cities with duplicate names: ${duplicateCityNames.join(', ')}`);

    //Make a map of normalized city name to list of wikidata QIDs
    const duplicateCityNameToQIDs = new Map();
    for (const entry of citiesAndTowns) {
        const normalizedName = cleanAndNormalizeString(entry.cityLabel.value);
        // Only process cities that are in the duplicates list
        if (duplicateCityNames.includes(normalizedName)) {
            const qid = entry.city.value.replace('http://www.wikidata.org/entity/', '');
            if (duplicateCityNameToQIDs.has(normalizedName)) {
                duplicateCityNameToQIDs.get(normalizedName).push(qid);
            } else {
                duplicateCityNameToQIDs.set(normalizedName, [qid]);
            }
        }
    }

    let unfoundCDPs = [...censusPlaces.cdps];
    let unfoundCensusCities = [...censusPlaces.cities];
    let unfoundCensusTowns = [...censusPlaces.towns];
    let unfoundCensusVillages = [...censusPlaces.villages];

    const citiesAndTownsQIDMap = new Map(citiesAndTowns.map(entry => [
        cleanAndNormalizeString(entry.cityLabel.value),
        entry.city.value.replace('http://www.wikidata.org/entity/', '')
    ]));
    const citiesAndTownsNames = citiesAndTowns.map(entry => cleanAndNormalizeString(entry.cityLabel.value));
    // Get all labels (main + alternate) for cities and towns from wikidata
    const altCitiesAndTownsNames = new Set();
    // Map alternate names back to their canonical names
    const altToCanonicalNames = new Map();

    for (const entry of citiesAndTowns) {
        const qid = entry.city.value.replace('http://www.wikidata.org/entity/', '');
        const canonicalName = cleanAndNormalizeString(entry.cityLabel.value);
        const allLabels = wdCache.get(qid);
        
        if (allLabels) {
            const normalizedLabel = splitFirstCommaComponent(cleanAndNormalizeString(allLabels));
            altCitiesAndTownsNames.add(normalizedLabel);
            
            if (!altToCanonicalNames.has(normalizedLabel)) {
                altToCanonicalNames.set(normalizedLabel, new Set());
            }
            altToCanonicalNames.get(normalizedLabel).add(canonicalName);

            // Get any alternate labels
            const claims = wdClaimsCache.get(qid);
            const aliases = wdAliasesCache.get(qid);
            
            // Add aliases
            if (aliases?.en) {
                aliases.en.forEach(alias => {
                    const normalizedAlias = splitFirstCommaComponent(cleanAndNormalizeString(alias.value));
                    altCitiesAndTownsNames.add(normalizedAlias);
                    if (!altToCanonicalNames.has(normalizedAlias)) {
                        altToCanonicalNames.set(normalizedAlias, new Set());
                    }
                    altToCanonicalNames.get(normalizedAlias).add(canonicalName);                    
                });
            }

            if (claims) {
                // Add official names (P1448)
                if (claims.P1448) {
                    claims.P1448.forEach(claim => {
                        if (claim.mainsnak?.datavalue?.value?.text) {
                            const normalizedText = cleanAndNormalizeString(claim.mainsnak.datavalue.value.text);
                            altCitiesAndTownsNames.add(normalizedText);
                            if (!altToCanonicalNames.has(normalizedText)) {
                                altToCanonicalNames.set(normalizedText, new Set());
                            }
                            altToCanonicalNames.get(normalizedText).add(canonicalName);
                        }
                    });
                }
                // Add short names (P1813)
                if (claims.P1813) {
                    claims.P1813.forEach(claim => {
                        if (claim.mainsnak?.datavalue?.value?.text) {
                            const normalizedText = cleanAndNormalizeString(claim.mainsnak.datavalue.value.text);
                            altCitiesAndTownsNames.add(normalizedText);
                            if (!altToCanonicalNames.has(normalizedText)) {
                                altToCanonicalNames.set(normalizedText, new Set());
                            }
                            altToCanonicalNames.get(normalizedText).add(canonicalName);
                        }
                    });
                }
            }
        }
    }

    let unfoundCitiesAndTowns = [...citiesAndTownsNames];
    let rowCount = 0;

    // Track relation IDs with CDP/unincorporated mismatch
    let cdpMismatchRelations = [];

    for (const row of results) {
        const flags = [];

        if(!isNullOrEmpty(row['name:en'])) {
            //Let English name override main name tag
            row['name'] = row['name:en'];
            delete row['name:en'];
        }
        let normalizedName = cleanAndNormalizeString(row['name']);
        if (row.wikidata && row.official_name) {
            const claims = wdClaimsCache.get(row.wikidata);
            if (claims?.P1448?.some(claim => claim.mainsnak?.datavalue?.value?.text === row.official_name)) {
                // If official name matches P1448, use the main wikidata label
                const wdLabel = wdCache.get(row.wikidata);
                normalizedName = cleanAndNormalizeString(wdLabel);
            }
        }
        
        if(row['boundary'] == 'census') {
            //Remove this boundary from un-found list (allows for duplicate names)
            let index = unfoundCDPs.findIndex(item => cleanAndNormalizeString(item) === normalizedName);
            if (index !== -1) {
                unfoundCDPs.splice(index, 1);
            }
        } else if(row['boundary'] == 'administrative') {
            // Check unfoundCitiesAndTowns for direct matches and canonical name mappings
            // This is a more complex check because we need to account for alternate names
            let index = unfoundCitiesAndTowns.findIndex(item => {
                const cleanItem = cleanAndNormalizeString(item);
                return cleanItem === normalizedName || 
                       (altToCanonicalNames.has(cleanItem) && 
                        altToCanonicalNames.get(cleanItem).has(normalizedName));
            });
            if (index !== -1) {
                unfoundCitiesAndTowns.splice(index, 1);
            }
            // Check unfoundCensusCities
            index = unfoundCensusCities.findIndex(item => cleanAndNormalizeString(item) === normalizedName);
            if (index !== -1) {
                unfoundCensusCities.splice(index, 1);
            }

            // Check unfoundCensusTowns  
            index = unfoundCensusTowns.findIndex(item => cleanAndNormalizeString(item) === normalizedName);
            if (index !== -1) {
                unfoundCensusTowns.splice(index, 1);
            }

            // Check unfoundCensusVillages
            index = unfoundCensusVillages.findIndex(item => cleanAndNormalizeString(item) === normalizedName);
            if (index !== -1) {
                unfoundCensusVillages.splice(index, 1);
            }
        }

        //Get reverse P402 link
        const P402_reverse_array = wdOSMRelReverseLink.get(row['@id']);
        if(P402_reverse_array) {
            row['P402_reverse'] = P402_reverse_array.join(', ');
        }

        let processedRow;

        if (row.wikidata) {
            const { P131, P131_name, wikidata_names, P402, P402_count, P31, P31_name } = fetchData(row.wikidata);
            if(P402_count > 1) {
                flags.push(`Wikidata item points to ${P402_count} different OSM relations`);
            }
            processedRow = { ...row, P131, P131_name, wikidata_names, P402, P31, P31_name };
        } else {
            processedRow = { ...row, P131: '', P131_name: '', wikidata_names: [], P402: '', P31: '', P31_name: '' };
        }

        processedRow.wikidata_name = processedRow.wikidata_names.join(';');

        if(processedRow[`@type`] == "relation") {
            processedRow['@id'] = `r${processedRow['@id']}`;
        }
        if(processedRow[`@type`] == "way") {
            processedRow['@id'] = `w${processedRow['@id']}`;
            flags.push("Boundary tagging on closed way instead of relation");
        }

        if(!isNullOrEmpty(processedRow.fixme)) {
            flags.push(`FIXME: ${processedRow.fixme}`);
        }
        if(isNullOrEmpty(processedRow.wikidata)) {
            if(!isNullOrEmpty(processedRow.P402_reverse)) {
                flags.push("P402 link found");
            }
        } else {
            const wdRedirect = checkWikidataRedirect(processedRow.wikidata)

            if(wdRedirect) {
                flags.push(`OSM wikidata ${processedRow.wikidata} redirects to ${wdRedirect}`);
            }

            if(
                !matchStringsIgnoringDiacritics(
                    simplifyWDNames(expandAbbreviations(processedRow.wikidata_names)),
                    expandAbbreviations([processedRow.name, processedRow.alt_name])
                )
            )
            {
                flags.push("Wikidata name mismatch");
            }
            if(isNullOrEmpty(processedRow.P402)) {
                flags.push("Missing OSM Relation ID (P402) in wikidata");
                quickStatementsP402.push({ qid: row.wikidata, P402: `"${processedRow['@id'].substring(1)}"` });
            } else {
                if(processedRow['@id'] != processedRow.P402) {
                    flags.push("Mismatched OSM ID");
                }
                if(processedRow.wikidata != processedRow.P402_reverse) {
                    flags.push("Mismatched P402 link");                    
                }
            }
            if (processedRow.P31.includes('Q1093829') && processedRow.border_type !== 'city') {
                flags.push("Wikidata instance of city (Q1093829) but border_type is not city");
            }
            if (processedRow.boundary == "administrative") {
                const normalizedPlaceName = cleanAndNormalizeString(processedRow.name);
                if (censusPlaces.cities.some(city => cleanAndNormalizeString(city) === normalizedPlaceName)) {
                    if (processedRow.border_type !== 'city') {
                        flags.push(`${processedRow.name} is on Census Bureau city list but border_type is not 'city'`);
                    }
                } else if (censusPlaces.towns.some(town => cleanAndNormalizeString(town) === normalizedPlaceName)) {
                    if (processedRow.border_type !== 'town') {
                        flags.push(`${processedRow.name} is on Census Bureau town list but border_type is not 'town'`);
                    }
                } else if (censusPlaces.villages.some(village => cleanAndNormalizeString(village) === normalizedPlaceName)) {
                    if (processedRow.border_type !== 'village') {
                        flags.push(`${processedRow.name} is on Census Bureau village list but border_type is not 'village'`);
                    }
                }
            }
            if (processedRow.count_admin_centre > 0) {
                flags.push(`Relation has an admin_centre member, which is incorrect for a municipality`);
            }
            if (CDP_QID.some(qid => processedRow.P31.includes(qid)) && processedRow.boundary == "administrative") {
                flags.push("Wikidata says CDP/unincorporated, OSM says admin boundary");
                // Add relation ID to list of mismatches
                cdpMismatchRelations.push(processedRow['@id'].substring(1));
            }
            if (!CDP_QID.some(qid => processedRow.P31.includes(qid)) && processedRow.boundary == "census") {
                flags.push("OSM says CDP but wikidata is missing CDP statement");
            }
            if (processedRow.boundary == "administrative" && 
                !citiesAndTownsNames.includes(normalizedName) && 
                !altCitiesAndTownsNames.has(normalizedName)) {
                
                flags.push(`
                    OSM boundary=administrative ${processedRow.name} is not on the Wikidata 
                    <a href="https://zelonewolf.github.io/wikidata-qa/${state.urlName}_citiesAndTowns.html">list</a>
                    of cities and towns
                `);
            }
            if(processedRow.boundary == "census" && !censusPlaces.cdps.some(cdp => cleanAndNormalizeString(cdp) === normalizedName)) {
                flags.push(`OSM boundary=census ${processedRow.name} is not on the census bureau <a href="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt">list</a> of CDPs`);
            }
            if(!isNullOrEmpty(processedRow.admin_level) && processedRow.boundary == "census") {
                flags.push("Census boundary should not have admin_level");
            }
            if(processedRow.wikipedia) {
                wpFlag = checkWikipediaMatch(processedRow.wikidata, processedRow.wikipedia);
                if(wpFlag) {
                    flags.push(wpFlag);
                }
            }
        }

        validateTags(processedRow, flags);

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

    if (cdpMismatchRelations.length > 0) {
        const idFilter = cdpMismatchRelations.map(id => `id:${id}`).join(' OR ');
        bulkFindings.push({
            title: "Admin boundaries that might be CDPs",
            description: "This JOSM filter will highlight admin boundaries that might be CDPs based on the presence of a wikidata property that indicates a CDP or unincorporated community.", 
            filter: `type:relation (${idFilter})`
        });
    }
    
    unfoundCDPs.forEach(cdp =>
        flaggedData.push(
            {
                name: cdp,
                flags: [`${cdp} is missing from OSM but is listed on the Census Bureau <a href="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt">list</a> of CDPs`]
            }
        )    
    );

    unfoundCensusCities.forEach(city =>
        flaggedData.push(
            {
                name: city,
                flags: [`${city} (city) is missing as a boundary=administrative from OSM but is listed on the Census Bureau <a href="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt">list</a> of cities`]
            }
        )    
    );

    unfoundCensusTowns.forEach(town =>
        flaggedData.push(
            {
                name: town,
                flags: [`${town} (town) is missing as a boundary=administrative from OSM but is listed on the Census Bureau <a href="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt">list</a> of towns`]
            }
        )    
    );

    unfoundCensusVillages.forEach(village =>
        flaggedData.push(
            {
                name: village,
                flags: [`${village} (village) is missing as a boundary=administrative from OSM but is listed on the Census Bureau <a href="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt">list</a> of villages`]
            }
        )    
    );

    const unfoundCityAndTownQIDs = unfoundCitiesAndTowns.map(city => citiesAndTownsQIDMap.get(city));
    const unfoundCityAndTownData = retrieveWikidataDataInChunks(unfoundCityAndTownQIDs);

    unfoundCitiesAndTowns.forEach(city => {
        //Get list of duplicates for this city
        const duplicates = duplicateCityNameToQIDs.get(city);

        const cityData = unfoundCityAndTownData.entities[citiesAndTownsQIDMap.get(city)];

        const cityP131Values = cityData.claims.P131?.map(claim => claim.mainsnak.datavalue?.value.id) || [];
        const cityP131Names = cityP131Values.map(id => getNamesFromWikidata(id)[0]);
        const cityP131 = cityP131Values.join(';');
        const cityP131_name = cityP131Names.join(';');
        const cityP402 = cityData.claims.P402?.map(claim => claim.mainsnak.datavalue?.value.id).join(';') || '';
        const cityP402Reverse = cityData.claims.P402_reverse?.map(claim => claim.mainsnak.datavalue?.value.id).join(';') || '';

        const P31Values = [];
        const P31Claims = cityData.claims.P31 || [];
        for (const claim of P31Claims) {
            const claimValue = claim.mainsnak.datavalue.value.id;
            if (claimValue) {
                P31Values.push(claimValue);
            }
        }
        const cityP31 = P31Values.join('; ');
        const cityP31_name = P31Values.map(id => getNamesFromWikidata(id)[0]).join('; ');

        const thisQID = citiesAndTownsQIDMap.get(city);

        const finding = {
            wikidata_name: city,
            wikidata: duplicates ? duplicates.join('; ') : thisQID,
            P31: cityP31,
            P31_name: cityP31_name,
            P131: cityP131,
            P131_name: cityP131_name,
            P402: cityP402,
            P402_reverse: cityP402Reverse,
            flags: [`${city} is listed in wikidata as a subclass of Q17361443 (admin. territorial entity of the US) but no boundary=administrative relation was found with this name in OSM`]
        };
        if(duplicates) {
            finding.flags.push(`${city} is listed in wikidata multiple times: ${duplicates}`);
        }

        flaggedData.push(finding);
    });

    await writers.csvWriter.writeRecords(processedData)
        .then(() => console.log('The CSV file was written successfully'));

    await writers.csvIssuesWriter.writeRecords(flaggedData)
        .then(() => console.log('The CSV flagged-problems file was written successfully'));

    if(quickStatementsP402.length > 0) {
        await writers.P402Writer.writeRecords(quickStatementsP402)
            .then(() => console.log('The P402 CSV file was written successfully'));
    }

    // Write bulk findings to JSON file if there are any
    if (bulkFindings.length > 0) {
        fs.writeFileSync(`output/${state.urlName}_bulk_findings.json`, JSON.stringify(bulkFindings, null, 2));
    }

    return flaggedData.length;
}
// Function to check if the Wikipedia link matches
function checkWikipediaMatch(qid, rawWikipediaTitle) {

    const siteLinks = wdSitelinksCache.get(qid);
    if(!siteLinks) {
        return 'No wikipedia links in wikidata but OSM has wikipedia tag';
    }

    let wikipediaTitle;
    let wikipediaLang;

    // Check if the inputString contains a colon
    if (rawWikipediaTitle.includes(':')) {
        const parts = rawWikipediaTitle.split(':');
        wikipediaLang = parts[0];
        wikipediaTitle = parts[1];
    } else {
        return 'Malformed wikipedia tag, should be lang:Title';
    }

    if (siteLinks[`${wikipediaLang}wiki`]) {
        const wikidataWikipediaTitle = siteLinks[`${wikipediaLang}wiki`].title.replace(' ', '_');
        if (wikidataWikipediaTitle.toLowerCase() === wikipediaTitle.toLowerCase().replace(" ", "_")) {
            // Match found
        } else {
            return `${qid} has wikipedia entry ${wikidataWikipediaTitle} but OSM has ${wikipediaTitle}`;
        }
    } else {
        return `${qid} has no wikipedia entry but OSM has ${wikipediaTitle}`;
    }
}

module.exports = { boundaryCheck }
