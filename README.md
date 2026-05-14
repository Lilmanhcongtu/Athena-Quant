# Athena Quant

Institutional-grade AI sports betting intelligence terminal prototype with live odds scanning, opportunity scoring, props intelligence, bankroll analytics, persistent market memory, and a professional Parlay Builder AI + Parlay Backtest Lab.

What is included:

- Live SportsGameOdds feed support with synthetic fallback when no API data is available.
- Persistent local intelligence store for odds history, line movement, parlay predictions, parlay legs, backtest results, bankroll history, and strategy settings.
- Stable opportunity/parlay boards designed for reading: rows stay put while numbers and market memory update.
- Detailed bet tickets showing the sportsbook, exact bet, fair value, stake guidance, invalidation rules, and market timeline.
- Risk Office with bankroll guardrails, Kelly exposure, concentration warnings, drawdown rules, and local data-trust metrics.
- Backtesting and calibration panels that use stored pre-entry snapshots once enough live records are captured.
- AI assistant answers for bet placement, Kelly sizing, backtest status, model calibration, market movement, and parlay risk.

Run locally:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

Run tests:

```powershell
npm test
```

For Render, use:

```text
Build Command: npm install
Start Command: node server.js
```

Set `ODDS_API_KEY` in the host environment. Do not commit `.env.local`.

Runtime data is saved locally at `data/athena-intelligence-store.json`. That file is intentionally ignored for GitHub uploads because it can contain private betting history.
