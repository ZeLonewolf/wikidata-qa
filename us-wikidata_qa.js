const { fetchUSStates } = require('./us-states_to_json.js');
const { convertCsvToHtml } = require("./csv_to_table.js");
const { boundaryCheck } = require("./wikidata_boundary_check.js");
const { getCDPs } = require ("./census_bureau.js");
const { saveBoundariesWithinToCSV } = require('./bounds_to_csv.js');
const { getStateAbbreviation } = require('./state_abbreviation.js');
const fs = require('fs');
const path = require('path');

async function processOneState(stateName) {

  let thisState;
  const states = await fetchUSStates();
  for (const state of states) {
    // It's a hack deal with it.
    if(state.name === stateName) {
      thisState = state;
    }
  }

  try {
    const findings = await processState(thisState);
    const abbrev = getStateAbbreviation(thisState.name);

    const fileName = `output/state-${abbrev}-findings.csv`;
    const content = `${abbrev},${findings}\n`;
    const filePath = path.join(__dirname, fileName);

    return fs.writeFile(filePath, content, 'utf8', (err) => {
      if (err) {
        console.error('Error writing file:', err);
      } else {
        console.log(`File saved: ${filePath}`);
      }
    });

  } catch (error) {
    console.error('Error processing states:', error);
  }
}

async function processState(state) {
    const CDPs = await getCDPs(state.name);
    const stateName = state.name.replace(/\s/g, '_');
    const stateFile = `output/${stateName}.csv`;
    const stateFlaggedFile = `output/${stateName}_flagged.csv`;
    console.log(`State: ${stateName}, OSM Relation ID: ${state.osmRelationId}`);
    await saveBoundariesWithinToCSV(state.osmRelationId);
    const flaggedFindings = await boundaryCheck(`output/${state.osmRelationId}.csv`, stateFile, getStateAbbreviation(state.name), CDPs);    
    console.log(`Boundary check complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    convertCsvToHtml(stateFile, state.name);
    convertCsvToHtml(stateFlaggedFile, state.name);
    console.log(`HTML generation complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    return flaggedFindings;
}

const outputFolderPath = path.join(__dirname, 'output');

fs.mkdir(outputFolderPath, { recursive: true }, (error) => {
    if (error) {
        console.error('Error creating folder:', error);
    }
});

processOneState(process.argv[2]);