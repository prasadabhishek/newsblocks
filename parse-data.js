import fs from 'fs';

const fileContent = fs.readFileSync('src/data.js', 'utf8');

// Replace "export default" with "const data =" so we can eval it
const script = fileContent.replace('export default', 'const data =') + '\nconsole.log(JSON.stringify(data));';

try {
  const jsonStr = eval(`(() => { ${script}; return JSON.stringify(data); })()`);
  const data = JSON.parse(jsonStr);

  const sentiments = new Set();
  let clusterCount = 0;
  let headlineCount = 0;
  const clusterSizes = {};

  const examples = [];

  for (const category of data.children) {
    for (const cluster of category.children) {
      clusterCount++;
      sentiments.add(cluster.sentiment);
      const size = cluster.rawArticles ? cluster.rawArticles.length : 1;
      headlineCount += size;
      clusterSizes[size] = (clusterSizes[size] || 0) + 1;

      if (size > 1 && size <= 4 && examples.length < 3) {
          examples.push({
              category: category.name,
              title: cluster.representativeTitle,
              sentiment: cluster.sentiment,
              articles: cluster.rawArticles.slice(0, 3)
          });
      }
    }
  }

  console.log("=== ACTUAL V2 DATA PROOF ===");
  console.log(`Total Headlines Processed: ${headlineCount}`);
  console.log(`Total Unique Clusters Created: ${clusterCount}`);
  console.log(`Average Cluster Size: ${(headlineCount / clusterCount).toFixed(2)} headlines per cluster`);
  console.log("\nDistribution of Cluster Sizes:");
  for (const size in clusterSizes) {
      console.log(`  - ${size} headline(s): ${clusterSizes[size]} clusters`);
  }
  
  console.log("\nSentiment Values Found (Should be perfectly -0.9, -0.4, 0, 0.4, 0.9):");
  console.log(Array.from(sentiments).sort());

  console.log("\nExamples of Tightly Clustered Headlines (V2 Embeddings at work):");
  examples.forEach((ex, i) => {
      console.log(`\nExample ${i+1}: ${ex.category} | Sentiment: ${ex.sentiment}`);
      console.log(`Representative Title: "${ex.title}"`);
      ex.articles.forEach(a => console.log(`   - "${a}"`));
  });

} catch (e) {
  console.error("Parse error:", e);
}
