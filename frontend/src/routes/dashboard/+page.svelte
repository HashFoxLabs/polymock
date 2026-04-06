<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { sessionKeyManager } from '$lib/solana/session-keys';
	import { polymarketClient } from '$lib/polymarket';
	import { PublicKey } from '@solana/web3.js';
	import PostTradeModal from '$lib/components/PostTradeModal.svelte';
	import { supabase } from '$lib/supabase';

	interface Position {
		id: string;
		marketId: string;
		marketName: string;
		predictionType: 'Yes' | 'No';
		amountUsdc: number;
		shares: number;
		pricePerShare: number;
		currentPrice: number;
		closedPrice?: number; // Price when position was closed
		pnl: number;
		pnlPercentage: number;
		status: 'Active' | 'Closed';
		openedAt: Date;
		closedAt?: Date; // When position was closed
		stopLoss?: number; // Stop loss price (0 = disabled)
		takeProfit?: number; // Take profit price (0 = disabled)
	}

	let positions: Position[] = [];
	let loading = true;
	let totalPnl = 0;
	let totalValue = 0;
	let openPositionsCount = 0;
	let closedPositionsCount = 0;
	let openPositionsValue = 0;
	let closedPositionsValue = 0;
	let openPositionsPnl = 0;
	let closedPositionsPnl = 0;
	let positionFilter: 'all' | 'open' | 'closed' = 'all';
	let walletState = $walletStore;

	// Cache for closed positions - once calculated, NEVER recalculate
	let closedPositionsCache = new Map<string, Position>();

	// Modal state
	let showConfirmModal = false;
	let showSessionRequiredModal = false;
	let modalTitle = '';
	let modalMessage = '';
	let modalDetails: any = null;
	let pendingClose: (() => Promise<void>) | null = null;
	let sharesToSell = 0;
	let maxShares = 0;

	// Post trade modal state
	let showPostModal = false;
	let postTradeData: any = null;
	let postedPositionKeys = new Set<string>();

	function getPositionKey(marketId: string, positionType: string, entryPrice: number): string {
		return `${marketId}:${positionType}:${entryPrice.toFixed(6)}`;
	}

	async function loadPostedTrades() {
		const wallet = walletState.publicKey?.toString();
		if (!wallet) return;

		const { data: user } = await supabase
			.from('users')
			.select('id')
			.eq('wallet_address', wallet)
			.maybeSingle();
		if (!user) return;

		const { data: trades } = await supabase
			.from('trades')
			.select('market_id, position_type, entry_price')
			.eq('user_id', user.id)
			.eq('is_published', true);

		if (trades) {
			postedPositionKeys = new Set(
				trades.map(t => getPositionKey(t.market_id, t.position_type, Number(t.entry_price)))
			);
		}
	}

	function isPositionPosted(position: Position): boolean {
		return postedPositionKeys.has(getPositionKey(position.marketId, position.predictionType, position.pricePerShare));
	}

	function openPostModal(position: Position) {
		postTradeData = {
			marketId: position.marketId,
			marketName: position.marketName,
			positionType: position.predictionType,
			entryPrice: position.pricePerShare,
			exitPrice: position.status === 'Closed' ? position.closedPrice || position.currentPrice : undefined,
			pnl: position.pnl,
			amount: position.amountUsdc,
			status: position.status.toLowerCase()
		};
		showPostModal = true;
	}

	function handleTradePosted() {
		if (postTradeData) {
			postedPositionKeys.add(getPositionKey(postTradeData.marketId, postTradeData.positionType, postTradeData.entryPrice));
			postedPositionKeys = postedPositionKeys; // trigger reactivity
		}
		showPostModal = false;
		postTradeData = null;
		showToastNotification('success', 'Trade posted to community feed!');
	}

	// Toast state
	let showToast = false;
	let toastType: 'success' | 'error' = 'success';
	let toastMessage = '';
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToastNotification(type: 'success' | 'error', message: string) {
		clearTimeout(toastTimer);
		toastType = type;
		toastMessage = message;
		showToast = true;
		toastTimer = setTimeout(() => { showToast = false; }, 4000);
	}

	let lastLoadedWallet: string | null = null;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		const currentWallet = value.publicKey?.toString() || null;
		// Only reload if wallet changed, not on every wallet state update
		if (value.connected && value.publicKey && currentWallet !== lastLoadedWallet) {
			lastLoadedWallet = currentWallet;
			loadPositions();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			lastLoadedWallet = walletState.publicKey.toString();
			await Promise.all([loadPositions(), loadPostedTrades()]);
		} else {
			loading = false;
		}
	});

	async function loadPositions() {
		if (!walletState.publicKey || !walletState.adapter) {
			loading = false;
			return;
		}

		loading = true;
		try {
			// Initialize program if needed
			await polymarketService.initializeProgram(walletState.adapter);

			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Convert blockchain positions to display format and fetch real-time prices
			const positionsPromises = blockchainPositions.map(async (pos) => {
				const positionId = pos.positionId.toString();
				const isClosed = 'closed' in pos.status;
				const isFullySold = 'fullySold' in pos.status;
				const isPartiallySold = 'partiallySold' in pos.status;
				const isActive = 'active' in pos.status;

				// If position is fully closed/sold and already in cache, return cached version immediately
				if ((isClosed || isFullySold) && closedPositionsCache.has(positionId)) {
					return closedPositionsCache.get(positionId)!;
				}

				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const remainingShares = pos.remainingShares.toNumber() / 1_000_000;
				const soldShares = pos.totalSoldShares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;
				const predictionType: 'Yes' | 'No' = isYes ? 'Yes' : 'No';

				// For closed/sold positions, use averageSellPrice as the closed price
				let closedPrice: number | undefined = undefined;
				if (isClosed || isFullySold || isPartiallySold) {
					if (pos.averageSellPrice && pos.averageSellPrice.toNumber() > 0) {
						closedPrice = pos.averageSellPrice.toNumber() / 1_000_000;
					} else {
						console.warn(`Position ${pos.positionId} closed/sold but averageSellPrice is ${pos.averageSellPrice?.toNumber() || 0}`);
					}
				}

				// Fetch market details to get the actual market name
				let marketName = `Market ${pos.marketId.slice(0, 10)}...`; // Fallback
				let currentPrice = pricePerShare; // Fallback to entry price

				// Fetch market name and current price
				try {
					const market = await polymarketClient.getMarketById(pos.marketId);
					if (market) {
						marketName = market.question || market.title || marketName;
					}

					// Fetch current price for active or partially sold positions
					if (isActive || isPartiallySold) {
						const fetchedPrice = await polymarketClient.getPositionCurrentPrice(
							pos.marketId,
							predictionType
						);
						if (fetchedPrice !== null && fetchedPrice > 0) {
							currentPrice = fetchedPrice;
						} else {
							console.warn(`No valid price fetched for ${marketName}, using entry price ${pricePerShare}`);
						}
					} else if (isClosed || isFullySold) {
						// For fully closed/sold positions, use the closedPrice
						if (closedPrice !== undefined && closedPrice > 0) {
							currentPrice = closedPrice;
						} else {
							console.warn(`No valid close price for closed position ${pos.positionId}, using entry price`);
							currentPrice = pricePerShare;
						}
					}
				} catch (error) {
					console.error(`Error fetching market data for position ${pos.positionId}:`, error);
				}

				// Calculate PnL
				let pnl = 0;
				let currentValue = 0;

				if (isPartiallySold) {
					// For partially sold: realized PnL + unrealized PnL
					const realizedPnL = (soldShares * closedPrice!) - (amountUsdc * (soldShares / shares));
					const unrealizedPnL = (remainingShares * currentPrice) - (amountUsdc * (remainingShares / shares));
					pnl = realizedPnL + unrealizedPnL;
					currentValue = (soldShares * closedPrice!) + (remainingShares * currentPrice);
				} else if (isClosed || isFullySold) {
					// For fully closed/sold: use closed price
					const priceForPnL = closedPrice || pricePerShare;
					currentValue = shares * priceForPnL;
					pnl = currentValue - amountUsdc;
				} else {
					// For active positions: use current price
					currentValue = shares * currentPrice;
					pnl = currentValue - amountUsdc;
				}

				const pnlPercentage = (pnl / amountUsdc) * 100;
				const status: 'Active' | 'Closed' = (isClosed || isFullySold) ? 'Closed' : 'Active';


				const stopLoss = pos.stopLoss ? pos.stopLoss.toNumber() / 1_000_000 : 0;
				const takeProfit = pos.takeProfit ? pos.takeProfit.toNumber() / 1_000_000 : 0;

				const position: Position = {
					id: positionId,
					marketId: pos.marketId,
					marketName,
					predictionType,
					amountUsdc,
					shares: remainingShares > 0 ? remainingShares : shares, // Show remaining shares if partially sold
					pricePerShare,
					currentPrice: (isClosed || isFullySold) ? (closedPrice || currentPrice) : currentPrice,
					closedPrice,
					pnl,
					pnlPercentage,
					status,
					openedAt: new Date(pos.openedAt.toNumber() * 1000),
					closedAt: (isClosed || isFullySold) ? new Date(pos.closedAt.toNumber() * 1000) : undefined,
					stopLoss: stopLoss > 0 ? stopLoss : undefined,
					takeProfit: takeProfit > 0 ? takeProfit : undefined
				};

				// Cache fully closed/sold positions so they NEVER get recalculated
				if (isClosed || isFullySold) {
					closedPositionsCache.set(positionId, position);
				}

				return position;
			});

			positions = await Promise.all(positionsPromises);

			calculateTotals();
		} catch (error) {
			console.error('Error loading positions:', error);
			positions = [];
		} finally {
			loading = false;
		}
	}

	function calculateTotals() {
		const openPositions = positions.filter(p => p.status === 'Active');
		const closedPositions = positions.filter(p => p.status === 'Closed');

		openPositionsCount = openPositions.length;
		closedPositionsCount = closedPositions.length;

		openPositionsPnl = openPositions.reduce((sum, pos) => sum + pos.pnl, 0);
		closedPositionsPnl = closedPositions.reduce((sum, pos) => sum + pos.pnl, 0);

		openPositionsValue = openPositions.reduce((sum, pos) => sum + (pos.shares * pos.currentPrice), 0);
		// For closed positions, use closedPrice if available, otherwise currentPrice
		closedPositionsValue = closedPositions.reduce((sum, pos) => {
			const price = pos.closedPrice || pos.currentPrice;
			return sum + (pos.shares * price);
		}, 0);

		totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0);
		// Use closedPrice for closed positions, currentPrice for active
		totalValue = positions.reduce((sum, pos) => {
			const price = pos.status === 'Closed' ? (pos.closedPrice || pos.currentPrice) : pos.currentPrice;
			return sum + (pos.shares * price);
		}, 0);
	}

	$: filteredPositions = positions.filter(pos => {
		if (positionFilter === 'open') return pos.status === 'Active';
		if (positionFilter === 'closed') return pos.status === 'Closed';
		return true;
	});

	$: displayTotalPositions = positionFilter === 'all' ? positions.length :
		positionFilter === 'open' ? openPositionsCount : closedPositionsCount;

	$: displayTotalValue = positionFilter === 'all' ? totalValue :
		positionFilter === 'open' ? openPositionsValue : closedPositionsValue;

	$: displayTotalPnl = positionFilter === 'all' ? totalPnl :
		positionFilter === 'open' ? openPositionsPnl : closedPositionsPnl;

	function formatUSDC(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatPercentage(percentage: number): string {
		const sign = percentage >= 0 ? '+' : '';
		return `${sign}${percentage.toFixed(2)}%`;
	}

	async function goToMarket(marketId: string) {
		// Try to find the event slug for this market
		const eventSlug = await polymarketClient.getEventSlugForMarket(marketId);

		if (eventSlug) {
			// Navigate to the event page which shows all markets for this event
			goto(`/event/${eventSlug}`);
		} else {
			// Fallback: try navigating to market page directly (if it exists)
			goto(`/market/${marketId}`);
		}
	}

	async function sellPosition(positionId: string, currentPrice: number, position: Position) {
		if (!walletState.connected || !walletState.adapter) {
			showToastNotification('error', 'Please connect your wallet first!');
			return;
		}

		// Check session key
		if (!sessionKeyManager.isSessionActive()) {
			showSessionRequiredModal = true;
			return;
		}

		// Initialize shares to sell with full position
		maxShares = position.shares;
		sharesToSell = position.shares;

		// Show confirmation modal with position details
		modalTitle = 'Sell Shares';
		modalDetails = {
			market: position.marketName,
			type: position.predictionType,
			amount: formatUSDC(position.amountUsdc),
			shares: position.shares.toFixed(2),
			entryPrice: `$${position.pricePerShare.toFixed(2)}`,
			currentPrice: `$${currentPrice.toFixed(2)}`,
			pnl: formatUSDC(position.pnl),
			pnlPercentage: `${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage.toFixed(2)}%`
		};
		showConfirmModal = true;

		// Store the sell execution
		pendingClose = async () => {
			try {
				// Validate shares to sell
				if (sharesToSell <= 0 || sharesToSell > maxShares) {
					showToastNotification('error', `Please enter a valid number of shares between 0 and ${maxShares.toFixed(2)}`);
					return;
				}

				const tx = await polymarketService.sellShares(
					walletState.adapter,
					parseInt(positionId),
					sharesToSell,
					currentPrice,
					position.predictionType
				);

				// Calculate if position is fully closed
				const isFullyClosed = sharesToSell >= position.shares;

				if (isFullyClosed) {
					// Cache the fully closed position with the current price
					const closedPosition: Position = {
						...position,
						status: 'Closed',
						closedPrice: currentPrice,
						currentPrice: currentPrice,
						pnl: (position.shares * currentPrice) - position.amountUsdc,
						pnlPercentage: (((position.shares * currentPrice) - position.amountUsdc) / position.amountUsdc) * 100,
						closedAt: new Date()
					};
					closedPositionsCache.set(positionId, closedPosition);
				}

				// Show success toast
				const action = isFullyClosed ? 'Position closed' : 'Shares sold';
				showToastNotification('success', `${action}! Sold ${sharesToSell.toFixed(2)} shares. Tx: ${tx.slice(0, 20)}...`);

				// Refresh balance and positions
				if (walletState.publicKey) {
					await refreshUserBalance(new PublicKey(walletState.publicKey.toString()));
				}
				await loadPositions();
			} catch (error: any) {
				console.error('Error selling shares:', error);
				showToastNotification('error', error.message || 'Failed to sell shares');
			}
		};
	}

	async function confirmClose() {
		showConfirmModal = false;
		if (pendingClose) {
			await pendingClose();
			pendingClose = null;
		}
	}

	function cancelClose() {
		showConfirmModal = false;
		pendingClose = null;
	}

	function closeModal() {
		showConfirmModal = false;
		modalDetails = null;
	}
</script>

<div class="db-page">

	<!-- Header -->
	<div class="db-header">
		<div class="db-header-left">
			<span class="db-header-title">Portfolio</span>
			<span class="db-header-sub">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
		</div>
		<button class="db-refresh" on:click={loadPositions} disabled={loading}>
			{#if loading}
				<span class="db-spin"></span>
			{:else}
				↻
			{/if}
			{loading ? 'Syncing…' : 'Refresh'}
		</button>
	</div>

	<!-- Stats row -->
	<div class="db-stats">
		<div class="db-stat">
			<div class="db-stat-label">Positions</div>
			<div class="db-stat-val">{displayTotalPositions}</div>
			{#if positionFilter === 'all'}
				<div class="db-stat-sub">
					<span class="db-sub-open">{openPositionsCount} open</span>
					<span class="db-stat-dot">·</span>
					<span>{closedPositionsCount} closed</span>
				</div>
			{/if}
		</div>
		<div class="db-stat">
			<div class="db-stat-label">Portfolio Value</div>
			<div class="db-stat-val orange">{formatUSDC(displayTotalValue)}</div>
			{#if positionFilter === 'all'}
				<div class="db-stat-sub">
					<span class="db-sub-open">{formatUSDC(openPositionsValue)}</span>
					<span class="db-stat-dot">·</span>
					<span>{formatUSDC(closedPositionsValue)}</span>
				</div>
			{/if}
		</div>
		<div class="db-stat">
			<div class="db-stat-label">Total P&L</div>
			<div class="db-stat-val" class:db-pos={displayTotalPnl >= 0} class:db-neg={displayTotalPnl < 0}>
				{formatUSDC(displayTotalPnl)}
			</div>
			{#if positionFilter === 'all'}
				<div class="db-stat-sub">
					<span class:db-pos={openPositionsPnl >= 0} class:db-neg={openPositionsPnl < 0}>{formatUSDC(openPositionsPnl)}</span>
					<span class="db-stat-dot">·</span>
					<span class:db-pos={closedPositionsPnl >= 0} class:db-neg={closedPositionsPnl < 0}>{formatUSDC(closedPositionsPnl)}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Filter tabs -->
	<div class="db-tabs">
		<button class="db-tab" class:db-tab-active={positionFilter === 'all'} on:click={() => positionFilter = 'all'}>
			All <span class="db-tab-count">{positions.length}</span>
		</button>
		<button class="db-tab" class:db-tab-active={positionFilter === 'open'} on:click={() => positionFilter = 'open'}>
			Open <span class="db-tab-count">{openPositionsCount}</span>
		</button>
		<button class="db-tab" class:db-tab-active={positionFilter === 'closed'} on:click={() => positionFilter = 'closed'}>
			Closed <span class="db-tab-count">{closedPositionsCount}</span>
		</button>
	</div>

	<!-- Positions -->
	<div class="db-body">
		{#if loading}
			<div class="db-loading">
				<div class="db-spin-lg"></div>
				<span>Loading positions…</span>
			</div>
		{:else if filteredPositions.length === 0}
			<div class="db-empty">
				<div class="db-empty-icon">◎</div>
				<div class="db-empty-title">No positions</div>
				<div class="db-empty-sub">Start trading to see your positions here</div>
				<button class="db-cta" on:click={() => goto('/')}>Explore Markets</button>
			</div>
		{:else}
			<!-- Table header -->
			<div class="db-row db-row-head">
				<span class="db-col-market">Market</span>
				<span class="db-col-type">Type</span>
				<span class="db-col-num">Invested</span>
				<span class="db-col-num">Shares</span>
				<span class="db-col-num">Entry</span>
				<span class="db-col-num">Current</span>
				<span class="db-col-num">P&L</span>
				<span class="db-col-sltp">SL / TP</span>
				<span class="db-col-date">Closed At</span>
				<span class="db-col-status">Status</span>
				<span class="db-col-action">Action</span>
			</div>

			{#each filteredPositions as position (position.id)}
				<div class="db-row db-row-data">
					<!-- Market -->
					<span class="db-col-market">
						<button class="db-market-btn" on:click={() => goToMarket(position.marketId)}>
							{position.marketName}
						</button>
					</span>

					<!-- Type -->
					<span class="db-col-type">
						<span class="db-type-badge" class:db-yes={position.predictionType === 'Yes'} class:db-no={position.predictionType === 'No'}>
							{position.predictionType}
						</span>
					</span>

					<!-- Invested -->
					<span class="db-col-num db-mono">{formatUSDC(position.amountUsdc)}</span>

					<!-- Shares -->
					<span class="db-col-num db-mono">{position.shares.toFixed(2)}</span>

					<!-- Entry price -->
					<span class="db-col-num db-mono">{(position.pricePerShare * 100).toFixed(1)}¢</span>

					<!-- Current / closed price -->
					<span class="db-col-num db-mono">
						{#if position.status === 'Closed' && position.closedPrice !== undefined}
							{(position.closedPrice * 100).toFixed(1)}¢
						{:else if position.status === 'Active'}
							{(position.currentPrice * 100).toFixed(1)}¢
						{:else}
							<span class="db-muted">—</span>
						{/if}
					</span>

					<!-- P&L -->
					<span class="db-col-num db-mono" class:db-pos={position.pnl >= 0} class:db-neg={position.pnl < 0}>
						{formatUSDC(position.pnl)}
						<span class="db-pct">({formatPercentage(position.pnlPercentage)})</span>
					</span>

					<!-- SL / TP -->
					<span class="db-col-sltp">
						{#if position.stopLoss}
							<span class="db-sltp-badge db-sl">{position.stopLoss.toFixed(1)}¢</span>
						{:else}
							<span class="db-muted">—</span>
						{/if}
						<span class="db-muted db-sltp-sep">/</span>
						{#if position.takeProfit}
							<span class="db-sltp-badge db-tp">{position.takeProfit.toFixed(1)}¢</span>
						{:else}
							<span class="db-muted">—</span>
						{/if}
					</span>

					<!-- Closed At -->
					<span class="db-col-date db-mono">
						{#if position.status === 'Closed' && position.closedAt}
							{position.closedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						{:else}
							<span class="db-muted">—</span>
						{/if}
					</span>

					<!-- Status -->
					<span class="db-col-status">
						<span class="db-status" class:db-status-active={position.status === 'Active'} class:db-status-closed={position.status === 'Closed'}>
							{position.status}
						</span>
					</span>

					<!-- Actions -->
					<span class="db-col-action">
						{#if position.status === 'Active'}
							<button class="db-sell-btn" on:click={() => sellPosition(position.id, position.currentPrice, position)}>Sell</button>
							{#if isPositionPosted(position)}
								<span class="db-posted">Posted</span>
							{/if}
						{:else if isPositionPosted(position)}
							<span class="db-posted">Posted</span>
						{:else}
							<button class="db-post-btn" on:click={() => openPostModal(position)}>Post</button>
						{/if}
					</span>
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Confirmation Modal -->
{#if showConfirmModal}
<div class="pm-overlay" on:click={cancelClose} on:keydown={(e) => e.key === 'Escape' && cancelClose()} role="button" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<div class="pm-dot pending"></div>
		<h3 class="pm-title">{modalTitle}</h3>
		{#if modalDetails}
		<div class="pm-details">
			<div class="pm-row">
				<span class="pm-label">Market</span>
				<span class="pm-value" style="max-width: 200px; text-align: right;">{modalDetails.market}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Type</span>
				<span class="pm-value">{modalDetails.type}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Invested</span>
				<span class="pm-value">{modalDetails.amount}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Entry Price</span>
				<span class="pm-value">{modalDetails.entryPrice}</span>
			</div>
			<div class="pm-row">
				<span class="pm-label">Current Price</span>
				<span class="pm-value">{modalDetails.currentPrice}</span>
			</div>
			<div class="pm-row highlight">
				<span class="pm-label">Est. P&L</span>
				<span class="pm-value highlight-value">{modalDetails.pnl} ({modalDetails.pnlPercentage})</span>
			</div>
		</div>
		<div class="pm-shares-section">
			<label for="sharesToSell" class="pm-shares-label">Shares to Sell</label>
			<div class="pm-input-row">
				<input
					id="sharesToSell"
					type="number"
					bind:value={sharesToSell}
					min="0"
					max={maxShares}
					step="0.01"
					class="pm-shares-input"
				/>
				<button class="pm-max-btn" on:click={() => sharesToSell = maxShares}>MAX</button>
			</div>
			<div class="pm-shares-info">Available: {maxShares.toFixed(2)} shares</div>
		</div>
		{/if}
		<div class="pm-actions">
			<button class="pm-btn secondary" on:click={cancelClose}>Cancel</button>
			<button class="pm-btn primary" on:click={confirmClose}>Confirm Sell</button>
		</div>
	</div>
</div>
{/if}

<!-- Toast Notification -->
{#if showToast}
<div class="toast {toastType}">
	<div class="toast-header">
		<span class="toast-icon">{toastType === 'success' ? '✓' : '✕'}</span>
		<span class="toast-title">{toastType === 'success' ? 'ORDER EXECUTED' : 'ERROR'}</span>
		<button class="toast-close" on:click={() => showToast = false} aria-label="Close">&times;</button>
	</div>
	<p class="toast-msg">{toastMessage}</p>
</div>
{/if}

<!-- Session Required Modal -->
{#if showSessionRequiredModal}
<div class="pm-overlay" on:keydown={(e) => e.key === 'Escape' && e.preventDefault()} role="dialog" tabindex="0">
	<div class="pm-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
		<div class="pm-dot pending"></div>
		<h3 class="pm-title">Session Required</h3>
		<p class="pm-desc">
			You need an active session to trade. Enable one-click trading from the session button in the navbar to sign once and trade instantly.
		</p>
		<button class="pm-btn primary" on:click={() => showSessionRequiredModal = false}>Got it</button>
	</div>
</div>
{/if}

{#if showPostModal && postTradeData}
	<PostTradeModal
		trade={postTradeData}
		onClose={() => { showPostModal = false; postTradeData = null; }}
		onPosted={handleTradePosted}
	/>
{/if}

<style>
	/* ── PAGE ── */
	.db-page {
		min-height: 100vh;
		background: #000;
		color: #e8e8e8;
		padding: 20px 24px 40px;
		max-width: 1440px;
		margin: 0 auto;
		font-family: inherit;
	}

	/* ── HEADER ── */
	.db-header {
		display: flex; align-items: center; justify-content: space-between;
		padding-bottom: 20px;
		border-bottom: 1px solid #111;
		margin-bottom: 20px;
	}
	.db-header-left { display: flex; align-items: baseline; gap: 10px; }
	.db-header-title { font-size: 18px; font-weight: 700; color: #e8e8e8; letter-spacing: -0.02em; }
	.db-header-sub { font-size: 12px; color: #e8e8e8; }
	.db-refresh {
		display: flex; align-items: center; gap: 6px;
		background: transparent; border: 1px solid #1e1e1e;
		color: #e8e8e8; font-size: 12px; font-weight: 600;
		padding: 6px 12px; border-radius: 6px; cursor: pointer;
		transition: all 0.15s; letter-spacing: 0.02em;
	}
	.db-refresh:hover:not(:disabled) { border-color: #F97316; color: #F97316; }
	.db-refresh:disabled { opacity: 0.4; cursor: not-allowed; }
	.db-spin {
		width: 11px; height: 11px;
		border: 2px solid #333; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── STATS ── */
	.db-stats {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
		margin-bottom: 20px;
	}
	.db-stat {
		background: #070707; border: 1px solid #1e1e1e;
		border-top: 2px solid #222;
		border-radius: 8px; padding: 18px 20px;
		position: relative; overflow: hidden;
	}
	.db-stat::before {
		content: ''; position: absolute; top: 0; left: 0;
		width: 3px; height: 100%; background: #1e1e1e;
	}
	.db-stat-label { font-size: 10px; color: #e8e8e8; text-transform: uppercase; letter-spacing: 0.09em; font-weight: 700; margin-bottom: 8px; }
	.db-stat-val { font-size: 26px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; margin-bottom: 6px; letter-spacing: -0.02em; }
	.db-stat-val.orange { color: #F97316; }
	.db-stat-sub { font-size: 11.5px; color: #e8e8e8; display: flex; gap: 6px; align-items: center; }
	.db-stat-dot { color: #e8e8e8; }
	.db-sub-open { color: #e8e8e8; font-weight: 600; }

	/* ── TABS ── */
	.db-tabs {
		display: flex; gap: 0;
		border-bottom: 1px solid #111;
		margin-bottom: 0;
	}
	.db-tab {
		background: transparent; border: none;
		border-bottom: 2px solid transparent; margin-bottom: -1px;
		color: #e8e8e8; padding: 10px 18px; font-size: 13px; font-weight: 700;
		cursor: pointer; transition: color 0.15s; display: flex; align-items: center; gap: 7px;
		letter-spacing: 0.01em;
	}
	.db-tab:hover { color: #e8e8e8; }
	.db-tab-active { color: #fff; border-bottom-color: #F97316; }
	.db-tab-count {
		font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
		background: #111; color: #e8e8e8;
	}
	.db-tab-active .db-tab-count { background: rgba(249,115,22,0.18); color: #F97316; }

	/* ── TABLE ── */
	.db-body {
		background: #000; border: 1px solid #1e1e1e; border-top: none;
		border-radius: 0 0 8px 8px; overflow-x: auto;
	}
	.db-row {
		display: grid;
		grid-template-columns: minmax(180px,1fr) 60px 95px 75px 72px 72px 120px 95px 105px 78px 95px;
		align-items: center;
		padding: 0 18px;
		border-bottom: 1px solid #111;
		gap: 10px;
	}
	.db-row:last-child { border-bottom: none; }
	.db-row-head {
		padding-top: 11px; padding-bottom: 11px;
		background: #080808; border-bottom: 1px solid #1e1e1e;
	}
	.db-row-head span {
		font-size: 9.5px; font-weight: 800; color: #e8e8e8;
		text-transform: uppercase; letter-spacing: 0.09em;
	}
	.db-row-data {
		padding-top: 14px; padding-bottom: 14px;
		transition: background 0.1s;
	}
	.db-row-data:hover { background: rgba(249,115,22,0.04); border-color: #1e1e1e; }

	/* ── COLUMNS ── */
	.db-col-market { min-width: 0; }
	.db-col-num { text-align: right; }
	.db-col-sltp { display: flex; align-items: center; gap: 4px; justify-content: center; }
	.db-col-status { text-align: center; }
	.db-col-action { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
	.db-col-type { text-align: center; }
	.db-col-date { font-size: 11.5px; color: #e8e8e8; white-space: nowrap; }

	/* Market link */
	.db-market-btn {
		background: none; border: none; padding: 0;
		color: #e8e8e8; font-size: 12.5px; font-weight: 600;
		cursor: pointer; text-align: left;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		max-width: 100%; transition: color 0.15s; display: block;
	}
	.db-market-btn:hover { color: #F97316; }

	/* Type badge */
	.db-type-badge {
		font-size: 10.5px; font-weight: 800; padding: 4px 9px;
		border-radius: 4px; letter-spacing: 0.04em;
	}
	.db-yes { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
	.db-no  { background: rgba(239,68,68,0.12);  color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

	/* Numbers */
	.db-mono { font-family: 'SF Mono','Fira Code',monospace; font-size: 12.5px; color: #e8e8e8; }
	.db-muted { color: #e8e8e8; font-size: 12px; }
	.db-pct { font-size: 10.5px; margin-left: 3px; }

	/* PnL colors */
	.db-pos { color: #10b981 !important; }
	.db-neg { color: #ef4444 !important; }
	.db-pos .db-pct { color: rgba(16,185,129,0.8); }
	.db-neg .db-pct { color: rgba(239,68,68,0.8); }

	/* SL/TP badges */
	.db-sltp-badge { font-size: 10.5px; font-weight: 700; padding: 3px 7px; border-radius: 3px; white-space: nowrap; }
	.db-sl { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
	.db-tp { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
	.db-sltp-sep { font-size: 10px; color: #e8e8e8; }

	/* Status */
	.db-status { font-size: 10.5px; font-weight: 700; padding: 4px 9px; border-radius: 4px; letter-spacing: 0.03em; }
	.db-status-active { background: rgba(249,115,22,0.12); color: #F97316; border: 1px solid rgba(249,115,22,0.3); }
	.db-status-closed { background: rgba(255,255,255,0.06); color: #e8e8e8; border: 1px solid #222; }

	/* Action buttons */
	.db-sell-btn {
		background: transparent; border: 1px solid rgba(239,68,68,0.3);
		color: #ef4444; font-size: 11px; font-weight: 700;
		padding: 4px 10px; border-radius: 5px; cursor: pointer;
		transition: all 0.15s; letter-spacing: 0.02em;
	}
	.db-sell-btn:hover { background: rgba(239,68,68,0.12); border-color: #ef4444; }
	.db-post-btn {
		background: transparent; border: 1px solid rgba(249,115,22,0.3);
		color: #F97316; font-size: 11px; font-weight: 700;
		padding: 4px 10px; border-radius: 5px; cursor: pointer;
		transition: all 0.15s;
	}
	.db-post-btn:hover { background: rgba(249,115,22,0.1); border-color: #F97316; }
	.db-posted {
		font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
		background: rgba(16,185,129,0.08); color: #10b981;
		border: 1px solid rgba(16,185,129,0.2);
	}

	/* Loading / empty */
	.db-loading {
		display: flex; align-items: center; gap: 10px; justify-content: center;
		padding: 60px 20px; color: #e8e8e8; font-size: 13px;
	}
	.db-spin-lg {
		width: 18px; height: 18px;
		border: 2px solid #1a1a1a; border-top-color: #F97316;
		border-radius: 50%; animation: spin 0.7s linear infinite;
	}
	.db-empty {
		display: flex; flex-direction: column; align-items: center;
		padding: 72px 20px; gap: 8px;
	}
	.db-empty-icon { font-size: 32px; color: #e8e8e8; margin-bottom: 4px; }
	.db-empty-title { font-size: 15px; font-weight: 700; color: #e8e8e8; }
	.db-empty-sub { font-size: 12px; color: #e8e8e8; margin-bottom: 8px; }
	.db-cta {
		padding: 9px 20px; background: #F97316; color: #000;
		border: none; border-radius: 7px; font-size: 13px; font-weight: 700;
		cursor: pointer; transition: background 0.15s;
	}
	.db-cta:hover { background: #ea580c; }

	/* Modal Styles */
	/* Polymock Modal System */
	.pm-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
		animation: pmFadeIn 0.2s ease-out;
	}

	@keyframes pmFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.pm-modal {
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 20px;
		padding: 36px 32px;
		max-width: 420px;
		width: 90vw;
		text-align: center;
		animation: pmSlideUp 0.3s ease-out;
	}

	@keyframes pmSlideUp {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.pm-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		margin: 0 auto 20px auto;
	}

	.pm-dot.pending {
		background: #F97316;
		box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
		animation: pmPulse 2s ease-in-out infinite;
	}

	.pm-dot.success {
		background: #10b981;
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
		animation: pmPulse 2s ease-in-out infinite;
	}

	.pm-dot.error {
		background: #ef4444;
		box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
		animation: pmPulse 2s ease-in-out infinite;
	}

	@keyframes pmPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.pm-title {
		color: #ffffff;
		font-size: 22px;
		font-weight: 700;
		margin: 0 0 12px 0;
		letter-spacing: -0.5px;
	}

	.pm-title.success-title { color: #10b981; }
	.pm-title.error-title { color: #ef4444; }

	.pm-desc {
		color: #e8e8e8;
		font-size: 14px;
		line-height: 1.6;
		margin: 0 0 24px 0;
	}

	.pm-details {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 24px;
		text-align: left;
	}

	.pm-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
	}

	.pm-row + .pm-row {
		border-top: 1px solid #1a1a1a;
		margin-top: 6px;
		padding-top: 12px;
	}

	.pm-row.highlight {
		padding: 10px;
		margin: 6px -8px 0;
		background: rgba(249, 115, 22, 0.08);
		border: 1px solid rgba(249, 115, 22, 0.25);
		border-radius: 8px;
	}

	.pm-label {
		color: #e8e8e8;
		font-size: 13px;
	}

	.pm-value {
		color: #ccc;
		font-size: 13px;
		font-weight: 600;
	}

	.pm-value.highlight-value { color: #F97316; }

	.pm-shares-section {
		margin-bottom: 24px;
		text-align: left;
	}

	.pm-shares-label {
		display: block;
		color: #e8e8e8;
		font-size: 13px;
		margin-bottom: 8px;
	}

	.pm-input-row {
		display: flex;
		gap: 8px;
		margin-bottom: 6px;
	}

	.pm-shares-input {
		flex: 1;
		padding: 10px 12px;
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		color: white;
		font-size: 15px;
		font-weight: 600;
	}

	.pm-shares-input:focus {
		outline: none;
		border-color: #F97316;
	}

	.pm-max-btn {
		padding: 10px 16px;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.3);
		border-radius: 8px;
		color: #F97316;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}

	.pm-max-btn:hover {
		background: #F97316;
		color: #000;
	}

	.pm-shares-info {
		color: #e8e8e8;
		font-size: 12px;
	}

	.pm-actions {
		display: flex;
		gap: 12px;
	}

	.pm-btn {
		flex: 1;
		padding: 14px;
		border: none;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: -0.3px;
	}

	.pm-btn.primary {
		background: #F97316;
		color: #000;
		width: 100%;
	}

	.pm-btn.primary:hover:not(:disabled) {
		background: #ea580c;
	}

	.pm-btn.primary:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.pm-btn.secondary {
		background: transparent;
		color: #e8e8e8;
		border: 1px solid #2a2a2a;
	}

	.pm-btn.secondary:hover {
		border-color: #e8e8e8;
		color: #ccc;
	}

	:global(.light-mode) .pm-shares-input {
		background: #FFFFFF;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .pm-shares-input:focus {
		border-color: #00B570;
	}

	:global(.light-mode) .pm-max-btn {
		background: rgba(0, 181, 112, 0.1);
		border-color: #00B570;
		color: #00B570;
	}

	:global(.light-mode) .pm-max-btn:hover {
		background: #00B570;
		color: #FFFFFF;
	}

	:global(.light-mode) .pm-shares-info {
		color: #e8e8e8;
	}

	/* Toast Notification */
	.toast {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 10000;
		width: 320px;
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 4px;
		padding: 12px 14px;
		animation: toast-in 0.25s ease-out forwards;
	}

	.toast.success {
		border-left: 3px solid #00D084;
	}

	.toast.error {
		border-left: 3px solid #FF4757;
	}

	.toast-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.toast-icon {
		font-size: 14px;
		font-weight: 700;
		line-height: 1;
	}

	.toast.success .toast-icon {
		color: #00D084;
	}

	.toast.error .toast-icon {
		color: #FF4757;
	}

	.toast-title {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.toast.success .toast-title {
		color: #00D084;
	}

	.toast.error .toast-title {
		color: #FF4757;
	}

	.toast-close {
		margin-left: auto;
		background: none;
		border: none;
		color: #e8e8e8;
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
	}

	.toast-close:hover {
		color: #fff;
	}

	.toast-msg {
		font-size: 12px;
		font-weight: 400;
		color: #ccc;
		line-height: 1.4;
		margin: 0;
		padding-left: 22px;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* ── RESPONSIVE ── */
	@media (max-width: 1280px) {
		.db-row {
			grid-template-columns: minmax(150px,1fr) 58px 88px 68px 68px 68px 110px 88px 98px 72px 88px;
		}
	}
	@media (max-width: 768px) {
		.db-page { padding: 14px 14px 40px; }
		.db-stats { grid-template-columns: 1fr 1fr; }
		.db-body { overflow-x: scroll; }
		.db-row { min-width: 960px; }
	}
	@media (max-width: 480px) {
		.db-stats { grid-template-columns: 1fr; }
	}
</style>
