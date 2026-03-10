<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import UsernameModal from '$lib/components/UsernameModal.svelte';
	import { handleAuthCallback } from '$lib/auth/auth-store';
	import { initWeb3Auth, isWeb3AuthConnected, connectWeb3Auth, createWeb3AuthWalletAdapter } from '$lib/auth/web3auth';
	import { walletStore, setUsername, setWalletAdapter, updateWalletConnection } from '$lib/wallet/stores';
	import { authStore } from '$lib/auth/auth-store';

	let { children } = $props();

	let showUsernameModal = $state(false);
	let walletAddress = $state('');

	const unsubWallet = walletStore.subscribe(state => {
		if (state.connected && state.needsUsername && state.publicKey) {
			walletAddress = state.publicKey.toString();
			showUsernameModal = true;
		} else {
			showUsernameModal = false;
		}
	});

	function handleUsernameComplete(username: string) {
		setUsername(username);
		showUsernameModal = false;
	}

	onMount(() => {
		handleAuthCallback();
		return () => unsubWallet();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar />

{#if showUsernameModal}
	<UsernameModal {walletAddress} onComplete={handleUsernameComplete} />
{/if}

{@render children?.()}

<style>
	:global(body) {
		font-family: Arial, Helvetica, sans-serif;
		margin: 0;
		padding: 0;
		background: #000000;
		color: #FFFFFF;
		transition: background 0.3s ease, color 0.3s ease;
	}

	:global(body.light-mode) {
		background: #FFFFFF;
		color: #1A1A1A;
	}

	:global(.light-mode .navbar) {
		background: #F5F5F5 !important;
		border-bottom-color: #E0E0E0 !important;
	}

	:global(.light-mode .nav-link) {
		color: #666 !important;
	}

	:global(.light-mode .nav-link:hover) {
		color: #1A1A1A !important;
		border-color: #CCC !important;
		background: rgba(0, 0, 0, 0.05) !important;
	}

	:global(.light-mode .nav-link.active) {
		color: #00B570 !important;
		border-color: #00B570 !important;
		background: rgba(0, 181, 112, 0.1) !important;
	}

	:global(.light-mode .logo) {
		color: #1A1A1A !important;
	}

	:global(.light-mode .logo:hover) {
		color: #00B570 !important;
	}

	:global(.light-mode .connect-account-btn),
	:global(.light-mode .account-btn),
	:global(.light-mode .settings-btn),
	:global(.light-mode .initialize-btn) {
		background: #FFFFFF !important;
		color: #1A1A1A !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode .balance-display) {
		background: #FFFFFF !important;
		border-color: #00B570 !important;
	}

	:global(.light-mode .balance-label) {
		color: #666 !important;
	}

	:global(.light-mode .panel) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode .panel-header) {
		color: #1A1A1A !important;
		border-bottom-color: #E0E0E0 !important;
	}

	:global(.light-mode .command-bar),
	:global(.light-mode .ticker-bar) {
		background: #F5F5F5 !important;
		border-bottom-color: #E0E0E0 !important;
	}

	:global(.light-mode .command-input) {
		background: #FFFFFF !important;
		color: #1A1A1A !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode .market-card) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
		color: #1A1A1A !important;
	}

	:global(.light-mode .market-card:hover) {
		border-color: #CCC !important;
		background: #F9F9F9 !important;
	}

	:global(.light-mode .market-question),
	:global(.light-mode .market-category),
	:global(.light-mode .news-title) {
		color: #1A1A1A !important;
	}

	:global(.light-mode .settings-dropdown),
	:global(.light-mode .profile-dropdown) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* More comprehensive light mode styles for all pages */
	:global(.light-mode) {
		--bg-primary: #FFFFFF;
		--bg-secondary: #F5F5F5;
		--bg-tertiary: #FAFAFA;
		--border-color: #E0E0E0;
		--text-primary: #1A1A1A;
		--text-secondary: #666;
		--text-tertiary: #999;
	}

	:global(.light-mode .polyMock) {
		background: #FFFFFF !important;
	}

	:global(.light-mode .main-grid) {
		background: #FFFFFF !important;
	}

	:global(.light-mode .news-item) {
		border-bottom-color: #E0E0E0 !important;
	}

	:global(.light-mode .news-meta),
	:global(.light-mode .ticker-item),
	:global(.light-mode .status-label) {
		color: #666 !important;
	}

	:global(.light-mode .news-item:hover) {
		background: rgba(0, 0, 0, 0.03) !important;
	}

	:global(.light-mode .pyth-status),
	:global(.light-mode .balance-display),
	:global(.light-mode .wallet-address),
	:global(.light-mode .disconnect-btn),
	:global(.light-mode .category-tab) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
		color: #1A1A1A !important;
	}

	:global(.light-mode .go-button) {
		background: #00B570 !important;
	}

	:global(.light-mode .category-tab.active) {
		background: #00B570 !important;
		color: #FFFFFF !important;
		border-color: #00B570 !important;
	}

	:global(.light-mode .category-tab:hover) {
		background: rgba(0, 181, 112, 0.1) !important;
		border-color: #00B570 !important;
		color: #00B570 !important;
	}

	:global(.light-mode .market-stat-item .stat-label),
	:global(.light-mode .market-count) {
		color: #666 !important;
	}

	:global(.light-mode .market-stat-item .stat-value),
	:global(.light-mode .price) {
		color: #1A1A1A !important;
	}

	:global(.light-mode .market-image-corner) {
		background: rgba(0, 0, 0, 0.05) !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode .outcome-option) {
		background: rgba(0, 0, 0, 0.02) !important;
	}

	:global(.light-mode .loading-state) {
		color: #666 !important;
	}

	:global(.light-mode .dropdown-item) {
		color: #1A1A1A !important;
	}

	:global(.light-mode .dropdown-item:hover:not(:disabled)) {
		background: rgba(0, 181, 112, 0.1) !important;
		color: #00B570 !important;
	}

	:global(.light-mode .dropdown-divider) {
		background: #E0E0E0 !important;
	}

	:global(.light-mode .dropdown-user-name) {
		color: #1A1A1A !important;
	}

	:global(.light-mode .dropdown-user-email) {
		color: #666 !important;
	}

	:global(.light-mode .wallet-info .wallet-address) {
		color: #00B570 !important;
	}

	/* Generic light mode styles for all pages */
	:global(.light-mode div[class*="container"]),
	:global(.light-mode div[class*="wrapper"]),
	:global(.light-mode section) {
		background: #FFFFFF !important;
	}

	:global(.light-mode button:not(.go-button):not(.category-tab.active)),
	:global(.light-mode input),
	:global(.light-mode select),
	:global(.light-mode textarea) {
		background: #FFFFFF !important;
		color: #1A1A1A !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode h1),
	:global(.light-mode h2),
	:global(.light-mode h3),
	:global(.light-mode h4),
	:global(.light-mode h5),
	:global(.light-mode h6),
	:global(.light-mode p),
	:global(.light-mode span:not(.balance-amount):not(.status-value):not(.wallet-address)),
	:global(.light-mode div:not([class*="balance"]):not([class*="status"])) {
		color: #1A1A1A !important;
	}

	:global(.light-mode table) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	:global(.light-mode td),
	:global(.light-mode th) {
		border-color: #E0E0E0 !important;
		color: #1A1A1A !important;
	}

	:global(.light-mode a) {
		color: #00B570 !important;
	}

	:global(.light-mode hr) {
		border-color: #E0E0E0 !important;
	}

	/* Dashboard specific */
	:global(.light-mode .position-card),
	:global(.light-mode .stats-card),
	:global(.light-mode .metric-card) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* News page specific */
	:global(.light-mode .article),
	:global(.light-mode .article-card) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* Competition page specific */
	:global(.light-mode .leaderboard),
	:global(.light-mode .rank-card) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* Backtesting page specific */
	:global(.light-mode .chart-container),
	:global(.light-mode .strategy-card) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* Modal styles */
	:global(.light-mode .modal),
	:global(.light-mode .modal-content),
	:global(.light-mode .modal-overlay) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* Card elements */
	:global(.light-mode [class*="card"]:not(.market-card)) {
		background: #FFFFFF !important;
		border-color: #E0E0E0 !important;
	}

	/* Text color overrides for specific elements */
	:global(.light-mode [class*="label"]),
	:global(.light-mode [class*="description"]),
	:global(.light-mode [class*="subtitle"]) {
		color: #666 !important;
	}

	:global(.light-mode [class*="title"]:not(.news-title)),
	:global(.light-mode [class*="heading"]) {
		color: #1A1A1A !important;
	}
</style>
