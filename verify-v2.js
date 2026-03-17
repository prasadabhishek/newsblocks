import fs from 'fs';

const dataFile = fs.readFileSync('./src/data.js', 'utf8');

// The file exports default data. We can just extract all "sentiment:" values using regex
const sentimentRegex = /sentiment:\s*(-?[0-9.]+)/g;
let match;
const sentiments = new Set();
while ((match = sentimentRegex.exec(dataFile)) !== null) {
    sentiments.add(parseFloat(match[1]));
}

// Extract rawArticles arrays to check cluster sizes
const articlesRegex = /rawArticles:\s*\[([\s\S]*?)\]\s*,/g;
const sizes = [];
while ((match = articlesRegex.exec(dataFile)) !== null) {
    const rawMatch = match[1];
    const headlines = rawMatch.match(/"([^"\\]*(\\.[^"\\]*)*)"/g) || [];
    sizes.push(headlines.length);
}

console.log("=== V2 DATA VERIFICATION ===");
console.log("Unique Sentiment Values:", Array.from(sentiments).sort());
console.log("Total Clusters Found:", sizes.length);
const sizeCounts = sizes.reduce((acc, size) => { acc[size] = (acc[size] || 0) + 1; return acc; }, {});
console.log("Cluster Sizes (Headline Count -> Number of Clusters):", sizeCounts);

// Find a cluster with 2 or 3 headlines to show an example of tightness
const exampleRegex = /\{[^}]*representativeTitle:\s*"([^"]+)"[^}]*rawArticles:\s*\[\s*"([^"]+)"\s*(?:,\s*"([^"]+)")?\s*\].*?\}/g;
let exampleMatch = exampleRegex.exec(dataFile);
if(exampleMatch) {
    console.log("\nExample Cluster:");
    console.log("Representative Title:", exampleMatch[1]);
    console.log("  - Headline 1:", exampleMatch[2]);
    if(exampleMatch[3]) console.log("  - Headline 2:", exampleMatch[3]);
}

