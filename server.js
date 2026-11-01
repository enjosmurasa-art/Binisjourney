const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const uploadDir = path.join(ROOT, "public", "uploads");
const dataDir = path.join(ROOT, "data");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "journal.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  session TEXT DEFAULT '',
  direction TEXT NOT NULL CHECK(direction IN ('Long','Short')),
  setup TEXT DEFAULT '',
  entry_price REAL,
  stop_price REAL,
  exit_price REAL,
  risk_amount REAL DEFAULT 1,
  result_r REAL NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('Win','Loss','Breakeven')),
  emotion_before TEXT DEFAULT '',
  emotion_after TEXT DEFAULT '',
  confidence INTEGER,
  discipline INTEGER,
  notes TEXT DEFAULT '',
  screenshot1 TEXT DEFAULT '',
  screenshot2 TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT, "public")));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 2 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed."));
    cb(null, true);
  }
});

function cleanNumber(value, fallback = null) {
  if (value === "" || value === undefined || value === null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

app.get("/api/trades", (req, res) => {
  const { from, to, symbol } = req.query;
  let sql = "SELECT * FROM trades WHERE 1=1";
  const params = [];
  if (from) { sql += " AND trade_date >= ?"; params.push(from); }
  if (to) { sql += " AND trade_date <= ?"; params.push(to); }
  if (symbol) { sql += " AND symbol = ?"; params.push(symbol); }
  sql += " ORDER BY trade_date DESC, id DESC";
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/metrics", (_, res) => {
  const trades = db.prepare("SELECT result_r, outcome FROM trades ORDER BY trade_date, id").all();
  const wins = trades.filter(t => t.result_r > 0);
  const losses = trades.filter(t => t.result_r < 0);
  const sumR = trades.reduce((s, t) => s + Number(t.result_r || 0), 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.result_r), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.result_r), 0));
  const winRate = trades.length ? wins.length / trades.length * 100 : 0;
  const expectancy = trades.length ? sumR / trades.length : 0;
  const equity = [];
  let running = 0;
  trades.forEach(t => { running += Number(t.result_r || 0); equity.push({ r: Number(t.result_r), totalR: running }); });
  let peak = 0, maxDD = 0;
  equity.forEach(p => { peak = Math.max(peak, p.totalR); maxDD = Math.max(maxDD, peak - p.totalR); });
  res.json({
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
    breakeven: trades.filter(t => Number(t.result_r) === 0).length,
    winRate, netR: sumR, expectancy,
    profitFactor: grossLoss ? grossWin / grossLoss : (grossWin ? null : 0),
    maxDrawdownR: maxDD, equity
  });
});

app.post("/api/trades", upload.fields([{ name: "screenshot1", maxCount: 1 }, { name: "screenshot2", maxCount: 1 }]), (req, res) => {
  try {
    const b = req.body;
    if (!b.trade_date || !b.symbol || !b.direction || b.result_r === undefined || b.result_r === "") {
      return res.status(400).json({ error: "Date, symbol, direction, and result in R are required." });
    }
    const resultR = Number(b.result_r);
    if (!Number.isFinite(resultR)) return res.status(400).json({ error: "Result in R must be a number." });
    const outcome = resultR > 0 ? "Win" : resultR < 0 ? "Loss" : "Breakeven";
    const f1 = req.files?.screenshot1?.[0];
    const f2 = req.files?.screenshot2?.[0];
    const stmt = db.prepare(`
      INSERT INTO trades (
        trade_date,symbol,session,direction,setup,entry_price,stop_price,exit_price,
        risk_amount,result_r,outcome,emotion_before,emotion_after,confidence,discipline,
        notes,screenshot1,screenshot2
      ) VALUES (
        @trade_date,@symbol,@session,@direction,@setup,@entry_price,@stop_price,@exit_price,
        @risk_amount,@result_r,@outcome,@emotion_before,@emotion_after,@confidence,@discipline,
        @notes,@screenshot1,@screenshot2
      )
    `);
    const result = stmt.run({
      trade_date: b.trade_date, symbol: b.symbol.trim().toUpperCase(), session: b.session || "",
      direction: b.direction, setup: b.setup || "",
      entry_price: cleanNumber(b.entry_price), stop_price: cleanNumber(b.stop_price),
      exit_price: cleanNumber(b.exit_price), risk_amount: cleanNumber(b.risk_amount, 1),
      result_r: resultR, outcome, emotion_before: b.emotion_before || "",
      emotion_after: b.emotion_after || "", confidence: cleanNumber(b.confidence),
      discipline: cleanNumber(b.discipline), notes: b.notes || "",
      screenshot1: f1 ? `/uploads/${f1.filename}` : "",
      screenshot2: f2 ? `/uploads/${f2.filename}` : ""
    });
    res.status(201).json(db.prepare("SELECT * FROM trades WHERE id = ?").get(result.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save trade." });
  }
});

app.delete("/api/trades/:id", (req, res) => {
  const trade = db.prepare("SELECT screenshot1, screenshot2 FROM trades WHERE id = ?").get(req.params.id);
  if (!trade) return res.status(404).json({ error: "Trade not found." });
  for (const url of [trade.screenshot1, trade.screenshot2]) {
    if (url) {
      const file = path.join(ROOT, "public", url.replace(/^\//, ""));
      if (file.startsWith(uploadDir) && fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  db.prepare("DELETE FROM trades WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/export.csv", (_, res) => {
  const rows = db.prepare("SELECT * FROM trades ORDER BY trade_date DESC, id DESC").all();
  const cols = rows.length ? Object.keys(rows[0]) : [
    "id","trade_date","symbol","session","direction","setup","entry_price","stop_price","exit_price",
    "risk_amount","result_r","outcome","emotion_before","emotion_after","confidence","discipline","notes","screenshot1","screenshot2"
  ];
  const quote = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.map(quote).join(","), ...rows.map(row => cols.map(c => quote(row[c])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=trading-journal.csv");
  res.send(csv);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err) return res.status(400).json({ error: err.message || "Upload failed." });
  next();
});

app.listen(PORT, () => console.log(`Trading journal running at http://localhost:${PORT}`));
