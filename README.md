# R Journal — Full-stack Trading Journal

A local-first trading journal built with Node.js, Express, SQLite, and plain HTML/CSS/JavaScript. It incorporates the uploaded handwritten requirements image at `public/assets/requirements-note.jpg`.

## Features

- Dashboard metrics: cumulative net R, win rate, expectancy, profit factor, and maximum drawdown in R.
- R-equity curve, calculated from saved trades in chronological order.
- Trade journal with date, symbol/pair, session, direction, setup, entry/stop/exit, planned risk, and result in R.
- Two optional image uploads per trade: before-entry and after-exit chart context.
- Psychological state: emotions before/after, confidence, discipline, and review notes.
- Filter journal by symbol and date range.
- Export entries as CSV.
- SQLite database persisted in `data/journal.sqlite`.

## Requirements

- Node.js 18 or newer (Node.js 20 LTS recommended)
- npm

## Run locally

1. Extract this project folder.
2. Open a terminal inside the folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser.

The SQLite database is created automatically the first time the server starts. Uploaded screenshots are stored under `public/uploads/`.

## How the metrics work

- **Net R:** sum of all trade results in R.
- **Win rate:** trades with result greater than zero divided by all trades, including breakeven trades in the denominator.
- **Expectancy:** average R result per trade.
- **Profit factor:** gross positive R divided by the absolute value of gross negative R. If there are gains but no losses, it displays infinity.
- **Maximum drawdown:** largest peak-to-trough decline in the cumulative R curve.

Use a consistent definition of 1R across your journal. The `risk_amount` field is a note/metadata field; the performance calculations use the entered `result_r` values and do not convert money to R automatically.

## API endpoints

- `GET /api/trades` — list trades. Optional query parameters: `from`, `to`, `symbol`.
- `POST /api/trades` — multipart form to create a trade; accepts `screenshot1` and `screenshot2`.
- `DELETE /api/trades/:id` — delete a trade and its screenshot files.
- `GET /api/metrics` — aggregate metrics and cumulative R series.
- `GET /api/export.csv` — download CSV export.

## Before deploying publicly

This starter project has no login or multi-user permissions. Do **not** expose it to the public internet as-is. Add authentication, authorization, upload hardening, HTTPS, backups, and rate limiting before any public deployment. For a personal local setup, keep the server on a trusted device/network.
