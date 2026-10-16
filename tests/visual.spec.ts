import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.setTimeout(30000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('visual scenarios', () => {
	test.beforeEach(async ({ page }) => {
		await loginAndOpenEditor(page);
		await neutralizeInterferingUi(page);
	});

	test('renders headings, blockquote, lists, and formatting', async ({ page }) => {
		await setMarkdown(page, ['# Title', '', '> Quoted line', '', '- **Bold item**', '- normal item', '', '1. first', '2. second'].join('\n'));

		await expect(page.locator('.jazzbb-wp-editor-surface h1')).toHaveText('Title');
		await expect(page.locator('.jazzbb-wp-editor-surface blockquote')).toContainText('Quoted line');
		await expect(page.locator('.jazzbb-wp-editor-surface ul li')).toHaveCount(2);
		await expect(page.locator('.jazzbb-wp-editor-surface ol li')).toHaveCount(2);
	});

	test('reading area is about 60% of viewport', async ({ page }) => {
		const shell = page.locator('.jazzbb-wp-shell');
		const rect = await shell.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return { width: r.width };
		});
		const viewport = await page.evaluate(() => window.innerWidth);
		const ratio = rect.width / viewport;
		expect(ratio).toBeGreaterThan(0.57);
		expect(ratio).toBeLessThan(0.64);
	});

	test('heading hierarchy shows decreasing sizes', async ({ page }) => {
		await setMarkdown(page, ['# H1', '## H2', '### H3'].join('\n'));
		const sizes = await page
			.locator('.jazzbb-wp-editor-surface h1, .jazzbb-wp-editor-surface h2, .jazzbb-wp-editor-surface h3')
			.evaluateAll((nodes) =>
				nodes.map((n) => ({
					tag: n.tagName,
					size: parseFloat(getComputedStyle(n).fontSize),
				}))
			);
		expect(sizes.find((s) => s.tag === 'H1')?.size || 0).toBeGreaterThan(sizes.find((s) => s.tag === 'H2')?.size || 0);
		expect(sizes.find((s) => s.tag === 'H2')?.size || 0).toBeGreaterThan(sizes.find((s) => s.tag === 'H3')?.size || 0);
	});

	test('task list toggles reflect in markdown', async ({ page }) => {
		await setMarkdown(page, ['- [ ] first task', '- [ ] second task'].join('\n'));

		const first = page.locator('.jazzbb-wp-editor-surface input[type=checkbox]').first();
		await first.click();

		const md = await page.evaluate(() => window.jazzbbWpEditor?.getMarkdown() || '');
		expect(md).toContain('- [x] first task');
		expect(md).toContain('- [ ] second task');
	});

	test('table creation and cell editing', async ({ page }) => {
		await clickToolbar(page, 'Table');

		const cells = page.locator('.jazzbb-wp-editor-surface table td');
		await expect(cells).toHaveCount(6); // 2 rows body + 1 header row by default (3x2)

		// Hide the right sidebar to avoid hitbox interference when clicking cells.
		await page.evaluate(() => {
			const side = document.getElementById('postbox-container-1');
			if (side) side.style.display = 'none';
		});

		await cells.nth(0).click();
		await page.keyboard.type('Alpha');
		await cells.nth(4).scrollIntoViewIfNeeded();
		await cells.nth(4).click();
		await page.keyboard.type('Omega');

		await expect(cells.nth(0)).toContainText('Alpha', { timeout: 3000 });
		await expect(cells.nth(4)).toContainText('Omega', { timeout: 3000 });
	});

	test('code block keeps language class', async ({ page }) => {
		await setMarkdown(page, ['```js', 'console.log("hi");', '```'].join('\n'));
		const pre = page.locator('.jazzbb-wp-editor-surface pre').first();
		const code = page.locator('.jazzbb-wp-editor-surface pre code');
		await expect(code).toHaveClass(/language-js/);
		await expect(code).toContainText('console.log("hi");');
		const bg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(bg).not.toBe('rgba(0, 0, 0, 0)');
	});

	test('code block padding is tight (no extra bottom space)', async ({ page }) => {
		await setMarkdown(page, ['```js', 'let x = 1;', '```'].join('\n'));
		const pre = page.locator('.jazzbb-wp-editor-surface pre').first();
		const height = await pre.evaluate((el) => el.getBoundingClientRect().height);
		expect(height).toBeLessThan(120);
	});

	test('code block highlights tokens in editor', async ({ page }) => {
		await setMarkdown(
			page,
			['```js', 'const answer = 42;', 'function add(a, b) { return a + b; }', '```'].join('\n')
		);
		const token = page.locator('.jazzbb-wp-editor-surface pre code span').first();
		await expect(token).toHaveClass(/hljs/);
	});

	test('link markup renders anchor', async ({ page }) => {
		await setMarkdown(page, 'This is a [link](https://example.com) inline.');
		const anchor = page.locator('.jazzbb-wp-editor-surface a');
		await expect(anchor).toHaveAttribute('href', 'https://example.com');
		await expect(anchor).toHaveText('link');
	});

	test('image drag-drop uploads and renders', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.waitFor({ state: 'visible' });

		const imagePath = path.join(__dirname, 'fixtures', 'sample.png');
		const buffer = fs.readFileSync(imagePath);

		const dataTransfer = await page.evaluateHandle((fileBytes) => {
			const dt = new DataTransfer();
			const bytes = Uint8Array.from(fileBytes as number[]);
			const file = new File([bytes], 'sample.png', { type: 'image/png' });
			dt.items.add(file);
			return dt;
		}, Array.from(buffer));

		await editor.dispatchEvent('drop', { dataTransfer });
		const img = page.locator('.jazzbb-wp-editor-surface img');
		await expect(img).toBeVisible();

		const md = await page.evaluate(() => window.jazzbbWpEditor?.getMarkdown() || '');
		expect(md).toMatch(/!\[.*\]\(http.*sample/);
	});

	test('iframe embeds render inside the editor', async ({ page }) => {
		const iframeHtml =
			'<iframe width="560" height="315" src="https://www.youtube.com/embed/EXAMPLEONLY?si=embed" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
		await simulateIframePaste(page, iframeHtml);
		const iframe = page.locator('.jazzbb-wp-editor-surface iframe');
		await expect(iframe).toHaveAttribute('src', /youtube\.com\/embed/);
		const html = await page.evaluate(() => window.jazzbbWpEditor?.getHTML() || '');
		expect(html).toContain('<iframe');
	});

	test('iframe helper converts YouTube watch URLs to embeds', async ({ page }) => {
		await page.evaluate(() =>
			window.jazzbbWpEditor?.insertIframe('https://www.youtube.com/watch?v=EXAMPLEONLY&start=30')
		);
		const iframe = page.locator('.jazzbb-wp-editor-surface iframe');
		await expect(iframe).toHaveAttribute('src', /youtube\.com\/embed\/EXAMPLEONLY/);
		await expect(iframe).toHaveAttribute('src', /start=30/);
		const html = await page.evaluate(() => window.jazzbbWpEditor?.getHTML() || '');
		expect(html).toContain('<iframe');
	});

	test('inline bold/italic/code render together', async ({ page }) => {
		await setMarkdown(page, 'Mix **bold** and *italic* with `code` snippets.');
		await expect(page.locator('.jazzbb-wp-editor-surface strong')).toHaveText('bold');
		await expect(page.locator('.jazzbb-wp-editor-surface em')).toHaveText('italic');
		await expect(page.locator('.jazzbb-wp-editor-surface code')).toHaveText('code');
	});

	test('nested lists preserve structure', async ({ page }) => {
		await setMarkdown(
			page,
			['- Parent', '  - Child A', '  - Child B', '- Sibling', '  1. Numbered child', '  2. Numbered child 2'].join('\n')
		);

		await expect(page.locator('.jazzbb-wp-editor-surface ul li ul li')).toHaveCount(2);
		await expect(page.locator('.jazzbb-wp-editor-surface ul li ol li')).toHaveCount(2);
	});

	test('horizontal rule and headings render on save', async ({ page }) => {
		await setMarkdown(page, ['Heading above', '', '---', '', '## Subheading below'].join('\n'));
		const html = await page.evaluate(() => window.jazzbbWpEditor?.getHTML() || '');
		expect(html).toContain('<hr');
		await expect(page.locator('.jazzbb-wp-editor-surface h2')).toHaveText('Subheading below');
	});

	test('outline shows headings and respects hierarchy', async ({ page }) => {
		await setMarkdown(page, ['# H1 title', '## H2 title', '### H3 title'].join('\n'));
		const items = page.locator('.jazzbb-wp-outline-item');
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toContainText('H1 title');
		await expect(items.nth(1)).toContainText('H2 title');
		await expect(items.nth(2)).toContainText('H3 title');

		// Click H2 to ensure navigation hook is wired (no error) and IDs are present on headings.
		const h2Button = items.nth(1).locator('button');
		await h2Button.scrollIntoViewIfNeeded();
		await h2Button.click({ force: true });
		const ids = await page
			.locator('.jazzbb-wp-editor-surface h1, .jazzbb-wp-editor-surface h2, .jazzbb-wp-editor-surface h3')
			.evaluateAll((nodes) => nodes.map((n) => n.id));
		expect(ids).toEqual(['h1-title', 'h2-title', 'h3-title']);
	});

	test('hidden fields stay in sync on submit', async ({ page }) => {
		const markdown = ['## Sync Check', '', '- Item A', '- Item B'].join('\n');
		await page.fill('#title', 'Sync Post');
		await setMarkdown(page, markdown);
		await page.waitForTimeout(200);
		const publish = page.locator('#publish');
		await publish.scrollIntoViewIfNeeded();
		await publish.click({ force: true });
		await page.waitForSelector('#message');

		const hidden = await page.evaluate(async () => {
			const md = (document.querySelector('#jazzbb-wp-markdown') as HTMLTextAreaElement)?.value || '';
			const html = (document.querySelector('#jazzbb-wp-html') as HTMLTextAreaElement)?.value || '';
			const content = (document.querySelector('#content') as HTMLTextAreaElement)?.value || '';

			const postId = new URLSearchParams(window.location.search).get('post');
			const restBase =
				(window as any).jazzbbWpData?.restUrl ||
				`${window.location.origin}/index.php?rest_route=/`;
			let meta = '';
			if (postId) {
				const res = await fetch(`${restBase}wp/v2/posts/${postId}`, { credentials: 'include', headers: { 'X-WP-Nonce': window.jazzbbWpData?.nonce || '' } });
				const text = await res.text();
				try {
					const json = JSON.parse(text);
					meta =
						json?.meta?._jazzbb_markdown ??
						json?.meta?.['_jazzbb_markdown'] ??
						json?.meta?.jazzbb_markdown ??
						'';
				} catch (error) {
					meta = text;
				}
			}

			return { md, html, content, meta };
		});

		expect(hidden.md).toContain('Sync Check');
		expect(hidden.html).toContain('<h2');
		expect(hidden.html).toContain('Sync Check');
		expect(hidden.content).toContain('<ul>');
		expect(hidden.meta).toContain('Sync Check');
	});
});

