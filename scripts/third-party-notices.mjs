import fs from 'node:fs';
import path from 'node:path';
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const blocks=['# Third-party notices\n\nGenerated from the installed production dependency tree and package-lock.json.\nProject code is GPL-2.0-or-later; dependency terms and copyright notices follow.\nDevelopment tools, WordPress, MySQL and Docker images are separate dependencies.\nRegenerate with `npm run notices` after dependency changes.\n'];
for(const [location,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
  if(!location||entry.dev)continue;
  const root=path.resolve(location);
  if(!fs.existsSync(path.join(root,'package.json')))continue;
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const licenses=fs.readdirSync(root).filter(name=>/^(licen[cs]e|copying|notice)([.\-_].*)?$/i.test(name)&&fs.statSync(path.join(root,name)).isFile());
  if(!licenses.length)throw new Error(`No license text found for ${pkg.name}; review manually.`);
  blocks.push(`## ${pkg.name} ${pkg.version}\n\nDeclared license: ${pkg.license || 'not declared'}\n`);
  for(const name of licenses)blocks.push(`\n### ${name}\n\n\`\`\`text\n${fs.readFileSync(path.join(root,name),'utf8').trim()}\n\`\`\`\n`);
}
fs.writeFileSync('THIRD_PARTY_NOTICES.md',blocks.join('\n'));
console.log('Updated THIRD_PARTY_NOTICES.md from production dependencies.');
