const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'prototype');
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

// Inline after combining sources so runtime JS-template images work via file://.
function inlineImages(html, directory = source) {
  const cache = new Map();
  return html.replace(/(?:\.\/)?assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg|gif)/gi, reference => {
    if (cache.has(reference)) return cache.get(reference);
    const target = path.resolve(directory, reference), assetRoot = path.resolve(directory, 'assets') + path.sep;
    if (!target.startsWith(assetRoot)) throw new Error('Asset path escapes assets directory: ' + reference);
    if (!fs.existsSync(target)) throw new Error('Missing image asset: ' + reference);
    const data = `data:${IMAGE_TYPES[path.extname(target).toLowerCase()]};base64,${fs.readFileSync(target).toString('base64')}`;
    cache.set(reference, data); return data;
  });
}
function buildStandalone() {
  const read = file => fs.readFileSync(path.join(source, file), 'utf8');
  let html = read('index.html').replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}\n</style>`);
  for (const file of ['data/points.js', 'data/seed.js', 'admin.js', 'app.js']) {
    html = html.replace(`<script src="${file}"></script>`, () => `<script>\n${read(file).replace(/<\/script/gi, '<\\/script')}\n</script>`);
  }
  return inlineImages(html);
}
if (require.main === module) {
  const html = buildStandalone(), size = Buffer.byteLength(html);
  for (const destination of ['outputs/campus-helper-demo.html', 'dist/index.html']) {
    const target = path.join(root, destination); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, html);
    console.log(`Built ${destination} (${(size / 1024 / 1024).toFixed(2)} MB; ${Math.round(size / 1024)} KB)`);
  }
  if (size > 2 * 1024 * 1024) console.warn('Warning: standalone HTML exceeds 2 MB; consider compressing image assets.');
}
module.exports = { inlineImages, buildStandalone };
