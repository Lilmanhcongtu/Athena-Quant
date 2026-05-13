import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

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
  ["KC", "BUF", "NFL", "Football"],
  ["SF", "DET", "NFL", "Football"],
  ["LAD", "ATL", "MLB", "Baseball"],
  ["NYY", "HOU", "MLB", "Baseball"],
  ["NYR", "FLA", "NHL", "Hockey"],
  ["EDM", "VGK", "NHL", "Hockey"],
  ["ARS", "MCI", "EPL", "Soccer"],
  ["MAD", "BAR", "La Liga", "Soccer"],
  ["Swiatek", "Gauff", "WTA", "Tennis"],
  ["Sinner", "Alcaraz", "ATP", "Tennis"],
];

const books = ["Pinnacle", "Circa", "DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "Bet365"];
const markets = ["Spread", "Moneyline", "Total", "Team Total", "1H Spread", "Live ML", "Player Prop", "Alt Total"];
const signals = ["Sharp action", "Reverse line", "Steam move", "Trap line", "Book exposure", "Public fade", "Late buyback", "Arb window"];
const propStats = ["Points", "Assists", "Rebounds", "Shots", "Strikeouts", "Receiving yards", "Saves", "Pass attempts"];

let tick = 0;
const clients = new Set();
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || "";
const ODDS_BASE_URL = "https://api.sportsgameodds.com/v2";
const ODDS_REFRESH_MS = Number(process.env.ODDS_REFRESH_MS || 30000);
const ODDS_LEAGUES = (process.env.ODDS_LEAGUES || "NBA,NFL,MLB,NHL")
  .split(",")
  .map((league) => league.trim())
  .filter(Boolean);
const ODDS_LIMIT = Number(process.env.ODDS_LIMIT || 12);
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
  requestsUsed: null,
  requestsRemaining: null,
  error: null,
};

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
    <script type="text/babel" data-type="module" data-presets="react" src="/src/app.jsx?v=20260513-6"></script>
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

