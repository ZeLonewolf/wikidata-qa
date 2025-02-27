function getOutputFilenames(state) {
    const baseFile = `output/${state.urlName}`;
    return {
        inputCSV: `output/${state.osmRelationId}.csv`,
        outputCSV: `${baseFile}.csv`,
        outputHTML: `${baseFile}.html`,
        outputIssuesCSV: `${baseFile}_flagged.csv`,
        outputIssuesHTML: `${baseFile}_flagged.html`,
        outputP402CSV: `${baseFile}_P402_entry.csv.txt`,
        outputP402RemovalCSV: `${baseFile}_P402_removal.csv.txt`, 
        outputRecommendedTags: `${baseFile}_recommended_tags.json`,
        stateBulkFile: `${baseFile}_bulk_findings.json`
    };
}

module.exports = {
    getOutputFilenames
};
