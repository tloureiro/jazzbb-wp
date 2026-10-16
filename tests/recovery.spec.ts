import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

test.setTimeout(45000);

async function openEditor(page: Page) {
  await page.goto('/wp-login.php');
  await page.fill('#user_login', 'admin');
  await page.fill('#user_pass', 'admin');
  await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
  await page.goto('/wp-admin/post-new.php');
  await expect(page.locator('.ProseMirror')).toBeVisible();
}
async function save(page: Page, markdown: string, title = 'Recovery example') {
  await page.fill('#title', title);
  await page.evaluate(md => window.jazzbbWpEditor!.setMarkdown(md), markdown);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}), page.locator('#publish').click()]);
  await expect(page.locator('#message')).toBeVisible();
  await page.waitForFunction(() => !!window.jazzbbWpEditor);
  return Number(new URL(page.url()).searchParams.get('post'));
}

test('reload offers explicit restore/discard and preserves other posts and core backups', async ({ page }) => {
  await openEditor(page);
  await save(page, 'Saved text');
  const key = await page.evaluate(() => {
    const data = window.jazzbbWpData!;
    const key = `jazzbb-wp:draft:${data.userId}:${data.postId}`;
    localStorage.setItem('wp-autosave-12', 'core backup');
    localStorage.setItem(key + '2', JSON.stringify({markdown:'another post'}));
    return key;
  });
  await page.evaluate(() => window.jazzbbWpEditor!.setMarkdown('Unsaved text'));
  await page.reload();
  await expect(page.locator('.jazzbb-wp-recovery')).toBeVisible();
  await expect(page.locator('.ProseMirror')).toHaveText('Saved text');
  await page.getByRole('button', {name:'Restore draft', exact:true}).click();
  await expect(page.locator('.ProseMirror')).toHaveText('Unsaved text');
  await page.reload();
  await page.getByRole('button', {name:'Discard draft', exact:true}).click();
  await expect(page.locator('.ProseMirror')).toHaveText('Saved text');
  expect(await page.evaluate(key => ({draft:localStorage.getItem(key), other:localStorage.getItem(key+'2'), core:localStorage.getItem('wp-autosave-12')}), key))
    .toEqual({draft:null, other:JSON.stringify({markdown:'another post'}), core:'core backup'});
});

test('empty unsaved draft can be restored, saved and reloaded', async ({ page }) => {
  await openEditor(page);
  await save(page, 'Before clearing');
  await page.evaluate(() => window.jazzbbWpEditor!.setMarkdown(''));
  await page.reload();
  await page.getByRole('button', {name:'Restore draft', exact:true}).click();
  await expect(page.locator('.ProseMirror')).toHaveText('');
  await save(page, '');
  await expect(page.locator('.jazzbb-wp-recovery')).toHaveCount(0);
  expect(await page.evaluate(() => window.jazzbbWpData!.markdown)).toBe('');
});

test('blocked local storage leaves an editable surface and a visible warning', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {get() {throw new DOMException('Blocked','SecurityError');}});
  });
  await openEditor(page);
  await page.locator('.ProseMirror').fill('Still editable');
  await expect(page.locator('.jazzbb-wp-status')).toContainText('Local recovery unavailable');
  await save(page, 'Still editable');
  await expect(page.locator('.ProseMirror')).toHaveText('Still editable');
});

test('revisions restore matching Markdown and HTML after a real form update', async ({ page }) => {
  await openEditor(page);
  const id = await save(page, '## First revision\n\nFirst text');
  await save(page, '## Second revision\n\nSecond text');
  const revisions = await page.evaluate(async id => {
    const data = window.jazzbbWpData!;
    const endpoint = new URL(`${data.restUrl}wp/v2/posts/${id}/revisions`);
    endpoint.searchParams.set('context', 'edit');
    const response = await fetch(endpoint, {headers:{'X-WP-Nonce':data.nonce}});
    if (!response.ok) throw new Error(`Revision request failed: ${response.status}`);
    return response.json();
  }, id);
  const first = revisions.find((revision: any) => revision.content.raw.includes('First text'));
  expect(first).toBeTruthy();
  await page.goto(`/wp-admin/revision.php?revision=${first.id}`);
  await page.getByRole('button', {name:'Restore This Revision',exact:true}).click();
  await expect(page.locator('.ProseMirror')).toContainText('First text');
  expect(await page.evaluate(() => window.jazzbbWpData!.markdown)).toContain('First revision');
  expect(await page.locator('#content').inputValue()).toContain('First text');
});

test('failed upload is visible and preserves current text', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => window.jazzbbWpEditor!.setMarkdown('Preserve this draft'));
  await page.route('**/wp/v2/media*', route => route.fulfill({status:500,contentType:'application/json',body:'{"message":"Synthetic failure"}'}));
  const transfer = await page.evaluateHandle(() => {
    const dt=new DataTransfer();dt.items.add(new File(['fake image'],'example.png',{type:'image/png'}));return dt;
  });
  await page.locator('.ProseMirror').dispatchEvent('drop',{dataTransfer:transfer});
  await expect(page.locator('.jazzbb-wp-status')).toHaveText('Upload failed');
  await expect(page.locator('.ProseMirror')).toHaveText('Preserve this draft');
});

