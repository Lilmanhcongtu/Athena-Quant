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
- Expanded league coverage for NBA, NFL, MLB, NHL, college football, college basketball, WNBA, major soccer, tennis, UFC, and PGA-style markets.
- Feed diagnostics showing real/fallback mode, enabled leagues, refresh interval, next retry, quota values, events, books, and market count.
- Real Results + Bet Tracker Engine for logging actual bets, settling win/loss/push results, calculating real ROI/P&L, tracking open exposure, and comparing performance by sport/market.
- Game Schedule Board with start times across the opportunity feed, bet detail tickets, parlay legs, and tracked bet suggestions.
- Superhuman Intelligence Layer with sport-specific model profiles, book sharpness weighting, injury/lineup/weather context risk, price discipline, "price is gone" refusal logic, model grading, alert intelligence, and cloud-readiness diagnostics.

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

Useful local odds settings:

```env
ODDS_LEAGUES=NBA,NFL,MLB,NHL,NCAAF,NCAAB,WNBA,EPL,MLS,UEFA_CHAMPIONS_LEAGUE,LA_LIGA,BUNDESLIGA,IT_SERIE_A,FR_LIGUE_1,LIGA_MX,ATP,WTA,UFC,PGA_MEN
ODDS_LIMIT=24
ODDS_REFRESH_MS=300000
ODDS_RATE_LIMIT_BACKOFF_MS=1800000
```

Those settings scan more sports but only refresh every 5 minutes, with a 30-minute cooldown after a `429` rate-limit response.

Runtime data is saved locally at `data/athena-intelligence-store.json`. That file is intentionally ignored for GitHub uploads because it can contain private betting history.

Bet tracking:

- Open the Portfolio workspace.
- Use Suggested From Board to track one of Athena's current picks, or Log Custom Bet for an outside bet.
- After the game is final, settle the bet as Win, Loss, or Push.
- The tracker updates real win rate, ROI, profit/loss, open exposure, current bankroll, and sport/market performance.

This first results engine uses manual settlement. To make it fully automatic, connect a final scores/results API and map settled outcomes into `bet_ledger` and `settled_results`.

Intelligence upgrade notes:

- Price Discipline tells you whether to bet now, wait, watch the number, or refuse because the price is gone.
- Context Brain flags injury, lineup, weather, and rest/travel risk before you place a bet.
- Book Sharpness Weighting gives more influence to sharper reference books than softer/noisier books.
- Real Model Grading tracks Brier score, log loss, calibration error, and confidence buckets from the available historical sample.
- Historical Odds Warehouse stores local pre-game snapshots for CLV, no-lookahead backtests, and future model learning.
- For a true live production version, add cloud user accounts, a cloud database, encrypted API-key storage, final-score settlement feeds, and background odds workers.
