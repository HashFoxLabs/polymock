import { Web3Auth } from '@web3auth/modal';
import { WEB3AUTH_NETWORK } from '@web3auth/base';
import { SolanaPrivateKeyProvider, SolanaWallet } from '@web3auth/solana-provider';
import { PublicKey } from '@solana/web3.js';

let web3auth: Web3Auth | null = null;
let solanaWallet: SolanaWallet | null = null;

const WEB3AUTH_CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || '';

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
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('Web3Auth') || key.startsWith('openlogin') || key.includes('web3auth'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

export async function initWeb3Auth(): Promise<Web3Auth | null> {
  if (typeof window === 'undefined') return null;
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

    if (instance.status === 'not_ready') {
      clearWeb3AuthState();

      const retry = new Web3Auth({
        clientId: WEB3AUTH_CLIENT_ID,
        web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
        privateKeyProvider: new SolanaPrivateKeyProvider({
          config: { chainConfig }
        }),
      });

      await retry.initModal();
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

export async function connectWeb3Auth(): Promise<{
  publicKey: PublicKey;
  wallet: SolanaWallet;
  userInfo: { email?: string; name?: string; profileImage?: string };
} | null> {
  if (!web3auth || web3auth.status !== 'ready') {
    await initWeb3Auth();
  }
  if (!web3auth) {
    throw new Error('Web3Auth not initialized');
  }

  try {
    await web3auth.connect();

    const provider = web3auth.provider;
    if (!provider) throw new Error('No provider after connect');

    const solWallet = new SolanaWallet(provider);
    const accounts = await solWallet.requestAccounts();
    if (!accounts || accounts.length === 0) throw new Error('No Solana accounts returned');

    solanaWallet = solWallet;
    const publicKey = new PublicKey(accounts[0]);
    const userInfo = await web3auth.getUserInfo();

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
      return null;
    }
    throw error;
  }
}

export function isWeb3AuthConnected(): boolean {
  return web3auth?.connected ?? false;
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
}
