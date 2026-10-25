import { test, expect, type Page } from '@playwright/test';

test.setTimeout(60000);

async function openEditor(page: Page) {
	await page.goto('/wp-login.php');
	await page.fill('#user_login', 'admin');
	await page.fill('#user_pass', 'admin');
	await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
	await page.goto('/wp-admin/post-new.php');
	await expect(page.locator('.ProseMirror')).toBeVisible();
}

async function pasteMarkdown(page: Page, markdown: string) {
	await page.locator('.ProseMirror').focus();
	await page.locator('.ProseMirror').evaluate((element, markdown) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', markdown);
		element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
	}, markdown);
}

test('Markdown paste keeps references and inline HTML paired through save and reload', async ({ page }) => {
	await openEditor(page);
	await page.fill('#title', 'Patched Markdown parser');
	await pasteMarkdown(page, [
		'## Parser integration',
		'',
		'[Reference][target] and <strong>inline HTML</strong>.',
		'',
		'[target]: https://example.com/parser "Reference title"',
		'',
		'- [ ] Task survives',
	].join('\n'));
	const surface = page.locator('.ProseMirror');
	await expect(surface.locator('h2')).toHaveText('Parser integration');
	await expect(surface.locator('a')).toHaveAttribute('href', 'https://example.com/parser');
	await expect(surface.locator('strong')).toHaveText('inline HTML');
	await expect(surface.locator('input[type=checkbox]')).not.toBeChecked();
	const markdown = await page.evaluate(() => window.jazzbbWpEditor!.getMarkdown());
	expect(markdown).toContain('https://example.com/parser');
	expect(markdown).toContain('**inline HTML**');
	expect(markdown).toMatch(/\[ \]\s+Task survives/);
	await Promise.all([page.waitForNavigation(), page.locator('#publish').click()]);
	await expect(page.locator('#message')).toBeVisible();
	await page.waitForFunction(() => !!window.jazzbbWpEditor);
	// Native form submission converts textarea line endings to CRLF.
	expect((await page.evaluate(() => window.jazzbbWpData!.markdown)).replace(/\r\n/g, '\n')).toBe(markdown);
	const saved = await page.evaluate(async () => {
		const data = window.jazzbbWpData!;
		const endpoint = new URL(`${data.restUrl}wp/v2/posts/${data.postId}`);
		endpoint.searchParams.set('context', 'edit');
		const response = await fetch(endpoint, { headers: { 'X-WP-Nonce': data.nonce } });
		if (!response.ok) throw new Error(`Saved post request failed: ${response.status}`);
		return response.json();
	});
	expect(saved.meta._jazzbb_markdown.replace(/\r\n/g, '\n')).toBe(markdown);
	expect(saved.content.raw).toContain('<strong>inline HTML</strong>');
	expect(saved.content.raw).toContain('href="https://example.com/parser"');
	expect(saved.content.raw).toContain('id="parser-integration"');
	await expect(surface.locator('strong')).toHaveText('inline HTML');
});

// Upstream regressions: GHSA-vfgh-jcmw-g37q and GHSA-gfr2-rv44-r23c.
// Exercise both the frontend renderer and tiptap-markdown's parser in the
// generated IIFE. Call the parser directly to isolate it from other paste rules;
// actual clipboard/save integration is covered above.
for (const mode of ['render', 'parser'] as const) {
	test(`unterminated HTML and multiline references stay responsive on ${mode}`, async ({ page }) => {
		await openEditor(page);
		const payloads = [
			...['<!--', '<?x', '<!A', '<![CDATA['].map(opener => ({
				name: `inline ${opener}`,
				markdown: 'x ' + opener.repeat(64000),
			})),
			{ name: 'reference title', markdown: '[a]: /u "' + 'x\n'.repeat(200000) },
			{ name: 'reference label', markdown: '[' + 'a\n'.repeat(20000) },
		];
		const timings: Record<string, number> = {};
		for (const { name, markdown } of payloads) {
			await page.evaluate(() => window.jazzbbWpEditor!.setMarkdown(''));
			const start = Date.now();
			if (mode === 'render') {
				await page.evaluate(md => window.jazzbbWpEditor!.setMarkdown(md), markdown);
			} else {
				const html = await page.locator('.ProseMirror').evaluate((element, md) => {
					// Tiptap attaches its instance to the mounted DOM element.
					const { editor } = element as HTMLElement & {
						editor: { storage: { markdown: { parser: { parse: (markdown: string) => string } } } };
					};
					return editor.storage.markdown.parser.parse(md);
				}, markdown);
				expect(html).toContain(name.startsWith('inline') ? '&lt;' : '[a');
			}
			timings[name] = Date.now() - start;
			// Includes browser IPC and rendering/DOM parsing where applicable;
			// allow ample headroom over patched timings without accepting long hangs.
			expect(timings[name], `${name} via ${mode}`).toBeLessThan(5000);
			if (mode === 'render') {
				await expect(page.locator('.ProseMirror')).toContainText(name.startsWith('inline') ? 'x ' : '[a');
			}
		}
		await test.info().attach(`${mode}-timings`, { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
		await page.evaluate(() => window.jazzbbWpEditor!.setMarkdown('Editor still responds'));
		await expect(page.locator('.ProseMirror')).toHaveText('Editor still responds');
	});
}
