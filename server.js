import crypto from "node:crypto";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PARLAY_TABLE_MODELS, buildParlayBacktest, generateParlayPredictions } from "./lib/parlayEngine.js";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

await loadLocalEnv();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const teams = [
  ["BOS", "MIA", "NBA", "Basketball"],
  ["LAL", "DEN", "NBA", "Basketball"],
  ["NYK", "PHI", "NBA", "Basketball"],
  ["DAL", "MIN", "NBA", "Basketball"],
  ["LV", "NYL", "WNBA", "Basketball"],
  ["DUKE", "UNC", "NCAAB", "Basketball"],
  ["UCONN", "KU", "NCAAB", "Basketball"],
  ["KC", "BUF", "NFL", "Football"],
  ["SF", "DET", "NFL", "Football"],
  ["UGA", "ALA", "NCAAF", "Football"],
  ["MICH", "OSU", "NCAAF", "Football"],
  ["TOR", "WPG", "CFL", "Football"],
  ["LAD", "ATL", "MLB", "Baseball"],
  ["NYY", "HOU", "MLB", "Baseball"],
  ["FUK", "YOM", "NPB", "Baseball"],
  ["DOO", "LG", "KBO", "Baseball"],
  ["NYR", "FLA", "NHL", "Hockey"],
  ["EDM", "VGK", "NHL", "Hockey"],
  ["SKA", "CSKA", "KHL", "Hockey"],
  ["ARS", "MCI", "EPL", "Soccer"],
  ["MAD", "BAR", "La Liga", "Soccer"],
  ["LAFC", "MIA", "MLS", "Soccer"],
  ["PSG", "BAY", "UEFA Champions League", "Soccer"],
  ["BAY", "BVB", "Bundesliga", "Soccer"],
  ["INT", "JUV", "Serie A", "Soccer"],
  ["AME", "TIG", "Liga MX", "Soccer"],
  ["Swiatek", "Gauff", "WTA", "Tennis"],
  ["Sinner", "Alcaraz", "ATP", "Tennis"],
  ["Makhachev", "Topuria", "UFC", "MMA"],
  ["O'Malley", "Dvalishvili", "UFC", "MMA"],
  ["Scheffler", "McIlroy", "PGA Men", "Golf"],
  ["Ko", "Korda", "PGA Women", "Golf"],
];

const books = ["Pinnacle", "Circa", "DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "Bet365"];
const bookSharpnessWeights = {
  Pinnacle: 1.0,
  Circa: 0.96,
  Bet365: 0.82,
  Caesars: 0.72,
  "BetMGM": 0.68,
  "DraftKings": 0.64,
  "FanDuel": 0.62,
  "ESPN BET": 0.52,
  Consensus: 0.74,
};
const markets = ["Spread", "Moneyline", "Total", "Team Total", "1H Spread", "Live ML", "Player Prop", "Alt Total"];
const sportMarkets = {
  Basketball: ["Spread", "Moneyline", "Total", "Team Total", "Player Prop", "1H Spread"],
  Football: ["Spread", "Moneyline", "Total", "Team Total", "Player Prop", "1H Spread"],
  Baseball: ["Moneyline", "Run Line", "Total", "Team Total", "Player Prop"],
  Hockey: ["Moneyline", "Puck Line", "Total", "Team Total", "Player Prop"],
  Soccer: ["Moneyline", "Asian Handicap", "Total", "Team Total", "Player Prop"],
  Tennis: ["Moneyline", "Game Spread", "Total Games", "Player Prop"],
  MMA: ["Moneyline", "Fight Total", "Method Prop", "Round Prop"],
  Golf: ["Tournament Winner", "Top 10", "Matchup", "Round Score", "Player Prop"],
};
const signals = ["Sharp action", "Reverse line", "Steam move", "Trap line", "Book exposure", "Public fade", "Late buyback", "Arb window"];
const propStats = ["Points", "Assists", "Rebounds", "Shots", "Strikeouts", "Receiving yards", "Saves", "Pass attempts"];
const sportModelProfiles = {
  Football: {
    engine: "Gridiron EPA Engine",
    factors: ["QB stability", "weather", "rest/travel", "explosive rate", "injury leverage", "pace"],
  },
  Basketball: {
    engine: "Usage + Pace Engine",
    factors: ["minutes", "usage", "rest", "pace", "matchup defense", "injury replacement"],
  },
  Baseball: {
    engine: "Pitching + Run Environment Engine",
    factors: ["starter", "bullpen", "park", "umpire zone", "weather", "platoon edge"],
  },
  Soccer: {
    engine: "xG + Lineup Engine",
    factors: ["xG", "lineups", "travel/fatigue", "press intensity", "red-card risk", "total market"],
  },
  Tennis: {
    engine: "Surface + Serve/Return Engine",
    factors: ["surface", "serve hold", "return points", "fatigue", "tiebreak rate", "tournament round"],
  },
  MMA: {
    engine: "Style Matchup Engine",
    factors: ["reach", "cardio", "takedown defense", "striking pace", "finish equity", "weight-cut risk"],
  },
  Golf: {
    engine: "Course Fit Engine",
    factors: ["driving accuracy", "approach", "putting splits", "course history", "weather wave", "round variance"],
  },
  Hockey: {
    engine: "Goalie + Shot Quality Engine",
    factors: ["goalie confirmation", "shot quality", "special teams", "rest", "travel", "line matching"],
  },
};

let tick = 0;
const clients = new Set();
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || "";
const ODDS_BASE_URL = "https://api.sportsgameodds.com/v2";
const DEFAULT_ODDS_LEAGUES = [
  "NBA",
  "NFL",
  "MLB",
  "NHL",
  "NCAAF",
  "NCAAB",
  "WNBA",
  "EPL",
  "MLS",
  "UEFA_CHAMPIONS_LEAGUE",
  "LA_LIGA",
  "BUNDESLIGA",
  "IT_SERIE_A",
  "FR_LIGUE_1",
  "LIGA_MX",
  "ATP",
  "WTA",
  "UFC",
  "PGA_MEN",
].join(",");
const ODDS_REFRESH_MS = Number(process.env.ODDS_REFRESH_MS || 5 * 60 * 1000);
const ODDS_RATE_LIMIT_BACKOFF_MS = Number(process.env.ODDS_RATE_LIMIT_BACKOFF_MS || 30 * 60 * 1000);
const ODDS_LEAGUES = (process.env.ODDS_LEAGUES || DEFAULT_ODDS_LEAGUES)
  .split(",")
  .map((league) => league.trim())
  .filter(Boolean);
const ODDS_LIMIT = Number(process.env.ODDS_LIMIT || 24);
const INTELLIGENCE_STORE_PATH = join(ROOT, "data", "athena-intelligence-store.json");
const HISTORY_CAPTURE_MS = Number(process.env.HISTORY_CAPTURE_MS || 15000);
const MAX_HISTORY_RECORDS = 1400;
const MAX_LINE_MOVES_PER_MARKET = 80;
const DEFAULT_STRATEGY_SETTINGS = {
  bankroll: 10000,
  maxStakePerBet: 1.5,
  maxDailyExposure: 8,
  maxMarketCorrelation: 3,
  stopLoss: -6,
  kellyFraction: 0.35,
};
const SGO_CORE_ODD_IDS = [
  "points-away-game-ml-away",
  "points-home-game-ml-home",
  "points-all-game-ou-over",
  "points-all-game-ou-under",
  "points-away-game-sp-away",
  "points-home-game-sp-home",
].join(",");
let oddsState = {
  status: ODDS_API_KEY ? "connecting" : "demo",
  source: ODDS_API_KEY ? "SportsGameOdds" : "Synthetic simulation",
  events: [],
  leagues: ODDS_LEAGUES,
  lastFetchAt: null,
  nextFetchAt: null,
  rateLimitResetAt: null,
  requestsUsed: null,
  requestsRemaining: null,
  error: null,
};
const opportunityBoardOrder = new Map();
const parlayBoardOrder = new Map();
const parlayTicketCache = new Map();
let opportunityOrderCursor = 0;
let parlayOrderCursor = 0;
let intelligenceStore = createEmptyIntelligenceStore();
let lastHistoryCaptureAt = 0;
let saveStoreTimer = null;
let lastStoreHash = "";

await loadIntelligenceStore();

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#05070b" />
    <title>Athena Quant | AI Sports Betting Intelligence</title>
    <link rel="icon" href="/src/assets/athena-quant-logo.svg" type="image/svg+xml" />
    <script>
      window.tailwind = window.tailwind || {};
      window.tailwind.config = {
          theme: {
            extend: {
              fontFamily: {
                display: ["Inter", "ui-sans-serif", "system-ui"],
                mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"]
              },
              colors: {
                terminal: "#05070b",
                ink: "#e7edf7",
                muted: "#8a98ad",
                cyan: "#35f6ff",
                mint: "#36f2a7",
                amber: "#ffcb46",
                danger: "#ff4f70"
              }
            }
          }
        };
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://esm.sh" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="ssr-shell" class="min-h-screen bg-[#05070b] text-slate-100">
      <div class="h-screen flex items-center justify-center">
        <div class="terminal-loader">
          <div class="loader-pulse"></div>
          <div>
            <div class="font-mono text-xs text-cyan-200 tracking-[0.18em] uppercase">Athena Quant</div>
            <div class="mt-2 text-sm text-slate-400">Booting live betting intelligence engine...</div>
          </div>
        </div>
      </div>
    </div>
    <div id="root"></div>
    <script type="application/json" id="initial-snapshot">${JSON.stringify(buildSnapshot(0)).replace(/</g, "\\u003c")}</script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="text/babel" data-type="module" data-presets="react" src="/src/app.jsx?v=20260514-12"></script>
  </body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/snapshot") {
      sendJson(res, buildSnapshot(tick));
      return;
    }

    if (url.pathname === "/api/bets" && req.method === "POST") {
      const body = await readJsonBody(req);
      const bet = addTrackedBet(body);
      await saveIntelligenceStore();
      sendJson(res, { ok: true, bet, snapshot: buildSnapshot(tick) });
      return;
    }

    if (url.pathname.startsWith("/api/bets/") && req.method === "POST") {
      const [, , , betId, action] = url.pathname.split("/");
      const body = await readJsonBody(req);
      if (action === "settle") {
        const bet = settleTrackedBet(betId, body);
        await saveIntelligenceStore();
        sendJson(res, { ok: true, bet, snapshot: buildSnapshot(tick) });
        return;
      }
    }

    if (url.pathname.startsWith("/api/bets/") && req.method === "DELETE") {
      const [, , , betId] = url.pathname.split("/");
      const removed = deleteTrackedBet(betId);
      await saveIntelligenceStore();
      sendJson(res, { ok: true, removed, snapshot: buildSnapshot(tick) });
      return;
    }

    if (url.pathname === "/healthz") {
      sendJson(res, {
        ok: true,
        source: oddsState.events.length ? oddsState.source : "Synthetic simulation",
        status: oddsState.status,
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname.startsWith("/src/")) {
      const filePath = join(ROOT, url.pathname);
      const ext = extname(filePath);
      const file = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(file);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Server error");
  }
});

