const axios = require('axios');

async function fetchUSStates() {
  const query = `
    SELECT ?state ?stateLabel ?osmRelationId WHERE {
      ?state wdt:P31 wd:Q35657; # instance of a U.S. state
             wdt:P17 wd:Q30;    # country - United States
             wdt:P402 ?osmRelationId. # OpenStreetMap Relation ID
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 50
  `;

  const url = 'https://query.wikidata.org/sparql';

  try {
    const response = await axios.get(url, {
      params: { query },
      headers: { 'Accept': 'application/sparql-results+json' }
    });

    if (response.data && response.data.results && response.data.results.bindings) {
      return response.data.results.bindings.map(item => ({
        qid: item.state.value.split('/').pop(),
        name: item.stateLabel.value,
        osmRelationId: item.osmRelationId.value
      }));
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

module.exports = { fetchUSStates };