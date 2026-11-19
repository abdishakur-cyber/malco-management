import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';

const names = ['index.html', 'app.js', 'style.css', 'godol-logo.svg'];
const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [
  name, await readFile(new URL('../web/' + name, import.meta.url), 'utf8')
])));
assets['salaam-bank.jpg'] = await readFile(new URL('../web/salaam-bank.jpg', import.meta.url), 'base64');
const demo = await readFile(new URL('../worker/demo.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
await mkdir('dist/server', {recursive:true});
await mkdir('dist/.openai', {recursive:true});
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + ';\n' + demo.replace('export {makeDemoRecords, diversifyDemoEmployees};', '') + worker.replace("import {makeDemoRecords, diversifyDemoEmployees} from './demo.js';", ''));
