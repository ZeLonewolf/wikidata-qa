const axios = require('axios');

const stateFipsCodes = {
    'Alabama': '01',
    'Alaska': '02',
    'Arizona': '04',
    'Arkansas': '05',
    'California': '06',
    'Colorado': '08',
    'Connecticut': '09',
    'Delaware': '10',
    'Florida': '12',
    'Georgia': '13',
    'Hawaii': '15',
    'Idaho': '16',
    'Illinois': '17',
    'Indiana': '18',
    'Iowa': '19',
    'Kansas': '20',
    'Kentucky': '21',
    'Louisiana': '22',
    'Maine': '23',
    'Maryland': '24',
    'Massachusetts': '25',
    'Michigan': '26',
    'Minnesota': '27',
    'Mississippi': '28',
    'Missouri': '29',
    'Montana': '30',
    'Nebraska': '31',
    'Nevada': '32',
    'New Hampshire': '33',
    'New Jersey': '34',
    'New Mexico': '35',
    'New York': '36',
    'North Carolina': '37',
    'North Dakota': '38',
    'Ohio': '39',
    'Oklahoma': '40',
    'Oregon': '41',
    'Pennsylvania': '42',
    'Rhode Island': '44',
    'South Carolina': '45',
    'South Dakota': '46',
    'Tennessee': '47',
    'Texas': '48',
    'Utah': '49',
    'Vermont': '50',
    'Virginia': '51',
    'Washington': '53',
    'West Virginia': '54',
    'Wisconsin': '55',
    'Wyoming': '56'
};

function getStateFipsCode(stateName) {
    return stateFipsCodes[stateName] || 'Unknown';
}

const lsadTypes = {
  '25': 'cities',
  '43': 'towns',
  '47': 'villages',
  '57': 'cdps',
};

const lsadSuffixes = {
  '25': 'city',
  '43': 'town',
  '47': 'village',
  '57': 'CDP',
};

async function getCensusPlaces(state) {
  const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt`;

  try {
    const response = await axios.get(url);
    const rawData = response.data;

    // Split into rows and process as tab-delimited
    const rows = rawData.split('\n')
                       .map(line => line.split('\t'))
                       .slice(1); // Skip header row

    // Initialize result object with all lsadTypes values
    const places = Object.values(lsadTypes).reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {});

    // Process rows and categorize by LSAD type
    rows.forEach(row => {
      if (!row[3] || !row[4]) return; // Skip empty/malformed rows
      
      const name = row[3];
      const lsadType = row[4];

      if (lsadTypes[lsadType]) {
        const placeType = lsadTypes[lsadType];
        // Remove type suffix from name based on place type
        const cleanName = name.replace(new RegExp(` ${lsadSuffixes[lsadType]}$`, 'i'), '');
        places[placeType].push(cleanName);
      }
    });

    return places;

  } catch (error) {
    console.error('Error fetching data:', error);
    // Return empty arrays for all place types
    return Object.values(lsadTypes).reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {});
  }
}

module.exports = { getCensusPlaces, getStateFipsCode }