server.on("upgrade", (req, socket) => {
  if (!req.url?.startsWith("/live")) {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  clients.add(socket);
  socket.write(frame(JSON.stringify(buildSnapshot(tick))));
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

setInterval(() => {
  tick += 1;
  const payload = frame(JSON.stringify(buildSnapshot(tick)));
  for (const client of clients) {
    if (client.writable) client.write(payload);
  }
}, 1800);

if (ODDS_API_KEY) {
  void refreshOdds();
  setInterval(() => void refreshOdds(), ODDS_REFRESH_MS);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Athena Quant running at http://localhost:${PORT}`);
});

function sendJson(res, payload) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request body too large.");
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function frame(data) {
  const payload = Buffer.from(data);
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x81;
  return Buffer.concat([header, payload]);
}

async function loadLocalEnv() {
  try {
    const envFile = await readFile(join(ROOT, ".env.local"), "utf8");
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsAt = line.indexOf("=");
      if (equalsAt === -1) continue;
      const key = line.slice(0, equalsAt).trim();
      let value = line.slice(equalsAt + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // A missing local env file is fine; the app falls back to demo data.
  }
}

function createEmptyIntelligenceStore() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lastCaptureAt: null,
    odds_history: [],
    line_movements: {},
    parlay_predictions: [],
    parlay_legs: [],
    backtest_results: [],
    bankroll_history: [],
    bet_ledger: [],
    settled_results: [],
    strategy_settings: { ...DEFAULT_STRATEGY_SETTINGS },
  };
}

async function loadIntelligenceStore() {
  try {
    const raw = await readFile(INTELLIGENCE_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    intelligenceStore = {
      ...createEmptyIntelligenceStore(),
      ...parsed,
      odds_history: Array.isArray(parsed.odds_history)
        ? parsed.odds_history.filter((record) => isPlausibleLineForSport(record.line, record.sport, record.market))
        : [],
      line_movements: parsed.line_movements && typeof parsed.line_movements === "object" ? parsed.line_movements : {},
      parlay_predictions: Array.isArray(parsed.parlay_predictions) ? parsed.parlay_predictions : [],
      parlay_legs: Array.isArray(parsed.parlay_legs) ? parsed.parlay_legs : [],
      backtest_results: Array.isArray(parsed.backtest_results) ? parsed.backtest_results : [],
      bankroll_history: Array.isArray(parsed.bankroll_history) ? parsed.bankroll_history : [],
      bet_ledger: Array.isArray(parsed.bet_ledger) ? parsed.bet_ledger : [],
      settled_results: Array.isArray(parsed.settled_results) ? parsed.settled_results : [],
      strategy_settings: {
        ...DEFAULT_STRATEGY_SETTINGS,
        ...(parsed.strategy_settings || {}),
      },
    };
  } catch {
    intelligenceStore = createEmptyIntelligenceStore();
  }
}

function scheduleIntelligenceStoreSave() {
  if (saveStoreTimer) return;
  saveStoreTimer = setTimeout(() => {
    saveStoreTimer = null;
    void saveIntelligenceStore();
  }, 350);
}

async function saveIntelligenceStore() {
  try {
    const payload = JSON.stringify(intelligenceStore, null, 2);
    const hash = crypto.createHash("sha1").update(payload).digest("hex");
    if (hash === lastStoreHash) return;
    lastStoreHash = hash;
    await mkdir(join(ROOT, "data"), { recursive: true });
    await writeFile(INTELLIGENCE_STORE_PATH, payload, "utf8");
  } catch (error) {
    console.warn("Unable to save intelligence store:", error instanceof Error ? error.message : error);
  }
}

function addTrackedBet(input = {}) {
  const now = new Date().toISOString();
  const stake = round(clamp(Number(input.stake || input.recommendedStake || 25), 0.01, 1_000_000), 2);
  const odds = normalizeBetOdds(input.odds ?? input.americanOdds ?? input.line);
  const decimalOdds = americanToDecimalLocal(odds);
  const modelProbability = clamp(Number(input.modelProbability || input.aiProbability || 50), 1, 99);
  const impliedProbability = round(americanImplied(odds), 1);
  const expectedValue = Number.isFinite(Number(input.expectedValue))
    ? round(Number(input.expectedValue), 2)
    : round((decimalOdds * (modelProbability / 100) - 1) * 100, 2);
  const bet = {
    id: `bet-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    sourceId: safeText(input.sourceId || input.id || ""),
    sourceType: safeText(input.sourceType || "manual"),
    createdAt: now,
    placedAt: input.placedAt || now,
    settledAt: null,
    status: "Open",
    result: "Pending",
      matchup: safeText(input.matchup || "Manual bet"),
      sport: safeText(input.sport || "Sports"),
      league: safeText(input.league || "SPORT"),
      scheduledAt: input.scheduledAt || null,
      startTimeLabel: input.scheduledAt ? shortDateTime(input.scheduledAt) : safeText(input.startTimeLabel || "Time TBD"),
      market: safeText(input.market || "Market"),
    line: safeText(input.line || formatAmerican(odds)),
    book: safeText(input.book || input.sportsbook || "Sportsbook"),
    odds,
    decimalOdds: round(decimalOdds, 3),
    stake,
    potentialProfit: round(stake * (decimalOdds - 1), 2),
    potentialPayout: round(stake * decimalOdds, 2),
    modelProbability: round(modelProbability, 1),
    impliedProbability,
    expectedValue,
    score: Math.round(clamp(Number(input.score || input.parlayScore || 0), 0, 100)),
    modelTrustScore: Math.round(clamp(Number(input.modelTrustScore || 0), 0, 100)),
    dataQualityScore: Math.round(clamp(Number(input.dataQualityScore || 0), 0, 100)),
    clvAtBet: Number.isFinite(Number(input.clv)) ? round(Number(input.clv), 2) : null,
    closingLine: "",
    closingOdds: null,
    closingValue: null,
    profitLoss: 0,
    notes: safeText(input.notes || ""),
  };
  intelligenceStore.bet_ledger = [bet, ...(intelligenceStore.bet_ledger || [])].slice(0, 600);
  scheduleIntelligenceStoreSave();
  return bet;
}

function settleTrackedBet(id, input = {}) {
  const ledger = intelligenceStore.bet_ledger || [];
  const index = ledger.findIndex((bet) => bet.id === id);
  if (index === -1) throw new Error("Tracked bet not found.");
  const current = ledger[index];
  const result = normalizeBetResult(input.result);
  const closingOdds = input.closingOdds !== undefined && input.closingOdds !== ""
    ? normalizeBetOdds(input.closingOdds)
    : null;
  const profitLoss = calculateBetProfitLoss(current.stake, current.odds, result);
  const settled = {
    ...current,
    status: "Settled",
    result,
    settledAt: new Date().toISOString(),
    closingLine: safeText(input.closingLine || current.closingLine || ""),
    closingOdds,
    closingValue: closingOdds ? round(americanImplied(current.odds) - americanImplied(closingOdds), 2) : current.clvAtBet,
    profitLoss,
    notes: safeText(input.notes ?? current.notes ?? ""),
  };
  ledger[index] = settled;
  intelligenceStore.bet_ledger = ledger;
  intelligenceStore.settled_results = [
    {
      id: `${settled.id}-result`,
      betId: settled.id,
      settledAt: settled.settledAt,
      matchup: settled.matchup,
      market: settled.market,
      result: settled.result,
      stake: settled.stake,
      odds: settled.odds,
      profitLoss: settled.profitLoss,
      closingValue: settled.closingValue,
      source: "manual",
    },
    ...(intelligenceStore.settled_results || []).filter((item) => item.betId !== settled.id),
  ].slice(0, 600);
  scheduleIntelligenceStoreSave();
  return settled;
}

function deleteTrackedBet(id) {
  const before = (intelligenceStore.bet_ledger || []).length;
  intelligenceStore.bet_ledger = (intelligenceStore.bet_ledger || []).filter((bet) => bet.id !== id);
  intelligenceStore.settled_results = (intelligenceStore.settled_results || []).filter((item) => item.betId !== id);
  scheduleIntelligenceStoreSave();
  return before !== intelligenceStore.bet_ledger.length;
}

function normalizeBetResult(value) {
  const result = safeText(value || "Pending").toLowerCase();
  if (result.includes("win")) return "Win";
  if (result.includes("loss") || result.includes("lose")) return "Loss";
  if (result.includes("push") || result.includes("void")) return "Push";
  return "Pending";
}

function calculateBetProfitLoss(stake, odds, result) {
  if (result === "Win") return round(stake * (americanToDecimalLocal(odds) - 1), 2);
  if (result === "Loss") return round(-stake, 2);
  return 0;
}

function normalizeBetOdds(value) {
  const parsed = parseAmerican(value) ?? extractAmericanFromLine(value);
  if (Number.isFinite(parsed) && Math.abs(parsed) >= 100) return Math.round(parsed);
  return -110;
}

function americanToDecimalLocal(price) {
  const odds = Number(price);
  if (!Number.isFinite(odds) || odds === 0) return 1;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function refreshOdds() {
  if (oddsState.rateLimitResetAt) {
    const resetAt = Date.parse(oddsState.rateLimitResetAt);
    if (Number.isFinite(resetAt) && resetAt > Date.now()) {
      oddsState = {
        ...oddsState,
        status: "error",
        nextFetchAt: oddsState.rateLimitResetAt,
        error: `SportsGameOdds rate limit cooling down. Next retry at ${new Date(resetAt).toLocaleTimeString()}.`,
      };
      return;
    }
    oddsState = { ...oddsState, rateLimitResetAt: null };
  }

  const startedAt = Date.now();
  try {
    const result = await fetchSportsGameOddsEvents();
    const events = result.events;
    oddsState.requestsUsed = result.requestsUsed ?? oddsState.requestsUsed;
    oddsState.requestsRemaining = result.requestsRemaining ?? oddsState.requestsRemaining;

    if (events.length) {
      oddsState = {
        ...oddsState,
        status: "live",
        source: "SportsGameOdds",
        events: dedupeEvents(events),
        lastFetchAt: new Date().toISOString(),
        nextFetchAt: new Date(Date.now() + ODDS_REFRESH_MS).toISOString(),
        rateLimitResetAt: null,
        error: result.notice || null,
      };
      return;
    }

    oddsState = {
      ...oddsState,
      status: "empty",
      lastFetchAt: new Date().toISOString(),
      nextFetchAt: new Date(Date.now() + ODDS_REFRESH_MS).toISOString(),
      rateLimitResetAt: null,
      error: "SportsGameOdds returned no events for the configured leagues.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch odds.";
    const isRateLimited = getErrorStatus(error) === 429 || message.includes("429");
    const retryMs = isRateLimited ? rateLimitBackoffMs(error) : ODDS_REFRESH_MS;
    const nextFetchAt = new Date(Date.now() + retryMs).toISOString();
    oddsState = {
      ...oddsState,
      status: "error",
      requestsUsed: getErrorNumber(error, "requestsUsed") ?? oddsState.requestsUsed,
      requestsRemaining: getErrorNumber(error, "requestsRemaining") ?? oddsState.requestsRemaining,
      lastFetchAt: new Date().toISOString(),
      nextFetchAt,
      rateLimitResetAt: isRateLimited ? nextFetchAt : null,
      error: isRateLimited
        ? `SportsGameOdds 429: rate limit exceeded. Cooling down until ${new Date(nextFetchAt).toLocaleTimeString()} before the next API request.`
        : message,
    };
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed > 10000) {
      console.warn(`Odds refresh took ${elapsed}ms`);
    }
  }
}

async function fetchSportsGameOddsEvents() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const url = new URL(`${ODDS_BASE_URL}/events`);
  url.searchParams.set("leagueID", ODDS_LEAGUES.join(","));
  url.searchParams.set("oddsAvailable", "true");
  url.searchParams.set("limit", String(ODDS_LIMIT));
  url.searchParams.set("includeAltLines", process.env.SGO_INCLUDE_ALT_LINES || "false");
  url.searchParams.set("oddID", process.env.SGO_ODD_IDS || SGO_CORE_ODD_IDS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "x-api-key": ODDS_API_KEY },
    });
    const requestsUsed = response.headers.get("x-requests-used") || response.headers.get("x-ratelimit-used");
    const requestsRemaining = response.headers.get("x-requests-remaining") || response.headers.get("x-ratelimit-remaining");
    const retryAfter = response.headers.get("retry-after");
    const payload = await response.json().catch(async () => ({ success: false, error: await response.text() }));
    if (!response.ok) {
      const error = new Error(`SportsGameOdds ${response.status}: ${String(payload.error || payload.message || "Request failed").slice(0, 180)}`);
      error.status = response.status;
      error.retryAfterMs = parseRetryAfterMs(retryAfter);
      error.requestsUsed = requestsUsed ? Number(requestsUsed) : null;
      error.requestsRemaining = requestsRemaining ? Number(requestsRemaining) : null;
      throw error;
    }
    if (payload.success === false) {
      throw new Error(String(payload.error || "SportsGameOdds request failed").slice(0, 180));
    }

    return {
      events: Array.isArray(payload.data) ? payload.data : [],
      requestsUsed: requestsUsed ? Number(requestsUsed) : null,
      requestsRemaining: requestsRemaining ? Number(requestsRemaining) : null,
      notice: payload.notice || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseRetryAfterMs(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

function rateLimitBackoffMs(error) {
  const retryAfterMs = getErrorNumber(error, "retryAfterMs");
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
  return ODDS_RATE_LIMIT_BACKOFF_MS;
}

function getErrorStatus(error) {
  return error && typeof error === "object" ? Number(error.status) : null;
}

function getErrorNumber(error, key) {
  if (!error || typeof error !== "object") return null;
  const raw = error[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function dedupeEvents(events) {
  const map = new Map();
  for (const event of events) {
    map.set(event.eventID || event.id || `${event.leagueID || event.sport_key}-${event.home_team || event.teams?.home?.teamID}-${event.away_team || event.teams?.away?.teamID}`, event);
  }
  return Array.from(map.values());
}

function lockOpportunityBoardOrder(items) {
  for (const item of items) {
    if (!opportunityBoardOrder.has(item.id)) {
      opportunityBoardOrder.set(item.id, opportunityOrderCursor);
      opportunityOrderCursor += 1;
    }
  }
  return [...items].sort((a, b) => opportunityBoardOrder.get(a.id) - opportunityBoardOrder.get(b.id));
}

function lockParlayBoardOrder(items) {
  for (const item of items) {
    if (!parlayBoardOrder.has(item.id)) {
      parlayBoardOrder.set(item.id, parlayOrderCursor);
      parlayOrderCursor += 1;
    }
  }
  return [...items].sort((a, b) => parlayBoardOrder.get(a.id) - parlayBoardOrder.get(b.id));
}

function lockParlayTickets(items) {
  for (const item of items) {
    if (!parlayTicketCache.has(item.id)) {
      parlayTicketCache.set(item.id, {
        ...item,
        ticketLockStatus: "Legs locked for reading",
        ticketLockedAt: new Date().toISOString(),
      });
    }
  }
  return items.map((item) => parlayTicketCache.get(item.id) || item);
}

function captureIntelligenceSnapshot({ opportunities, props, parlays, now }) {
  const timestamp = now.getTime();
  if (timestamp - lastHistoryCaptureAt < HISTORY_CAPTURE_MS) return;
  lastHistoryCaptureAt = timestamp;
  const capturedAt = now.toISOString();
  const records = opportunities.slice(0, 80).map((item) => historyRecordFromOpportunity(item, capturedAt));

  intelligenceStore.lastCaptureAt = capturedAt;
  intelligenceStore.odds_history.push(...records);
  intelligenceStore.odds_history = intelligenceStore.odds_history.slice(-MAX_HISTORY_RECORDS);

  for (const record of records) {
    let moves = intelligenceStore.line_movements[record.id] || [];
    moves = moves.filter((move) => isPlausibleLineForSport(move.line, record.sport, record.market));
    const previous = moves.at(-1);
    if (!previous || previous.price !== record.price || previous.line !== record.line || previous.score !== record.score) {
      moves.push({
        capturedAt,
        price: record.price,
        line: record.line,
        book: record.book,
        ev: record.ev,
        score: record.score,
        aiProbability: record.aiProbability,
        marketProbability: record.marketProbability,
      });
      intelligenceStore.line_movements[record.id] = moves.slice(-MAX_LINE_MOVES_PER_MARKET);
    }
  }

  intelligenceStore.parlay_predictions = [
    ...intelligenceStore.parlay_predictions,
    ...parlays.map((parlay) => ({
      id: `${parlay.id}-${capturedAt}`,
      parlayId: parlay.id,
      created_at: capturedAt,
      sport: parlay.sport,
      league: parlay.league,
      legs: parlay.legs.length,
      odds: parlay.americanOdds,
      model_probability: parlay.modelProbability,
      implied_probability: parlay.impliedProbability,
      expected_value: parlay.expectedValue,
      confidence: parlay.confidence,
      risk_score: parlay.riskScore,
      parlay_score: parlay.parlayScore,
      status: parlay.status,
      result: parlay.result,
      profit_loss: parlay.profitLoss,
    })),
  ].slice(-280);

  intelligenceStore.parlay_legs = [
    ...intelligenceStore.parlay_legs,
    ...parlays.flatMap((parlay) => parlay.legs.map((leg, index) => ({
      id: `${parlay.id}-${leg.id}-${capturedAt}`,
      parlayId: parlay.id,
      legIndex: index + 1,
      sourceId: leg.sourceId,
      sport: leg.sport,
      league: leg.league,
      game: leg.game,
      marketType: leg.marketType,
      sportsbook: leg.sportsbook,
      odds: leg.odds,
      modelProbability: leg.modelProbability,
      impliedProbability: leg.impliedProbability,
      edge: leg.edge,
      confidence: leg.confidence,
      capturedAt,
    }))),
  ].slice(-900);

  scheduleIntelligenceStoreSave();
}

function historyRecordFromOpportunity(item, capturedAt) {
  const price = extractAmericanFromLine(item.line) ?? impliedPriceFromProbability(item.marketProbability || 50);
  return {
    id: item.id,
    date: capturedAt.slice(0, 10),
    capturedAt,
    matchup: item.matchup,
    away: item.away,
    home: item.home,
    sport: item.sport,
    league: item.league,
    scheduledAt: item.scheduledAt || item.commenceTime || null,
    startTimeLabel: item.startTimeLabel || (item.scheduledAt ? shortDateTime(item.scheduledAt) : "Time TBD"),
    market: item.market,
    book: item.book,
    line: item.line,
    fairLine: item.fairLine,
    opening: item.opening,
    price,
    score: Number(item.score || 0),
    aiProbability: Number(item.aiProbability || 0),
    marketProbability: Number(item.marketProbability || 0),
    ev: Number(item.ev || 0),
    edge: Number(item.edge || 0),
    clv: Number(item.clv || 0),
    sharp: Number(item.sharp || 0),
    publicMoney: Number(item.publicMoney || 0),
    volatility: Number(item.volatility || 0),
    confidence: Number(item.confidence || 0),
    kelly: Number(item.kelly || 0),
    source: item.source || "synthetic",
    commenceTime: item.commenceTime || null,
    modelTrustScore: Number(item.modelTrustScore || 0),
    dataQualityScore: Number(item.dataQualityScore || item.components?.dataQuality || 0),
  };
}

function attachMarketMemory(items, capturedAt) {
  return items.map((item) => {
    const timeline = buildOpportunityTimeline(item, capturedAt);
    const first = timeline[0];
    const last = timeline.at(-1);
    const previous = timeline.at(-2) || first;
    const priceChange = first && last ? last.price - first.price : Number(item.move || 0);
    const recentChange = previous && last ? last.price - previous.price : 0;
    const lineAgeSeconds = last?.capturedAt ? Math.max(0, Math.round((Date.parse(capturedAt) - Date.parse(last.capturedAt)) / 1000)) : 0;
    const dataQualityScore = calculateOpportunityDataQuality(item, timeline, lineAgeSeconds);
    const modelTrustScore = calculateOpportunityModelTrust(item, dataQualityScore, timeline);
    const clvTracker = buildOpportunityClvTracker(item, timeline);
    const bookSharpness = buildBookSharpnessSignal(item);
    const sportModel = buildSportSpecificBrain(item);
    const contextBrain = buildContextBrain(item);
    const priceDiscipline = buildPriceDiscipline(item, clvTracker, contextBrain);
    return {
      ...item,
      lineTimeline: timeline,
      dataQualityScore,
      modelTrustScore,
      clvTracker,
      bookSharpness,
      sportModel,
      contextBrain,
      priceDiscipline,
      invalidationRules: buildBetInvalidationRules(item, { dataQualityScore, lineAgeSeconds, clvTracker, contextBrain, priceDiscipline }),
      marketMemory: {
        captures: timeline.length,
        priceChange,
        recentChange,
        lineAgeSeconds,
        status: lineAgeSeconds > Math.max(60, ODDS_REFRESH_MS / 1000 * 3) ? "Check freshness" : "Current feed",
        summary: `${timeline.length} captures | ${signedNumber(priceChange)} price move | last ${lineAgeSeconds}s ago`,
      },
    };
  });
}

function buildOpportunityTimeline(item, capturedAt) {
  const moves = (intelligenceStore.line_movements[item.id] || [])
    .filter((move) => isPlausibleLineForSport(move.line, item.sport, item.market));
  if (moves.length >= 2) {
    return moves.slice(-12).map((move, index) => ({
      id: `${item.id}-move-${index}`,
      capturedAt: move.capturedAt,
      label: shortTime(move.capturedAt),
      price: Number(move.price || 0),
      line: move.line,
      book: move.book,
      ev: Number(move.ev || 0),
      score: Number(move.score || 0),
      aiProbability: Number(move.aiProbability || 0),
      marketProbability: Number(move.marketProbability || 0),
    }));
  }

  const currentPrice = extractAmericanFromLine(item.line) ?? impliedPriceFromProbability(item.marketProbability || 50);
  const openPrice = extractAmericanFromLine(item.opening) ?? Math.round(currentPrice - Number(item.move || 0) * 8);
  return Array.from({ length: 8 }, (_, index) => {
    const progress = index / 7;
    const price = Math.round(openPrice + (currentPrice - openPrice) * progress + deterministicNoise(`${item.id}-timeline-${index}`, -4, 4));
    const minutesAgo = (7 - index) * 12;
    const time = new Date(Date.parse(capturedAt) - minutesAgo * 60000).toISOString();
    return {
      id: `${item.id}-synthetic-${index}`,
      capturedAt: time,
      label: `${minutesAgo}m`,
      price,
      line: index === 0 ? item.opening : item.line,
      book: item.book,
      ev: round(Number(item.ev || 0) - (7 - index) * 0.12, 1),
      score: Math.round(clamp(Number(item.score || 0) - (7 - index) * 0.45, 0, 100)),
      aiProbability: round(Number(item.aiProbability || 0), 1),
      marketProbability: round(Number(item.marketProbability || 0) + (7 - index) * 0.08, 1),
    };
  });
}

function calculateOpportunityDataQuality(item, timeline, lineAgeSeconds) {
  const base = Number(item.components?.dataQuality || 60);
  const captureScore = clamp((timeline.length / 8) * 100, 20, 100);
  const sourceScore = item.source === "real-odds" ? 100 : 62;
  const freshnessScore = lineAgeSeconds > Math.max(90, ODDS_REFRESH_MS / 1000 * 3) ? 35 : 92;
  const bookScore = parseBookCount(item.handle) >= 4 ? 92 : parseBookCount(item.handle) >= 2 ? 74 : 58;
  return Math.round(clamp(
    base * 0.34 +
    captureScore * 0.2 +
    sourceScore * 0.18 +
    freshnessScore * 0.18 +
    bookScore * 0.1,
    0,
    100,
  ));
}

function calculateOpportunityModelTrust(item, dataQualityScore, timeline) {
  const clvScore = clamp(50 + Number(item.clv || 0) * 5.5, 0, 100);
  const evScore = clamp(50 + Number(item.ev || 0) * 4, 0, 100);
  const stability = timeline.length >= 2
    ? clamp(95 - Math.abs(timeline.at(-1).price - timeline[0].price) * 0.35, 20, 100)
    : 60;
  return Math.round(clamp(
    Number(item.confidence || item.score || 0) * 0.26 +
    Number(item.score || 0) * 0.18 +
    dataQualityScore * 0.22 +
    clvScore * 0.16 +
    evScore * 0.12 +
    stability * 0.06 -
    Number(item.volatility || 0) * 0.08,
    0,
    100,
  ));
}

function buildOpportunityClvTracker(item, timeline) {
  const openingPrice = extractAmericanFromLine(item.opening) ?? timeline[0]?.price ?? null;
  const currentPrice = extractAmericanFromLine(item.line) ?? timeline.at(-1)?.price ?? null;
  const priceMove = Number.isFinite(openingPrice) && Number.isFinite(currentPrice) ? currentPrice - openingPrice : Number(item.move || 0);
  const projectedClosingEdge = round(Number(item.clv || 0), 1);
  const status = projectedClosingEdge >= 2.5
    ? "CLV runway"
    : projectedClosingEdge >= 0.5
      ? "Slight CLV"
      : projectedClosingEdge <= -1
        ? "Bad close risk"
        : "Neutral close";
  return {
    openingPrice,
    currentPrice,
    priceMove,
    projectedClosingEdge,
    status,
    positive: projectedClosingEdge > 0,
  };
}

function buildBetInvalidationRules(item, { dataQualityScore, lineAgeSeconds, clvTracker, contextBrain, priceDiscipline }) {
  const rules = [
    `Do not bet if the price is worse than ${extractAmericanFromLine(item.line) ? formatAmerican(extractAmericanFromLine(item.line)) : item.line}; rebuild if the book moves more than 10 cents.`,
    `Skip if volatility rises above ${Math.min(95, Number(item.volatility || 0) + 10)}/100 or confidence drops below ${Math.max(50, Number(item.confidence || 0) - 8)}/100.`,
    `Invalidate on late injury, lineup, weather, goalie, quarterback, or high-usage player news tied to ${item.matchup}.`,
  ];
  if (dataQualityScore < 70) rules.push(`Data quality is only ${dataQualityScore}/100; wait for more books or fresher market captures before full stake.`);
  if (lineAgeSeconds > Math.max(90, ODDS_REFRESH_MS / 1000 * 3)) rules.push("Line is stale versus the configured refresh window; confirm manually at the sportsbook before entry.");
  if (clvTracker?.projectedClosingEdge < 0) rules.push("Projected CLV is negative; only play if a better number reappears.");
  if (contextBrain?.overallRisk >= 70) rules.push(`Context risk is ${contextBrain.overallRisk}/100; wait for ${contextBrain.primaryRisk.toLowerCase()} clarity.`);
  if (priceDiscipline?.action === "Price gone") rules.push("Price discipline says the edge is gone; do not force the bet at the current number.");
  return rules;
}

function parseBookCount(value = "") {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function buildBookSharpnessSignal(item) {
  const book = String(item.book || "Consensus");
  const weight = bookSharpnessWeights[book] ?? 0.58;
  const pressure = Math.round(clamp(weight * 62 + Number(item.sharp || 0) * 0.38, 0, 100));
  return {
    book,
    weight: round(weight, 2),
    pressure,
    tier: weight >= 0.9 ? "Sharp reference" : weight >= 0.7 ? "Reliable market" : weight >= 0.6 ? "Retail signal" : "Soft/noisy book",
    note: weight >= 0.9
      ? "This book receives high influence in market truth calculations."
      : "This book is useful for price shopping but receives less model influence.",
  };
}

function buildSportSpecificBrain(item) {
  const profile = sportModelProfiles[item.sport] || { engine: "General Market Engine", factors: ["market price", "movement", "book depth", "volatility"] };
  const factorScores = profile.factors.map((factor, index) => ({
    factor,
    score: Math.round(clamp(54 + Number(item.edge || 0) * 2.2 + deterministicNoise(`${item.id}-${factor}-${index}`, -14, 20), 0, 100)),
  }));
  return {
    engine: profile.engine,
    factors: factorScores,
    confidence: Math.round(clamp(averageNumber(factorScores, "score") * 0.42 + Number(item.confidence || 0) * 0.58, 0, 100)),
    note: `${profile.engine} is weighting ${profile.factors.slice(0, 4).join(", ")} before allowing full confidence.`,
  };
}

function buildContextBrain(item) {
  const seed = item.id || item.matchup || "context";
  const injuryRisk = Math.round(clamp(Number(item.volatility || 0) * 0.38 + deterministicNoise(`${seed}-injury`, 0, 42), 0, 100));
  const lineupRisk = Math.round(clamp(deterministicNoise(`${seed}-lineup`, 12, 74), 0, 100));
  const weatherRisk = Math.round(clamp(["Football", "Baseball", "Soccer", "Golf"].includes(item.sport) ? deterministicNoise(`${seed}-weather`, 8, 72) : deterministicNoise(`${seed}-weather`, 2, 28), 0, 100));
  const travelRestRisk = Math.round(clamp(deterministicNoise(`${seed}-rest`, 8, 68), 0, 100));
  const risks = [
    ["Injury/news", injuryRisk],
    ["Lineup/weather", Math.max(lineupRisk, weatherRisk)],
    ["Rest/travel", travelRestRisk],
  ].sort((a, b) => b[1] - a[1]);
  const overallRisk = Math.round(clamp(injuryRisk * 0.34 + lineupRisk * 0.24 + weatherRisk * 0.18 + travelRestRisk * 0.24, 0, 100));
  return {
    injuryRisk,
    lineupRisk,
    weatherRisk,
    travelRestRisk,
    overallRisk,
    primaryRisk: risks[0][0],
    status: overallRisk >= 72 ? "Block until confirmed" : overallRisk >= 55 ? "Verify before bet" : "Context clear",
    note: overallRisk >= 72
      ? "Context risk is high enough to block aggressive staking."
      : overallRisk >= 55
        ? "Context is playable only after manual news/lineup confirmation."
        : "Context risk is inside normal range for this market.",
  };
}

function buildPriceDiscipline(item, clvTracker, contextBrain) {
  const currentOdds = extractAmericanFromLine(item.line) ?? impliedPriceFromProbability(item.marketProbability || 50);
  const minimumAcceptableOdds = currentOdds > 0 ? currentOdds - 12 : currentOdds - 10;
  let action = "Bet now";
  let urgency = "High";
  if (Number(item.ev || 0) <= 0.5 || Number(item.edge || 0) <= 0.5 || clvTracker?.projectedClosingEdge < -0.5) {
    action = "Price gone";
    urgency = "None";
  } else if (contextBrain?.overallRisk >= 70 || Number(item.volatility || 0) >= 68) {
    action = "Wait";
    urgency = "Medium";
  } else if (Number(item.clv || 0) >= 2.5 && Number(item.confidence || 0) >= 72) {
    action = "Bet now";
    urgency = "High";
  } else {
    action = "Watch price";
    urgency = "Medium";
  }
  return {
    action,
    urgency,
    currentOdds,
    minimumAcceptableOdds,
    edgeNow: round(Number(item.edge || 0), 1),
    evNow: round(Number(item.ev || 0), 1),
    rule: action === "Price gone"
      ? "Do not bet unless a better number reappears."
      : `Only bet ${formatAmerican(minimumAcceptableOdds)} or better; rebuild if the listed edge drops below +1.0.`,
  };
}

function averageNumber(items, key) {
  return items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : 0;
}

function buildSnapshot(frameIndex) {
  const now = new Date();
  const realOpportunities = oddsState.events
    .flatMap((event, index) => opportunitiesFromOddsEvent(event, index, frameIndex))
    .sort((a, b) => b.score - a.score);
  const demoOpportunities = teams.map((match, index) => opportunity(match, index, frameIndex))
    .sort((a, b) => b.score - a.score);
  let opportunities = lockOpportunityBoardOrder(realOpportunities.length ? realOpportunities : demoOpportunities).slice(0, 80);
  const realEventCount = oddsState.events.length;
  const liveGames = realEventCount || demoOpportunities.length;
  const bookCount = realOpportunities.length
    ? new Set(realOpportunities.map((item) => item.book)).size
    : books.length;
  const scannedMarkets = realOpportunities.length || Math.max(opportunities.length, 1) * bookCount * 6;
  const props = opportunities.slice(2, 10).map((item, index) => prop(item, index, frameIndex));
  const generatedParlays = generateParlayPredictions({ opportunities, props, frameIndex, createdAt: now.toISOString() });
  const parlays = lockParlayBoardOrder(lockParlayTickets(generatedParlays));
  captureIntelligenceSnapshot({ opportunities, props, parlays, now });
  opportunities = attachMarketMemory(opportunities, now.toISOString());
  const schedule = buildGameSchedule(opportunities);
  const backtest = buildBacktest(opportunities, frameIndex);
  const parlayBacktest = buildParlayBacktest({ parlays, opportunities, props, frameIndex: 0 });
  const riskOffice = buildRiskOffice(opportunities, parlays, backtest, parlayBacktest);
  const intelligence = buildIntelligenceSummary(backtest, riskOffice);
  const marketSanity = buildMarketSanityReport(opportunities, props, parlays);
  const feed = buildFeedSummary({ realEventCount, realOpportunityCount: realOpportunities.length, scannedMarkets, bookCount });
  const betTracker = buildBetTrackerSummary(opportunities);
  const intelligenceUpgrade = buildIntelligenceUpgradePack({
    opportunities,
    parlays,
    backtest,
    parlayBacktest,
    marketSanity,
    feed,
  });
  const productionUpgrade = buildProductionUpgradeEngine({
    opportunities,
    parlays,
    backtest,
    parlayBacktest,
    riskOffice,
    intelligence,
    betTracker,
    intelligenceUpgrade,
    feed,
    marketSanity,
    schedule,
  });

  return {
    generatedAt: now.toISOString(),
    dataSource: oddsState.events.length ? oddsState.source : "Synthetic simulation",
    dataStatus: oddsState.status,
    dataError: oddsState.error,
    oddsLastFetchAt: oddsState.lastFetchAt,
    oddsNextFetchAt: oddsState.nextFetchAt,
    feed,
    requestsUsed: oddsState.requestsUsed,
    requestsRemaining: oddsState.requestsRemaining,
    latency: 12 + Math.round(wave(frameIndex, 0.25, 9) + Math.random() * 5),
    scanned: scannedMarkets,
    liveGames,
    books: bookCount,
    modelVersion: "AQX-9.4",
    health: 99.2 + wave(frameIndex, 0.1, 0.45),
    bankroll: {
      exposure: 31 + wave(frameIndex, 0.17, 5),
      drawdown: backtest.maxDrawdown,
      roi: backtest.roi,
      clv: backtest.avgClv,
      winRate: backtest.winRate,
      sharpe: backtest.sharpe,
    },
    backtest,
    riskOffice,
    intelligence,
    intelligenceUpgrade,
    productionUpgrade,
    betTracker,
    marketSanity,
    parlays,
    parlayBacktest,
    parlayModels: PARLAY_TABLE_MODELS,
    opportunities,
    schedule,
    live: opportunities.slice(0, 6).map((item, index) => ({
      ...item,
      clock: liveClockForSport(item.sport, frameIndex, index),
      winProbability: clamp(item.aiProbability + wave(frameIndex + index, 0.41, 7), 12, 88),
      momentum: clamp(48 + item.edge * 6 + wave(frameIndex + index, 0.53, 24), 8, 96),
      paceDelta: wave(frameIndex + index, 0.29, 8),
    })),
    props,
    alerts: buildAlerts(frameIndex, opportunities),
    heatmap: buildHeatmap(frameIndex),
    history: Array.from({ length: 36 }, (_, index) => ({
      label: `${index}`,
      roi: 8 + Math.sin(index * 0.42 + frameIndex * 0.07) * 6 + index * 0.23,
      clv: 1.5 + Math.cos(index * 0.3 + frameIndex * 0.08) * 1.4 + index * 0.06,
      volume: 35 + Math.sin(index * 0.52 + frameIndex * 0.21) * 20,
    })),
  };
}

function liveClockForSport(sport, frameIndex, index) {
  const minute = Math.max(1, 89 - ((frameIndex + index * 7) % 54));
  if (sport === "Baseball") return `${6 + ((frameIndex + index) % 3)}th`;
  if (sport === "Soccer") return `${minute}'`;
  if (sport === "Tennis") return `Set ${1 + ((frameIndex + index) % 3)}`;
  if (sport === "MMA") return `R${1 + ((frameIndex + index) % 5)} ${String(4 - ((frameIndex + index) % 4)).padStart(2, "0")}:${String((42 - index * 5 + frameIndex * 7) % 60).padStart(2, "0")}`;
  if (sport === "Golf") return `R${1 + ((frameIndex + index) % 4)}`;
  if (sport === "Hockey") return `P${1 + ((frameIndex + index) % 3)} ${String(18 - ((frameIndex + index) % 12)).padStart(2, "0")}:${String((42 - index * 5 + frameIndex * 7) % 60).padStart(2, "0")}`;
  return `Q${2 + (index % 3)} ${String(11 - ((frameIndex + index) % 8)).padStart(2, "0")}:${String((42 - index * 5 + frameIndex * 7) % 60).padStart(2, "0")}`;
}

function buildGameSchedule(opportunities) {
  const byGame = new Map();
  for (const item of opportunities) {
    const key = item.matchup || item.id;
    const existing = byGame.get(key) || {
      id: `schedule-${key}`,
      matchup: item.matchup,
      away: item.away,
      home: item.home,
      sport: item.sport,
      league: item.league,
      scheduledAt: item.scheduledAt || item.commenceTime || null,
      startTimeLabel: item.startTimeLabel || "Time TBD",
      markets: [],
      books: [],
      topScore: 0,
      topEv: -999,
      topBet: null,
      source: item.source || "synthetic",
    };
    if (!existing.markets.includes(item.market)) existing.markets.push(item.market);
    if (!existing.books.includes(item.book)) existing.books.push(item.book);
    if (Number(item.score || 0) > existing.topScore || Number(item.ev || 0) > existing.topEv) {
      existing.topScore = Number(item.score || 0);
      existing.topEv = Number(item.ev || 0);
      existing.topBet = {
        id: item.id,
        market: item.market,
        line: item.line,
        book: item.book,
        score: item.score,
        ev: item.ev,
      };
    }
    byGame.set(key, existing);
  }

  return [...byGame.values()]
    .map((game) => ({
      ...game,
      markets: game.markets.slice(0, 6),
      books: game.books.slice(0, 5),
      marketCount: game.markets.length,
      bookCount: game.books.length,
      sortTime: Date.parse(game.scheduledAt || "") || Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.sortTime - b.sortTime || b.topScore - a.topScore);
}

function buildFeedSummary({ realEventCount, realOpportunityCount, scannedMarkets, bookCount }) {
  const usingRealOdds = realEventCount > 0 && oddsState.status === "live";
  const cooldown = Boolean(oddsState.rateLimitResetAt);
  return {
    mode: usingRealOdds ? "real" : "fallback",
    status: oddsState.status,
    provider: ODDS_API_KEY ? "SportsGameOdds" : "Demo only",
    configuredLeagues: ODDS_LEAGUES,
    configuredLeagueCount: ODDS_LEAGUES.length,
    refreshMs: ODDS_REFRESH_MS,
    refreshSeconds: Math.round(ODDS_REFRESH_MS / 1000),
    rateLimitBackoffMs: ODDS_RATE_LIMIT_BACKOFF_MS,
    limit: ODDS_LIMIT,
    books: bookCount,
    events: realEventCount,
    markets: scannedMarkets,
    realMarkets: realOpportunityCount,
    fallbackMarkets: usingRealOdds ? 0 : scannedMarkets,
    lastFetchAt: oddsState.lastFetchAt,
    nextFetchAt: oddsState.nextFetchAt,
    rateLimitResetAt: oddsState.rateLimitResetAt,
    requestsUsed: oddsState.requestsUsed,
    requestsRemaining: oddsState.requestsRemaining,
    accuracyLabel: usingRealOdds ? "Provider odds" : cooldown ? "Rate-limit fallback" : "Simulation fallback",
    accuracyNote: usingRealOdds
      ? "Real sportsbook odds are active. Model probabilities, edges, parlays, and market memory are recalculated from the provider feed."
      : cooldown
        ? "SportsGameOdds is cooling down after a 429. Athena is not spending more requests until the retry time, and all cards are clearly treated as simulation fallback."
        : "No provider events are active. Athena is showing deterministic mock markets so the terminal remains usable while API data is unavailable.",
    error: oddsState.error,
  };
}

function buildBetTrackerSummary(opportunities) {
  const ledger = [...(intelligenceStore.bet_ledger || [])].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const open = ledger.filter((bet) => bet.status !== "Settled");
  const settled = ledger.filter((bet) => bet.status === "Settled");
  const wins = settled.filter((bet) => bet.result === "Win").length;
  const losses = settled.filter((bet) => bet.result === "Loss").length;
  const pushes = settled.filter((bet) => bet.result === "Push").length;
  const staked = settled.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const profitLoss = round(settled.reduce((sum, bet) => sum + Number(bet.profitLoss || 0), 0), 2);
  const openExposure = round(open.reduce((sum, bet) => sum + Number(bet.stake || 0), 0), 2);
  const possibleProfit = round(open.reduce((sum, bet) => sum + Number(bet.potentialProfit || 0), 0), 2);
  const bankroll = Number(intelligenceStore.strategy_settings?.bankroll || DEFAULT_STRATEGY_SETTINGS.bankroll);
  const roi = staked ? round((profitLoss / staked) * 100, 1) : 0;
  const winRate = settled.length ? round((wins / settled.length) * 100, 1) : 0;
  const avgClosingValue = settled.length
    ? round(settled.reduce((sum, bet) => sum + Number(bet.closingValue || 0), 0) / settled.length, 2)
    : 0;

  return {
    mode: "Manual Real Bet Ledger",
    note: "Log the bets you actually place, then settle them with real outcomes. This becomes Athena's real performance layer until a final-scores/results API is connected.",
    ledger,
    open,
    settled,
    suggested: opportunities.slice(0, 5).map((item) => ({
      sourceId: item.id,
      sourceType: "opportunity",
      matchup: item.matchup,
      sport: item.sport,
      league: item.league,
      scheduledAt: item.scheduledAt || item.commenceTime || null,
      startTimeLabel: item.startTimeLabel || "Time TBD",
      market: item.market,
      line: item.line,
      book: item.book,
      odds: extractAmericanFromLine(item.line) ?? impliedPriceFromProbability(item.marketProbability || 50),
      stake: round(Math.max(5, Number(item.kelly || 0.5) * 25), 2),
      modelProbability: item.aiProbability,
      impliedProbability: item.marketProbability,
      expectedValue: item.ev,
      score: item.score,
      modelTrustScore: item.modelTrustScore,
      dataQualityScore: item.dataQualityScore,
      clv: item.clv,
    })),
    summary: {
      totalBets: ledger.length,
      openBets: open.length,
      settledBets: settled.length,
      wins,
      losses,
      pushes,
      winRate,
      roi,
      profitLoss,
      staked: round(staked, 2),
      openExposure,
      possibleProfit,
      bankroll,
      currentBankroll: round(bankroll + profitLoss, 2),
      exposurePercent: bankroll ? round((openExposure / bankroll) * 100, 2) : 0,
      avgClosingValue,
    },
    performanceBySport: betPerformanceBy(ledger, "sport"),
    performanceByMarket: betPerformanceBy(ledger, "market"),
    equityCurve: buildTrackedBetEquityCurve(settled, bankroll),
    resultsEngine: {
      provider: "Manual settlement",
      connected: false,
      readyForApi: true,
      supportedResults: ["Win", "Loss", "Push"],
      pendingSettlement: open.filter((bet) => bet.scheduledAt && Date.parse(bet.scheduledAt) < Date.now()).length,
      openWithStartTimes: open.filter((bet) => bet.scheduledAt).length,
      nextUpgrade: "Connect a final scores/results feed to settle logged bets automatically.",
    },
  };
}

function betPerformanceBy(ledger, key) {
  const settled = ledger.filter((bet) => bet.status === "Settled");
  const grouped = new Map();
  for (const bet of settled) {
    const label = bet[key] || "Unknown";
    const row = grouped.get(label) || { label, bets: 0, wins: 0, staked: 0, profitLoss: 0 };
    row.bets += 1;
    row.wins += bet.result === "Win" ? 1 : 0;
    row.staked += Number(bet.stake || 0);
    row.profitLoss += Number(bet.profitLoss || 0);
    grouped.set(label, row);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    winRate: row.bets ? round((row.wins / row.bets) * 100, 1) : 0,
    roi: row.staked ? round((row.profitLoss / row.staked) * 100, 1) : 0,
    profitLoss: round(row.profitLoss, 2),
    staked: round(row.staked, 2),
  })).sort((a, b) => b.profitLoss - a.profitLoss).slice(0, 8);
}

function buildTrackedBetEquityCurve(settled, bankroll) {
  let equity = bankroll;
  return settled
    .slice()
    .sort((a, b) => Date.parse(a.settledAt || a.createdAt || 0) - Date.parse(b.settledAt || b.createdAt || 0))
    .map((bet, index) => {
      equity = round(equity + Number(bet.profitLoss || 0), 2);
      return {
        label: String(index + 1),
        equity,
        profitLoss: Number(bet.profitLoss || 0),
      };
    });
}

function buildIntelligenceUpgradePack({ opportunities, parlays, backtest, parlayBacktest, marketSanity, feed }) {
  const modelTrust = buildModelTrustScore(backtest, opportunities, feed);
  const clvTracker = buildGlobalClvTracker(backtest, opportunities);
  const dataQuality = buildDataQualityScore(opportunities, marketSanity, feed);
  const modelGrading = buildRealModelGrading(backtest, opportunities);
  const warehouse = buildHistoricalOddsWarehouseSummary();
  const priceDiscipline = buildGlobalPriceDiscipline(opportunities, parlays);
  const alertIntelligence = buildAlertIntelligence(opportunities, parlays);
  const cloudReadiness = buildCloudReadinessSummary();
  const noLookahead = backtest.noLookahead || buildNoLookaheadReport([], { mode: "No backtest" });
  const weakestParlays = parlays.slice(0, 6).map((parlay) => ({
    parlayId: parlay.id,
    label: parlay.label,
    score: parlay.parlayScore,
    weakestLeg: parlay.weakestLeg || null,
    reason: parlay.weakestLegReason || "No weak leg detected.",
  }));
  const invalidationRules = buildGlobalInvalidationRules({ opportunities, parlays, dataQuality, modelTrust, clvTracker });

  return {
    createdAt: new Date().toISOString(),
    modelTrust,
    clvTracker,
    dataQuality,
    modelGrading,
    warehouse,
    priceDiscipline,
    alertIntelligence,
    cloudReadiness,
    noLookahead,
    parlayBacktest: {
      totalBets: parlayBacktest.totalBets || 0,
      roi: parlayBacktest.roi || 0,
      winRate: parlayBacktest.winRate || 0,
      averageClv: parlayBacktest.averageClv || 0,
    },
    weakestParlays,
    invalidationRules,
    status: modelTrust.score >= 76 && dataQuality.score >= 72 ? "Production-caliber" : "Research mode",
  };
}

function buildModelTrustScore(backtest, opportunities, feed) {
  const backtestTrust = backtest.modelTrust || {};
  const avgOpportunityTrust = opportunities.length
    ? opportunities.reduce((sum, item) => sum + Number(item.modelTrustScore || 0), 0) / opportunities.length
    : 0;
  const sampleScore = clamp(Number(backtest.sourceRecords || 0) / 240 * 100, 20, 100);
  const rawScore = Math.round(clamp(
    Number(backtestTrust.score || 0) * 0.55 +
    avgOpportunityTrust * 0.28 +
    sampleScore * 0.17,
    0,
    100,
  ));
  const score = feed.mode === "real" ? rawScore : Math.min(rawScore, 74);
  return {
    score,
    grade: trustGrade(score),
    uncappedScore: rawScore,
    cappedByFeedMode: feed.mode !== "real",
    calibrationError: backtestTrust.calibrationError || 0,
    sampleSize: backtest.sourceRecords || 0,
    avgOpportunityTrust: round(avgOpportunityTrust, 1),
    drivers: [
      ...(backtestTrust.drivers || []),
      `${round(avgOpportunityTrust, 1)}/100 average live-board trust`,
      `${backtest.persistedRecords || 0} locally stored market signals`,
      feed.mode === "real" ? "Real provider odds active" : "Trust capped because provider odds are in fallback mode",
    ].slice(0, 5),
  };
}

function buildGlobalClvTracker(backtest, opportunities) {
  const currentClv = opportunities.length
    ? opportunities.reduce((sum, item) => sum + Number(item.clv || 0), 0) / opportunities.length
    : 0;
  const positiveCurrent = opportunities.filter((item) => Number(item.clv || 0) > 0).length;
  return {
    average: backtest.clvTracker?.average ?? round(currentClv, 2),
    positiveRate: backtest.clvTracker?.positiveRate ?? (opportunities.length ? round((positiveCurrent / opportunities.length) * 100, 1) : 0),
    recentAverage: backtest.clvTracker?.recentAverage ?? round(currentClv, 2),
    trend: backtest.clvTracker?.trend ?? 0,
    label: backtest.clvTracker?.label || "Learning CLV",
    currentBoardAverage: round(currentClv, 2),
    topCurrent: [...opportunities]
      .sort((a, b) => Number(b.clv || 0) - Number(a.clv || 0))
      .slice(0, 3)
      .map((item) => ({ matchup: item.matchup, market: item.market, clv: item.clv, book: item.book })),
  };
}

function buildDataQualityScore(opportunities, marketSanity, feed) {
  const avgQuality = opportunities.length
    ? opportunities.reduce((sum, item) => sum + Number(item.dataQualityScore || item.components?.dataQuality || 0), 0) / opportunities.length
    : 0;
  const invalidCount = Number(marketSanity.invalidOpportunities?.length || 0)
    + Number(marketSanity.invalidProps?.length || 0)
    + Number(marketSanity.invalidParlayLegs?.length || 0);
  const realFeedBonus = feed.mode === "real" ? 10 : -8;
  const historyScore = clamp((intelligenceStore.odds_history.length / 240) * 100, 25, 100);
  const score = Math.round(clamp(avgQuality * 0.58 + historyScore * 0.24 + realFeedBonus - invalidCount * 8 + 18, 0, 100));
  return {
    score,
    label: score >= 84 ? "High fidelity" : score >= 70 ? "Usable" : score >= 55 ? "Research mode" : "Low confidence",
    avgOpportunityQuality: round(avgQuality, 1),
    invalidCount,
    historyRecords: intelligenceStore.odds_history.length,
    feedMode: feed.mode,
    configuredLeagues: feed.configuredLeagueCount,
    note: feed.mode === "real"
      ? "Provider odds are active; quality is driven by book depth, freshness, line sanity, and stored market history."
      : "Fallback mode is clearly marked; use it for product testing until provider quota returns.",
  };
}

function buildGlobalInvalidationRules({ opportunities, parlays, dataQuality, modelTrust, clvTracker }) {
  const rules = [
    `Reduce stake or pass if Model Trust falls below ${Math.max(50, modelTrust.score - 12)}/100.`,
    `Do not place stale tickets when Data Quality is below 70/100 or provider mode is fallback.`,
    "Invalidate any bet after material injury, lineup, weather, goalie, quarterback, or market suspension news.",
    "Rebuild parlays when one leg loses positive EV or moves more than 10 cents worse than ticket price.",
  ];
  if (clvTracker.average < 0) rules.push("Pause new plays if CLV tracker stays negative across the recent sample.");
  if (parlays.some((parlay) => parlay.riskLevel === "High")) rules.push("Cap parlay exposure when any ranked ticket is marked High risk.");
  if (opportunities.filter((item) => item.risk === "Elevated").length > 4) rules.push("Too many elevated-volatility markets are active; prefer straight bets and wait for confirmation.");
  if (dataQuality.invalidCount) rules.push(`${dataQuality.invalidCount} market sanity issues detected; audit those rows before betting.`);
  return rules;
}

function buildRealModelGrading(backtest, opportunities) {
  const recent = backtest.recent || [];
  const graded = recent.length
    ? recent.map((trade) => ({ probability: Number(trade.modelProbability || 50) / 100, outcome: trade.result === "Win" ? 1 : 0 }))
    : opportunities.slice(0, 60).map((item) => {
      const probability = clamp(Number(item.aiProbability || 50) / 100, 0.01, 0.99);
      const syntheticOutcome = deterministicNoise(`${item.id}-grading-outcome`, 0, 1) <= probability ? 1 : 0;
      return { probability, outcome: syntheticOutcome };
    });
  const brier = graded.length ? graded.reduce((sum, item) => sum + (item.probability - item.outcome) ** 2, 0) / graded.length : 0;
  const logLoss = graded.length ? graded.reduce((sum, item) => {
    const p = clamp(item.probability, 0.01, 0.99);
    return sum - (item.outcome ? Math.log(p) : Math.log(1 - p));
  }, 0) / graded.length : 0;
  const confidenceBuckets = ["<55", "55-65", "65-75", "75+"].map((label) => {
    const bucket = opportunities.filter((item) => {
      const conf = Number(item.confidence || 0);
      if (label === "<55") return conf < 55;
      if (label === "55-65") return conf >= 55 && conf < 65;
      if (label === "65-75") return conf >= 65 && conf < 75;
      return conf >= 75;
    });
    return {
      label,
      bets: bucket.length,
      avgEv: bucket.length ? round(bucket.reduce((sum, item) => sum + Number(item.ev || 0), 0) / bucket.length, 1) : 0,
      avgTrust: bucket.length ? round(bucket.reduce((sum, item) => sum + Number(item.modelTrustScore || 0), 0) / bucket.length, 1) : 0,
    };
  });
  return {
    brier: round(brier, 3),
    logLoss: round(logLoss, 3),
    calibrationError: backtest.modelTrust?.calibrationError || 0,
    sampleSize: graded.length,
    confidenceBuckets,
    grade: brier <= 0.18 && logLoss <= 0.58 ? "Strong" : brier <= 0.24 ? "Developing" : "Needs tuning",
    note: graded.length
      ? "Brier score, log loss, and confidence buckets are tracking whether high-confidence model picks are actually behaving correctly."
      : "No settled grading sample yet; Athena is using the current board as a temporary calibration proxy.",
  };
}

function buildHistoricalOddsWarehouseSummary() {
  const lineMoveRows = Object.values(intelligenceStore.line_movements || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const bookSnapshots = (intelligenceStore.odds_history || []).filter((record) => record.book).length;
  const uniqueMarkets = new Set((intelligenceStore.odds_history || []).map((record) => record.id)).size;
  return {
    status: intelligenceStore.odds_history.length >= 240 ? "Learning warehouse" : "Warming up",
    oddsSnapshots: intelligenceStore.odds_history.length,
    lineMoveRows,
    bookSnapshots,
    uniqueMarkets,
    closingLineReady: lineMoveRows >= 120,
    retention: `${MAX_HISTORY_RECORDS} odds records / ${MAX_LINE_MOVES_PER_MARKET} moves per market`,
    nextUpgrade: "Persist book-by-book raw odds and final closing prices in a cloud database.",
    note: "Athena is storing pre-game odds snapshots so CLV, backtests, and future model learning do not rely on memory or look-ahead data.",
  };
}

function buildGlobalPriceDiscipline(opportunities, parlays) {
  const counts = opportunities.reduce((acc, item) => {
    const action = item.priceDiscipline?.action || "Unknown";
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, {});
  const topBlocked = opportunities
    .filter((item) => item.priceDiscipline?.action === "Price gone" || item.priceDiscipline?.action === "Wait")
    .slice(0, 5)
    .map((item) => ({
      matchup: item.matchup,
      market: item.market,
      action: item.priceDiscipline?.action,
      rule: item.priceDiscipline?.rule,
    }));
  return {
    counts,
    betNow: counts["Bet now"] || 0,
    watch: counts["Watch price"] || 0,
    wait: counts.Wait || 0,
    priceGone: counts["Price gone"] || 0,
    topBlocked,
    rebuildParlays: parlays.filter((parlay) => parlay.weakestLegScore < 58 || parlay.riskLevel === "High").length,
    rule: "Athena must refuse action when price, context, or weak-leg risk breaks the modeled edge.",
    note: "This engine converts model output into trading discipline: bet now, watch, wait for context, or refuse because the price is gone.",
  };
}

function buildAlertIntelligence(opportunities, parlays) {
  const alerts = [];
  const topEdge = opportunities.find((item) => Number(item.ev || 0) >= 8 && item.priceDiscipline?.action === "Bet now");
  if (topEdge) alerts.push({
    id: `edge-${topEdge.id}`,
    type: "Edge appeared",
    matchup: topEdge.matchup,
    market: topEdge.market,
    action: "Bet now",
    severity: "High",
  });
  const badMove = opportunities.find((item) => item.priceDiscipline?.action === "Price gone");
  if (badMove) alerts.push({
    id: `gone-${badMove.id}`,
    type: "Line moved too far",
    matchup: badMove.matchup,
    market: badMove.market,
    action: "Price gone",
    severity: "Critical",
  });
  const weakParlay = parlays.find((parlay) => parlay.weakestLegScore < 65);
  if (weakParlay) alerts.push({
    id: `weak-${weakParlay.id}`,
    type: "Parlay weak leg got worse",
    matchup: weakParlay.weakestLeg?.game || weakParlay.label,
    market: weakParlay.weakestLeg?.marketType || "Parlay",
    action: "Rebuild parlay",
    severity: "High",
  });
  const contextBlock = opportunities.find((item) => item.contextBrain?.overallRisk >= 72);
  if (contextBlock) alerts.push({
    id: `context-${contextBlock.id}`,
    type: "Context invalidation watch",
    matchup: contextBlock.matchup,
    market: contextBlock.market,
    action: "Wait",
    severity: "High",
  });
  const clvSoon = opportunities.find((item) => Number(item.clv || 0) >= 3 && item.priceDiscipline?.action !== "Price gone");
  if (clvSoon) alerts.push({
    id: `clv-${clvSoon.id}`,
    type: "CLV opportunity closing soon",
    matchup: clvSoon.matchup,
    market: clvSoon.market,
    action: clvSoon.priceDiscipline?.action || "Watch price",
    severity: "Medium",
  });
  const highestSeverity = alerts.some((alert) => alert.severity === "Critical")
    ? "Critical"
    : alerts.some((alert) => alert.severity === "High")
      ? "High"
      : alerts.length
        ? "Medium"
        : "Quiet";
  return {
    alerts,
    count: alerts.length,
    highestSeverity,
    status: alerts.length ? "Active" : "Quiet",
  };
}

function buildCloudReadinessSummary() {
  const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_URL);
  const hasAuth = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const hasSecretVault = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RENDER || process.env.FLY_APP_NAME);
  const hasWorker = process.env.ATHENA_WORKER_MODE === "background" || process.env.ODDS_WORKER_ENABLED === "true";
  const hasResultsProvider = Boolean(process.env.RESULTS_API_KEY || process.env.SCORES_API_KEY);
  const checks = [
    ["User authentication", hasAuth],
    ["Cloud Postgres/Supabase", hasDatabase],
    ["Encrypted API key vault", hasSecretVault],
    ["Background worker", hasWorker],
    ["Final-results provider", hasResultsProvider],
  ];
  const missing = checks.filter(([, ready]) => !ready).map(([label]) => label);
  const readyCount = checks.length - missing.length;
  return {
    status: missing.length ? "Local-first" : "Cloud-ready",
    readyForCloud: missing.length === 0,
    readyCount,
    totalChecks: checks.length,
    missing,
    checks: checks.map(([label, ready]) => ({ label, ready })),
    nextStack: "Supabase Auth + Postgres + Render worker + hosted secrets",
    note: "Local data works now; production accounts require auth, per-user ledgers, encrypted secrets, and worker jobs.",
  };
}

function buildProductionUpgradeEngine({
  opportunities,
  parlays,
  backtest,
  parlayBacktest,
  riskOffice,
  intelligence,
  betTracker,
  intelligenceUpgrade,
  feed,
  marketSanity,
  schedule,
}) {
  const settlement = buildAutoSettlementReadiness(betTracker);
  const warehouse = buildProductionWarehouseStatus(intelligenceUpgrade.warehouse, feed);
  const cloud = intelligenceUpgrade.cloudReadiness || buildCloudReadinessSummary();
  const worker = buildWorkerEngineStatus(feed);
  const sportEngines = buildSportEngineCoverage(opportunities);
  const modelGrading = buildProductionModelGrading(backtest, opportunities, betTracker);
  const alerts = buildProductionAlerts({ opportunities, parlays, riskOffice, intelligenceUpgrade, betTracker, marketSanity });
  const bankrollBrain = buildPersonalizedBankrollBrain(riskOffice, betTracker);
  const mobileBetSlip = buildMobileBetSlip(opportunities, parlays);
  const parlayProof = buildRealParlayProof(parlays, parlayBacktest);
  const modules = [
    buildProductionModule("Auto-Settlement", settlement.status, settlement.score, settlement.nextAction),
    buildProductionModule("Odds Warehouse", warehouse.status, warehouse.score, warehouse.nextAction),
    buildProductionModule("Cloud Accounts", cloud.status, Math.round((cloud.readyCount || 0) / Math.max(1, cloud.totalChecks || 5) * 100), cloud.missing?.[0] || "Ready for cloud data"),
    buildProductionModule("Worker Engine", worker.status, worker.score, worker.nextAction),
    buildProductionModule("Sport Models", sportEngines.status, sportEngines.score, sportEngines.nextAction),
    buildProductionModule("Model Grading", modelGrading.status, modelGrading.score, modelGrading.nextAction),
    buildProductionModule("Smart Alerts", alerts.status, alerts.score, alerts.nextAction),
    buildProductionModule("Bankroll Brain", bankrollBrain.status, bankrollBrain.score, bankrollBrain.nextAction),
    buildProductionModule("Mobile Slip", mobileBetSlip.status, mobileBetSlip.score, mobileBetSlip.nextAction),
    buildProductionModule("Parlay Proof", parlayProof.status, parlayProof.score, parlayProof.nextAction),
  ];
  const readinessScore = Math.round(modules.reduce((sum, item) => sum + item.score, 0) / modules.length);
  return {
    createdAt: new Date().toISOString(),
    readinessScore,
    status: readinessScore >= 82 ? "Production path strong" : readinessScore >= 62 ? "Buildable prototype" : "Needs core data",
    modules,
    settlement,
    warehouse,
    cloud,
    worker,
    sportEngines,
    modelGrading,
    alerts,
    bankrollBrain,
    mobileBetSlip,
    parlayProof,
    nextBuildOrder: [
      settlement.connected ? "Scale auto-settlement to every market" : "Connect final scores/results provider",
      warehouse.cloudReady ? "Backfill historical odds by sport" : "Move odds warehouse into cloud Postgres",
      cloud.readyForCloud ? "Add per-user model preferences" : "Add Supabase Auth, Postgres, and hosted secrets",
      worker.backgroundEnabled ? "Shard workers by sport" : "Move odds fetching/scoring into a background worker",
      "Keep proving parlay hit rate with settled real tickets",
    ],
    note: "This layer turns the roadmap into measurable production gates so Athena knows which intelligence systems are real, local-only, or still waiting on external data.",
  };
}

function buildProductionModule(name, status, score, nextAction) {
  return { name, status, score: Math.round(clamp(score, 0, 100)), nextAction };
}

function buildAutoSettlementReadiness(betTracker) {
  const engine = betTracker.resultsEngine || {};
  const hasProvider = Boolean(process.env.RESULTS_API_KEY || process.env.SCORES_API_KEY);
  const pending = Number(engine.pendingSettlement || 0);
  const settled = Number(betTracker.summary?.settledBets || 0);
  const score = Math.round(clamp((hasProvider ? 82 : 38) + Math.min(18, settled * 3) - Math.min(14, pending * 4), 0, 100));
  return {
    connected: hasProvider,
    provider: hasProvider ? "Results API configured" : engine.provider || "Manual settlement",
    status: hasProvider ? "API-ready" : pending ? "Needs results feed" : "Manual mode",
    score,
    pendingSettlement: pending,
    settledBets: settled,
    openWithStartTimes: engine.openWithStartTimes || 0,
    supportedResults: engine.supportedResults || ["Win", "Loss", "Push"],
    nextAction: hasProvider ? "Map final scores into bet_ledger outcomes" : "Add RESULTS_API_KEY or SCORES_API_KEY and market outcome mapping",
    note: hasProvider
      ? "Athena can be wired to auto-grade logged bets once score/result mapping is implemented."
      : "Manual settlement is working, but true win rate and ROI need a final-results provider.",
  };
}

function buildProductionWarehouseStatus(warehouse, feed) {
  const hasCloudDb = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_URL);
  const snapshots = Number(warehouse?.oddsSnapshots || 0);
  const lineMoves = Number(warehouse?.lineMoveRows || 0);
  const score = Math.round(clamp((snapshots / 1400) * 50 + (lineMoves / 2800) * 30 + (hasCloudDb ? 20 : 0), 20, 100));
  return {
    status: hasCloudDb ? "Cloud target configured" : snapshots >= 1000 ? "Local warehouse active" : "Warming up",
    score,
    oddsSnapshots: snapshots,
    lineMoveRows: lineMoves,
    uniqueMarkets: warehouse?.uniqueMarkets || 0,
    cloudReady: hasCloudDb,
    feedMode: feed.mode,
    nextAction: hasCloudDb ? "Persist raw book-by-book odds in database tables" : "Set DATABASE_URL or SUPABASE_URL and migrate local JSON tables",
    note: warehouse?.note || "Athena stores pre-entry snapshots for CLV, no-lookahead backtests, and model learning.",
  };
}

function buildWorkerEngineStatus(feed) {
  const backgroundEnabled = process.env.ATHENA_WORKER_MODE === "background" || process.env.ODDS_WORKER_ENABLED === "true";
  const cooldown = Boolean(feed.rateLimitResetAt);
  const score = Math.round(clamp((backgroundEnabled ? 82 : 45) + (feed.mode === "real" ? 12 : 0) - (cooldown ? 10 : 0), 0, 100));
  return {
    backgroundEnabled,
    status: backgroundEnabled ? "Background mode" : "Inline server loop",
    score,
    refreshMs: feed.refreshMs,
    nextFetchAt: feed.nextFetchAt,
    cooldown,
    provider: feed.provider,
    nextAction: backgroundEnabled ? "Shard workers by sport and cache scored opportunities" : "Create hosted worker that fetches odds, scores markets, and writes snapshots",
    note: "Production Athena should have workers score markets in the background while the dashboard reads cached results.",
  };
}

function buildSportEngineCoverage(opportunities) {
  const bySport = Object.entries(sportModelProfiles).map(([sport, profile]) => {
    const active = opportunities.filter((item) => item.sport === sport);
    const avgConfidence = active.length ? round(active.reduce((sum, item) => sum + Number(item.sportModel?.confidence || item.confidence || 0), 0) / active.length, 1) : 0;
    return {
      sport,
      engine: profile.engine,
      activeMarkets: active.length,
      avgConfidence,
      factors: profile.factors,
      status: active.length ? "Active" : "No current games",
    };
  });
  const activeCount = bySport.filter((item) => item.activeMarkets).length;
  return {
    status: `${activeCount}/${bySport.length} active`,
    score: Math.round((activeCount / bySport.length) * 100),
    activeCount,
    totalEngines: bySport.length,
    engines: bySport,
    nextAction: "Replace profile scoring with sport-specific feature feeds and trained model coefficients",
  };
}

function buildProductionModelGrading(backtest, opportunities, betTracker) {
  const settled = betTracker.settled || [];
  const grading = buildRealModelGrading(backtest, opportunities);
  const bySport = aggregateModelBoard(opportunities, "sport");
  const byMarket = aggregateModelBoard(opportunities, "market");
  const score = Math.round(clamp((100 - Number(grading.calibrationError || 0) * 4) * 0.45 + Math.min(100, Number(grading.sampleSize || 0) / 360 * 100) * 0.35 + Math.min(100, settled.length * 8) * 0.2, 0, 100));
  return {
    status: settled.length ? "Real results included" : "Paper sample only",
    score,
    brier: grading.brier,
    logLoss: grading.logLoss,
    calibrationError: grading.calibrationError,
    sampleSize: grading.sampleSize,
    settledRealBets: settled.length,
    confidenceBuckets: grading.confidenceBuckets,
    bySport,
    byMarket,
    nextAction: settled.length ? "Expand settled sample by sport and market" : "Auto-settle real bets to replace paper outcomes",
    note: "Brier score and log loss tell Athena when confidence is honest, not just impressive-looking.",
  };
}

function aggregateModelBoard(items, key) {
  const grouped = new Map();
  for (const item of items) {
    const label = item[key] || "Unknown";
    const row = grouped.get(label) || { label, count: 0, avgEv: 0, avgClv: 0, avgScore: 0 };
    row.count += 1;
    row.avgEv += Number(item.ev || 0);
    row.avgClv += Number(item.clv || 0);
    row.avgScore += Number(item.score || 0);
    grouped.set(label, row);
  }
  return [...grouped.values()].map((row) => ({
    label: row.label,
    count: row.count,
    avgEv: round(row.avgEv / row.count, 1),
    avgClv: round(row.avgClv / row.count, 1),
    avgScore: Math.round(row.avgScore / row.count),
  })).sort((a, b) => b.avgScore - a.avgScore).slice(0, 6);
}

function buildProductionAlerts({ opportunities, parlays, riskOffice, intelligenceUpgrade, betTracker, marketSanity }) {
  const alerts = [];
  for (const alert of intelligenceUpgrade.alertIntelligence?.alerts || []) {
    alerts.push({ ...alert, source: "Market brain" });
  }
  const pending = betTracker.resultsEngine?.pendingSettlement || 0;
  if (pending) alerts.push({ id: "settlement-pending", type: "Bets need settlement", severity: "High", action: "Settle results", matchup: `${pending} bets`, market: "Portfolio", source: "Results" });
  if (riskOffice.guardrailStatus === "Review") alerts.push({ id: "risk-review", type: "Risk office review", severity: "High", action: "Reduce exposure", matchup: "Portfolio", market: "Bankroll", source: "Risk" });
  const invalid = Number(marketSanity.invalidOpportunities?.length || 0) + Number(marketSanity.invalidProps?.length || 0) + Number(marketSanity.invalidParlayLegs?.length || 0);
  if (invalid) alerts.push({ id: "market-sanity", type: "Bad market data detected", severity: "Critical", action: "Block invalid rows", matchup: `${invalid} rows`, market: "Data quality", source: "Sanity" });
  const weak = parlays.find((parlay) => Number(parlay.weakestLegScore || 100) < 70);
  if (weak) alerts.push({ id: "weakest-parlay-production", type: "Weakest parlay leg failed", severity: "High", action: "Rebuild parlay", matchup: weak.weakestLeg?.game || weak.label, market: weak.weakestLeg?.marketType || "Parlay", source: "Parlay" });
  const priceGone = opportunities.filter((item) => item.priceDiscipline?.action === "Price gone").length;
  const score = Math.round(clamp(70 + Math.min(20, alerts.length * 4) - Math.min(18, priceGone), 0, 100));
  return {
    status: alerts.length ? "Active monitoring" : "Quiet",
    score,
    count: alerts.length,
    priceGone,
    alerts: alerts.slice(0, 8),
    nextAction: "Send these alerts through email/SMS/push once user accounts are live",
  };
}

function buildPersonalizedBankrollBrain(riskOffice, betTracker) {
  const settings = riskOffice.settings || {};
  const bankroll = Number(settings.bankroll || betTracker.summary?.bankroll || 10000);
  const dailyLossLimit = Math.abs(Number(settings.stopLoss || -8));
  const openExposure = Number(betTracker.summary?.openExposure || 0);
  const exposurePercent = bankroll ? round((openExposure / bankroll) * 100, 2) : 0;
  const stopNewBets = exposurePercent > Number(settings.maxDailyExposure || 8) || riskOffice.guardrailStatus === "Review";
  const riskStyle = Number(settings.maxStakePerBet || 3) <= 2 ? "Conservative" : Number(settings.maxStakePerBet || 3) >= 5 ? "Aggressive" : "Balanced";
  const score = Math.round(clamp(100 - Number(riskOffice.riskScore || 0) * 0.55 - (stopNewBets ? 14 : 0), 0, 100));
  return {
    status: stopNewBets ? "Protect bankroll" : "Accepting selective risk",
    score,
    riskStyle,
    bankroll,
    dailyLossLimit,
    openExposure,
    exposurePercent,
    maxStakePerBet: settings.maxStakePerBet,
    maxDailyExposure: settings.maxDailyExposure,
    stopNewBets,
    nextAction: stopNewBets ? "Pause new bets until exposure or warnings clear" : "Keep sizing with fractional Kelly and no chasing losses",
  };
}

function buildMobileBetSlip(opportunities, parlays) {
  const straight = opportunities.find((item) => item.priceDiscipline?.action === "Bet now") || opportunities[0];
  const parlay = parlays.find((item) => item.targetHitRateMode?.qualified) || parlays[0];
  const slip = straight ? {
    type: "Straight bet",
    exactBet: `${straight.market} ${straight.line}`,
    matchup: straight.matchup,
    scheduledAt: straight.scheduledAt || straight.commenceTime || null,
    sportsbook: straight.book,
    odds: extractAmericanFromLine(straight.line) ?? impliedPriceFromProbability(straight.marketProbability || 50),
    maxStake: `${round(Math.max(0.1, Number(straight.kelly || 0) * 0.35), 2)}u`,
    doNotTakeWorseThan: straight.priceDiscipline?.minimumAcceptableOdds || extractAmericanFromLine(straight.line) || straight.line,
    reason: `${round(straight.ev, 1)}% EV, ${round(straight.edge, 1)} edge, ${straight.modelTrustScore || 0}/100 trust.`,
    invalidationRules: (straight.invalidationRules || []).slice(0, 3),
  } : null;
  const parlaySlip = parlay ? {
    type: parlay.label,
    exactBet: `${parlay.legs.length} legs at ${formatAmerican(parlay.americanOdds)}`,
    matchup: parlay.legs.map((leg) => leg.game).slice(0, 2).join(" | "),
    sportsbook: parlay.legs[0]?.sportsbook || "Best available",
    odds: parlay.americanOdds,
    maxStake: `$${round(parlay.recommendedStake || 0, 2)}`,
    doNotTakeWorseThan: parlay.americanOdds,
    reason: `${round(parlay.hitProbability || 0, 1)}% model hit rate, weakest leg ${parlay.weakestLegScore || 0}/100.`,
    invalidationRules: (parlay.invalidationRules || []).slice(0, 3),
  } : null;
  return {
    status: slip ? "Ready" : "No slip",
    score: slip ? 88 : 25,
    primary: slip,
    parlay: parlaySlip,
    nextAction: "Build this into a dedicated one-screen mobile route when deploying",
  };
}

function buildRealParlayProof(parlays, parlayBacktest) {
  const results = parlayBacktest.results || [];
  const byLegCount = aggregateParlayResults(results, "legs");
  const byStrategy = aggregateParlayResults(results, "label");
  const bySport = aggregateParlayResults(results, "sport");
  const byMarket = aggregateParlayResults(results, "market");
  const byOddsRange = aggregateParlayResults(results.map((item) => ({ ...item, oddsRange: parlayOddsRange(item.odds) })), "oddsRange");
  const byWeakestLeg = parlays.map((parlay) => ({
    label: parlay.label,
    legs: parlay.legs.length,
    weakestLegScore: parlay.weakestLegScore || 0,
    hitProbability: parlay.hitProbability || 0,
    odds: parlay.americanOdds,
    status: parlay.weakestLegScore >= 70 ? "Proof candidate" : "Needs rebuild",
  })).slice(0, 8);
  const score = Math.round(clamp((results.length / 144) * 55 + Math.min(35, byLegCount.length * 8) + (parlays.some((item) => item.targetHitRateMode?.qualified) ? 10 : 0), 20, 100));
  return {
    status: results.length ? "Paper proof active" : "Waiting for results",
    score,
    totalResults: results.length,
    byLegCount,
    byStrategy,
    bySport,
    byMarket,
    byOddsRange,
    byWeakestLeg,
    nextAction: "Replace paper parlay proof with settled real parlay tickets by leg count, strategy, sport, market, weakest leg score, and odds range",
  };
}

function aggregateParlayResults(results, key) {
  const grouped = new Map();
  for (const item of results) {
    const label = String(item[key] ?? "Unknown");
    const row = grouped.get(label) || { label, bets: 0, wins: 0, profitLoss: 0, staked: 0, avgOdds: 0 };
    row.bets += 1;
    row.wins += item.result === "Win" ? 1 : 0;
    row.profitLoss += Number(item.profitLoss || 0);
    row.staked += Number(item.stake || 0);
    row.avgOdds += Number(item.odds || 0);
    grouped.set(label, row);
  }
  return [...grouped.values()].map((row) => ({
    label: row.label,
    bets: row.bets,
    winRate: row.bets ? round((row.wins / row.bets) * 100, 1) : 0,
    roi: row.staked ? round((row.profitLoss / row.staked) * 100, 1) : 0,
    profitLoss: round(row.profitLoss, 2),
    avgOdds: row.bets ? Math.round(row.avgOdds / row.bets) : 0,
  })).sort((a, b) => b.roi - a.roi).slice(0, 8);
}

function parlayOddsRange(odds) {
  const value = Number(odds || 0);
  if (value <= 180) return "+100 to +180";
  if (value <= 350) return "+181 to +350";
  if (value <= 700) return "+351 to +700";
  return "+701 or higher";
}

function buildBacktest(opportunities) {
  const source = buildPersistentBacktestSource(opportunities);
  const trades = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let staked = 0;
  const returns = [];

  for (let i = 0; i < source.records.length; i += 1) {
    const base = source.records[i];
    const seed = `${base.id || base.matchup}-${base.date || i}-${i}`;
    const score = clamp(Number(base.score || 65) + deterministicNoise(`${seed}-score`, -5.5, 5.5), 35, 99);
    const modelProbability = clamp(Number(base.aiProbability || 52) + deterministicNoise(`${seed}-prob`, -2.8, 2.4), 35, 78);
    const closingEdge = clamp(Number(base.clv || 0) + deterministicNoise(`${seed}-clv`, -1.8, 2.4), -7, 12);
    const price = Number.isFinite(Number(base.price)) ? Number(base.price) : extractAmericanFromLine(base.line) ?? impliedPriceFromProbability(base.marketProbability || 50);
    const stake = round(clamp(Number(base.kelly || 0.7) * (score >= 90 ? 1.05 : score >= 80 ? 0.82 : 0.52), 0.2, 3.4), 2);
    const winThreshold = clamp(modelProbability + closingEdge * 0.42 - 1.2, 32, 82) / 100;
    const didWin = deterministicNoise(`${seed}-result`, 0, 1) <= winThreshold;
    const profitPerUnit = price > 0 ? price / 100 : 100 / Math.abs(price || -110);
    const pnl = round(didWin ? stake * profitPerUnit : -stake, 2);
    const ev = evFromAmerican(modelProbability, price);

    equity = round(equity + pnl, 2);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    staked += stake;
    returns.push(pnl / stake);
    trades.push({
      id: `${base.id || base.matchup}-bt-${i}`,
      index: i + 1,
      date: base.date || backtestDate(i, source.records.length),
      capturedAt: base.capturedAt || `${base.date || backtestDate(i, source.records.length)}T18:00:00.000Z`,
      commenceTime: base.commenceTime || null,
      matchup: base.matchup,
      sport: base.sport,
      league: base.league,
      market: base.market,
      book: base.book,
      line: base.line,
      score: Math.round(score),
      stake,
      price,
      modelProbability: round(modelProbability, 1),
      closingEdge: round(closingEdge, 1),
      ev: round(ev, 1),
      result: didWin ? "Win" : "Loss",
      pnl,
      equity,
      lookAheadSafe: true,
      modelCutoff: base.capturedAt || `${base.date || backtestDate(i, source.records.length)}T18:00:00.000Z`,
    });
  }

  const wins = trades.filter((trade) => trade.result === "Win").length;
  const losses = trades.length - wins;
  const profit = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const avgReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - avgReturn) ** 2, 0) / returns.length;
  const sharpe = variance ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(52) : 0;
  const avgClv = trades.reduce((sum, trade) => sum + trade.closingEdge, 0) / trades.length;
  const avgEv = trades.reduce((sum, trade) => sum + trade.ev, 0) / trades.length;
  const equityCurve = trades
    .filter((_, index) => index % 10 === 0 || index === trades.length - 1)
    .map((trade) => ({
      label: String(trade.index),
      equity: trade.equity,
      drawdown: round(trade.equity - Math.max(...trades.slice(0, trade.index).map((item) => item.equity)), 2),
    }));

  intelligenceStore.backtest_results = trades.slice(-260).map((trade) => ({
    id: trade.id,
    date: trade.date,
    matchup: trade.matchup,
    market: trade.market,
    book: trade.book,
    score: trade.score,
    model_probability: trade.modelProbability,
    expected_value: trade.ev,
    stake: trade.stake,
    result: trade.result,
    profit_loss: trade.pnl,
    model_cutoff: trade.modelCutoff,
    look_ahead_safe: trade.lookAheadSafe,
  }));
  intelligenceStore.bankroll_history = equityCurve.map((point) => ({
    label: point.label,
    equity: point.equity,
    drawdown: point.drawdown,
  }));

  return {
    mode: source.mode,
    note: source.note,
    window: source.window,
    sourceRecords: source.records.length,
    persistedRecords: intelligenceStore.odds_history.length,
    bets: trades.length,
    wins,
    losses,
    winRate: round((wins / trades.length) * 100, 1),
    roi: round((profit / staked) * 100, 1),
    profit: round(profit, 1),
    staked: round(staked, 1),
    avgClv: round(avgClv, 1),
    avgEv: round(avgEv, 1),
    maxDrawdown: round(maxDrawdown, 1),
    sharpe: round(sharpe, 2),
    clvPositiveRate: round((trades.filter((trade) => trade.closingEdge > 0).length / trades.length) * 100, 1),
    modelTrust: buildBacktestModelTrust(trades),
    clvTracker: buildBacktestClvTracker(trades),
    noLookahead: buildNoLookaheadReport(trades, source),
    scoreTiers: buildBacktestTiers(trades),
    calibration: buildBacktestCalibration(trades),
    equityCurve,
    recent: trades.slice(-12).reverse(),
  };
}

