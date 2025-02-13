const { nonAdminQIDs } = require('../non_admin_entities');
const request = require('sync-request');

// Constants
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'wikidata-qa/1.0 (https://github.com/ZeLonewolf/wikidata-qa)';

// SPARQL Query Functions
function buildSPARQLQuery(queryString) {
    return {
        url: WIKIDATA_SPARQL_URL,
        options: {
            qs: {
                query: queryString,
                format: 'json'
            },
            headers: {
                'Accept': 'application/sparql-results+json',
                'User-Agent': USER_AGENT
            }
        }
    };
}

async function queryWikidata(query) {
    const response = await fetch(WIKIDATA_SPARQL_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/sparql-results+json',
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `query=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
        console.log(`SPARQL Query: ${query}`);
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Handle ASK queries which return boolean
    if (data.hasOwnProperty('boolean')) {
        return data;
    }
    
    return data.results.bindings;
}

// State-Related Functions
function getStateQIDQuery(relationId) {
    return `
        SELECT ?state ?stateLabel WHERE {
            ?state wdt:P402 "${relationId}";
                   wdt:P31 wd:Q35657;
                   wdt:P17 wd:Q30.
            SERVICE wikibase:label { 
                bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". 
            }
        }`;
}

async function getStateQID(relationId) {
    const results = await queryWikidata(getStateQIDQuery(relationId));
    if (!results.length) {
        throw new Error(`No state found for relation ID: ${relationId}`);
    }
    return results[0].state.value.replace('http://www.wikidata.org/entity/', '');
}

// Cities and Towns Functions
function getCitiesAndTownsInStateQuery(qid) {
    return `
        SELECT DISTINCT ?city ?cityLabel ?classes WHERE {
            VALUES ?cityClass { wd:Q852446 }
            ?city wdt:P31/wdt:P279* ?cityClass;
                  (wdt:P131|wdt:P131/wdt:P131|wdt:P131/wdt:P131/wdt:P131) wd:${qid}.
            
            OPTIONAL {
                ?city wdt:P31 ?classes.
            }

            MINUS {
                ?city wdt:P31/wdt:P279* wd:Q13360155.
                FILTER NOT EXISTS { ?city wdt:P31/wdt:P279* wd:Q3301053. }
                FILTER NOT EXISTS { ?city wdt:P31/wdt:P279* wd:Q1266818. }
            }

            SERVICE wikibase:label { 
                bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". 
            }
        }`;
}

function getIsSubclassOfNonAdminQuery(qid) {
    const nonAdminQs = nonAdminQIDs().map(q => `wd:${q}`).join(' ');
    return `
        ASK {
            VALUES ?nonAdminClass { ${nonAdminQs} }
            wd:${qid} wdt:P279* ?nonAdminClass.
        }`;
}

async function isSubclassOfNonAdmin(qid) {
    const results = await queryWikidata(getIsSubclassOfNonAdminQuery(qid));
    return results.boolean;
}

/**
 * Gets all cities and towns in a given US state that are classified as administrative entities.
 * 
 * This function:
 * 1. Queries Wikidata for all cities/towns in the state
 * 2. Analyzes their P31 (instance of) values to determine which are administrative entities
 * 3. Filters out any entities that are only classified as non-administrative
 * 
 * @param {string} qid - The Wikidata QID of the US state
 * @returns {Array} Array of city/town entities with their labels and classifications
 */
async function getCitiesAndTownsInState(qid) {
    // Get all cities/towns in the state and filter for administrative entities
    const results = await queryWikidata(getCitiesAndTownsInStateQuery(qid));

    // Extract unique P31 values and check if they're administrative
    const adminQIDs = new Set();
    const uniqueP31s = new Set(
        results
            .filter(r => r.classes)
            .map(r => r.classes.value.replace('http://www.wikidata.org/entity/', ''))
    );

    for (const p31Value of uniqueP31s) {
        if (!(await isSubclassOfNonAdmin(p31Value))) {
            adminQIDs.add(p31Value);
        }
    }

    // First merge duplicate QIDs by combining their properties
    const qidMap = new Map();
    for (const result of results) {
        const qid = result.city.value.replace('http://www.wikidata.org/entity/', '');
        if (!qidMap.has(qid)) {
            qidMap.set(qid, {...result});
        } else {
            // Merge properties from duplicate entries recursively
            const existing = qidMap.get(qid);
            const merged = mergeDeep(existing, result);
            qidMap.set(qid, merged);
        }
    }
    const mergedResults = Array.from(qidMap.values());

    // Then filter for entities with administrative classifications
    const filteredResults = mergedResults.filter(result => 
        result.classes && 
        adminQIDs.has(result.classes.value.replace('http://www.wikidata.org/entity/', ''))
    );

    return filteredResults;
}

// Helper function for deep merging objects
function mergeDeep(target, source) {
    if (!source) return target;
    const output = {...target};
    
    Object.keys(source).forEach(key => {
        if (source[key] instanceof Object && key in target) {
            output[key] = mergeDeep(target[key], source[key]);
        } else if (source[key] !== undefined) {
            output[key] = source[key];
        }
    });
    
    return output;
}

async function getCitiesAndTownsInStateRelation(relationId) {
    const qid = await getStateQID(relationId);
    return getCitiesAndTownsInState(qid);
}
// Wikidata API Functions
function retrieveWikidataData(qids) {
    if (!qids?.length) return {};

    try {
        const res = request('GET', WIKIDATA_API_URL, {
            qs: {
                action: 'wbgetentities',
                ids: qids.join('|'),
                props: 'claims|labels|sitelinks|aliases',
                languages: 'en',
                format: 'json'
            },
            headers: {
                'User-Agent': USER_AGENT
            }
        });
        return JSON.parse(res.getBody('utf8'));
    } catch (error) {
        console.error(`Error fetching data for QIDs: ${qids.join(', ')}`, error);
        return {};
    }
}

// OSM ID Link Functions
function getOSMIDLinksQuery(osmIds) {
    if (!osmIds?.length) return '';
    
    return `
        SELECT ?item ?osmId WHERE {
            ?item wdt:P402 ?osmId.
            VALUES ?osmId { "${osmIds.join('" "')}" }
        }`;
}

function fetchOSMIDLinks(osmIds) {
    if (!osmIds?.length) return null;

    try {
        const { url, options } = buildSPARQLQuery(getOSMIDLinksQuery(osmIds));
        const res = request('GET', url, options);
        return JSON.parse(res.getBody('utf8'));
    } catch (error) {
        console.error(`Error querying Wikidata for OSM IDs: ${osmIds.join(', ')}`, error);
        return null;
    }
}

module.exports = {
    getCitiesAndTownsInStateRelation,
    retrieveWikidataData,
    fetchOSMIDLinks,
    queryWikidata
};