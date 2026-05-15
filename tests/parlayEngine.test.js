import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorrelationWarning,
  buildParlayBacktest,
  calculateExpectedValue,
  calculateParlayOdds,
  calculateParlayScore,
  generateParlayPredictions,
  impliedProbabilityFromAmerican,
  simulateBankroll,
} from "../lib/parlayEngine.js";

const opportunities = [
  market("nba-bos-ml", "BOS", "MIA", "NBA", "Basketball", "BOS ML", "+115", 52.5, 46.5, 86, 8.4, 78, 2.4),
  market("nfl-kc-sp", "KC", "BUF", "NFL", "Football", "KC Spread", "-110", 57.2, 52.4, 91, 6.8, 84, 3.1),
  market("mlb-lad-total", "LAD", "ATL", "MLB", "Baseball", "Total Over", "+102", 54.4, 49.5, 83, 5.9, 72, 1.8),
  market("nhl-nyr-ml", "NYR", "FLA", "NHL", "Hockey", "NYR ML", "+130", 50.6, 43.5, 79, 7.1, 69, 2.2),
  market("nba-lal-total", "LAL", "DEN", "NBA", "Basketball", "Total Under", "-105", 55.1, 51.2, 81, 4.7, 74, 1.2),
  market("epl-ars-ml", "ARS", "MCI", "EPL", "Soccer", "ARS ML", "+145", 47.8, 40.8, 77, 6.4, 66, 2.6),
];

const props = [
  prop("tatum-points", "J. Tatum", "BOS", "NBA", "Points Over 27.5", 61.2, 8.1, 88),
  prop("jokic-assists", "N. Jokic", "DEN", "NBA", "Assists Over 8.5", 59.4, 6.2, 82),
  prop("judge-hr", "A. Judge", "NYY", "MLB", "Total Bases Over 1.5", 57.6, 5.8, 79),
];

test("implied probability handles positive and negative American odds", () => {
  assert.equal(round(impliedProbabilityFromAmerican(-110) * 100, 2), 52.38);
  assert.equal(round(impliedProbabilityFromAmerican("+150") * 100, 2), 40);
});

test("parlay odds calculation multiplies decimal prices", () => {
  const odds = calculateParlayOdds([{ odds: -110 }, { odds: +120 }]);
  assert.equal(round(odds.decimalOdds, 3), 4.2);
  assert.equal(odds.americanOdds, 320);
});

test("expected value is positive when model probability beats payout break-even", () => {
  assert.equal(calculateExpectedValue(30, 4.2), 26);
  assert.equal(calculateExpectedValue(0.3, 4.2), 26);
});

test("parlay score uses the documented weighted formula", () => {
  const score = calculateParlayScore({
    edgeScore: 80,
    confidence: 70,
    lineMovementStrength: 60,
    historicalHitRate: 65,
    riskAdjustment: 75,
  });
  assert.equal(score, 72);
});

test("correlation warning identifies repeated game exposure", () => {
  const warning = buildCorrelationWarning([
    { game: "BOS @ MIA", team: "BOS" },
    { game: "BOS @ MIA", team: "MIA" },
  ]);
  assert.equal(warning.level, "Medium");
});

test("parlay generator creates scored predictions with leg explanations", () => {
  const parlays = generateParlayPredictions({ opportunities, props, frameIndex: 4 });
  assert.ok(parlays.length >= 4);
  assert.ok(parlays[0].parlayScore >= 0 && parlays[0].parlayScore <= 100);
  assert.ok(parlays[0].legs.length >= 2);
  assert.match(parlays[0].legs[0].explanation, /model probability|grades as/);
});

test("50 percent hit rate mode creates safer two-leg parlays", () => {
  const parlays = generateParlayPredictions({ opportunities, props, frameIndex: 6 });
  const hitMode = parlays.find((parlay) => parlay.type === "hit-rate-50");
  assert.ok(hitMode);
  assert.equal(hitMode.legs.length, 2);
  assert.ok(hitMode.targetHitRateMode.enabled);
  assert.ok(hitMode.hitProbability >= 50);
  assert.ok(hitMode.legs.every((leg) => leg.targetHitRateLeg && leg.modelProbability >= 72));
  assert.match(hitMode.invalidationRules.join(" "), /50% Hit Rate Mode/);
});

test("backtest result calculation returns bankroll and performance metrics", () => {
  const parlays = generateParlayPredictions({ opportunities, props, frameIndex: 2 });
  const backtest = buildParlayBacktest({ parlays, opportunities, props, frameIndex: 2 });
  assert.equal(backtest.totalBets, 144);
  assert.ok(Number.isFinite(backtest.roi));
  assert.ok(Number.isFinite(backtest.maxDrawdown));
  assert.ok(backtest.bankrollHistory.length > 10);
  assert.ok(backtest.monthlyPerformance.length >= 1);
});

test("bankroll simulation applies profit and drawdown sequence", () => {
  const curve = simulateBankroll([
    { profitLoss: 100 },
    { profitLoss: -250 },
    { profitLoss: 75 },
  ], 1000);
  assert.equal(curve.at(-1).bankroll, 925);
  assert.ok(curve.at(-1).maxDrawdown < 0);
});

function market(id, away, home, league, sport, marketName, line, aiProbability, marketProbability, score, ev, confidence, clv) {
  return {
    id,
    away,
    home,
    league,
    sport,
    matchup: `${away} @ ${home}`,
    market: marketName,
    book: "DraftKings",
    backupBook: "FanDuel",
    line,
    fairLine: line,
    aiProbability,
    marketProbability,
    score,
    ev,
    confidence,
    clv,
    edge: aiProbability - marketProbability,
    sharp: 72,
    publicMoney: 34,
    volatility: 38,
    kelly: 1.2,
    handle: "2.1M",
    opening: "-105",
    move: 1.1,
    risk: "Controlled",
    tags: ["Sharp action", "CLV runway", "Model disagreement"],
    components: {
      dataQuality: 86,
      riskAdjusted: 82,
    },
  };
}

function prop(id, player, team, league, marketName, hitRate, ev, score) {
  return {
    id,
    player,
    team,
    league,
    market: marketName,
    projection: 28.8,
    line: 27.5,
    hitRate,
    ev,
    score,
    correlation: "Same-game tempo",
  };
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