test('unsafe iframe scheme is rejected without changing the draft', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    window.jazzbbWpEditor!.setMarkdown('Keep text');
    window.jazzbbWpEditor!.insertIframe('<iframe src="javascript:alert(1)"></iframe>');
  });
  await expect(page.locator('.ProseMirror iframe')).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveText('Keep text');
});

test('failed script keeps native content visible and blocks a mismatched Markdown save', async ({ page }) => {
  await openEditor(page);
  const id = await save(page, 'Preserved Markdown');
  await page.route('**/plugins/jazzbb-wp/build/admin.js*', route => route.abort());
  await page.reload();
  await expect(page.locator('#postdivrich')).toBeVisible();
  await expect(page.locator('#jazzbb-wp-markdown')).toBeDisabled();
  await Promise.all([page.waitForNavigation(),page.locator('#publish').click()]);
  await expect(page.locator('body')).toContainText('The Markdown editor was not ready');
  await page.unroute('**/plugins/jazzbb-wp/build/admin.js*');
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  await expect(page.locator('.ProseMirror')).toHaveText('Preserved Markdown');
});

test('legacy HTML stays in the native editor without Markdown fields', async ({ page }) => {
  await openEditor(page);
  const id = await page.evaluate(async () => {
    const data=window.jazzbbWpData!;
    const response=await fetch(`${data.restUrl}wp/v2/posts`,{method:'POST',headers:{'X-WP-Nonce':data.nonce,'Content-Type':'application/json'},body:JSON.stringify({title:'Existing HTML example',content:'<p>Keep legacy content</p>',status:'draft'})});
    if(!response.ok)throw new Error('Synthetic post creation failed');
    return (await response.json()).id;
  });
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  await expect(page.locator('#jazzbb-wp-editor-root')).toHaveCount(0);
  const welcome=page.getByRole('dialog',{name:'Welcome to the editor'});
  if(await welcome.isVisible())await welcome.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.frameLocator('iframe[name="editor-canvas"]').getByText('Keep legacy content')).toBeVisible();
  // The canonical server content remains unchanged by merely opening the post.
  const content=await page.evaluate(async id => {
    const endpoint=new URL(`${location.origin}/index.php`);endpoint.searchParams.set('rest_route',`/wp/v2/posts/${id}`);endpoint.searchParams.set('context','edit');
    const response=await fetch(endpoint,{headers:{'X-WP-Nonce':(window as any).wpApiSettings.nonce}});
    return (await response.json()).content.raw;
  },id);
  expect(content).toBe('<p>Keep legacy content</p>');
});

test('restoring an empty revision clears both representations', async ({ page }) => {
  await openEditor(page);
  const id=await save(page,'');
  await save(page,'Content added later');
  const revisions=await page.evaluate(async id=>{
    const data=window.jazzbbWpData!;const endpoint=new URL(`${data.restUrl}wp/v2/posts/${id}/revisions`);endpoint.searchParams.set('context','edit');
    const response=await fetch(endpoint,{headers:{'X-WP-Nonce':data.nonce}});return response.json();
  },id);
  const empty=revisions.find((revision:any)=>revision.content.raw==='');expect(empty).toBeTruthy();
  await page.goto(`/wp-admin/revision.php?revision=${empty.id}`);
  await page.getByRole('button',{name:'Restore This Revision',exact:true}).click();
  await expect(page.locator('.ProseMirror')).toHaveText('');
  expect(await page.evaluate(()=>window.jazzbbWpData!.markdown)).toBe('');
});

test('missing bundle leaves saved content visible and cannot overwrite Markdown', async ({ page }) => {
  await openEditor(page);
  const id=await save(page,'Keep the saved content');
  const asset=new URL('../plugin/build/admin.js',import.meta.url);
  const parked=new URL('../plugin/build/admin.js.test-backup',import.meta.url);
  fs.renameSync(asset,parked);
  try {
    expect(fs.existsSync(asset)).toBe(false);
    // Docker Desktop file sharing converges asynchronously after a host rename.
    // WordPress may render a missing path after canonicalizing it, rather than 404.
    await expect.poll(async () => {
      const response=await page.request.get('/wp-content/plugins/jazzbb-wp/build/admin.js?fixture=missing');
      return response.headers()['content-type'] || '';
    }).not.toContain('javascript');
    await page.reload();
    await expect(page.locator('#jazzbb-wp-editor-root')).toHaveCount(0);
    await expect(page.locator('#postdivrich')).toBeVisible();
    await expect(page.locator('.notice-warning')).toContainText('assets are missing');
    await Promise.all([page.waitForNavigation(),page.locator('#publish').click()]);
    await expect(page.locator('body')).toContainText('The Markdown editor was not ready');
  } finally {fs.renameSync(parked,asset);}
  await expect.poll(async () => {
    const response=await page.request.get('/wp-content/plugins/jazzbb-wp/build/admin.js?fixture=restored');
    return response.headers()['content-type'] || '';
  }).toContain('javascript');
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  await expect(page.locator('.ProseMirror')).toHaveText('Keep the saved content');
});
