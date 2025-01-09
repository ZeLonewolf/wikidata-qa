const fs = require('fs');
const xml2js = require('xml2js');

/**
 * Reads and parses an OSM XML file
 * @param {string} osmFilePath - Path to the OSM file
 * @returns {Promise<Object>} Parsed OSM data
 */
async function readOsmFile(osmFilePath) {
    const data = await fs.promises.readFile(osmFilePath, 'utf8');
    const parser = new xml2js.Parser();
    return parser.parseStringPromise(data);
}

/**
 * Writes modified OSM data back to file
 * @param {string} osmFilePath - Path to write to
 * @param {Object} osmData - Modified OSM data
 * @returns {Promise<void>}
 */
async function writeOsmFile(osmFilePath, osmData) {
    const builder = new xml2js.Builder({ headless: true });
    const updatedXml = builder.buildObject(osmData);
    await fs.promises.writeFile(osmFilePath, updatedXml);
}

/**
 * Gets all tags for an OSM element
 * @param {Object} element - OSM element (node/way/relation)
 * @returns {Array} Array of tags
 */
function getTags(element) {
    return element.tag || [];
}

/**
 * Gets value of specific tag from element
 * @param {Object} element - OSM element
 * @param {string} key - Tag key to find
 * @returns {string|null} Tag value if found, null if not
 */
function getTagValue(element, key) {
    const tags = getTags(element);
    const tag = tags.find(t => t.$.k === key);
    return tag ? tag.$.v : null;
}

/**
 * Sets a tag value on an element
 * @param {Object} element - OSM element
 * @param {string} key - Tag key
 * @param {string} value - Tag value
 */
function setTag(element, key, value) {
    if (!element.tag) {
        element.tag = [];
    }
    const existingTag = element.tag.find(t => t.$.k === key);
    if (existingTag) {
        existingTag.$.v = value;
    } else {
        element.tag.push({
            $: { k: key, v: value }
        });
    }
}

/**
 * Marks an element as modified
 * @param {Object} element - OSM element
 */
function markAsModified(element) {
    if (!element.$.action) {
        element.$.action = 'modify';
    }
}

/**
 * Gets all members of a relation
 * @param {Object} relation - Relation element
 * @returns {Array} Array of members
 */
function getMembers(relation) {
    return relation.member || [];
}

/**
 * Adds a member to a relation
 * @param {Object} relation - Relation element
 * @param {string} type - Member type (node/way/relation)
 * @param {string} ref - Member reference ID
 * @param {string} role - Member role
 */
function addMember(relation, type, ref, role) {
    if (!relation.member) {
        relation.member = [];
    }
    relation.member.push({
        $: { type, ref, role }
    });
}

/**
 * Removes members from a relation by role
 * @param {Object} relation - Relation element
 * @param {string} role - Role to remove
 * @returns {number} Number of members removed
 */
function removeMembersByRole(relation, role) {
    const members = getMembers(relation);
    const originalLength = members.length;
    relation.member = members.filter(m => m.$.role !== role);
    return originalLength - relation.member.length;
}

module.exports = {
    readOsmFile,
    writeOsmFile,
    getTags,
    getTagValue,
    setTag,
    markAsModified,
    getMembers,
    addMember,
    removeMembersByRole
};
