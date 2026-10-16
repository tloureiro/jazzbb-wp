import { test, expect, type Page } from '@playwright/test';

test.setTimeout(30000);

const IS_MAC = process.platform === 'darwin';
const MOD_KEY = IS_MAC ? 'Meta' : 'Control';
const UNDO_SHORTCUT = `${MOD_KEY}+KeyZ`;
const REDO_SHORTCUT = IS_MAC ? 'Shift+Meta+KeyZ' : 'Control+KeyY';

test.describe('Ported jazzbb editor behaviours', () => {
	test.beforeEach(async ({ page }) => {
		await loginAndOpenEditor(page);
		await setMarkdown(page, '');
	});

	test('types plain paragraph', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('Hello world!');
		await expect(editor).toContainText('Hello world!');
	});

	test('backspace removes characters', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('Hello!');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await expect(editor).toContainText('Hell');
		await expect(editor).not.toContainText('!');
	});

	test('undo and redo restore changes', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('Draft note');
		await page.keyboard.press(UNDO_SHORTCUT);
		await expect(editor).not.toContainText('Draft note');
		await page.keyboard.press(REDO_SHORTCUT);
		await expect(editor).toContainText('Draft note');
	});

	test('select all then replace text', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('Old content');
		await page.keyboard.press(`${MOD_KEY}+KeyA`);
		await page.keyboard.type('New note');
		const html = await editor.evaluate((node) => node.innerHTML);
		expect(html).toContain('New note');
		expect(html).not.toContain('Old content');
	});

	test('bold shortcut wraps selection', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.press(`${MOD_KEY}+KeyB`);
		await page.keyboard.type('Bold');
		await page.keyboard.press(`${MOD_KEY}+KeyB`);
		const html = await editor.evaluate((node) => node.innerHTML);
		expect(html).toContain('<strong>Bold</strong>');
	});

	test('hyphen creates list items', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('- item');
		await page.keyboard.press('Enter');
		await page.keyboard.type('next');
		// Wait for the input rule to transform into a list before asserting.
		await expect(editor.locator('ul li')).toHaveCount(2, { timeout: 6000 });
		const html = await editor.evaluate((node) => node.innerHTML);
		expect(html).toContain('<ul');
		expect(html).toContain('<li><p>item</p></li>');
		expect(html).toContain('<li><p>next</p></li>');
	});

	test('enter splits paragraphs', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await page.keyboard.type('Line one');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line two');
		const html = await editor.evaluate((node) => node.innerHTML);
		expect(html).toContain('<p>Line one</p>');
		expect(html).toContain('<p>Line two</p>');
	});

	test('pasting markdown heading renders heading', async ({ page }) => {
		const editor = page.locator('.jazzbb-wp-editor-surface .ProseMirror');
		await editor.click();
		await simulatePlainPaste(page, '### This is going to be the first');
		const html = await editor.evaluate((node) => node.innerHTML);
		expect(html).toContain('<h3>');
		expect(html).not.toContain('###');
	});

	test('markdown renders fenced code block', async ({ page }) => {
		await setMarkdown(
			page,
			['```js', 'const answer = 42;', 'console.log(answer);', '```'].join('\n')
		);
		const code = page.locator('.jazzbb-wp-editor-surface pre code');
		await expect(code).toHaveClass(/language-js/);
		await expect(code).toContainText('answer = 42');
	});

	test('markdown renders image and link', async ({ page }) => {
		await setMarkdown(page, 'See [docs](https://example.com) ![Diagram](https://example.com/diagram.png)');
		const anchor = page.locator('.jazzbb-wp-editor-surface a');
		await expect(anchor).toHaveAttribute('href', 'https://example.com');
		const img = page.locator('.jazzbb-wp-editor-surface img');
		await expect(img).toHaveAttribute('src', /diagram\.png/);
	});
});

async function loginAndOpenEditor(page: Page) {
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
	}

	await page.goto('/wp-admin/post-new.php');
	if (page.url().includes('wp-login.php')) {
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

async function setMarkdown(page: Page, markdown: string) {
	await page.evaluate((md) => window.jazzbbWpEditor?.setMarkdown(md), markdown);
}

async function simulatePlainPaste(page: Page, text: string) {
	await page.waitForSelector('.jazzbb-wp-editor-surface .ProseMirror');
	await page.evaluate((value) => {
		const editor = document.querySelector('.jazzbb-wp-editor-surface .ProseMirror');
		if (!(editor instanceof HTMLElement)) {
			throw new Error('Editor element not found');
		}
		const data = new DataTransfer();
		data.setData('text/plain', value);
		const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', {
			value: data,
		});
		editor.dispatchEvent(event);
	}, text);
}
