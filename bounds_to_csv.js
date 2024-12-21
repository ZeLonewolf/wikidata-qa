const axios = require('axios');
const qs = require('qs');  // Required for proper query string formatting
const fs = require('fs');

async function saveBoundariesWithinToCSV(osmRelationID) {
    console.log(`Query overpass for boundaries within r${osmRelationID}`);
    const overpassUrl = 'http://overpass-api.de/api/interpreter';
    const relationid = Number(osmRelationID) + 3600000000;
    const query = `[timeout:180][out:csv(::id,::type,type,wikidata,wikipedia,admin_level,boundary,name,"name:en",fixme,alt_name,place,border_type;true;',')];
        area(id:${relationid})->.a;
        (
          rel[boundary=administrative][admin_level~"^7|8|9$"](area.a);
          way[boundary=administrative][admin_level~"^7|8|9$"](if:is_closed())(area.a);
          rel[boundary=census][border_type!=unorganized_territory](area.a);
          rel[type=boundary][!boundary](area.a);
        );
        out;`;
    console.log(query);
    try {
        const response = await axios.post(overpassUrl, qs.stringify({ data: query }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log(`Received ${response.data.length} bytes from Overpass`);
        saveToFile(osmRelationID, response.data);
    } catch (error) {
        console.error('Error fetching data:', error.response ? error.response.data : error);
    }
    console.log(`Saved overpass results for boundaries within r${osmRelationID}`);
}

// Function to save data to a CSV file
function saveToFile(osmRelationID, data) {
    const fileName = `output/${osmRelationID}.csv`;
    fs.writeFileSync(fileName, data, (err) => {
        if (err) {
            console.error('Error writing to file:', err);
        } else {
            console.log(`Saved data to ${fileName}`);
        }
    });
}

module.exports = { saveBoundariesWithinToCSV }
