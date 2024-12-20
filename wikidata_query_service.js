const { nonAdminQIDs } = require('./non_admin_entities');

function getStateQIDQuery(relationId) {
    return `SELECT ?state ?stateLabel WHERE {
        ?state wdt:P402 "${relationId}".
        ?state wdt:P31 wd:Q35657.
        ?state wdt:P17 wd:Q30.
        SERVICE wikibase:label { 
            bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". 
        }
    }`;
}

async function getStateQID(relationId) {
    let query = getStateQIDQuery(relationId);
    let results = await queryWikidata(query);
    return results[0].state.value.replace('http://www.wikidata.org/entity/', '');
}

function getCitiesAndTownsInStateQuery(qid) {

    return `SELECT DISTINCT ?city ?cityLabel WHERE {
        # Ensure the entity is a admin entity or any of its subclasses
        VALUES ?cityClass { wd:Q852446 }
        ?city wdt:P31/wdt:P279* ?cityClass.       
    
        # Exclude other types of districts
        FILTER NOT EXISTS {
            ?city wdt:P31/wdt:P279* ?excludedClass.
            VALUES ?excludedClass { ${nonAdminQIDs().map(qid => `wd:${qid}`).join(' ')} }
        }

        # Exclude counties or county equivalents, but allow consolidated city-counties
        FILTER NOT EXISTS {
            ?city wdt:P31/wdt:P279* wd:Q13360155.
            FILTER NOT EXISTS {
                ?city wdt:P31/wdt:P279* wd:Q3301053.
            }
        }
        
        # Traverse up to 3 levels of administrative divisions to ensure the city is within this state
        ?city (wdt:P131
              | wdt:P131/wdt:P131
              | wdt:P131/wdt:P131/wdt:P131
              | wdt:P131/wdt:P131/wdt:P131/wdt:P131) wd:${qid}.

        # Retrieve labels in the preferred language
        SERVICE wikibase:label { 
            bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". 
        }
    }`;
}

async function getCitiesAndTownsInState(qid) {
    let query = getCitiesAndTownsInStateQuery(qid);
    let results = await queryWikidata(query);
    return results;
}

async function queryWikidata(query) {
    const endpoint = 'https://query.wikidata.org/sparql';
    const fullUrl = endpoint + '?query=' + encodeURIComponent(query);
    
    const response = await fetch(fullUrl, {
        headers: {
            'Accept': 'application/sparql-results+json',
            'User-Agent': 'wikidata-qa/1.0 (https://github.com/ZeLonewolf/wikidata-qa)'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log(`====================\n${query}\n====================`);
    const data = await response.json();
    return data.results.bindings;
}

async function getCitiesAndTownsInStateRelation(relationId) {
    const qid = await getStateQID(relationId);
    return await getCitiesAndTownsInState(qid);
}

module.exports = { getCitiesAndTownsInStateRelation }
