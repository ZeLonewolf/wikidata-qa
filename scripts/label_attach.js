const { readOsmFile, writeOsmFile, getTags, getTagValue, setTag, markAsModified, getMembers } = require('../osm/osm-edit');

// Load and parse the OSM file
const osmFilePath = process.argv[2];

if (!osmFilePath) {
    console.error('Usage: node label_attach.js <osm-file>');
    process.exit(1);
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

        // Find 1:1 matches and attach labels
        for (const [name, nodes] of placeNodesByName) {
            const matchingRelations = relationsByName.get(name) || [];
            
            if (nodes.length === 1 && matchingRelations.length === 1) {
                const node = nodes[0];
                const relation = matchingRelations[0];

                // Add node as label member
                if (!relation.member) {
                    relation.member = [];
                }
                relation.member.push({
                    $: {
                        type: 'node',
                        ref: node.$.id,
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
                console.log(`Added label to boundary ${name} (relation ${relation.$.id})`);
            } else if (nodes.length > 0 && matchingRelations.length > 0) {
                // Print debug info for 1:many or many:many matches
                console.log(`Found ${nodes.length} nodes and ${matchingRelations.length} relations for "${name}"`);
                console.log(`Nodes: ${nodes.map(n => n.$.id).join(', ')}`);
                console.log(`Relations: ${matchingRelations.map(r => r.$.id).join(', ')}`);
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