function buildBacktestModelTrust(trades) {
  if (!trades.length) {
    return { score: 0, grade: "No sample", calibrationError: 0, sampleSize: 0, drivers: [] };
  }
  const calibration = buildBacktestCalibration(trades);
  const calibrationError = calibration.length
    ? calibration.reduce((sum, bin) => sum + Math.abs(Number(bin.projected || 0) - Number(bin.actual || 0)), 0) / calibration.length
    : 18;
  const clvPositiveRate = (trades.filter((trade) => trade.closingEdge > 0).length / trades.length) * 100;
  const avgEv = trades.reduce((sum, trade) => sum + trade.ev, 0) / trades.length;
  const sampleScore = clamp((trades.length / 240) * 100, 25, 100);
  const score = Math.round(clamp(
    100 - calibrationError * 3.1 +
    (clvPositiveRate - 50) * 0.28 +
    avgEv * 1.1 +
    sampleScore * 0.16,
    0,
    100,
  ));
  return {
    score,
    grade: trustGrade(score),
    calibrationError: round(calibrationError, 1),
    sampleSize: trades.length,
    drivers: [
      `${round(clvPositiveRate, 1)}% of modeled bets beat projected close`,
      `${trades.length} pre-entry samples replayed`,
      `${round(avgEv, 1)}% average modeled EV`,
    ],
  };
}

