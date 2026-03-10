<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import WalletButton from '$lib/wallet/WalletButton.svelte';
	import { walletStore, setWalletAdapter, updateWalletConnection, initializeUserAccountIfNeeded, createUserAccount } from '$lib/wallet/stores';
	import { authStore } from '$lib/auth/auth-store';
	import { initWeb3Auth, connectWeb3Auth, disconnectWeb3Auth, createWeb3AuthWalletAdapter } from '$lib/auth/web3auth';
	import { sessionKeyManager } from '$lib/solana/session-keys';
	import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
	import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
	import hashfoxLogo from '$lib/assets/hashfoxlogo.png';

	declare global {
		interface Window {
			phantom?: { solana?: any };
			solana?: any;
		}
	}

	const WALLET_STORAGE_KEY = 'polymock_connected_wallet';

	let walletState = $walletStore;
	let initializing = false;
	let showProfileDropdown = false;
	let showSettingsDropdown = false;
	let showConnectDropdown = false;
	let showMobileMenu = false;
	let darkMode = false;
	let settingsButtonElement: HTMLElement;
	let profileButtonElement: HTMLElement;
	let connectButtonElement: HTMLElement;
	let sessionActive = false;
	let sessionTimeRemaining = '';
	let showSessionPrompt = false;
	let showSessionActiveNotice = false;
	let sessionLoading = false;
	let showSessionDropdown = false;
	let sessionBadgeElement: HTMLElement;
	let showInitPopup = false;
	let lastCheckedWallet: string | null = null;

	walletStore.subscribe(value => {
		const prevWallet = walletState.publicKey?.toString() ?? null;
		walletState = value;
		const currentWallet = walletState.publicKey?.toString() ?? null;

		// Wallet changed — clear stale session if it belongs to previous wallet
		if (currentWallet && currentWallet !== prevWallet) {
			if (sessionKeyManager.isSessionActive() && !sessionKeyManager.isSessionForWallet(walletState.publicKey)) {
				sessionKeyManager.clearSession();
			}
		}
		checkSessionStatus();
	});

	function checkSessionStatus() {
		// Only show session as active if it belongs to the current wallet
		const pk = walletState.publicKey;
		if (pk && sessionKeyManager.isSessionActive() && sessionKeyManager.isSessionForWallet(pk)) {
			sessionActive = true;
			const remaining = sessionKeyManager.getSessionTimeRemaining();
			const hours = Math.floor(remaining / 3600);
			const mins = Math.floor((remaining % 3600) / 60);
			sessionTimeRemaining = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
		} else {
			sessionActive = false;
			sessionTimeRemaining = '';
		}
	}

	function showSessionPopup() {
		checkSessionStatus();
		if (sessionActive) {
			showSessionActiveNotice = true;
		} else {
			showSessionPrompt = true;
		}
	}

	function showInitPopupIfNeeded() {
		if (walletState.connected && !walletState.userAccountInitialized && !walletState.loading) {
			showInitPopup = true;
		}
	}

	async function enableSession() {
		if (!walletState.connected || !walletState.adapter) return;
		sessionLoading = true;
		try {
			await sessionKeyManager.createSession(walletState.adapter);
			sessionActive = true;
			checkSessionStatus();
			showSessionPrompt = false;
		} catch (error: any) {
			console.error('Session creation failed:', error);
			alert(`Failed to enable session: ${error?.message || 'Unknown error'}`);
		} finally {
			sessionLoading = false;
		}
	}

	async function disconnectSession() {
		showSessionDropdown = false;
		try {
			if (walletState.adapter) {
				await sessionKeyManager.revokeSession(walletState.adapter);
			} else {
				sessionKeyManager.clearSession();
			}
			sessionActive = false;
			checkSessionStatus();
		} catch (error: any) {
			console.error('Session revoke failed:', error);
			sessionKeyManager.clearSession();
			sessionActive = false;
		}
	}

	function toggleSessionDropdown() {
		showSessionDropdown = !showSessionDropdown;
	}

	function createPhantomWrapper(provider: any, publicKey: any) {
		return {
			publicKey,
			signTransaction: provider.signTransaction.bind(provider),
			signAllTransactions: provider.signAllTransactions.bind(provider),
			signMessage: provider.signMessage?.bind(provider),
			connected: true,
			disconnect: async () => {
				await provider.disconnect();
				localStorage.removeItem(WALLET_STORAGE_KEY);
				setWalletAdapter(null);
				await updateWalletConnection();
			},
			name: 'Phantom'
		};
	}

	async function tryAutoReconnect() {
		const savedWallet = localStorage.getItem(WALLET_STORAGE_KEY);
		if (!savedWallet) return;

		await new Promise(resolve => setTimeout(resolve, 600));

		if (savedWallet === 'Phantom') {
			const provider = window.phantom?.solana || window.solana;
			if (provider && provider.isPhantom) {
				try {
					const resp = await provider.connect({ onlyIfTrusted: true });
					const publicKey = resp.publicKey;
					if (!publicKey) return;

					const directWallet = createPhantomWrapper(provider, publicKey);
					setWalletAdapter(directWallet as any);
					await updateWalletConnection();
					await handlePostConnect(directWallet);
				} catch {
					localStorage.removeItem(WALLET_STORAGE_KEY);
				}
			}
		} else if (savedWallet === 'Solflare') {
			try {
				const adapter = new SolflareWalletAdapter();
				await adapter.connect();
				if (adapter.connected && adapter.publicKey) {
					setWalletAdapter(adapter);
					await updateWalletConnection();
					await handlePostConnect(adapter);
				}
			} catch {
				localStorage.removeItem(WALLET_STORAGE_KEY);
			}
		}
	}

	/** Wait until the username modal is dismissed (needsUsername becomes false) */
	function waitForUsernameComplete(): Promise<void> {
		return new Promise(resolve => {
			if (!walletState.needsUsername) return resolve();
			const unsub = walletStore.subscribe(state => {
				if (!state.needsUsername) {
					unsub();
					resolve();
				}
			});
		});
	}

	/** Unified post-connect flow: check account → username → init popup or session popup */
	async function handlePostConnect(wallet: any) {
		try {
			await initializeUserAccountIfNeeded(wallet);
		} catch (e) {
			console.error('Error checking account:', e);
		}

		// Wait for Web3Auth confirmation modal to close
		await new Promise(r => setTimeout(r, 800));

		// If first-time user needs a username, wait for that modal to complete first
		if (walletState.needsUsername) {
			await waitForUsernameComplete();
			// Small delay after username modal closes
			await new Promise(r => setTimeout(r, 400));
		}

		// Now show the appropriate popup
		if (!walletState.userAccountInitialized) {
			showInitPopup = true;
		} else {
			// Skip session popup entirely if an active session already exists for this wallet
			const pubkey = walletState.publicKey;
			if (pubkey && sessionKeyManager.isSessionActive() && sessionKeyManager.isSessionForWallet(pubkey)) {
				sessionActive = true;
				checkSessionStatus();
			} else {
				showSessionPopup();
			}
		}
	}

	onMount(async () => {
		checkSessionStatus();
		setInterval(() => {
			if (sessionActive) checkSessionStatus();
		}, 30000);

		// Initialize Web3Auth early
		await initWeb3Auth();

		tryAutoReconnect();
	});

	async function handleInitialize() {
		if (!walletState.adapter || !walletState.connected) {
			alert('Please connect your wallet first');
			return;
		}

		initializing = true;
		try {
			await createUserAccount(walletState.adapter);
			showInitPopup = false;
			// Chain into session popup after successful init
			if (walletState.userAccountInitialized) {
				showSessionPopup();
			}
		} catch (error: any) {
			console.error('Failed to initialize:', error);
			alert(`Failed to initialize account: ${error.message || 'Unknown error'}`);
		} finally {
			initializing = false;
		}
	}

	async function handleConnectAccount() {
		try {
			const result = await connectWeb3Auth();
			if (!result) return; // User cancelled

			const { publicKey, wallet, userInfo } = result;

			// Embedded wallets start with 0 SOL — airdrop on devnet so they can init + create sessions
			try {
				const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
				const balance = await conn.getBalance(publicKey);
				if (balance < 0.2 * LAMPORTS_PER_SOL) {
					console.log('[Web3Auth] Low balance, requesting devnet airdrop...');
					const sig = await conn.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
					await conn.confirmTransaction(sig, 'confirmed');
					console.log('[Web3Auth] Airdrop confirmed:', sig);
				}
			} catch (airdropErr) {
				console.warn('[Web3Auth] Devnet airdrop failed (non-fatal):', airdropErr);
			}

			// Set auth store with user info from Web3Auth
			authStore.setUser({
				id: publicKey.toString(),
				email: userInfo.email || '',
				name: userInfo.name || publicKey.toString().slice(0, 8) + '...',
				picture: userInfo.profileImage || '',
				walletAddress: publicKey.toString(),
				createdAt: new Date()
			});

			// Create a wallet adapter wrapper and plug into wallet store
			const adapterWrapper = createWeb3AuthWalletAdapter(wallet, publicKey);
			setWalletAdapter(adapterWrapper as any);
			await updateWalletConnection();
			await handlePostConnect(adapterWrapper);
		} catch (error: any) {
			console.error('Login failed:', error);
			if (error.message !== 'Authentication cancelled') {
				alert(`Login failed: ${error.message}`);
			}
		}
	}

	async function handleLogout() {
		// Don't clear session key on logout — it's still valid on-chain until expiry.
		// Session will be restored automatically when the same wallet reconnects.
		sessionActive = false;
		// Disconnect wallet if connected
		if (walletState.connected && walletState.adapter) {
			try {
				await walletState.adapter.disconnect();
			} catch (error) {
				console.error('Failed to disconnect wallet:', error);
			}
		}
		// Disconnect Web3Auth
		try {
			await disconnectWeb3Auth();
		} catch (error) {
			console.error('Failed to disconnect Web3Auth:', error);
		}
		// Logout auth
		authStore.logout();
		// Reset wallet store
		setWalletAdapter(null);
		showProfileDropdown = false;
		showInitPopup = false;
		showSessionPrompt = false;
		showSessionActiveNotice = false;
	}

	function toggleProfileDropdown() {
		showProfileDropdown = !showProfileDropdown;
	}

	function toggleConnectDropdown() {
		showConnectDropdown = !showConnectDropdown;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.profile-dropdown-container')) {
			showProfileDropdown = false;
		}
		if (!target.closest('.settings-dropdown-container')) {
			showSettingsDropdown = false;
		}
		if (!target.closest('.connect-dropdown-container')) {
			showConnectDropdown = false;
		}
		if (!target.closest('.session-dropdown-container')) {
			showSessionDropdown = false;
		}
	}

	function toggleSettingsDropdown() {
		showSettingsDropdown = !showSettingsDropdown;
	}

	function toggleMobileMenu() {
		showMobileMenu = !showMobileMenu;
	}

	function closeMobileMenu() {
		showMobileMenu = false;
	}

	function toggleDarkMode() {
		darkMode = !darkMode;
		// Apply dark mode class to body
		if (darkMode) {
			document.body.classList.add('light-mode');
		} else {
			document.body.classList.remove('light-mode');
		}
	}

	$: currentPath = $page.url.pathname;
