<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore, setWalletAdapter, setWalletConnecting, setWalletDisconnecting, updateWalletConnection } from './stores';
	import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
	import type { Adapter } from '@solana/wallet-adapter-base';

	declare global {
		interface Window {
			phantom?: {
				solana?: any;
			};
			solana?: any;
		}
	}

	const WALLET_STORAGE_KEY = 'polymock_connected_wallet';

	export let isDropdownMode = false;
	export let onClose: (() => void) | undefined = undefined;
	export let onConnected: (() => void) | undefined = undefined;

	let walletState = $walletStore;
	let showWalletModal = false;
	let availableWallets: Adapter[] = [];

	walletStore.subscribe(value => {
		walletState = value;
	});

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

	onMount(() => {
		const initWallets = () => {
			try {
				availableWallets = [
					new PhantomWalletAdapter(),
					new SolflareWalletAdapter()
				];
			} catch (error) {
				console.error('Error initializing wallets:', error);
				availableWallets = [];
			}
		};

		initWallets();

		setTimeout(() => {
			if (availableWallets.length === 0 || availableWallets.every(w => w.readyState === 'NotDetected')) {
				initWallets();
			}
		}, 500);
	});

	async function selectWallet(wallet: Adapter) {
		try {
			setWalletConnecting(true);
			showWalletModal = false;
			if (onClose) onClose();

			if (wallet.readyState === 'NotDetected') {
				throw new Error(`${wallet.name} is not installed. Please install the wallet extension first.`);
			}

			if (wallet.readyState !== 'Installed' && wallet.readyState !== 'Loadable') {
				throw new Error(`Wallet is not ready. Status: ${wallet.readyState}`);
			}

			// Phantom direct provider connection
			if (wallet.name === 'Phantom' && typeof window !== 'undefined') {
				const provider = window.phantom?.solana || window.solana;
				if (provider && provider.isPhantom) {
					try {
						let publicKey = provider.publicKey;

						if (!provider.isConnected || !publicKey) {
							try {
								const resp = await provider.connect();
								publicKey = resp.publicKey;
							} catch (connectErr: any) {
								try {
									const resp = await provider.request({ method: 'connect' });
									publicKey = resp.publicKey || provider.publicKey;
								} catch {
									throw connectErr;
								}
							}
						}

						if (!publicKey) {
							throw new Error('Failed to get public key from Phantom');
						}

						const directWallet = createPhantomWrapper(provider, publicKey);
						localStorage.setItem(WALLET_STORAGE_KEY, 'Phantom');

						setWalletAdapter(directWallet as any);
						await updateWalletConnection();
						setWalletConnecting(false);
						onConnected?.();
						return;
					} catch (directError: any) {
						console.error('Direct Phantom connection failed:', directError);

						if (directError?.code === -32603 || directError?.message?.includes('32603')) {
							setWalletConnecting(false);
							setWalletAdapter(null);
							alert('Phantom Wallet Error. Please unlock your wallet, switch to Devnet, and try again.');
							return;
						}
					}
				}
			}

			// Adapter-based fallback
			wallet.on('connect', async () => {
				updateWalletConnection();
			});

			wallet.on('disconnect', () => {
				localStorage.removeItem(WALLET_STORAGE_KEY);
				updateWalletConnection();
			});

			wallet.on('error', (error) => {
				console.error('Wallet error event:', error);
				setWalletConnecting(false);
				setWalletDisconnecting(false);
			});

			setWalletAdapter(wallet);

			const connectTimeout = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Connection timeout')), 30000)
			);

			await Promise.race([wallet.connect(), connectTimeout]);

			localStorage.setItem(WALLET_STORAGE_KEY, wallet.name);
			updateWalletConnection();
			onConnected?.();
		} catch (error: any) {
			console.error('Failed to connect wallet:', error);
			setWalletConnecting(false);
			setWalletAdapter(null);

			let errorMessage = 'Failed to connect wallet: ';
			if (error?.message?.includes('not installed')) {
				errorMessage = error.message;
			} else if (error?.message?.includes('User rejected') || error?.message?.includes('User denied')) {
				errorMessage = 'Connection request was cancelled';
			} else if (error?.message?.includes('timeout')) {
				errorMessage = 'Connection timed out. Please try again.';
			} else {
				errorMessage += error?.message || 'Unknown error';
			}
			alert(errorMessage);
		}
	}

	async function disconnect() {
		if (!walletState.adapter) return;

		try {
			setWalletDisconnecting(true);
			localStorage.removeItem(WALLET_STORAGE_KEY);
			await walletState.adapter.disconnect();
			setWalletAdapter(null);
			updateWalletConnection();
		} catch (error) {
			console.error('Failed to disconnect wallet:', error);
		} finally {
			setWalletDisconnecting(false);
		}
	}

	function openWalletModal() {
		showWalletModal = true;
	}

	function closeWalletModal() {
		showWalletModal = false;
	}

	function formatAddress(address: string): string {
		return `${address.slice(0, 4)}...${address.slice(-4)}`;
	}
</script>

