const { fetchUSStates } = require('./us-states_to_json.js');
const { convertCsvToHtml } = require("./csv_to_table.js");
const { getStateFipsCode } = require("./census_bureau.js");
const { boundaryCheck } = require("./wikidata_boundary_check.js");
const { saveBoundariesWithinToCSV } = require('./bounds_to_csv.js');
const { getStateAbbreviation } = require('./state_abbreviation.js');
const { getCensusBoundaries } = require ("./census_bureau.js");
const { getCitiesAndTownsInStateRelation } = require('./wikidata/wikidata_query_service.js');
const { saveCitiesAndTownsToHTML } = require('./html_writer.js');
const { getOutputFilenames } = require('./util-filenames.js');
const fs = require('fs');
const path = require('path');

async function processOneState(stateName) {

  let thisState;
  const states = await fetchUSStates();
  thisState = states.find(state => state.name === stateName);
  if (!thisState) {
    throw new Error(`Could not find state with name: ${stateName}`);
  }

  thisState.fipsCode = getStateFipsCode(thisState.name);
  thisState.urlName = thisState.name.replace(/\s/g, '_');

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
    const censusBoundaries = await getCensusBoundaries(state);
    const citiesAndTowns = await getCitiesAndTownsInStateRelation(state.osmRelationId);
    const filenames = getOutputFilenames(state);
    console.log(`State: ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    await saveBoundariesWithinToCSV(state.osmRelationId);
    saveCitiesAndTownsToHTML(citiesAndTowns, state.name);
    state.abbrev = getStateAbbreviation(state.name);
    const flaggedFindings = await boundaryCheck(filenames, state, censusBoundaries, citiesAndTowns);    
    console.log(`Boundary check complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    convertCsvToHtml(filenames.outputCSV, state);
    convertCsvToHtml(filenames.outputIssuesCSV, state, filenames.stateBulkFile);
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