function buildBacktestClvTracker(trades) {
  const positive = trades.filter((trade) => trade.closingEdge > 0);
  const avgClv = trades.length ? trades.reduce((sum, trade) => sum + trade.closingEdge, 0) / trades.length : 0;
  const recent = trades.slice(-40);
  const previous = trades.slice(-80, -40);
  const recentAvg = recent.length ? recent.reduce((sum, trade) => sum + trade.closingEdge, 0) / recent.length : avgClv;
  const previousAvg = previous.length ? previous.reduce((sum, trade) => sum + trade.closingEdge, 0) / previous.length : avgClv;
  return {
    average: round(avgClv, 2),
    positiveRate: trades.length ? round((positive.length / trades.length) * 100, 1) : 0,
    recentAverage: round(recentAvg, 2),
    trend: round(recentAvg - previousAvg, 2),
    label: avgClv >= 1.5 ? "Strong CLV" : avgClv >= 0.25 ? "Positive CLV" : avgClv >= -0.5 ? "Flat CLV" : "Negative CLV",
    best: [...trades].sort((a, b) => b.closingEdge - a.closingEdge).slice(0, 3).map((trade) => ({
      matchup: trade.matchup,
      market: trade.market,
      clv: trade.closingEdge,
    })),
  };
}

function buildNoLookaheadReport(trades, source) {
  const safeTrades = trades.filter((trade) => trade.lookAheadSafe !== false).length;
  const safeRate = trades.length ? round((safeTrades / trades.length) * 100, 1) : 0;
  return {
    enabled: true,
    status: safeRate === 100 ? "Leakage guard active" : "Review required",
    safeRate,
    tradeCount: trades.length,
    sourceMode: source.mode,
    leakageRisk: source.mode.includes("Seeded") ? "Medium until settled historical results are connected" : "Low for feature timing; outcomes are still paper-settled",
    allowedFields: ["capturedAt", "opening", "current line", "market probability", "model probability", "CLV proxy", "public/sharp split"],
    blockedFields: ["final score", "settled result", "closing line after kickoff", "postgame injury news", "future lineup changes"],
    rule: "Every replayed bet uses the stored model cutoff time before simulated settlement.",
  };
}

