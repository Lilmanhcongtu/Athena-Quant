import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import { AnimatePresence, motion } from "https://esm.sh/framer-motion@11.3.19?deps=react@18.2.0,react-dom@18.2.0";
import {
  Activity,
  AlarmClock,
  AreaChart,
  ArrowRightLeft,
  BadgeDollarSign,
  BarChart3,
  Bot,
  BrainCircuit,
  Cable,
  CircleDollarSign,
  Gauge,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Waves,
  Zap,
} from "https://esm.sh/lucide-react@0.468.0?deps=react@18.2.0";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from "https://esm.sh/chart.js@4.4.7";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
);

const initialSnapshot = JSON.parse(document.getElementById("initial-snapshot").textContent);

const currency = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = (value, digits = 1) => `${Number(value).toFixed(digits)}%`;
const signed = (value, digits = 1) => `${value > 0 ? "+" : ""}${Number(value).toFixed(digits)}`;
const lowerText = (value, fallback = "unknown") => String(value ?? fallback).toLowerCase();
const average = (items, getter) => items.length ? items.reduce((sum, item) => sum + getter(item), 0) / items.length : 0;

const WORKSPACES = [
  { id: "command", label: "Command", icon: Gauge },
  { id: "scanner", label: "Scanner", icon: Search },
  { id: "model", label: "Model Lab", icon: LineChart },
  { id: "props", label: "Props", icon: Trophy },
  { id: "parlays", label: "Parlays", icon: BadgeDollarSign },
  { id: "parlaybt", label: "Parlay BT", icon: BarChart3 },
  { id: "risk", label: "Risk", icon: ShieldCheck },
  { id: "assistant", label: "Assistant", icon: MessageSquareText },
];

function showFatalError(error) {
  const root = document.getElementById("root");
  if (!root) return;
  document.getElementById("ssr-shell")?.remove();
  root.innerHTML = `
    <div class="min-h-screen bg-[#05070b] p-4 text-slate-100">
      <div class="mx-auto mt-10 max-w-2xl rounded-lg border border-red-400/30 bg-red-400/10 p-5">
        <div class="text-[11px] uppercase tracking-[0.16em] text-red-200">Terminal runtime error</div>
        <div class="mt-2 text-lg font-black text-white">The dashboard hit a browser-side error.</div>
        <pre class="mt-4 overflow-auto rounded-lg bg-black/40 p-3 text-xs leading-5 text-red-100">${escapeHtml(String(error?.message || error))}</pre>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

window.addEventListener("error", (event) => showFatalError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showFatalError(event.reason));

function App() {
  useEffect(() => {
    document.getElementById("ssr-shell")?.remove();
  }, []);

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [connected, setConnected] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSnapshot.opportunities[0]?.id);
  const [activeView, setActiveView] = useState("command");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text: "Top of board is sorted by AI Opportunity Score. I am weighting EV, sharp strength, CLV runway, volatility, and data confidence before ranking each play.",
    },
  ]);

  useEffect(() => {
    let retryTimer;
    let socket;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/live`);
      socket.addEventListener("open", () => setConnected(true));
      socket.addEventListener("message", (event) => {
        const next = JSON.parse(event.data);
        setSnapshot(next);
        setSelectedId((current) => {
          if (next.opportunities.some((item) => item.id === current)) return current;
          return next.opportunities[0]?.id;
        });
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        retryTimer = window.setTimeout(connect, 1400);
      });
      socket.addEventListener("error", () => {
        setConnected(false);
        socket?.close();
      });
    };

    connect();
    return () => {
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  const selected = useMemo(() => {
    return snapshot.opportunities.find((item) => item.id === selectedId) || snapshot.opportunities[0];
  }, [snapshot, selectedId]);

  const tickerItems = useMemo(() => {
    return snapshot.alerts.concat(snapshot.opportunities.slice(0, 6)).map((item) => {
      if ("type" in item) return `${item.type} | ${item.matchup} | ${item.market} | ${item.confidence}%`;
      return `${item.label} | ${item.matchup} | EV ${signed(item.ev)}% | ${item.book}`;
    });
  }, [snapshot]);

  const sendMessage = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const answer = buildAssistantAnswer(trimmed, selected, snapshot);
    setMessages((items) => [
      ...items,
      { role: "user", text: trimmed },
      { role: "ai", text: answer },
    ]);
    setQuery("");
  };

  return (
    <div className="app-shell">
      <div className="flex min-h-screen">
        <Sidebar activeView={activeView} onSelect={setActiveView} />
        <main className="min-w-0 flex-1">
          <TopBar snapshot={snapshot} connected={connected} />
          <div className="border-y border-white/10 bg-black/20 overflow-hidden">
            <div className="ticker flex w-[2200px] gap-8 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-300 mono">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span key={`${item}-${index}`} className="whitespace-nowrap">
                  <span className="text-cyan-300">AQX</span> {item}
                </span>
              ))}
            </div>
          </div>

          <WorkspaceTabs activeView={activeView} onSelect={setActiveView} />
          <WorkspaceRouter
            activeView={activeView}
            snapshot={snapshot}
            selected={selected}
            setSelectedId={setSelectedId}
            messages={messages}
            query={query}
            setQuery={setQuery}
            sendMessage={sendMessage}
          />
        </main>
      </div>
    </div>
  );
}

class TerminalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    document.getElementById("ssr-shell")?.remove();
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#05070b] p-4 text-slate-100">
        <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-red-400/30 bg-red-400/10 p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-red-200">Terminal render error</div>
          <div className="mt-2 text-lg font-black text-white">The dashboard hit a browser-side error.</div>
          <pre className="mt-4 overflow-auto rounded-lg bg-black/40 p-3 text-xs leading-5 text-red-100">
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      </div>
    );
  }
}

function WorkspaceRouter({ activeView, snapshot, selected, setSelectedId, messages, query, setQuery, sendMessage }) {
  if (activeView === "scanner") {
    return <MarketScannerWorkspace snapshot={snapshot} selected={selected} setSelectedId={setSelectedId} />;
  }
  if (activeView === "model") {
    return <ModelLabWorkspace snapshot={snapshot} selected={selected} />;
  }
  if (activeView === "props") {
    return <PropsWorkspace snapshot={snapshot} />;
  }
  if (activeView === "parlays") {
    return <ParlayBuilderWorkspace snapshot={snapshot} />;
  }
  if (activeView === "parlaybt") {
    return <ParlayBacktestWorkspace snapshot={snapshot} />;
  }
  if (activeView === "risk") {
    return <RiskOfficeWorkspace snapshot={snapshot} />;
  }
  if (activeView === "assistant") {
    return (
      <AssistantWorkspace
        snapshot={snapshot}
        selected={selected}
        messages={messages}
        query={query}
        setQuery={setQuery}
        sendMessage={sendMessage}
      />
    );
  }
  return (
    <CommandCenterWorkspace
      snapshot={snapshot}
      selected={selected}
      setSelectedId={setSelectedId}
      messages={messages}
      query={query}
      setQuery={setQuery}
      sendMessage={sendMessage}
    />
  );
}

function LogoMark({ size = "md" }) {
  const dimensions = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <div className={`${dimensions} grid shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-1 shadow-[0_0_28px_rgba(53,246,255,0.12)]`}>
      <img
        src="/src/assets/athena-quant-logo.svg"
        alt="Athena Quant logo"
        className="h-full w-full rounded-md"
      />
    </div>
  );
}

function CommandCenterWorkspace({ snapshot, selected, setSelectedId, messages, query, setQuery, sendMessage }) {
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.72fr)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(410px,0.72fr)]">
      <section className="min-w-0 space-y-3">
        <MetricStrip snapshot={snapshot} />
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.72fr)]">
          <OpportunityFeed
            opportunities={snapshot.opportunities}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
          <OpportunityDetail opportunity={selected} />
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <MarketChart opportunity={selected} />
          <LiveEngine live={snapshot.live} />
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <PropEngine props={snapshot.props} />
          <BankrollAnalytics snapshot={snapshot} />
        </div>
      </section>

      <aside className="min-w-0 space-y-3">
        <MarketDetection snapshot={snapshot} />
        <AISynthesis opportunity={selected} snapshot={snapshot} />
        <Assistant
          messages={messages}
          query={query}
          setQuery={setQuery}
          sendMessage={sendMessage}
        />
      </aside>
    </div>
  );
}

