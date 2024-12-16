function nonAdminQIDs() {
    return [
        'Q610237',   // US special-purpose district
        'Q104146790', // US electoral district
        'Q5398059',  // US Indian reservation
        'Q35080211', // US Wildlife manag
        'Q15726209', // US school district
        'Q6047382', // Educational service agency (school district), ex: Educational Service District 105 Q30268036
        'Q192611', // Electoral unit, ex: Seattle City Council District Q117305289
        'Q112904835', // Fire district
    ];
}

async function nonAdminQIDsAndLabels() {
    const qids = nonAdminQIDs();
    const labels = {};
    
    for (const qid of qids) {
        const query = `
            SELECT ?label WHERE {
                wd:${qid} rdfs:label ?label.
                FILTER(LANG(?label) = "en")
            }
            LIMIT 1
        `;
        
        const response = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({
            query: query
        }), {
            headers: {
                'Accept': 'application/sparql-results+json',
                'User-Agent': 'wikidata-qa/1.0 (https://github.com/ZeLonewolf/wikidata-qa)'
            },
            method: 'GET'
        });

        const data = await response.json();
        if (data.results.bindings.length > 0) {
            labels[qid] = data.results.bindings[0].label.value;
        }
    }

    return labels;
}

module.exports = { nonAdminQIDsAndLabels, nonAdminQIDs };