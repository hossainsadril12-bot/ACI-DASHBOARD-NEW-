const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(src).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!j.file || !j.b64) { console.log('SKIP', f); continue; }
  const sub = path.relative(src, path.dirname(f));
  fs.mkdirSync(path.join(out, sub), { recursive: true });
  const buf = Buffer.from(j.b64, 'base64');
  fs.writeFileSync(path.join(out, sub, j.file), buf);
  console.log(path.join(sub, j.file), buf.length);
}
