const { readFileSync } = require('node:fs');
const css = readFileSync(require.resolve('../prototype/styles.css'), 'utf8');
const tokens = block => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
const light = tokens(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark = { ...light, ...tokens(css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]) };
const lum = rgb => rgb.reduce((sum, v, i) => sum + [0.2126, 0.7152, 0.0722][i] * (v / 255 <= .04045 ? v / 3294.6 : ((v / 255 + .055) / 1.055) ** 2.4), 0);
const hex = value => (value.length === 4 ? value.slice(1).split('').map(c => c + c) : value.slice(1).match(/../g)).map(c => parseInt(c, 16));
const pairs = [['ink-2','surface-3',4.5], ['ink-3','bg',4.5], ['ink-3','surface-1',4.5], ['ink-1','surface-3',7], ['white','button-solid',4.5], ['red','red-bg',4.5]];
const rows = [];
for (const [theme, values] of Object.entries({ light, dark })) {
  const get = key => values['--' + key].replace(/var\(--([\w-]+)\)/g, (_, name) => get(name));
  for (const [fg, bg, minimum] of pairs) {
    const color = get(bg), base = hex(get('bg'));
    const backgrounds = color.startsWith('#') ? [hex(color)] : [...color.matchAll(/rgba\(([^)]+)\)/g)].map(([, rgba]) => rgba.split(',').map(Number)).map(([r,g,b,a]) => [r,g,b].map((v,i) => a * v + (1-a) * base[i]));
    const ratio = Math.min(...backgrounds.map(rgb => { const levels = [lum(hex(get(fg))), lum(rgb)].sort((a,b) => b-a); return (levels[0]+.05)/(levels[1]+.05); }));
    rows.push({ theme, foreground: fg, background: bg, ratio: ratio.toFixed(2), minimum, pass: ratio >= minimum });
  }
}
console.table(rows);
if (rows.some(row => !row.pass)) process.exitCode = 1;
