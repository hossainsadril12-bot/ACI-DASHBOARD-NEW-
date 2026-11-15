// Phase 0 storage test: load the client's real Excel files into three stores and compare.
// Usage: node storage-test.mjs <projectRoot> <xlsxDir> <outDir>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [projectRoot, xlsxDir, outDir] = process.argv.slice(2);
const req = createRequire(path.join(projectRoot, "package.json"));
const XLSX = req("xlsx");
const { PGlite } = await import(pathToFileURL(req.resolve("@electric-sql/pglite")).href);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// ---- Load every sheet of every file as rows (what an upload would store) ----
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(xlsxDir).filter((f) => f.endsWith(".xlsx"));
const datasets = [];
for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(f), { type: "buffer" });
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: null });
    datasets.push({ file: path.relative(xlsxDir, f), sheet, rows });
  }
}
const totalRows = datasets.reduce((n, d) => n + d.rows.length, 0);
const original = Object.fromEntries(files.map((f) => [path.relative(xlsxDir, f), fs.readFileSync(f)]));

// Billing master as typed rows, for a realistic aggregate query.
const billingDs = datasets.find((d) => d.file.startsWith("Dashboard_Media_Final") && d.sheet === "Master");
const [bHead, ...bRows] = billingDs.rows;
const col = (name) => bHead.findIndex((h) => String(h ?? "").trim().startsWith(name));
const iBiz = col("Business"), iAmt = col("PO Amount");
const billing = bRows.map((r) => ({ business: String(r[iBiz] ?? ""), amount: Number(r[iAmt]) || 0, row: r }));
const expected = {};
for (const b of billing) expected[b.business] = (expected[b.business] ?? 0) + b.amount;

const dirSize = (p) => { const s = fs.statSync(p); return s.isDirectory() ? fs.readdirSync(p).reduce((n, e) => n + dirSize(path.join(p, e)), 0) : s.size; };
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const ms = (t) => (performance.now() - t).toFixed(0) + " ms";
const sameTotals = (got) => Object.keys(expected).every((k) => Math.abs((got[k] ?? 0) - expected[k]) < 0.01);
const results = [];

// ---- Option A: PGlite folder (Postgres; same Drizzle code as today) ----
try {
  const dir = path.join(outDir, "pglite");
  const rss0 = process.memoryUsage().rss;
  let t = performance.now();
  const db = await PGlite.create(dir);
  await db.exec(`create table dataset (id serial primary key, file text, sheet text, rows jsonb);
                 create table upload_file (name text primary key, bytes bytea);
                 create table billing (id serial primary key, business text, amount double precision, row jsonb);`);
  await db.transaction(async (tx) => {
    for (const d of datasets) await tx.query("insert into dataset (file, sheet, rows) values ($1,$2,$3)", [d.file, d.sheet, JSON.stringify(d.rows)]);
    for (const [name, bytes] of Object.entries(original)) await tx.query("insert into upload_file values ($1,$2)", [name, new Uint8Array(bytes)]);
    for (const b of billing) await tx.query("insert into billing (business, amount, row) values ($1,$2,$3)", [b.business, b.amount, JSON.stringify(b.row)]);
  });
  const write = ms(t);
  const rss = process.memoryUsage().rss - rss0;
  await db.close();
  t = performance.now();
  const db2 = await PGlite.create(dir);
  const open = ms(t);
  t = performance.now();
  const { rows } = await db2.query("select business, sum(amount)::float8 as total from billing group by business");
  const read = ms(t);
  const got = Object.fromEntries(rows.map((r) => [r.business, r.total]));
  t = performance.now();
  const dump = await db2.dumpDataDir("gzip");
  const backup = ms(t);
  await db2.close();
  results.push({ option: "PGlite folder", write, reopen: open, query: read, totalsMatch: sameTotals(got), disk: mb(dirSize(dir)), backup: mb(dump.size) + " file in " + backup, extraMemory: mb(rss) });
} catch (e) {
  results.push({ option: "PGlite folder", error: String(e && e.stack || e) });
}

// ---- Option B: one SQLite file (node:sqlite, built into Node 22.13+) ----
try {
  const sqlite = await import("node:sqlite");
  const file = path.join(outDir, "media.db");
  let t = performance.now();
  const db = new sqlite.DatabaseSync(file);
  db.exec(`pragma journal_mode = wal;
           create table dataset (id integer primary key, file text, sheet text, rows text);
           create table upload_file (name text primary key, bytes blob);
           create table billing (id integer primary key, business text, amount real, row text);`);
  db.exec("begin");
  const insD = db.prepare("insert into dataset (file, sheet, rows) values (?,?,?)");
  for (const d of datasets) insD.run(d.file, d.sheet, JSON.stringify(d.rows));
  const insF = db.prepare("insert into upload_file values (?,?)");
  for (const [name, bytes] of Object.entries(original)) insF.run(name, bytes);
  const insB = db.prepare("insert into billing (business, amount, row) values (?,?,?)");
  for (const b of billing) insB.run(b.business, b.amount, JSON.stringify(b.row));
  db.exec("commit");
  const write = ms(t);
  db.close();
  t = performance.now();
  const db2 = new sqlite.DatabaseSync(file);
  const open = ms(t);
  t = performance.now();
  const rows = db2.prepare("select business, sum(amount) as total from billing group by business").all();
  const read = ms(t);
  const got = Object.fromEntries(rows.map((r) => [r.business, r.total]));
  t = performance.now();
  const bak = path.join(outDir, "backup.db");
  db2.exec(`vacuum into '${bak.replace(/\\/g, "/")}'`);
  const backup = ms(t);
  db2.close();
  results.push({ option: "SQLite file", write, reopen: open, query: read, totalsMatch: sameTotals(got), disk: mb(fs.statSync(file).size), backup: mb(fs.statSync(bak).size) + " file in " + backup });
} catch (e) {
  results.push({ option: "SQLite file", error: String(e && e.stack || e) });
}

// ---- Option C: plain JSON files (like his server.js) ----
try {
  const dir = path.join(outDir, "json");
  fs.mkdirSync(path.join(dir, "dataset"), { recursive: true });
  fs.mkdirSync(path.join(dir, "blobs"), { recursive: true });
  const atomicWrite = (p, data) => { const tmp = p + ".tmp"; fs.writeFileSync(tmp, data); fs.renameSync(tmp, p); };
  let t = performance.now();
  datasets.forEach((d, i) => atomicWrite(path.join(dir, "dataset", i + ".json"), JSON.stringify(d)));
  for (const [name, bytes] of Object.entries(original)) atomicWrite(path.join(dir, "blobs", name.replace(/[\\/]/g, "_")), bytes);
  atomicWrite(path.join(dir, "billing.json"), JSON.stringify(billing));
  const write = ms(t);
  t = performance.now();
  const loaded = JSON.parse(fs.readFileSync(path.join(dir, "billing.json"), "utf8"));
  const open = ms(t);
  t = performance.now();
  const got = {};
  for (const b of loaded) got[b.business] = (got[b.business] ?? 0) + b.amount;
  const read = ms(t);
  results.push({ option: "JSON files", write, reopen: open, query: read, totalsMatch: sameTotals(got), disk: mb(dirSize(dir)), backup: "zip the folder" });
} catch (e) {
  results.push({ option: "JSON files", error: String(e && e.stack || e) });
}

console.log(JSON.stringify({ node: process.version, files: files.length, sheets: datasets.length, totalRows, billingRows: billing.length, businesses: Object.keys(expected).length, results }, null, 2));
