// Builds the editor into one self-contained HTML file (all JS and CSS inline),
// so it can be shared as a single demo page without a server.
//   node scripts/build-demo-page.mjs [output.html]
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-demo/mwha-builder-demo.html';
execSync('npx vite build apps/editor --config apps/editor/vite.config.ts --outDir ../../dist-demo/build --emptyOutDir', { stdio: 'inherit' });
const assets = join('dist-demo/build/assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const page = `<title>MWHA Website Builder</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${Math.round(page.length / 1024)} KB)`);
