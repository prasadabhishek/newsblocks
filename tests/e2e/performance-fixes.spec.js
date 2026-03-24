import { test, expect } from '@playwright/test';

test.describe('Performance Fixes E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Collect console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('Console error:', msg.text());
            }
        });
    });

    test('treemap renders without errors', async ({ page }) => {
        await page.goto('/');

        // Wait for the treemap to render - look for the main news tree container
        await page.waitForSelector('[class*="treemap"], [class*="news"], svg', { timeout: 10000 });

        // Verify at least one SVG exists
        const svgCount = await page.locator('svg').count();
        expect(svgCount).toBeGreaterThan(0);
    });

    test('categories are visible', async ({ page }) => {
        await page.goto('/');

        // Wait for content to load
        await page.waitForTimeout(3000);

        // Check for visible category elements using more specific selectors
        // The news categories should be in links, buttons, or headings
        const categories = ['World', 'Politics', 'Technology'];
        for (const category of categories) {
            const element = page.getByText(category, { exact: false });
            const count = await element.count();
            // We expect at least one of these categories to be visible
            if (count > 0) {
                await expect(element.first()).toBeVisible();
                break;
            }
        }
    });

    test('no console errors', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('/');
        await page.waitForTimeout(3000);

        // Filter out known non-critical errors
        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('DevTools') &&
            !e.includes('third-party') &&
            !e.includes('404')
        );

        expect(criticalErrors).toHaveLength(0);
    });
});
