const axios = require('axios');
const qs = require('qs');  // Required for proper query string formatting
const fs = require('fs');

async function runOverpassQuery(osmRelationID) {
    const overpassUrl = 'http://overpass-api.de/api/interpreter';
    const relationid = Number(osmRelationID) + 3600000000;
    const query = `[timeout:180][out:csv(::id,wikidata,name;true;',')];
        area(id:${relationid})->.a;
        rel[boundary=administrative][admin_level~"^7|8|9$"](area.a);
        out;`;
    console.log(query);
    try {
        const response = await axios.post(overpassUrl, qs.stringify({ data: query }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log(response.data);
        saveToFile(osmRelationID, response.data);
    } catch (error) {
        console.error('Error fetching data:', error.response ? error.response.data : error);
    }
}

// Function to save data to a CSV file
function saveToFile(osmRelationID, data) {
    const fileName = `${osmRelationID}.csv`;
    fs.writeFile(fileName, data, (err) => {
        if (err) {
            console.error('Error writing to file:', err);
        } else {
            console.log(`Saved data to ${fileName}`);
        }
    });
}

function main() {
    const osmRelationID = process.argv[2];
    if (!osmRelationID) {
        console.log('Please provide a location name.');
        return;
    }
    runOverpassQuery(osmRelationID);
}

main();
