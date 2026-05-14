import crypto from "node:crypto";

export const DEFAULT_PARLAY_SETTINGS = {
  bankroll: 10000,
  stakeSize: 50,
  kellyFraction: 0.25,
  maxStakePercent: 1.25,
  maxDailyExposurePercent: 6,
  maxLegs: 6,
  minConfidence: 58,
  minEdge: 1.2,
  minOdds: -250,
  maxOdds: 650,
  strategy: "balanced",
  stakingMode: "fractional-kelly",
  dateRange: "Last 180 days",
  sport: "All",
  league: "All",
  marketType: "All",
};

export const PARLAY_TABLE_MODELS = {
  parlay_predictions: [
    "id",
    "created_at",
    "sport",
    "league",
    "legs",
    "odds",
    "model_probability",
    "implied_probability",
    "expected_value",
    "confidence",
    "risk_score",
    "parlay_score",
    "status",
    "result",
    "profit_loss",
  ],
  parlay_legs: [
    "id",
    "parlay_prediction_id",
    "sport",
    "league",
    "game",
    "market_type",
    "sportsbook",
    "odds",
    "implied_probability",
    "model_probability",
    "edge",
    "confidence",
    "correlation_group",
    "news_risk",
    "line_movement_strength",
  ],
  parlay_backtests: [
    "id",
    "created_at",
    "date_range",
    "sport",
    "league",
    "market_type",
    "legs",
    "min_confidence",
    "min_edge",
    "odds_range",
    "stake_size",
    "bankroll_size",
    "staking_mode",
    "strategy",
  ],
  backtest_results: [
    "id",
    "backtest_id",
    "date",
    "parlay_prediction_id",
    "odds",
    "stake",
    "result",
    "profit_loss",
    "roi",
    "closing_line_value",
  ],
  bankroll_history: [
    "id",
    "backtest_id",
    "date",
    "starting_bankroll",
    "ending_bankroll",
    "drawdown",
    "exposure",
  ],
  strategy_settings: [
    "id",
    "name",
    "max_stake_per_parlay",
    "max_daily_exposure",
    "max_legs_allowed",
    "kelly_fraction",
    "min_confidence",
    "min_edge",
    "avoid_chasing_losses",
    "created_at",
  ],
};

const PARLAY_TYPES = [
  { id: "conservative-2", label: "2-Leg Conservative", legs: 2, style: "Conservative", selector: "confidence" },
  { id: "balanced-3", label: "3-Leg Balanced", legs: 3, style: "Balanced", selector: "edge" },
  { id: "upside-4", label: "4-Leg High Upside", legs: 4, style: "Aggressive", selector: "score" },
  { id: "upside-6", label: "6-Leg Ladder", legs: 6, style: "Aggressive", selector: "payout" },
  { id: "same-game", label: "Same-Game Correlation", legs: 3, style: "Balanced", selector: "same-game" },
  { id: "player-props", label: "Player Prop Parlay", legs: 3, style: "Aggressive", selector: "props" },
  { id: "mixed-sport", label: "Mixed-Sport Edge", legs: 4, style: "Balanced", selector: "mixed-sport" },
];