async function refreshOdds() {
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
        error: result.notice || null,
      };
      return;
    }

    oddsState = {
      ...oddsState,
      status: "empty",
      lastFetchAt: new Date().toISOString(),
      nextFetchAt: new Date(Date.now() + ODDS_REFRESH_MS).toISOString(),
      error: "SportsGameOdds returned no events for the configured leagues.",
    };
  } catch (error) {
    oddsState = {
      ...oddsState,
      status: "error",
      lastFetchAt: new Date().toISOString(),
      nextFetchAt: new Date(Date.now() + ODDS_REFRESH_MS).toISOString(),
      error: error instanceof Error ? error.message : "Unable to fetch odds.",
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
    const payload = await response.json().catch(async () => ({ success: false, error: await response.text() }));
    if (!response.ok) {
      throw new Error(`SportsGameOdds ${response.status}: ${String(payload.error || payload.message || "Request failed").slice(0, 180)}`);
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

function dedupeEvents(events) {
  const map = new Map();
  for (const event of events) {
    map.set(event.eventID || event.id || `${event.leagueID || event.sport_key}-${event.home_team || event.teams?.home?.teamID}-${event.away_team || event.teams?.away?.teamID}`, event);
  }
  return Array.from(map.values());
}

function buildSnapshot(frameIndex) {
  const now = new Date();
  const realOpportunities = oddsState.events
    .flatMap((event, index) => opportunitiesFromOddsEvent(event, index, frameIndex))
    .sort((a, b) => b.score - a.score);
  const demoOpportunities = teams.map((match, index) => opportunity(match, index, frameIndex))
    .sort((a, b) => b.score - a.score);
  const opportunities = (realOpportunities.length ? realOpportunities : demoOpportunities).slice(0, 80);
  const liveGames = oddsState.events.length || (284 + Math.round(wave(frameIndex, 0.2, 21)));
  const bookCount = realOpportunities.length
    ? new Set(realOpportunities.map((item) => item.book)).size
    : books.length;

  return {
    generatedAt: now.toISOString(),
    dataSource: oddsState.events.length ? oddsState.source : "Synthetic simulation",
    dataStatus: oddsState.status,
    dataError: oddsState.error,
    oddsLastFetchAt: oddsState.lastFetchAt,
    oddsNextFetchAt: oddsState.nextFetchAt,
    requestsUsed: oddsState.requestsUsed,
    requestsRemaining: oddsState.requestsRemaining,
    latency: 12 + Math.round(wave(frameIndex, 0.25, 9) + Math.random() * 5),
    scanned: realOpportunities.length || (11900 + Math.round(wave(frameIndex, 0.18, 1200))),
    liveGames,
    books: bookCount,
    modelVersion: "AQX-9.4",
    health: 99.2 + wave(frameIndex, 0.1, 0.45),
    bankroll: {
      exposure: 31 + wave(frameIndex, 0.17, 5),
      drawdown: -2.4 + wave(frameIndex, 0.21, 1.2),
      roi: 18.9 + wave(frameIndex, 0.11, 2.2),
      clv: 4.8 + wave(frameIndex, 0.16, 0.8),
      winRate: 58.1 + wave(frameIndex, 0.13, 1.8),
      sharpe: 2.41 + wave(frameIndex, 0.12, 0.18),
    },
    opportunities,
    live: opportunities.slice(0, 6).map((item, index) => ({
      ...item,
      clock: item.sport === "Baseball" ? `${6 + (frameIndex + index) % 3}th` : `Q${2 + (index % 3)} ${String(11 - ((frameIndex + index) % 8)).padStart(2, "0")}:${String((42 - index * 5 + frameIndex * 7) % 60).padStart(2, "0")}`,
      winProbability: clamp(item.aiProbability + wave(frameIndex + index, 0.41, 7), 12, 88),
      momentum: clamp(48 + item.edge * 6 + wave(frameIndex + index, 0.53, 24), 8, 96),
      paceDelta: wave(frameIndex + index, 0.29, 8),
    })),
    props: opportunities.slice(2, 10).map((item, index) => prop(item, index, frameIndex)),
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

function opportunitiesFromOddsEvent(event, eventIndex, frameIndex) {
  if (!event?.odds || typeof event.odds !== "object") return [];
  return Object.values(event.odds)
    .filter((odd) => odd?.bookOddsAvailable && odd?.fairOddsAvailable && odd.bookOdds && odd.fairOdds && !odd.cancelled && !odd.ended)
    .map((odd, index) => sportsGameOddsOpportunity(event, odd, eventIndex, index, frameIndex))
    .filter(Boolean);
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
  const sport = event.sportID || sportFromKey(event.sport_key);
  const away = event.teams?.away?.names?.short || event.teams?.away?.names?.medium || "Away";
  const home = event.teams?.home?.names?.short || event.teams?.home?.names?.medium || "Home";
  const marketName = sportsGameOddsMarketName(event, odd);
  const bookName = best ? formatBookmakerName(best.bookmakerID) : "Consensus";
  const alternate = bestSportsGameOddsBook(odd, best?.bookmakerID);

  return {
    id: `${event.eventID}-${odd.oddID}`,
    away,
    home,
    league,
    sport,
    matchup: `${away} @ ${home}`,
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
    commenceTime: event.status?.startsAt,
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
  const line = lineForMarket(markets[index % markets.length], index, frameIndex);
  const risk = volatility > 58 ? "Elevated" : score > 86 ? "Controlled" : "Balanced";
  const label = score >= 90 ? "Elite Opportunity" : score >= 80 ? "Strong Value" : score >= 68 ? "Medium Edge" : score >= 54 ? "Risky Opportunity" : "Avoid";

  return {
    id: `${league}-${away}-${home}-${index}`,
    away,
    home,
    league,
    sport,
    matchup: `${away} @ ${home}`,
    market: markets[index % markets.length],
    book: books[(index + frameIndex) % books.length],
    backupBook: books[(index + frameIndex + 3) % books.length],
    line,
    fairLine: lineForMarket(markets[index % markets.length], index + 2, frameIndex + 2),
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
    opening: lineForMarket(markets[index % markets.length], index - 1, frameIndex - 4),
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
  const player = [
    "J. Tatum", "N. Jokic", "A. Judge", "C. McDavid", "P. Mahomes",
    "M. Saka", "C. Gauff", "L. Doncic", "S. Diggs", "A. Matthews",
  ][index % 10];
  const line = 12.5 + (index % 6) * 3 + Math.round(Math.abs(wave(frameIndex + index, 0.35, 2)) * 2) / 2;
  const projection = line + 1.2 + wave(frameIndex + index, 0.27, 2.4);
  const hitRate = clamp(52 + (projection - line) * 6 + wave(frameIndex + index, 0.39, 5), 41, 78);
  return {
    id: `${item.id}-prop`,
    player,
    team: item.home,
    league: item.league,
    market: `${propStats[index % propStats.length]} ${projection > line ? "Over" : "Under"} ${line}`,
    projection: round(projection, 1),
    line: round(line, 1),
    ev: round((projection - line) * 2.8, 1),
    hitRate: round(hitRate, 1),
    usage: round(23 + (index % 5) * 3 + wave(frameIndex + index, 0.19, 3), 1),
    minutes: round(28 + (index % 4) * 3 + wave(frameIndex + index, 0.21, 2), 1),
    correlation: index % 3 === 0 ? "Same-game tempo" : index % 3 === 1 ? "Injury-created usage" : "Defensive funnel",
    score: Math.round(clamp(item.score - 4 + (projection - line) * 3, 48, 96)),
  };
}

function buildAlerts(frameIndex, opportunities) {
  return opportunities.slice(0, 8).map((item, index) => ({
    id: `${item.id}-alert`,
    severity: index < 2 ? "Critical" : index < 5 ? "High" : "Watch",
    type: signals[(index + frameIndex) % signals.length],
    matchup: item.matchup,
    market: item.market,
    delta: round(item.move + index * 0.15, 1),
    confidence: Math.round(clamp(item.confidence + wave(frameIndex + index, 0.21, 4), 40, 98)),
    book: item.book,
  }));
}

function buildHeatmap(frameIndex) {
  const labels = ["NBA", "NFL", "MLB", "NHL", "Soccer", "Tennis"];
  return labels.map((league, row) => ({
    league,
    cells: Array.from({ length: 9 }, (_, col) => ({
      id: `${league}-${col}`,
      value: Math.round(clamp(52 + Math.sin(frameIndex * 0.2 + row * 1.2 + col * 0.62) * 38, 8, 97)),
      label: ["EV", "CLV", "RLM", "Steam", "Props", "Live", "Arb", "Risk", "Volume"][col],
    })),
  }));
}

function lineForMarket(market, index, frameIndex) {
  if (market.includes("Moneyline") || market.includes("Live ML")) {
    const val = Math.round((wave(index + frameIndex, 0.42, 165) + (index % 2 ? -115 : 120)) / 5) * 5;
    return val > 0 ? `+${val}` : `${val}`;
  }
  if (market.includes("Total")) return `${round(205 + (index % 9) * 4 + wave(frameIndex + index, 0.2, 6), 1)}`;
  if (market.includes("Prop")) return `${round(17.5 + (index % 7) * 2 + wave(frameIndex, 0.33, 1.5), 1)}`;
  const spread = round(((index % 8) - 4) * 1.5 + wave(frameIndex + index, 0.3, 1.1), 1);
  return spread > 0 ? `+${spread}` : `${spread}`;
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

function sportFromKey(sportKey = "") {
  if (sportKey.includes("basketball")) return "Basketball";
  if (sportKey.includes("americanfootball")) return "Football";
  if (sportKey.includes("baseball")) return "Baseball";
  if (sportKey.includes("icehockey")) return "Hockey";
  if (sportKey.includes("soccer")) return "Soccer";
  if (sportKey.includes("tennis")) return "Tennis";
  if (sportKey.includes("mma")) return "MMA";
  return "Sports";
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
