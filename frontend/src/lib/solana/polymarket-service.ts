import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { PUBLIC_SOLANA_PROGRAM_ID, PUBLIC_SOLANA_RPC_ENDPOINT } from '$env/static/public';
import IDL from './polymarket_paper.json';
import { sessionKeyManager, SESSION_KEYS_PROGRAM_ID } from './session-keys';

// Lazy init to avoid "Cannot read properties of undefined (reading '_bn')" during SSR
// when env vars are not available (e.g. $env/static/public not set in server context)
let _programId: PublicKey | null = null;
function getProgramId(): PublicKey {
	if (_programId) return _programId;
	const id = PUBLIC_SOLANA_PROGRAM_ID;
	if (!id || typeof id !== 'string' || !id.trim()) {
		throw new Error('PUBLIC_SOLANA_PROGRAM_ID is not set. Add it to your .env file (e.g. PUBLIC_SOLANA_PROGRAM_ID=AmuwGa8LXKW63ZHzGm1TkqSugbJ8fMVXr6HKksYkwUNT).');
	}
	_programId = new PublicKey(id);
	return _programId;
}

const RPC_ENDPOINT = 'https://api.devnet.solana.com';

// IDL type - we'll use the generic Idl type from Anchor
export type PolymarketPaperIDL = Idl;

export interface UserAccount {
	owner: PublicKey;
	usdcBalance: BN;
	totalTrades: BN;
	createdAt: BN;
}

export interface PredictionPosition {
	owner: PublicKey;
	marketId: string;
	positionId: BN;
	predictionType: { yes: {} } | { no: {} };
	amountUsdc: BN;
	pricePerShare: BN;
	shares: BN;
	remainingShares: BN;
	totalSoldShares: BN;
	averageSellPrice: BN;
	status: { active: {} } | { closed: {} } | { partiallySold: {} } | { fullySold: {} };
	openedAt: BN;
	closedAt: BN;
	stopLoss: BN;
	takeProfit: BN;
}

export class PolymarketService {
	private connection: Connection;
	program: Program | null = null;

	constructor() {
		this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
	}

	/**
	 * Get active session info (keypair + token PDA) if session is valid for this wallet
	 */
	private getActiveSession(walletPubkey: PublicKey): { sessionKeypair: Keypair; sessionTokenPDA: PublicKey } | null {
		if (!sessionKeyManager.isSessionActive()) return null;
		if (!sessionKeyManager.isSessionForWallet(walletPubkey)) return null;
		const sessionKeypair = sessionKeyManager.getSessionKeypair();
		const sessionTokenPDA = sessionKeyManager.getSessionTokenPDA();
		if (!sessionKeypair || !sessionTokenPDA) return null;
		return { sessionKeypair, sessionTokenPDA };
	}

