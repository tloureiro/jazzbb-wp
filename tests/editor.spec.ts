import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.setTimeout(30000);

const baseURL = process.env.BASE_URL || 'http://localhost:8080';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('jazzbb-wp saves markdown and HTML with media', async ({ page }) => {
	await login(page);

	await page.goto(`${baseURL}/wp-admin/post-new.php`);
	if (page.url().includes('wp-login.php')) {
		// Session expired; log in once more and try again.
		await login(page);
		await page.goto(`${baseURL}/wp-admin/post-new.php`);
	}

	await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror', { timeout: 90000 });
	await page.waitForFunction(() => !!(window as any).jazzbbWpEditor, undefined, { timeout: 90000 });

	const markdown = [
		'## Jazzbb Markdown',
		'',
		'- Item one',
		'- [ ] Task item',
		'',
		'```js',
		"console.log('hi');",
		'```',
	].join('\n');

	await page.waitForSelector('#title');
	await page.fill('#title', 'Jazzbb WP Test Post');

	await page.evaluate((md) => window.jazzbbWpEditor?.setMarkdown(md), markdown);

	const imagePath = path.join(__dirname, 'fixtures', 'sample.png');
	const buffer = fs.readFileSync(imagePath);

	const dataTransfer = await page.evaluateHandle((fileBytes) => {
		const dt = new DataTransfer();
		const bytes = Uint8Array.from(fileBytes as number[]);
		const file = new File([bytes], 'sample.png', { type: 'image/png' });
		dt.items.add(file);
		return dt;
	}, Array.from(buffer));

	const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
	await editor.dispatchEvent('drop', { dataTransfer });
	await page.waitForSelector('.jazzbb-wp-editor-surface img', { timeout: 120000 });

	const publish = page.locator('#publish');
	await publish.scrollIntoViewIfNeeded();
	await publish.click({ force: true });
	await page.waitForSelector('#message');

	const postId = new URL(page.url()).searchParams.get('post');
	expect(postId).toBeTruthy();

	const json = await page.evaluate(async (id) => {
		const restBase =
			(window as any).jazzbbWpData?.restUrl ||
			`${window.location.origin}/index.php?rest_route=/`;
		const res = await fetch(`${restBase}wp/v2/posts/${id}`, {
			credentials: 'include',
			headers: { 'X-WP-Nonce': window.jazzbbWpData?.nonce || '' },
		});
		const text = await res.text();
		try {
			return JSON.parse(text);
		} catch (error) {
			return { error: text, status: res.status };
		}
	}, postId);

	const savedMarkdown =
		json?.meta?._jazzbb_markdown ??
		json?.meta?.['_jazzbb_markdown'] ??
		json?.meta?.jazzbb_markdown ??
		'';

	expect(savedMarkdown).toContain('Jazzbb Markdown');
	expect(json.content.rendered).toContain('<h2');
	expect(json.content.rendered).toContain('Jazzbb Markdown');
	expect(json.content.rendered).toContain('<img');
});

async function login(page: Page) {
	await page.goto(`${baseURL}/wp-login.php`);

	if (page.url().includes('install.php')) {
		throw new Error('WordPress is not installed. Run scripts/wp-setup.sh first.');
	}

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
