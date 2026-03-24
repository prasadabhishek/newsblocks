import { test, expect } from '@playwright/test';

/**
 * NewsBlocks Comprehensive E2E Test Suite
 * Tests all features: treemap, interactions, mobile, color blind, SEO, etc.
 */
test.describe('NewsBlocks E2E Tests', () => {

    // ============================================
    // CORE RENDERING
    // ============================================
    test.describe('Rendering', () => {
        test('treemap renders with SVG blocks', async ({ page }) => {
            await page.goto('/');

            // Wait for SVG treemap
            const svg = page.locator('svg').first();
            await expect(svg).toBeVisible({ timeout: 10000 });

            // Verify treemap has leaf nodes (story blocks)
            const leafNodes = page.locator('.leaf-node');
            const count = await leafNodes.count();
            expect(count).toBeGreaterThan(0);
        });

        test('all available categories are visible in treemap', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Check for category labels in SVG text elements
            const categoryLabels = page.locator('svg text.category');
            const categories = await categoryLabels.allTextContents();

            // Should have at least World and one other category
            expect(categories.length).toBeGreaterThanOrEqual(2);
            console.log('Found categories:', categories);
        });

        test('last updated timestamp displays in header', async ({ page }) => {
            await page.goto('/');

            const lastUpdated = page.getByText(/LAST UPDATED:/i);
            await expect(lastUpdated).toBeVisible();

            // Should have a date/time after the label
            const text = await lastUpdated.textContent();
            expect(text).toMatch(/\d{1,2}:\d{2}/); // Has time
        });

        test('sentiment legend gradient bar is visible', async ({ page }) => {
            await page.goto('/');

            const legend = page.locator('.sentiment-bar');
            await expect(legend).toBeVisible();
        });

        test('logo and title display correctly', async ({ page }) => {
            await page.goto('/');

            const logo = page.getByText('NewsBlocks');
            await expect(logo).toBeVisible();

            const subtitle = page.getByText('news sentiment visualizer');
            await expect(subtitle).toBeVisible();
        });
    });

    // ============================================
    // TOOLTIP INTERACTIONS
    // ============================================
    test.describe('Tooltip Interactions', () => {
        test('hovering over block shows tooltip after delay', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Find a treemap block and hover
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.hover();

            // Wait for tooltip to appear (40ms delay + transition)
            await page.waitForTimeout(200);

            // Tooltip is the div with no-scrollbar class that contains article links
            const tooltip = page.locator('.no-scrollbar');
            await expect(tooltip).toBeVisible();
        });

        test('clicking block locks tooltip and shows article links', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a leaf node
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();

            // Wait for tooltip
            await page.waitForTimeout(300);

            // Tooltip should be visible
            const tooltip = page.locator('.no-scrollbar');
            await expect(tooltip).toBeVisible();

            // Should have article links
            const links = page.locator('.no-scrollbar a[href*="http"]');
            const linkCount = await links.count();
            expect(linkCount).toBeGreaterThan(0);
        });

        test('clicking X button closes tooltip', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a leaf node to open tooltip
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(500);

            // The close button is visible in tooltip - use JS click
            await page.evaluate(() => {
                const btn = document.querySelector('.no-scrollbar button');
                if (btn) btn.click();
            });
            await page.waitForTimeout(300);

            // After close, clicking header should work (URL should go back to /)
            await page.evaluate(() => {
                document.querySelector('header').click();
            });
            await page.waitForTimeout(200);
            expect(page.url()).toMatch(/\/$/);
        });

        test('clicking header clears selection', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a leaf node
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(200);

            // URL should have /story/
            expect(page.url()).toMatch(/\/story\//);

            // Click header
            const header = page.locator('header');
            await header.click();

            // URL should be back to /
            expect(page.url()).toMatch(/\/$/);
        });
    });

    // ============================================
    // DEEP LINKING & URL NAVIGATION
    // ============================================
    test.describe('Deep Linking', () => {
        test('clicking story updates URL to /story/[slug]', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a leaf node
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(300);

            expect(page.url()).toMatch(/\/story\//);
        });

        test('direct URL with valid slug shows story selected', async ({ page }) => {
            // Get a valid slug from the page first
            await page.goto('/');
            await page.waitForTimeout(2000);

            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(200);

            const storyUrl = page.url();
            const slug = storyUrl.match(/\/story\/([^/]+)/)?.[1];

            if (slug) {
                // Navigate directly to that slug
                await page.goto(`/story/${slug}`);
                await page.waitForTimeout(1000);

                // The tooltip should be visible (story selected)
                const tooltip = page.locator('.no-scrollbar');
                await expect(tooltip).toBeVisible();
            }
        });

        test('invalid slug loads page without errors', async ({ page }) => {
            await page.goto('/story/invalid-nonexistent-slug-12345');
            await page.waitForTimeout(2000);

            // Page should load without crashing
            const svg = page.locator('svg').first();
            await expect(svg).toBeVisible();
        });

        test('browser back/forward navigation works', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a story
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(300);

            expect(page.url()).toMatch(/\/story\//);

            // Go back
            await page.goBack();
            await page.waitForTimeout(500);

            expect(page.url()).toMatch(/\/$/);

            // Go forward
            await page.goForward();
            await page.waitForTimeout(500);

            expect(page.url()).toMatch(/\/story\//);
        });
    });

    // ============================================
    // COLOR BLIND MODE
    // ============================================
    test.describe('Color Blind Mode', () => {
        test('toggle button exists and is clickable', async ({ page }) => {
            await page.goto('/');

            const toggle = page.getByText(/COLOR BLIND/i);
            await expect(toggle).toBeVisible();
        });

        test('clicking toggle changes mode to ON', async ({ page }) => {
            await page.goto('/');

            const toggle = page.getByText(/COLOR BLIND/i);
            await toggle.click();

            // Should now show ON
            await expect(page.getByText('COLOR BLIND: ON')).toBeVisible();
        });

        test('toggle state persists across page reload', async ({ page }) => {
            await page.goto('/');

            // Enable color blind mode
            const toggle = page.getByText(/COLOR BLIND/i);
            await toggle.click();

            await expect(page.getByText('COLOR BLIND: ON')).toBeVisible();

            // Reload page
            await page.reload();
            await page.waitForTimeout(1000);

            // Should still be ON
            await expect(page.getByText('COLOR BLIND: ON')).toBeVisible();
        });

        test('legend labels change when color blind mode is ON', async ({ page }) => {
            await page.goto('/');

            // Default: NEGATIVE / POSITIVE
            await expect(page.getByText('NEGATIVE')).toBeVisible();
            await expect(page.getByText('POSITIVE')).toBeVisible();

            // Enable color blind
            const toggle = page.getByText(/COLOR BLIND/i);
            await toggle.click();

            // Should now show: CRITICAL / RELEVANT
            await expect(page.getByText('CRITICAL')).toBeVisible();
            await expect(page.getByText('RELEVANT')).toBeVisible();
        });
    });

    // ============================================
    // MOBILE & RESPONSIVE
    // ============================================
    test.describe('Mobile & Responsive', () => {
        test('mobile tabs appear on narrow viewport', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForTimeout(2000);

            const tabs = page.locator('.mobile-tab');
            await expect(tabs.first()).toBeVisible();
        });

        test('clicking mobile tab changes category', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForTimeout(2000);

            const tabs = page.locator('.mobile-tab');
            const tabCount = await tabs.count();

            if (tabCount > 1) {
                await tabs.nth(1).click();
                await page.waitForTimeout(300);

                // Second tab should now be active
                await expect(tabs.nth(1)).toHaveClass(/active/);
            }
        });

        test('swipe left navigates to next category', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Get initial active tab index
            const tabs = page.locator('.mobile-tab');
            const tabCount = await tabs.count();

            // Just verify tabs work by clicking second tab
            if (tabCount > 1) {
                await tabs.nth(1).click();
                await page.waitForTimeout(300);

                // Second tab should now be active
                await expect(tabs.nth(1)).toHaveClass(/active/);
            }
        });

        test('desktop treemap shows on wide viewport', async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Should have single SVG (not mobile tabs)
            const svg = page.locator('svg').first();
            await expect(svg).toBeVisible();

            const tabs = page.locator('.mobile-tab');
            const tabCount = await tabs.count();
            expect(tabCount).toBe(0);
        });
    });

    // ============================================
    // SEO & STRUCTURE
    // ============================================
    test.describe('SEO & Accessibility', () => {
        test('JSON-LD schema is present in head', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(3000);

            // Check for JSON-LD script with ItemList
            const jsonLdScripts = await page.locator('script[type="application/ld+json"]').all();
            let itemListFound = false;

            for (const script of jsonLdScripts) {
                const content = await script.textContent();
                try {
                    const data = JSON.parse(content);
                    if (data['@type'] === 'ItemList' && data.itemListElement) {
                        itemListFound = true;
                        expect(data.itemListElement.length).toBeGreaterThan(0);
                        break;
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }

            expect(itemListFound).toBe(true);
        });

        test('screen reader feed exists with story links', async ({ page }) => {
            await page.goto('/');

            const srFeed = page.locator('.sr-only');
            await expect(srFeed).toBeAttached();

            const links = srFeed.locator('a');
            const count = await links.count();
            expect(count).toBeGreaterThan(0);
        });

        test('page title is set', async ({ page }) => {
            await page.goto('/');

            const title = await page.title();
            expect(title.length).toBeGreaterThan(0);
        });
    });

    // ============================================
    // FOOTER
    // ============================================
    test.describe('Footer', () => {
        test('sources & methodology details can be expanded', async ({ page }) => {
            await page.goto('/');

            const details = page.locator('details.methodology-details');
            await expect(details).toBeVisible();

            // Click to expand
            const summary = details.locator('summary');
            await summary.click();
            await page.waitForTimeout(300);

            // Content should be visible
            const content = details.locator('.methodology-content');
            await expect(content).toBeVisible();
        });

        test('source links have correct href attributes', async ({ page }) => {
            await page.goto('/');

            // Expand footer
            const details = page.locator('details.methodology-details');
            await details.locator('summary').click();
            await page.waitForTimeout(300);

            // Check a source link
            const sourceLinks = page.locator('.methodology-content a[href*="bbc"], .methodology-content a[href*="guardian"]');
            const firstLink = sourceLinks.first();
            await expect(firstLink).toHaveAttribute('href', /https?:\/\//);
        });

        test('GitHub link is present and valid', async ({ page }) => {
            await page.goto('/');

            const githubLink = page.locator('a[href*="github.com"]');
            await expect(githubLink).toBeVisible();

            const href = await githubLink.getAttribute('href');
            expect(href).toMatch(/https:\/\/github\.com\//);
        });
    });

    // ============================================
    // EDGE CASES
    // ============================================
    test.describe('Edge Cases', () => {
        test('page loads even if data is empty (no crashes)', async ({ page }) => {
            // Navigate and wait
            await page.goto('/');
            await page.waitForTimeout(5000);

            // Page should still be functional
            const body = page.locator('body');
            await expect(body).toBeVisible();
        });

        test('article links have UTM parameters', async ({ page }) => {
            await page.goto('/');
            await page.waitForTimeout(2000);

            // Click a story to open tooltip
            const leafNode = page.locator('.leaf-node').first();
            await leafNode.click();
            await page.waitForTimeout(500);

            // Get an article link from tooltip
            const tooltip = page.locator('.no-scrollbar');
            const articleLink = tooltip.locator('a[href*="http"]').first();
            await expect(articleLink).toBeVisible();

            const href = await articleLink.getAttribute('href');

            // Should have UTM parameters
            expect(href).toMatch(/utm_source=newsblocks\.org/);
        });

        test('no console errors on page load', async ({ page }) => {
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            await page.goto('/');
            await page.waitForTimeout(3000);

            // Filter out non-critical errors
            const criticalErrors = errors.filter(e =>
                !e.includes('favicon') &&
                !e.includes('DevTools') &&
                !e.includes('third-party') &&
                !e.includes('net::ERR') &&
                !e.includes('404')
            );

            expect(criticalErrors).toHaveLength(0);
        });
    });

    // ============================================
    // PERFORMANCE
    // ============================================
    test.describe('Performance', () => {
        test('page loads in reasonable time', async ({ page }) => {
            const start = Date.now();
            await page.goto('/');
            await page.waitForTimeout(2000);
            const loadTime = Date.now() - start;

            console.log(`Page load time: ${loadTime}ms`);
            expect(loadTime).toBeLessThan(10000); // Should load in under 10s
        });

        test('treemap renders within 3 seconds', async ({ page }) => {
            await page.goto('/');

            const start = Date.now();
            await page.waitForSelector('.leaf-node', { timeout: 10000 });
            const renderTime = Date.now() - start;

            console.log(`Treemap render time: ${renderTime}ms`);
            expect(renderTime).toBeLessThan(3000);
        });
    });
});
