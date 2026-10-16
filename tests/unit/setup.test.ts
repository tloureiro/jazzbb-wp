import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('setup preserves installations, fails activation, and bounds readiness', () => {
  const root=mkdtempSync(path.join(tmpdir(),'jazzbb-setup-test-'));
  try {
    for(const dir of ['scripts','plugin/build','bin']) mkdirSync(path.join(root,dir),{recursive:true});
    copyFileSync(new URL('../../scripts/wp-setup.sh',import.meta.url),path.join(root,'scripts/wp-setup.sh'));
    for(const name of ['admin.js','admin.css']) writeFileSync(path.join(root,'plugin/build',name),'fixture');
    writeFileSync(path.join(root,'bin/docker'),`#!/usr/bin/env node
const fs=require('node:fs'); const args=process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.DOCKER_LOG,args+'\\n');
if(args.includes('exec -T db')&&process.env.NEVER_READY==='1')process.exit(1);
if(args.includes('core is-installed'))process.exit(process.env.INSTALLED==='1'?0:1);
if(args.includes('plugin activate')&&process.env.FAIL_ACTIVATE==='1')process.exit(17);
if(args.includes('core install')&&process.env.FAIL_INSTALL==='1')process.exit(19);
`,{mode:0o755});
    const run=(extra:Record<string,string>)=> {
      writeFileSync(path.join(root,'calls'),'');
      const result=spawnSync('bash',['scripts/wp-setup.sh'],{cwd:root,env:{...process.env,PATH:path.join(root,'bin')+path.delimiter+process.env.PATH,DOCKER_LOG:path.join(root,'calls'),WP_READY_TIMEOUT:'1',...extra},encoding:'utf8',timeout:10000});
      return {...result,calls:readFileSync(path.join(root,'calls'),'utf8')};
    };
    const retained=run({INSTALLED:'1'});assert.equal(retained.status,0);assert.doesNotMatch(retained.calls,/core install/);
    const activated=run({FAIL_ACTIVATE:'1'});assert.equal(activated.status,17);assert.doesNotMatch(activated.calls,/theme activate/);
    const installed=run({FAIL_INSTALL:'1'});assert.equal(installed.status,19);assert.doesNotMatch(installed.calls,/plugin activate/);
    const waited=run({NEVER_READY:'1'});assert.equal(waited.status,1);assert.match(waited.stderr,/timed out/);
    const invalid=run({WP_PORT:'0'});assert.equal(invalid.status,1);assert.equal(invalid.calls,'');
  } finally {rmSync(root,{recursive:true,force:true});}
});
