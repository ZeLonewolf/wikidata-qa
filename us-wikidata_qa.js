const { fetchUSStates } = require('./us-states_to_json.js');
const { generateHTML } = require('./generate_index.js');
const { convertCsvToHtml } = require("./csv_to_table.js");
const { boundaryCheck } = require("./wikidata_boundary_check.js");
const { spawn } = require('child_process');
const { saveBoundariesWithinToCSV } = require('./bounds_to_csv.js');
const fs = require('fs');
const path = require('path');

async function processStates(stateName) {
  try {
    const states = await fetchUSStates();
    states.sort((a, b) => a.name.localeCompare(b.name));
    generateHTML(states.map(item => item.name));
    for (const state of states) {
      // Hack
      if(state.name === stateName) {
          await processState(state);
      }
    }
  } catch (error) {
    console.error('Error processing states:', error);
  }
}

async function processState(state) {
    const stateName = state.name.replace(/\s/g, '_');
    const stateFile = `output/${stateName}.csv`;
    const stateFlaggedFile = `output/${stateName}_flagged.csv`;
    console.log(`State: ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    await saveBoundariesWithinToCSV(state.osmRelationId);
    await boundaryCheck(`output/${state.osmRelationId}.csv`, stateFile);
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

processStates(process.argv[2]);
