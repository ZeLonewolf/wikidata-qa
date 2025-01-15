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

// Helper function to create empty places object
function createEmptyPlaces() {
  return {
    cities: [],
    towns: [],
    villages: [],
    cdps: []
  };
}

// Helper function to fetch and parse census data
async function fetchCensusData(url) {
  try {
    const response = await axios.get(url);
    return response.data.split('\n')
                      .map(line => line.split('\t'))
                      .slice(1); // Skip header row
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

async function getCensusBoundaries(state) {
  const places = createEmptyPlaces();
  
  // Fetch places data
  const placesUrl = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_${state.fipsCode}.txt`;
  const placesRows = await fetchCensusData(placesUrl);
  
  if (placesRows.length) {
    placesRows.forEach(row => {
      if (!row[3] || !row[4]) return;
      
      const name = row[3];
      const lsadType = row[4];

      if (lsadTypes[lsadType]) {
        const placeType = lsadTypes[lsadType];
        const cleanName = name.replace(new RegExp(` ${lsadSuffixes[lsadType]}$`, 'i'), '');
        places[placeType].push(cleanName);
      }
    });
  }

  // Fetch county divisions data
  const divisionsUrl = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_cousubs_${state.fipsCode}.txt`;
  const divisionRows = await fetchCensusData(divisionsUrl);

  if (divisionRows.length) {
    divisionRows.forEach(row => {
      if (!row[3] || !row[4]) return;
      
      const name = row[3];
      const funcstat = row[4];

      if (funcstat === 'A' || funcstat === 'F') {
        const match = name.match(/^(.+?)\s+([A-Za-z]+)$/);
        if (match) {
          const placeName = match[1];
          const lsad = match[2].toLowerCase();
          
          const placeTypeMap = {
            'city': 'cities',
            'town': 'towns', 
            'village': 'villages',
            'cdp': 'cdps'
          };
          
          if (placeTypeMap[lsad]) {
            places[placeTypeMap[lsad]].push(placeName);
          }
        }
      }
    });
  }

  return places;
}

module.exports = { getCensusBoundaries, getStateFipsCode }