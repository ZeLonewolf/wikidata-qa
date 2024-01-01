const { fetchUSStates } = require('./us-states_to_json.js');
const { generateHTML } = require('./generate_index.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function processStates() {
  try {
    const states = await fetchUSStates();
    generateHTML(states.map(item => item.name).sort());
    for (const state of states) {
      await processState(state);
    }
  } catch (error) {
    console.error('Error processing states:', error);
  }
}

async function processState(state) {
    console.log(`State: ${state.name}, OSM Relation ID: ${state.osmRelationId}`);
    await downloadState(state.osmRelationId);
    await qaState(state.osmRelationId, state.name);
}

async function downloadState(osmID) {
  return new Promise((resolve, reject) => {
    const args = [osmID];
    const callee = spawn('node', ['./bounds_to_csv.js', ...args]);

    callee.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    callee.on('close', (code) => {
      console.log(`Downloaded CSV from overpass (code ${code})`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`child process exited with code ${code}`));
      }
    });
  });
}

async function qaState(osmID, stateName) {
  return new Promise((resolve, reject) => {
    const args = [`output/${osmID}.csv`, `output/${stateName.replace(/\s/g, '_')}.csv`];
    const callee = spawn('node', ['./wikidata_boundary_check.js', ...args]);

    callee.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    callee.on('close', (code) => {
      if (code === 0) {
        resolve();
        console.log(`${stateName} Boundary analysis complete!`);
      } else {
        reject(new Error(`child process exited with code ${code}`));
      }
    });
  });
}



processStates();