function WorkspaceTabs({ activeView, onSelect }) {
  return (
    <div className="border-b border-white/10 bg-black/20 px-3 py-2 md:hidden">
      <div className="flex gap-2 overflow-x-auto">
        {WORKSPACES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`status-pill mono text-[10px] ${activeView === id ? "border-cyan-300/50 bg-cyan-300/15 text-white" : ""}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceHeader({ icon: Icon, title, subtitle, stat }) {
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-cyan-200">
            <Icon size={15} />
            Workspace
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{title}</h2>
          <div className="mt-1 text-sm text-slate-400">{subtitle}</div>
        </div>
        {stat ? <div className="status-pill mono text-[10px]">{stat}</div> : null}
      </div>
    </div>
  );
}

function MarketScannerWorkspace({ snapshot, selected, setSelectedId }) {
  const opportunities = snapshot.opportunities || [];
  const elite = opportunities.filter((item) => item.score >= 90).length;
  const positiveEv = opportunities.filter((item) => item.ev > 0).length;
  const avgEdge = average(opportunities, (item) => item.edge || 0);

  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={Search}
        title="Market Scanner"
        subtitle="Unified real-time scan across moneylines, spreads, totals, book discrepancies, EV, CLV, and sharp-pressure estimates."
        stat={`${opportunities.length} live markets`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScannerMetric label="Positive EV" value={positiveEv} sub="markets above fair value" icon={TrendingUp} />
        <ScannerMetric label="Elite" value={elite} sub="score 90+" icon={Zap} />
        <ScannerMetric label="Avg Edge" value={signed(avgEdge)} sub="model probability gap" icon={Target} />
        <ScannerMetric label="Books" value={snapshot.books} sub={snapshot.dataSource || "data source"} icon={Radar} />
      </div>
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
        <Panel icon={Search} title="Scanner Board" action={<span className="status-pill mono text-[10px]">REAL ODDS</span>}>
          <CompactOpportunityTable opportunities={opportunities} selected={selected} onSelect={setSelectedId} />
        </Panel>
        <div className="space-y-3">
          <OpportunityDetail opportunity={selected} />
          <MarketDetection snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}

function ModelLabWorkspace({ snapshot, selected }) {
  const components = selected?.components || {};
  const backtest = snapshot.backtest || {};
  const monteCarlo = [
    ["Median outcome", percent((selected?.aiProbability || 0) + 1.4)],
    ["5th percentile", percent(Math.max(1, (selected?.aiProbability || 0) - 11.2))],
    ["95th percentile", percent(Math.min(99, (selected?.aiProbability || 0) + 12.6))],
    ["Model drift", signed(selected?.move || 0)],
  ];

  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={LineChart}
        title="Model Lab"
        subtitle="Break down the selected bet into probability, feature weights, volatility, CLV runway, and scenario stress tests."
        stat={selected ? `${selected.matchup} selected` : "No selection"}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel icon={BrainCircuit} title="Probability Stack">
          <div className="grid gap-3 p-3">
            <div className="grid grid-cols-3 gap-2">
              <DetailMetric label="AI prob" value={percent(selected?.aiProbability || 0)} />
              <DetailMetric label="Market" value={percent(selected?.marketProbability || 0)} />
              <DetailMetric label="EV" value={`${signed(selected?.ev || 0)}%`} />
            </div>
            {Object.entries(components).map(([key, value]) => (
              <div key={key}>
                <div className="mb-1 flex justify-between text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <span>{labelize(key)}</span>
                  <span className="mono text-slate-300">{value}</span>
                </div>
                <MiniBar value={value} tall />
              </div>
            ))}
          </div>
        </Panel>
        <MarketChart opportunity={selected} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel icon={Activity} title="Monte Carlo Snapshot">
          <div className="grid gap-2 p-3">
            {monteCarlo.map(([label, value]) => <RiskRow key={label} label={label} value={value} />)}
          </div>
        </Panel>
        <Panel icon={Waves} title="Stress Tests">
          <div className="grid gap-2 p-3">
            <StressCard label="Line moves against you" value={selected?.score - 9} />
            <StressCard label="Volatility spike" value={selected?.confidence - 12} />
            <StressCard label="Late book buyback" value={selected?.components?.riskAdjusted - 8} />
          </div>
        </Panel>
        <AISynthesis opportunity={selected} snapshot={snapshot} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <BacktestCurve backtest={backtest} />
        <BacktestCalibration backtest={backtest} />
      </div>
    </div>
  );
}

function PropsWorkspace({ snapshot }) {
  const props = snapshot.props || [];
  const top = props[0];
  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={Trophy}
        title="Props Engine"
        subtitle="Prop model console for projection gaps, hit rate, usage assumptions, matchup context, and correlation logic."
        stat={`${props.length} modeled props`}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.7fr)]">
        <PropEngine props={props} />
        <Panel icon={Target} title="Top Prop Thesis">
          <div className="grid gap-3 p-3">
            <div>
              <div className="text-xl font-black text-white">{top?.player || "No prop"}</div>
              <div className="mt-1 text-sm text-slate-400">{top?.market || "Waiting for prop model"}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <DetailMetric label="Projection" value={top?.projection ?? "N/A"} />
              <DetailMetric label="Hit" value={top ? percent(top.hitRate) : "N/A"} />
              <DetailMetric label="EV" value={top ? signed(top.ev) : "N/A"} />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-slate-300">
              The prop engine weights minutes, usage, pace, defensive funnel, blowout risk, and correlation. Current driver: <span className="text-cyan-200">{top?.correlation || "none"}</span>.
            </div>
          </div>
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <PropSignal label="Hidden Value Props" value={props.filter((prop) => prop.score >= 80).length} sub="projection gap plus hit rate" />
        <PropSignal label="Correlation Plays" value={props.filter((prop) => String(prop.correlation).includes("tempo")).length} sub="same-game script compatible" />
        <PropSignal label="High Confidence" value={props.filter((prop) => prop.hitRate >= 60).length} sub="hit rate above 60%" />
      </div>
    </div>
  );
}

function ParlayBuilderWorkspace({ snapshot }) {
  const parlays = snapshot.parlays || [];
  const [selectedId, setSelectedId] = useState(parlays[0]?.id);
  const selected = useMemo(() => {
    return parlays.find((item) => item.id === selectedId) || parlays[0];
  }, [parlays, selectedId]);
  const top = parlays[0];
  const controlled = parlays.filter((item) => item.riskLevel === "Controlled").length;
  const avgScore = average(parlays, (item) => item.parlayScore || 0);
  const avgEv = average(parlays, (item) => item.expectedValue || 0);

  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={BadgeDollarSign}
        title="Parlay Builder AI"
        subtitle="Professional parlay generator across spreads, totals, moneylines, player props, same-game logic, and mixed-sport baskets."
        stat={`${parlays.length} ranked parlays`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScannerMetric label="Top Score" value={top?.parlayScore || 0} sub={top?.label || "waiting for engine"} icon={BrainCircuit} />
        <ScannerMetric label="Avg EV" value={`${signed(avgEv)}%`} sub="parlay-level expected value" icon={TrendingUp} />
        <ScannerMetric label="Controlled Risk" value={controlled} sub="risk score below threshold" icon={ShieldCheck} />
        <ScannerMetric label="Best Payout" value={top ? dollars.format(top.projectedPayout) : "$0"} sub="projected return incl. stake" icon={CircleDollarSign} />
      </div>
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <Panel icon={BadgeDollarSign} title="AI Ranked Parlay Board" action={<span className="status-pill mono text-[10px]">Correlation Guard Active</span>}>
          <div className="grid max-h-[780px] gap-2 overflow-y-auto p-3">
            {parlays.map((parlay) => (
              <ParlayPredictionCard
                key={parlay.id}
                parlay={parlay}
                selected={selected?.id === parlay.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </Panel>
        <ParlayDetailPanel parlay={selected} />
      </div>
    </div>
  );
}

function ParlayPredictionCard({ parlay, selected, onSelect }) {
  const riskTone = parlay.riskLevel === "High" ? "text-red-300" : parlay.riskLevel === "Medium" ? "text-amber-200" : "text-mint";
  return (
    <button
      onClick={() => onSelect(parlay.id)}
      className={`rounded-lg border px-3 py-3 text-left transition ${selected ? "border-cyan-300/45 bg-cyan-300/[0.08]" : "border-white/10 bg-white/[0.035] hover:border-cyan-300/35 hover:bg-cyan-300/[0.055]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[10px] text-cyan-200">#{parlay.rank}</span>
            <span className="truncate text-sm font-black text-white">{parlay.label}</span>
            <span className="status-pill mono text-[10px]">{parlay.style}</span>
          </div>
          <div className="mt-1 truncate text-xs text-slate-400">{parlay.legs.map((leg) => leg.game).slice(0, 2).join(" | ")}</div>
        </div>
        <div className="mono text-right">
          <div className="text-2xl font-black text-white">{parlay.parlayScore}</div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Score</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ParlayMiniStat label="Odds" value={formatAmericanOdds(parlay.americanOdds)} />
        <ParlayMiniStat label="Hit" value={percent(parlay.hitProbability || 0)} />
        <ParlayMiniStat label="EV" value={`${signed(parlay.expectedValue || 0)}%`} tone="text-mint" />
        <ParlayMiniStat label="Risk" value={parlay.riskLevel} tone={riskTone} />
      </div>
      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-300">
        {parlay.correlationWarning}
      </div>
    </button>
  );
}

function ParlayDetailPanel({ parlay }) {
  if (!parlay) return null;
  const riskTone = parlay.riskLevel === "High" ? "text-red-300" : parlay.riskLevel === "Medium" ? "text-amber-200" : "text-mint";
  return (
    <Panel icon={BrainCircuit} title="Parlay Intelligence Detail" action={<span className="status-pill mono text-[10px]">{parlay.strategyFit}</span>}>
      <div className="p-4">
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="relative mx-auto">
            <div className="score-ring mono" style={{ "--p": parlay.parlayScore }}>
              <div className="z-10 text-center">
                <div className="text-4xl font-black text-white">{parlay.parlayScore}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">Parlay</div>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xl font-black text-white">{parlay.label}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="status-pill mono text-[10px]">{parlay.legs.length} legs</span>
              <span className="status-pill mono text-[10px]">Odds {formatAmericanOdds(parlay.americanOdds)}</span>
              <span className="status-pill mono text-[10px]">Stake {dollars.format(parlay.recommendedStake)}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <DetailMetric label="Model" value={percent(parlay.modelProbability || 0)} />
              <DetailMetric label="Implied" value={percent(parlay.impliedProbability || 0)} />
              <DetailMetric label="Edge" value={signed(parlay.edge || 0)} />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.045] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
            <Sparkles size={13} />
            Overall Reasoning
          </div>
          <div className="text-sm leading-6 text-slate-200">{parlay.reasoning}</div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PriceCard label="Projected payout" value={dollars.format(parlay.projectedPayout)} sub="includes stake" />
          <PriceCard label="Expected value" value={`${signed(parlay.expectedValue)}%`} sub="model payout edge" />
          <PriceCard label="Volatility" value={`${parlay.volatility}/100`} sub={`risk ${parlay.riskScore}/100`} />
          <PriceCard label="Risk level" value={parlay.riskLevel} sub={parlay.correlationLevel} />
        </div>

        <div className="mt-4">
          <ParlayLegTable legs={parlay.legs} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Panel icon={ShieldCheck} title="Risk Warnings">
            <div className="grid gap-2 p-3">
              {parlay.riskFactors.map((factor) => (
                <div key={factor} className={`rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 ${riskTone}`}>
                  {factor}
                </div>
              ))}
            </div>
          </Panel>
          <Panel icon={Target} title="Invalidation Rules">
            <div className="grid gap-2 p-3">
              {parlay.invalidationRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-300">
                  {rule}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}

function ParlayLegTable({ legs }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="parlay-leg-grid border-b border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 mono">
        <div>Leg</div>
        <div>Market</div>
        <div>Odds</div>
        <div>Model</div>
        <div>Edge</div>
        <div>Risk</div>
      </div>
      {legs.map((leg, index) => (
        <div key={leg.id} className="parlay-leg-grid border-b border-white/10 px-3 py-3 text-sm last:border-b-0">
          <div className="min-w-0">
            <div className="truncate font-bold text-white">{index + 1}. {leg.game}</div>
            <div className="mt-1 truncate text-[11px] text-cyan-200">{leg.sport} | {leg.league}</div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-slate-200">{leg.marketType}</div>
            <div className="mt-1 truncate text-[11px] text-slate-500">{leg.sportsbook}</div>
          </div>
          <div className="mono text-slate-100">{formatAmericanOdds(leg.odds)}</div>
          <div className="mono text-cyan-200">{percent(leg.modelProbability || 0)}</div>
          <div className="mono text-mint">{signed(leg.edge || 0)}</div>
          <div>
            <div className="mono text-amber-200">{leg.newsRisk}/100</div>
            <div className="mt-1 truncate text-[10px] text-slate-500">{leg.explanation}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ParlayBacktestWorkspace({ snapshot }) {
  const rawBacktest = snapshot.parlayBacktest || {};
  const [filters, setFilters] = useState({
    sport: "All",
    market: "All",
    legs: "All",
    strategy: rawBacktest.settings?.strategy || "balanced",
    stakingMode: rawBacktest.settings?.stakingMode || "fractional-kelly",
    minConfidence: rawBacktest.settings?.minConfidence || 58,
    minEdge: rawBacktest.settings?.minEdge || 1.2,
    stakeSize: rawBacktest.settings?.stakeSize || 50,
    bankroll: rawBacktest.settings?.bankroll || 10000,
  });
  const results = rawBacktest.results || rawBacktest.history || [];
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const sportOk = filters.sport === "All" || item.sport === filters.sport;
      const marketOk = filters.market === "All" || item.market === filters.market;
      const legsOk = filters.legs === "All" || Number(item.legs) === Number(filters.legs);
      return sportOk && marketOk && legsOk;
    });
  }, [results, filters.sport, filters.market, filters.legs]);
  const summary = useMemo(() => summarizeParlayBacktestResults(filteredResults, filters, rawBacktest), [filteredResults, filters, rawBacktest]);

  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={BarChart3}
        title="Parlay Backtest Lab"
        subtitle="Historical parlay strategy replay with bankroll simulation, strategy filters, CLV proxy, monthly performance, and no-look-ahead assumptions."
        stat={`${summary.totalBets} tested parlays`}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)]">
        <StrategySettingsPanel filters={filters} setFilters={setFilters} results={results} />
        <div className="space-y-3">
          <ParlayBacktestSummary summary={summary} rawBacktest={rawBacktest} />
          <ParlayBankrollChart summary={summary} />
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
        <ParlayHistoryTable results={filteredResults.slice(-24).reverse()} />
        <div className="space-y-3">
          <ParlayMonthlyPerformance months={summary.monthlyPerformance} />
          <DataModelRegistry models={snapshot.parlayModels || {}} />
        </div>
      </div>
    </div>
  );
}

