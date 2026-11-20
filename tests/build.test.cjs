const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inlineImages } = require('../scripts/build.cjs');
test('single-file images inline in HTML, CSS and runtime JS without external references', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-inline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'sample.png'), Buffer.from('demo-image'));
  const html = '<img src="assets/sample.png"><style>.hero{background:url(\'assets/sample.png\')}</style><script>const picture="assets/sample.png";</script>';
  const result = inlineImages(html, dir);
  assert.equal((result.match(/data:image\/png;base64,/g) || []).length, 3);
  assert.ok(!result.includes('assets/sample.png'));
  assert.throws(() => inlineImages('<img src="assets/missing.png">', dir), /Missing image/);
  assert.throws(() => inlineImages('<img src="assets/../../outside.png">', dir), /escapes/);
});
