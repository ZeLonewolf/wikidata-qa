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
    const excludedClasses = nonAdminQIDs().map(qid => `wd:${qid}`).join(' ');

    return `
        SELECT DISTINCT ?city ?cityLabel WHERE {
            VALUES ?cityClass { wd:Q852446 }
            ?city wdt:P31/wdt:P279* ?cityClass;
                  (wdt:P131|wdt:P131/wdt:P131|wdt:P131/wdt:P131/wdt:P131) wd:${qid}.
            
            MINUS {
                ?city p:P31/ps:P31/wdt:P279* ?excludedClass.
                VALUES ?excludedClass { ${excludedClasses} }
                FILTER NOT EXISTS {
                    ?city p:P31 ?statement.
                    ?statement ps:P31/wdt:P279* ?excludedClass;
                              pq:P582 ?endTime.
                }
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

async function getCitiesAndTownsInState(qid) {
    return await queryWikidata(getCitiesAndTownsInStateQuery(qid));
}

async function getCitiesAndTownsInStateRelation(relationId) {
    const qid = await getStateQID(relationId);
    return await getCitiesAndTownsInState(qid);
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