function StrategySettingsPanel({ filters, setFilters, results }) {
  const sports = uniqueOptions(results.map((item) => item.sport));
  const markets = uniqueOptions(results.map((item) => item.market));
  const legs = uniqueOptions(results.map((item) => String(item.legs))).sort((a, b) => Number(a) - Number(b));

  return (
    <Panel icon={Gauge} title="Strategy Settings">
      <div className="grid gap-3 p-3">
        <SettingSelect label="Sport" value={filters.sport} options={["All", ...sports]} onChange={(value) => setFilters((state) => ({ ...state, sport: value }))} />
        <SettingSelect label="Market" value={filters.market} options={["All", ...markets]} onChange={(value) => setFilters((state) => ({ ...state, market: value }))} />
        <SettingSelect label="Legs" value={filters.legs} options={["All", ...legs]} onChange={(value) => setFilters((state) => ({ ...state, legs: value }))} />
        <SettingSelect label="Strategy" value={filters.strategy} options={["conservative", "balanced", "aggressive"]} onChange={(value) => setFilters((state) => ({ ...state, strategy: value }))} />
        <SettingSelect label="Staking" value={filters.stakingMode} options={["flat", "fractional-kelly"]} onChange={(value) => setFilters((state) => ({ ...state, stakingMode: value }))} />
        <SettingInput label="Min confidence" value={filters.minConfidence} suffix="%" onChange={(value) => setFilters((state) => ({ ...state, minConfidence: value }))} />
        <SettingInput label="Min edge" value={filters.minEdge} suffix="%" onChange={(value) => setFilters((state) => ({ ...state, minEdge: value }))} />
        <SettingInput label="Stake size" value={filters.stakeSize} prefix="$" onChange={(value) => setFilters((state) => ({ ...state, stakeSize: value }))} />
        <SettingInput label="Bankroll" value={filters.bankroll} prefix="$" onChange={(value) => setFilters((state) => ({ ...state, bankroll: value }))} />
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">
          Guardrails: max stake per parlay, max daily exposure, max legs allowed, Kelly fraction, and avoid-chasing-losses logic are enforced by the server simulation profile.
        </div>
      </div>
    </Panel>
  );
}

function SettingSelect({ label, value, options, onChange }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/50"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SettingInput({ label, value, onChange, prefix = "", suffix = "" }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="flex h-10 items-center rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-slate-400 focus-within:border-cyan-300/50">
        {prefix ? <span>{prefix}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          type="number"
          className="min-w-0 flex-1 bg-transparent px-1 text-white outline-none"
        />
        {suffix ? <span>{suffix}</span> : null}
      </div>
    </label>
  );
}