</script>

<svelte:window on:click={handleClickOutside} />

<div class="navbar">
	<a href="/" class="logo">
		<img src={hashfoxLogo} alt="HashFox Labs Logo" class="logo-img" />
		<div class="logo-text">
			<span class="logo-title">POLYMOCK</span>
			<span class="logo-subtitle">by Hash<span class="fox-text">Fox</span> Labs</span>
		</div>
	</a>

	<!-- Mobile Menu Toggle -->
	<button class="mobile-menu-toggle" on:click={toggleMobileMenu} aria-label="Toggle menu">
		{#if showMobileMenu}
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		{:else}
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path d="M3 7H21M3 12H21M3 17H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
		{/if}
	</button>

	<div class="nav-links" class:mobile-open={showMobileMenu}>
		<a href="/" class="nav-link" class:active={currentPath === '/'} on:click={closeMobileMenu}>TERMINAL</a>
		<a href="/news" class="nav-link" class:active={currentPath === '/news'} on:click={closeMobileMenu}>NEWS</a>
		<a href="/dashboard" class="nav-link" class:active={currentPath === '/dashboard'} on:click={closeMobileMenu}>DASHBOARD</a>
		<a href="/backtesting?tab=summary" class="nav-link" class:active={currentPath === '/backtesting' && (!$page.url.searchParams.get('tab') || $page.url.searchParams.get('tab') === 'summary')} on:click={closeMobileMenu}>PERFORMANCE</a>
		<a href="/backtesting?tab=strategy" class="nav-link" class:active={currentPath === '/backtesting' && $page.url.searchParams.get('tab') === 'strategy'} on:click={closeMobileMenu}>BACKTESTING</a>
		<a href="/marketplace" class="nav-link" class:active={currentPath === '/marketplace'} on:click={closeMobileMenu}>MARKETPLACE</a>
	</div>

	<div class="navbar-right">
		{#if walletState.connected}
			{#if walletState.userAccountInitialized}
				<div class="balance-display">
					<span class="balance-label">Balance:</span>
					<span class="balance-amount">${walletState.usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
				</div>
				<div class="session-dropdown-container">
					{#if sessionActive}
						<button class="session-btn active" on:click={toggleSessionDropdown} bind:this={sessionBadgeElement}>
							<span class="session-btn-dot active"></span>
							<span class="session-btn-label">Session Active</span>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
								<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
						</button>

						{#if showSessionDropdown && sessionBadgeElement}
							<div class="session-dropdown" style="top: {sessionBadgeElement.getBoundingClientRect().bottom + 8}px; right: {window.innerWidth - sessionBadgeElement.getBoundingClientRect().right}px;">
								<div class="session-dropdown-header">
									<span class="session-dropdown-dot"></span>
									<div class="session-dropdown-info">
										<div class="session-dropdown-title">One-Click Trading</div>
										<div class="session-dropdown-time">{sessionTimeRemaining} remaining</div>
									</div>
								</div>
								<div class="session-dropdown-divider"></div>
								<button class="session-dropdown-item disconnect" on:click={disconnectSession}>
									<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
										<path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M11 11L14 8M14 8L11 5M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									Disconnect Session
								</button>
							</div>
						{/if}
					{:else}
						<button class="session-btn inactive" on:click={showSessionPopup}>
							<span class="session-btn-dot inactive"></span>
							<span class="session-btn-label">No Session</span>
						</button>
					{/if}
				</div>
			{/if}

			{#if walletState.loading}
				<div class="loading-badge">Loading...</div>
			{/if}
		{/if}

		<!-- Profile Button - Shows when connected -->
		{#if $authStore.isAuthenticated || walletState.connected}
			<div class="profile-dropdown-container">
				<button class="profile-btn" on:click={toggleProfileDropdown} bind:this={profileButtonElement}>
					{#if walletState.avatarUrl}
						<img src={walletState.avatarUrl} alt="Profile" class="profile-pic" />
					{:else if $authStore.user?.picture}
						<img src={$authStore.user.picture} alt="Profile" class="profile-pic" />
					{:else}
						<div class="profile-pic-placeholder">
							{#if walletState.username}
								{walletState.username.charAt(0).toUpperCase()}
							{:else if walletState.publicKey}
								{walletState.publicKey.toString().charAt(0).toUpperCase()}
							{:else}
								?
							{/if}
						</div>
					{/if}
					<span class="profile-name">
						{#if $authStore.user?.name}
							{$authStore.user.name.split(' ')[0]}
						{:else if walletState.username}
							@{walletState.username}
						{:else if walletState.publicKey}
							{walletState.publicKey.toString().slice(0, 4)}...{walletState.publicKey.toString().slice(-4)}
						{:else}
							Profile
						{/if}
					</span>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>

				{#if showProfileDropdown && profileButtonElement}
					<div class="profile-dropdown" style="top: {profileButtonElement.getBoundingClientRect().bottom + 8}px; right: {window.innerWidth - profileButtonElement.getBoundingClientRect().right}px;">
						<div class="dropdown-header">
							{#if walletState.avatarUrl}
								<img src={walletState.avatarUrl} alt="Profile" class="dropdown-profile-pic" />
							{:else if $authStore.user?.picture}
								<img src={$authStore.user.picture} alt="Profile" class="dropdown-profile-pic" />
							{:else}
								<div class="dropdown-profile-pic-placeholder">
									{#if walletState.username}
										{walletState.username.charAt(0).toUpperCase()}
									{:else if walletState.publicKey}
										{walletState.publicKey.toString().charAt(0).toUpperCase()}
									{:else}
										?
									{/if}
								</div>
							{/if}
							<div class="dropdown-user-info">
								<div class="dropdown-user-name">
									{#if $authStore.user?.name}
										{$authStore.user.name}
									{:else if walletState.username}
										@{walletState.username}
									{:else if walletState.publicKey}
										{walletState.publicKey.toString().slice(0, 4)}...{walletState.publicKey.toString().slice(-4)}
									{:else}
										Anonymous
									{/if}
								</div>
								{#if $authStore.user?.email}
									<div class="dropdown-user-email">{$authStore.user.email}</div>
								{:else if walletState.publicKey}
									<div class="dropdown-user-email">{walletState.publicKey.toString().slice(0, 4)}...{walletState.publicKey.toString().slice(-4)}</div>
								{/if}
							</div>
						</div>
						<div class="dropdown-divider"></div>
						<a href="/profile" class="dropdown-item" on:click={() => showProfileDropdown = false}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								<path d="M2 14C2 11.7909 3.79086 10 6 10H10C12.2091 10 14 11.7909 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Profile
						</a>
						<a href="/strategies" class="dropdown-item" on:click={() => showProfileDropdown = false}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" stroke-width="1.5"/>
								<path d="M6 6H10M6 9H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							</svg>
							My Strategies
						</a>
						<button class="dropdown-item" on:click={handleLogout}>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M11 11L14 8M14 8L11 5M14 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Logout
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Connect Button - Shows when not connected -->
		{#if !$authStore.isAuthenticated && !walletState.connected}
			<div class="connect-dropdown-container">
				<button class="connect-btn" on:click={toggleConnectDropdown} bind:this={connectButtonElement}>
					Connect
				</button>

				{#if showConnectDropdown && connectButtonElement}
					<div class="connect-dropdown" style="top: {connectButtonElement.getBoundingClientRect().bottom + 8}px; right: {window.innerWidth - connectButtonElement.getBoundingClientRect().right}px;">
						<button class="connect-option" on:click={() => { handleConnectAccount(); showConnectDropdown = false; }}>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
								<rect width="20" height="20" rx="4" fill="url(#emailGrad)"/>
								<path d="M4 7L10 11L16 7" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
								<rect x="3" y="5" width="14" height="10" rx="2" stroke="white" stroke-width="1.5"/>
								<defs><linearGradient id="emailGrad" x1="0" y1="0" x2="20" y2="20"><stop stop-color="#F97316"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>
							</svg>
							<div class="connect-option-text">
								<div class="connect-option-title">Quick Login</div>
								<div class="connect-option-subtitle">Email, Google, or social</div>
							</div>
						</button>
						<WalletButton isDropdownMode={true} onClose={() => showConnectDropdown = false} onConnected={() => handlePostConnect(walletState.adapter)} />
					</div>
				{/if}
			</div>
		{/if}

	</div>
</div>

<!-- Account initialization popup -->
{#if showInitPopup && walletState.connected && !walletState.userAccountInitialized}
	<div class="session-overlay" on:keydown={(e) => e.key === 'Escape' && e.preventDefault()} role="dialog" tabindex="0">
		<div class="session-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
			<div class="session-status-dot pending"></div>
			<h3 class="session-title">Initialize Your Account</h3>
			<p class="session-desc">
				Your wallet is connected but you don't have a trading account yet. Initialize to get 10,000 USDC for paper trading.
			</p>
			<div class="session-details">
				<div class="session-detail-row">
					<span class="detail-label">Entry fee</span>
					<span class="detail-value">0.1 SOL</span>
				</div>
				<div class="session-detail-row">
					<span class="detail-label">Starting balance</span>
					<span class="detail-value">10,000 USDC</span>
				</div>
				<div class="session-detail-row">
					<span class="detail-label">Network</span>
					<span class="detail-value">Devnet</span>
				</div>
			</div>
			<button class="session-primary-btn enable-btn" on:click={handleInitialize} disabled={initializing}>
				{#if initializing}
					Initializing...
				{:else}
					Initialize Account (0.1 SOL)
				{/if}
			</button>
		</div>
	</div>
{/if}

<!-- Session active notice popup -->
{#if showSessionActiveNotice}
	<div class="session-overlay" on:click={() => showSessionActiveNotice = false} on:keydown={(e) => e.key === 'Escape' && (showSessionActiveNotice = false)} role="button" tabindex="0">
		<div class="session-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
			<div class="session-status-dot active"></div>
			<h3 class="session-title active-title">One-Click Trading Active</h3>
			<p class="session-desc">
				Your session key is active. Trades execute instantly without wallet popups.
			</p>
			<div class="session-time-badge">{sessionTimeRemaining} remaining</div>
			<button class="session-primary-btn active-btn" on:click={() => showSessionActiveNotice = false}>Got it</button>
		</div>
	</div>
{/if}

<!-- Session delegation prompt (mandatory — no skip) -->
{#if showSessionPrompt}
	<div class="session-overlay" on:keydown={(e) => e.key === 'Escape' && e.preventDefault()} role="dialog" tabindex="0">
		<div class="session-modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
			<div class="session-status-dot pending"></div>
			<h3 class="session-title">Enable One-Click Trading</h3>
			<p class="session-desc">
				Sign once to delegate trading to a temporary session key. All trades will execute instantly without wallet popups.
			</p>
			<div class="session-details">
				<div class="session-detail-row">
					<span class="detail-label">Duration</span>
					<span class="detail-value">24 hours</span>
				</div>
				<div class="session-detail-row">
					<span class="detail-label">Session fee</span>
					<span class="detail-value">0.05 SOL</span>
				</div>
				<div class="session-detail-row">
					<span class="detail-label">Revocable</span>
					<span class="detail-value">Anytime</span>
				</div>
			</div>
			<button class="session-primary-btn enable-btn" on:click={enableSession} disabled={sessionLoading}>
				{#if sessionLoading}
					Signing...
				{:else}
					Enable One-Click Trading
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.navbar {
		background: #000000;
		padding: 16px 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid #404040;
		flex-wrap: nowrap;
		min-height: 64px;
		position: sticky;
		top: 0;
		z-index: 50;
		overflow: visible;
	}

	.logo {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
		letter-spacing: 1px;
		text-decoration: none;
		transition: color 0.2s;
		flex-shrink: 0;
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.logo-img {
		width: 56px;
		height: 56px;
		object-fit: contain;
		margin: -8px 0;
	}

	.logo:hover {
		color: #F97316;
	}

	.logo-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.logo-title {
		font-size: 18px;
		font-weight: 700;
		color: #E8E8E8;
		letter-spacing: 1px;
	}

	.logo-subtitle {
		font-size: 10px;
		font-weight: 500;
		color: #FFFFFF;
		letter-spacing: 0.5px;
	}

	.fox-text {
		color: #F97316;
		font-weight: 700;
	}

	.nav-links {
		display: flex;
		gap: 4px;
		flex-shrink: 1;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}

	.nav-links::-webkit-scrollbar {
		display: none;
	}

	.nav-link {
		color: #FFFFFF;
		text-decoration: none;
		font-size: 12px;
		padding: 6px 10px;
		border: 1px solid transparent;
		transition: all 0.2s;
		border-radius: 4px;
		font-weight: 500;
		white-space: nowrap;
	}

	.nav-link:hover {
		color: #F97316;
		border-color: #F97316;
		background: rgba(249, 115, 22, 0.1);
	}

	.nav-link.active {
		color: #F97316;
		border-color: #F97316;
		background: rgba(249, 115, 22, 0.1);
	}

	.navbar-right {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.initialize-btn {
		padding: 5px 12px;
		background: linear-gradient(135deg, #F97316 0%, #ea580c 100%);
		color: white;
		border: none;
		font-weight: 600;
		font-size: 12px;
		cursor: pointer;
		font-family: Inter, sans-serif;
		border-radius: 6px;
		transition: all 200ms ease-out;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.initialize-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, #00D4FF 0%, #F97316 100%);
		transform: scale(1.02);
		box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
	}

	.initialize-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.loading-badge {
		padding: 8px 14px;
		background: #2A2F45;
		border: 1px solid #3A3F55;
		border-radius: 8px;
		color: #8B92AB;
		font-size: 12px;
		flex-shrink: 0;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	.session-dropdown-container {
		position: relative;
		flex-shrink: 0;
	}

	.session-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		min-height: 32px;
		box-sizing: border-box;
		border-radius: 6px;
		font-family: Inter, sans-serif;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		white-space: nowrap;
	}

	.session-btn.active {
		background: #000000;
		border: 1px solid #10b981;
		color: #10b981;
	}

	.session-btn.active:hover {
		background: rgba(16, 185, 129, 0.08);
	}

	.session-btn.inactive {
		background: #000000;
		border: 1px solid #ef4444;
		color: #ef4444;
	}

	.session-btn.inactive:hover {
		background: rgba(239, 68, 68, 0.08);
	}

	.session-btn-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		animation: badgePulse 2s ease-in-out infinite;
	}

	.session-btn-dot.active {
		background: #10b981;
	}

	.session-btn-dot.inactive {
		background: #ef4444;
	}

	.session-btn-label {
		line-height: 1;
	}

	@keyframes badgePulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.session-dropdown {
		position: fixed;
		min-width: 240px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
		overflow: hidden;
	}

	.session-dropdown-header {
		padding: 14px 16px;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.session-dropdown-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #10b981;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
		flex-shrink: 0;
	}

	.session-dropdown-info {
		flex: 1;
	}

	.session-dropdown-title {
		font-size: 13px;
		font-weight: 600;
		color: #10b981;
		margin-bottom: 2px;
	}

	.session-dropdown-time {
		font-size: 11px;
		color: #8B92AB;
	}

	.session-dropdown-divider {
		height: 1px;
		background: #2A2F45;
		margin: 0;
	}

	.session-dropdown-item {
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 200ms ease-out, color 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
	}

	.session-dropdown-item.disconnect:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.session-dropdown-item svg {
		flex-shrink: 0;
	}

	/* Session popup styles */
	.session-overlay {
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
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.session-modal {
		background: #0a0a0a;
		border: 1px solid #2a2a2a;
		border-radius: 20px;
		padding: 36px 32px;
		max-width: 420px;
		width: 90vw;
		text-align: center;
		animation: sessionSlideUp 0.3s ease-out;
	}

	@keyframes sessionSlideUp {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.session-status-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		margin: 0 auto 20px auto;
	}

	.session-status-dot.active {
		background: #10b981;
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
		animation: sessionPulse 2s ease-in-out infinite;
	}

	.session-status-dot.pending {
		background: #F97316;
		box-shadow: 0 0 16px rgba(249, 115, 22, 0.4);
		animation: sessionPulse 2s ease-in-out infinite;
	}

	@keyframes sessionPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.session-title {
		color: #ffffff;
		font-size: 22px;
		font-weight: 700;
		margin: 0 0 12px 0;
		letter-spacing: -0.5px;
	}

	.session-title.active-title {
		color: #10b981;
	}

	.session-desc {
		color: #8b92ab;
		font-size: 14px;
		line-height: 1.6;
		margin: 0 0 24px 0;
	}

	.session-time-badge {
		display: inline-block;
		padding: 6px 16px;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: 20px;
		color: #10b981;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 24px;
	}

	.session-details {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #1a1a1a;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.session-detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
	}

	.session-detail-row + .session-detail-row {
		border-top: 1px solid #1a1a1a;
		margin-top: 6px;
		padding-top: 12px;
	}

	.detail-label {
		color: #666;
		font-size: 13px;
	}

	.detail-value {
		color: #ccc;
		font-size: 13px;
		font-weight: 600;
	}

	.session-primary-btn {
		width: 100%;
		padding: 14px;
		border: none;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: -0.3px;
	}

	.session-primary-btn.enable-btn {
		background: #F97316;
		color: #000;
	}

	.session-primary-btn.enable-btn:hover:not(:disabled) {
		background: #ea580c;
	}

	.session-primary-btn.enable-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.session-primary-btn.active-btn {
		background: transparent;
		color: #10b981;
		border: 1px solid #10b981;
	}

	.session-primary-btn.active-btn:hover {
		background: rgba(16, 185, 129, 0.1);
	}

	.balance-display {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		min-height: 32px;
		box-sizing: border-box;
		background: #000000;
		border: 1px solid #F97316;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.balance-label {
		color: #FFFFFF;
		font-size: 11px;
		letter-spacing: 0.5px;
	}

	.balance-amount {
		color: #FFFFFF;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
	}

	.connect-account-btn {
		background: #1E2139;
		color: #E8E8E8;
		border: 1px solid #2A2F45;
		padding: 8px 16px;
		font-family: Inter, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.connect-account-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		border-color: #F97316;
		transform: scale(1.02);
	}

	.connect-account-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.profile-dropdown-container {
		position: relative;
	}

	.account-btn {
		padding: 6px 12px;
		background: #1E2139;
		border: 1px solid #2A2F45;
		border-radius: 8px;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.account-btn:hover {
		background: #252A45;
		border-color: #F97316;
	}

	.profile-pic {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		object-fit: cover;
	}

	.account-name {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Connect Button Styles */
	.connect-dropdown-container {
		position: relative;
	}

	.connect-btn {
		padding: 9px 24px;
		background: #F97316;
		border: none;
		border-radius: 9999px;
		color: #000000;
		font-family: Inter, sans-serif;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.2s ease;
		letter-spacing: 0.01em;
	}

	.connect-btn:hover {
		background: #ea580c;
	}

	.connect-dropdown {
		position: fixed;
		top: auto;
		right: auto;
		margin-top: 8px;
		min-width: 280px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
		overflow: hidden;
	}

	.connect-option {
		width: 100%;
		padding: 14px 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		border-bottom: 1px solid #404040;
	}

	.connect-option:last-child {
		border-bottom: none;
	}

	.connect-option:hover {
		background: rgba(249, 115, 22, 0.1);
	}

	.connect-option svg {
		flex-shrink: 0;
	}

	.connect-option-text {
		flex: 1;
	}

	.connect-option-title {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		margin-bottom: 2px;
	}

	.connect-option-subtitle {
		font-size: 12px;
		color: #8B92AB;
	}

	/* Profile Button Styles */
	.profile-btn {
		padding: 4px 10px;
		background: #000000;
		border: 1px solid #F97316;
		border-radius: 6px;
		color: #FFFFFF;
		font-family: Inter, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.profile-btn:hover {
		background: #1A1A1A;
		border-color: #F97316;
	}

	.profile-name {
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-pic-placeholder {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: linear-gradient(135deg, #F97316 0%, #ea580c 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		color: white;
		flex-shrink: 0;
	}

	.dropdown-profile-pic-placeholder {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, #F97316 0%, #ea580c 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 700;
		color: white;
		border: 2px solid #2A2F45;
		flex-shrink: 0;
	}

	.profile-dropdown {
		position: fixed;
		top: auto;
		right: auto;
		margin-top: 8px;
		min-width: 280px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-header {
		padding: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.dropdown-profile-pic {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #2A2F45;
	}

	.dropdown-user-info {
		flex: 1;
		min-width: 0;
	}

	.dropdown-user-name {
		font-size: 14px;
		font-weight: 600;
		color: #E8E8E8;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-user-email {
		font-size: 12px;
		color: #8B92AB;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-divider {
		height: 1px;
		background: #2A2F45;
		margin: 0 8px;
	}

	.dropdown-item {
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 200ms ease-out, color 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
		text-decoration: none;
		margin: 0;
		box-sizing: border-box;
	}

	.dropdown-item:hover {
		background: rgba(249, 115, 22, 0.1);
		color: #F97316;
	}

	.dropdown-item:last-child:hover {
		background: rgba(255, 107, 107, 0.1);
		color: #FF6B6B;
	}

	.dropdown-item svg {
		flex-shrink: 0;
	}

	.settings-dropdown-container {
		position: relative;
	}

	.settings-btn {
		padding: 6px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 8px;
		color: #E8E8E8;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: Inter, sans-serif;
	}

	.settings-btn:hover {
		background: #252A45;
		border-color: #F97316;
	}

	.settings-dropdown {
		position: fixed;
		top: auto;
		right: 24px;
		margin-top: 8px;
		min-width: 200px;
		background: #000000;
		border: 1px solid #404040;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 1000;
		animation: slideDown 0.2s ease-out;
		overflow: hidden;
	}

	.settings-dropdown .dropdown-item {
		width: 100%;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: #E8E8E8;
		font-family: Inter, sans-serif;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 200ms ease-out;
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
		border-bottom: 1px solid #404040;
	}

	.settings-dropdown .dropdown-item:last-child {
		border-bottom: none;
	}

	.settings-dropdown .dropdown-item:hover:not(:disabled) {
		background: rgba(249, 115, 22, 0.1);
		color: #F97316;
	}

	.settings-dropdown .dropdown-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		color: #666;
	}

	.settings-dropdown .dropdown-item svg {
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.navbar {
			padding: 12px 16px;
		}

		.nav-links {
			order: 3;
			width: 100%;
			flex-basis: 100%;
		}

		.account-name {
			display: none;
		}

	}

	/* Light mode styles for login button */
	:global(.light-mode) .connect-account-btn {
		background: #FFFFFF;
		color: #1A1A1A;
		border-color: #E0E0E0;
	}

	:global(.light-mode) .connect-account-btn:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.05);
		border-color: #00B570;
	}

	/* Mobile Menu Toggle Button */
	.mobile-menu-toggle {
		display: none;
		background: transparent;
		border: none;
		color: #FFFFFF;
		cursor: pointer;
		padding: 8px;
		margin-left: auto;
	}

	.mobile-menu-toggle:hover {
		color: #F97316;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 1024px) {
		.navbar {
			flex-wrap: wrap;
			position: relative;
		}

		.mobile-menu-toggle {
			display: block;
			order: 3;
		}

		.logo {
			order: 1;
		}

		.navbar-right {
			order: 2;
			margin-left: auto;
			margin-right: 8px;
		}

		.nav-links {
			order: 4;
			flex-basis: 100%;
			flex-direction: column;
			gap: 0;
			display: none;
			background: #111;
			border-top: 1px solid #404040;
			padding: 0;
			margin: 0 -24px;
		}

		.nav-links.mobile-open {
			display: flex;
		}

		.nav-link {
			padding: 16px 24px;
			border: none;
			border-radius: 0;
			border-bottom: 1px solid #222;
			font-size: 14px;
			width: 100%;
			text-align: left;
		}

		.nav-link:hover {
			background: rgba(249, 115, 22, 0.1);
			border-color: transparent;
			border-bottom: 1px solid #222;
		}

		.nav-link.active {
			background: rgba(249, 115, 22, 0.15);
			border-color: transparent;
			border-bottom: 1px solid #222;
			border-left: 3px solid #F97316;
		}

		.balance-display {
			font-size: 12px;
		}

	}

	@media (max-width: 768px) {
		.navbar {
			padding: 12px 16px;
		}

		.logo-img {
			width: 32px;
			height: 32px;
		}

		.logo-title {
			font-size: 16px;
		}

		.logo-subtitle {
			font-size: 9px;
		}

		.balance-display {
			display: none;
		}

		.session-dropdown-container {
			display: none;
		}

		.initialize-btn {
			font-size: 11px;
			padding: 6px 10px;
		}

		.nav-links {
			margin: 0 -16px;
		}

		.nav-link {
			padding: 14px 16px;
		}
	}

	@media (max-width: 480px) {
		.navbar-right :global(.wallet-button) {
			font-size: 11px;
			padding: 6px 10px;
		}

		.connect-account-btn {
			font-size: 11px;
			padding: 6px 12px;
		}

		.profile-btn {
			padding: 6px;
		}
	}
</style>
