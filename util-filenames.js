function getOutputFilenames(state) {
    const baseFile = `output/${state.urlName}`;
    return {
        outputCSV: `${baseFile}.csv`,
        outputIssuesCSV: `${baseFile}_flagged.csv`,
        outputP402CSV: `${baseFile}_P402_entry.csv.txt`,
        outputP402RemovalCSV: `${baseFile}_P402_removal.csv.txt`, 
        outputRecommendedTags: `${baseFile}_recommended_tags.json`
    };
}

module.exports = {
    getOutputFilenames
};