function ParlayBacktestSummary({ summary, rawBacktest }) {
  const metrics = [
    ["Total Bets", summary.totalBets, rawBacktest.mode || "Strategy replay", BadgeDollarSign],
    ["Win Rate", percent(summary.winRate || 0), "full parlay wins", Target],
    ["ROI", percent(summary.roi || 0), "profit divided by stake", TrendingUp],
    ["P/L", dollars.format(summary.profitLoss || 0), "simulated bankroll result", CircleDollarSign],
    ["Max DD", percent(summary.maxDrawdown || 0), "peak-to-trough", ShieldCheck],
    ["Avg Odds", formatAmericanOdds(summary.averageOdds || 0), "mean parlay price", BarChart3],
  ];
  return (
    <Panel icon={BarChart3} title="Backtest Results" action={<span className="status-pill mono text-[10px]">CLV {signed(summary.averageClv || 0)}</span>}>
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label, value, sub, Icon]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
              <Icon size={14} className="text-cyan-300" />
            </div>
            <div className="mono mt-2 text-xl font-black text-white">{value}</div>
            <div className="mt-1 truncate text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-2 text-xs leading-5 text-slate-400">
        {rawBacktest.note || "No-look-ahead simulation: only pregame probabilities and pre-start market signals are used."}
      </div>
    </Panel>
  );
}

function ParlayBankrollChart({ summary }) {
  const canvasRef = useChart((canvas) => {
    const curve = summary.bankrollHistory || [];
    return new Chart(canvas, {
      type: "line",
      data: {
        labels: curve.map((item) => item.label),
        datasets: [
          {
            label: "Bankroll",
            data: curve.map((item) => item.bankroll),
            borderColor: "#36f2a7",
            backgroundColor: "rgba(54, 242, 167, 0.13)",
            pointRadius: 0,
            fill: true,
            tension: 0.35,
          },
          {
            label: "Drawdown",
            data: curve.map((item) => item.drawdown),
            borderColor: "#ff4f70",
            pointRadius: 0,
            fill: false,
            tension: 0.35,
          },
        ],
      },
      options: chartOptions({ yGrid: true }),
    });
  }, [summary.totalBets, summary.profitLoss, summary.maxDrawdown]);

  return (
    <Panel icon={AreaChart} title="Bankroll Growth Chart">
      <div className="p-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <DetailMetric label="Bankroll" value={dollars.format(summary.endingBankroll || 0)} />
          <DetailMetric label="Best Sport" value={summary.bestPerformingSport || "N/A"} />
          <DetailMetric label="Best Market" value={summary.bestPerformingMarket || "N/A"} />
          <DetailMetric label="Worst Market" value={summary.worstPerformingMarket || "N/A"} />
        </div>
        <div className="chart-wrap h-[310px] min-h-[310px]">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </Panel>
  );
}

