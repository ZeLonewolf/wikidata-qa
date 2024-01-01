const axios = require('axios');

// Function to fetch data from Wikidata
async function fetchWikidata(wikidataId) {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching Wikidata:', error);
        return null;
    }
}

// Function to check if the Wikipedia link matches
async function checkWikipediaMatch(wikidataId, rawWikipediaTitle) {

    let wikipediaTitle;
    let wikipediaLang;

    // Check if the inputString contains a colon
    if (rawWikipediaTitle.includes(':')) {
        // Split the string at the colon and return the part after the last colon
        const parts = rawWikipediaTitle.split(':');
        wikipediaLang = parts[0];
        wikipediaTitle = parts[1];
    } else {
        // Return a message if no colon is found
        return 'Malformed wikipedia tag, should be lang:Title';
    }

    const data = await fetchWikidata(wikidataId);
    if (!data) return;

    const siteLinks = data.entities[wikidataId]?.sitelinks;
    if (siteLinks && siteLinks[`${wikipediaLang}wiki`]) {
        const wikidataWikipediaTitle = siteLinks[`${wikipediaLang}wiki`].title.replace(' ', '_');
        if (wikidataWikipediaTitle.toLowerCase() === wikipediaTitle.toLowerCase().replace(" ", "_")) {
            // The normal condition
            // console.log('Match found!');
        } else {
            return `${wikidataId} has wikipedia entry ${wikidataWikipediaTitle} but OSM has ${wikipediaTitle}`;
        }
    } else {
        return `${wikidataId} has no wikipedia entry but OSM has ${wikipediaTitle}`;
    }
}

module.exports = { checkWikipediaMatch };