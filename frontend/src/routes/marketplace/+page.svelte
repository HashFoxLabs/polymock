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

<div class="marketplace-container">
	<div class="header">
		<h1>Strategy Marketplace</h1>
		<p class="subtitle">Discover top-performing backtest strategies from the community</p>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading strategies...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p>Error loading strategies: {error}</p>
			<button on:click={fetchStrategies}>Retry</button>
		</div>
	{:else if strategies.length === 0}
		<div class="empty-state">
			<p>No strategies available yet</p>
			<p class="hint">Be the first to create and share a strategy!</p>
		</div>
	{:else}
		<div class="strategies-list" in:fade={{ duration: 300 }}>
			{#each strategies as strategy, index (strategy.id)}
				<div class="strategy-row" in:fade={{ duration: 300, delay: index * 30 }}>
					<div class="rank-column">#{index + 1}</div>

					<div class="name-column">
						<div class="strategy-name">{strategy.strategyName}</div>
						<div class="creator-name">by {strategy.userName || truncateAddress(strategy.walletAddress)}</div>
					</div>

					<div class="chart-column">
						{#if strategy.equityCurve && strategy.equityCurve.length > 1}
							{@const vals = strategy.equityCurve.map(p => p.equity ?? p.capital ?? 0)}
							{@const min = Math.min(...vals)}
							{@const max = Math.max(...vals)}
							{@const range = max - min || 1}
							{@const pts = vals.map((v, i) => `${(i/(vals.length-1))*120},${40-((v-min)/range)*36}`).join(' ')}
							<svg viewBox="0 0 120 40" class="sparkline" preserveAspectRatio="none">
								<polyline points={pts} fill="none" stroke={strategy.totalReturnPercent >= 0 ? '#10b981' : '#ef4444'} stroke-width="1.5"/>
							</svg>
						{:else}
							<div class="no-chart">No data</div>
						{/if}
					</div>

					<div class="metric-column">
						<div class="metric-label">RETURN</div>
						<div class="metric-value" class:positive={strategy.totalReturnPercent >= 0} class:negative={strategy.totalReturnPercent < 0}>
							{formatPercent(strategy.totalReturnPercent)}
						</div>
					</div>

					<div class="metric-column">
						<div class="metric-label">WIN RATE</div>
						<div class="metric-value">{strategy.winRate.toFixed(1)}%</div>
					</div>

					<div class="metric-column">
						<div class="metric-label">TRADES</div>
						<div class="metric-value">{strategy.totalTrades}</div>
					</div>

					<div class="metric-column">
						<div class="metric-label">SHARPE</div>
						<div class="metric-value">{strategy.sharpeRatio?.toFixed(2) || 'N/A'}</div>
					</div>

					<div class="metric-column">
						<div class="metric-label">DRAWDOWN</div>
						<div class="metric-value negative">{strategy.maxDrawdown?.toFixed(1) || '0'}%</div>
					</div>

					<div class="action-column">
						<button class="view-details-btn" on:click={() => openStrategyDetails(strategy)}>
							View Details
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedStrategy}
	{@const br = buildBacktestResult(selectedStrategy)}
	{@const sc = selectedStrategy.strategyConfig ?? {}}
	<div class="modal-overlay" on:click={closeStrategyDetails} transition:fade={{ duration: 200 }}>
		<div class="modal-content" on:click|stopPropagation>
			<button class="modal-close" on:click={closeStrategyDetails}>×</button>

			<h2 class="modal-title">{selectedStrategy.strategyName}</h2>
			<div class="modal-creator">
				by {selectedStrategy.userName || truncateAddress(selectedStrategy.walletAddress)}
				{#if selectedStrategy.strategyType}
					<span class="modal-type-badge">{selectedStrategy.strategyType}</span>
				{/if}
			</div>
			{#if selectedStrategy.description}
				<p class="modal-description">{selectedStrategy.description}</p>
			{/if}

			<!-- TradingView equity curve chart -->
			<div class="modal-chart">
				<BacktestChart backtestResult={br} />
			</div>

			<!-- Key metrics -->
			<div class="modal-stats-grid">
				<div class="modal-stat">
					<div class="modal-stat-label">Total Return</div>
					<div class="modal-stat-value" class:positive={selectedStrategy.totalReturnPercent >= 0} class:negative={selectedStrategy.totalReturnPercent < 0}>
						{formatPercent(selectedStrategy.totalReturnPercent)}
					</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Initial Capital</div>
					<div class="modal-stat-value">{formatCurrency(selectedStrategy.initialCapital)}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Final Capital</div>
					<div class="modal-stat-value">{formatCurrency(selectedStrategy.finalCapital)}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Win Rate</div>
					<div class="modal-stat-value">{selectedStrategy.winRate.toFixed(1)}%</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Total Trades</div>
					<div class="modal-stat-value">{selectedStrategy.totalTrades}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Profit Factor</div>
					<div class="modal-stat-value">{selectedStrategy.profitFactor?.toFixed(2) || 'N/A'}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Sharpe Ratio</div>
					<div class="modal-stat-value">{selectedStrategy.sharpeRatio?.toFixed(2) || 'N/A'}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Max Drawdown</div>
					<div class="modal-stat-value negative">{selectedStrategy.maxDrawdown?.toFixed(2)}%</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Avg Win</div>
					<div class="modal-stat-value positive">{formatCurrency(selectedStrategy.avgWin)}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Avg Loss</div>
					<div class="modal-stat-value negative">{formatCurrency(selectedStrategy.avgLoss)}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Best Trade</div>
					<div class="modal-stat-value positive">{formatCurrency(selectedStrategy.largestWin)}</div>
				</div>
				<div class="modal-stat">
					<div class="modal-stat-label">Worst Trade</div>
					<div class="modal-stat-value negative">{formatCurrency(selectedStrategy.largestLoss)}</div>
				</div>
			</div>

			<!-- Strategy config params -->
			{#if Object.keys(sc).length > 0}
				<div class="modal-section">
					<h3>Strategy Config</h3>
					<div class="config-rows">
						{#if sc.strategyType}<div class="cfg-row"><span class="cfg-label">Strategy</span><span class="cfg-val">{sc.strategyType}</span></div>{/if}
						{#if sc.position}<div class="cfg-row"><span class="cfg-label">Side</span><span class="cfg-val">{sc.position}</span></div>{/if}
						{#if sc.priceInf != null && sc.priceSup != null}<div class="cfg-row"><span class="cfg-label">Price Range</span><span class="cfg-val">{sc.priceInf} — {sc.priceSup}</span></div>{/if}
						{#if sc.amount != null}<div class="cfg-row"><span class="cfg-label">Amount</span><span class="cfg-val">${sc.amount}</span></div>{/if}
						{#if sc.threshold != null}<div class="cfg-row"><span class="cfg-label">Threshold</span><span class="cfg-val">{sc.threshold}</span></div>{/if}
						{#if sc.stopLoss != null}<div class="cfg-row"><span class="cfg-label">Stop Loss</span><span class="cfg-val negative">{(n(sc.stopLoss)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.takeProfit != null}<div class="cfg-row"><span class="cfg-label">Take Profit</span><span class="cfg-val positive">{(n(sc.takeProfit)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.trailingStop != null}<div class="cfg-row"><span class="cfg-label">Trailing Stop</span><span class="cfg-val">{(n(sc.trailingStop)*100).toFixed(0)}%</span></div>{/if}
						{#if sc.maxHoldHours != null}<div class="cfg-row"><span class="cfg-label">Max Hold</span><span class="cfg-val">{sc.maxHoldHours}h</span></div>{/if}
						{#if sc.cooldownHours != null}<div class="cfg-row"><span class="cfg-label">Cooldown</span><span class="cfg-val">{sc.cooldownHours}h</span></div>{/if}
						{#if sc.initialCash != null}<div class="cfg-row"><span class="cfg-label">Starting Cash</span><span class="cfg-val">${n(sc.initialCash).toLocaleString()}</span></div>{/if}
					</div>
				</div>
			{/if}

			<div class="modal-section">
				<h3>Period</h3>
				<p>{formatDate(selectedStrategy.startDate)} — {formatDate(selectedStrategy.endDate)}</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.marketplace-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 40px 20px;
		background: #0A0A0A;
		min-height: 100vh;
	}

	.header {
		text-align: center;
		margin-bottom: 50px;
	}

	.header h1 {
		font-size: 42px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0 0 10px 0;
	}

	.subtitle {
		font-size: 18px;
		color: #888;
		margin: 0;
	}

	.loading-state,
	.error-state,
	.empty-state {
		text-align: center;
		padding: 80px 20px;
		color: #888;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(249, 115, 22, 0.1);
		border-top: 4px solid #F97316;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 20px;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-state button {
		margin-top: 20px;
		padding: 10px 24px;
		background: #F97316;
		color: #0A0A0A;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.error-state button:hover {
		background: #EA580C;
	}

	.strategies-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: #2a2a2a;
		border-radius: 8px;
		overflow: hidden;
	}

	.strategy-row {
		display: grid;
		grid-template-columns: 60px 250px 200px repeat(5, 1fr) 140px;
		gap: 16px;
		align-items: center;
		background: #000000;
		padding: 16px 20px;
		transition: all 0.2s ease;
		border-left: 3px solid transparent;
	}

	.strategy-row:hover {
		background: rgba(249, 115, 22, 0.05);
		border-left-color: #F97316;
	}

	.rank-column {
		font-size: 18px;
		font-weight: 700;
		color: #F97316;
		font-family: monospace;
		text-align: center;
	}

	.name-column {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.strategy-name {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.creator-name {
		font-size: 11px;
		color: #6B7280;
		font-family: monospace;
	}

	.chart-column {
		height: 40px;
		display: flex;
		align-items: center;
	}

	.no-chart {
		font-size: 11px;
		color: #6B7280;
		font-style: italic;
	}

	.metric-column {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: center;
		text-align: center;
	}

	.metric-label {
		font-size: 10px;
		color: #6B7280;
		font-weight: 600;
		letter-spacing: 0.5px;
		font-family: monospace;
	}

	.metric-value {
		font-size: 14px;
		font-weight: 700;
		color: #E8E8E8;
		font-family: monospace;
	}

	.metric-value.positive {
		color: #10B981;
	}

	.metric-value.negative {
		color: #EF4444;
	}

	.action-column {
		display: flex;
		justify-content: flex-end;
	}

	.view-details-btn {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid #F97316;
		color: #F97316;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.view-details-btn:hover {
		background: #F97316;
		color: #000000;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: #111;
		border: 1px solid #222;
		border-radius: 16px;
		padding: 28px 32px;
		max-width: 720px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
		overflow-x: hidden;
		position: relative;
		scrollbar-width: thin;
		scrollbar-color: #333 transparent;
	}

	.modal-close {
		position: absolute;
		top: 20px;
		right: 20px;
		background: transparent;
		border: none;
		color: #888;
		font-size: 32px;
		cursor: pointer;
		line-height: 1;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-close:hover {
		color: #E8E8E8;
	}

	.modal-title {
		font-size: 28px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0 0 10px 0;
	}

	.sparkline {
		width: 100%;
		height: 40px;
		display: block;
	}

	.modal-chart {
		margin: 16px 0;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid #1a1a1a;
		max-height: 340px;
		overflow-y: auto;
	}

	.config-rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: #0a0a0a;
		border-radius: 8px;
		padding: 12px 16px;
		border: 1px solid #1a1a1a;
	}

	.cfg-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid #111;
		font-size: 13px;
	}

	.cfg-row:last-child { border-bottom: none; }

	.cfg-label {
		color: #666;
		font-family: monospace;
	}

	.cfg-val {
		color: #e8e8e8;
		font-weight: 600;
		font-family: monospace;
	}

	.cfg-val.positive { color: #10b981; }
	.cfg-val.negative { color: #ef4444; }

	.modal-creator {
		color: #888;
		margin-bottom: 12px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.modal-type-badge {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.3);
		color: #F97316;
		text-transform: uppercase;
	}

	.modal-description {
		color: #9ca3af;
		font-size: 14px;
		line-height: 1.6;
		margin: 0 0 24px;
	}

	.modal-stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 16px;
		margin-bottom: 30px;
	}

	.modal-stat {
		background: #0A0A0A;
		padding: 16px;
		border-radius: 8px;
	}

	.modal-stat-label {
		font-size: 12px;
		color: #888;
		margin-bottom: 8px;
	}

	.modal-stat-value {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.modal-stat-value.positive {
		color: #10B981;
	}

	.modal-stat-value.negative {
		color: #FF4444;
	}

	.modal-section {
		margin-bottom: 30px;
	}

	.modal-section h3 {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0 0 12px 0;
	}

	.modal-section p {
		color: #888;
		margin: 0;
	}

	.market-ids {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.market-id-chip {
		background: #0A0A0A;
		border: 1px solid #222;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		color: #888;
		font-family: 'Courier New', monospace;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		margin-top: 30px;
	}

	.paper-trade-btn {
		flex: 1;
		padding: 16px;
		background: #F97316;
		color: #0A0A0A;
		border: none;
		border-radius: 8px;
		font-weight: 700;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.paper-trade-btn:disabled {
		background: #222;
		color: #555;
		cursor: not-allowed;
	}

	.paper-trade-btn:not(:disabled):hover {
		background: #EA580C;
	}

	@media (max-width: 768px) {
		.strategies-grid {
			grid-template-columns: 1fr;
		}

		.modal-content {
			padding: 30px 20px;
		}

		.modal-stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