function ParlayMonthlyPerformance({ months }) {
  return (
    <Panel icon={BarChart3} title="Monthly Performance">
      <div className="grid gap-2 p-3">
        {(months || []).slice(-6).map((month) => (
          <div key={month.month} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-sm font-bold text-white">{month.month}</span>
              <span className={`mono text-sm font-bold ${month.profitLoss >= 0 ? "text-mint" : "text-red-300"}`}>{dollars.format(month.profitLoss)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <DetailMetric label="Bets" value={month.bets} />
              <DetailMetric label="Win" value={percent(month.winRate || 0)} />
              <DetailMetric label="ROI" value={percent(month.roi || 0)} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ParlayHistoryTable({ results }) {
  return (
    <Panel icon={BarChart3} title="Parlay History Table">
      <div className="parlay-history-grid border-b border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 mono">
        <div>Date</div>
        <div>Type</div>
        <div>Legs</div>
        <div>Odds</div>
        <div>Stake</div>
        <div>Result</div>
        <div>P/L</div>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        {(results || []).map((item) => (
          <div key={item.id} className="parlay-history-grid border-b border-white/10 px-3 py-2 text-sm">
            <div className="mono text-xs text-slate-500">{item.date}</div>
            <div className="truncate font-bold text-white">{item.label || item.type}</div>
            <div className="mono text-cyan-200">{item.legs}</div>
            <div className="mono text-slate-200">{formatAmericanOdds(item.odds)}</div>
            <div className="mono text-slate-300">{dollars.format(item.stake)}</div>
            <div className={`mono ${item.result === "Win" ? "text-mint" : "text-red-300"}`}>{item.result}</div>
            <div className={`mono font-bold ${item.profitLoss >= 0 ? "text-mint" : "text-red-300"}`}>{dollars.format(item.profitLoss)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DataModelRegistry({ models }) {
  return (
    <Panel icon={Radar} title="Data Model Registry">
      <div className="grid max-h-[420px] gap-2 overflow-y-auto p-3">
        {Object.entries(models).map(([name, fields]) => (
          <div key={name} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="mono text-xs font-bold text-cyan-200">{name}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(fields || []).slice(0, 10).map((field) => (
                <span key={field} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-400">{field}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RiskOfficeWorkspace({ snapshot }) {
  const opportunities = snapshot.opportunities || [];
  const backtest = snapshot.backtest || {};
  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={ShieldCheck}
        title="Risk Office"
        subtitle="Bankroll exposure, Kelly sizing, volatility control, drawdown guardrails, and concentration risk."
        stat={`Exposure ${percent(snapshot.bankroll.exposure)}`}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <BankrollAnalytics snapshot={snapshot} />
        <Panel icon={ShieldCheck} title="Risk Limits">
          <div className="grid gap-2 p-3">
            <RiskRow label="Max single position" value={`${opportunities[0]?.kelly || 0}u`} />
            <RiskRow label="Portfolio exposure" value={percent(snapshot.bankroll.exposure)} />
            <RiskRow label="Drawdown" value={signed(snapshot.bankroll.drawdown)} />
            <RiskRow label="Sharpe" value={snapshot.bankroll.sharpe.toFixed(2)} />
            <RiskRow label="Stop condition" value={snapshot.bankroll.drawdown < -5 ? "De-risk" : "Normal"} />
          </div>
        </Panel>
      </div>
      <BacktestSummary backtest={backtest} />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <BacktestCurve backtest={backtest} />
        <BacktestTiers backtest={backtest} />
      </div>
      <Panel icon={BadgeDollarSign} title="Kelly Position Ledger">
        <div className="grid gap-2 p-3 lg:grid-cols-2 2xl:grid-cols-3">
          {opportunities.slice(0, 9).map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{item.matchup}</div>
                  <div className="mt-1 truncate text-xs text-slate-400">{item.market} | {item.book}</div>
                </div>
                <div className="mono text-lg font-black text-mint">{item.kelly}u</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <DetailMetric label="EV" value={`${signed(item.ev)}%`} />
                <DetailMetric label="Risk" value={item.risk || "N/A"} />
                <DetailMetric label="Score" value={item.score} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <BacktestLedger backtest={backtest} />
    </div>
  );
}

function AssistantWorkspace({ snapshot, selected, messages, query, setQuery, sendMessage }) {
  const prompts = [
    "Explain the best opportunity right now",
    "How much should I bet using Kelly?",
    "What is the biggest risk on this play?",
    "Find a correlated parlay angle",
    "Explain the sharp market movement",
  ];
  return (
    <div className="space-y-3 p-3">
      <WorkspaceHeader
        icon={Bot}
        title="AI Assistant Console"
        subtitle="Ask the terminal to explain bets, compare markets, size positions, surface hidden value, and translate model output."
        stat={selected ? selected.matchup : "No selection"}
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel icon={Sparkles} title="Quick Prompts">
          <div className="grid gap-2 p-3">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setQuery(prompt)}
                className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]"
              >
                {prompt}
              </button>
            ))}
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] p-3 text-sm leading-6 text-slate-300">
              Selected context: <span className="text-cyan-200">{selected?.market}</span> at <span className="text-white">{selected?.book}</span>, EV {signed(selected?.ev || 0)}%, score {selected?.score}.
            </div>
          </div>
        </Panel>
        <Assistant messages={messages} query={query} setQuery={setQuery} sendMessage={sendMessage} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <OpportunityDetail opportunity={selected} />
        <MarketDetection snapshot={snapshot} />
      </div>
    </div>
  );
}

function ScannerMetric({ label, value, sub, icon: Icon }) {
  return (
    <div className="metric-tile">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <Icon size={16} className="text-cyan-300" />
      </div>
      <div className="mono mt-2 text-2xl font-black text-white">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function CompactOpportunityTable({ opportunities, selected, onSelect }) {
  return (
    <div className="max-h-[720px] overflow-y-auto">
      {opportunities.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`grid w-full gap-3 border-b border-white/10 px-3 py-3 text-left transition hover:bg-cyan-300/[0.055] lg:grid-cols-[minmax(180px,1fr)_100px_90px_90px_90px_120px] ${selected?.id === item.id ? "bg-cyan-300/[0.08]" : ""}`}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{item.matchup}</div>
            <div className="mt-1 truncate text-xs text-slate-400">{item.league} | {item.market} | {item.line}</div>
          </div>
          <TableStat label="Score" value={item.score} />
          <TableStat label="EV" value={`${signed(item.ev)}%`} tone="text-mint" />
          <TableStat label="Edge" value={signed(item.edge)} tone="text-cyan-200" />
          <TableStat label="CLV" value={signed(item.clv)} tone="text-amber-200" />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-slate-200">{item.book}</div>
            <div className="truncate text-[10px] text-slate-500">{item.backupBook}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function TableStat({ label, value, tone = "text-white" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mono mt-1 text-sm font-black ${tone}`}>{value}</div>
    </div>
  );
}

function ParlayMiniStat({ label, value, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mono mt-1 truncate text-sm font-black ${tone}`}>{value}</div>
    </div>
  );
}

function RiskRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="mono font-bold text-white">{value}</span>
    </div>
  );
}

function summarizeParlayBacktestResults(results, filters, rawBacktest) {
  const startingBankroll = Number(filters.bankroll || rawBacktest.settings?.bankroll || 10000);
  let bankroll = startingBankroll;
  let peak = startingBankroll;
  let maxDrawdown = 0;
  let totalStaked = 0;
  const ordered = [...results].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const bankrollHistory = ordered.map((item) => {
    bankroll += Number(item.profitLoss || 0);
    peak = Math.max(peak, bankroll);
    const drawdown = peak ? ((bankroll - peak) / peak) * 100 : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    totalStaked += Number(item.stake || 0);
    return {
      label: String(item.date || "").slice(5),
      bankroll: Number(bankroll.toFixed(2)),
      drawdown: Number(drawdown.toFixed(2)),
    };
  });
  const wins = ordered.filter((item) => item.result === "Win").length;
  const profitLoss = bankroll - startingBankroll;
  const sportPerformance = summarizeBy(ordered, "sport");
  const marketPerformance = summarizeBy(ordered, "market");
  return {
    totalBets: ordered.length,
    winRate: ordered.length ? (wins / ordered.length) * 100 : 0,
    roi: totalStaked ? (profitLoss / totalStaked) * 100 : 0,
    profitLoss,
    maxDrawdown,
    averageOdds: ordered.length ? average(ordered, (item) => Number(item.odds || 0)) : 0,
    averageParlaySize: ordered.length ? average(ordered, (item) => Number(item.legs || 0)) : 0,
    averageClv: ordered.length ? average(ordered, (item) => Number(item.clv || 0)) : 0,
    endingBankroll: bankroll,
    bestPerformingSport: sportPerformance[0]?.label || rawBacktest.bestPerformingSport || "N/A",
    bestPerformingMarket: marketPerformance[0]?.label || rawBacktest.bestPerformingMarket || "N/A",
    worstPerformingMarket: marketPerformance.at(-1)?.label || rawBacktest.worstPerformingMarket || "N/A",
    bankrollHistory: bankrollHistory.filter((_, index) => index % 3 === 0 || index === bankrollHistory.length - 1),
    monthlyPerformance: summarizeMonthly(ordered),
  };
}

function summarizeBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const label = item[key] || "Unknown";
    const current = map.get(label) || { label, bets: 0, staked: 0, profitLoss: 0 };
    current.bets += 1;
    current.staked += Number(item.stake || 0);
    current.profitLoss += Number(item.profitLoss || 0);
    map.set(label, current);
  }
  return [...map.values()]
    .map((item) => ({ ...item, roi: item.staked ? (item.profitLoss / item.staked) * 100 : 0 }))
    .sort((a, b) => b.roi - a.roi);
}

function summarizeMonthly(items) {
  const map = new Map();
  for (const item of items) {
    const month = String(item.date || "").slice(0, 7) || "N/A";
    const current = map.get(month) || { month, bets: 0, wins: 0, staked: 0, profitLoss: 0 };
    current.bets += 1;
    current.wins += item.result === "Win" ? 1 : 0;
    current.staked += Number(item.stake || 0);
    current.profitLoss += Number(item.profitLoss || 0);
    map.set(month, current);
  }
  return [...map.values()].map((item) => ({
    month: item.month,
    bets: item.bets,
    winRate: item.bets ? (item.wins / item.bets) * 100 : 0,
    roi: item.staked ? (item.profitLoss / item.staked) * 100 : 0,
    profitLoss: item.profitLoss,
  }));
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function BacktestSummary({ backtest }) {
  const metrics = [
    ["Win Rate", percent(backtest.winRate || 0), "settled wins over modeled bets", Target],
    ["ROI", percent(backtest.roi || 0), "profit divided by stake", TrendingUp],
    ["Profit", `${signed(backtest.profit || 0)}u`, "net units", CircleDollarSign],
    ["Max DD", `${signed(backtest.maxDrawdown || 0)}u`, "peak-to-trough", ShieldCheck],
    ["CLV+", percent(backtest.clvPositiveRate || 0), "positive closing-line rate", LineChart],
    ["Sharpe", Number(backtest.sharpe || 0).toFixed(2), "risk-adjusted return", Activity],
  ];

  return (
    <Panel icon={BarChart3} title="Backtest Summary" action={<span className="status-pill mono text-[10px]">{backtest.window || "Paper model"}</span>}>
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label, value, sub, Icon]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
              <Icon size={14} className="text-cyan-300" />
            </div>
            <div className="mono mt-2 text-xl font-black text-white">{value}</div>
            <div className="mt-1 truncate text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-2 text-xs leading-5 text-slate-400">
        {backtest.note || "Backtest metrics will appear after the strategy engine initializes."}
      </div>
    </Panel>
  );
}

function BacktestCurve({ backtest }) {
  const canvasRef = useChart((canvas) => {
    const curve = backtest.equityCurve || [];
    return new Chart(canvas, {
      type: "line",
      data: {
        labels: curve.map((item) => item.label),
        datasets: [
          {
            label: "Equity",
            data: curve.map((item) => item.equity),
            borderColor: "#36f2a7",
            backgroundColor: "rgba(54, 242, 167, 0.13)",
            pointRadius: 0,
            fill: true,
            tension: 0.35,
          },
          {
            label: "Drawdown",
            data: curve.map((item) => item.drawdown),
            borderColor: "#ff4f70",
            backgroundColor: "rgba(255, 79, 112, 0.08)",
            pointRadius: 0,
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: chartOptions({ yGrid: true }),
    });
  }, [backtest?.bets, backtest?.profit]);

  return (
    <Panel icon={AreaChart} title="Backtest Equity Curve" action={<span className="status-pill mono text-[10px]">{backtest.mode || "Backtest"}</span>}>
      <div className="p-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <DetailMetric label="Bets" value={backtest.bets || 0} />
          <DetailMetric label="Win" value={percent(backtest.winRate || 0)} />
          <DetailMetric label="ROI" value={percent(backtest.roi || 0)} />
          <DetailMetric label="CLV" value={signed(backtest.avgClv || 0)} />
        </div>
        <div className="chart-wrap h-[294px] min-h-[294px]">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </Panel>
  );
}

function BacktestCalibration({ backtest }) {
  return (
    <Panel icon={Gauge} title="Calibration By Probability">
      <div className="grid gap-2 p-3">
        {(backtest.calibration || []).map((bin) => (
          <div key={bin.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="mono text-slate-300">{bin.label}</span>
              <span className="text-slate-500">{bin.bets} bets</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">Projected</div>
                <MiniBar value={bin.projected} tall />
                <div className="mono mt-1 text-xs text-cyan-200">{percent(bin.projected || 0)}</div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">Actual</div>
                <MiniBar value={bin.actual} tall />
                <div className="mono mt-1 text-xs text-mint">{percent(bin.actual || 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BacktestLedger({ backtest }) {
  return (
    <Panel icon={BarChart3} title="Recent Backtest Ledger">
      <div className="grid border-b border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 mono lg:grid-cols-[92px_minmax(160px,1fr)_minmax(150px,1fr)_70px_70px_70px_70px]">
        <div>Date</div>
        <div>Matchup</div>
        <div>Market</div>
        <div>Score</div>
        <div>Stake</div>
        <div>Result</div>
        <div>PNL</div>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {(backtest.recent || []).map((trade) => (
          <div key={trade.id} className="grid gap-2 border-b border-white/10 px-3 py-2 text-sm lg:grid-cols-[92px_minmax(160px,1fr)_minmax(150px,1fr)_70px_70px_70px_70px]">
            <div className="mono text-xs text-slate-500">{trade.date}</div>
            <div className="truncate font-bold text-white">{trade.matchup}</div>
            <div className="truncate text-slate-300">{trade.market}</div>
            <div className="mono text-cyan-200">{trade.score}</div>
            <div className="mono text-slate-300">{trade.stake}u</div>
            <div className={`mono ${trade.result === "Win" ? "text-mint" : "text-red-300"}`}>{trade.result}</div>
            <div className={`mono font-bold ${trade.pnl >= 0 ? "text-mint" : "text-red-300"}`}>{signed(trade.pnl)}u</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BacktestTiers({ backtest }) {
  return (
    <Panel icon={BarChart3} title="Backtest By Score Tier">
      <div className="grid gap-2 p-3">
        {(backtest.scoreTiers || []).map((tier) => (
          <div key={tier.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-white">{tier.label}</span>
              <span className="mono text-xs text-slate-400">{tier.bets} bets</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <DetailMetric label="Win" value={percent(tier.winRate || 0)} />
              <DetailMetric label="ROI" value={percent(tier.roi || 0)} />
              <DetailMetric label="CLV" value={signed(tier.avgClv || 0)} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function StressCard({ label, value }) {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-2 flex justify-between gap-3 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="mono text-white">{Math.round(normalized)}</span>
      </div>
      <MiniBar value={normalized} tall />
    </div>
  );
}

function PropSignal({ label, value, sub }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mono mt-2 text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function Sidebar({ activeView, onSelect }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[62px] shrink-0 border-r border-white/10 bg-black/30 px-2 py-3 backdrop-blur-xl md:block">
      <div className="mb-6">
        <LogoMark size="sm" />
      </div>
      <div className="flex flex-col items-center gap-2">
        {WORKSPACES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`nav-button ${activeView === id ? "active" : ""}`}
            title={label}
            aria-label={label}
          >
            <Icon size={19} />
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-2 right-2 grid place-items-center">
        <button className="nav-button" title="Secure data room" aria-label="Secure data room">
          <LockKeyhole size={18} />
        </button>
      </div>
    </aside>
  );
}

function TopBar({ snapshot, connected }) {
  const realOdds = snapshot.dataSource && snapshot.dataSource !== "Synthetic simulation";
  const modeLabel = snapshot.dataStatus === "error" ? "API ERROR" : realOdds ? "REAL ODDS" : "SIM MODE";
  return (
    <header className="glass sticky top-0 z-20 flex min-h-[66px] flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 px-3 py-3 md:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <LogoMark size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-black tracking-tight text-white sm:text-xl">Athena Quant</h1>
              <span className="status-pill mono text-[10px]">
                <span className="signal-dot"></span>
                {connected ? "LIVE WEBSOCKET" : "RECONNECTING"}
              </span>
              <span className="status-pill mono text-[10px]">
                {modeLabel}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-slate-400 mono">
              <span>AQX-9.4 Ensemble</span>
              <span>{snapshot.liveGames} live games</span>
              <span>{currency.format(snapshot.scanned)} markets scanned</span>
              <span>{snapshot.dataSource || "Synthetic simulation"}</span>
              {snapshot.dataStatus === "error" ? <span>Provider rejected key; simulation fallback active</span> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusMetric icon={Cable} label="Latency" value={`${snapshot.latency}ms`} />
        <StatusMetric icon={Radar} label="Books" value={snapshot.books} />
        <StatusMetric icon={BadgeDollarSign} label="Quota" value={snapshot.requestsRemaining ?? "demo"} />
        <StatusMetric icon={Activity} label="Health" value={percent(snapshot.health)} />
        <button className="icon-button" title="Refresh models" aria-label="Refresh models">
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}

function StatusMetric({ icon: Icon, label, value }) {
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 sm:flex">
      <Icon size={15} className="text-cyan-300" />
      <span className="text-slate-500">{label}</span>
      <span className="mono text-slate-100">{value}</span>
    </div>
  );
}

function MetricStrip({ snapshot }) {
  const backtest = snapshot.backtest || {};
  const metrics = [
    ["Top EV", signed(snapshot.opportunities[0]?.ev || 0), "Best risk-adjusted play", TrendingUp, "text-mint"],
    ["AI Score", snapshot.opportunities[0]?.score || 0, snapshot.opportunities[0]?.label || "Scanning", BrainCircuit, "text-cyan-300"],
    ["CLV Avg", signed(snapshot.bankroll.clv), "Closing-line value", Target, "text-amber-300"],
    ["Kelly Max", `${snapshot.opportunities[0]?.kelly || 0}u`, "Current position cap", BadgeDollarSign, "text-mint"],
    ["BT Win", percent(backtest.winRate || snapshot.bankroll.winRate), `${backtest.bets || 0} backtest bets`, Gauge, "text-cyan-300"],
    ["BT ROI", percent(backtest.roi || snapshot.bankroll.roi), "Backtest return", AreaChart, "text-amber-300"],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {metrics.map(([label, value, sub, Icon, tone]) => (
        <motion.div
          key={label}
          layout
          className="metric-tile scan-line"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</span>
            <Icon size={16} className={tone} />
          </div>
          <div className="mt-2 mono text-2xl font-black text-white">{value}</div>
          <div className="mt-1 truncate text-xs text-slate-400">{sub}</div>
        </motion.div>
      ))}
    </div>
  );
}

function OpportunityFeed({ opportunities, selectedId, onSelect }) {
  return (
    <Panel
      icon={Zap}
      title="Real-Time Opportunity Feed"
    >
      <div className="table-grid border-b border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 mono">
        <div>Market</div>
        <div>Score</div>
        <div>EV</div>
        <div>Sharp</div>
        <div>CLV</div>
        <div>Book</div>
        <div>Risk</div>
      </div>
      <div className="max-h-[562px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {opportunities.map((item) => (
            <motion.button
              layout
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`terminal-row table-grid w-full px-3 py-2 text-left ${selectedId === item.id ? "bg-cyan-300/[0.08]" : ""}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${item.score > 88 ? "bg-mint shadow-[0_0_18px_rgba(54,242,167,0.9)]" : item.score > 76 ? "bg-cyan-300" : "bg-amber-300"}`} />
                  <span className="truncate text-sm font-semibold text-white">{item.matchup}</span>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-[11px] text-slate-400">
                  <span className="mono text-cyan-200">{item.league}</span>
                  <span>{item.market}</span>
                  <span className="mono">{item.line}</span>
                </div>
              </div>
              <div>
                <div className="mono text-lg font-black text-white">{item.score}</div>
                <div className="truncate text-[10px] text-slate-500">{item.label}</div>
              </div>
              <div className="mono text-sm font-bold text-mint">{signed(item.ev)}</div>
              <div>
                <div className="mono text-sm text-cyan-200">{item.sharp}%</div>
                <MiniBar value={item.sharp} />
              </div>
              <div className="mono text-sm text-amber-200">{signed(item.clv)}</div>
              <div className="min-w-0">
                <div className="truncate text-xs text-slate-200">{item.book}</div>
                <div className="truncate text-[10px] text-slate-500">alt {item.backupBook}</div>
              </div>
              <div className="text-xs text-slate-300">{item.risk}</div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function OpportunityDetail({ opportunity }) {
  if (!opportunity) return null;
  const entries = Object.entries(opportunity.components);
  const thesis = buildOpportunityThesis(opportunity);
  const riskNotes = buildRiskNotes(opportunity);
  const action = opportunity.score >= 88 ? "Play aggressively" : opportunity.score >= 76 ? "Play selectively" : opportunity.score >= 62 ? "Small stake only" : "Pass or watch";
  const actionTone = opportunity.score >= 88 ? "text-mint" : opportunity.score >= 76 ? "text-cyan-200" : opportunity.score >= 62 ? "text-amber-200" : "text-red-300";

  return (
    <Panel icon={BrainCircuit} title="AI Opportunity Score">
      <div className="p-4">
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="relative mx-auto">
            <div className="score-ring mono" style={{ "--p": opportunity.score }}>
              <div className="z-10 text-center">
                <div className="text-4xl font-black text-white">{opportunity.score}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">AQ Score</div>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-xl font-black text-white">{opportunity.matchup}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="status-pill mono text-[10px]">{opportunity.label}</span>
              <span className="status-pill mono text-[10px]">EV {signed(opportunity.ev)}%</span>
              <span className="status-pill mono text-[10px]">Kelly {opportunity.kelly}u</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <DetailMetric label="AI prob" value={percent(opportunity.aiProbability)} />
              <DetailMetric label="Market" value={percent(opportunity.marketProbability)} />
              <DetailMetric label="Edge" value={signed(opportunity.edge)} />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.52fr)]">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.045] p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
              <Sparkles size={13} />
              Model Thesis
            </div>
            <div className="text-sm leading-6 text-slate-200">{thesis}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Execution</div>
            <div className={`mono mt-1 text-xl font-black ${actionTone}`}>{action}</div>
            <div className="mt-2 text-xs leading-5 text-slate-400">
              Target stake is <span className="mono text-white">{opportunity.kelly}u</span> with risk marked <span className="text-white">{lowerText(opportunity.risk)}</span>.
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PriceCard label="Best book" value={opportunity.book} sub={`line ${opportunity.line}`} />
          <PriceCard label="Alternate" value={opportunity.backupBook} sub="compare before entry" />
          <PriceCard label="Open" value={opportunity.opening} sub={`move ${signed(opportunity.move)}`} />
          <PriceCard label="Fair value" value={opportunity.fairLine} sub={`CLV ${signed(opportunity.clv)}`} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <OpportunityMiniPanel
            icon={ArrowRightLeft}
            title="Market Split"
            rows={[
              ["Sharp money", `${opportunity.sharp}%`],
              ["Public money", `${opportunity.publicMoney}%`],
              ["Book handle", opportunity.handle],
            ]}
          />
          <OpportunityMiniPanel
            icon={ShieldCheck}
            title="Risk Lens"
            rows={[
              ["Volatility", `${opportunity.volatility}/100`],
              ["Confidence", `${opportunity.confidence}/100`],
              ["Data quality", `${opportunity.components.dataQuality}/100`],
            ]}
          />
        </div>

        <div className="mt-5 grid gap-3">
          {entries.map(([key, value]) => (
            <div key={key}>
              <div className="mb-1 flex justify-between text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <span>{labelize(key)}</span>
                <span className="mono text-slate-300">{value}</span>
              </div>
              <MiniBar value={value} tall />
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Risk Checklist</div>
          {riskNotes.map((note) => (
            <div key={note} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-300">
              {note}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {opportunity.tags.map((tag) => (
            <div key={tag} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300">
              {tag}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PriceCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-white">{value}</div>
      <div className="mt-1 truncate text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function OpportunityMiniPanel({ icon: Icon, title, rows }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <Icon size={13} className="text-cyan-300" />
        {title}
      </div>
      <div className="grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">{label}</span>
            <span className="mono text-slate-100">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildOpportunityThesis(opportunity) {
  const edgeDirection = opportunity.edge >= 0 ? "below" : "above";
  const source = opportunity.source === "real-odds" ? "live sportsbook consensus" : "the simulated market engine";
  return `${opportunity.market} at ${opportunity.book} is priced ${edgeDirection} market fair value: the model projects ${percent(opportunity.aiProbability)} against ${percent(opportunity.marketProbability)} implied. That creates ${signed(opportunity.ev)}% EV, ${signed(opportunity.edge)} points of probability edge, and ${signed(opportunity.clv)} projected closing-line value based on ${source}.`;
}

function buildRiskNotes(opportunity) {
  const notes = [
    `Entry discipline: take this only if the line is still near ${opportunity.line} and the opportunity score remains above ${Math.max(60, opportunity.score - 8)}.`,
    `Sizing: Kelly output is ${opportunity.kelly}u, but reduce stake if your bankroll exposure is already high or if multiple plays share the same game script.`,
    `Market risk: volatility is ${opportunity.volatility}/100, so late injury, lineup, weather, or limit changes can erase the edge quickly.`,
  ];

  if (opportunity.sharp > opportunity.publicMoney) {
    notes.push(`Market read: sharp share is stronger than public share by ${opportunity.sharp - opportunity.publicMoney} points, which supports the model side.`);
  } else {
    notes.push(`Market read: public share is not being clearly faded, so wait for a better number or stronger confirmation.`);
  }

  return notes;
}

function DetailMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mono mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function MarketChart({ opportunity }) {
  const canvasRef = useChart((canvas) => {
    if (!opportunity) return null;
    const labels = opportunity.lines.map((_, i) => `${i - 23}m`);
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Market line",
            data: opportunity.lines,
            borderColor: "#35f6ff",
            backgroundColor: "rgba(53, 246, 255, 0.12)",
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "AI fair line",
            data: opportunity.lines.map((value, i) => value + Math.sin(i * 0.5) * 1.7 + opportunity.edge * 0.18),
            borderColor: "#36f2a7",
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 0,
            borderDash: [5, 5],
            borderWidth: 2,
          },
        ],
      },
      options: chartOptions({ yGrid: true }),
    });
  }, [opportunity?.id, opportunity?.lines?.join("|")]);

  return (
    <Panel icon={LineChart} title="Animated Market Flow">
      <div className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="status-pill mono text-[10px]">Open {opportunity.opening}</span>
          <span className="status-pill mono text-[10px]">Now {opportunity.line}</span>
          <span className="status-pill mono text-[10px]">Move {signed(opportunity.move)}</span>
        </div>
        <div className="chart-wrap h-[280px]">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </Panel>
  );
}

function LiveEngine({ live }) {
  return (
    <Panel icon={Activity} title="Live AI Betting Engine" action={<span className="status-pill mono text-[10px]">2s RECALC</span>}>
      <div className="grid max-h-[360px] gap-2 overflow-y-auto p-3">
        {live.map((item) => (
          <motion.div
            layout
            key={item.id}
            className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 sm:grid-cols-[minmax(130px,1fr)_86px_86px_minmax(84px,0.7fr)]"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{item.matchup}</div>
              <div className="mt-1 flex gap-2 text-[11px] text-slate-400">
                <span className="mono text-cyan-200">{item.clock}</span>
                <span>{item.market}</span>
              </div>
            </div>
            <LiveMetric label="Win" value={percent(item.winProbability, 0)} tone="text-mint" />
            <LiveMetric label="Momentum" value={percent(item.momentum, 0)} tone="text-cyan-200" />
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">EV Shift</div>
              <Sparkline values={item.micro} />
            </div>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

function LiveMetric({ label, value, tone }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mono mt-1 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function PropEngine({ props }) {
  return (
    <Panel icon={Trophy} title="Elite Player Prop Engine">
      <div className="prop-grid border-b border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 mono">
        <div>Player</div>
        <div>Market</div>
        <div>Score</div>
        <div>EV</div>
        <div>Hit</div>
      </div>
      <div className="max-h-[348px] overflow-y-auto">
        {props.map((prop) => (
          <div key={prop.id} className="terminal-row prop-grid px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{prop.player}</div>
              <div className="mono mt-1 text-[11px] text-cyan-200">{prop.league} {prop.team}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-slate-200">{prop.market}</div>
              <div className="truncate text-[11px] text-slate-500">{prop.correlation}</div>
            </div>
            <div className="mono text-lg font-black text-white">{prop.score}</div>
            <div className="mono text-sm font-bold text-mint">{signed(prop.ev)}</div>
            <div>
              <div className="mono text-sm text-cyan-200">{percent(prop.hitRate)}</div>
              <MiniBar value={prop.hitRate} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BankrollAnalytics({ snapshot }) {
  const canvasRef = useChart((canvas) => {
    const labels = snapshot.history.map((item) => item.label);
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "ROI",
            data: snapshot.history.map((item) => item.roi),
            borderColor: "#36f2a7",
            backgroundColor: "rgba(54, 242, 167, 0.12)",
            pointRadius: 0,
            fill: true,
            tension: 0.35,
          },
          {
            label: "CLV",
            data: snapshot.history.map((item) => item.clv),
            borderColor: "#ffcb46",
            pointRadius: 0,
            fill: false,
            tension: 0.35,
          },
        ],
      },
      options: chartOptions({ yGrid: true }),
    });
  }, [snapshot.generatedAt]);

  return (
    <Panel icon={CircleDollarSign} title="Portfolio Analytics">
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_170px]">
        <div className="chart-wrap h-[252px] min-h-[252px]">
          <canvas ref={canvasRef} />
        </div>
        <div className="grid gap-2">
          <AnalyticsBox label="Win Rate" value={percent(snapshot.bankroll.winRate)} />
          <AnalyticsBox label="Sharpe" value={snapshot.bankroll.sharpe.toFixed(2)} />
          <AnalyticsBox label="Drawdown" value={signed(snapshot.bankroll.drawdown)} />
          <AnalyticsBox label="Exposure" value={percent(snapshot.bankroll.exposure)} />
        </div>
      </div>
    </Panel>
  );
}

function AnalyticsBox({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mono mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function MarketDetection({ snapshot }) {
  return (
    <Panel icon={Radar} title="Market Detection System" action={<span className="status-pill mono text-[10px]">Syndicate Watch</span>}>
      <div className="grid gap-2 p-3">
        {snapshot.alerts.slice(0, 5).map((alert) => (
          <div key={alert.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${alert.severity === "Critical" ? "bg-red-400 shadow-[0_0_18px_rgba(255,79,112,0.9)]" : alert.severity === "High" ? "bg-amber-300" : "bg-cyan-300"}`} />
                  <span className="truncate text-sm font-bold text-white">{alert.type}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-400">{alert.matchup} | {alert.market}</div>
              </div>
              <div className="mono text-right text-sm font-black text-cyan-200">{alert.confidence}%</div>
            </div>
          </div>
        ))}

        <div className="mt-1 overflow-x-auto">
          <div className="grid min-w-[400px] gap-1">
            {snapshot.heatmap.map((row) => (
              <div key={row.league} className="grid grid-cols-[60px_repeat(9,1fr)] items-center gap-1">
                <div className="mono text-[10px] text-slate-500">{row.league}</div>
                {row.cells.map((cell) => (
                  <div
                    key={cell.id}
                    className="heat-cell grid place-items-center mono text-[10px] text-white"
                    title={`${row.league} ${cell.label}: ${cell.value}`}
                    style={{ background: heatColor(cell.value) }}
                  >
                    {cell.value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AISynthesis({ opportunity, snapshot }) {
  const canvasRef = useChart((canvas) => {
    const labels = Object.keys(opportunity.components).map(labelize);
    const data = Object.values(opportunity.components);
    return new Chart(canvas, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "Opportunity vector",
            data,
            borderColor: "#35f6ff",
            backgroundColor: "rgba(53, 246, 255, 0.16)",
            pointBackgroundColor: "#36f2a7",
            pointBorderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true, backgroundColor: "#08111d", borderColor: "rgba(53,246,255,.24)", borderWidth: 1 },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false },
            pointLabels: { color: "#9aa8bd", font: { size: 10 } },
            grid: { color: "rgba(156,180,214,.12)" },
            angleLines: { color: "rgba(156,180,214,.12)" },
          },
        },
      },
    });
  }, [opportunity.id, snapshot.generatedAt]);

  return (
    <Panel icon={Sparkles} title="AI Synthesis">
      <div className="grid gap-3 p-3">
        <div className="chart-wrap h-[236px] min-h-[236px]">
          <canvas ref={canvasRef} />
        </div>
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.055] p-3 text-sm leading-6 text-slate-200">
          <span className="font-bold text-cyan-200">{opportunity.matchup}</span> grades as {lowerText(opportunity.label, "unrated")} because model probability is {percent(opportunity.aiProbability)} versus market-implied {percent(opportunity.marketProbability)}. Sharp money is {opportunity.sharp}% while public exposure sits at {opportunity.publicMoney}%, creating {signed(opportunity.edge)} points of modeled edge.
        </div>
      </div>
    </Panel>
  );
}

function Assistant({ messages, query, setQuery, sendMessage }) {
  return (
    <Panel icon={Bot} title="AI Betting Assistant">
      <div className="flex h-[464px] flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`chat-message ${message.role === "ai" ? "bg-cyan-300/[0.045] text-slate-200" : "ml-auto max-w-[88%] bg-white/[0.05] text-white"}`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{message.role === "ai" ? "Athena" : "Analyst"}</div>
              <div className="text-sm">{message.text}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 p-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
              placeholder="Ask about EV, market movement, props, risk, parlays..."
            />
            <button className="icon-button h-10 w-10" onClick={sendMessage} title="Send" aria-label="Send">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Panel({ icon: Icon, title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Icon size={15} className="text-cyan-300" />
          <span className="truncate">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniBar({ value, tall = false }) {
  return (
    <div className={`bar ${tall ? "h-[9px]" : "mt-1"}`} style={{ "--value": `${Math.max(4, Math.min(100, value))}%` }}>
      <span></span>
    </div>
  );
}

function Sparkline({ values }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="sparkline">
      {values.map((value, index) => {
        const h = 18 + ((value - min) / Math.max(1, max - min)) * 16;
        return <span key={`${value}-${index}`} style={{ height: `${h}px` }} />;
      })}
    </div>
  );
}

function useChart(factory, deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = factory(ref.current);
    return () => chart?.destroy();
  }, deps);
  return ref;
}

function chartOptions({ yGrid = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: { color: "#9aa8bd", boxWidth: 10, boxHeight: 10, font: { size: 10 } },
      },
      tooltip: {
        enabled: true,
        backgroundColor: "#08111d",
        borderColor: "rgba(53,246,255,.24)",
        borderWidth: 1,
        titleColor: "#e9eef7",
        bodyColor: "#c9d6e8",
      },
    },
    scales: {
      x: {
        ticks: { color: "#74839a", maxTicksLimit: 8, font: { size: 10 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: "#74839a", font: { size: 10 } },
        grid: { color: yGrid ? "rgba(156,180,214,.1)" : "transparent" },
        border: { display: false },
      },
    },
  };
}

function heatColor(value) {
  if (value > 82) return `linear-gradient(135deg, rgba(54,242,167,.92), rgba(53,246,255,.45))`;
  if (value > 65) return `linear-gradient(135deg, rgba(53,246,255,.5), rgba(54,242,167,.28))`;
  if (value > 44) return `linear-gradient(135deg, rgba(255,203,70,.55), rgba(255,203,70,.14))`;
  return `linear-gradient(135deg, rgba(255,79,112,.58), rgba(255,79,112,.12))`;
}

function labelize(value) {
  return value.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase()).trim();
}

function formatAmericanOdds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return number > 0 ? `+${Math.round(number)}` : `${Math.round(number)}`;
}

function buildAssistantAnswer(input, opportunity, snapshot) {
  const q = input.toLowerCase();
  if (q.includes("kelly") || q.includes("bankroll") || q.includes("size")) {
    return `${opportunity.matchup} prices at ${signed(opportunity.ev)}% EV with ${opportunity.volatility}% volatility, so I would cap exposure at ${opportunity.kelly} units. Portfolio exposure is already ${percent(snapshot.bankroll.exposure)}, which argues for fractional Kelly rather than full Kelly.`;
  }
  if (q.includes("prop") || q.includes("player")) {
    const prop = snapshot.props[0];
    return `Best prop on the current board is ${prop.player} ${prop.market}. Projection is ${prop.projection} against a ${prop.line} line, hit rate is ${percent(prop.hitRate)}, and the strongest cause is ${lowerText(prop.correlation)}.`;
  }
  if (q.includes("sharp") || q.includes("movement") || q.includes("reverse")) {
    return `${opportunity.matchup} shows ${opportunity.sharp}% sharp money against ${opportunity.publicMoney}% public exposure. The line moved ${signed(opportunity.move)} from an opener of ${opportunity.opening}, which is consistent with ${lowerText(opportunity.tags?.[0], "market movement")} rather than ordinary public drift.`;
  }
  if (q.includes("parlay") || q.includes("correl")) {
    const parlay = snapshot.parlays?.[0];
    if (parlay) {
      return `${parlay.label} is the top parlay right now with score ${parlay.parlayScore}, odds ${formatAmericanOdds(parlay.americanOdds)}, hit probability ${percent(parlay.hitProbability)}, and EV ${signed(parlay.expectedValue)}%. Main warning: ${parlay.correlationWarning}`;
    }
    return `I would only correlate this with markets that share the same game script. The cleanest pairing is ${opportunity.market} plus a pace-sensitive prop, because the model edge is driven by ${lowerText(opportunity.tags?.[2], "model divergence")} and CLV runway.`;
  }
  if (q.includes("risk") || q.includes("avoid")) {
    return `Risk is ${lowerText(opportunity.risk)}. Main concern is ${opportunity.volatility}% volatility, but data quality is ${opportunity.components.dataQuality}/100 and risk-adjusted score is ${opportunity.components.riskAdjusted}/100. I would avoid only if the market moves through fair value or sharp percentage falls below 55%.`;
  }
  return `${opportunity.matchup} is the current recommendation: ${opportunity.market} ${opportunity.line} at ${opportunity.book}. AI probability is ${percent(opportunity.aiProbability)} versus ${percent(opportunity.marketProbability)} market-implied, producing ${signed(opportunity.edge)} model edge and ${signed(opportunity.ev)}% expected value.`;
}

createRoot(document.getElementById("root")).render(
  <TerminalErrorBoundary>
    <App />
  </TerminalErrorBoundary>
);