export function impliedProbabilityFromAmerican(price) {
  const american = normalizeAmerican(price);
  if (!Number.isFinite(american) || american === 0) return 0.5;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function americanToDecimal(price) {
  const american = normalizeAmerican(price);
  if (!Number.isFinite(american) || american === 0) return 1;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimalOdds) {
  const decimal = Number(decimalOdds);
  if (!Number.isFinite(decimal) || decimal <= 1) return -10000;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function calculateParlayOdds(legs) {
  const decimalOdds = legs.reduce((product, leg) => product * americanToDecimal(leg.odds), 1);
  return {
    decimalOdds: round(decimalOdds, 3),
    americanOdds: decimalToAmerican(decimalOdds),
  };
}

export function calculateExpectedValue(modelProbability, decimalOdds) {
  const probability = modelProbability > 1 ? modelProbability / 100 : modelProbability;
  return round((probability * decimalOdds - 1) * 100, 2);
}

export function calculateParlayScore({
  edgeScore,
  confidence,
  lineMovementStrength,
  historicalHitRate,
  riskAdjustment,
}) {
  return Math.round(clamp(
    edgeScore * 0.35 +
    confidence * 0.25 +
    lineMovementStrength * 0.15 +
    historicalHitRate * 0.15 +
    riskAdjustment * 0.10,
    0,
    100,
  ));
}

export function buildCorrelationWarning(legs, { intentionalSameGame = false } = {}) {
  const gameCounts = countBy(legs, (leg) => leg.game);
  const teamCounts = countBy(legs, (leg) => leg.team || leg.game);
  const playerCounts = countBy(legs.filter((leg) => leg.player), (leg) => leg.player);
  const duplicateGames = [...gameCounts.entries()].filter(([, count]) => count > 1);
  const duplicateTeams = [...teamCounts.entries()].filter(([, count]) => count > 1);
  const duplicatePlayers = [...playerCounts.entries()].filter(([, count]) => count > 1);

  if (intentionalSameGame && duplicateGames.length) {
    return {
      level: "Intentional",
      severity: 28,
      text: "Intentional same-game correlation. Accept only if the game script supports every leg.",
    };
  }

  if (duplicatePlayers.length) {
    return {
      level: "High",
      severity: 82,
      text: "High correlation warning: multiple legs depend on the same player outcome.",
    };
  }

  if (duplicateTeams.length || duplicateGames.length) {
    return {
      level: "Medium",
      severity: 56,
      text: "Correlation warning: multiple legs share the same game or team exposure.",
    };
  }

  return {
    level: "Low",
    severity: 12,
    text: "Low correlation. Legs are diversified across teams, markets, or sports.",
  };
}

export function generateParlayPredictions({
  opportunities = [],
  props = [],
  settings = DEFAULT_PARLAY_SETTINGS,
  frameIndex = 0,
  createdAt = new Date().toISOString(),
} = {}) {
  const mergedSettings = { ...DEFAULT_PARLAY_SETTINGS, ...settings };
  const marketLegs = opportunities
    .map((item, index) => normalizeOpportunityLeg(item, index, frameIndex))
    .filter((leg) => leg.confidence >= mergedSettings.minConfidence && leg.edge >= mergedSettings.minEdge && !leg.staleOdds && !leg.highVig);
  const propLegs = props
    .map((item, index) => normalizePropLeg(item, index, frameIndex))
    .filter((leg) => leg.confidence >= Math.max(54, mergedSettings.minConfidence - 4) && leg.edge >= mergedSettings.minEdge);

  const parlays = [];
  for (const type of PARLAY_TYPES) {
    const legs = selectLegsForType(type, marketLegs, propLegs, mergedSettings, frameIndex);
    if (legs.length < Math.min(type.legs, 2)) continue;
    parlays.push(scoreParlay({
      type,
      legs,
      settings: mergedSettings,
      frameIndex,
      createdAt,
    }));
  }

  return parlays
    .sort((a, b) => b.parlayScore - a.parlayScore || b.expectedValue - a.expectedValue)
    .map((parlay, index) => ({ ...parlay, rank: index + 1 }));
}

export function buildParlayBacktest({
  parlays = [],
  opportunities = [],
  props = [],
  settings = DEFAULT_PARLAY_SETTINGS,
  frameIndex = 0,
} = {}) {
  const mergedSettings = { ...DEFAULT_PARLAY_SETTINGS, ...settings };
  const sourceParlays = parlays.length
    ? parlays
    : generateParlayPredictions({ opportunities, props, settings: mergedSettings, frameIndex });
  const initialBankroll = mergedSettings.bankroll;
  let bankroll = initialBankroll;
  let peak = initialBankroll;
  let maxDrawdown = 0;
  let totalStaked = 0;
  const results = [];

  const sample = 144;
  for (let i = 0; i < sample; i += 1) {
    const template = sourceParlays[i % Math.max(1, sourceParlays.length)];
    if (!template) break;
    const parlay = perturbParlayForBacktest(template, i, frameIndex);
    const stake = calculateBacktestStake(parlay, bankroll, mergedSettings);
    const probability = clamp(parlay.modelProbability - 1.4 + deterministicNoise(`${parlay.id}-${i}-prob`, -3.5, 2.8), 1, 95);
    const didWin = deterministicNoise(`${parlay.id}-${i}-result`, 0, 1) <= probability / 100;
    const pnl = round(didWin ? stake * (parlay.decimalOdds - 1) : -stake, 2);
    const clv = round(average(parlay.legs, (leg) => leg.lineMovementStrength) / 14 + deterministicNoise(`${parlay.id}-${i}-clv`, -2.4, 3.1), 2);
    const date = historicalDate(i, sample);

    bankroll = round(bankroll + pnl, 2);
    peak = Math.max(peak, bankroll);
    const drawdown = round(((bankroll - peak) / peak) * 100, 2);
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    totalStaked += stake;

    results.push({
      id: `${parlay.id}-hist-${i}`,
      date,
      parlayId: parlay.id,
      type: parlay.type,
      label: parlay.label,
      legs: parlay.legs.length,
      odds: parlay.americanOdds,
      decimalOdds: parlay.decimalOdds,
      stake,
      modelProbability: round(probability, 1),
      impliedProbability: parlay.impliedProbability,
      expectedValue: parlay.expectedValue,
      clv,
      result: didWin ? "Win" : "Loss",
      profitLoss: pnl,
      bankroll,
      drawdown,
      sport: primaryValue(parlay.legs, "sport"),
      market: primaryValue(parlay.legs, "marketType"),
    });
  }

  const wins = results.filter((item) => item.result === "Win").length;
  const profitLoss = round(bankroll - initialBankroll, 2);
  const monthlyPerformance = buildMonthlyPerformance(results);
  const sportPerformance = performanceBy(results, "sport");
  const marketPerformance = performanceBy(results, "market");
  const bestSport = sportPerformance[0]?.label || "N/A";
  const bestMarket = marketPerformance[0]?.label || "N/A";
  const worstMarket = marketPerformance.at(-1)?.label || "N/A";

  return {
    id: `parlay-backtest-${frameIndex}`,
    mode: "Parlay Strategy Replay",
    note: "Historical simulation uses pregame model probabilities, opening/market movement proxies, and deterministic settled outcomes until a full historical odds/results database is connected. No look-ahead fields are used.",
    settings: mergedSettings,
    totalBets: results.length,
    winRate: results.length ? round((wins / results.length) * 100, 1) : 0,
    roi: totalStaked ? round((profitLoss / totalStaked) * 100, 1) : 0,
    profitLoss,
    maxDrawdown: round(maxDrawdown, 1),
    averageOdds: results.length ? Math.round(average(results, (item) => item.odds)) : 0,
    averageDecimalOdds: results.length ? round(average(results, (item) => item.decimalOdds), 2) : 0,
    averageParlaySize: results.length ? round(average(results, (item) => item.legs), 1) : 0,
    bestPerformingSport: bestSport,
    bestPerformingMarket: bestMarket,
    worstPerformingMarket: worstMarket,
    clvAvailable: true,
    averageClv: results.length ? round(average(results, (item) => item.clv), 2) : 0,
    bankrollHistory: results
      .filter((_, index) => index % 4 === 0 || index === results.length - 1)
      .map((item) => ({
        label: item.date.slice(5),
        bankroll: item.bankroll,
        drawdown: item.drawdown,
      })),
    monthlyPerformance,
    sportPerformance,
    marketPerformance,
    results,
    history: results.slice(-18).reverse(),
  };
}

export function simulateBankroll(results, startingBankroll = 10000) {
  let bankroll = startingBankroll;
  let peak = startingBankroll;
  let maxDrawdown = 0;
  return results.map((result, index) => {
    bankroll = round(bankroll + Number(result.profitLoss || result.pnl || 0), 2);
    peak = Math.max(peak, bankroll);
    const drawdown = round(((bankroll - peak) / peak) * 100, 2);
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    return {
      index: index + 1,
      bankroll,
      drawdown,
      maxDrawdown,
    };
  });
}

function normalizeOpportunityLeg(item, index, frameIndex) {
  const odds = extractAmericanFromText(item.line) ?? probabilityToAmerican(item.marketProbability || 50);
  const impliedProbability = impliedProbabilityFromAmerican(odds) * 100;
  const modelProbability = clamp(Number(item.aiProbability || 50), 1, 97);
  const edge = round(modelProbability - impliedProbability, 1);
  const lineMovementStrength = clamp(Math.abs(Number(item.move || 0)) * 8 + Number(item.sharp || 50) * 0.55 + Math.max(0, item.clv || 0) * 4, 0, 100);
  const newsRisk = clamp(Number(item.volatility || 40) * 0.46 + deterministicNoise(`${item.id}-news-${frameIndex}`, 0, 16), 0, 100);
  const vigRisk = clamp(Math.abs(impliedProbability - Number(item.marketProbability || impliedProbability)) * 1.6, 0, 100);
  return {
    id: `leg-${item.id}`,
    sourceId: item.id,
    sport: item.sport || "Sports",
    league: item.league || "SPORT",
    game: item.matchup || `${item.away || "Away"} @ ${item.home || "Home"}`,
    marketType: item.market || "Market",
    sportsbook: item.book || "Consensus",
    line: item.line || "",
    fairLine: item.fairLine || "",
    betText: `${item.market || "Market"} ${item.line || ""}`.trim(),
    minimumAcceptableOdds: odds,
    odds,
    decimalOdds: americanToDecimal(odds),
    impliedProbability: round(impliedProbability, 1),
    modelProbability: round(modelProbability, 1),
    edge,
    confidence: Math.round(clamp(Number(item.confidence || item.score || 60), 0, 100)),
    score: Math.round(clamp(Number(item.score || 60), 0, 100)),
    lineMovementStrength: Math.round(lineMovementStrength),
    historicalHitRate: Math.round(clamp(modelProbability + deterministicNoise(`${item.id}-hit`, -4, 6), 35, 82)),
    newsRisk: Math.round(newsRisk),
    vigRisk: Math.round(vigRisk),
    staleOdds: deterministicNoise(`${item.id}-stale-${frameIndex}`, 0, 1) > 0.93,
    highVig: vigRisk > 18,
    team: item.home || item.away || item.matchup,
    player: null,
    correlationGroup: item.matchup || item.id,
    explanation: `${item.market} was selected because model probability is ${round(modelProbability, 1)}% versus ${round(impliedProbability, 1)}% implied, with ${round(edge, 1)} points of edge and ${Math.round(lineMovementStrength)} line-movement strength.`,
  };
}

function normalizePropLeg(item, index, frameIndex) {
  const fairProbability = clamp(Number(item.hitRate || 56), 35, 86);
  const marketProbability = clamp(fairProbability - Number(item.ev || 0) * 0.85 + deterministicNoise(`${item.id}-prop-market`, -2, 2), 25, 84);
  const odds = probabilityToAmerican(marketProbability);
  const impliedProbability = impliedProbabilityFromAmerican(odds) * 100;
  const edge = round(fairProbability - impliedProbability, 1);
  return {
    id: `prop-leg-${item.id}`,
    sourceId: item.id,
    sport: sportFromLeague(item.league),
    league: item.league || "SPORT",
    game: `${item.team || "Team"} prop market`,
    marketType: item.market || "Player Prop",
    sportsbook: "Best prop consensus",
    line: item.market || "",
    fairLine: `${round(fairProbability, 1)}% model fair`,
    betText: `${item.player || "Player"} ${item.market || "Player Prop"}`.trim(),
    minimumAcceptableOdds: odds,
    odds,
    decimalOdds: americanToDecimal(odds),
    impliedProbability: round(impliedProbability, 1),
    modelProbability: round(fairProbability, 1),
    edge,
    confidence: Math.round(clamp(Number(item.score || 60), 0, 100)),
    score: Math.round(clamp(Number(item.score || 60), 0, 100)),
    lineMovementStrength: Math.round(clamp(44 + Number(item.ev || 0) * 4 + deterministicNoise(`${item.id}-prop-move`, -10, 12), 0, 100)),
    historicalHitRate: Math.round(clamp(fairProbability + deterministicNoise(`${item.id}-prop-hit`, -5, 6), 35, 82)),
    newsRisk: Math.round(clamp(28 + deterministicNoise(`${item.id}-prop-news-${frameIndex}`, 0, 38), 0, 100)),
    vigRisk: Math.round(clamp(Math.abs(fairProbability - marketProbability) * 1.2, 0, 100)),
    staleOdds: false,
    highVig: false,
    team: item.team || "Team",
    player: item.player || null,
    correlationGroup: `${item.player || item.team}-${item.league}`,
    explanation: `${item.player || "Player"} ${item.market} grades as a prop leg because projection edge creates ${round(edge, 1)} points of model-vs-market disagreement with ${round(fairProbability, 1)}% hit probability.`,
  };
}

function selectLegsForType(type, marketLegs, propLegs, settings, frameIndex) {
  const count = Math.min(type.legs, settings.maxLegs);
  const all = [...marketLegs, ...propLegs];
  if (!all.length) return [];

  if (type.selector === "props") {
    return diversifyLegs(sortLegs(propLegs, "score"), count, { allowSameSport: true });
  }

  if (type.selector === "same-game") {
    const byGame = groupBy(all, (leg) => leg.game);
    const bestGroup = [...byGame.values()]
      .filter((legs) => legs.length >= 2)
      .sort((a, b) => average(b, (leg) => leg.confidence + leg.edge * 4) - average(a, (leg) => leg.confidence + leg.edge * 4))[0];
    if (bestGroup) {
      const sameGame = sortLegs(bestGroup, "edge").slice(0, Math.min(count, bestGroup.length));
      const filler = sortLegs(all.filter((leg) => !sameGame.some((selected) => selected.id === leg.id)), "confidence").slice(0, Math.max(0, count - sameGame.length));
      return [...sameGame, ...filler].slice(0, count);
    }
  }

  if (type.selector === "mixed-sport") {
    return diversifyLegs(sortLegs(all, "edge"), count, { requireMixedSport: true });
  }

  const selector = type.selector === "confidence" ? "confidence" : type.selector === "payout" ? "odds" : type.selector;
  return diversifyLegs(sortLegs(all, selector), count, { allowSameSport: type.style === "Aggressive" && frameIndex % 2 === 0 });
}

function scoreParlay({ type, legs, settings, frameIndex, createdAt }) {
  const intentionalSameGame = type.selector === "same-game";
  const odds = calculateParlayOdds(legs);
  const correlation = buildCorrelationWarning(legs, { intentionalSameGame });
  const correlationPenalty = intentionalSameGame ? 0.96 : 1 - correlation.severity / 360;
  const modelProbability = round(legs.reduce((probability, leg) => probability * (leg.modelProbability / 100), 1) * correlationPenalty * 100, 2);
  const impliedProbability = round(1 / odds.decimalOdds * 100, 2);
  const edge = round(modelProbability - impliedProbability, 2);
  const confidence = Math.round(clamp(average(legs, (leg) => leg.confidence) - (legs.length - 2) * 1.8 - correlation.severity * 0.07, 0, 100));
  const lineMovementStrength = Math.round(clamp(average(legs, (leg) => leg.lineMovementStrength), 0, 100));
  const historicalHitRate = Math.round(clamp(average(legs, (leg) => leg.historicalHitRate), 0, 100));
  const riskScore = Math.round(clamp(
    average(legs, (leg) => leg.newsRisk + leg.vigRisk * 0.4) * 0.52 +
    correlation.severity * 0.32 +
    legs.length * 5.2,
    0,
    100,
  ));
  const riskAdjustment = 100 - riskScore;
  const edgeScore = clamp(50 + edge * 8, 0, 100);
  const parlayScore = calculateParlayScore({
    edgeScore,
    confidence,
    lineMovementStrength,
    historicalHitRate,
    riskAdjustment,
  });
  const expectedValue = calculateExpectedValue(modelProbability, odds.decimalOdds);
  const recommendedStake = calculateRecommendedStake({ modelProbability, decimalOdds: odds.decimalOdds, riskScore, settings });
  const projectedPayout = round(recommendedStake * odds.decimalOdds, 2);
  const sport = primaryValue(legs, "sport");
  const league = primaryValue(legs, "league");
  const riskLevel = riskScore > 72 ? "High" : riskScore > 48 ? "Medium" : "Controlled";

  return {
    id: `parlay-${type.id}`,
    created_at: createdAt,
    createdAt,
    type: type.id,
    label: type.label,
    style: type.style,
    sport,
    league,
    legs,
    odds: odds.americanOdds,
    americanOdds: odds.americanOdds,
    decimalOdds: odds.decimalOdds,
    impliedProbability,
    modelProbability,
    hitProbability: modelProbability,
    edge,
    expectedValue,
    confidence,
    riskScore,
    riskLevel,
    volatility: Math.round(clamp(riskScore + legs.length * 4 - edge, 0, 100)),
    parlayScore,
    lineMovementStrength,
    historicalHitRate,
    correlationWarning: correlation.text,
    correlationLevel: correlation.level,
    projectedPayout,
    recommendedStake,
    status: "Open",
    result: "Pending",
    profitLoss: 0,
    payoutQuality: Math.round(clamp((odds.decimalOdds - 1) * 8 + edge * 2 + confidence * 0.3, 0, 100)),
    reasoning: buildParlayReasoning(type, legs, edge, riskLevel, correlation),
    riskFactors: buildRiskFactors(legs, correlation, riskLevel),
    invalidationRules: buildInvalidationRules(legs),
    strategyFit: type.style,
    scoreBreakdown: {
      edgeScore: Math.round(edgeScore),
      confidence,
      lineMovementStrength,
      historicalHitRate,
      riskAdjustment,
    },
  };
}

function calculateRecommendedStake({ modelProbability, decimalOdds, riskScore, settings }) {
  const probability = modelProbability / 100;
  const edge = decimalOdds * probability - 1;
  const kelly = edge / Math.max(decimalOdds - 1, 0.01);
  const maxStake = settings.bankroll * (settings.maxStakePercent / 100);
  const base = settings.stakingMode === "flat"
    ? settings.stakeSize
    : Math.max(0, settings.bankroll * kelly * settings.kellyFraction);
  const riskAdjusted = base * clamp(1 - riskScore / 155, 0.2, 1);
  return round(clamp(riskAdjusted, settings.stakeSize * 0.25, maxStake), 2);
}

function calculateBacktestStake(parlay, bankroll, settings) {
  if (settings.stakingMode === "flat") return settings.stakeSize;
  const probability = parlay.modelProbability / 100;
  const edge = parlay.decimalOdds * probability - 1;
  const kelly = edge / Math.max(parlay.decimalOdds - 1, 0.01);
  return round(clamp(bankroll * Math.max(0, kelly) * settings.kellyFraction, settings.stakeSize * 0.25, bankroll * settings.maxStakePercent / 100), 2);
}

function buildParlayReasoning(type, legs, edge, riskLevel, correlation) {
  const strongest = [...legs].sort((a, b) => b.edge - a.edge)[0];
  const movement = Math.round(average(legs, (leg) => leg.lineMovementStrength));
  return `${type.label} combines ${legs.length} legs with ${round(edge, 1)} points of parlay edge. The strongest leg is ${strongest.marketType} in ${strongest.game}, and average line-movement strength is ${movement}/100. Risk is ${riskLevel.toLowerCase()} because ${lowerFirst(correlation.text)}`;
}

function buildRiskFactors(legs, correlation, riskLevel) {
  const factors = [
    correlation.text,
    `Risk level is ${riskLevel}; do not increase stake after a losing sequence.`,
  ];
  const riskiest = [...legs].sort((a, b) => (b.newsRisk + b.vigRisk) - (a.newsRisk + a.vigRisk))[0];
  if (riskiest) factors.push(`Main leg risk: ${riskiest.marketType} has ${riskiest.newsRisk}/100 injury/news risk and ${riskiest.vigRisk}/100 vig risk.`);
  if (legs.length >= 5) factors.push("High leg count creates payout convexity but lowers hit probability sharply.");
  return factors;
}

function buildInvalidationRules(legs) {
  const rules = [
    "Void the parlay if any leg loses positive EV after a line move.",
    "Do not place if a listed starter, quarterback, goalie, or high-usage player is ruled out.",
    "Skip if the sportsbook price is worse than the displayed modeled price by more than 10 cents.",
  ];
  if (legs.some((leg) => leg.player)) rules.push("Re-check player minutes, usage, and injury status before entry.");
  return rules;
}

function perturbParlayForBacktest(parlay, index, frameIndex) {
  const probabilityShift = deterministicNoise(`${parlay.id}-bt-${index}-shift`, -4, 3);
  return {
    ...parlay,
    modelProbability: round(clamp(parlay.modelProbability + probabilityShift, 1, 92), 2),
    expectedValue: round(parlay.expectedValue + deterministicNoise(`${parlay.id}-bt-${index}-ev`, -5, 4), 2),
  };
}

function buildMonthlyPerformance(results) {
  const byMonth = groupBy(results, (item) => item.date.slice(0, 7));
  return [...byMonth.entries()].map(([month, items]) => {
    const staked = items.reduce((sum, item) => sum + item.stake, 0);
    const profit = items.reduce((sum, item) => sum + item.profitLoss, 0);
    const wins = items.filter((item) => item.result === "Win").length;
    return {
      month,
      bets: items.length,
      winRate: round((wins / items.length) * 100, 1),
      roi: staked ? round((profit / staked) * 100, 1) : 0,
      profitLoss: round(profit, 2),
    };
  });
}

function performanceBy(results, key) {
  const grouped = groupBy(results, (item) => item[key] || "Unknown");
  return [...grouped.entries()].map(([label, items]) => {
    const staked = items.reduce((sum, item) => sum + item.stake, 0);
    const profit = items.reduce((sum, item) => sum + item.profitLoss, 0);
    return {
      label,
      bets: items.length,
      roi: staked ? round((profit / staked) * 100, 1) : 0,
      profitLoss: round(profit, 2),
    };
  }).sort((a, b) => b.roi - a.roi);
}

function sortLegs(legs, selector) {
  const sorted = [...legs];
  const getter = {
    confidence: (leg) => leg.confidence + leg.edge * 2 - leg.newsRisk * 0.12,
    edge: (leg) => leg.edge * 6 + leg.confidence * 0.5 + leg.lineMovementStrength * 0.25,
    score: (leg) => leg.score + leg.edge * 3 + leg.confidence * 0.25,
    odds: (leg) => americanToDecimal(leg.odds) * 8 + leg.edge * 3 + leg.confidence * 0.3,
  }[selector] || ((leg) => leg.score);
  return sorted.sort((a, b) => getter(b) - getter(a));
}

function diversifyLegs(legs, count, { allowSameSport = false, requireMixedSport = false } = {}) {
  const selected = [];
  const games = new Set();
  const teams = new Set();
  const sports = new Set();
  for (const leg of legs) {
    if (selected.length >= count) break;
    if (games.has(leg.game)) continue;
    if (teams.has(leg.team)) continue;
    if (!allowSameSport && selected.length > 0 && !requireMixedSport && sports.has(leg.sport) && selected.length < Math.min(3, count)) continue;
    selected.push(leg);
    games.add(leg.game);
    teams.add(leg.team);
    sports.add(leg.sport);
  }
  if (selected.length < count) {
    for (const leg of legs) {
      if (selected.length >= count) break;
      if (!selected.some((item) => item.id === leg.id)) selected.push(leg);
    }
  }
  if (requireMixedSport && new Set(selected.map((leg) => leg.sport)).size < 2) return selected.slice(0, Math.min(3, selected.length));
  return selected.slice(0, count);
}

function primaryValue(items, key) {
  const counts = countBy(items, (item) => item[key] || "Mixed");
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Mixed";
}

function normalizeAmerican(price) {
  if (typeof price === "number") return price;
  if (typeof price !== "string") return NaN;
  return Number(price.replace("+", "").trim());
}

function extractAmericanFromText(value = "") {
  const matches = String(value).match(/[+-]\d{2,4}/g);
  if (!matches?.length) return null;
  return normalizeAmerican(matches.at(-1));
}

function probabilityToAmerican(probabilityPercent) {
  const probability = clamp(probabilityPercent / 100, 0.02, 0.98);
  return probability >= 0.5
    ? Math.round((-probability / (1 - probability)) * 100)
    : Math.round(((1 - probability) / probability) * 100);
}

function sportFromLeague(league = "") {
  const value = String(league).toUpperCase();
  if (value.includes("NBA")) return "Basketball";
  if (value.includes("NFL")) return "Football";
  if (value.includes("MLB")) return "Baseball";
  if (value.includes("NHL")) return "Hockey";
  if (value.includes("ATP") || value.includes("WTA")) return "Tennis";
  if (value.includes("EPL") || value.includes("LIGA")) return "Soccer";
  return "Sports";
}

function historicalDate(index, sample) {
  const date = new Date();
  date.setDate(date.getDate() - (sample - index));
  return date.toISOString().slice(0, 10);
}

function deterministicNoise(input, min, max) {
  const hash = crypto.createHash("sha256").update(String(input)).digest();
  const value = hash.readUInt32BE(0) / 0xffffffff;
  return min + value * (max - min);
}

function groupBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function countBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function average(items, getter) {
  return items.length ? items.reduce((sum, item) => sum + getter(item), 0) / items.length : 0;
}

function lowerFirst(value) {
  const text = String(value || "");
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
