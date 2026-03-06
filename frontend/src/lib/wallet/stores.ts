import { writable, get } from 'svelte/store';
import type { Adapter } from '@solana/wallet-adapter-base';
import { polymarketService } from '$lib/solana/polymarket-service';
import { PublicKey } from '@solana/web3.js';
import { authStore } from '$lib/auth/auth-store';

export interface WalletState {
	connected: boolean;
	connecting: boolean;
	disconnecting: boolean;
	publicKey: any | null;
	adapter: Adapter | null;
	usdcBalance: number;  // Mock USDC balance
	userAccountInitialized: boolean;
	loading: boolean;
}

const initialState: WalletState = {
	connected: false,
	connecting: false,
	disconnecting: false,
	publicKey: null,
	adapter: null,
	usdcBalance: 0,
	userAccountInitialized: false,
	loading: false
};

export const walletStore = writable<WalletState>(initialState);

export function setWalletAdapter(adapter: Adapter | null) {
	walletStore.update(state => ({
		...state,
		adapter,
		connected: adapter?.connected ?? false,
		publicKey: adapter?.publicKey ?? null
	}));
}

export function setWalletConnecting(connecting: boolean) {
	walletStore.update(state => ({
		...state,
		connecting
	}));
}

export function setWalletDisconnecting(disconnecting: boolean) {
	walletStore.update(state => ({
		...state,
		disconnecting
	}));
}

export async function updateWalletConnection() {
	const state = get(walletStore);
	if (!state.adapter) return;

	const newState = {
		...state,
		connected: state.adapter.connected ?? false,
		publicKey: state.adapter.publicKey ?? null,
		connecting: false,
		disconnecting: false
	};

	walletStore.set(newState);

	// Authenticate wallet and create session when connected
	if (newState.connected && newState.publicKey && state.adapter) {
		try {
			const walletAddress = newState.publicKey.toString();

			// Check if already authenticated
			const userResponse = await fetch('/api/auth/user', { credentials: 'include' });
			const userData = await userResponse.json();

			// Only authenticate if not already authenticated with this wallet
			if (!userData.user || userData.user.solanaAddress !== walletAddress) {
				// Create authentication message
				const message = `Sign this message to authenticate with Polymock.\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
				const messageBytes = new TextEncoder().encode(message);

				// Request signature from wallet
				const signature = await state.adapter.signMessage!(messageBytes);

				// Send to backend for verification and session creation
				const response = await fetch('/api/auth/wallet', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						walletAddress,
						signature: Array.from(signature),
						message
					})
				});

				if (response.ok) {
					console.log('✅ Wallet authenticated successfully');

					// Link wallet to Google account if authenticated
					const auth = get(authStore);
					if (auth.isAuthenticated && !auth.user?.walletAddress) {
						authStore.linkWallet(walletAddress);
					}
				} else {
					const errorData = await response.json();
					throw new Error(errorData.error || 'Authentication failed');
				}
			}
		} catch (error: any) {
			console.error('Error authenticating wallet:', error);

			// Disconnect the wallet if authentication fails
			if (state.adapter) {
				try {
					await state.adapter.disconnect();
				} catch (disconnectError) {
					console.error('Error disconnecting after auth failure:', disconnectError);
				}
			}

			// Reset wallet state
			walletStore.set({
				...initialState,
				connecting: false,
				disconnecting: false
			});

			// Show user-friendly error message
			let errorMessage = 'Wallet authentication failed.\n\n';
			if (error?.message?.includes('User rejected') || error?.message?.includes('rejected')) {
				errorMessage += 'You rejected the signature request. Please sign the message to authenticate and use Polymock features like saving strategies.\n\nWould you like to try connecting again?';
			} else {
				errorMessage += `Error: ${error?.message || 'Unknown error'}\n\nPlease try again.`;
			}

			alert(errorMessage);
			return;
		}
	}
}

export function setUserBalance(usdcBalance: number) {
	walletStore.update(state => ({
		...state,
		usdcBalance
	}));
}

export function setUserAccountInitialized(initialized: boolean) {
	walletStore.update(state => ({
		...state,
		userAccountInitialized: initialized
	}));
}

export function setWalletLoading(loading: boolean) {
	walletStore.update(state => ({
		...state,
		loading
	}));
}

/**
 * Check if user account exists and fetch balance (does NOT create account)
 */
export async function initializeUserAccountIfNeeded(wallet: any) {
	try {
		if (!wallet || !wallet.publicKey) {
			console.error('No wallet connected');
			return;
		}

		setWalletLoading(true);

		// Initialize the Solana program with MagicBlock RPC
		await polymarketService.initializeProgram(wallet);

		const userPublicKey = new PublicKey(wallet.publicKey.toString());

		// Check if user account exists
		const exists = await polymarketService.checkUserAccount(userPublicKey);

		if (exists) {
			// Fetch user account data
			const userAccount = await polymarketService.getUserAccount(userPublicKey);
			if (userAccount) {
				const balance = userAccount.usdcBalance.toNumber() / 1_000_000;
				setUserBalance(balance);
				setUserAccountInitialized(true);
			}
		} else {
			// Account doesn't exist — don't auto-create, let the popup handle it
			setUserAccountInitialized(false);
		}
	} catch (error: any) {
		console.error('Error checking user account:', error);
	} finally {
		setWalletLoading(false);
	}
}

/**
 * Create the user account on-chain (called from init popup)
 */
export async function createUserAccount(wallet: any) {
	try {
		if (!wallet || !wallet.publicKey) {
			throw new Error('No wallet connected');
		}

		setWalletLoading(true);

		await polymarketService.initializeProgram(wallet);
		const userPublicKey = new PublicKey(wallet.publicKey.toString());

		// Initialize with 0.1 SOL entry fee
		await polymarketService.initializeUserAccount(wallet, 0.1);

		// Fetch user account data
		const userAccount = await polymarketService.getUserAccount(userPublicKey);
		if (userAccount) {
			const balance = userAccount.usdcBalance.toNumber() / 1_000_000;
			setUserBalance(balance);
			setUserAccountInitialized(true);
		}
	} catch (error: any) {
		console.error('Error creating user account:', error);
		throw error;
	} finally {
		setWalletLoading(false);
	}
}

/**
 * Refresh user balance
 */
export async function refreshUserBalance(publicKey: PublicKey, retries = 3) {
	for (let i = 0; i < retries; i++) {
		try {
			// Wait a bit for on-chain state to propagate after TX confirmation
			if (i > 0) await new Promise(r => setTimeout(r, 1000));
			const userAccount = await polymarketService.getUserAccount(publicKey);
			if (userAccount) {
				const balance = userAccount.usdcBalance.toNumber() / 1_000_000;
				setUserBalance(balance);
				return;
			}
		} catch (error) {
			console.error('Error refreshing balance (attempt ' + (i + 1) + '):', error);
		}
	}
}