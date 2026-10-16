import { chromium } from '@playwright/test';
import fs from 'node:fs';
const baseURL=process.env.BASE_URL || 'http://localhost:8080';
if(process.env.E2E_DISPOSABLE!=='1'||!['localhost','127.0.0.1'].includes(new URL(baseURL).hostname))throw new Error('Use E2E_DISPOSABLE=1 and a disposable loopback site.');
const browser=await chromium.launch();
try {
  const page=await browser.newPage({baseURL,viewport:{width:1500,height:1050},colorScheme:'light'});
  await page.goto('/wp-login.php');
  await page.fill('#user_login','admin');await page.fill('#user_pass','admin');
  await Promise.all([page.waitForURL(/wp-admin/),page.click('#wp-submit')]);
  await page.goto('/wp-admin/post-new.php');await page.waitForFunction(()=>!!window.jazzbbWpEditor);
  await page.fill('#title','A small writing workflow');
  await page.evaluate(()=>window.jazzbbWpEditor.setMarkdown('## A small writing workflow\n\nWrite a note, add structure, and keep the writing in focus.\n\n### Before publishing\n\n- [x] Draft the opening\n- [ ] Add an example\n- [ ] Read it once more\n\n```js\nconst message = "Keep it simple";\nconsole.log(message);\n```\n\n> Save a clear thought before adding another feature.'));
  fs.mkdirSync('docs/images',{recursive:true});
  await page.locator('#jazzbb-wp-editor-root').screenshot({path:'docs/images/editor.png'});
  console.log('Captured synthetic editor example.');
} finally {await browser.close();}
