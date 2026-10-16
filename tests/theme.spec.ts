import { test, expect, type Page } from '@playwright/test';

test.setTimeout(30000);

const baseURL = process.env.BASE_URL || 'http://localhost:8080';

test('nothing burger theme renders post content cleanly', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');

	const postId = await createPostWithMarkdown(page, [
		'# Jazzbb Markdown',
		'- Item one',
		'- [ ] Task item',
		'',
		'```js',
		"console.log('hi');",
		'```',
	]);

	await page.goto(`${baseURL}/?p=${postId}`);

	const articleTitle = page.locator('article h1').first();
	await expect(articleTitle).toHaveText('Jazzbb Theme Post');
	await expect(page.getByText('Jazzbb Markdown')).toBeVisible();

	const paraSize = await page.locator('article p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(paraSize).toBeGreaterThanOrEqual(18);

	const listSize = await page.locator('article li').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(listSize).toBeGreaterThanOrEqual(18);

	const codeBg = await page.locator('article pre').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(codeBg).not.toBe('rgba(0, 0, 0, 0)');
});

test('code blocks render highlighted tokens on frontend', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');

	const postId = await createPostWithMarkdown(page, [
		'```js',
		'const answer = 42;',
		'function add(a, b) { return a + b; }',
		'```',
	]);

	await page.goto(`${baseURL}/?p=${postId}`);
	const token = page.locator('article pre code span').first();
	await expect(token).toHaveClass(/hljs/);
});

test('reading area is about 60% of viewport on frontend', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');

	const postId = await createPostWithMarkdown(page, ['Frontend width check']);
	await page.goto(`${baseURL}/?p=${postId}`);

	const shell = page.locator('.nb-shell');
	const rect = await shell.evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { width: r.width };
	});
	const viewport = await page.evaluate(() => window.innerWidth);
	const ratio = rect.width / viewport;
	expect(ratio).toBeGreaterThan(0.58);
	expect(ratio).toBeLessThan(0.62);
});

test('title is slightly offset left of content', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');

	const postId = await createPostWithMarkdown(page, ['Offset title check']);
	await page.goto(`${baseURL}/?p=${postId}`);

	const titleRect = await page.locator('.nb-title').evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { left: r.left };
	});
	const contentRect = await page.locator('.nb-content').evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { left: r.left };
	});

	const offset = contentRect.left - titleRect.left;
	expect(offset).toBeGreaterThan(100);
	expect(offset).toBeLessThan(140);
});

test('honors dark color scheme preference', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');
	await page.emulateMedia({ colorScheme: 'dark' });

	const postId = await createPostWithMarkdown(page, ['Dark mode check']);
	await page.goto(`${baseURL}/?p=${postId}`);
	const bodyBg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bodyBg).toBe('rgb(17, 20, 24)');
});

test('falls back to light scheme when preferred', async ({ page }) => {
	await login(page);
	await activateThemeIfNeeded(page, 'Nothing Burger');
	await page.emulateMedia({ colorScheme: 'light' });

	const postId = await createPostWithMarkdown(page, ['Light mode check']);
	await page.goto(`${baseURL}/?p=${postId}`);
	const bodyBg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(bodyBg).toBe('rgb(255, 255, 255)');
});

test('header search toggle expands and submits query', async ({ page }) => {
	await page.goto(baseURL);
	const toggle = page.locator('.nb-search-btn');
	await expect(toggle).toBeVisible();
	await toggle.click();
	const input = page.locator('.nb-search-input');
	await expect(input).toBeVisible();
	await input.fill('Jazzbb');
	await input.press('Enter');
	await expect(page).toHaveURL(/s=Jazzbb/);
});

async function login(page: Page) {
	await page.goto('/wp-login.php');
	for (let attempt = 0; attempt < 2; attempt++) {
		if (await page.locator('#user_login').isVisible()) {
			await page.fill('#user_login', 'admin');
			await page.fill('#user_pass', 'admin');
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle' }),
				page.click('#wp-submit'),
			]);
		}
		if (!page.url().includes('wp-login.php')) {
			break;
		}
		await page.waitForTimeout(300);
	}
}

async function activateThemeIfNeeded(page: Page, themeName: string) {
	await page.goto('/wp-admin/themes.php');
	if (page.url().includes('wp-login.php')) {
		await login(page);
		await page.goto('/wp-admin/themes.php');
	}
	await page.waitForLoadState('networkidle');
	await page.waitForSelector('.theme', { timeout: 120000 });
	const themeCard = page.locator('.theme').filter({ hasText: themeName }).first();
	await expect(themeCard).toBeVisible();
	const activate = themeCard.locator('a', { hasText: 'Activate' }).first();
	if (await activate.isVisible()) {
		await activate.click();
		await expect(page.getByText('New theme activated')).toBeVisible();
	}
}

async function createPostWithMarkdown(page: Page, markdownLines: string[]) {
	await page.goto('/wp-admin/post-new.php');
	if (page.url().includes('wp-login.php')) {
		await login(page);
		await page.goto('/wp-admin/post-new.php');
	}
	await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror');
	await page.fill('#title', 'Jazzbb Theme Post');
	const markdown = markdownLines.join('\n');
	await page.evaluate((md) => window.jazzbbWpEditor?.setMarkdown(md), markdown);
	const publish = page.locator('#publish');
	await publish.scrollIntoViewIfNeeded();
	await publish.click({ force: true });
	await page.waitForSelector('#message');
	const postId = new URL(page.url()).searchParams.get('post');
	if (!postId) throw new Error('Post ID not found after publish');
	return postId;
}
