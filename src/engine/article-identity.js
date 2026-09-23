// A feed is a discovery channel, not necessarily the publisher of an article.
// Keep these identities separate so aggregator copies cannot create consensus.
const PUBLISHER_ALIASES = new Map(Object.entries({
    bbc: 'BBC', bbcworld: 'BBC', bbcus: 'BBC', bbcbusiness: 'BBC', bbccom: 'BBC',
    theguardian: 'The Guardian', theguardiancom: 'The Guardian',
    aljazeera: 'Al Jazeera', aljazeeracom: 'Al Jazeera',
    france24: 'France 24', france24com: 'France 24',
    scmp: 'SCMP', scmpcom: 'SCMP',
    skynews: 'Sky News', skycom: 'Sky News',
    euronews: 'Euronews', euronewscom: 'Euronews',
    lemonde: 'Le Monde', lemondefr: 'Le Monde',
    time: 'Time', timecom: 'Time',
    ibtimes: 'IBTimes', ibtimescom: 'IBTimes',
    nytimes: 'New York Times', nytimescom: 'New York Times', newyorktimes: 'New York Times',
    washingtonpost: 'Washington Post', thewashingtonpost: 'Washington Post',
    washingtonpostcom: 'Washington Post',
    nbc: 'NBC News', nbcnews: 'NBC News', nbcnewscom: 'NBC News',
    foxnews: 'Fox News', foxnewscom: 'Fox News',
    npr: 'NPR', nprorg: 'NPR',
    abcnews: 'ABC News', abcnewstop: 'ABC News', abcnewsus: 'ABC News', abcnewscom: 'ABC News',
    cnbc: 'CNBC', cnbcmarkets: 'CNBC', cnbceconomy: 'CNBC', cnbccom: 'CNBC',
    yahoofinance: 'Yahoo Finance', financeyahoocom: 'Yahoo Finance',
    marketwatch: 'MarketWatch', marketwatchcom: 'MarketWatch',
    bloomberg: 'Bloomberg', bloombergmarkets: 'Bloomberg', bloombergcom: 'Bloomberg',
    ft: 'Financial Times', ftinternational: 'Financial Times', ftcom: 'Financial Times',
    wsj: 'Wall Street Journal', wsjusbusiness: 'Wall Street Journal', wsjcom: 'Wall Street Journal',
    ap: 'Associated Press', apnews: 'Associated Press', apnewscom: 'Associated Press',
    techcrunch: 'TechCrunch', techcrunchcom: 'TechCrunch',
    theverge: 'The Verge', thevergecom: 'The Verge',
    arstechnica: 'Ars Technica', arstechnicacom: 'Ars Technica',
    wired: 'Wired', wiredcom: 'Wired',
    sciencedaily: 'ScienceDaily', sciencedailycom: 'ScienceDaily',
    nature: 'Nature', naturecom: 'Nature',
    physorg: 'Phys.org',
    politico: 'Politico', politicoeu: 'Politico', politicocom: 'Politico'
}));

function publisherLookupKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[^a-z0-9]/g, '');
}

export function normalizePublisherName(value) {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 100) return null;
    const key = publisherLookupKey(name);
    if (!key || key === 'google' || key === 'newsgooglecom' || key.startsWith('googlenews') ||
        /^google(world|us|stocks|tech|science)$/.test(key) ||
        key === 'various' || key === 'news') return null;
    return PUBLISHER_ALIASES.get(key) || name;
}

export function publisherId(value) {
    const name = normalizePublisherName(value);
    return name ? publisherLookupKey(name) : null;
}

export function normalizeHeadline(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function isRecentArticle(article, now = Date.now()) {
    const publishedAt = Date.parse(article?.pubDate || '');
    return Boolean(article?.title) && Number.isFinite(publishedAt) &&
        publishedAt >= now - 24 * 60 * 60 * 1000 &&
        publishedAt <= now + 2 * 60 * 60 * 1000;
}

function headlineFingerprint(value) {
    return normalizeHeadline(value).toLocaleLowerCase('en-US')
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function canonicalizeArticleUrl(value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (/^utm_/i.test(key) || /^(fbclid|gclid|dclid|mc_cid|mc_eid)$/i.test(key)) {
                url.searchParams.delete(key);
            }
        }
        return url.toString();
    } catch {
        return null;
    }
}