{#if isDropdownMode}
	<button class="connect-option" on:click={openWalletModal} disabled={walletState.connecting}>
		<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
			<rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
			<path d="M14 10h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			<path d="M2 8h16" stroke="currentColor" stroke-width="1.5"/>
		</svg>
		<div class="connect-option-text">
			<div class="connect-option-title">
				{walletState.connecting ? 'Connecting...' : 'Wallet'}
			</div>
			<div class="connect-option-subtitle">Connect with Solana wallet</div>
		</div>
	</button>
{:else}
	<div class="wallet-section">
		{#if walletState.connected && walletState.publicKey}
			<div class="wallet-info">
				<span class="wallet-address">{formatAddress(walletState.publicKey.toString())}</span>
				<button class="disconnect-btn" on:click={disconnect} disabled={walletState.disconnecting}>
					{walletState.disconnecting ? 'DISCONNECTING...' : 'DISCONNECT'}
				</button>
			</div>
		{:else}
			<button class="connect-btn" on:click={openWalletModal} disabled={walletState.connecting}>
				{walletState.connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
			</button>
		{/if}
	</div>
{/if}

{#if showWalletModal}
	<div class="wallet-modal-overlay" on:click={closeWalletModal} on:keydown={(e) => e.key === 'Escape' && closeWalletModal()} role="button" tabindex="0">
		<div class="wallet-modal" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
			<div class="wallet-modal-header">
				<h3>Connect a wallet</h3>
				<button class="close-btn" on:click={closeWalletModal}>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<p class="wallet-modal-description">
				Connect your Solana wallet to get started
			</p>

			<div class="wallet-list">
				{#each availableWallets as wallet}
					<button
						class="wallet-option"
						on:click={() => selectWallet(wallet)}
						disabled={wallet.readyState === 'NotDetected'}
					>
						<div class="wallet-option-left">
							<span class="wallet-name">{wallet.name}</span>
						</div>

						<div class="wallet-option-right">
							{#if wallet.readyState === 'Installed'}
								<span class="wallet-status-badge detected">Detected</span>
							{:else if wallet.readyState === 'NotDetected'}
								<span class="wallet-status-badge not-detected">Not Installed</span>
							{:else}
								<span class="wallet-status-badge">{wallet.readyState}</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<div class="wallet-modal-footer">
				<p class="wallet-modal-help">
					Don't have a wallet?
					<a href="https://phantom.app/" target="_blank" rel="noopener noreferrer">Get Phantom</a>
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Dropdown mode styles */
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
		color: #E8E8E8;
	}

	.connect-option:hover:not(:disabled) {
		background: rgba(0, 208, 132, 0.1);
	}

	.connect-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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
		font-family: Inter, sans-serif;
	}

	.connect-option-subtitle {
		font-size: 12px;
		color: #8B92AB;
		font-family: Inter, sans-serif;
	}

	/* Standalone button styles */
	.wallet-section {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.connect-btn {
		background: #000000;
		color: #E8E8E8;
		border: 1px solid #FFFFFF;
		padding: 8px 16px;
		font-family: Inter, sans-serif;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.connect-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		border-color: #F97316;
		transform: scale(1.02);
	}

	.connect-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.wallet-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.wallet-address {
		color: #00D084;
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
		padding: 6px 12px;
		background: #000000;
		border: 1px solid #FFFFFF;
		border-radius: 6px;
	}

	.disconnect-btn {
		background: #000000;
		color: #A0A0A0;
		border: 1px solid #FFFFFF;
		padding: 6px 12px;
		font-family: Inter, sans-serif;
		font-size: 11px;
		cursor: pointer;
		border-radius: 6px;
		transition: all 200ms ease-out;
	}

	.disconnect-btn:hover:not(:disabled) {
		background: #FF4757;
		color: #ffffff;
		border-color: #FF4757;
	}

	.disconnect-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.wallet-modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
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

	.wallet-modal {
		background: #000000;
		border: 1px solid #FFFFFF;
		border-radius: 16px;
		padding: 0;
		min-width: 420px;
		max-width: 480px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: slideUp 0.3s ease-out;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	@keyframes slideUp {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.wallet-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 24px 28px;
		border-bottom: 1px solid #404040;
	}

	.wallet-modal-header h3 {
		color: white;
		font-size: 20px;
		font-weight: 600;
		margin: 0;
		letter-spacing: -0.5px;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: #8b92ab;
		cursor: pointer;
		padding: 8px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.05);
	}

	.wallet-modal-description {
		color: #8b92ab;
		font-size: 14px;
		margin: 0;
		padding: 0 28px 20px 28px;
		line-height: 1.5;
	}

	.wallet-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0 16px 16px 16px;
		overflow-y: auto;
		flex: 1;
	}

	.wallet-option {
		background: transparent;
		border: 1px solid #FFFFFF;
		border-radius: 12px;
		color: #fff;
		padding: 16px 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: all 0.2s ease;
		margin-bottom: 8px;
	}

	.wallet-option:hover:not(:disabled) {
		border-color: #F97316;
		background: rgba(249, 115, 22, 0.05);
	}

	.wallet-option:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.wallet-option-left {
		display: flex;
		align-items: center;
	}

	.wallet-name {
		font-size: 15px;
		font-weight: bold;
	}

	.wallet-option-right {
		display: flex;
		align-items: center;
	}

	.wallet-status-badge {
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 6px;
		font-weight: 600;
		background: rgba(139, 146, 171, 0.1);
		color: #8b92ab;
	}

	.wallet-status-badge.detected {
		background: rgba(16, 185, 129, 0.1);
		color: #10b981;
	}

	.wallet-status-badge.not-detected {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.wallet-modal-footer {
		padding: 16px 28px 24px 28px;
		border-top: 1px solid #404040;
	}

	.wallet-modal-help {
		margin: 0;
		font-size: 13px;
		color: #8b92ab;
		text-align: center;
		line-height: 1.5;
	}

	.wallet-modal-help a {
		color: #F97316;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.2s;
	}

	.wallet-modal-help a:hover {
		color: #ea580c;
		text-decoration: underline;
	}

	@media (max-width: 500px) {
		.wallet-modal {
			min-width: 90vw;
			max-width: 90vw;
		}
	}
</style>