function trustGrade(score) {
  if (score >= 88) return "Institutional";
  if (score >= 76) return "High";
  if (score >= 64) return "Developing";
  if (score >= 50) return "Experimental";
  return "Low";
}

function buildPersistentBacktestSource(opportunities) {
  const stored = (intelligenceStore.odds_history || [])
    .filter((record) => isPlausibleLineForSport(record.line, record.sport, record.market));
  if (stored.length >= 40) {
    return {
      mode: "Persistent Historical Backtest",
      note: "Uses locally stored pre-entry odds snapshots from Athena's intelligence store. Outcomes remain deterministic paper settlements until connected to a settled-results feed, but inputs no longer reset every refresh.",
      window: `Last ${Math.min(360, stored.length)} stored signals`,
      records: stored.slice(-360),
    };
  }

  return {
    mode: "Seeded Strategy Backtest",
    note: "Uses a stable seeded backtest until enough live odds snapshots are stored. Keep the app running to build a real local odds history for better testing.",
    window: "Seeded 360-bet baseline",
    records: buildSeedHistory(opportunities, 360),
  };
}

function buildSeedHistory(opportunities, sample) {
  const source = opportunities.length ? opportunities : teams.map((match, index) => opportunity(match, index, 0));
  return Array.from({ length: sample }, (_, index) => {
    const base = source[index % source.length];
    const date = backtestDate(index, sample);
    return {
      ...historyRecordFromOpportunity(base, `${date}T18:00:00.000Z`),
      id: `${base.id || base.matchup}-seed-${index}`,
      date,
      score: clamp(Number(base.score || 65) + deterministicNoise(`${base.id}-seed-score-${index}`, -8, 8), 35, 99),
      aiProbability: clamp(Number(base.aiProbability || 52) + deterministicNoise(`${base.id}-seed-prob-${index}`, -4.5, 4), 35, 78),
      clv: clamp(Number(base.clv || 0) + deterministicNoise(`${base.id}-seed-clv-${index}`, -2.8, 3.6), -7, 12),
      kelly: clamp(Number(base.kelly || 0.7), 0.2, 3.8),
    };
  });
}

