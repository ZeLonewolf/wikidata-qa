const { readOsmFile, writeOsmFile, getTags, getTagValue, markAsModified, getMembers } = require('../osm/osm-edit');
const geolib = require('geolib');

// Load and parse the OSM file
const osmFilePath = process.argv[2];

if (!osmFilePath) {
    console.error('Usage: node label_attach.js <osm-file>');
    process.exit(1);
}

// Find closest point on boundary to given node
function findClosestBoundaryPoint(node, relation, result) {
    let minDistance = Infinity;
    let closestPoint = null;
    
    // Get all nodes that make up the boundary
    const members = getMembers(relation);
    const wayMembers = members.filter(m => m.$.type === 'way');
    
    for (const wayMember of wayMembers) {
        const way = result.osm.way.find(w => w.$.id === wayMember.$.ref);
        if (!way || !way.nd) continue;
        
        for (const nd of way.nd) {
            const boundaryNode = result.osm.node.find(n => n.$.id === nd.$.ref);
            if (!boundaryNode) continue;
            
            const distance = geolib.convertDistance(
                geolib.getDistance(
                    { latitude: node.$.lat, longitude: node.$.lon },
                    { latitude: boundaryNode.$.lat, longitude: boundaryNode.$.lon }
                ),
                'mi'
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = boundaryNode;
            }
        }
    }
    
    return { distance: minDistance, point: closestPoint };
}

(async () => {
    try {
        const result = await readOsmFile(osmFilePath);
        let modified = false;
        let updateCount = 0;

        // Get all nodes with place tag
        const placeNodes = (result.osm.node || []).filter(node => {
            return getTagValue(node, 'place') !== null;
        });

        // Create map of place node names to nodes
        const placeNodesByName = new Map();
        placeNodes.forEach(node => {
            const name = getTagValue(node, 'name');
            if (name) {
                if (!placeNodesByName.has(name)) {
                    placeNodesByName.set(name, []);
                }
                placeNodesByName.get(name).push(node);
            }
        });

        // Get boundary relations without admin_centre or label
        const relations = (result.osm.relation || []).filter(relation => {
            const isBoundary = getTagValue(relation, 'boundary') !== null;
            const members = getMembers(relation);
            const hasAdminCentre = members.some(member => member.$.role === 'admin_centre');
            const hasLabel = members.some(member => member.$.role === 'label');
            return isBoundary && !hasAdminCentre && !hasLabel;
        });

        // Create map of relation names to relations
        const relationsByName = new Map();
        relations.forEach(relation => {
            const name = getTagValue(relation, 'name');
            if (name) {
                if (!relationsByName.has(name)) {
                    relationsByName.set(name, []);
                }
                relationsByName.get(name).push(relation);
            }
        });

        // Find matches and attach labels
        for (const [name, nodes] of placeNodesByName) {
            const matchingRelations = relationsByName.get(name) || [];
            
            if (matchingRelations.length > 0) {
                for (const relation of matchingRelations) {
                    let selectedNode = null;

                    // Find closest node to boundary
                    let closestNode = null;
                    let minDistance = Infinity;

                    for (const node of nodes) {
                        const { distance } = findClosestBoundaryPoint(node, relation, result);
                        console.log(`Node ${node.$.id} is ${distance.toFixed(2)} miles from boundary of ${name}`);
                        
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestNode = node;
                        }
                    }

                    // Only use the closest node if it's within 20 miles
                    if (minDistance <= 20) {
                        selectedNode = closestNode;
                    }

                    if (selectedNode) {
                        // Add node as label member
                        if (!relation.member) {
                            relation.member = [];
                        }
                        relation.member.push({
                            $: {
                                type: 'node',
                                ref: selectedNode.$.id,
                                role: 'label'
                            }
                        });

                        // Remove place tag from relation if present
                        const tags = getTags(relation);
                        relation.tag = tags.filter(tag => tag.$.k !== 'place');

                        // Mark relation as modified
                        markAsModified(relation);

                        modified = true;
                        updateCount++;
                        console.log(`Added label to boundary ${name} (relation ${relation.$.id}) at distance ${minDistance.toFixed(2)} miles`);
                    }
                }
            }
        }

        if (modified) {
            await writeOsmFile(osmFilePath, result);
            console.log(`OSM file updated successfully. Modified ${updateCount} boundaries.`);
        } else {
            console.log('No modifications were necessary.');
        }

    } catch (err) {
        console.error('Error processing OSM file:', err);
    }
})();
