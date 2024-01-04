const axios = require('axios');
const https = require('https');

// Function to fetch data from Wikidata
function fetchWikidata(wikidataId) {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    try {
        const response = https.request(url, { method: 'GET' }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    return JSON.parse(data);
                } catch (error) {
                    console.error(`Error fetching wikidata ${wikidataId}`);
                    return null;
                }
            });
        });
        response.on('error', (error) => {
            console.error('Error fetching Wikidata:', error);
        });
        response.end();
    } catch (error) {
        console.error('Error fetching Wikidata:', error);
        return null;
    }
}

// Function to check if the Wikipedia link matches
function checkWikipediaMatch(wikidataId, rawWikipediaTitle) {
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

    const data = fetchWikidata(wikidataId);
    if (!data) return;

    const siteLinks = data.entities[wikidataId]?.sitelinks;
    if (siteLinks && siteLinks[`${wikipediaLang}wiki`]) {
        const wikidataWikipediaTitle = siteLinks[`${wikipediaLang}wiki`].title.replace(' ', '_');
        if (wikidataWikipediaTitle.toLowerCase() === wikipediaTitle.toLowerCase().replace(" ", "_")) {
            // Match found
        } else {
            return `${wikidataId} has wikipedia entry ${wikidataWikipediaTitle} but OSM has ${wikipediaTitle}`;
        }
    } else {
        return `${wikidataId} has no wikipedia entry but OSM has ${wikipediaTitle}`;
    }
}

module.exports = { checkWikipediaMatch };