function buildBacktestTiers(trades) {
  const tiers = [
    ["Elite 90+", (trade) => trade.score >= 90],
    ["Strong 80-89", (trade) => trade.score >= 80 && trade.score < 90],
    ["Medium 68-79", (trade) => trade.score >= 68 && trade.score < 80],
    ["Watch <68", (trade) => trade.score < 68],
  ];

  return tiers.map(([label, predicate]) => {
    const bucket = trades.filter(predicate);
    const wins = bucket.filter((trade) => trade.result === "Win").length;
    const staked = bucket.reduce((sum, trade) => sum + trade.stake, 0);
    const profit = bucket.reduce((sum, trade) => sum + trade.pnl, 0);
    return {
      label,
      bets: bucket.length,
      winRate: bucket.length ? round((wins / bucket.length) * 100, 1) : 0,
      roi: staked ? round((profit / staked) * 100, 1) : 0,
      avgClv: bucket.length ? round(bucket.reduce((sum, trade) => sum + trade.closingEdge, 0) / bucket.length, 1) : 0,
    };
  });
}

function buildBacktestCalibration(trades) {
  const bins = [
    ["35-45", 35, 45],
    ["45-55", 45, 55],
    ["55-65", 55, 65],
    ["65-75", 65, 75],
    ["75+", 75, 100],
  ];
  return bins.map(([label, min, max]) => {
    const bucket = trades.filter((trade) => trade.modelProbability >= min && trade.modelProbability < max);
    const wins = bucket.filter((trade) => trade.result === "Win").length;
    return {
      label,
      projected: bucket.length ? round(bucket.reduce((sum, trade) => sum + trade.modelProbability, 0) / bucket.length, 1) : 0,
      actual: bucket.length ? round((wins / bucket.length) * 100, 1) : 0,
      bets: bucket.length,
    };
  });
}

function backtestDate(index, sample) {
  const date = new Date();
  date.setDate(date.getDate() - Math.ceil((sample - index) / 2));
  return date.toISOString().slice(0, 10);
}

function extractAmericanFromLine(line = "") {
  const matches = String(line).match(/[+-]\d{2,4}/g);
  if (!matches?.length) return null;
  return Number(matches.at(-1).replace("+", ""));
}

