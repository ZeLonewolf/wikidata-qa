const { fetchUSStates } = require('./us-states_to_json.js');
const { generateHTML } = require('./generate_index.js');
const { convertCsvToHtml } = require("./csv_to_table.js");
const { boundaryCheck } = require("./wikidata_boundary_check.js");
const { spawn } = require('child_process');
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
    await downloadState(state.osmRelationId);
    await boundaryCheck(`output/${state.osmRelationId}.csv`, stateFile);
    console.log(`Boundary check complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    convertCsvToHtml(stateFile);
    convertCsvToHtml(stateFlaggedFile);
    console.log(`HTML generation complete for ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
}

async function downloadState(osmID) {
  return new Promise((resolve, reject) => {
    const args = [osmID];
    const callee = spawn('node', ['./bounds_to_csv.js', ...args]);

    callee.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    callee.on('close', (code) => {
      console.log(`Downloaded CSV for ${osmID} from overpass (code ${code})`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`child process exited with code ${code}`));
      }
    });
  });
}

const outputFolderPath = path.join(__dirname, 'output');

fs.mkdir(outputFolderPath, { recursive: true }, (error) => {
    if (error) {
        console.error('Error creating folder:', error);
    }
});

processStates(process.argv[2]);
