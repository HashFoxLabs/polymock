"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

type MarketType = "crypto" | "prediction" | "forex" | "stocks" | "commodities";
type TradeType = "paper-trade" | "backtest";

type Filters = {
  marketType: "all" | MarketType;
  tradeType: "all" | TradeType;
  pnl: "all" | "positive" | "negative";
  asset: string | null;
};

type SharedTrade = {
  id: string;
  username: string;
  marketType: MarketType;
  tradeType: TradeType;
  asset: string;
  subcategory?: string;
  direction: "long" | "short" | "yes" | "no";
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;
  pnlPercent: number;
  duration: string;
  strategy?: string;
  timestamp: string;
  comment?: string;
  likes: number;
  commentCount: number;
  winRate?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  totalTrades?: number;
  profitFactor?: number;
  avgWin?: number;
  avgLoss?: number;
  startBalance?: number;
  endBalance?: number;
  multiMarket?: boolean;
  marketCount?: number;
  equityCurve?: number[];
};

// --- Asset options per market ---

const assetOptions: Record<MarketType, string[]> = {
  crypto: ["BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "AVAX", "DOT", "MATIC", "LINK", "UNI", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "SEI", "TIA", "JUP"],
  prediction: ["Sports", "Politics", "Crypto", "Entertainment", "Science", "Economics", "Technology", "Weather", "Elections", "Awards", "Esports", "Culture"],
  forex: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP", "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/AUD"],
  stocks: ["AAPL", "TSLA", "SPY", "MSFT", "NVDA", "AMZN", "GOOG", "META", "AMD", "NFLX", "DIS", "BA", "JPM", "V", "WMT", "COIN", "PLTR", "RIVN"],
  commodities: ["Gold", "Silver", "Oil", "Natural Gas", "Copper", "Platinum", "Palladium", "Wheat", "Corn", "Soybeans", "Coffee", "Sugar"],
};

// --- Mock Data ---

const mockTrades: SharedTrade[] = [
  {
    id: "1",
    username: "cryptowhale42",
    marketType: "crypto",
    tradeType: "paper-trade",
    asset: "BTC/USDT",
    direction: "long",
    entryPrice: 67250,
    exitPrice: 71800,
    pnl: 4550,
    pnlPercent: 6.77,
    duration: "3d 14h",
    strategy: "Breakout Momentum",
    timestamp: "2025-12-28T14:30:00Z",
    comment: "Clean breakout above resistance, held through the pullback. Patience paid off!",
    likes: 12,
    commentCount: 12,
  },
  {
    id: "2",
    username: "bearish_dev",
    marketType: "crypto",
    tradeType: "paper-trade",
    asset: "ETH/USDT",
    direction: "short",
    entryPrice: 3850,
    exitPrice: 3420,
    pnl: 430,
    pnlPercent: 11.17,
    duration: "1d 8h",
    strategy: "Mean Reversion",
    timestamp: "2025-12-27T09:15:00Z",
    comment: "Rejection at the 200 EMA, textbook short setup",
    likes: 8,
    commentCount: 2,
  },
  {
    id: "3",
    username: "algo_trader_x",
    marketType: "crypto",
    tradeType: "backtest",
    asset: "SOL",
    direction: "long",
    entryPrice: 0,
    exitPrice: null,
    pnl: 12400,
    pnlPercent: 34.2,
    duration: "90d",
    strategy: "RSI + MACD Crossover",
    timestamp: "2025-12-25T18:00:00Z",
    comment: "90 day backtest on SOL with RSI + MACD. Very consistent results.",
    likes: 24,
    commentCount: 9,
    winRate: 62.5,
    sharpeRatio: 1.84,
    maxDrawdown: 12.3,
    totalTrades: 48,
    profitFactor: 1.81,
    avgWin: 76.21,
    avgLoss: 27.18,
    startBalance: 10000,
    endBalance: 13420,
    multiMarket: false,
    equityCurve: [10000, 10120, 10350, 10280, 10500, 10780, 10650, 10900, 11200, 11100, 11400, 11650, 11500, 11800, 12100, 12050, 12400, 12650, 12800, 13000, 13200, 13100, 13300, 13420],
  },
  {
    id: "4",
    username: "quant_fox",
    marketType: "crypto",
    tradeType: "backtest",
    asset: "BTC",
    direction: "long",
    entryPrice: 0,
    exitPrice: null,
    pnl: -2100,
    pnlPercent: -8.4,
    duration: "30d",
    strategy: "Grid Trading Bot",
    timestamp: "2025-12-24T12:00:00Z",
    comment: "Grid bot didn't handle the volatility spike well. Need to adjust ranges.",
    likes: 3,
    commentCount: 6,
    winRate: 45.0,
    sharpeRatio: 0.72,
    maxDrawdown: 18.6,
    totalTrades: 120,
    profitFactor: 0.72,
    avgWin: 41.81,
    avgLoss: 55.90,
    startBalance: 5000,
    endBalance: 4189.21,
    multiMarket: true,
    marketCount: 2,
    equityCurve: [5000, 5100, 5050, 4900, 4800, 4950, 4700, 4600, 4500, 4650, 4400, 4350, 4200, 4300, 4150, 4189],
  },
  {
    id: "4b",
    username: "macro_king",
    marketType: "prediction",
    tradeType: "backtest",
    asset: "POLITICS",
    direction: "long",
    entryPrice: 0,
    exitPrice: null,
    pnl: 376.23,
    pnlPercent: 0.75,
    duration: "60d",
    strategy: "Sentiment Divergence",
    timestamp: "2025-12-20T10:00:00Z",
    comment: "Political prediction markets have consistent alpha if you track polling data.",
    likes: 31,
    commentCount: 12,
    winRate: 39.3,
    sharpeRatio: 1.12,
    maxDrawdown: 139.57,
    totalTrades: 28,
    profitFactor: 1.81,
    avgWin: 76.21,
    avgLoss: 27.18,
    startBalance: 50000,
    endBalance: 50376.23,
    multiMarket: false,
    equityCurve: [50000, 50100, 50250, 50200, 50350, 50300, 50400, 50320, 50450, 50500, 50380, 50420, 50500, 50480, 50550, 50376],
  },
  {
    id: "5",
    username: "sports_oracle",
    marketType: "prediction",
    tradeType: "paper-trade",
    asset: "NBA Finals MVP",
    subcategory: "Sports",
    direction: "yes",
    entryPrice: 0.35,
    exitPrice: 0.82,
    pnl: 470,
    pnlPercent: 134.3,
    duration: "14d",
    strategy: "Statistical Model",
    timestamp: "2025-12-26T20:00:00Z",
    comment: "Got in early before the odds shifted. Statistical model nailed it.",
    likes: 18,
    commentCount: 7,
  },
  {
    id: "6",
    username: "policy_wonk",
    marketType: "prediction",
    tradeType: "paper-trade",
    asset: "Fed Rate Decision",
    subcategory: "Politics",
    direction: "no",
    entryPrice: 0.6,
    exitPrice: 0.28,
    pnl: 320,
    pnlPercent: 53.3,
    duration: "7d",
    strategy: "Contrarian Sentiment",
    timestamp: "2025-12-23T16:30:00Z",
    comment: "Market was too hawkish, faded the consensus. Easy money.",
    likes: 6,
    commentCount: 3,
  },
  {
    id: "7",
    username: "fx_ninja",
    marketType: "forex",
    tradeType: "paper-trade",
    asset: "EUR/USD",
    direction: "long",
    entryPrice: 1.0842,
    exitPrice: 1.0921,
    pnl: 790,
    pnlPercent: 0.73,
    duration: "2d 6h",
    strategy: "Support Bounce",
    timestamp: "2025-12-27T08:00:00Z",
    comment: "Strong support at 1.084, bounced perfectly. Love this pair.",
    likes: 5,
    commentCount: 1,
  },
  {
    id: "8",
    username: "cable_trader",
    marketType: "forex",
    tradeType: "paper-trade",
    asset: "GBP/USD",
    direction: "short",
    entryPrice: 1.2715,
    exitPrice: 1.2802,
    pnl: -870,
    pnlPercent: -0.68,
    duration: "1d 12h",
    strategy: "Trendline Break",
    timestamp: "2025-12-26T11:45:00Z",
    comment: "Got stopped out on the news spike. Should have waited for confirmation.",
    likes: 2,
    commentCount: 5,
  },
  {
    id: "9",
    username: "tech_bull",
    marketType: "stocks",
    tradeType: "paper-trade",
    asset: "AAPL",
    direction: "long",
    entryPrice: 192.5,
    exitPrice: 198.3,
    pnl: 580,
    pnlPercent: 3.01,
    duration: "5d",
    strategy: "Earnings Momentum",
    timestamp: "2025-12-22T14:00:00Z",
    comment: "Earnings beat drove this one. Simple momentum play.",
    likes: 9,
    commentCount: 2,
  },
  {
    id: "10",
    username: "ev_skeptic",
    marketType: "stocks",
    tradeType: "paper-trade",
    asset: "TSLA",
    direction: "short",
    entryPrice: 248.9,
    exitPrice: 231.4,
    pnl: 1750,
    pnlPercent: 7.03,
    duration: "4d 3h",
    strategy: "Resistance Rejection",
    timestamp: "2025-12-21T10:30:00Z",
    comment: "TSLA couldn't break 250 again. Clean rejection short.",
    likes: 15,
    commentCount: 8,
  },
  {
    id: "11",
    username: "gold_bug_99",
    marketType: "commodities",
    tradeType: "paper-trade",
    asset: "Gold",
    direction: "long",
    entryPrice: 2045,
    exitPrice: 2098,
    pnl: 530,
    pnlPercent: 2.59,
    duration: "6d",
    strategy: "Safe Haven Play",
    timestamp: "2025-12-20T09:00:00Z",
    comment: "Geopolitical tension = gold goes up. Never fails.",
    likes: 7,
    commentCount: 3,
  },
  {
    id: "12",
    username: "oil_baron_jr",
    marketType: "commodities",
    tradeType: "paper-trade",
    asset: "Oil",
    direction: "short",
    entryPrice: 74.2,
    exitPrice: 76.8,
    pnl: -260,
    pnlPercent: -3.5,
    duration: "2d",
    strategy: "OPEC Fade",
    timestamp: "2025-12-19T15:00:00Z",
    comment: "OPEC surprised everyone. Bad timing on this one.",
    likes: 1,
    commentCount: 0,
  },
];

// --- Colors per market ---

const marketColors: Record<MarketType, string> = {
  crypto: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  prediction: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  forex: "bg-green-500/20 text-green-400 border-green-500/30",
  stocks: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  commodities: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const tradeTypeColors: Record<TradeType, string> = {
  "paper-trade": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  backtest: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

// --- Dropdown component ---

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isFiltered = options.length > 0 && value !== options[0]?.value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border backdrop-blur-md ${
          disabled
            ? "bg-white/[0.02] text-gray-600 border-gray-800 cursor-not-allowed"
            : isFiltered
            ? "bg-orange-500/15 text-orange-400 border-orange-500/40"
            : "bg-white/5 text-gray-300 border-gray-700 hover:border-gray-500"
        }`}
      >
        <span>{label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 right-0 min-w-[180px] max-h-[280px] overflow-y-auto rounded-xl border border-gray-700 bg-[#141414]/95 backdrop-blur-xl shadow-2xl shadow-black/50 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
          >
            {options.map((opt) => {
              const isSelected = value === opt.value;
              const isActive = isSelected && isFiltered;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                    isSelected
                      ? "bg-orange-500/15 text-orange-400"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(options[0]?.value ?? "");
                        setOpen(false);
                      }}
                      className="ml-2 p-0.5 rounded hover:bg-orange-500/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Equity Curve ---

function EquityCurve({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 280;
  const h = 80;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const lineColor = positive ? "#f97316" : "#ef4444";
  const fillPoints = `${pad},${h - pad} ${points.join(" ")} ${w - pad},${h - pad}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 rounded-lg border border-gray-800 bg-white/[0.02]" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${positive})`} />
      <polyline points={points.join(" ")} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// --- Trade Card ---

const mockComments: Record<string, { user: string; text: string }[]> = {
  "1": [
    { user: "sol_maxi", text: "Great entry, clean breakout!" },
    { user: "degen_42", text: "What was your SL?" },
    { user: "cryptowhale42", text: "SL was at 66k, tight but held" },
    { user: "btc_hodler", text: "Been watching this level for weeks" },
    { user: "moon_trader", text: "Nice risk/reward ratio here" },
    { user: "whale_alert", text: "Saw the volume spike too, confirmed the move" },
    { user: "ta_master", text: "RSI divergence was the signal for me" },
    { user: "defi_degen", text: "What timeframe were you using?" },
    { user: "cryptowhale42", text: "4H chart, works best for BTC swings" },
    { user: "newbie_trader", text: "Can someone explain the breakout setup?" },
    { user: "sol_maxi", text: "Price broke above resistance with volume, classic" },
    { user: "risk_mgmt", text: "Position size? This is a solid setup" },
  ],
  "2": [{ user: "eth_bear", text: "Textbook setup" }],
  "3": [{ user: "quant_jr", text: "Impressive sharpe ratio" }, { user: "algo_fan", text: "Can you share the params?" }],
  "4": [{ user: "grid_bot_99", text: "Try tighter ranges next time" }],
  "5": [{ user: "bettor_king", text: "Nice odds!" }],
  "10": [{ user: "tsla_fan", text: "Bold short" }, { user: "ev_bull", text: "Lucky timing imo" }],
};

function TradeCard({ trade }: { trade: SharedTrade }) {
  const isPositive = trade.pnl >= 0;
  const ts = new Date(trade.timestamp);
  const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState(mockComments[trade.id] ?? []);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(trade.likes);

  const formatPrice = (price: number) =>
    price < 10 ? `$${price.toFixed(3)}` : `$${price.toLocaleString()}`;

  const isLongish = trade.direction === "long" || trade.direction === "yes";

  const handleLike = () => {
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  const handleAddComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setComments((prev) => [...prev, { user: "you", text: trimmed }]);
    setCommentText("");
  };

  // Shared like/comment buttons
  const actionButtons = (
    <div className="flex items-center gap-3 mt-auto pt-3 border-t border-gray-800">
      <button
        onClick={handleLike}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
          liked
            ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
            : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
        }`}
      >
        <svg className="w-4 h-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span>{likeCount}</span>
      </button>
      <button
        onClick={() => setShowComments((s) => !s)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
          showComments
            ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
            : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>{comments.length}</span>
      </button>
    </div>
  );

  // Comment view — replaces card body
  const commentView = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Back button */}
      <button
        onClick={() => setShowComments(false)}
        className="flex items-center gap-1 text-gray-400 hover:text-white text-xs mb-2 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to trade
      </button>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {comments.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-4">No comments yet. Be the first!</p>
        ) : (
          comments.map((c, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-orange-400 text-xs font-medium shrink-0">@{c.user}</span>
              <span className="text-gray-300 text-xs">{c.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
          placeholder="Write a comment..."
          className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
        />
        <button
          onClick={handleAddComment}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-colors"
        >
          Post
        </button>
      </div>
    </div>
  );

  const CARD = "glass-card rounded-xl p-4 border border-gray-800 transition-colors h-[340px] flex flex-col";

  const backtestDate = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Paper trade body
  const paperBody = (
    <>
      <div className="mb-3">
        <span className={`text-lg font-bold ${isLongish ? "text-green-400" : "text-red-400"}`}>
          {trade.asset}
        </span>
        {trade.subcategory && (
          <span className="text-gray-500 text-xs ml-2">({trade.subcategory})</span>
        )}
        <div className="text-gray-500 text-[10px]">{dateStr}, {timeStr}</div>
      </div>
      <div className="rounded-lg bg-white/[0.03] border border-gray-800 p-2.5 mb-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Entry Price:</span>
            <p className="text-white font-semibold text-sm">{formatPrice(trade.entryPrice)}</p>
            <span className="text-gray-600 text-[10px]">{dateStr}, {timeStr}</span>
          </div>
          <div>
            <span className="text-gray-500">Exit Price:</span>
            <p className="text-white font-semibold text-sm">
              {trade.exitPrice !== null ? formatPrice(trade.exitPrice) : "—"}
            </p>
            <span className="text-gray-600 text-[10px]">{dateStr}, {timeStr}</span>
          </div>
          <div>
            <span className="text-gray-500">P&L:</span>
            <p className={`font-bold text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {trade.comment && (
          <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">{trade.comment}</p>
        )}
      </div>
    </>
  );

  // Backtest body
  const backtestBody = (
    <>
      <div className="mb-2">
        <span className="text-lg font-bold text-purple-400 uppercase">{trade.asset}</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-[10px]">{backtestDate}</span>
          {trade.multiMarket && (
            <span className="text-orange-400/80 text-[10px]">Multi-market ({trade.marketCount})</span>
          )}
        </div>
      </div>
      {trade.equityCurve && (
        <div className="mb-3">
          <EquityCurve data={trade.equityCurve} positive={isPositive} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-white/[0.03] border border-gray-800 p-2 text-center">
          <span className="text-gray-500 text-[10px] uppercase block">Win Rate</span>
          <span className={`font-bold text-sm ${(trade.winRate ?? 0) >= 50 ? "text-green-400" : "text-red-400"}`}>{trade.winRate}%</span>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-gray-800 p-2 text-center">
          <span className="text-gray-500 text-[10px] uppercase block">Trades</span>
          <span className="font-bold text-sm text-white">{trade.totalTrades}</span>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-gray-800 p-2 text-center">
          <span className="text-gray-500 text-[10px] uppercase block">Max DD</span>
          <span className="font-bold text-sm text-red-400">{trade.maxDrawdown}%</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {trade.comment && (
          <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">{trade.comment}</p>
        )}
      </div>
    </>
  );

  const isPaper = trade.tradeType === "paper-trade";

  // Header — shared
  const header = (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-white font-medium text-sm">@{trade.username}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
          isPaper
            ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
            : "bg-pink-500/15 text-pink-400 border-pink-500/30"
        }`}>
          {isPaper ? "Paper" : "Backtest"}
        </span>
      </div>
      <span
        className={`text-xs font-bold px-3 py-1 rounded-full border ${
          isPaper
            ? isLongish
              ? "bg-green-500/15 text-green-400 border-green-500/40"
              : "bg-red-500/15 text-red-400 border-red-500/40"
            : isPositive
              ? "bg-green-500/10 text-green-400 border-green-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
        }`}
      >
        {isPaper ? trade.direction.toUpperCase() : `${isPositive ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`}
      </span>
    </div>
  );

  return (
    <div className={CARD}>
      {header}
      {showComments ? commentView : (isPaper ? paperBody : backtestBody)}
      {actionButtons}
    </div>
  );
}

// --- Main Component ---

export default function CommunityPage() {
  const [filters, setFilters] = useState<Filters>({
    marketType: "all",
    tradeType: "all",
    pnl: "all",
    asset: null,
  });
  const [search, setSearch] = useState("");
  const hasAnimated = useRef(false);

  const filteredTrades = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mockTrades.filter((trade) => {
      if (filters.marketType !== "all" && trade.marketType !== filters.marketType) return false;
      if (filters.tradeType !== "all" && trade.tradeType !== filters.tradeType) return false;
      if (filters.pnl === "positive" && trade.pnl < 0) return false;
      if (filters.pnl === "negative" && trade.pnl >= 0) return false;
      if (filters.asset) {
        const matchesAsset = trade.asset === filters.asset || trade.subcategory === filters.asset;
        if (!matchesAsset) return false;
      }
      if (q) {
        const haystack = [
          trade.username,
          trade.asset,
          trade.subcategory,
          trade.strategy,
          trade.marketType,
          trade.direction,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [filters, search]);

  const currentAssetOptions =
    filters.marketType !== "all" ? assetOptions[filters.marketType] : null;

  const marketTypeOptions = [
    { value: "all", label: "All Markets" },
    { value: "crypto", label: "Crypto" },
    { value: "prediction", label: "Prediction" },
    { value: "forex", label: "Forex" },
    { value: "stocks", label: "Stocks" },
    { value: "commodities", label: "Commodities" },
  ];
  const tradeTypeOptions = [
    { value: "all", label: "All Types" },
    { value: "paper-trade", label: "Paper Trade" },
    { value: "backtest", label: "Backtest" },
  ];
  const pnlFilterOptions = [
    { value: "all", label: "All P&L" },
    { value: "positive", label: "Profitable" },
    { value: "negative", label: "Losing" },
  ];
  const assetDropdownOptions = currentAssetOptions
    ? [{ value: "", label: "All Assets" }, ...currentAssetOptions.map((a) => ({ value: a, label: a }))]
    : null;

  const hasActiveFilters =
    filters.marketType !== "all" ||
    filters.tradeType !== "all" ||
    filters.pnl !== "all" ||
    filters.asset !== null ||
    search !== "";

  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-orange-400 to-orange-600 bg-clip-text text-transparent">
            Community Hub
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Browse shared paper trades and backtested strategies across all markets.
            Learn from the community and discover winning setups.
          </p>
        </motion.div>

        {/* Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-30 glass-card rounded-xl p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-0">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search trades, users, strategies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full pl-10 ${search ? "pr-10" : "pr-4"} py-2.5 rounded-xl text-sm bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors backdrop-blur-md`}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                label="Market"
                value={filters.marketType}
                options={marketTypeOptions}
                onChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    marketType: v as Filters["marketType"],
                    asset: null,
                  }))
                }
              />
              <FilterDropdown
                label="Type"
                value={filters.tradeType}
                options={tradeTypeOptions}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, tradeType: v as Filters["tradeType"] }))
                }
              />
              <FilterDropdown
                label="P&L"
                value={filters.pnl}
                options={pnlFilterOptions}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, pnl: v as Filters["pnl"] }))
                }
              />
              <FilterDropdown
                label="Asset"
                value={filters.asset ?? ""}
                options={assetDropdownOptions ?? [{ value: "", label: "All Assets" }]}
                onChange={(v) =>
                  setFilters((f) => ({ ...f, asset: v || null }))
                }
                disabled={!assetDropdownOptions}
              />
            </div>
          </div>
        </motion.div>

        {/* Separator + Results count */}
        <div className="flex items-center gap-4 my-8">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          <span className="text-gray-500 text-sm whitespace-nowrap">
            {filteredTrades.length} {filteredTrades.length === 1 ? "trade" : "trades"} found
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
        </div>

        {/* Results Grid */}
        {filteredTrades.length > 0 ? (
          <motion.div
            initial={!hasAnimated.current ? { opacity: 0, y: 20 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            onAnimationComplete={() => { hasAnimated.current = true; }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredTrades.map((trade) => (
              <div key={trade.id}>
                <TradeCard trade={trade} />
              </div>
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No trades match your filters.</p>
            <button
              onClick={() => {
                setFilters({
                  marketType: "all",
                  tradeType: "all",
                  pnl: "all",
                  asset: null,
                });
                setSearch("");
              }}
              className="mt-4 text-orange-500 hover:text-orange-400 transition-colors text-sm"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
