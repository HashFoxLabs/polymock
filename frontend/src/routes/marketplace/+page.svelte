<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import BacktestChart from '$lib/components/backtesting/BacktestChart.svelte';

	interface Strategy {
		id: string;
		userId: string;
		strategyName: string;
		userName: string | null;
		walletAddress: string;
		marketIds: string[];
		description: string | null;
		strategyType: string | null;
		initialCapital: number;
		finalCapital: number;
		totalReturnPercent: number;
		totalTrades: number;
		winningTrades: number;
		losingTrades: number;
		winRate: number;
		sharpeRatio: number;
		maxDrawdown: number;
		profitFactor: number;
		avgWin: number;
		avgLoss: number;
		largestWin: number;
		largestLoss: number;
		startDate: string;
		endDate: string;
		equityCurve: Array<{ timestamp: string; equity?: number; capital?: number }>;
		likesCount: number;
		commentsCount: number;
		createdAt: string;
		strategyConfig: any | null;
	}

	let strategies: Strategy[] = [];
	let loading = true;
	let error = '';
	let selectedStrategy: Strategy | null = null;

	onMount(async () => {
		await fetchStrategies();
	});

	async function fetchStrategies() {
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/marketplace?limit=50');
			if (!response.ok) {
				throw new Error('Failed to fetch strategies');
			}
			const data = await response.json();
			strategies = Array.isArray(data.strategies) ? data.strategies : [];
			console.log('[Marketplace] Fetched strategies:', strategies.length, data);
		} catch (err: any) {
			console.error('Error fetching marketplace strategies:', err);
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(value);
	}

	function formatPercent(value: number): string {
		return value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function truncateAddress(address: string): string {
		if (!address) return 'Anonymous';
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}

	function openStrategyDetails(strategy: Strategy) {
		selectedStrategy = strategy;
		if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
	}

	function closeStrategyDetails() {
		selectedStrategy = null;
		if (typeof document !== 'undefined') document.body.style.overflow = '';
	}

	onDestroy(() => {
		if (typeof document !== 'undefined') document.body.style.overflow = '';
	});

	function n(v: any): number { return typeof v === 'number' && !isNaN(v) ? v : 0; }

	function buildBacktestResult(s: Strategy) {
		const pnl = (s.finalCapital ?? 0) - (s.initialCapital ?? 0);
		return {
			trades: [],
			metrics: {
				totalTrades: n(s.totalTrades),
				winningTrades: n(s.winningTrades),
				losingTrades: n(s.losingTrades),
				winRate: n(s.winRate),
				profitFactor: n(s.profitFactor),
				sharpeRatio: n(s.sharpeRatio),
				maxDrawdown: n(s.maxDrawdown),
				maxDrawdownPercentage: n(s.maxDrawdown),
				avgWin: n(s.avgWin),
				avgLoss: n(s.avgLoss),
				bestTrade: n(s.largestWin),
				worstTrade: n(s.largestLoss),
				roi: n(s.totalReturnPercent),
				totalPnl: pnl,
				netPnl: pnl,
				equityCurve: s.equityCurve ?? [],
				// required by BacktestMetrics but not stored separately
				volatility: 0,
				expectancy: 0,
				medianWin: 0,
				medianLoss: 0,
				avgHoldTime: 0,
				medianHoldTime: 0,
				capitalUtilization: 0,
				avgCapitalAllocation: 0,
				consecutiveWins: 0,
				consecutiveLosses: 0,
				longestWinStreak: 0,
				longestLossStreak: 0,
				dailyPnl: [],
				drawdownCurve: [],
				capitalUtilizationOverTime: [],
				marketBreakdown: {},
				exitReasonDistribution: { resolution: 0, stopLoss: 0, takeProfit: 0, maxHoldTime: 0, trailingStop: 0, partialExits: 0 },
				longShortBreakdown: { long: { trades: 0, winRate: 0, avgReturn: 0, pnl: 0, avgWin: 0, avgLoss: 0 }, short: { trades: 0, winRate: 0, avgReturn: 0, pnl: 0, avgWin: 0, avgLoss: 0 } },
			},
			startingCapital: n(s.initialCapital),
			endingCapital: n(s.finalCapital),
			marketsAnalyzed: s.marketIds?.length ?? 0,
			executionTime: 0,
			strategyConfig: s.strategyConfig ?? null,
		};
	}

</script>

<svelte:head>
	<title>Marketplace - PolyMock</title>
</svelte:head>

<div class="mp-page">

	<!-- Header -->
	<div class="mp-header">
		<div class="mp-header-left">
			<span class="mp-title">Marketplace</span>
			<span class="mp-sub">{strategies.length} strateg{strategies.length !== 1 ? 'ies' : 'y'}</span>
		</div>
		<button class="mp-refresh" on:click={fetchStrategies} disabled={loading}>
			{#if loading}<span class="mp-spin"></span>{/if}
			{loading ? 'Loading…' : '↻ Refresh'}
		</button>
	</div>

	{#if loading}
		<div class="mp-loading">
			<div class="mp-spin-lg"></div>
			<span>Loading strategies…</span>
		</div>
	{:else if error}
		<div class="mp-empty">
			<div class="mp-empty-icon">⚠</div>
			<div class="mp-empty-title">Failed to load</div>
			<div class="mp-empty-sub">{error}</div>
			<button class="mp-cta" on:click={fetchStrategies}>Retry</button>
		</div>
	{:else if strategies.length === 0}
		<div class="mp-empty">
			<div class="mp-empty-icon">◎</div>
			<div class="mp-empty-title">No strategies yet</div>
			<div class="mp-empty-sub">Be the first to share a backtest strategy</div>
		</div>
	{:else}
		<div class="mp-table" in:fade={{ duration: 200 }}>
			<!-- Table head -->
			<div class="mp-row mp-row-head">
				<span class="mp-col-rank">#</span>
				<span class="mp-col-name">Strategy</span>
				<span class="mp-col-spark">Curve</span>
				<span class="mp-col-num">Return</span>
				<span class="mp-col-num">Win Rate</span>
				<span class="mp-col-num">Trades</span>
				<span class="mp-col-num">Sharpe</span>
				<span class="mp-col-num">Drawdown</span>
				<span class="mp-col-action"></span>
			</div>

			{#each strategies as strategy, index (strategy.id)}
				<div class="mp-row mp-row-data" in:fade={{ duration: 200, delay: index * 20 }}>
					<!-- Rank -->
					<span class="mp-col-rank mp-rank">#{index + 1}</span>

					<!-- Name + creator -->
					<span class="mp-col-name">
						<span class="mp-sname">{strategy.strategyName}</span>
						<span class="mp-creator">by {strategy.userName || truncateAddress(strategy.walletAddress)}</span>
					</span>

					<!-- Sparkline -->
					<span class="mp-col-spark">
						{#if strategy.equityCurve && strategy.equityCurve.length > 1}
							{@const vals = strategy.equityCurve.map(p => p.equity ?? p.capital ?? 0)}
							{@const min = Math.min(...vals)}
							{@const max = Math.max(...vals)}
							{@const range = max - min || 1}
							{@const pts = vals.map((v, i) => `${(i/(vals.length-1))*100},${36-((v-min)/range)*32}`).join(' ')}
							<svg viewBox="0 0 100 36" class="mp-spark" preserveAspectRatio="none">
								<polyline points={pts} fill="none"
									stroke={strategy.totalReturnPercent >= 0 ? '#10b981' : '#ef4444'}
									stroke-width="1.5"/>
							</svg>
						{:else}
							<span class="mp-no-data">—</span>
						{/if}
					</span>

					<!-- Metrics -->
					<span class="mp-col-num mp-mono" class:mp-pos={strategy.totalReturnPercent >= 0} class:mp-neg={strategy.totalReturnPercent < 0}>
						{formatPercent(strategy.totalReturnPercent)}
					</span>
					<span class="mp-col-num mp-mono">{strategy.winRate.toFixed(1)}%</span>
					<span class="mp-col-num mp-mono">{strategy.totalTrades}</span>
					<span class="mp-col-num mp-mono">{strategy.sharpeRatio?.toFixed(2) || '—'}</span>
					<span class="mp-col-num mp-mono mp-neg">{strategy.maxDrawdown?.toFixed(1) || '0'}%</span>

					<!-- Action -->
					<span class="mp-col-action">
						<button class="mp-view-btn" on:click={() => openStrategyDetails(strategy)}>Details</button>
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedStrategy}
	{@const br = buildBacktestResult(selectedStrategy)}
	{@const sc = selectedStrategy.strategyConfig ?? {}}
	<div class="mp-overlay" on:click={closeStrategyDetails} transition:fade={{ duration: 180 }}>
		<div class="mp-modal" on:click|stopPropagation>
			<div class="mp-modal-head">
				<div>
					<div class="mp-modal-title">{selectedStrategy.strategyName}</div>
					<div class="mp-modal-creator">
						by {selectedStrategy.userName || truncateAddress(selectedStrategy.walletAddress)}
						{#if selectedStrategy.strategyType}
							<span class="mp-type-badge">{selectedStrategy.strategyType}</span>
						{/if}
					</div>
					{#if selectedStrategy.description}
						<p class="mp-modal-desc">{selectedStrategy.description}</p>
					{/if}
				</div>
				<button class="mp-modal-close" on:click={closeStrategyDetails}>×</button>
			</div>

			<!-- Equity chart -->
			<div class="mp-modal-chart">
				<BacktestChart backtestResult={br} />
			</div>

			<!-- Key metrics grid -->
			<div class="mp-mstats">
				<div class="mp-mstat">
					<div class="mp-mstat-label">Total Return</div>
					<div class="mp-mstat-val" class:mp-pos={selectedStrategy.totalReturnPercent >= 0} class:mp-neg={selectedStrategy.totalReturnPercent < 0}>
						{formatPercent(selectedStrategy.totalReturnPercent)}
					</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Initial Capital</div>
					<div class="mp-mstat-val">{formatCurrency(selectedStrategy.initialCapital)}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Final Capital</div>
					<div class="mp-mstat-val">{formatCurrency(selectedStrategy.finalCapital)}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Win Rate</div>
					<div class="mp-mstat-val">{selectedStrategy.winRate.toFixed(1)}%</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Total Trades</div>
					<div class="mp-mstat-val">{selectedStrategy.totalTrades}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Profit Factor</div>
					<div class="mp-mstat-val">{selectedStrategy.profitFactor?.toFixed(2) || '—'}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Sharpe Ratio</div>
					<div class="mp-mstat-val">{selectedStrategy.sharpeRatio?.toFixed(2) || '—'}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Max Drawdown</div>
					<div class="mp-mstat-val mp-neg">{selectedStrategy.maxDrawdown?.toFixed(2)}%</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Avg Win</div>
					<div class="mp-mstat-val mp-pos">{formatCurrency(selectedStrategy.avgWin)}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Avg Loss</div>
					<div class="mp-mstat-val mp-neg">{formatCurrency(selectedStrategy.avgLoss)}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Best Trade</div>
					<div class="mp-mstat-val mp-pos">{formatCurrency(selectedStrategy.largestWin)}</div>
				</div>
				<div class="mp-mstat">
					<div class="mp-mstat-label">Worst Trade</div>
					<div class="mp-mstat-val mp-neg">{formatCurrency(selectedStrategy.largestLoss)}</div>
				</div>
			</div>

			<!-- Config params -->
			{#if Object.keys(sc).length > 0}
				<div class="mp-section">
					<div class="mp-section-title">Strategy Config</div>
					<div class="mp-cfg">
						{#if sc.strategyType}<div class="mp-cfg-row"><span class="mp-cfg-k">Strategy</span><span class="mp-cfg-v">{sc.strategyType}</span></div>{/if}
						{#if sc.position}<div class="mp-cfg-row"><span class="mp-cfg-k">Side</span><span class="mp-cfg-v">{sc.position}</span></div>{/if}
						{#if sc.priceInf != null && sc.priceSup != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Price Range</span><span class="mp-cfg-v">{sc.priceInf} — {sc.priceSup}</span></div>{/if}
						{#if sc.amount != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Amount</span><span class="mp-cfg-v">${sc.amount}</span></div>{/if}
						{#if sc.threshold != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Threshold</span><span class="mp-cfg-v">{sc.threshold}</span></div>{/if}
						{#if sc.stopLoss != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Stop Loss</span><span class="mp-cfg-v mp-neg">{(n(sc.stopLoss)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.takeProfit != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Take Profit</span><span class="mp-cfg-v mp-pos">{(n(sc.takeProfit)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.trailingStop != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Trailing Stop</span><span class="mp-cfg-v">{(n(sc.trailingStop)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.maxHoldHours != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Max Hold</span><span class="mp-cfg-v">{sc.maxHoldHours}h</span></div>{/if}
						{#if sc.cooldownHours != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Cooldown</span><span class="mp-cfg-v">{sc.cooldownHours}h</span></div>{/if}
						{#if sc.initialCash != null}<div class="mp-cfg-row"><span class="mp-cfg-k">Starting Cash</span><span class="mp-cfg-v">${n(sc.initialCash).toLocaleString()}</span></div>{/if}
					</div>
				</div>
			{/if}

			<div class="mp-section">
				<div class="mp-section-title">Period</div>
				<div class="mp-period">{formatDate(selectedStrategy.startDate)} — {formatDate(selectedStrategy.endDate)}</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── PAGE ── */
	.mp-page {
		min-height: 100vh; background: #000; color: #e8e8e8;
		padding: 20px 24px 40px; max-width: 1440px; margin: 0 auto;
	}

	/* ── HEADER ── */
	.mp-header {
		display: flex; align-items: center; justify-content: space-between;
		padding-bottom: 20px; border-bottom: 1px solid #111; margin-bottom: 20px;
	}
	.mp-header-left { display: flex; align-items: baseline; gap: 10px; }
	.mp-title { font-size: 18px; font-weight: 700; color: #e8e8e8; letter-spacing: -0.02em; }
	.mp-sub { font-size: 12px; color: #e8e8e8; }
	.mp-refresh {
		display: flex; align-items: center; gap: 6px;
		background: transparent; border: 1px solid #1e1e1e;
		color: #e8e8e8; font-size: 12px; font-weight: 600;
		padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
	}
	.mp-refresh:hover:not(:disabled) { border-color: #F97316; color: #F97316; }
	.mp-refresh:disabled { opacity: 0.4; cursor: not-allowed; }
	.mp-spin {
		width: 11px; height: 11px; border: 2px solid #333; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── EMPTY / LOADING ── */
	.mp-loading {
		display: flex; align-items: center; gap: 10px; justify-content: center;
		padding: 80px 20px; color: #e8e8e8; font-size: 13px;
	}
	.mp-spin-lg {
		width: 18px; height: 18px; border: 2px solid #1a1a1a; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.7s linear infinite;
	}
	.mp-empty {
		display: flex; flex-direction: column; align-items: center;
		padding: 80px 20px; gap: 8px;
	}
	.mp-empty-icon { font-size: 30px; color: #e8e8e8; margin-bottom: 4px; }
	.mp-empty-title { font-size: 15px; font-weight: 700; color: #e8e8e8; }
	.mp-empty-sub { font-size: 12px; color: #e8e8e8; margin-bottom: 8px; }
	.mp-cta {
		padding: 9px 20px; background: #F97316; color: #000;
		border: none; border-radius: 7px; font-size: 13px; font-weight: 700;
		cursor: pointer; transition: background 0.15s;
	}
	.mp-cta:hover { background: #ea580c; }

	/* ── TABLE ── */
	.mp-table {
		border: 1px solid #1e1e1e; border-radius: 8px; overflow: hidden;
	}
	.mp-row {
		display: grid;
		grid-template-columns: 44px minmax(200px,1fr) 110px repeat(5, 90px) 80px;
		align-items: center; gap: 10px; padding: 0 18px;
		border-bottom: 1px solid #111;
	}
	.mp-row:last-child { border-bottom: none; }
	.mp-row-head {
		padding-top: 11px; padding-bottom: 11px;
		background: #080808; border-bottom: 1px solid #1e1e1e;
	}
	.mp-row-head span {
		font-size: 9.5px; font-weight: 800; color: #e8e8e8;
		text-transform: uppercase; letter-spacing: 0.09em;
	}
	.mp-row-data {
		padding-top: 14px; padding-bottom: 14px;
		background: #000; transition: background 0.1s;
	}
	.mp-row-data:hover { background: rgba(249,115,22,0.04); }

	/* ── COLUMNS ── */
	.mp-col-rank { text-align: center; }
	.mp-col-name { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.mp-col-spark { display: flex; align-items: center; }
	.mp-col-num { text-align: right; }
	.mp-col-action { display: flex; justify-content: flex-end; }

	.mp-rank { font-size: 13px; font-weight: 800; color: #F97316; font-family: monospace; }
	.mp-sname {
		font-size: 13px; font-weight: 600; color: #e8e8e8;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.mp-creator { font-size: 11px; color: #e8e8e8; font-family: monospace; }
	.mp-spark { width: 100%; height: 36px; display: block; }
	.mp-no-data { font-size: 11px; color: #e8e8e8; }
	.mp-mono { font-family: 'SF Mono','Fira Code',monospace; font-size: 12.5px; color: #e8e8e8; font-weight: 600; }
	.mp-pos { color: #10b981 !important; }
	.mp-neg { color: #ef4444 !important; }

	.mp-view-btn {
		background: transparent; border: 1px solid #2a2a2a;
		color: #e8e8e8; font-size: 11px; font-weight: 700;
		padding: 5px 12px; border-radius: 5px; cursor: pointer;
		transition: all 0.15s; letter-spacing: 0.02em; white-space: nowrap;
	}
	.mp-view-btn:hover { border-color: #F97316; color: #F97316; background: rgba(249,115,22,0.05); }

	/* ── MODAL ── */
	.mp-overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.85);
		backdrop-filter: blur(8px); display: flex; align-items: center;
		justify-content: center; z-index: 1000; padding: 20px;
	}
	.mp-modal {
		background: #080808; border: 1px solid #1e1e1e; border-radius: 12px;
		padding: 28px 28px 24px; max-width: 740px; width: 100%;
		max-height: 85vh; overflow-y: auto; overflow-x: hidden; position: relative;
		scrollbar-width: thin; scrollbar-color: #222 transparent;
	}
	.mp-modal-head {
		display: flex; justify-content: space-between; align-items: flex-start;
		gap: 12px; margin-bottom: 16px;
	}
	.mp-modal-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 5px; }
	.mp-modal-creator { font-size: 12px; color: #e8e8e8; display: flex; align-items: center; gap: 8px; }
	.mp-modal-desc { font-size: 13px; color: #ccc; line-height: 1.6; margin: 8px 0 0; }
	.mp-type-badge {
		font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 3px;
		background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.3); color: #F97316;
		text-transform: uppercase; letter-spacing: 0.05em;
	}
	.mp-modal-close {
		background: transparent; border: none; color: #e8e8e8;
		font-size: 28px; cursor: pointer; line-height: 1; padding: 0; flex-shrink: 0;
		transition: color 0.15s;
	}
	.mp-modal-close:hover { color: #e8e8e8; }
	.mp-modal-chart {
		border: 1px solid #1a1a1a; border-radius: 8px; overflow: hidden;
		max-height: 320px; overflow-y: auto; margin-bottom: 20px;
	}

	/* Modal metrics */
	.mp-mstats {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px;
	}
	.mp-mstat {
		background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; padding: 12px 14px;
	}
	.mp-mstat-label { font-size: 9.5px; color: #e8e8e8; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 5px; }
	.mp-mstat-val { font-size: 15px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }

	/* Config */
	.mp-section { margin-bottom: 18px; }
	.mp-section-title { font-size: 11px; font-weight: 700; color: #e8e8e8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
	.mp-cfg {
		background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; padding: 2px 14px;
	}
	.mp-cfg-row {
		display: flex; justify-content: space-between; align-items: center;
		padding: 8px 0; border-bottom: 1px solid #111; font-size: 12.5px;
	}
	.mp-cfg-row:last-child { border-bottom: none; }
	.mp-cfg-k { color: #e8e8e8; font-family: monospace; }
	.mp-cfg-v { color: #e8e8e8; font-weight: 600; font-family: monospace; }
	.mp-period { font-size: 13px; color: #e8e8e8; }

	/* ── RESPONSIVE ── */
	@media (max-width: 1100px) {
		.mp-row { grid-template-columns: 40px minmax(160px,1fr) 90px repeat(5, 78px) 72px; }
	}
	@media (max-width: 768px) {
		.mp-page { padding: 14px 14px 40px; }
		.mp-table { overflow-x: auto; }
		.mp-row { min-width: 780px; }
		.mp-mstats { grid-template-columns: repeat(2, 1fr); }
	}
</style>
