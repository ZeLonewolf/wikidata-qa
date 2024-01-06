const { fetchUSStates } = require('./us-states_to_json.js');
const { generateHTML } = require('./generate_index.js');
const { convertCsvToHtml } = require("./csv_to_table.js");
const { boundaryCheck } = require("./wikidata_boundary_check.js");
const { getCDPs } = require ("./census_bureau.js");
const { spawn } = require('child_process');
const { saveBoundariesWithinToCSV } = require('./bounds_to_csv.js');
const fs = require('fs');
const path = require('path');

async function processStates(stateName, API_KEY) {
  try {
    const states = await fetchUSStates();
    states.sort((a, b) => a.name.localeCompare(b.name));
    generateHTML(states.map(item => item.name));
    for (const state of states) {
      // Hack
      if(state.name === stateName) {
          await processState(state, API_KEY);
      }
    }
  } catch (error) {
    console.error('Error processing states:', error);
  }
}

function getStateAbbreviation(stateName) {
    const states = {
        "Alabama": "al",
        "Alaska": "ak",
        "Arizona": "az",
        "Arkansas": "ar",
        "California": "ca",
        "Colorado": "co",
        "Connecticut": "ct",
        "Delaware": "de",
        "Florida": "fl",
        "Georgia": "ga",
        "Hawaii": "hi",
        "Idaho": "id",
        "Illinois": "il",
        "Indiana": "in",
        "Iowa": "ia",
        "Kansas": "ks",
        "Kentucky": "ky",
        "Louisiana": "la",
        "Maine": "me",
        "Maryland": "md",
        "Massachusetts": "ma",
        "Michigan": "mi",
        "Minnesota": "mn",
        "Mississippi": "ms",
        "Missouri": "mo",
        "Montana": "mt",
        "Nebraska": "ne",
        "Nevada": "nv",
        "New Hampshire": "nh",
        "New Jersey": "nj",
        "New Mexico": "nm",
        "New York": "ny",
        "North Carolina": "nc",
        "North Dakota": "nd",
        "Ohio": "oh",
        "Oklahoma": "ok",
        "Oregon": "or",
        "Pennsylvania": "pa",
        "Rhode Island": "ri",
        "South Carolina": "sc",
        "South Dakota": "sd",
        "Tennessee": "tn",
        "Texas": "tx",
        "Utah": "ut",
        "Vermont": "vt",
        "Virginia": "va",
        "Washington": "wa",
        "West Virginia": "wv",
        "Wisconsin": "wi",
        "Wyoming": "wy"
    };

    const abbreviation = states[stateName];
    return abbreviation || 'State not found';
}

async function processState(state, API_KEY) {
    const CDPs = await getCDPs(state.name, API_KEY);
    const stateName = state.name.replace(/\s/g, '_');
    const stateFile = `output/${stateName}.csv`;
    const stateFlaggedFile = `output/${stateName}_flagged.csv`;
    console.log(`State: ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    await saveBoundariesWithinToCSV(state.osmRelationId);
    await boundaryCheck(`output/${state.osmRelationId}.csv`, stateFile, getStateAbbreviation(state.name), CDPs);    
    console.log(`Boundary check complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    convertCsvToHtml(stateFile);
    convertCsvToHtml(stateFlaggedFile);
    console.log(`HTML generation complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
}

const outputFolderPath = path.join(__dirname, 'output');

fs.mkdir(outputFolderPath, { recursive: true }, (error) => {
    if (error) {
        console.error('Error creating folder:', error);
    }
});

processStates(process.argv[2], process.argv[3]);