	/**
	 * Create a Program instance that uses the session keypair as the signer.
	 * This means .rpc() will sign with the session keypair — no wallet popup.
	 */
	private getSessionProgram(sessionKeypair: Keypair): Program {
		const sessionWallet = {
			publicKey: sessionKeypair.publicKey,
			signTransaction: async (tx: any) => { tx.partialSign(sessionKeypair); return tx; },
			signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(sessionKeypair)); return txs; },
		};
		const sessionProvider = new AnchorProvider(
			this.connection,
			sessionWallet as any,
			{ commitment: 'confirmed', preflightCommitment: 'confirmed' }
		);
		return new Program(IDL as Idl, sessionProvider);
	}

	/**
	 * Send a transaction using session key (no wallet popup) or fall back to .rpc()
	 */
	private async sendWithSession(
		methodName: string,
		methodArgs: any[],
		accounts: Record<string, PublicKey>,
		walletPubkey: PublicKey,
		session: { sessionKeypair: Keypair; sessionTokenPDA: PublicKey } | null,
	): Promise<string> {
		if (session) {
			// Session mode: build instruction via Anchor, then sign & send manually.
			// skipPreflight because Solana's simulator incorrectly reports
			// AccountNotSigner for session keypair transactions.
			const sessionProgram = this.getSessionProgram(session.sessionKeypair);

			const ix = await (sessionProgram.methods as any)[methodName](...methodArgs)
				.accounts({
					...accounts,
					sessionToken: session.sessionTokenPDA,
					user: session.sessionKeypair.publicKey,
				})
				.instruction();

			const tx = new Transaction().add(ix);
			tx.feePayer = session.sessionKeypair.publicKey;
			const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
			tx.recentBlockhash = blockhash;
			tx.sign(session.sessionKeypair);

			const sig = await this.connection.sendRawTransaction(tx.serialize(), {
				skipPreflight: true,
			});

			const confirmation = await this.connection.confirmTransaction({
				signature: sig,
				blockhash,
				lastValidBlockHeight,
			}, 'confirmed');

			if (confirmation.value.err) {
				// Fetch logs for debugging
				const txDetails = await this.connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
				const logs = txDetails?.meta?.logMessages?.join('\n') || 'No logs available';
				console.error('[Session] TX failed on-chain:', sig, '\nLogs:', logs);
				throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
			}

			console.log('[Session] TX confirmed:', sig);
			return sig;
		} else {
			// Normal mode: wallet signs via .rpc()
			return await (this.program!.methods as any)[methodName](...methodArgs)
				.accounts({
					...accounts,
					sessionToken: SESSION_KEYS_PROGRAM_ID,
					user: walletPubkey,
				})
				.rpc();
		}
	}

	/**
	 * Initialize the Anchor program
	 */
	async initializeProgram(wallet: any): Promise<void> {
		try {
			if (!wallet) {
				throw new Error('Wallet is required for program initialization');
			}

			if (!wallet.publicKey) {
				throw new Error('Wallet public key is not available');
			}


			const provider = new AnchorProvider(
				this.connection,
				wallet,
				{ commitment: 'confirmed', preflightCommitment: 'confirmed' }
			);

			// Use the local IDL file
			this.program = new Program(IDL as Idl, provider);
		} catch (error: any) {
			console.error('Failed to initialize program:', error);
			console.error('Error details:', {
				message: error?.message,
				wallet: wallet ? 'present' : 'missing',
				publicKey: wallet?.publicKey ? wallet.publicKey.toString() : 'missing'
			});
			throw error;
		}
	}

	/**
	 * Get the PDA for a user account
	 */
	getUserAccountPDA(userPublicKey: PublicKey): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('user'), userPublicKey.toBuffer()],
			getProgramId()
		);
	}

	/**
	 * Get the PDA for a position account
	 */
	getPositionPDA(userPublicKey: PublicKey, positionId: number): [PublicKey, number] {
		// Use DataView for browser compatibility (Buffer.writeBigUInt64LE not always available)
		const positionIdBuffer = new Uint8Array(8);
		const dataView = new DataView(positionIdBuffer.buffer, positionIdBuffer.byteOffset, 8);
		dataView.setBigUint64(0, BigInt(positionId), true); // true = little endian

		return PublicKey.findProgramAddressSync(
			[
				Buffer.from('position'),
				userPublicKey.toBuffer(),
				positionIdBuffer
			],
			getProgramId()
		);
	}

	/**
	 * Get the PDA for the program config
	 */
	getConfigPDA(): [PublicKey, number] {
		return PublicKey.findProgramAddressSync(
			[Buffer.from('config')],
			getProgramId()
		);
	}

	/**
	 * Check if user account exists
	 */
	async checkUserAccount(userPublicKey: PublicKey): Promise<boolean> {
		try {
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const accountInfo = await this.connection.getAccountInfo(userAccountPDA);
			return accountInfo !== null;
		} catch (error) {
			console.error('Error checking user account:', error);
			return false;
		}
	}

	/**
	 * Get user account data
	 */
	async getUserAccount(userPublicKey: PublicKey): Promise<UserAccount | null> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const account = await (this.program.account as any).userAccount.fetch(userAccountPDA);
			return account as UserAccount;
		} catch (error) {
			console.error('Error fetching user account:', error);
			return null;
		}
	}

	/**
	 * Initialize user account with mock USDC balance
	 * Requires a 0.1 SOL entry fee
	 */
	async initializeUserAccount(
		wallet: any,
		entryFee: number = 0.1
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [configPDA] = this.getConfigPDA();

			// Get config to find treasury
			const config = await (this.program.account as any).programConfig.fetch(configPDA);

			const entryFeeLamports = entryFee * LAMPORTS_PER_SOL;

			const tx = await this.program.methods
				.initializeAccount(new BN(entryFeeLamports))
				.accounts({
					userAccount: userAccountPDA,
					config: configPDA,
					user: userPublicKey,
					treasury: config.treasury,
					systemProgram: SystemProgram.programId,
				})
				.rpc();

			return tx;
		} catch (error) {
			console.error('Error initializing user account:', error);
			throw error;
		}
	}

	/**
	 * Buy YES shares
	 */
	async buyYes(
		wallet: any,
		marketId: string,
		amountUsdc: number,
		pricePerShare: number,
		stopLoss: number = 0,
		takeProfit: number = 0
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const session = this.getActiveSession(userPublicKey);

			// Get user account to get the next position ID
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				throw new Error('User account not initialized');
			}

			const positionId = userAccount.totalTrades.toNumber();
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places (USDC format)
			const amountUsdcBN = new BN(Math.floor(amountUsdc * 1_000_000));
			const pricePerShareBN = new BN(Math.floor(pricePerShare * 1_000_000));
			const stopLossBN = new BN(Math.floor(stopLoss * 1_000_000));
			const takeProfitBN = new BN(Math.floor(takeProfit * 1_000_000));

			const tx = await this.sendWithSession(
				'buyYes',
				[marketId, amountUsdcBN, pricePerShareBN, stopLossBN, takeProfitBN],
				{
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
				},
				userPublicKey,
				session
			);


			return tx;
		} catch (error) {
			console.error('Error buying YES:', error);
			throw error;
		}
	}

	/**
	 * Buy NO shares
	 */
	async buyNo(
		wallet: any,
		marketId: string,
		amountUsdc: number,
		pricePerShare: number,
		stopLoss: number = 0,
		takeProfit: number = 0
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const session = this.getActiveSession(userPublicKey);

			// Get user account to get the next position ID
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				throw new Error('User account not initialized');
			}

			const positionId = userAccount.totalTrades.toNumber();
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);

			// Convert to 6 decimal places (USDC format)
			const amountUsdcBN = new BN(Math.floor(amountUsdc * 1_000_000));
			const pricePerShareBN = new BN(Math.floor(pricePerShare * 1_000_000));
			const stopLossBN = new BN(Math.floor(stopLoss * 1_000_000));
			const takeProfitBN = new BN(Math.floor(takeProfit * 1_000_000));

			const tx = await this.sendWithSession(
				'buyNo',
				[marketId, amountUsdcBN, pricePerShareBN, stopLossBN, takeProfitBN],
				{
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
				},
				userPublicKey,
				session
			);


			return tx;
		} catch (error) {
			console.error('Error buying NO:', error);
			throw error;
		}
	}

	/**
	 * Sell YES shares from an existing position
	 */
	async sellYes(
		wallet: any,
		positionId: number,
		sharesToSell: number,
		currentPrice: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);
			const session = this.getActiveSession(userPublicKey);

			// Convert to 6 decimal places
			const sharesToSellBN = new BN(Math.floor(sharesToSell * 1_000_000));
			const currentPriceBN = new BN(Math.floor(currentPrice * 1_000_000));

			const tx = await this.sendWithSession(
				'sellYes',
				[sharesToSellBN, currentPriceBN],
				{
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
				},
				userPublicKey,
				session
			);


			return tx;
		} catch (error) {
			console.error('Error selling YES:', error);
			throw error;
		}
	}

	/**
	 * Sell NO shares from an existing position
	 */
	async sellNo(
		wallet: any,
		positionId: number,
		sharesToSell: number,
		currentPrice: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);
			const session = this.getActiveSession(userPublicKey);

			// Convert to 6 decimal places
			const sharesToSellBN = new BN(Math.floor(sharesToSell * 1_000_000));
			const currentPriceBN = new BN(Math.floor(currentPrice * 1_000_000));

			const tx = await this.sendWithSession(
				'sellNo',
				[sharesToSellBN, currentPriceBN],
				{
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
				},
				userPublicKey,
				session
			);


			return tx;
		} catch (error) {
			console.error('Error selling NO:', error);
			throw error;
		}
	}

	/**
	 * Sell shares from a position - automatically routes to sellYes or sellNo
	 */
	async sellShares(
		wallet: any,
		positionId: number,
		sharesToSell: number,
		currentPrice: number,
		predictionType: 'Yes' | 'No'
	): Promise<string> {
		if (predictionType === 'Yes') {
			return this.sellYes(wallet, positionId, sharesToSell, currentPrice);
		} else {
			return this.sellNo(wallet, positionId, sharesToSell, currentPrice);
		}
	}

	/**
	 * Get all positions for a user
	 */
	async getUserPositions(userPublicKey: PublicKey): Promise<PredictionPosition[]> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			// Get user account to know how many positions
			const userAccount = await this.getUserAccount(userPublicKey);
			if (!userAccount) {
				return [];
			}

			const totalTrades = userAccount.totalTrades.toNumber();
			const positions: PredictionPosition[] = [];

			// Fetch each position
			for (let i = 0; i < totalTrades; i++) {
				try {
					const [positionPDA] = this.getPositionPDA(userPublicKey, i);
					const position = await this.program.account.predictionPosition.fetch(positionPDA);
					positions.push(position as PredictionPosition);
				} catch (error) {
					console.error(`Error fetching position ${i}:`, error);
				}
			}

			return positions;
		} catch (error) {
			console.error('Error fetching user positions:', error);
			return [];
		}
	}

	/**
	 * Close a position
	 */
	async closePosition(
		wallet: any,
		positionId: number,
		currentPrice: number
	): Promise<string> {
		try {
			if (!this.program) {
				throw new Error('Program not initialized');
			}

			const userPublicKey = wallet.publicKey;
			const [userAccountPDA] = this.getUserAccountPDA(userPublicKey);
			const [positionPDA] = this.getPositionPDA(userPublicKey, positionId);
			const session = this.getActiveSession(userPublicKey);

			// Convert to 6 decimal places
			const currentPriceBN = new BN(Math.floor(currentPrice * 1_000_000));

			const tx = await this.sendWithSession(
				'closePosition',
				[currentPriceBN],
				{
					userAccount: userAccountPDA,
					positionAccount: positionPDA,
				},
				userPublicKey,
				session
			);

			return tx;
		} catch (error) {
			console.error('Error closing position:', error);
			throw error;
		}
	}
	/**
	 * Get all user accounts from the blockchain
	 */
	async getAllUserAccounts(): Promise<Array<{ publicKey: PublicKey; account: UserAccount }>> {
		try {
			if (!this.program) {
				// Initialize without wallet for read-only operations
				const provider = new AnchorProvider(
					this.connection,
					{} as any,
					{ commitment: 'confirmed' }
				);
				this.program = new Program(IDL as Idl, provider);
			}

			// Get all UserAccount accounts from the program
			const accounts = await this.connection.getProgramAccounts(getProgramId(), {
				filters: [
					{
						memcmp: {
							offset: 0,
							bytes: Buffer.from([164, 158, 127, 176, 241, 194, 98, 247]).toString('base64'), // UserAccount discriminator
						},
					},
				],
			});

			const userAccounts: Array<{ publicKey: PublicKey; account: UserAccount }> = [];

			for (const { pubkey, account } of accounts) {
				try {
					const decoded = this.program.coder.accounts.decode('UserAccount', account.data);
					userAccounts.push({
						publicKey: pubkey,
						account: decoded as UserAccount,
					});
				} catch (error) {
					console.error('Error decoding user account:', error);
				}
			}

			return userAccounts;
		} catch (error) {
			console.error('Error fetching all user accounts:', error);
			return [];
		}
	}
}

// Export singleton instance
export const polymarketService = new PolymarketService();