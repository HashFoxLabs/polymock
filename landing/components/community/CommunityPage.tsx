"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import WalletButton, { type ConnectedUser } from "./WalletButton";

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
  dbId?: string; // Supabase UUID for real posts
  isFromDb?: boolean;
  dbType?: "trade" | "strategy"; // which Supabase table
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
  amount?: number;
  avatarUrl?: string;
  takeProfit?: number;
  stopLoss?: number;
  status?: string;
  platform?: string;
  // Backtest extras
  winningTrades?: number;
  losingTrades?: number;
  entryType?: string;
  backtestStopLoss?: number;
  backtestTakeProfit?: number;
  positionSizingType?: string;
  positionSizingValue?: number;
  initialCapital?: number;
  finalCapital?: number;
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

const mockTrades: SharedTrade[] = [];


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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 rounded-lg border border-gray-800 bg-white/[0.02]" preserveAspectRatio="none">
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

function TradeCard({ trade, connectedUser }: { trade: SharedTrade; connectedUser: ConnectedUser | null }) {
  const isPositive = trade.pnl >= 0;
  const ts = new Date(trade.timestamp);
  const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<{ user: string; text: string; avatarUrl?: string }[]>(mockComments[trade.id] ?? []);
  const [commentsLoaded, setCommentsLoaded] = useState(!trade.isFromDb);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(trade.likes);
  const [likeChecked, setLikeChecked] = useState(false);
  const [likeMessage, setLikeMessage] = useState<string | null>(null);

  // Check if user already liked this post
  useEffect(() => {
    if (!connectedUser || !trade.isFromDb || !trade.dbId || likeChecked) return;
    const checkLike = async () => {
      const { data } = await supabase
        .from("post_likes")
        .select("id")
        .eq("user_id", connectedUser.userId)
        .eq("post_id", trade.dbId!)
        .eq("post_type", trade.dbType || "trade")
        .maybeSingle();
      if (data) setLiked(true);
      setLikeChecked(true);
    };
    checkLike();
  }, [connectedUser, trade.isFromDb, trade.dbId, trade.dbType, likeChecked]);

  const formatPrice = (price: number) =>
    price < 10 ? `$${price.toFixed(3)}` : `$${price.toLocaleString()}`;

  const isLongish = trade.direction === "long" || trade.direction === "yes";

  // Load comments from Supabase when opening comments on a real post
  const loadDbComments = useCallback(async () => {
    if (!trade.isFromDb || !trade.dbId || commentsLoaded) return;
    const table = trade.dbType === "trade" ? "trade_comments" : "strategy_comments";
    const fk = trade.dbType === "trade" ? "trade_id" : "strategy_id";
    const { data } = await supabase
      .from(table)
      .select("*, users!inner(username, avatar_url)")
      .eq(fk, trade.dbId)
      .order("created_at", { ascending: true });
    if (data) {
      setComments(data.map((c: any) => ({
        user: c.users?.username || "anon",
        text: c.content,
        avatarUrl: c.users?.avatar_url || undefined,
      })));
    }
    setCommentsLoaded(true);
  }, [trade.isFromDb, trade.dbId, trade.dbType, commentsLoaded]);

  const handleLike = async () => {
    if (!connectedUser) {
      setLikeMessage("Connect to like posts");
      setTimeout(() => setLikeMessage(null), 2000);
      return;
    }
    if (liked) {
      setLikeMessage("Already liked");
      setTimeout(() => setLikeMessage(null), 2000);
      return;
    }

    // Optimistic UI update
    setLiked(true);
    setLikeCount((c) => c + 1);

    if (trade.isFromDb && trade.dbId) {
      // Insert like record
      const { error: likeErr } = await supabase.from("post_likes").insert({
        user_id: connectedUser.userId,
        post_id: trade.dbId,
        post_type: trade.dbType || "trade",
      });

      if (likeErr) {
        // Duplicate or error — revert
        setLiked(true); // keep liked state since it already exists
        setLikeCount((c) => c - 1);
        if (likeErr.code === "23505") {
          setLikeMessage("Already liked");
        } else {
          setLikeMessage("Failed to like");
        }
        setTimeout(() => setLikeMessage(null), 2000);
        return;
      }

      // Update counter on the post
      const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
      const newCount = likeCount + 1;
      await supabase.from(countTable).update({ likes_count: Math.max(0, newCount) }).eq("id", trade.dbId);
    }
  };

  const [submittingComment, setSubmittingComment] = useState(false);

  const handleAddComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !connectedUser) return;

    setSubmittingComment(true);

    // Optimistically add to UI
    setComments((prev) => [...prev, {
      user: connectedUser.username,
      text: trimmed,
      avatarUrl: connectedUser.avatarUrl || undefined,
    }]);
    setCommentText("");

    // Save to Supabase if it's a real post
    if (trade.isFromDb && trade.dbId) {
      const table = trade.dbType === "trade" ? "trade_comments" : "strategy_comments";
      const fk = trade.dbType === "trade" ? "trade_id" : "strategy_id";
      await supabase.from(table).insert({
        [fk]: trade.dbId,
        user_id: connectedUser.userId,
        content: trimmed,
      });
      // Update comment count
      const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
      await supabase
        .from(countTable)
        .update({ comments_count: comments.length + 1 })
        .eq("id", trade.dbId);
    }

    setSubmittingComment(false);
  };

  const handleToggleComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next && trade.isFromDb) loadDbComments();
  };

  // Shared like/comment buttons
  const actionButtons = (
    <div className="flex items-center gap-3 mt-auto pt-3 border-t border-gray-800 relative">
      <div className="relative">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
            liked
              ? "bg-orange-500/15 text-orange-400 border-orange-500/30 cursor-default"
              : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
          }`}
        >
          <svg className="w-4 h-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{likeCount}</span>
        </button>
        <AnimatePresence>
          {likeMessage && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 shadow-lg z-10"
            >
              {likeMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button
        onClick={handleToggleComments}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
          showComments
            ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
            : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>{commentsLoaded ? comments.length : (trade.commentCount || comments.length)}</span>
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
      <div className="flex-1 overflow-y-auto space-y-2.5 mb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {comments.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-4">No comments yet. Be the first!</p>
        ) : (
          comments.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              {c.avatarUrl ? (
                <img src={c.avatarUrl} alt={c.user} className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-[9px] font-bold">{c.user[0]?.toUpperCase()}</span>
                </div>
              )}
              <div className="min-w-0">
                <span className="text-orange-400 text-xs font-medium">@{c.user}</span>
                <span className="text-gray-300 text-xs ml-1.5">{c.text}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      {connectedUser ? (
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
            disabled={submittingComment || !commentText.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 disabled:opacity-40 transition-colors"
          >
            Post
          </button>
        </div>
      ) : (
        <p className="text-gray-500 text-xs text-center py-1">Connect your wallet to comment</p>
      )}
    </div>
  );

  const CARD = "glass-card rounded-xl p-4 border border-gray-800 transition-colors h-[420px] flex flex-col";

  const backtestDate = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Paper trade body
  const hasTpSl = trade.takeProfit != null || trade.stopLoss != null;

  const paperBody = (
    <>
      {/* Title — fixed 2-line area */}
      <div className="min-h-[40px] max-h-[40px] mb-2 overflow-hidden">
        <p className={`text-sm font-bold leading-tight line-clamp-2 ${isLongish ? "text-green-400" : "text-red-400"}`}>
          {trade.asset}
        </p>
      </div>
      {/* Meta row */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500 text-[10px]">{dateStr}, {timeStr}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${marketColors[trade.marketType]}`}>
          {trade.marketType.toUpperCase()}
        </span>
        {trade.platform && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-gray-700 font-medium">
            {trade.platform.toUpperCase()}
          </span>
        )}
        {trade.status && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
            trade.status === "closed" ? "bg-gray-500/15 text-gray-400 border border-gray-600" : "bg-green-500/15 text-green-400 border border-green-600"
          }`}>
            {trade.status.toUpperCase()}
          </span>
        )}
      </div>
      {/* Stats grid */}
      <div className="rounded-lg bg-white/[0.03] border border-gray-800 p-2.5 mb-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {trade.amount != null && (
            <div>
              <span className="text-gray-500">Invested:</span>
              <p className="text-white font-semibold text-sm">${trade.amount.toFixed(2)}</p>
            </div>
          )}
          <div>
            <span className="text-gray-500">Entry:</span>
            <p className="text-white font-semibold text-sm">{formatPrice(trade.entryPrice)}</p>
          </div>
          <div>
            <span className="text-gray-500">Exit:</span>
            <p className="text-white font-semibold text-sm">
              {trade.exitPrice !== null ? formatPrice(trade.exitPrice) : "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">P&L:</span>
            <p className={`font-bold text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
              <span className={`text-[10px] ml-1 ${isPositive ? "text-green-500/60" : "text-red-500/60"}`}>
                ({isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>
      </div>
      {/* TP / SL row */}
      {hasTpSl && (
        <div className="flex gap-3 mb-2 text-[10px]">
          {trade.takeProfit != null && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 border border-green-500/20">
              <span className="text-gray-400">TP:</span>
              <span className="text-green-400 font-semibold">{formatPrice(trade.takeProfit)}</span>
            </div>
          )}
          {trade.stopLoss != null && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-gray-400">SL:</span>
              <span className="text-red-400 font-semibold">{formatPrice(trade.stopLoss)}</span>
            </div>
          )}
        </div>
      )}
      {/* Comment */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {trade.comment && (
          <p className="text-gray-300 text-xs leading-relaxed line-clamp-2">{trade.comment}</p>
        )}
      </div>
    </>
  );

  // Backtest body
  const backtestBody = (
    <>
      {/* Title */}
      <div className="min-h-[32px] max-h-[32px] mb-1 overflow-hidden">
        <p className="text-xs font-bold text-purple-400 uppercase leading-tight line-clamp-2">{trade.asset}</p>
      </div>
      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
        <span className="text-gray-500 text-[9px]">{backtestDate}</span>
        {trade.platform && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-gray-400 border border-gray-700 font-medium">
            {trade.platform.toUpperCase()}
          </span>
        )}
        {trade.entryType && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
            {trade.entryType.toUpperCase()}
          </span>
        )}
      </div>
      {/* Equity curve — compact */}
      {trade.equityCurve && (
        <div className="mb-1.5">
          <EquityCurve data={trade.equityCurve} positive={isPositive} />
        </div>
      )}
      {/* Capital + Return — single compact row */}
      <div className="grid grid-cols-4 gap-1 mb-1.5 text-[10px]">
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1.5 py-1 text-center">
          <span className="text-gray-500 block text-[8px] uppercase">Start</span>
          <span className="text-white font-semibold">${(trade.initialCapital ?? trade.startBalance ?? 0).toLocaleString()}</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1.5 py-1 text-center">
          <span className="text-gray-500 block text-[8px] uppercase">Final</span>
          <span className={`font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>${(trade.finalCapital ?? trade.endBalance ?? 0).toLocaleString()}</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1.5 py-1 text-center">
          <span className="text-gray-500 block text-[8px] uppercase">Return</span>
          <span className={`font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>{isPositive ? "+" : ""}{trade.pnlPercent.toFixed(1)}%</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1.5 py-1 text-center">
          <span className="text-gray-500 block text-[8px] uppercase">P&L</span>
          <span className={`font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>{isPositive ? "+" : ""}${Math.abs(trade.pnl).toFixed(0)}</span>
        </div>
      </div>
      {/* Stats grid — 2 rows of 4 */}
      <div className="grid grid-cols-4 gap-1 mb-1">
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">Win</span>
          <span className={`font-bold text-[10px] ${(trade.winRate ?? 0) >= 50 ? "text-green-400" : "text-red-400"}`}>{trade.winRate ?? "—"}%</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">Trades</span>
          <span className="font-bold text-[10px] text-white">{trade.totalTrades ?? "—"}</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">Max DD</span>
          <span className="font-bold text-[10px] text-red-400">{trade.maxDrawdown ?? "—"}%</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">Sharpe</span>
          <span className="font-bold text-[10px] text-white">{trade.sharpeRatio ?? "—"}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">PF</span>
          <span className="font-bold text-[10px] text-white">{trade.profitFactor ?? "—"}</span>
        </div>
        <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
          <span className="text-gray-500 text-[8px] uppercase block">W/L</span>
          <span className="font-bold text-[10px] text-white">{trade.winningTrades ?? "—"}/{trade.losingTrades ?? "—"}</span>
        </div>
        {trade.backtestTakeProfit != null ? (
          <div className="rounded bg-green-500/5 border border-green-500/15 px-1 py-1 text-center">
            <span className="text-gray-500 text-[8px] uppercase block">TP</span>
            <span className="font-bold text-[10px] text-green-400">{trade.backtestTakeProfit}%</span>
          </div>
        ) : (
          <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
            <span className="text-gray-500 text-[8px] uppercase block">TP</span>
            <span className="font-bold text-[10px] text-gray-600">—</span>
          </div>
        )}
        {trade.backtestStopLoss != null ? (
          <div className="rounded bg-red-500/5 border border-red-500/15 px-1 py-1 text-center">
            <span className="text-gray-500 text-[8px] uppercase block">SL</span>
            <span className="font-bold text-[10px] text-red-400">{trade.backtestStopLoss}%</span>
          </div>
        ) : (
          <div className="rounded bg-white/[0.03] border border-gray-800 px-1 py-1 text-center">
            <span className="text-gray-500 text-[8px] uppercase block">SL</span>
            <span className="font-bold text-[10px] text-gray-600">—</span>
          </div>
        )}
      </div>
    </>
  );

  const isPaper = trade.tradeType === "paper-trade";

  // Header — shared
  const header = (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {trade.avatarUrl ? (
          <img src={trade.avatarUrl} alt={trade.username} className="w-6 h-6 rounded-full object-cover border border-gray-600" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
            <span className="text-orange-400 text-[10px] font-bold">{trade.username[0]?.toUpperCase()}</span>
          </div>
        )}
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
  const [dbTrades, setDbTrades] = useState<SharedTrade[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [connectedUser, setConnectedUser] = useState<ConnectedUser | null>(null);

  const PAIR_SYMBOLS: Record<number, string> = {
    0: "SOL/USDT", 1: "BTC/USDT", 2: "ETH/USDT", 3: "AVAX/USDT", 4: "LINK/USDT",
  };

  // Load real data from Supabase
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        // Fetch published trades
        const { data: trades, error: tradeErr } = await supabase
          .from("trades")
          .select("id, user_id, source, position_type, entry_price, exit_price, amount, pnl, market_id, market_title, pair_index, analysis, is_published, likes_count, comments_count, created_at, take_profit_price, stop_loss_price, status, platform, users(username, avatar_url)")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (tradeErr) console.error("Trade fetch error:", tradeErr);

        // Fetch published strategies
        const { data: strategies, error: stratErr } = await supabase
          .from("backtest_strategies")
          .select("id, user_id, strategy_name, total_return_percent, initial_capital, final_capital, win_rate, sharpe_ratio, max_drawdown, total_trades, winning_trades, losing_trades, profit_factor, equity_curve, is_published, likes_count, comments_count, created_at, entry_type, stop_loss, take_profit, position_sizing_type, position_sizing_value, platform, users(username, avatar_url)")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (stratErr) console.error("Strategy fetch error:", stratErr);

        const items: SharedTrade[] = [];

        // Convert trades
        for (const t of trades || []) {
          const isBlockberg = t.source === "blockberg";
          const symbol = isBlockberg && t.pair_index != null
            ? PAIR_SYMBOLS[t.pair_index] || "UNKNOWN"
            : t.market_title || t.market_id || "Market";
          const posType = (t.position_type || "").toLowerCase();
          const direction = (posType === "long" || posType === "yes" || posType === "no" || posType === "short")
            ? posType as "long" | "short" | "yes" | "no"
            : "long";
          const entry = Number(t.entry_price) || 0;
          const exit = t.exit_price != null ? Number(t.exit_price) : null;
          const pnl = Number(t.pnl) || 0;
          const pnlPct = entry > 0 && exit != null ? ((exit - entry) / entry) * 100 : 0;

          items.push({
            id: `db-trade-${t.id}`,
            dbId: t.id,
            isFromDb: true,
            dbType: "trade",
            username: (t.users as any)?.username || "anon",
            avatarUrl: (t.users as any)?.avatar_url || undefined,
            marketType: isBlockberg ? "crypto" : "prediction",
            tradeType: "paper-trade",
            asset: symbol,
            direction,
            entryPrice: entry,
            exitPrice: exit,
            pnl,
            pnlPercent: pnlPct,
            duration: "",
            strategy: "",
            timestamp: t.created_at,
            comment: t.analysis || undefined,
            likes: t.likes_count || 0,
            commentCount: t.comments_count || 0,
            amount: Number(t.amount) || undefined,
            takeProfit: t.take_profit_price != null ? Number(t.take_profit_price) : undefined,
            stopLoss: t.stop_loss_price != null ? Number(t.stop_loss_price) : undefined,
            status: t.status || undefined,
            platform: t.platform || t.source || undefined,
          });
        }

        // Convert strategies
        for (const s of strategies || []) {
          const roi = Number(s.total_return_percent) || 0;
          items.push({
            id: `db-strat-${s.id}`,
            dbId: s.id,
            isFromDb: true,
            dbType: "strategy",
            username: (s.users as any)?.username || "anon",
            avatarUrl: (s.users as any)?.avatar_url || undefined,
            marketType: "prediction",
            tradeType: "backtest",
            asset: s.strategy_name || "Strategy",
            direction: roi >= 0 ? "long" : "short",
            entryPrice: 0,
            exitPrice: null,
            pnl: (Number(s.final_capital) || 0) - (Number(s.initial_capital) || 0),
            pnlPercent: roi,
            duration: "",
            strategy: s.strategy_name,
            timestamp: s.created_at,
            comment: undefined,
            likes: s.likes_count || 0,
            commentCount: s.comments_count || 0,
            winRate: Number(s.win_rate) || undefined,
            sharpeRatio: Number(s.sharpe_ratio) || undefined,
            maxDrawdown: Number(s.max_drawdown) || undefined,
            totalTrades: s.total_trades || undefined,
            startBalance: Number(s.initial_capital) || undefined,
            endBalance: Number(s.final_capital) || undefined,
            equityCurve: s.equity_curve || undefined,
            profitFactor: Number(s.profit_factor) || undefined,
            winningTrades: s.winning_trades || undefined,
            losingTrades: s.losing_trades || undefined,
            entryType: s.entry_type || undefined,
            backtestStopLoss: s.stop_loss != null ? Number(s.stop_loss) : undefined,
            backtestTakeProfit: s.take_profit != null ? Number(s.take_profit) : undefined,
            positionSizingType: s.position_sizing_type || undefined,
            positionSizingValue: s.position_sizing_value != null ? Number(s.position_sizing_value) : undefined,
            initialCapital: Number(s.initial_capital) || undefined,
            finalCapital: Number(s.final_capital) || undefined,
            platform: Array.isArray(s.platform) ? s.platform.join(", ") : s.platform || undefined,
          });
        }

        setDbTrades(items);
      } catch (err) {
        console.error("Failed to load from Supabase:", err);
      } finally {
        setDbLoading(false);
      }
    }
    loadFromSupabase();
  }, []);

  // Merge real + mock data (real first)
  const allTrades = useMemo(() => [...dbTrades, ...mockTrades], [dbTrades]);

  const filteredTrades = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allTrades.filter((trade) => {
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
  }, [filters, search, allTrades]);

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

        {/* Wallet Connect */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex justify-center mb-6"
        >
          <WalletButton onUserChange={setConnectedUser} />
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
                <TradeCard trade={trade} connectedUser={connectedUser} />
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
