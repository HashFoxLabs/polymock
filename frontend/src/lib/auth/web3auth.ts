import { browser } from '$app/environment';
import { Web3Auth } from '@web3auth/modal';
import { WEB3AUTH_NETWORK } from '@web3auth/base';
import { SolanaPrivateKeyProvider, SolanaWallet } from '@web3auth/solana-provider';
import { PublicKey } from '@solana/web3.js';

let web3auth: Web3Auth | null = null;
let solanaWallet: SolanaWallet | null = null;

const WEB3AUTH_CLIENT_ID = import.meta.env.VITE_WEB3AUTH_CLIENT_ID || '';

// Matches dashboard config exactly
const chainConfig = {
	chainNamespace: 'solana' as const,
	chainId: '0x67',
	rpcTarget: 'https://api.devnet.solana.com',
	displayName: 'Solana Devnet',
	blockExplorerUrl: 'https://explorer.solana.com',
	ticker: 'SOL',
	tickerName: 'Solana',
	logo: 'https://images.toruswallet.io/solana.svg',
};

function clearWeb3AuthState() {
	if (!browser) return;
	// Clear stale EVM session data that blocks Solana init
	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && (key.startsWith('Web3Auth') || key.startsWith('openlogin') || key.includes('web3auth'))) {
			keysToRemove.push(key);
		}
	}
	keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Initialize Web3Auth with Solana provider
 * Docs: https://docs.metamask.io/embedded-wallets/connect-blockchain/solana/javascript/
 */
export async function initWeb3Auth(): Promise<Web3Auth | null> {
	if (!browser) return null;
	if (web3auth && web3auth.status === 'ready') return web3auth;

	web3auth = null;

	try {
		const privateKeyProvider = new SolanaPrivateKeyProvider({
			config: { chainConfig }
		});

		const instance = new Web3Auth({
			clientId: WEB3AUTH_CLIENT_ID,
			web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
			privateKeyProvider,
		});

		await instance.initModal();
		console.log('[Web3Auth] Init done, status:', instance.status);

		// If status is not_ready, clear stale state and retry once
		if (instance.status === 'not_ready') {
			console.log('[Web3Auth] Clearing stale session and retrying...');
			clearWeb3AuthState();

			const retry = new Web3Auth({
				clientId: WEB3AUTH_CLIENT_ID,
				web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
				privateKeyProvider: new SolanaPrivateKeyProvider({
					config: { chainConfig }
				}),
			});

			await retry.initModal();
			console.log('[Web3Auth] Retry init done, status:', retry.status);
			web3auth = retry;
		} else {
			web3auth = instance;
		}

		return web3auth;
	} catch (error) {
		console.error('[Web3Auth] Init failed:', error);
		web3auth = null;
		return null;
	}
}

/**
 * Connect via Web3Auth modal → embedded Solana wallet
 */
export async function connectWeb3Auth(): Promise<{
	publicKey: PublicKey;
	wallet: SolanaWallet;
	userInfo: { email?: string; name?: string; profileImage?: string };
} | null> {
	if (!web3auth || web3auth.status !== 'ready') {
		await initWeb3Auth();
	}
	if (!web3auth) {
		throw new Error('Web3Auth not initialized. Check your VITE_WEB3AUTH_CLIENT_ID.');
	}

	try {
		console.log('[Web3Auth] Connecting, status:', web3auth.status);
		await web3auth.connect();

		const provider = web3auth.provider;
		if (!provider) {
			throw new Error('No provider after connect');
		}

		const solWallet = new SolanaWallet(provider);
		const accounts = await solWallet.requestAccounts();
		if (!accounts || accounts.length === 0) {
			throw new Error('No Solana accounts returned');
		}

		solanaWallet = solWallet;
		const publicKey = new PublicKey(accounts[0]);
		const userInfo = await web3auth.getUserInfo();

		console.log('[Web3Auth] Connected:', publicKey.toString());

		return {
			publicKey,
			wallet: solanaWallet,
			userInfo: {
				email: userInfo.email || undefined,
				name: userInfo.name || undefined,
				profileImage: userInfo.profileImage || undefined
			}
		};
	} catch (error: any) {
		if (error?.message?.includes('User closed') || error?.code === 5000) {
			console.log('[Web3Auth] User cancelled login');
			return null;
		}
		throw error;
	}
}

export function isWeb3AuthConnected(): boolean {
	return web3auth?.connected ?? false;
}

export function getWeb3AuthSolanaWallet(): SolanaWallet | null {
	return solanaWallet;
}

export function getWeb3Auth(): Web3Auth | null {
	return web3auth;
}

export async function disconnectWeb3Auth(): Promise<void> {
	try {
		if (web3auth?.connected) {
			await web3auth.logout();
		}
	} catch (error) {
		console.warn('[Web3Auth] Logout error (non-fatal):', error);
	}
	solanaWallet = null;
	console.log('[Web3Auth] Disconnected');
}

export function createWeb3AuthWalletAdapter(solWallet: SolanaWallet, pubKey: PublicKey) {
	return {
		publicKey: pubKey,
		connected: true,
		signTransaction: async (tx: any) => {
			return await solWallet.signTransaction(tx);
		},
		signAllTransactions: async (txs: any[]) => {
			return await solWallet.signAllTransactions(txs);
		},
		signMessage: async (message: Uint8Array) => {
			return await solWallet.signMessage(message);
		},
		disconnect: async () => {
			await disconnectWeb3Auth();
		},
		name: 'Web3Auth'
	};
}
