"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import WalletButton, { type ConnectedUser } from "./WalletButton";

// --- Types ---

type UserProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  walletAddress: string;
  tradeCount: number;
  strategyCount: number;
  totalPnl: number;
  winRate: number;
};

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
  equityCurveRaw?: { timestamp: string; equity: number }[];
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
  description?: string;
  strategyType?: string;
  avgHoldTime?: number;
  marketsAnalyzed?: number;
  executionTime?: number;
  strategyConfig?: {
    strategyType?: string;
    position?: string;
    priceInf?: number;
    priceSup?: number;
    amount?: number;
    threshold?: number;
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: number;
    maxHoldHours?: number;
    cooldownHours?: number;
    initialCash?: number;
  };
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

function EquityCurve({ rawData, positive }: { rawData?: { timestamp: string; equity: number }[]; positive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !rawData || rawData.length < 2) return;

    let cancelled = false;

    import("lightweight-charts").then((lc) => {
      if (cancelled || !containerRef.current) return;

      // Build time series, deduplicating by day
      const seen = new Set<string>();
      const chartData: { time: string; value: number }[] = [];
      for (const p of rawData) {
        const d = p.timestamp.slice(0, 10); // YYYY-MM-DD
        if (seen.has(d)) {
          chartData[chartData.length - 1].value = p.equity;
        } else {
          seen.add(d);
          chartData.push({ time: d, value: p.equity });
        }
      }
      if (chartData.length < 2) return;

      const chart = lc.createChart(containerRef.current!, {
        width: containerRef.current!.clientWidth,
        height: 120,
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "#666",
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.05 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: false,
        },
        crosshair: {
          horzLine: { visible: false, labelVisible: false },
          vertLine: { visible: true, labelVisible: false, color: "rgba(249,115,22,0.3)", style: lc.LineStyle.Dashed },
        },
        handleScroll: { mouseWheel: false, pressedMouseMove: false },
        handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      });

      const lineColor = positive ? "#26a65b" : "#ef5350";
      const series = chart.addSeries(lc.AreaSeries, {
        lineColor,
        topColor: positive ? "rgba(38,166,91,0.2)" : "rgba(239,83,80,0.2)",
        bottomColor: "rgba(0,0,0,0)",
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
        crosshairMarkerBorderColor: "#f97316",
        crosshairMarkerBackgroundColor: "#000",
        priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 },
      });
      series.setData(chartData);

      // Dashed baseline at initial capital
      const baseline = chart.addSeries(lc.LineSeries, {
        color: "rgba(249,115,22,0.2)",
        lineWidth: 1,
        lineStyle: lc.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      baseline.setData(chartData.map((d) => ({ time: d.time, value: chartData[0].value })));

      chart.timeScale().fitContent();
      chartRef.current = chart;

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      ro.observe(containerRef.current!);

      return () => {
        ro.disconnect();
        chart.remove();
      };
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [rawData, positive]);

  if (!rawData || rawData.length < 2) return null;

  return <div ref={containerRef} className="w-full" />;
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

// --- Profile Card ---

function ProfileCard({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const onClick = () => router.push(`/profile?address=${profile.walletAddress}`);
  const shortAddr = profile.walletAddress.slice(0, 4) + "..." + profile.walletAddress.slice(-4);
  const totalPosts = profile.tradeCount + profile.strategyCount;
  const isPositive = profile.totalPnl >= 0;

  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl border border-gray-800 hover:border-orange-500/40 transition-all duration-300 text-left w-full group bg-[#0d0d0d]"
    >
      {/* Banner */}
      <div className="h-20 w-full overflow-hidden">
        {profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-600/30 via-purple-600/20 to-transparent" />
        )}
      </div>

      {/* Avatar overlapping banner */}
      <div className="px-5 -mt-10">
        <div className="relative inline-block">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.username}
              className="w-[72px] h-[72px] rounded-full object-cover border-[3px] border-[#0d0d0d] ring-2 ring-gray-700 group-hover:ring-orange-500/50 transition-all duration-300"
            />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-orange-500/30 to-orange-600/10 border-[3px] border-[#0d0d0d] ring-2 ring-orange-500/30 flex items-center justify-center">
              <span className="text-orange-400 text-2xl font-bold">{profile.username[0]?.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* User info */}
      <div className="px-5 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-bold text-lg truncate">@{profile.username}</h3>
          <svg className="w-4 h-4 text-gray-600 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <p className="text-gray-500 text-xs mt-0.5 font-mono">{shortAddr}</p>

        {/* Tags */}
        <div className="flex items-center gap-2 mt-3">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {profile.tradeCount} Trade{profile.tradeCount !== 1 ? "s" : ""}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/10 text-pink-400 border border-pink-500/20">
            {profile.strategyCount} Strat{profile.strategyCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mt-3 p-3 rounded-xl bg-white/[0.03] border border-gray-800/80">
          <div className="text-center">
            <p className="text-white text-base font-bold leading-tight">{totalPosts}</p>
            <p className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mt-0.5">Posts</p>
          </div>
          <div className="text-center border-x border-gray-800/80">
            <p className={`text-base font-bold leading-tight ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}{profile.totalPnl.toFixed(1)}%
            </p>
            <p className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mt-0.5">Avg P&L</p>
          </div>
          <div className="text-center">
            <p className="text-white text-base font-bold leading-tight">{profile.winRate.toFixed(0)}%</p>
            <p className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mt-0.5">Win Rate</p>
          </div>
        </div>
      </div>
    </button>
  );
}

function TradeCard({ trade, connectedUser }: { trade: SharedTrade; connectedUser: ConnectedUser | null }) {
  const isPositive = trade.pnl >= 0;
  const ts = new Date(trade.timestamp);
  const dateStr = ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const [showDetail, setShowDetail] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Lock body scroll when detail modal is open
  useEffect(() => {
    if (showDetail) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [showDetail]);
  const [comments, setComments] = useState<{ id?: string; userId?: string; user: string; text: string; avatarUrl?: string }[]>(mockComments[trade.id] ?? []);
  const [commentsLoaded, setCommentsLoaded] = useState(!trade.isFromDb);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(trade.likes);
  const [likeChecked, setLikeChecked] = useState(false);
  const [likeMessage, setLikeMessage] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

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
  const isPaper = trade.tradeType === "paper-trade";

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
        id: c.id,
        userId: c.user_id,
        user: c.users?.username || "anon",
        text: c.content,
        avatarUrl: c.users?.avatar_url || undefined,
      })));
    }
    setCommentsLoaded(true);
  }, [trade.isFromDb, trade.dbId, trade.dbType, commentsLoaded]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connectedUser) {
      setLikeMessage("Connect to like posts");
      setTimeout(() => setLikeMessage(null), 2000);
      return;
    }

    if (liked) {
      // Unlike
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      if (trade.isFromDb && trade.dbId) {
        const { error: unlikeErr } = await supabase
          .from("post_likes")
          .delete()
          .eq("user_id", connectedUser.userId)
          .eq("post_id", trade.dbId)
          .eq("post_type", trade.dbType || "trade");
        if (unlikeErr) {
          setLiked(true);
          setLikeCount((c) => c + 1);
          setLikeMessage("Failed to unlike");
          setTimeout(() => setLikeMessage(null), 2000);
          return;
        }
        const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
        await supabase.from(countTable).update({ likes_count: Math.max(0, likeCount - 1) }).eq("id", trade.dbId);
      }
    } else {
      // Like
      setLiked(true);
      setLikeCount((c) => c + 1);
      if (trade.isFromDb && trade.dbId) {
        const { error: likeErr } = await supabase.from("post_likes").insert({
          user_id: connectedUser.userId,
          post_id: trade.dbId,
          post_type: trade.dbType || "trade",
        });
        if (likeErr) {
          setLiked(false);
          setLikeCount((c) => c - 1);
          setLikeMessage(likeErr.code === "23505" ? "Already liked" : "Failed to like");
          setTimeout(() => setLikeMessage(null), 2000);
          return;
        }
        const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
        await supabase.from(countTable).update({ likes_count: Math.max(0, likeCount + 1) }).eq("id", trade.dbId);
      }
    }
  };

  const handleAddComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !connectedUser) return;
    setSubmittingComment(true);
    setCommentText("");
    if (trade.isFromDb && trade.dbId) {
      const table = trade.dbType === "trade" ? "trade_comments" : "strategy_comments";
      const fk = trade.dbType === "trade" ? "trade_id" : "strategy_id";
      const { data: inserted } = await supabase.from(table).insert({ [fk]: trade.dbId, user_id: connectedUser.userId, content: trimmed }).select("id").single();
      setComments((prev) => [...prev, { id: inserted?.id, userId: connectedUser.userId, user: connectedUser.username, text: trimmed, avatarUrl: connectedUser.avatarUrl || undefined }]);
      const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
      await supabase.from(countTable).update({ comments_count: comments.length + 1 }).eq("id", trade.dbId);
    } else {
      setComments((prev) => [...prev, { user: connectedUser.username, text: trimmed, avatarUrl: connectedUser.avatarUrl || undefined }]);
    }
    setSubmittingComment(false);
  };

  const [editingCommentIdx, setEditingCommentIdx] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  const handleDeleteComment = async (idx: number) => {
    const comment = comments[idx];
    if (!comment) return;
    setComments((prev) => prev.filter((_, i) => i !== idx));
    if (trade.isFromDb && trade.dbId && comment.id) {
      const table = trade.dbType === "trade" ? "trade_comments" : "strategy_comments";
      await supabase.from(table).delete().eq("id", comment.id);
      const countTable = trade.dbType === "trade" ? "trades" : "backtest_strategies";
      await supabase.from(countTable).update({ comments_count: Math.max(0, comments.length - 1) }).eq("id", trade.dbId);
    }
  };

  const handleEditComment = async (idx: number) => {
    const trimmed = editCommentText.trim();
    if (!trimmed) return;
    const comment = comments[idx];
    if (!comment) return;
    setComments((prev) => prev.map((c, i) => i === idx ? { ...c, text: trimmed } : c));
    setEditingCommentIdx(null);
    setEditCommentText("");
    if (trade.isFromDb && trade.dbId && comment.id) {
      const table = trade.dbType === "trade" ? "trade_comments" : "strategy_comments";
      await supabase.from(table).update({ content: trimmed }).eq("id", comment.id);
    }
  };

  const openDetail = () => {
    setShowDetail(true);
    if (trade.isFromDb) loadDbComments();
  };

  const backtestDate = ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const commentCount = commentsLoaded ? comments.length : (trade.commentCount || comments.length);

  // ── Feed Row ──
  return (
    <>
      <div
        onClick={openDetail}
        className="glass-card rounded-xl border border-gray-800 hover:border-orange-500/30 transition-all cursor-pointer p-4 flex items-center gap-4"
      >
        {/* Left: Avatar */}
        <div className="shrink-0">
          {trade.avatarUrl ? (
            <img src={trade.avatarUrl} alt={trade.username} className="w-10 h-10 rounded-full object-cover border border-gray-600" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <span className="text-orange-400 text-sm font-bold">{trade.username[0]?.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Middle: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">@{trade.username}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
              isPaper ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" : "bg-pink-500/15 text-pink-400 border-pink-500/30"
            }`}>
              {isPaper ? "Trade" : "Strategy"}
            </span>
            {isPaper && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                isLongish ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}>
                {trade.direction}
              </span>
            )}
            {trade.platform && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-gray-700 font-medium">
                {trade.platform.toUpperCase()}
              </span>
            )}
            {trade.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                trade.status === "closed" ? "bg-gray-500/15 text-gray-400 border border-gray-600" : "bg-green-500/15 text-green-400 border border-green-600"
              }`}>
                {trade.status.toUpperCase()}
              </span>
            )}
          </div>
          <p className={`text-sm font-bold mt-1 truncate ${isPaper ? (isLongish ? "text-green-400" : "text-red-400") : "text-purple-400"}`}>
            {trade.asset}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{dateStr}, {timeStr}</span>
            <span className={`text-[10px] font-semibold ${marketColors[trade.marketType]?.replace("border ", "").split(" ").slice(0, 2).join(" ")}`}>
              {trade.marketType.toUpperCase()}
            </span>
            {trade.comment && <span className="truncate max-w-[200px] text-white italic">&ldquo;{trade.comment}&rdquo;</span>}
          </div>
        </div>

        {/* Right: P&L + Actions */}
        <div className="shrink-0 flex items-center gap-4">
          <div className="text-right">
            <p className={`text-lg font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
            </p>
            {isPaper && (
              <p className={`text-xs ${isPositive ? "text-green-500/60" : "text-red-500/60"}`}>
                {isPositive ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={handleLike}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-colors text-xs ${
                  liked ? "bg-orange-500/15 text-orange-400 border-orange-500/30" : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {likeCount}
              </button>
              <AnimatePresence>
                {likeMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-[10px] text-gray-300 shadow-lg z-10"
                  >
                    {likeMessage}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); openDetail(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30 transition-colors text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {commentCount}
            </button>
          </div>
        </div>
      </div>

      {/* ── Detail Modal ── */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-gray-700 bg-[#0a0a0a] shadow-2xl scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {trade.avatarUrl ? (
                    <img src={trade.avatarUrl} alt={trade.username} className="w-8 h-8 rounded-full object-cover border border-gray-600" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                      <span className="text-orange-400 text-xs font-bold">{trade.username[0]?.toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-white font-semibold text-sm">@{trade.username}</span>
                    <span className="text-gray-500 text-xs ml-2">{dateStr}, {timeStr}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                    isPaper ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" : "bg-pink-500/15 text-pink-400 border-pink-500/30"
                  }`}>
                    {isPaper ? "Trade" : "Strategy"}
                  </span>
                </div>
                <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-white transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5">
                {/* Title + Direction */}
                <div className="flex items-center justify-between mb-4">
                  <p className={`text-lg font-bold ${isPaper ? (isLongish ? "text-green-400" : "text-red-400") : "text-purple-400"}`}>
                    {trade.asset}
                  </p>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                    isPaper
                      ? isLongish ? "bg-green-500/15 text-green-400 border-green-500/40" : "bg-red-500/15 text-red-400 border-red-500/40"
                      : isPositive ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"
                  }`}>
                    {isPaper ? trade.direction.toUpperCase() : `${isPositive ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`}
                  </span>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${marketColors[trade.marketType]}`}>
                    {trade.marketType.toUpperCase()}
                  </span>
                  {trade.platform && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-gray-700 font-medium">
                      {trade.platform.toUpperCase()}
                    </span>
                  )}
                  {trade.status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      trade.status === "closed" ? "bg-gray-500/15 text-gray-400 border border-gray-600" : "bg-green-500/15 text-green-400 border border-green-600"
                    }`}>
                      {trade.status.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Description / Comment */}
                {trade.comment && (
                  <div className="rounded-xl bg-white/[0.02] border border-gray-800 p-4 mb-4">
                    <p className="text-white text-sm leading-relaxed italic">&ldquo;{trade.comment}&rdquo;</p>
                  </div>
                )}

                {isPaper ? (
                  <>
                    {/* Paper Trade Details */}
                    <div className="rounded-xl bg-white/[0.03] border border-gray-800 p-4 mb-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {trade.amount != null && (
                          <div>
                            <span className="text-gray-500 text-xs">Invested</span>
                            <p className="text-white font-bold">${trade.amount.toFixed(2)}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500 text-xs">Entry</span>
                          <p className="text-white font-bold">{formatPrice(trade.entryPrice)}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Exit</span>
                          <p className="text-white font-bold">{trade.exitPrice !== null ? formatPrice(trade.exitPrice) : "—"}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">P&L</span>
                          <p className={`font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
                            <span className={`text-xs ml-1 opacity-60`}>({isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%)</span>
                          </p>
                        </div>
                      </div>
                    </div>
                    {(trade.takeProfit != null || trade.stopLoss != null) && (
                      <div className="flex gap-3 mb-4">
                        {trade.takeProfit != null && (
                          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
                            <span className="text-gray-400">TP:</span>
                            <span className="text-green-400 font-semibold">{formatPrice(trade.takeProfit)}</span>
                          </div>
                        )}
                        {trade.stopLoss != null && (
                          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
                            <span className="text-gray-400">SL:</span>
                            <span className="text-red-400 font-semibold">{formatPrice(trade.stopLoss)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* ── Equity Curve ── */}
                    {trade.equityCurveRaw && trade.equityCurveRaw.length >= 2 && (
                      <div className="mb-5 rounded-xl border border-gray-800 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Equity Curve</span>
                          <span className={`text-xs font-bold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                          </span>
                        </div>
                        <EquityCurve rawData={trade.equityCurveRaw} positive={isPositive} />
                      </div>
                    )}

                    {/* ── Results Section ── */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-4 rounded-full bg-orange-500" />
                        <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Results</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[
                          { label: "Start", value: `$${(trade.initialCapital ?? trade.startBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-white" },
                          { label: "Final", value: `$${(trade.finalCapital ?? trade.endBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: isPositive ? "text-green-400" : "text-red-400" },
                          { label: "Return", value: `${isPositive ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`, color: isPositive ? "text-green-400" : "text-red-400" },
                          { label: "Net P&L", value: `${isPositive ? "+" : "-"}$${Math.abs(trade.pnl).toFixed(2)}`, color: isPositive ? "text-green-400" : "text-red-400" },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-gray-800 px-2 py-2.5 text-center">
                            <span className="text-gray-500 block text-[10px] uppercase tracking-wide mb-0.5">{s.label}</span>
                            <span className={`font-bold text-sm ${s.color}`}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[
                          { label: "Win Rate", value: trade.winRate != null ? `${trade.winRate.toFixed(1)}%` : "—", color: (trade.winRate ?? 0) >= 50 ? "text-green-400" : "text-red-400" },
                          { label: "Trades", value: String(trade.totalTrades ?? "—"), color: "text-white" },
                          { label: "W / L", value: `${trade.winningTrades ?? "—"} / ${trade.losingTrades ?? "—"}`, color: "text-white" },
                          { label: "Profit Factor", value: trade.profitFactor != null ? trade.profitFactor.toFixed(2) : "—", color: "text-white" },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-gray-800 px-2 py-2.5 text-center">
                            <span className="text-gray-500 block text-[10px] uppercase tracking-wide mb-0.5">{s.label}</span>
                            <span className={`font-bold text-xs ${s.color}`}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "Max DD", value: trade.maxDrawdown != null ? `${trade.maxDrawdown.toFixed(1)}%` : "—", color: "text-red-400" },
                          { label: "Sharpe", value: trade.sharpeRatio != null ? trade.sharpeRatio.toFixed(2) : "—", color: "text-white" },
                          { label: "Avg Hold", value: trade.avgHoldTime != null ? (trade.avgHoldTime >= 24 ? `${(trade.avgHoldTime / 24).toFixed(1)}d` : `${trade.avgHoldTime.toFixed(1)}h`) : "—", color: "text-white" },
                          { label: "Markets", value: String(trade.marketsAnalyzed ?? "—"), color: "text-white" },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-gray-800 px-2 py-2.5 text-center">
                            <span className="text-gray-500 block text-[10px] uppercase tracking-wide mb-0.5">{s.label}</span>
                            <span className={`font-bold text-xs ${s.color}`}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Configuration Section ── */}
                    {(() => {
                      const sc = trade.strategyConfig;
                      const hasConfig = sc || trade.entryType || trade.backtestTakeProfit != null || trade.backtestStopLoss != null || trade.positionSizingType;
                      if (!hasConfig) return null;
                      const configItems: { label: string; value: string; color?: string }[] = [];
                      if (sc?.strategyType || trade.strategyType) configItems.push({ label: "Strategy", value: sc?.strategyType || trade.strategyType || "" });
                      if (trade.entryType) configItems.push({ label: "Entry Type", value: trade.entryType });
                      if (sc?.position) configItems.push({ label: "Side", value: sc.position });
                      if (sc?.priceInf != null && sc?.priceSup != null) configItems.push({ label: "Price Range", value: `${sc.priceInf} — ${sc.priceSup}` });
                      if (sc?.amount != null) configItems.push({ label: "Amount", value: `$${sc.amount}` });
                      if (sc?.threshold != null) configItems.push({ label: "Threshold", value: String(sc.threshold) });
                      if (trade.positionSizingType) configItems.push({ label: "Sizing", value: `${trade.positionSizingType}${trade.positionSizingValue != null ? ` (${trade.positionSizingValue}${trade.positionSizingType === "PERCENTAGE" ? "%" : ""})` : ""}` });
                      if (trade.backtestTakeProfit != null && trade.backtestTakeProfit > 0) configItems.push({ label: "Take Profit", value: `${(trade.backtestTakeProfit * 100).toFixed(0)}%`, color: "text-green-400" });
                      if (trade.backtestStopLoss != null && trade.backtestStopLoss > 0) configItems.push({ label: "Stop Loss", value: `${(trade.backtestStopLoss * 100).toFixed(0)}%`, color: "text-red-400" });
                      if (sc?.trailingStop != null) configItems.push({ label: "Trailing Stop", value: `${(sc.trailingStop * 100).toFixed(0)}%` });
                      if (sc?.maxHoldHours != null) configItems.push({ label: "Max Hold", value: `${sc.maxHoldHours}h` });
                      if (sc?.cooldownHours != null) configItems.push({ label: "Cooldown", value: `${sc.cooldownHours}h` });
                      if (configItems.length === 0) return null;
                      return (
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-4 rounded-full bg-purple-500" />
                            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Configuration</span>
                          </div>
                          <div className="rounded-xl bg-white/[0.02] border border-gray-800 p-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                              {configItems.map((item) => (
                                <div key={item.label} className="flex items-center justify-between">
                                  <span className="text-gray-500 text-xs">{item.label}</span>
                                  <span className={`text-xs font-semibold ${item.color || "text-orange-400"}`}>{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* Like + Comment Actions */}
                <div className="flex items-center gap-3 mb-5 pt-3 border-t border-gray-800">
                  <div className="relative">
                    <button
                      onClick={handleLike}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
                        liked ? "bg-orange-500/15 text-orange-400 border-orange-500/30 cursor-default" : "bg-white/[0.03] border-gray-800 text-gray-400 hover:text-orange-400 hover:border-orange-500/30"
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
                          className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 shadow-lg z-10"
                        >
                          {likeMessage}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {comments.length} comments
                  </span>
                </div>

                {/* Comments Section */}
                <div className="space-y-3 mb-4 max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                  {comments.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-4">No comments yet. Be the first!</p>
                  ) : (
                    comments.map((c, i) => {
                      const isOwn = connectedUser && (c.userId === connectedUser.userId || c.user === connectedUser.username);
                      const isEditing = editingCommentIdx === i;
                      return (
                        <div key={i} className="flex items-start gap-2.5 group/comment">
                          {c.avatarUrl ? (
                            <img src={c.avatarUrl} alt={c.user} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-orange-400 text-[10px] font-bold">{c.user[0]?.toUpperCase()}</span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-orange-400 text-xs font-medium">@{c.user}</span>
                            {isEditing ? (
                              <div className="flex gap-2 mt-1">
                                <input
                                  type="text"
                                  value={editCommentText}
                                  onChange={(e) => setEditCommentText(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleEditComment(i)}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-gray-700 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                                  autoFocus
                                />
                                <button onClick={() => handleEditComment(i)} className="text-green-400 hover:text-green-300 text-xs font-medium px-2">Save</button>
                                <button onClick={() => { setEditingCommentIdx(null); setEditCommentText(""); }} className="text-gray-500 hover:text-gray-300 text-xs font-medium px-2">Cancel</button>
                              </div>
                            ) : (
                              <p className="text-white text-sm mt-0.5">{c.text}</p>
                            )}
                          </div>
                          {isOwn && !isEditing && (
                            <div className="flex gap-1 opacity-0 group-hover/comment:opacity-100 transition-opacity shrink-0 mt-0.5">
                              <button
                                onClick={() => { setEditingCommentIdx(i); setEditCommentText(c.text); }}
                                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-orange-400 transition-colors"
                                title="Edit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteComment(i)}
                                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Comment Input */}
                {connectedUser ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      placeholder="Write a comment..."
                      className="flex-1 px-4 py-2 rounded-xl text-sm bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={submittingComment || !commentText.trim()}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 disabled:opacity-40 transition-colors"
                    >
                      Post
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-2">Connect your wallet to comment</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
  const [showProfiles, setShowProfiles] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

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
          .select("id, user_id, strategy_name, strategy_type, description, total_return_percent, initial_capital, final_capital, win_rate, sharpe_ratio, max_drawdown, total_trades, winning_trades, losing_trades, profit_factor, equity_curve, is_published, likes_count, comments_count, created_at, entry_type, stop_loss, take_profit, position_sizing_type, position_sizing_value, platform, avg_hold_time, markets_analyzed, execution_time, backtest_data, users(username, avatar_url)")
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
            comment: s.description || (s.backtest_data as any)?.description || undefined,
            likes: s.likes_count || 0,
            commentCount: s.comments_count || 0,
            winRate: Number(s.win_rate) || undefined,
            sharpeRatio: Number(s.sharpe_ratio) || undefined,
            maxDrawdown: Number(s.max_drawdown) || undefined,
            totalTrades: s.total_trades || undefined,
            startBalance: Number(s.initial_capital) || undefined,
            endBalance: Number(s.final_capital) || undefined,
            equityCurve: s.equity_curve
              ? (s.equity_curve as any[]).map((p: any) => typeof p === "number" ? p : p?.equity ?? p?.value ?? 0)
              : undefined,
            equityCurveRaw: s.equity_curve
              ? (s.equity_curve as any[]).filter((p: any) => p?.timestamp && p?.equity != null).map((p: any) => ({ timestamp: p.timestamp, equity: p.equity }))
              : undefined,
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
            description: s.description || (s.backtest_data as any)?.description || undefined,
            strategyType: s.strategy_type || undefined,
            avgHoldTime: s.avg_hold_time != null ? Number(s.avg_hold_time) : undefined,
            marketsAnalyzed: s.markets_analyzed || undefined,
            executionTime: s.execution_time || undefined,
            strategyConfig: (s.backtest_data as any)?.strategyConfig || undefined,
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

  // Build user profiles from ALL users + their trades
  useEffect(() => {
    async function buildProfiles() {
      const { data: users } = await supabase
        .from("users")
        .select("id, username, wallet_address, avatar_url, banner_url")
        .order("username");

      if (!users || users.length === 0) return;

      const tradeMap = new Map<string, SharedTrade[]>();
      for (const t of dbTrades) {
        if (!t.isFromDb) continue;
        const existing = tradeMap.get(t.username);
        if (existing) existing.push(t);
        else tradeMap.set(t.username, [t]);
      }

      const profileList: UserProfile[] = [];
      for (const u of users) {
        if (!u.username) continue;
        const trades = tradeMap.get(u.username) || [];
        const tradeCount = trades.filter((t) => t.tradeType === "paper-trade").length;
        const strategyCount = trades.filter((t) => t.tradeType === "backtest").length;
        const pnls = trades.map((t) => t.pnlPercent).filter((p) => p !== 0);
        const totalPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
        const wins = trades.filter((t) => t.pnl > 0).length;
        const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
        profileList.push({
          id: u.id,
          username: u.username,
          avatarUrl: u.avatar_url || null,
          bannerUrl: u.banner_url || null,
          walletAddress: u.wallet_address,
          tradeCount,
          strategyCount,
          totalPnl,
          winRate,
        });
      }
      profileList.sort((a, b) => b.totalPnl - a.totalPnl);
      setProfiles(profileList);
    }
    buildProfiles();
  }, [dbTrades]);


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
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [filters, search, allTrades]);

  // Filter profiles by search
  const filteredProfiles = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q && !showProfiles) return [];
    return profiles.filter((p) => {
      if (!q) return true;
      return p.username.toLowerCase().includes(q) || p.walletAddress.toLowerCase().includes(q);
    });
  }, [search, profiles, showProfiles]);

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
          <p className="text-lg text-white max-w-2xl mx-auto leading-relaxed">
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
              <button
                onClick={() => setShowProfiles((s) => !s)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border backdrop-blur-md ${
                  showProfiles
                    ? "bg-orange-500/15 text-orange-400 border-orange-500/40"
                    : "bg-white/5 text-gray-300 border-gray-700 hover:border-gray-500"
                }`}
              >
                <span>Profiles</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Profiles Section */}
        {filteredProfiles.length > 0 && (
          <>
            <div className="flex items-center gap-4 mt-10 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
              <div className="px-4 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10">
                <span className="text-orange-400 text-xs font-semibold uppercase tracking-widest">
                  Profiles ({filteredProfiles.length})
                </span>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredProfiles.map((p) => (
                <ProfileCard key={p.id} profile={p} />
              ))}
            </motion.div>
          </>
        )}

        {/* Posts Section */}
        {!showProfiles && (
          <>
            <div className="flex items-center gap-4 mt-10 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
              <div className="px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10">
                <span className="text-purple-400 text-xs font-semibold uppercase tracking-widest">
                  Posts ({filteredTrades.length})
                </span>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
            </div>

            {filteredTrades.length > 0 ? (
              <motion.div
                initial={!hasAnimated.current ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                onAnimationComplete={() => { hasAnimated.current = true; }}
                className="flex flex-col gap-3 max-w-4xl mx-auto"
              >
                {filteredTrades.map((trade) => (
                  <div key={trade.id}>
                    <TradeCard trade={trade} connectedUser={connectedUser} />
                  </div>
                ))}
              </motion.div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-500 text-lg">No posts match your filters.</p>
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
          </>
        )}

        {showProfiles && filteredProfiles.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No profiles found.</p>
          </div>
        )}

      </div>
    </div>
  );
}
