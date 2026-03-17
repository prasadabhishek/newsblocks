import fs from 'fs';
import path from 'path';
import { newsData } from '../src/data.js';

const PUBLIC_DIR = path.resolve('./public');
const STORY_DIR = path.join(PUBLIC_DIR, 'story');
const BASE_URL = 'https://newsblocks.org';

function generateStaticPages() {
    console.log('Generating Shadow Pages for SEO...');

    // 1. Clean/Create the story directory
    if (fs.existsSync(STORY_DIR)) {
        fs.rmSync(STORY_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(STORY_DIR, { recursive: true });

    // 2. Read the master index.html as a template
    const template = fs.readFileSync(path.resolve('./index.html'), 'utf8');

    const sitemapLinks = [BASE_URL];

    // Helper to replace meta tags robustly (handles multiline content)
    const replaceMeta = (html, propertyOrName, newValue, useProperty = true) => {
        const attr = useProperty ? 'property' : 'name';
        const regex = new RegExp(`<meta\\s+${attr}="${propertyOrName}"[\\s\\S]*?content="[\\s\\S]*?"\\s*\\/>`, 'g');
        return html.replace(regex, `<meta ${attr}="${propertyOrName}" content="${newValue}" />`);
    };

    // 3. Iterate through categories and stories
    newsData.children.forEach(category => {
        category.children.forEach(story => {
            if (!story.slug) return;

            const storyPath = path.join(STORY_DIR, story.slug);
            fs.mkdirSync(storyPath, { recursive: true });

            const storyUrl = `${BASE_URL}/story/${story.slug}`;
            sitemapLinks.push(storyUrl);

            // Create customized Meta tags for this story
            const title = `${story.representativeTitle} | NewsBlocks`;
            const description = `Visual news analysis: ${story.citationCount} sources covering this story. Sentiment: ${Math.round(story.sentiment * 100)}%. Explore the map on NewsBlocks.`;

            let html = template;
            html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);

            // Standard Meta
            html = replaceMeta(html, 'description', description, false);

            // Open Graph
            html = replaceMeta(html, 'og:title', title, true);
            html = replaceMeta(html, 'og:description', description, true);
            html = replaceMeta(html, 'og:url', storyUrl, true);

            // Twitter
            html = replaceMeta(html, 'twitter:title', title, true);
            html = replaceMeta(html, 'twitter:description', description, true);
            html = replaceMeta(html, 'twitter:url', storyUrl, true);

            // Canonical
            html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${storyUrl}" />`);

            // Inject "Shadow Content" - hidden text for crawlers
            const shadowContent = `
                <div id="seo-shadow-content" style="display:none;" aria-hidden="true">
                    <h1>${story.representativeTitle}</h1>
                    <p>${description}</p>
                    <h2>Sources</h2>
                    <ul>
                        ${story.rawArticles.map(a => {
                let brandedLink = a.link;
                try {
                    const u = new URL(a.link);
                    u.searchParams.set('utm_source', 'newsblocks.org');
                    u.searchParams.set('utm_medium', 'referral');
                    brandedLink = u.toString();
                } catch (e) { }
                return `<li><a href="${brandedLink}">${a.source}: ${a.title}</a></li>`;
            }).join('')}
                    </ul>
                </div>
            `;
            html = html.replace('<body>', `<body>\n${shadowContent}`);

            fs.writeFileSync(path.join(storyPath, 'index.html'), html);
        });
    });

    // 4. Generate Sitemap.xml
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapLinks.map(link => `  <url><loc>${link}</loc><changefreq>hourly</changefreq></url>`).join('\n')}
</urlset>`;

    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap);

    console.log(`Success! Generated ${sitemapLinks.length - 1} shadow pages and sitemap.xml.`);
}

generateStaticPages();
