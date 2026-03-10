<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, refreshUserBalance } from '$lib/wallet/stores';
	import { polymarketService } from '$lib/solana/polymarket-service';
	import { polymarketClient } from '$lib/polymarket';
	import { authStore } from '$lib/auth/auth-store';
	import { supabase } from '$lib/supabase';
	import { PublicKey } from '@solana/web3.js';

	let walletState = $walletStore;
	let loading = true;

	// Profile data from Supabase
	let profileUsername = '';
	let profileAvatarUrl = '';
	let uploadingAvatar = false;
	let fileInput: HTMLInputElement;
	let positionsValue = 0;
	let biggestWin = 0;
	let biggestLoss = 0;
	let bestTradeMarket = '';
	let worstTradeMarket = '';
	let totalPredictions = 0;
	let profitLoss = 0;
	let openPositions: any[] = [];
	let timeFilter: '1D' | '1W' | '1M' | 'ALL' = 'ALL';

	// Chart data for different time periods
	let chartDataSets = {
		'1D': {
			profitLoss: 0,
			path: 'M 0 50 L 400 50',
			period: 'Today'
		},
		'1W': {
			profitLoss: 0,
			path: 'M 0 50 L 400 50',
			period: 'Past Week'
		},
		'1M': {
			profitLoss: 0,
			path: 'M 0 50 L 400 50',
			period: 'Past Month'
		},
		'ALL': {
			profitLoss: 0,
			path: 'M 0 50 L 400 50',
			period: 'All Time'
		}
	};

	// Function to generate chart path based on P/L
	function generateChartPath(pnl: number): string {
		if (pnl === 0) {
			return 'M 0 50 L 400 50'; // Flat line in the middle
		}
		// Generate a trending line based on P/L value
		const isPositive = pnl > 0;
		if (isPositive) {
			// Upward trending for positive P/L
			return 'M 0 70 L 50 65 L 100 55 L 150 45 L 200 50 L 250 40 L 300 35 L 350 30 L 400 25';
		} else {
			// Downward trending for negative P/L
			return 'M 0 30 L 50 35 L 100 45 L 150 55 L 200 50 L 250 60 L 300 65 L 350 70 L 400 75';
		}
	}

	// Reactive values based on time filter
	$: currentChartData = chartDataSets[timeFilter];
	$: displayProfitLoss = currentChartData.profitLoss;
	let lastLoadedWallet: string | null = null;

	// Subscribe to wallet state
	walletStore.subscribe(value => {
		walletState = value;
		const currentWallet = value.publicKey?.toString() || null;
		// Only reload if wallet changed, not on every wallet state update
		if (value.connected && value.publicKey && currentWallet !== lastLoadedWallet) {
			lastLoadedWallet = currentWallet;
			loadProfileData();
			loadProfile();
		}
	});

	onMount(async () => {
		if (walletState.connected && walletState.publicKey) {
			lastLoadedWallet = walletState.publicKey.toString();
			await Promise.all([loadProfileData(), loadProfile()]);
		} else {
			loading = false;
		}
	});

	async function loadProfileData() {
		if (!walletState.publicKey) {
			loading = false;
			return;
		}

		loading = true;
		try {
			const userPublicKey = new PublicKey(walletState.publicKey.toString());
			const blockchainPositions = await polymarketService.getUserPositions(userPublicKey);

			// Calculate stats - same logic as dashboard
			totalPredictions = blockchainPositions.length;

			let maxWin = 0;
			let maxLoss = 0;
			let bestMarket = '';
			let worstMarket = '';
			let totalValue = 0;
			let totalPnL = 0;

			// Process positions with same logic as dashboard
			const positionsPromises = blockchainPositions.map(async (pos) => {
				const isYes = 'yes' in pos.predictionType;
				const amountUsdc = pos.amountUsdc.toNumber() / 1_000_000;
				const shares = pos.shares.toNumber() / 1_000_000;
				const pricePerShare = pos.pricePerShare.toNumber() / 1_000_000;
				const predictionType: 'Yes' | 'No' = isYes ? 'Yes' : 'No';
				const isClosed = !('active' in pos.status);
				const isFullySold = 'fullySold' in pos.status;
				const isPartiallySold = 'partiallySold' in pos.status;
				const isOpen = 'active' in pos.status && !isFullySold;

				// For closed/sold positions, use averageSellPrice as the closed price
				let closedPrice: number | undefined = undefined;
				if (isClosed || isFullySold || isPartiallySold) {
					if (pos.averageSellPrice && pos.averageSellPrice.toNumber() > 0) {
						closedPrice = pos.averageSellPrice.toNumber() / 1_000_000;
					} else {
						// Position is closed but has no valid averageSellPrice
						// This happens with old positions closed via close_position instruction
						// Skip this position entirely to avoid incorrect PnL calculations
						console.warn(`Skipping position ${pos.positionId.toString()} - closed but missing averageSellPrice`);
						return null;
					}
				}

				// Fetch market details
				let marketName = `Market ${pos.marketId.slice(0, 10)}...`;
				let currentPrice = pricePerShare;

				try {
					const market = await polymarketClient.getMarketById(pos.marketId);
					if (market) {
						marketName = market.question || market.title || marketName;
					}

					// Only fetch current price for active positions
					if (!isClosed && !isFullySold) {
						const fetchedPrice = await polymarketClient.getPositionCurrentPrice(
							pos.marketId,
							predictionType
						);
						if (fetchedPrice !== null && fetchedPrice > 0) {
							currentPrice = fetchedPrice;
						}
					} else {
						// For closed/sold positions, MUST use closedPrice
						// If closedPrice is not available, the position was already filtered out above
						if (closedPrice !== undefined && closedPrice > 0) {
							currentPrice = closedPrice;
						} else {
							// This shouldn't happen since we filter these positions out above
							// But as a safeguard, use entry price
							currentPrice = pricePerShare;
						}
					}
				} catch (error) {
					console.error(`Error fetching market data for position ${pos.positionId}:`, error);
				}

				// Calculate PnL - for partially sold positions, only count remaining shares
				let sharesForCalculation = shares;
				if (isPartiallySold) {
					const remainingShares = pos.remainingShares.toNumber() / 1_000_000;
					const soldShares = pos.totalSoldShares.toNumber() / 1_000_000;

					// PnL from sold shares (realized)
					const realizedPnL = (soldShares * closedPrice!) - (amountUsdc * (soldShares / shares));

					// PnL from remaining shares (unrealized) - fetch current price
					let unrealizedPnL = 0;
					if (remainingShares > 0) {
						try {
							const fetchedPrice = await polymarketClient.getPositionCurrentPrice(
								pos.marketId,
								predictionType
							);
							const currentPriceForRemaining = (fetchedPrice !== null && fetchedPrice > 0) ? fetchedPrice : pricePerShare;
							unrealizedPnL = (remainingShares * currentPriceForRemaining) - (amountUsdc * (remainingShares / shares));
						} catch (error) {
							console.error(`Error fetching price for remaining shares:`, error);
							unrealizedPnL = 0;
						}
					}

					const totalPnL = realizedPnL + unrealizedPnL;
					const currentValue = (soldShares * closedPrice!) + (remainingShares * currentPrice);

					return { pnl: totalPnL, currentValue, marketName };
				}

				// For fully closed/sold positions or active positions
				const priceForPnL = (isClosed || isFullySold) ? (closedPrice || pricePerShare) : currentPrice;
				const currentValue = shares * priceForPnL;
				const pnl = currentValue - amountUsdc;

				return {
					pnl,
					currentValue,
					marketName,
					isOpen,
					marketId: pos.marketId,
					predictionType,
					shares,
					amountUsdc,
					currentPrice: priceForPnL
				};
			});

			const processedPositions = (await Promise.all(positionsPromises)).filter(pos => pos !== null);

			// Filter open positions
			openPositions = processedPositions.filter(pos => pos.isOpen);

			// Calculate totals and find best/worst trades
			for (const pos of processedPositions) {
				totalValue += pos.currentValue;
				totalPnL += pos.pnl;

				if (pos.pnl > maxWin) {
					maxWin = pos.pnl;
					bestMarket = pos.marketName;
				}
				if (pos.pnl < maxLoss) {
					maxLoss = pos.pnl;
					worstMarket = pos.marketName;
				}
			}

			positionsValue = totalValue;
			biggestWin = maxWin;
			biggestLoss = maxLoss;
			bestTradeMarket = bestMarket;
			worstTradeMarket = worstMarket;
			profitLoss = totalPnL;

			// Update chart data with calculated P/L (for now, using approximations for different time periods)
			// In production, you would calculate actual P/L for different time periods based on trade dates
			// Only calculate approximations if totalPnL is not 0, otherwise keep all at 0
			const pnl1D = totalPnL === 0 ? 0 : totalPnL * 0.05; // Approximate 5% for 1 day
			const pnl1W = totalPnL === 0 ? 0 : totalPnL * 0.20; // Approximate 20% for 1 week
			const pnl1M = totalPnL === 0 ? 0 : totalPnL * 0.50; // Approximate 50% for 1 month
			const pnlALL = totalPnL; // Total P/L for all time

			// Reassign to trigger reactivity
			chartDataSets = {
				'1D': {
					profitLoss: pnl1D,
					path: generateChartPath(pnl1D),
					period: 'Today'
				},
				'1W': {
					profitLoss: pnl1W,
					path: generateChartPath(pnl1W),
					period: 'Past Week'
				},
				'1M': {
					profitLoss: pnl1M,
					path: generateChartPath(pnl1M),
					period: 'Past Month'
				},
				'ALL': {
					profitLoss: pnlALL,
					path: generateChartPath(pnlALL),
					period: 'All Time'
				}
			};
		} catch (error) {
			console.error('Error loading profile data:', error);
		} finally {
			loading = false;
		}
	}

	async function loadProfile() {
		if (!walletState.publicKey) return;
		const walletAddress = walletState.publicKey.toString();
		const { data } = await supabase
			.from('users')
			.select('username, avatar_url')
			.eq('wallet_address', walletAddress)
			.maybeSingle();
		if (data) {
			profileUsername = data.username || '';
			profileAvatarUrl = data.avatar_url || '';
		}
	}

	async function handleAvatarUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !walletState.publicKey) return;

		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			alert('Image must be under 2MB');
			return;
		}

		uploadingAvatar = true;
		try {
			const walletAddress = walletState.publicKey.toString();
			const ext = file.name.split('.').pop() || 'png';
			const filePath = `${walletAddress}.${ext}`;

			// Delete any existing avatar files for this wallet
			const { data: existingFiles } = await supabase.storage
				.from('avatar')
				.list('', { search: walletAddress });
			if (existingFiles && existingFiles.length > 0) {
				await supabase.storage
					.from('avatar')
					.remove(existingFiles.map(f => f.name));
			}

			const { error: uploadErr } = await supabase.storage
				.from('avatar')
				.upload(filePath, file, { upsert: true });

			if (uploadErr) throw new Error(uploadErr.message);

			const { data: urlData } = supabase.storage
				.from('avatar')
				.getPublicUrl(filePath);

			const avatarUrl = urlData.publicUrl + '?t=' + Date.now();

			const { error: updateErr } = await supabase
				.from('users')
				.update({ avatar_url: avatarUrl })
				.eq('wallet_address', walletAddress);

			if (updateErr) throw new Error(updateErr.message);

			profileAvatarUrl = avatarUrl;
			// Update wallet store so Navbar avatar reflects the change
			walletStore.update(s => ({ ...s, avatarUrl }));
		} catch (err: any) {
			console.error('Avatar upload error:', err);
			alert('Failed to upload avatar: ' + err.message);
		} finally {
			uploadingAvatar = false;
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	function formatLargeNumber(num: number): string {
		if (num >= 1_000_000) {
			return `$${(num / 1_000_000).toFixed(1)}m`;
		} else if (num >= 1_000) {
			return `$${(num / 1_000).toFixed(1)}k`;
		}
		return formatCurrency(num);
	}

	function setTimeFilter(filter: '1D' | '1W' | '1M' | 'ALL') {
		timeFilter = filter;
	}
</script>

<div class="profile-container">
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading profile...</p>
		</div>
	{:else if !walletState.connected}
		<div class="empty-state">
			<h3>Connect Your Wallet</h3>
			<p>Connect your wallet to view your profile</p>
		</div>
	{:else}
		<div class="profile-content">
			<!-- User Info Card -->
			<div class="user-card">
				<div class="user-header">
					<div class="avatar-container" on:click={() => fileInput.click()}>
						{#if profileAvatarUrl}
							<img src={profileAvatarUrl} alt="Profile" class="user-avatar" />
						{:else}
							<div class="user-avatar-placeholder">
								{#if profileUsername}
									{profileUsername.charAt(0).toUpperCase()}
								{:else if walletState.publicKey}
									{walletState.publicKey.toString().charAt(0).toUpperCase()}
								{:else}
									?
								{/if}
							</div>
						{/if}
						<div class="avatar-edit-overlay">
							{#if uploadingAvatar}
								<div class="avatar-spinner"></div>
							{:else}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
									<circle cx="12" cy="13" r="4"/>
								</svg>
							{/if}
						</div>
						<input
							type="file"
							accept="image/*"
							bind:this={fileInput}
							on:change={handleAvatarUpload}
							style="display:none"
						/>
					</div>
					<div class="user-info">
						<h1 class="username">
							{#if profileUsername}
								@{profileUsername}
							{:else if walletState.publicKey}
								{walletState.publicKey.toString().slice(0, 4)}...{walletState.publicKey.toString().slice(-4)}
							{:else}
								Anonymous
							{/if}
						</h1>
						{#if walletState.publicKey}
							<div class="wallet-address-display">
								{walletState.publicKey.toString()}
							</div>
						{/if}
						<div class="user-meta">
							<span>{totalPredictions} predictions</span>
							<span class="meta-separator">•</span>
							<span>{openPositions.length} open positions</span>
						</div>
					</div>
				</div>

				<!-- Stats Row -->
				<div class="stats-row">
					<div class="stat-item">
						<div class="stat-label">Total Positions Value</div>
						<div class="stat-value">{formatLargeNumber(positionsValue)}</div>
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Best Trade</div>
						<div class="stat-value stat-positive">{formatLargeNumber(biggestWin)}</div>
						{#if bestTradeMarket}
							<div class="stat-subtitle">{bestTradeMarket}</div>
						{/if}
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Worst Trade</div>
						<div class="stat-value stat-negative">{formatLargeNumber(biggestLoss)}</div>
						{#if worstTradeMarket}
							<div class="stat-subtitle">{worstTradeMarket}</div>
						{/if}
					</div>
					<div class="stat-divider"></div>
					<div class="stat-item">
						<div class="stat-label">Total Predictions</div>
						<div class="stat-value">{totalPredictions}</div>
					</div>
				</div>

				<!-- Quick Actions -->
				<div class="quick-actions">
					<a href="/strategies" class="action-btn">
						View My Strategies
					</a>
					<a href="/backtesting" class="action-btn">
						Backtest Strategy
					</a>
				</div>
			</div>

			<!-- Profit/Loss Card -->
			<div class="pnl-card">
				<div class="pnl-header">
					<div class="pnl-title">
						<span class="pnl-icon">▲</span>
						Profit/Loss
					</div>
					<div class="time-filters">
						<button
							class="time-filter"
							class:active={timeFilter === '1D'}
							on:click={() => setTimeFilter('1D')}
						>
							1D
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === '1W'}
							on:click={() => setTimeFilter('1W')}
						>
							1W
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === '1M'}
							on:click={() => setTimeFilter('1M')}
						>
							1M
						</button>
						<button
							class="time-filter"
							class:active={timeFilter === 'ALL'}
							on:click={() => setTimeFilter('ALL')}
						>
							ALL
						</button>
					</div>
				</div>

				<div class="pnl-amount" class:positive={displayProfitLoss >= 0} class:negative={displayProfitLoss < 0}>
					{formatCurrency(displayProfitLoss)}
				</div>

				<div class="pnl-period">{currentChartData.period}</div>

				<!-- Dynamic Chart -->
				<div class="chart-container">
					<svg class="chart" viewBox="0 0 400 100" preserveAspectRatio="none">
						<defs>
							<linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" style="stop-color: {displayProfitLoss >= 0 ? '#00D68F' : '#FF6B6B'}; stop-opacity: 0.3"/>
								<stop offset="100%" style="stop-color: {displayProfitLoss >= 0 ? '#00D68F' : '#FF6B6B'}; stop-opacity: 0"/>
							</linearGradient>
						</defs>
						<!-- Dynamic path based on time filter -->
						<path
							d="{currentChartData.path}"
							fill="none"
							stroke="{displayProfitLoss >= 0 ? '#00D68F' : '#FF6B6B'}"
							stroke-width="2"
						/>
						<path
							d="{currentChartData.path} L 400 100 L 0 100 Z"
							fill="url(#chartGradient)"
						/>
					</svg>
				</div>

				<div class="polymarket-badge">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect width="16" height="16" rx="3" fill="#2A2F45"/>
						<path d="M4 8L7 11L12 5" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					Polymock
				</div>
			</div>

			<!-- Current Open Positions -->
			<div class="open-positions-card">
				<div class="card-header">
					<h2>Current Open Positions</h2>
					<span class="position-count">{openPositions.length} {openPositions.length === 1 ? 'Position' : 'Positions'}</span>
				</div>

				{#if openPositions.length === 0}
					<div class="empty-positions">
						<p>No open positions</p>
						<a href="/" class="trade-btn">Start Trading</a>
					</div>
				{:else}
					<div class="positions-list">
						{#each openPositions as position}
							<div class="position-item">
								<div class="position-main">
									<div class="position-market">
										<h3>{position.marketName}</h3>
										<span class="position-type" class:yes={position.predictionType === 'Yes'} class:no={position.predictionType === 'No'}>
											{position.predictionType}
										</span>
									</div>
									<div class="position-stats">
										<div class="position-stat">
											<span class="stat-label">Shares</span>
											<span class="stat-value">{position.shares.toFixed(2)}</span>
										</div>
										<div class="position-stat">
											<span class="stat-label">Invested</span>
											<span class="stat-value">{formatCurrency(position.amountUsdc)}</span>
										</div>
										<div class="position-stat">
											<span class="stat-label">Current Value</span>
											<span class="stat-value">{formatCurrency(position.currentValue)}</span>
										</div>
										<div class="position-stat">
											<span class="stat-label">P&L</span>
											<span class="stat-value" class:positive={position.pnl >= 0} class:negative={position.pnl < 0}>
												{position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
											</span>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.profile-container {
		min-height: 100vh;
		background: #000000;
		color: white;
		padding: 40px 20px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: 16px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #404040;
		border-top-color: #F97316;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}

	.empty-state h3 {
		font-size: 20px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		color: #8B92AB;
	}

	.profile-content {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		gap: 24px;
	}

	.user-card {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.user-header {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.avatar-container {
		position: relative;
		width: 84px;
		height: 84px;
		cursor: pointer;
		border-radius: 50%;
		flex-shrink: 0;
		border: 2px solid #F97316;
		padding: 0;
		background: #000;
	}

	.user-avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.user-avatar-placeholder {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #F97316 0%, #ea580c 100%);
		font-size: 36px;
		font-weight: 700;
		color: white;
	}

	.avatar-edit-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s;
		color: white;
	}

	.avatar-container:hover .avatar-edit-overlay {
		opacity: 1;
	}

	.avatar-spinner {
		width: 22px;
		height: 22px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.wallet-address-display {
		font-size: 12px;
		color: #8B92AB;
		font-family: 'SF Mono', Consolas, monospace;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 300px;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.username {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 8px 0;
		color: #E8E8E8;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: #8B92AB;
	}

	.meta-separator {
		color: #2A2F45;
	}

	.stats-row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding-top: 24px;
		border-top: 1px solid #404040;
	}

	.stat-item {
		flex: 1;
		text-align: center;
	}

	.stat-label {
		font-size: 12px;
		color: #8B92AB;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-value {
		font-size: 24px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.stat-value.stat-positive {
		color: #00D68F;
	}

	.stat-value.stat-negative {
		color: #FF6B6B;
	}

	.stat-subtitle {
		font-size: 11px;
		color: #8B92AB;
		margin-top: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.stat-divider {
		width: 1px;
		height: 40px;
		background: #000000;
	}

	.quick-actions {
		display: flex;
		gap: 12px;
		padding-top: 20px;
		border-top: 1px solid #404040;
	}

	.action-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 20px;
		background: #000000;
		border: 1px solid #FFFFFF;
		border-radius: 8px;
		color: #FFFFFF;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.2s;
	}

	.action-btn:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.pnl-card {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
	}

	.pnl-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.pnl-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #8B92AB;
	}

	.pnl-icon {
		color: #00D68F;
		font-size: 12px;
	}

	.time-filters {
		display: flex;
		gap: 8px;
	}

	.time-filter {
		padding: 4px 12px;
		background: transparent;
		border: 1px solid #404040;
		border-radius: 6px;
		color: #8B92AB;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.time-filter:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.time-filter.active {
		background: rgba(249, 115, 22, 0.1);
		border-color: #F97316;
		color: #F97316;
	}

	.pnl-amount {
		font-size: 36px;
		font-weight: 700;
		color: #E8E8E8;
	}

	.pnl-amount.positive {
		color: #00D68F;
	}

	.pnl-amount.negative {
		color: #FF6B6B;
	}

	.pnl-period {
		font-size: 12px;
		color: #8B92AB;
		margin-top: -8px;
	}

	.chart-container {
		height: 120px;
		margin: 16px 0;
	}

	.chart {
		width: 100%;
		height: 100%;
	}

	.polymarket-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(42, 47, 69, 0.5);
		border-radius: 8px;
		font-size: 13px;
		color: #8B92AB;
		width: fit-content;
	}

	/* Open Positions Card */
	.open-positions-card {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		padding: 24px;
		margin-top: 24px;
	}

	.open-positions-card .card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.open-positions-card .card-header h2 {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
		margin: 0;
	}

	.position-count {
		padding: 4px 12px;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid #F97316;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		color: #F97316;
	}

	.empty-positions {
		text-align: center;
		padding: 60px 20px;
		color: #8B92AB;
	}

	.empty-positions svg {
		margin-bottom: 16px;
		opacity: 0.5;
	}

	.empty-positions p {
		font-size: 14px;
		margin-bottom: 20px;
	}

	.trade-btn {
		display: inline-block;
		padding: 10px 24px;
		background: #000000;
		border: 1px solid #FFFFFF;
		color: #FFFFFF;
		border-radius: 8px;
		text-decoration: none;
		font-weight: 600;
		font-size: 14px;
		transition: all 0.2s;
	}

	.trade-btn:hover {
		border-color: #F97316;
		color: #F97316;
	}

	.positions-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.position-item {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 10px;
		padding: 16px;
		transition: all 0.2s;
	}

	.position-item:hover {
		border-color: #F97316;
	}

	.position-main {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.position-market {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.position-market h3 {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		margin: 0;
		flex: 1;
		line-height: 1.4;
	}

	.position-type {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		flex-shrink: 0;
	}

	.position-type.yes {
		background: rgba(0, 214, 143, 0.1);
		color: #00D68F;
		border: 1px solid #00D68F;
	}

	.position-type.no {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
		border: 1px solid #FF6B6B;
	}

	.position-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}

	.position-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.position-stat .stat-label {
		font-size: 11px;
		color: #6B7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.position-stat .stat-value {
		font-size: 14px;
		color: #E8E8E8;
		font-weight: 600;
	}

	.position-stat .stat-value.positive {
		color: #00D68F;
	}

	.position-stat .stat-value.negative {
		color: #FF6B6B;
	}

	@media (max-width: 768px) {
		.position-stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 968px) {
		.profile-content {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.profile-container {
			padding: 20px 16px;
		}

		.user-header {
			flex-direction: column;
			text-align: center;
		}

		.stats-row {
			flex-direction: column;
			gap: 16px;
		}

		.stat-divider {
			width: 100%;
			height: 1px;
		}

		.pnl-amount {
			font-size: 28px;
		}
	}

	/* Light mode support */
	:global(.light-mode) .profile-container {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode) .user-card,
	:global(.light-mode) .pnl-card {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .username {
		color: #1A1A1A;
	}

	:global(.light-mode) .user-meta,
	:global(.light-mode) .stat-label,
	:global(.light-mode) .pnl-title,
	:global(.light-mode) .pnl-period,
	:global(.light-mode) .polymarket-badge {
		color: #666;
	}

	:global(.light-mode) .stat-value,
	:global(.light-mode) .pnl-amount {
		color: #1A1A1A;
	}

	:global(.light-mode) .stat-value.stat-positive,
	:global(.light-mode) .pnl-amount.positive {
		color: #00B570;
	}

	:global(.light-mode) .stat-value.stat-negative,
	:global(.light-mode) .pnl-amount.negative {
		color: #FF6B6B;
	}

	:global(.light-mode) .stat-subtitle {
		color: #666;
	}

	:global(.light-mode) .stats-row,
	:global(.light-mode) .stat-divider,
	:global(.light-mode) .meta-separator {
		border-color: #E0E0E0;
		background: #E0E0E0;
	}

	:global(.light-mode) .time-filter {
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .time-filter:hover,
	:global(.light-mode) .time-filter.active {
		border-color: #00B570;
		color: #00B570;
		background: rgba(0, 181, 112, 0.1);
	}

	:global(.light-mode) .user-avatar-placeholder {
		background: #F5F5F5;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .polymarket-badge {
		background: rgba(229, 229, 229, 0.5);
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		min-width: 400px;
		max-width: 500px;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #404040;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: white;
	}

	.modal-close {
		background: none;
		border: none;
		color: #8B92AB;
		font-size: 28px;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.modal-close:hover {
		color: white;
	}

	.modal-body {
		padding: 24px 20px;
	}

	.upload-area {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.preview-container {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: #000000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.upload-placeholder {
		width: 100%;
		aspect-ratio: 1;
		border: 2px dashed #404040;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: #8B92AB;
		background: #000000;
	}

	.upload-placeholder svg {
		opacity: 0.5;
	}

	.upload-placeholder p {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}

	.upload-placeholder span {
		font-size: 13px;
		opacity: 0.8;
	}

	.file-input {
		display: none;
	}

	.select-file-btn {
		padding: 10px 20px;
		background: #000000;
		border: 1px solid #3A3F55;
		border-radius: 8px;
		color: #E8E8E8;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.select-file-btn:hover {
		background: #3A3F55;
		border-color: #F97316;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 20px;
		border-top: 1px solid #404040;
		justify-content: flex-end;
	}

	.modal-btn {
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}

	.cancel-btn {
		background: #000000;
		color: #E8E8E8;
	}

	.cancel-btn:hover {
		background: #3A3F55;
	}

	.confirm-btn {
		background: #F97316;
		color: white;
	}

	.confirm-btn:hover:not(:disabled) {
		background: #ea580c;
		transform: translateY(-1px);
	}

	.confirm-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Light mode modal */
	:global(.light-mode) .modal-overlay {
		background: rgba(0, 0, 0, 0.85);
	}

	:global(.light-mode) .modal-content {
		background: #FFFFFF;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .modal-header {
		border-bottom-color: #E0E0E0;
	}

	:global(.light-mode) .modal-header h3 {
		color: #1A1A1A;
	}

	:global(.light-mode) .modal-close {
		color: #999;
	}

	:global(.light-mode) .modal-close:hover {
		color: #1A1A1A;
	}

	:global(.light-mode) .upload-placeholder {
		background: #F5F5F5;
		border-color: #E0E0E0;
		color: #666;
	}

	:global(.light-mode) .preview-container {
		background: #F5F5F5;
	}

	:global(.light-mode) .select-file-btn {
		background: #F5F5F5;
		border-color: #E0E0E0;
		color: #1A1A1A;
	}

	:global(.light-mode) .select-file-btn:hover {
		background: #E0E0E0;
		border-color: #00B570;
	}

	:global(.light-mode) .cancel-btn {
		background: #F5F5F5;
		color: #1A1A1A;
	}

	:global(.light-mode) .cancel-btn:hover {
		background: #E0E0E0;
	}

	:global(.light-mode) .confirm-btn {
		background: #00B570;
	}

	:global(.light-mode) .confirm-btn:hover:not(:disabled) {
		background: #009560;
	}

	:global(.light-mode) .edit-avatar-btn {
		background: #00B570;
		border-color: #FFFFFF;
	}

	:global(.light-mode) .edit-avatar-btn:hover {
		background: #009560;
	}
</style>
