import fs from 'node:fs';
import path from 'node:path';
import { newsData } from '../src/data.js';

const OUTPUT_DIR = path.resolve('dist');
const BASE_URL = 'https://newsblocks.org';

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMeta(html, attribute, key, value) {
    const tag = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapeRegExp(key)}["'])[^>]*>`, 'i');
    const replacement = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(value)}" />`;
    if (tag.test(html)) return html.replace(tag, replacement);
    return html.replace('</head>', `  ${replacement}\n</head>`);
}

function atomicWrite(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, contents);
    fs.renameSync(temporaryPath, filePath);
}

function safeArticleUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function getStories() {
    return (newsData.children || []).flatMap(category =>
        (category.children || []).map(story => ({ ...story, category: category.name }))
    ).filter(story => typeof story.slug === 'string' && /^[a-z0-9-]+$/.test(story.slug));
}

function renderStoryPage(template, story) {
    const title = `${story.representativeTitle || 'News story'} | NewsBlocks`;
    const description = `Explore coverage of ${story.representativeTitle || 'this news story'} from ${story.citationCount || 1} distinct publisher${story.citationCount === 1 ? '' : 's'} on NewsBlocks.`;
    const storyUrl = `${BASE_URL}/story/${encodeURIComponent(story.slug)}/`;
    const articles = (story.rawArticles || []).map(article => {
        const url = safeArticleUrl(article.link);
        const label = `${article.source || 'News source'}: ${article.title || story.representativeTitle || 'Read article'}`;
        if (!url) return `<li>${escapeHtml(label)}</li>`;
        return `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`;
    }).join('\n');
    const fallback = `<main class="story-fallback" style="max-width:760px;margin:8vh auto;padding:24px;font:16px/1.6 system-ui;color:#f8fafc"><a href="/" style="color:#93c5fd">← NewsBlocks</a><p style="color:#94a3b8">${escapeHtml(story.category || 'News')} · ${Number(story.citationCount) || 1} distinct publisher${story.citationCount === 1 ? '' : 's'}</p><h1>${escapeHtml(story.representativeTitle || 'News story')}</h1><p>Coverage and sentiment for this story, based on the articles below.</p><ul>${articles}</ul></main>`;

    let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = replaceMeta(html, 'name', 'description', description);
    html = replaceMeta(html, 'property', 'og:title', title);
    html = replaceMeta(html, 'property', 'og:description', description);
    html = replaceMeta(html, 'property', 'og:url', storyUrl);
    html = replaceMeta(html, 'property', 'twitter:title', title);
    html = replaceMeta(html, 'property', 'twitter:description', description);
    html = replaceMeta(html, 'property', 'twitter:url', storyUrl);

    const canonicalTag = `<link rel="canonical" href="${escapeHtml(storyUrl)}" />`;
    const canonicalPattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
    html = canonicalPattern.test(html)
        ? html.replace(canonicalPattern, canonicalTag)
        : html.replace('</head>', `  ${canonicalTag}\n</head>`);
    html = html.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
    return html;
}

if (!fs.existsSync(path.join(OUTPUT_DIR, 'index.html'))) {
    throw new Error('Built site not found in dist/. Run the frontend build before generating story pages.');
}

const template = fs.readFileSync(path.join(OUTPUT_DIR, 'index.html'), 'utf8');
const stories = getStories();
const lastUpdated = new Date(newsData.lastUpdated);
const lastmod = Number.isNaN(lastUpdated.getTime()) ? '' : `\n    <lastmod>${lastUpdated.toISOString()}</lastmod>`;

for (const story of stories) {
    const storyDirectory = path.join(OUTPUT_DIR, 'story', story.slug);
    atomicWrite(path.join(storyDirectory, 'index.html'), renderStoryPage(template, story));
}

const sitemapUrls = [BASE_URL, ...stories.map(story => `${BASE_URL}/story/${encodeURIComponent(story.slug)}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(url => `  <url>\n    <loc>${escapeHtml(url)}</loc>${lastmod}\n  </url>`).join('\n')}\n</urlset>\n`;
atomicWrite(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap);

console.log(`Generated ${stories.length} deployable story pages and sitemap in dist/.`);