async function loginAndOpenEditor(page: import('@playwright/test').Page) {
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
		if (!page.url().includes('wp-login.php')) break;
	}

	await page.goto('/wp-admin/post-new.php');
	if (page.url().includes('wp-login.php')) {
		// Session expired or redirect back to login; retry once.
		await page.goto('/wp-login.php');
		if (await page.locator('#user_login').isVisible()) {
			await page.fill('#user_login', 'admin');
			await page.fill('#user_pass', 'admin');
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle' }),
				page.click('#wp-submit'),
			]);
		}
		await page.goto('/wp-admin/post-new.php');
	}

	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(200);
	try {
		await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror', { timeout: 90000 });
	} catch (error) {
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror', { timeout: 90000 });
	}
	await page.waitForFunction(() => !!(window as any).jazzbbWpEditor, undefined, { timeout: 90000 });
}

async function setMarkdown(page: import('@playwright/test').Page, markdown: string) {
	await page.evaluate((md) => window.jazzbbWpEditor?.setMarkdown(md), markdown);
}

async function clickToolbar(page: import('@playwright/test').Page, label: string) {
	const button = page.getByRole('button', { name: label });
	await button.click();
}

async function neutralizeInterferingUi(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		document.querySelectorAll('.order-higher-indicator, .order-lower-indicator').forEach((el) => {
			(el as HTMLElement).style.pointerEvents = 'none';
		});
		const adminbar = document.getElementById('wpadminbar');
		if (adminbar) adminbar.style.zIndex = '0';
	});
}

async function simulateIframePaste(page: import('@playwright/test').Page, html: string) {
	await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror');
	await page.evaluate((value) => {
		const editor = document.querySelector('.jazzbb-wp-editor-surface .ProseMirror');
		if (!(editor instanceof HTMLElement)) {
			throw new Error('Editor element not found');
		}
		const data = new DataTransfer();
		data.setData('text/plain', value);
		data.setData('text/html', value);
		const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', {
			value: data,
		});
		editor.dispatchEvent(event);
	}, html);
}
