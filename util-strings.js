// Use regex to remove diacritic marks (combining characters)
const diacriticRegex = /[\u0300-\u036f]/g;

// Regex to normalize different types of dashes/hyphens to standard hyphen
const dashRegex = /[\u2010-\u2015\u2212\u2043\u002D]/g;

function cleanAndNormalizeString(str) {
    if (!str) return '';
    
    return str.normalize("NFD")
             .replace(diacriticRegex, "")
             .replace(dashRegex, "-");
}

function matchStringsIgnoringDiacritics(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
        return false;
    }

    // Clean and normalize each string in first array
    const cleanArr1 = arr1.map(cleanAndNormalizeString);

    // Clean and normalize each string in second array 
    const cleanArr2 = arr2.map(cleanAndNormalizeString);

    // Check if any strings match between the arrays
    return cleanArr1.some(str1 => 
        cleanArr2.some(str2 => str1 === str2)
    );
}

function splitFirstCommaComponent(str) {
    return str.split(',')[0].trim();
}

module.exports = { matchStringsIgnoringDiacritics, cleanAndNormalizeString, splitFirstCommaComponent }