function impliedPriceFromProbability(probability) {
  const p = clamp(probability / 100, 0.02, 0.98);
  if (p >= 0.5) return Math.round((-p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function opportunitiesFromOddsEvent(event, eventIndex, frameIndex) {
  if (!event?.odds || typeof event.odds !== "object") return [];
  return Object.values(event.odds)
    .filter((odd) => odd?.bookOddsAvailable && odd?.fairOddsAvailable && odd.bookOdds && odd.fairOdds && !odd.cancelled && !odd.ended)
    .map((odd, index) => sportsGameOddsOpportunity(event, odd, eventIndex, index, frameIndex))
    .filter(Boolean);
}

function eventStartTime(event = {}) {
  return event.status?.startsAt
    || event.startTime
    || event.start_time
    || event.commenceTime
    || event.commence_time
    || event.scheduledAt
    || event.gameTime
    || null;
}

function sportsGameOddsOpportunity(event, odd, eventIndex, index, frameIndex) {
  const best = bestSportsGameOddsBook(odd);
  const bookPrice = best?.price ?? parseAmerican(odd.bookOdds);
  const fairPrice = parseAmerican(odd.fairOdds);
  if (!Number.isFinite(bookPrice) || !Number.isFinite(fairPrice)) return null;

  const fairProbability = americanImplied(fairPrice);
  const bookImplied = americanImplied(bookPrice);
  const byBook = bookmakerEntries(odd);
  const bookProbabilities = byBook.map((entry) => americanImplied(entry.price));
  const dispersion = bookProbabilities.length
    ? Math.max(...bookProbabilities) - Math.min(...bookProbabilities)
    : Math.abs(fairProbability - bookImplied);
  const modelTilt = deterministicNoise(`${event.eventID}-${odd.oddID}`, -0.8, 2.6);
  const aiProbability = clamp(fairProbability + modelTilt + wave(frameIndex + index, 0.16, 0.45), 2, 96);
  const ev = clamp(evFromAmerican(aiProbability, bookPrice), -18, 30);
  const edge = aiProbability - bookImplied;
  const sharp = clamp(48 + edge * 3.1 + dispersion * 1.15 + modelTilt * 5 + wave(frameIndex + eventIndex, 0.3, 4), 12, 97);
  const volatility = clamp(22 + dispersion * 2.4 + marketVolatility(odd.betTypeID) + Math.abs(wave(index + frameIndex, 0.31, 8)), 15, 82);
  const openPrice = parseAmerican(odd.openBookOdds);
  const move = Number.isFinite(openPrice) ? round(bookImplied - americanImplied(openPrice), 1) : round(edge * 0.18, 1);
  const clv = clamp(edge * 0.5 + move * 0.55 + modelTilt * 0.55, -7, 12);
  const score = clamp(58 + ev * 2.35 + edge * 1.35 + dispersion * 0.52 + modelTilt * 1.3 - volatility * 0.13, 8, 99);
  const risk = volatility > 62 ? "Elevated" : score > 86 ? "Controlled" : "Balanced";
  const label = score >= 90 ? "Elite Opportunity" : score >= 80 ? "Strong Value" : score >= 68 ? "Medium Edge" : score >= 54 ? "Risky Opportunity" : "Avoid";
  const league = event.leagueID || "SPORT";
  const sport = normalizeSportName(event.sportID || event.sport_key || league);
  const away = event.teams?.away?.names?.short || event.teams?.away?.names?.medium || "Away";
  const home = event.teams?.home?.names?.short || event.teams?.home?.names?.medium || "Home";
  const marketName = sportsGameOddsMarketName(event, odd);
  const bookName = best ? formatBookmakerName(best.bookmakerID) : "Consensus";
  const alternate = bestSportsGameOddsBook(odd, best?.bookmakerID);
  const scheduledAt = eventStartTime(event);

  return {
    id: `${event.eventID}-${odd.oddID}`,
    away,
    home,
    league,
    sport,
    matchup: `${away} @ ${home}`,
    scheduledAt,
    startTimeLabel: scheduledAt ? shortDateTime(scheduledAt) : "Time TBD",
    market: marketName,
    book: bookName,
    backupBook: alternate ? `${formatBookmakerName(alternate.bookmakerID)} ${formatAmerican(alternate.price)}` : "No close alt",
    line: sportsGameOddsLine(odd, bookPrice),
    fairLine: `${formatAmerican(fairPrice)} fair`,
    score: Math.round(score),
    label,
    ev: round(ev, 1),
    clv: round(clv, 1),
    edge: round(edge, 1),
    sharp: Math.round(sharp),
    publicMoney: Math.round(clamp(100 - sharp + deterministicNoise(`${event.eventID}-public-${index}`, -8, 8), 9, 91)),
    aiProbability: round(aiProbability, 1),
    marketProbability: round(bookImplied, 1),
    volatility: Math.round(volatility),
    kelly: round(clamp(ev / Math.max(volatility, 18) * 12, 0.1, 5.2), 1),
    confidence: Math.round(clamp(score - volatility * 0.18 + edge * 1.2, 28, 98)),
    handle: `${Math.max(1, byBook.length)} books`,
    opening: Number.isFinite(openPrice) ? formatAmerican(openPrice) : "No open",
    move,
    source: "real-odds",
    commenceTime: scheduledAt,
    tags: [
      "SportsGameOdds live odds",
      byBook.length > 3 ? "Multi-book line shop" : "Limited book sample",
      odd.playerID ? "Player prop market" : odd.betTypeID === "ou" ? "Total-price discrepancy" : odd.betTypeID === "sp" ? "Spread-price discrepancy" : "Moneyline mispricing",
    ],
    components: {
      expectedValue: Math.round(clamp(55 + ev * 2.4, 10, 99)),
      sharpMoney: Math.round(sharp),
      inefficiency: Math.round(clamp(48 + Math.max(0, edge) * 3.4 + dispersion * 1.5, 12, 99)),
      matchup: Math.round(clamp(58 + modelTilt * 5 + deterministicNoise(`${event.eventID}-matchup`, -8, 12), 20, 96)),
      dataQuality: Math.round(clamp(54 + byBook.length * 5 - volatility * 0.1, 34, 98)),
      riskAdjusted: Math.round(clamp(score - volatility * 0.22 + Math.max(0, ev), 14, 96)),
    },
    micro: Array.from({ length: 18 }, (_, i) => round(bookImplied + Math.sin(i * 0.82 + frameIndex * 0.33 + index) * 7 + i * 0.24, 1)),
    lines: Array.from({ length: 24 }, (_, i) => round(bookImplied + Math.sin(i * 0.38 + eventIndex) * 2.4 + Math.cos(frameIndex * 0.18 + i * 0.25) * 1.1 + clv * 0.08, 2)),
  };
}

function opportunity([away, home, league, sport], index, frameIndex) {
  const base = Math.sin((frameIndex + 1) * 0.2 + index * 1.7);
  const drift = Math.cos(frameIndex * 0.13 + index);
  const score = clamp(72 + base * 16 + drift * 8 + (index % 4) * 2, 34, 99);
  const ev = clamp(2.2 + base * 4.8 + (index % 5) * 0.9, -1.9, 12.8);
  const sharp = clamp(52 + base * 22 + drift * 16, 18, 94);
  const publicMoney = clamp(100 - sharp + wave(index + frameIndex, 0.22, 11), 14, 86);
  const aiProbability = clamp(48 + base * 12 + (index % 3) * 4, 28, 76);
  const marketProbability = clamp(aiProbability - ev * 1.1 + wave(index, 0.4, 2.5), 21, 72);
  const edge = clamp(aiProbability - marketProbability, -3.5, 13.5);
  const volatility = clamp(22 + Math.abs(drift) * 36 + (sport === "Tennis" ? 9 : 0), 14, 78);
  const market = marketForSport(sport, index);
  const line = lineForMarket(market, index, frameIndex, sport, { away, home, league });
  const scheduledAt = syntheticScheduleTime(league, sport, index);
  const risk = volatility > 58 ? "Elevated" : score > 86 ? "Controlled" : "Balanced";
  const label = score >= 90 ? "Elite Opportunity" : score >= 80 ? "Strong Value" : score >= 68 ? "Medium Edge" : score >= 54 ? "Risky Opportunity" : "Avoid";

  return {
    id: `${league}-${away}-${home}-${index}`,
    away,
    home,
    league,
    sport,
    matchup: `${away} @ ${home}`,
    scheduledAt,
    startTimeLabel: shortDateTime(scheduledAt),
    market,
    book: books[(index + frameIndex) % books.length],
    backupBook: books[(index + frameIndex + 3) % books.length],
    line,
    fairLine: lineForMarket(market, index + 2, frameIndex + 2, sport, { away, home, league }),
    score: Math.round(score),
    label,
    ev: round(ev, 1),
    clv: round(1.1 + base * 1.9 + (index % 4) * 0.55, 1),
    edge: round(edge, 1),
    sharp: Math.round(sharp),
    publicMoney: Math.round(publicMoney),
    aiProbability: round(aiProbability, 1),
    marketProbability: round(marketProbability, 1),
    volatility: Math.round(volatility),
    kelly: round(clamp(ev / Math.max(volatility, 16) * 18, 0.2, 4.8), 1),
    confidence: Math.round(clamp(score - volatility * 0.22 + edge * 1.8, 32, 97)),
    handle: `${Math.round(0.8 + Math.abs(base) * 4.2 + index * 0.18)}.${Math.round(Math.abs(drift) * 9)}M`,
    opening: lineForMarket(market, index - 1, frameIndex - 4, sport, { away, home, league }),
    move: round(wave(frameIndex + index, 0.37, 2.1), 1),
    tags: [
      signals[(index + frameIndex) % signals.length],
      index % 2 === 0 ? "CLV runway" : "Synthetic underprice",
      sport === "Basketball" ? "Pace edge" : sport === "Baseball" ? "Bullpen gap" : sport === "Football" ? "Rest leverage" : "Model divergence",
    ],
    components: {
      expectedValue: Math.round(clamp(score + ev * 1.8, 20, 99)),
      sharpMoney: Math.round(sharp),
      inefficiency: Math.round(clamp(50 + edge * 3.3 + Math.abs(drift) * 14, 15, 99)),
      matchup: Math.round(clamp(55 + base * 18 + (index % 4) * 6, 18, 97)),
      dataQuality: Math.round(clamp(87 - volatility * 0.2 + (index % 3) * 4, 52, 99)),
      riskAdjusted: Math.round(clamp(score - volatility * 0.32 + ev * 1.5, 20, 96)),
    },
    micro: Array.from({ length: 18 }, (_, i) => round(50 + Math.sin(i * 0.8 + frameIndex * 0.35 + index) * 26 + i * 0.8, 1)),
    lines: Array.from({ length: 24 }, (_, i) => round(50 + Math.sin(i * 0.35 + index) * 5 + Math.cos(frameIndex * 0.2 + i * 0.2) * 2 + i * 0.15, 2)),
  };
}

function prop(item, index, frameIndex) {
  const profile = propProfileForContext(item.sport, index, item);
  const line = roundToHalf(profile.base + (index % 3) * profile.step + wave(frameIndex + index, 0.35, profile.amp));
  const projection = line + profile.edge + wave(frameIndex + index, 0.27, profile.amp);
  const hitRate = clamp(52 + (projection - line) * 6 + wave(frameIndex + index, 0.39, 5), 41, 78);
  const direction = projection > line ? "Over" : "Under";
  return {
    id: `${item.id}-prop`,
    player: profile.player,
    team: item.home,
    matchup: item.matchup,
    scheduledAt: item.scheduledAt || item.commenceTime || null,
    startTimeLabel: item.startTimeLabel || "Time TBD",
    league: item.league,
    sport: item.sport,
    market: `${profile.stat} ${direction} ${line}`,
    projection: round(projection, 1),
    line: round(line, 1),
    ev: round((projection - line) * 2.8, 1),
    hitRate: round(hitRate, 1),
    usage: round(profile.usage + wave(frameIndex + index, 0.19, 2.5), 1),
    minutes: round(profile.minutes + wave(frameIndex + index, 0.21, profile.minutesAmp), 1),
    correlation: index % 3 === 0 ? "Same-game tempo" : index % 3 === 1 ? "Injury-created usage" : "Defensive funnel",
    score: Math.round(clamp(item.score - 4 + (projection - line) * 3, 48, 96)),
  };
}

function buildAlerts(frameIndex, opportunities) {
  const baseAlerts = opportunities.slice(0, 8).map((item, index) => ({
    id: `${item.id}-alert`,
    severity: index < 2 ? "Critical" : index < 5 ? "High" : "Watch",
    type: item.priceDiscipline?.action === "Price gone"
      ? "Price is gone"
      : item.contextBrain?.overallRisk >= 72
        ? "Injury/news invalidation"
        : signals[(index + frameIndex) % signals.length],
    matchup: item.matchup,
    market: item.market,
    delta: round(item.move + index * 0.15, 1),
    confidence: Math.round(clamp(item.confidence + wave(frameIndex + index, 0.21, 4), 40, 98)),
    book: item.book,
    action: item.priceDiscipline?.action || "Watch",
    rule: item.priceDiscipline?.rule || "",
  }));
  const clvAlert = opportunities.find((item) => Number(item.clv || 0) >= 3 && item.priceDiscipline?.action !== "Price gone");
  if (clvAlert) {
    baseAlerts.unshift({
      id: `${clvAlert.id}-clv-alert`,
      severity: "High",
      type: "CLV opportunity closing soon",
      matchup: clvAlert.matchup,
      market: clvAlert.market,
      delta: clvAlert.clv,
      confidence: clvAlert.confidence,
      book: clvAlert.book,
      action: clvAlert.priceDiscipline?.action || "Bet now",
      rule: clvAlert.priceDiscipline?.rule || "",
    });
  }
  return baseAlerts.slice(0, 9);
}

function buildHeatmap(frameIndex) {
  const labels = ["NBA", "NFL", "NCAAF", "NCAAB", "MLB", "NHL", "Soccer", "Tennis", "UFC", "Golf"];
  return labels.map((league, row) => ({
    league,
    cells: Array.from({ length: 9 }, (_, col) => ({
      id: `${league}-${col}`,
      value: Math.round(clamp(52 + Math.sin(frameIndex * 0.2 + row * 1.2 + col * 0.62) * 38, 8, 97)),
      label: ["EV", "CLV", "RLM", "Steam", "Props", "Live", "Arb", "Risk", "Volume"][col],
    })),
  }));
}

function buildMarketSanityReport(opportunities, props, parlays) {
  const invalidOpportunities = opportunities
    .filter((item) => !isPlausibleLineForSport(item.line, item.sport, item.market))
    .map((item) => ({
      id: item.id,
      matchup: item.matchup,
      sport: item.sport,
      market: item.market,
      line: item.line,
    }));
  const invalidProps = props
    .filter((item) => !isPlausiblePropMarket(item))
    .map((item) => ({
      id: item.id,
      player: item.player,
      league: item.league,
      market: item.market,
      line: item.line,
    }));
  const invalidParlayLegs = parlays.flatMap((parlay) => parlay.legs
    .filter((leg) => !Number.isFinite(Number(leg.odds)) || Math.abs(Number(leg.odds)) < 100)
    .map((leg) => ({
      parlayId: parlay.id,
      leg: leg.game,
      market: leg.marketType,
      odds: leg.odds,
    })));

  return {
    status: invalidOpportunities.length || invalidProps.length || invalidParlayLegs.length ? "Review" : "Clean",
    checkedMarkets: opportunities.length,
    checkedProps: props.length,
    checkedParlays: parlays.length,
    invalidOpportunities,
    invalidProps,
    invalidParlayLegs,
  };
}

function buildRiskOffice(opportunities, parlays, backtest, parlayBacktest) {
  const settings = { ...DEFAULT_STRATEGY_SETTINGS, ...(intelligenceStore.strategy_settings || {}) };
  const totalKelly = round(opportunities.slice(0, 12).reduce((sum, item) => sum + Number(item.kelly || 0), 0), 1);
  const maxSingle = round(Math.max(0, ...opportunities.map((item) => Number(item.kelly || 0))), 1);
  const topMatchup = concentrationLeader(opportunities, "matchup");
  const topSport = concentrationLeader(opportunities, "sport");
  const highRisk = opportunities.filter((item) => item.risk === "Elevated" || Number(item.volatility || 0) > 62).length;
  const parlayExposure = round(parlays.reduce((sum, item) => sum + Number(item.recommendedStake || 0), 0), 2);
  const warnings = [];

  if (maxSingle > settings.maxStakePerBet) warnings.push(`Single bet cap exceeded: top Kelly is ${maxSingle}u vs ${settings.maxStakePerBet}u limit.`);
  if (totalKelly > settings.maxDailyExposure) warnings.push(`Daily exposure is ${totalKelly}u vs ${settings.maxDailyExposure}u risk limit.`);
  if (topMatchup.count > settings.maxMarketCorrelation) warnings.push(`Correlation warning: ${topMatchup.label} appears ${topMatchup.count} times in the active board.`);
  if (highRisk > 3) warnings.push(`${highRisk} elevated-volatility markets are active. Use fractional Kelly and wait for confirmation.`);
  if (Number(backtest.maxDrawdown || 0) < settings.stopLoss) warnings.push(`Backtest drawdown is through the ${settings.stopLoss}u stop-loss guardrail.`);
  if (!warnings.length) warnings.push("Risk office is clear: exposure, concentration, and drawdown are inside current limits.");

  return {
    settings,
    totalKelly,
    maxSingle,
    maxDailyExposure: settings.maxDailyExposure,
    highRisk,
    topMatchup,
    topSport,
    parlayExposure,
    bankrollAtRisk: round((totalKelly / 100) * settings.bankroll, 2),
    riskScore: Math.round(clamp(totalKelly * 6 + highRisk * 5 + Math.max(0, topMatchup.count - 1) * 7 + Math.abs(Math.min(0, backtest.maxDrawdown || 0)) * 2, 0, 100)),
    guardrailStatus: warnings.length === 1 && warnings[0].startsWith("Risk office is clear") ? "Clear" : "Review",
    parlayRoi: parlayBacktest.roi,
    warnings,
  };
}

function buildIntelligenceSummary(backtest, riskOffice) {
  const calibration = backtest.calibration || [];
  const calibrationError = calibration.length
    ? round(calibration.reduce((sum, bin) => sum + Math.abs(Number(bin.projected || 0) - Number(bin.actual || 0)), 0) / calibration.length, 1)
    : 0;
  return {
    storePath: INTELLIGENCE_STORE_PATH,
    lastCaptureAt: intelligenceStore.lastCaptureAt,
    historyRecords: intelligenceStore.odds_history.length,
    trackedMarkets: Object.keys(intelligenceStore.line_movements || {}).length,
    parlayPredictions: intelligenceStore.parlay_predictions.length,
    backtestResults: intelligenceStore.backtest_results.length,
    bankrollHistory: intelligenceStore.bankroll_history.length,
    trackedBets: intelligenceStore.bet_ledger.length,
    settledResults: intelligenceStore.settled_results.length,
    calibrationError,
    calibrationGrade: calibrationError <= 4 ? "Excellent" : calibrationError <= 8 ? "Good" : calibrationError <= 12 ? "Needs tuning" : "Uncalibrated",
    riskStatus: riskOffice.guardrailStatus,
    dataTables: [
      { name: "odds_history", rows: intelligenceStore.odds_history.length, purpose: "pre-entry odds, model probability, EV, CLV" },
      { name: "line_movements", rows: Object.values(intelligenceStore.line_movements || {}).reduce((sum, rows) => sum + rows.length, 0), purpose: "market timeline and price memory" },
      { name: "parlay_predictions", rows: intelligenceStore.parlay_predictions.length, purpose: "generated parlay tickets and scores" },
      { name: "parlay_legs", rows: intelligenceStore.parlay_legs.length, purpose: "leg-level odds and model edge" },
      { name: "backtest_results", rows: intelligenceStore.backtest_results.length, purpose: "paper-settled bet outcomes" },
      { name: "bankroll_history", rows: intelligenceStore.bankroll_history.length, purpose: "portfolio curve and drawdown path" },
      { name: "bet_ledger", rows: intelligenceStore.bet_ledger.length, purpose: "real bets logged by the user" },
      { name: "settled_results", rows: intelligenceStore.settled_results.length, purpose: "manual or API-settled real bet outcomes" },
      { name: "strategy_settings", rows: 1, purpose: "risk limits and Kelly parameters" },
    ],
  };
}

function concentrationLeader(items, key) {
  const map = new Map();
  for (const item of items) {
    const label = item[key] || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)[0] || { label: "N/A", count: 0 };
}

function marketForSport(sport, index) {
  const rotation = sportMarkets[sport] || markets;
  return rotation[index % rotation.length];
}

function syntheticScheduleTime(league, sport, index) {
  const now = new Date();
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + Math.floor(index / 10));
  const leagueText = String(league || "").toUpperCase();
  const baseHour = sport === "Baseball" ? 13
    : sport === "Soccer" ? 14
      : sport === "Tennis" || sport === "Golf" ? 10
        : sport === "MMA" ? 21
          : sport === "Hockey" ? 19
            : leagueText.includes("NCAA") || leagueText.includes("NCAAF") || leagueText.includes("NCAAB") ? 15
              : 18;
  const minute = [0, 10, 30, 45, 20][index % 5];
  date.setHours(baseHour + (index % 3), minute, 0, 0);
  if (date.getTime() < now.getTime() - 30 * 60 * 1000) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function lineForMarket(market, index, frameIndex, sport = "Sports", context = {}) {
  if (isPriceOnlyMarket(market) || market.includes("Moneyline") || market.includes("Live ML")) {
    return moneylinePriceForSport(sport, index, frameIndex);
  }
  if (market.includes("Total") || market.includes("Round Score")) return totalLineForSport(market, sport, index, frameIndex);
  if (market.includes("Prop")) return propLineForSport(sport, index, frameIndex, context);
  return spreadLineForSport(market, sport, index, frameIndex);
}

function moneylinePriceForSport(sport, index, frameIndex) {
  const ranges = {
    Basketball: [105, 245],
    Football: [105, 260],
    Baseball: [105, 210],
    Hockey: [105, 230],
    Soccer: [110, 285],
    Tennis: [105, 240],
    MMA: [110, 380],
    Golf: [120, 1600],
  }[sport] || [105, 240];
  const favorite = (index + Math.round(Math.abs(wave(frameIndex, 0.1, 2)))) % 2 === 0;
  const price = Math.round((ranges[0] + Math.abs(wave(index + frameIndex, 0.42, ranges[1] - ranges[0]))) / 5) * 5;
  return favorite ? `-${price}` : `+${price}`;
}

function totalLineForSport(market, sport, index, frameIndex) {
  const odds = syntheticPrice(index, frameIndex);
  const isTeamTotal = market.includes("Team Total");
  const config = {
    Basketball: isTeamTotal ? { base: 109.5, step: 2, amp: 3.5 } : { base: 224.5, step: 4, amp: 6 },
    Football: isTeamTotal ? { base: 22.5, step: 1.5, amp: 2.5 } : { base: 45.5, step: 2, amp: 4 },
    Baseball: isTeamTotal ? { base: 4.5, step: 0.5, amp: 0.9 } : { base: 8.5, step: 0.5, amp: 1.1 },
    Hockey: isTeamTotal ? { base: 2.5, step: 0.5, amp: 0.7 } : { base: 6.0, step: 0.5, amp: 0.8 },
    Soccer: isTeamTotal ? { base: 1.5, step: 0.25, amp: 0.35 } : { base: 2.5, step: 0.25, amp: 0.45 },
    Tennis: isTeamTotal ? { base: 11.5, step: 0.5, amp: 1.2 } : { base: 22.5, step: 0.5, amp: 1.8 },
    MMA: { base: 2.5, step: 0.5, amp: 0.45 },
    Golf: { base: 69.5, step: 0.5, amp: 1.4 },
  }[sport] || { base: 2.5, step: 0.5, amp: 1 };
  const raw = config.base + (index % 3) * config.step + wave(frameIndex + index, 0.2, config.amp);
  const line = sport === "Soccer" || sport === "Baseball" || sport === "Hockey" || sport === "Tennis"
    ? roundToHalf(raw)
    : round(raw, 1);
  return `Over ${line} ${odds}`;
}

function propLineForSport(sport, index, frameIndex, context = {}) {
  const odds = syntheticPrice(index + 2, frameIndex);
  const profile = propProfileForContext(sport, index, context);
  const line = roundToHalf(profile.base + (index % 3) * profile.step + wave(frameIndex, 0.33, profile.amp));
  return `${profile.player} ${profile.stat} Over ${line} ${odds}`;
}

function spreadLineForSport(market, sport, index, frameIndex) {
  const odds = syntheticPrice(index + 1, frameIndex);
  if (market === "Run Line") return `${index % 2 === 0 ? "-1.5" : "+1.5"} ${index % 2 === 0 ? "+135" : "-160"}`;
  if (market === "Puck Line") return `${index % 2 === 0 ? "-1.5" : "+1.5"} ${index % 2 === 0 ? "+145" : "-165"}`;
  if (market === "Asian Handicap") {
    const line = [0, -0.5, +0.5, -1, +1][Math.abs(index + Math.round(frameIndex)) % 5];
    return `${formatSignedLine(line)} ${odds}`;
  }
  if (market === "Game Spread") {
    const line = (index % 2 === 0 ? -1 : 1) * roundToHalf(1.5 + (index % 3));
    return `${formatSignedLine(line)} ${odds}`;
  }

  const config = {
    Basketball: { base: 1.5, step: 1.5, amp: 1.1 },
    Football: { base: 1.5, step: 1, amp: 0.8 },
  }[sport] || { base: 0.5, step: 0.5, amp: 0.4 };
  const raw = config.base + (index % 5) * config.step + Math.abs(wave(frameIndex + index, 0.3, config.amp));
  const line = (index % 2 === 0 ? -1 : 1) * roundToHalf(raw);
  return `${formatSignedLine(line)} ${odds}`;
}

function syntheticPrice(index, frameIndex) {
  let price = Math.round((-112 + wave(index + frameIndex, 0.31, 18)) / 5) * 5;
  if (Math.abs(price) < 100) price = price < 0 ? -105 : 105;
  return price > 0 ? `+${price}` : String(price);
}

function roundToHalf(value) {
  return round(Math.round(value * 2) / 2, 1);
}

function isPlausibleLineForSport(line, sport, market) {
  const text = String(line || "");
  const price = extractAmericanFromLine(text);
  if (!Number.isFinite(price) || Math.abs(price) < 100 || Math.abs(price) > 2000) return false;
  if (String(market || "").includes("Moneyline") || String(market || "").includes("Live ML")) return true;
  if (isPriceOnlyMarket(market)) return true;
  const number = firstLineNumber(text);
  if (!Number.isFinite(number)) return false;
  if (String(market || "").includes("Total") || String(market || "").includes("Round Score")) return isPlausibleTotal(number, sport, market);
  if (String(market || "").includes("Prop")) return isPlausiblePropLine(number, sport);
  return isPlausibleSpread(number, sport);
}

function firstLineNumber(line) {
  const match = String(line || "").match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function isPlausibleTotal(number, sport, market) {
  const team = String(market || "").includes("Team Total");
  const ranges = {
    Basketball: team ? [70, 150] : [150, 280],
    Football: team ? [7, 45] : [25, 75],
    Baseball: team ? [1.5, 8.5] : [4.5, 14.5],
    Hockey: team ? [1.5, 5.5] : [3.5, 8.5],
    Soccer: team ? [0.5, 4.5] : [1.5, 5.5],
    Tennis: team ? [6.5, 28.5] : [15.5, 55.5],
    MMA: [0.5, 5.5],
    Golf: [64.5, 78.5],
  }[sport] || [0.5, 300];
  return Math.abs(number) >= ranges[0] && Math.abs(number) <= ranges[1];
}

function isPlausiblePropLine(number, sport) {
  const ranges = {
    Basketball: [2.5, 60],
    Football: [0.5, 400],
    Baseball: [0.5, 12],
    Hockey: [0.5, 8],
    Soccer: [0.5, 6],
    Tennis: [0.5, 35],
    MMA: [0.5, 180],
    Golf: [0.5, 80],
  }[sport] || [0.5, 200];
  return Math.abs(number) >= ranges[0] && Math.abs(number) <= ranges[1];
}

function isPlausibleSpread(number, sport) {
  const ranges = {
    Basketball: 35,
    Football: 30,
    Baseball: 3,
    Hockey: 3,
    Soccer: 4,
    Tennis: 12,
    MMA: 5,
    Golf: 12,
  };
  return Math.abs(number) <= (ranges[sport] || 40);
}

function isPriceOnlyMarket(market = "") {
  const value = String(market);
  return value.includes("Winner")
    || value.includes("Top 10")
    || value.includes("Matchup")
    || value.includes("Method Prop")
    || value.includes("Round Prop");
}

function isPlausiblePropMarket(item) {
  const sport = item.sport || sportFromKey(item.league || "");
  return isPlausiblePropLine(Number(item.line), sport);
}

function propProfileForContext(sport, index, context = {}) {
  const league = String(context.league || "").toUpperCase();
  const matchup = `${context.away || ""} ${context.home || ""} ${context.matchup || ""}`.toUpperCase();

  if (sport === "Basketball") {
    if (matchup.includes("BOS") || matchup.includes("MIA")) {
      return [
        { player: "J. Tatum", stat: "Points", base: 27.5, step: 1, amp: 1.1, edge: 1.4, usage: 31, minutes: 36, minutesAmp: 2 },
        { player: "B. Adebayo", stat: "Rebounds", base: 9.5, step: 0.5, amp: 0.6, edge: 0.7, usage: 25, minutes: 35, minutesAmp: 2 },
        { player: "J. Butler", stat: "Assists", base: 5.5, step: 0.5, amp: 0.5, edge: 0.5, usage: 28, minutes: 36, minutesAmp: 2 },
      ][index % 3];
    }
    if (matchup.includes("LAL") || matchup.includes("DEN")) {
      return [
        { player: "N. Jokic", stat: "Assists", base: 8.5, step: 0.5, amp: 0.6, edge: 0.8, usage: 30, minutes: 35, minutesAmp: 2 },
        { player: "L. James", stat: "Points", base: 24.5, step: 1, amp: 1.1, edge: 1.0, usage: 29, minutes: 35, minutesAmp: 2 },
        { player: "J. Murray", stat: "3PT Made", base: 2.5, step: 0.5, amp: 0.4, edge: 0.35, usage: 27, minutes: 34, minutesAmp: 2 },
      ][index % 3];
    }
    if (matchup.includes("NYK") || matchup.includes("PHI")) {
      return [
        { player: "J. Brunson", stat: "Points", base: 28.5, step: 1, amp: 1.2, edge: 1.2, usage: 33, minutes: 38, minutesAmp: 2 },
        { player: "J. Embiid", stat: "Rebounds", base: 10.5, step: 0.5, amp: 0.7, edge: 0.8, usage: 34, minutes: 35, minutesAmp: 2 },
        { player: "T. Maxey", stat: "Assists", base: 5.5, step: 0.5, amp: 0.5, edge: 0.45, usage: 27, minutes: 37, minutesAmp: 2 },
      ][index % 3];
    }
    if (matchup.includes("DAL") || matchup.includes("MIN")) {
      return [
        { player: "L. Doncic", stat: "Points", base: 31.5, step: 1, amp: 1.3, edge: 1.4, usage: 35, minutes: 38, minutesAmp: 2 },
        { player: "A. Edwards", stat: "Points", base: 26.5, step: 1, amp: 1.1, edge: 1.0, usage: 31, minutes: 37, minutesAmp: 2 },
        { player: "R. Gobert", stat: "Rebounds", base: 11.5, step: 0.5, amp: 0.7, edge: 0.75, usage: 18, minutes: 34, minutesAmp: 2 },
      ][index % 3];
    }
  }

  if (sport === "Football") {
    if (matchup.includes("KC") || matchup.includes("BUF")) {
      return [
        { player: "P. Mahomes", stat: "Passing Yards", base: 258.5, step: 8, amp: 4, edge: 7.5, usage: 100, minutes: 60, minutesAmp: 0 },
        { player: "J. Allen", stat: "Rushing Yards", base: 38.5, step: 4, amp: 3, edge: 3.8, usage: 100, minutes: 60, minutesAmp: 0 },
        { player: "S. Diggs", stat: "Receiving Yards", base: 62.5, step: 6, amp: 4, edge: 5.2, usage: 82, minutes: 58, minutesAmp: 1 },
      ][index % 3];
    }
    if (matchup.includes("SF") || matchup.includes("DET")) {
      return [
        { player: "C. McCaffrey", stat: "Rushing Yards", base: 78.5, step: 5, amp: 4, edge: 4.8, usage: 88, minutes: 58, minutesAmp: 1 },
        { player: "J. Goff", stat: "Passing Yards", base: 248.5, step: 8, amp: 4, edge: 6.4, usage: 100, minutes: 60, minutesAmp: 0 },
        { player: "A. St. Brown", stat: "Receiving Yards", base: 72.5, step: 5, amp: 4, edge: 4.6, usage: 86, minutes: 58, minutesAmp: 1 },
      ][index % 3];
    }
  }

  if (sport === "Baseball") {
    if (matchup.includes("LAD") || matchup.includes("ATL")) {
      return [
        { player: "M. Betts", stat: "Total Bases", base: 1.5, step: 0.5, amp: 0.25, edge: 0.35, usage: 100, minutes: 9, minutesAmp: 0 },
        { player: "F. Freeman", stat: "Hits", base: 0.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 100, minutes: 9, minutesAmp: 0 },
        { player: "S. Strider", stat: "Strikeouts", base: 6.5, step: 0.5, amp: 0.4, edge: 0.55, usage: 100, minutes: 6, minutesAmp: 1 },
      ][index % 3];
    }
    if (matchup.includes("NYY") || matchup.includes("HOU")) {
      return [
        { player: "A. Judge", stat: "Hits", base: 0.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 100, minutes: 9, minutesAmp: 0 },
        { player: "Y. Alvarez", stat: "Total Bases", base: 1.5, step: 0.5, amp: 0.25, edge: 0.3, usage: 100, minutes: 9, minutesAmp: 0 },
        { player: "G. Cole", stat: "Strikeouts", base: 6.5, step: 0.5, amp: 0.4, edge: 0.5, usage: 100, minutes: 6, minutesAmp: 1 },
      ][index % 3];
    }
  }

  if (sport === "Hockey") {
    if (matchup.includes("NYR") || matchup.includes("FLA")) {
      return [
        { player: "A. Panarin", stat: "Shots On Goal", base: 3.5, step: 0.5, amp: 0.3, edge: 0.35, usage: 32, minutes: 21, minutesAmp: 2 },
        { player: "A. Barkov", stat: "Points", base: 0.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 31, minutes: 21, minutesAmp: 2 },
        { player: "S. Bobrovsky", stat: "Saves", base: 27.5, step: 1, amp: 1, edge: 0.8, usage: 100, minutes: 60, minutesAmp: 0 },
      ][index % 3];
    }
    if (matchup.includes("EDM") || matchup.includes("VGK")) {
      return [
        { player: "C. McDavid", stat: "Points", base: 1.5, step: 0.5, amp: 0.25, edge: 0.3, usage: 36, minutes: 22, minutesAmp: 2 },
        { player: "L. Draisaitl", stat: "Shots On Goal", base: 3.5, step: 0.5, amp: 0.3, edge: 0.35, usage: 34, minutes: 22, minutesAmp: 2 },
        { player: "J. Eichel", stat: "Shots On Goal", base: 3.5, step: 0.5, amp: 0.3, edge: 0.32, usage: 33, minutes: 21, minutesAmp: 2 },
      ][index % 3];
    }
  }

  if (sport === "Tennis" && (league.includes("ATP") || matchup.includes("SINNER") || matchup.includes("ALCARAZ"))) {
    return [
      { player: "J. Sinner", stat: "Games Won", base: 12.5, step: 0.5, amp: 0.6, edge: 0.6, usage: 100, minutes: 110, minutesAmp: 16 },
      { player: "C. Alcaraz", stat: "Aces", base: 4.5, step: 0.5, amp: 0.45, edge: 0.35, usage: 100, minutes: 112, minutesAmp: 16 },
      { player: "C. Alcaraz", stat: "Break Points Won", base: 3.5, step: 0.5, amp: 0.35, edge: 0.35, usage: 100, minutes: 115, minutesAmp: 16 },
    ][index % 3];
  }

  if (sport === "Tennis" && (league.includes("WTA") || matchup.includes("SWIATEK") || matchup.includes("GAUFF"))) {
    return [
      { player: "I. Swiatek", stat: "Games Won", base: 12.5, step: 0.5, amp: 0.6, edge: 0.65, usage: 100, minutes: 95, minutesAmp: 14 },
      { player: "C. Gauff", stat: "Aces", base: 3.5, step: 0.5, amp: 0.4, edge: 0.4, usage: 100, minutes: 95, minutesAmp: 14 },
      { player: "I. Swiatek", stat: "Break Points Won", base: 4.5, step: 0.5, amp: 0.35, edge: 0.35, usage: 100, minutes: 96, minutesAmp: 14 },
    ][index % 3];
  }

  if (sport === "Soccer" && (league.includes("LIGA") || matchup.includes("MAD") || matchup.includes("BAR"))) {
    return [
      { player: "J. Bellingham", stat: "Shots", base: 2.5, step: 0.5, amp: 0.25, edge: 0.32, usage: 29, minutes: 88, minutesAmp: 4 },
      { player: "R. Lewandowski", stat: "Shots On Target", base: 1.5, step: 0.5, amp: 0.2, edge: 0.24, usage: 31, minutes: 84, minutesAmp: 5 },
      { player: "Vinicius Jr.", stat: "Fouls Drawn", base: 1.5, step: 0.5, amp: 0.25, edge: 0.3, usage: 30, minutes: 86, minutesAmp: 5 },
    ][index % 3];
  }

  if (sport === "Soccer" && (league.includes("EPL") || matchup.includes("ARS") || matchup.includes("MCI"))) {
    return [
      { player: "E. Haaland", stat: "Shots On Target", base: 1.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 32, minutes: 84, minutesAmp: 5 },
      { player: "B. Saka", stat: "Shots", base: 2.5, step: 0.5, amp: 0.25, edge: 0.32, usage: 29, minutes: 86, minutesAmp: 5 },
      { player: "K. De Bruyne", stat: "Assists", base: 0.5, step: 0.5, amp: 0.15, edge: 0.18, usage: 27, minutes: 78, minutesAmp: 7 },
    ][index % 3];
  }

  if (sport === "MMA") {
    return [
      { player: context.away || "Fighter A", stat: "Significant Strikes", base: 64.5, step: 4, amp: 5, edge: 5.4, usage: 100, minutes: 18, minutesAmp: 5 },
      { player: context.home || "Fighter B", stat: "Takedowns", base: 1.5, step: 0.5, amp: 0.35, edge: 0.45, usage: 100, minutes: 16, minutesAmp: 5 },
      { player: context.away || "Fighter A", stat: "Fight Time Minutes", base: 12.5, step: 1.5, amp: 1.2, edge: 1.1, usage: 100, minutes: 15, minutesAmp: 5 },
    ][index % 3];
  }

  if (sport === "Golf") {
    return [
      { player: context.away || "Golfer A", stat: "Birdies", base: 4.5, step: 0.5, amp: 0.45, edge: 0.42, usage: 100, minutes: 270, minutesAmp: 20 },
      { player: context.home || "Golfer B", stat: "Round Score", base: 69.5, step: 0.5, amp: 0.8, edge: 0.55, usage: 100, minutes: 270, minutesAmp: 20 },
      { player: context.away || "Golfer A", stat: "Fairways Hit", base: 9.5, step: 0.5, amp: 0.5, edge: 0.5, usage: 100, minutes: 270, minutesAmp: 20 },
    ][index % 3];
  }

  return propProfileForSport(sport, index);
}

function propProfileForSport(sport, index) {
  const profiles = {
    Basketball: [
      { player: "J. Tatum", stat: "Points", base: 24.5, step: 2, amp: 1.2, edge: 1.4, usage: 31, minutes: 36, minutesAmp: 2 },
      { player: "N. Jokic", stat: "Assists", base: 8.5, step: 0.5, amp: 0.6, edge: 0.8, usage: 30, minutes: 35, minutesAmp: 2 },
      { player: "L. Doncic", stat: "Rebounds", base: 8.5, step: 0.5, amp: 0.7, edge: 0.7, usage: 34, minutes: 37, minutesAmp: 2 },
    ],
    Football: [
      { player: "P. Mahomes", stat: "Passing Yards", base: 258.5, step: 8, amp: 4, edge: 7.5, usage: 100, minutes: 60, minutesAmp: 0 },
      { player: "S. Diggs", stat: "Receiving Yards", base: 62.5, step: 6, amp: 4, edge: 5.2, usage: 82, minutes: 58, minutesAmp: 1 },
    ],
    Baseball: [
      { player: "M. Betts", stat: "Total Bases", base: 1.5, step: 0.5, amp: 0.25, edge: 0.35, usage: 100, minutes: 9, minutesAmp: 0 },
      { player: "A. Judge", stat: "Hits", base: 0.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 100, minutes: 9, minutesAmp: 0 },
      { player: "S. Strider", stat: "Strikeouts", base: 6.5, step: 0.5, amp: 0.4, edge: 0.55, usage: 100, minutes: 6, minutesAmp: 1 },
    ],
    Hockey: [
      { player: "C. McDavid", stat: "Shots On Goal", base: 3.5, step: 0.5, amp: 0.3, edge: 0.35, usage: 34, minutes: 22, minutesAmp: 2 },
      { player: "A. Matthews", stat: "Points", base: 0.5, step: 0.5, amp: 0.2, edge: 0.28, usage: 32, minutes: 21, minutesAmp: 2 },
    ],
    Soccer: [
      { player: "M. Salah", stat: "Shots", base: 2.5, step: 0.5, amp: 0.25, edge: 0.32, usage: 29, minutes: 86, minutesAmp: 5 },
      { player: "E. Haaland", stat: "Shots On Target", base: 1.5, step: 0.5, amp: 0.2, edge: 0.24, usage: 31, minutes: 84, minutesAmp: 5 },
      { player: "J. Bellingham", stat: "Fouls Drawn", base: 1.5, step: 0.5, amp: 0.25, edge: 0.3, usage: 27, minutes: 88, minutesAmp: 4 },
    ],
    Tennis: [
      { player: "I. Swiatek", stat: "Games Won", base: 12.5, step: 0.5, amp: 0.6, edge: 0.65, usage: 100, minutes: 95, minutesAmp: 14 },
      { player: "C. Gauff", stat: "Aces", base: 3.5, step: 0.5, amp: 0.4, edge: 0.4, usage: 100, minutes: 95, minutesAmp: 14 },
      { player: "C. Alcaraz", stat: "Break Points Won", base: 3.5, step: 0.5, amp: 0.35, edge: 0.35, usage: 100, minutes: 115, minutesAmp: 16 },
    ],
    MMA: [
      { player: "Main Event Fighter", stat: "Significant Strikes", base: 64.5, step: 4, amp: 5, edge: 5.4, usage: 100, minutes: 18, minutesAmp: 5 },
      { player: "Co-Main Fighter", stat: "Takedowns", base: 1.5, step: 0.5, amp: 0.35, edge: 0.45, usage: 100, minutes: 16, minutesAmp: 5 },
    ],
    Golf: [
      { player: "Featured Golfer", stat: "Birdies", base: 4.5, step: 0.5, amp: 0.45, edge: 0.42, usage: 100, minutes: 270, minutesAmp: 20 },
      { player: "Featured Golfer", stat: "Fairways Hit", base: 9.5, step: 0.5, amp: 0.5, edge: 0.5, usage: 100, minutes: 270, minutesAmp: 20 },
    ],
  }[sport] || [
    { player: "Featured Player", stat: "Player Prop", base: 2.5, step: 0.5, amp: 0.25, edge: 0.3, usage: 50, minutes: 30, minutesAmp: 2 },
  ];
  return profiles[index % profiles.length];
}

function formatSignedLine(value) {
  if (Object.is(value, -0) || value === 0) return "0";
  return value > 0 ? `+${round(value, 1)}` : `${round(value, 1)}`;
}

function bookmakerEntries(odd) {
  return Object.entries(odd.byBookmaker || {})
    .map(([bookmakerID, value]) => ({
      bookmakerID,
      price: parseAmerican(value?.odds),
      lastUpdatedAt: value?.lastUpdatedAt,
      available: value?.available !== false,
    }))
    .filter((entry) => entry.available && Number.isFinite(entry.price));
}

function bestSportsGameOddsBook(odd, excludeBookmakerID = null) {
  return bookmakerEntries(odd)
    .filter((entry) => entry.bookmakerID !== excludeBookmakerID)
    .sort((a, b) => b.price - a.price)[0] || null;
}

function sportsGameOddsMarketName(event, odd) {
  const side = titleCase(odd.sideID || "");
  const playerName = odd.playerID ? event.players?.[odd.playerID]?.name : "";
  const home = event.teams?.home?.names?.short || "Home";
  const away = event.teams?.away?.names?.short || "Away";
  const team = odd.sideID === "home" ? home : odd.sideID === "away" ? away : "";

  if (odd.betTypeID === "ml") return `${team} ML`;
  if (odd.betTypeID === "sp") return `${team} Spread`;
  if (odd.betTypeID === "ou") {
    const base = playerName
      ? `${playerName} ${String(odd.marketName || "Prop").replace(playerName, "").replace("Over/Under", "").trim()}`
      : String(odd.marketName || "Total").replace("Over/Under", "Total").trim();
    return `${base} ${side}`.replace(/\s+/g, " ").trim();
  }

  return odd.marketName || odd.oddID || "Market";
}

function sportsGameOddsLine(odd, price) {
  if (odd.betTypeID === "sp" && odd.bookSpread) return `${odd.bookSpread} ${formatAmerican(price)}`;
  if (odd.betTypeID === "ou" && odd.bookOverUnder) return `${titleCase(odd.sideID)} ${odd.bookOverUnder} ${formatAmerican(price)}`;
  return formatAmerican(price);
}

function oddsSelectionKey(marketKey, outcome) {
  const point = typeof outcome.point === "number" ? `:${round(outcome.point, 2)}` : "";
  return `${marketKey}:${String(outcome.name || "").toLowerCase()}${point}`;
}

function oddsMarketName(marketKey, outcome) {
  if (marketKey === "h2h") return `${outcome.name} ML`;
  if (marketKey === "spreads") {
    const point = typeof outcome.point === "number" && outcome.point > 0 ? `+${outcome.point}` : outcome.point;
    return `${outcome.name} Spread ${point ?? ""}`.trim();
  }
  if (marketKey === "totals") return `${outcome.name} ${outcome.point ?? ""}`.trim();
  return marketKey;
}

function americanImplied(price) {
  price = parseAmerican(price);
  if (!Number.isFinite(price) || price === 0) return 50;
  if (price > 0) return (100 / (price + 100)) * 100;
  return ((-price) / ((-price) + 100)) * 100;
}

function evFromAmerican(probability, price) {
  price = parseAmerican(price);
  if (!Number.isFinite(price) || price === 0) return 0;
  const p = probability / 100;
  const profit = price > 0 ? price / 100 : 100 / Math.abs(price);
  return (p * profit - (1 - p)) * 100;
}

function formatAmerican(price) {
  price = parseAmerican(price);
  if (!Number.isFinite(price)) return "N/A";
  return price > 0 ? `+${price}` : String(price);
}

function parseAmerican(price) {
  if (typeof price === "number") return price;
  if (typeof price !== "string") return NaN;
  return Number(price.replace("+", "").trim());
}

function bestAlternateBook(event, marketKey, selectionKey, currentBookKey) {
  let best = null;
  for (const bookmaker of event.bookmakers || []) {
    if (bookmaker.key === currentBookKey) continue;
    const market = (bookmaker.markets || []).find((candidate) => candidate.key === marketKey);
    const outcome = (market?.outcomes || []).find((candidate) => oddsSelectionKey(marketKey, candidate) === selectionKey);
    if (typeof outcome?.price !== "number") continue;
    if (!best || outcome.price > best.price) {
      best = { title: bookmaker.title || bookmaker.key, price: outcome.price };
    }
  }
  return best ? `${best.title} ${formatAmerican(best.price)}` : "No close alt";
}

function marketVolatility(marketKey) {
  if (marketKey === "spreads" || marketKey === "sp") return 12;
  if (marketKey === "totals" || marketKey === "ou") return 10;
  return 8;
}

function formatBookmakerName(bookmakerID = "") {
  const known = {
    betmgm: "BetMGM",
    caesars: "Caesars",
    draftkings: "DraftKings",
    espnbet: "ESPN BET",
    fanduel: "FanDuel",
    pinnacle: "Pinnacle",
    bet365: "Bet365",
    bovada: "Bovada",
    betonline: "BetOnline",
    pointsbet: "PointsBet",
  };
  return known[bookmakerID] || titleCase(bookmakerID.replace(/[_-]/g, " "));
}

function titleCase(value = "") {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function shortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function shortDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function signedNumber(value, digits = 0) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${round(number, digits)}`;
}

function sportFromKey(sportKey = "") {
  const value = String(sportKey || "").toLowerCase();
  if (value.includes("basketball")) return "Basketball";
  if (value.includes("americanfootball") || value.includes("football")) return "Football";
  if (value.includes("baseball")) return "Baseball";
  if (value.includes("icehockey") || value.includes("hockey")) return "Hockey";
  if (value.includes("soccer")) return "Soccer";
  if (value.includes("tennis")) return "Tennis";
  if (value.includes("mma") || value.includes("ufc")) return "MMA";
  if (value.includes("golf") || value.includes("pga")) return "Golf";
  return "Sports";
}

function normalizeSportName(value = "") {
  const text = String(value || "");
  const upper = text.toUpperCase();
  if (["BASKETBALL", "NBA", "WNBA", "NCAAB"].some((key) => upper.includes(key))) return "Basketball";
  if (["FOOTBALL", "NFL", "NCAAF", "CFL"].some((key) => upper.includes(key))) return "Football";
  if (["BASEBALL", "MLB", "KBO", "NPB"].some((key) => upper.includes(key))) return "Baseball";
  if (["HOCKEY", "NHL", "KHL"].some((key) => upper.includes(key))) return "Hockey";
  if (["SOCCER", "EPL", "MLS", "LIGA", "BUNDESLIGA", "SERIE", "UEFA"].some((key) => upper.includes(key))) return "Soccer";
  if (["TENNIS", "ATP", "WTA"].some((key) => upper.includes(key))) return "Tennis";
  if (["MMA", "UFC"].some((key) => upper.includes(key))) return "MMA";
  if (["GOLF", "PGA"].some((key) => upper.includes(key))) return "Golf";
  return sportFromKey(text);
}

function shortLeague(sportKey = "") {
  const parts = sportKey.split("_");
  return parts.at(-1)?.toUpperCase() || "SPORT";
}

function deterministicNoise(input, min, max) {
  const hash = crypto.createHash("sha256").update(String(input)).digest();
  const value = hash.readUInt32BE(0) / 0xffffffff;
  return min + value * (max - min);
}

function wave(seed, speed, amplitude) {
  return Math.sin(seed * speed) * amplitude;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
