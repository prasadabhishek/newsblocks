/**
 * Data Validation Script
 * Validates the gathered news data to ensure quality before deployment.
 * Uses cached embeddings/inferences to avoid AI calls.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '../src/data.js');

const VALIDATION_RULES = {
    MIN_CATEGORIES: 3,
    MAX_CITATION_COUNT: 100,  // Catch mega-clusters (over-merging)
    MIN_IMPORTANCE: 10,
    MAX_IMPORTANCE: 100,
    MIN_STORIES_PER_CATEGORY: 1,
    MAX_STORIES_PER_CATEGORY: 200,  // Sanity check
};

function loadData() {
    const content = readFileSync(DATA_PATH, 'utf8');
    const jsonStr = content.replace('export const newsData = ', '');
    // Handle trailing content after JSON (semicolon, etc)
    const match = jsonStr.match(/^[\s\S]*?\n}\s*[;]?\s*$/);
    const cleaned = match ? match[0].replace(/;\s*$/, '') : jsonStr;
    return JSON.parse(cleaned);
}

function validateData(data) {
    const issues = [];
    const warnings = [];

    console.log('=== DATA VALIDATION ===\n');

    // Rule 1: Must have categories
    if (!data.children || data.children.length === 0) {
        issues.push('CRITICAL: No categories found in data');
        return { issues, warnings, valid: false };
    }
    console.log(`✓ Categories: ${data.children.length}`);

    // Rule 2: Minimum categories
    if (data.children.length < VALIDATION_RULES.MIN_CATEGORIES) {
        issues.push(`ERROR: Only ${data.children.length} categories, need at least ${VALIDATION_RULES.MIN_CATEGORIES}`);
    } else {
        console.log(`✓ Has ${data.children.length} categories (min: ${VALIDATION_RULES.MIN_CATEGORIES})`);
    }

    // Rule 3: Validate each category
    let totalClusters = 0;
    let totalArticles = 0;

    for (const category of data.children) {
        if (!category.children || category.children.length === 0) {
            issues.push(`ERROR: Category "${category.name}" is empty`);
            continue;
        }

        const storyCount = category.children.length;
        totalClusters += storyCount;

        console.log(`\n${category.name}: ${storyCount} stories`);

        // Check story count limits
        if (storyCount < VALIDATION_RULES.MIN_STORIES_PER_CATEGORY) {
            warnings.push(`WARN: ${category.name} has only ${storyCount} stories`);
        }

        // Validate each story
        for (const story of category.children) {
            totalArticles += story.rawArticles?.length || 0;

            // Citation count checks
            if (story.citationCount > VALIDATION_RULES.MAX_CITATION_COUNT) {
                issues.push(`CRITICAL: "${story.representativeTitle?.substring(0, 40)}..." has ${story.citationCount} citations - possible over-merging!`);
            }

            if (story.citationCount > 50) {
                warnings.push(`WARN: "${story.representativeTitle?.substring(0, 40)}..." has ${story.citationCount} citations - may be over-merged`);
            }

            // Importance checks
            if (!story.importance || story.importance < VALIDATION_RULES.MIN_IMPORTANCE || story.importance > VALIDATION_RULES.MAX_IMPORTANCE) {
                issues.push(`ERROR: Invalid importance (${story.importance}) for "${story.representativeTitle?.substring(0, 40)}..."`);
            }

            // Sentiment checks
            if (typeof story.sentiment !== 'number' || story.sentiment < -1 || story.sentiment > 1) {
                issues.push(`ERROR: Invalid sentiment (${story.sentiment}) for "${story.representativeTitle?.substring(0, 40)}..."`);
            }

            // Title checks
            if (!story.representativeTitle || story.representativeTitle.length < 5) {
                issues.push(`ERROR: Invalid title for story in ${category.name}`);
            }
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total clusters: ${totalClusters}`);
    console.log(`Total articles: ${totalArticles}`);

    // Final verdict
    const valid = issues.length === 0;

    if (valid) {
        console.log('\n✓ ALL VALIDATION CHECKS PASSED');
    } else {
        console.log('\n✗ VALIDATION FAILED:');
        issues.forEach(i => console.log('  ' + i));
    }

    if (warnings.length > 0) {
        console.log('\nWarnings:');
        warnings.forEach(w => console.log('  ' + w));
    }

    return { issues, warnings, valid, stats: { totalClusters, totalArticles, categories: data.children.length } };
}

// Run validation
try {
    const data = loadData();
    const result = validateData(data);

    if (!result.valid) {
        console.error('\nValidation FAILED - fix issues before pushing');
        process.exit(1);
    }

    console.log('\n✓ Data validation passed');
    process.exit(0);
} catch (e) {
    console.error('Validation error:', e.message);
    process.exit(1);
}