export function normalizeFeedArticle(feed, item) {
    const aggregator = feed.aggregator || null;
    // Google News RSS exposes the original publisher in <source>; its feed name
    // and news.google.com wrapper URL must never count as independent evidence.
    const publisher = normalizePublisherName(aggregator ? item.source : feed.publisher);
    if (!publisher) return null;

    let title = normalizeHeadline(item.title);
    if (aggregator && item.source) {
        const suffix = ` - ${String(item.source).trim()}`;
        if (title.toLocaleLowerCase('en-US').endsWith(suffix.toLocaleLowerCase('en-US'))) {
            title = title.slice(0, -suffix.length).trim();
        }
    }

    return {
        title,
        source: publisher,
        publisher,
        publisherId: publisherId(publisher),
        aggregator,
        feedSource: feed.publisher,
        link: item.link,
        canonicalUrl: aggregator ? null : canonicalizeArticleUrl(item.link),
        pubDate: new Date(item.isoDate || item.pubDate),
        tier: feed.tier
    };
}

function identityKeys(article) {
    const keys = [];
    const canonicalUrl = article.canonicalUrl || (!article.aggregator ? canonicalizeArticleUrl(article.link) : null);
    if (canonicalUrl) keys.push(`url:${canonicalUrl}`);
    const publisher = article.publisherId || publisherId(article.publisher || article.source);
    const title = headlineFingerprint(article.title);
    if (publisher && title) keys.push(`headline:${publisher}:${title}`);
    if (article.aggregator && article.link) {
        const discoveryUrl = canonicalizeArticleUrl(article.link);
        if (discoveryUrl) keys.push(`discovery:${discoveryUrl}`);
    }
    return keys;
}

function representativeRank(article) {
    const direct = article.aggregator ? 0 : 100;
    const knownPublisher = publisherId(article.publisher || article.source) ? 20 : 0;
    const tier = article.tier === 1 ? 10 : 0;
    const canonical = article.canonicalUrl ? 5 : 0;
    return direct + knownPublisher + tier + canonical;
}

export function dedupeArticles(articles) {
    if (!articles.length) return [];
    const parent = articles.map((_, index) => index);
    const root = index => {
        while (parent[index] !== index) {
            parent[index] = parent[parent[index]];
            index = parent[index];
        }
        return index;
    };
    const union = (left, right) => {
        const a = root(left);
        const b = root(right);
        if (a !== b) parent[b] = a;
    };
    const seenKeys = new Map();

    articles.forEach((article, index) => {
        for (const key of identityKeys(article)) {
            if (seenKeys.has(key)) union(index, seenKeys.get(key));
            else seenKeys.set(key, index);
        }
    });

    const groups = new Map();
    articles.forEach((article, index) => {
        const group = root(index);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(article);
    });

    return [...groups.values()].map(group => {
        const best = [...group].sort((a, b) =>
            representativeRank(b) - representativeRank(a) ||
            String(a.link || '').localeCompare(String(b.link || ''))
        )[0];
        const publisher = normalizePublisherName(best.publisher || best.source);
        return {
            ...best,
            source: publisher || best.source,
            publisher,
            publisherId: publisherId(publisher),
            canonicalUrl: best.canonicalUrl || (best.aggregator ? null : canonicalizeArticleUrl(best.link))
        };
    });
}

export function storyEvidence(articles) {
    const rawArticles = dedupeArticles(articles);
    const independent = new Map();
    for (const article of rawArticles) {
        const id = article.publisherId || publisherId(article.publisher || article.source);
        if (id && !independent.has(id)) independent.set(id, normalizePublisherName(article.publisher || article.source));
    }
    return {
        rawArticles,
        sources: [...independent.values()],
        articleCount: rawArticles.length,
        independentPublisherCount: independent.size,
        citationCount: independent.size
    };
}

export function hasConsistentEvidence(story) {
    if (!Array.isArray(story.rawArticles) || !story.rawArticles.length ||
        story.rawArticles.some(article => !publisherId(article.publisher || article.source))) return false;
    const expected = storyEvidence(story.rawArticles);
    const actualSourceIds = (story.sources || []).map(publisherId);
    return story.rawArticles.length === expected.rawArticles.length &&
        story.articleCount === expected.articleCount &&
        story.independentPublisherCount === expected.independentPublisherCount &&
        story.citationCount === expected.citationCount &&
        actualSourceIds.length === expected.sources.length &&
        actualSourceIds.every(id => id && expected.sources.some(source => publisherId(source) === id));
}
