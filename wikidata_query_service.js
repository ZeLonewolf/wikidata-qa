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

    return `SELECT ?city ?cityLabel WHERE {
        # Ensure the entity is a city or any of its subclasses
        {
            ?city wdt:P31/wdt:P279* wd:Q15284.
        }
        UNION
        {
            ?city wdt:P31/wdt:P279* wd:Q852446.
        }
        
        # Traverse up to 3 levels of administrative divisions to ensure the city is within this state
        {
            # Level 1: Directly located in this state
            ?city wdt:P131 wd:${qid}.
        }
        UNION
        {
            # Level 2: Located in an administrative entity that is in this state
            ?city wdt:P131/wdt:P131 wd:${qid}.
        }
        UNION
        {
            # Level 3: Located in an administrative entity that is in another administrative entity, which is in this state
            ?city wdt:P131/wdt:P131/wdt:P131 wd:${qid}.
        }
        UNION
        {
            # Level 4: Located in an administrative entity that is in another administrative entity, which is in this state
            ?city wdt:P131/wdt:P131/wdt:P131/wdt:P131 wd:${qid}.
        }

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

    const data = await response.json();
    return data.results.bindings;

}

async function getCitiesAndTownsInStateRelation(relationId) {
    const qid = await getStateQID(relationId);
    return await getCitiesAndTownsInState(qid);
}

module.exports = { getCitiesAndTownsInStateRelation }