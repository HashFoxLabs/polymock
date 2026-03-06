import { Buffer } from 'buffer';
import {
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	TransactionInstruction,
	SystemProgram,
} from '@solana/web3.js';
import BN from 'bn.js';
import { PUBLIC_SOLANA_PROGRAM_ID, PUBLIC_SOLANA_RPC_ENDPOINT } from '$env/static/public';

// Session Keys program deployed by MagicBlock
export const SESSION_KEYS_PROGRAM_ID = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');

const SEED_PREFIX = 'session_token';
const SESSION_STORAGE_KEY = 'polymock_session';

const RPC_ENDPOINT = 'https://api.devnet.solana.com';

interface StoredSession {
	secretKey: number[]; // Uint8Array as number array for JSON
	sessionTokenPDA: string;
	authority: string;
	validUntil: number; // unix timestamp in seconds
	createdAt: number;
}

function getTargetProgramId(): PublicKey {
	return new PublicKey(PUBLIC_SOLANA_PROGRAM_ID);
}

/**
 * Derive the SessionToken PDA
 */
function deriveSessionTokenPDA(
	targetProgram: PublicKey,
	sessionSigner: PublicKey,
	authority: PublicKey
): [PublicKey, number] {
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from(SEED_PREFIX),
			targetProgram.toBuffer(),
			sessionSigner.toBuffer(),
			authority.toBuffer(),
		],
		SESSION_KEYS_PROGRAM_ID
	);
}

/**
 * Build the create_session instruction manually
 * (avoids needing the full session-keys IDL as a dependency)
 */
function buildCreateSessionInstruction(
	authority: PublicKey,
	sessionSigner: PublicKey,
	sessionToken: PublicKey,
	targetProgram: PublicKey,
	topUp: boolean,
	validUntil: BN,
	lamports: BN
): TransactionInstruction {
	// create_session discriminator: SHA256("global:create_session")[0..8]
	const discriminator = Buffer.from([
		0xf2, 0xc1, 0x8f, 0xb3, 0x96, 0x19, 0x7a, 0xe3,
	]);

	// Encode args: Option<bool> + Option<i64> + Option<u64>
	// Option encoding: 0x00 = None, 0x01 + value = Some
	const parts: number[] = [];

	// Option<bool> top_up — Some(true/false)
	parts.push(1); // Some tag
	parts.push(topUp ? 1 : 0);

	// Option<i64> valid_until — Some(timestamp)
	parts.push(1); // Some tag
	const validBuf = new Uint8Array(8);
	const validView = new DataView(validBuf.buffer);
	validView.setBigInt64(0, BigInt(validUntil.toString()), true);
	parts.push(...validBuf);

	// Option<u64> lamports — Some(amount)
	parts.push(1); // Some tag
	const lampBuf = new Uint8Array(8);
	const lampView = new DataView(lampBuf.buffer);
	lampView.setBigUint64(0, BigInt(lamports.toString()), true);
	parts.push(...lampBuf);

	const argsBuffer = new Uint8Array(parts);
	const data = Buffer.concat([discriminator, Buffer.from(argsBuffer)]);

	// Account order matches CreateSessionToken struct:
	// session_token, session_signer, authority, target_program, system_program
	const keys = [
		{ pubkey: sessionToken, isSigner: false, isWritable: true },
		{ pubkey: sessionSigner, isSigner: true, isWritable: true },
		{ pubkey: authority, isSigner: true, isWritable: true },
		{ pubkey: targetProgram, isSigner: false, isWritable: false },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({
		keys,
		programId: SESSION_KEYS_PROGRAM_ID,
		data,
	});
}

/**
 * Build the revoke_session instruction manually
 */
function buildRevokeSessionInstruction(
	authority: PublicKey,
	sessionToken: PublicKey
): TransactionInstruction {
	// revoke_session discriminator: SHA256("global:revoke_session")[0..8]
	const discriminator = Buffer.from([
		0x56, 0x5c, 0xc6, 0x78, 0x90, 0x02, 0x07, 0xc2,
	]);

	const keys = [
		{ pubkey: sessionToken, isSigner: false, isWritable: true },
		{ pubkey: authority, isSigner: true, isWritable: true },
		{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
	];

	return new TransactionInstruction({
		keys,
		programId: SESSION_KEYS_PROGRAM_ID,
		data: discriminator,
	});
}

export class SessionKeyManager {
	private connection: Connection;

	constructor() {
		this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
	}

	/**
	 * Create a new session — user signs once, then subsequent trades auto-sign
	 * @param wallet - The user's connected wallet adapter
	 * @param expiryMinutes - Session duration in minutes (default 24 hours)
	 * @returns The session token PDA and session keypair
	 */
	async createSession(
		wallet: any,
		expiryMinutes: number = 60 * 24
	): Promise<{ sessionTokenPDA: PublicKey; sessionKeypair: Keypair }> {
		if (!wallet || !wallet.publicKey) {
			throw new Error('Wallet not connected');
		}

		const authority = wallet.publicKey;
		const targetProgram = getTargetProgramId();

		// Generate ephemeral keypair
		const sessionKeypair = Keypair.generate();

		// Derive PDA
		const [sessionTokenPDA] = deriveSessionTokenPDA(
			targetProgram,
			sessionKeypair.publicKey,
			authority
		);

		// Calculate validity: current time + expiry
		const validUntil = new BN(
			Math.floor(Date.now() / 1000) + expiryMinutes * 60
		);

		// Top up the session signer with 0.05 SOL for tx fees + position account rent
		const topUpLamports = new BN(50_000_000); // 0.05 SOL

		// Build instruction
		const ix = buildCreateSessionInstruction(
			authority,
			sessionKeypair.publicKey,
			sessionTokenPDA,
			targetProgram,
			true, // topUp session signer with SOL for fees
			validUntil,
			topUpLamports
		);

		const tx = new Transaction().add(ix);
		tx.feePayer = authority;
		const { blockhash } = await this.connection.getLatestBlockhash();
		tx.recentBlockhash = blockhash;

		// Session keypair must co-sign
		tx.partialSign(sessionKeypair);

		// Wallet signs (this is the ONE popup the user sees)
		const signed = await wallet.signTransaction(tx);
		const sig = await this.connection.sendRawTransaction(signed.serialize());
		await this.connection.confirmTransaction(sig, 'confirmed');

		console.log('Session created:', sig);

		// Persist to localStorage
		this.storeSession({
			secretKey: Array.from(sessionKeypair.secretKey),
			sessionTokenPDA: sessionTokenPDA.toBase58(),
			authority: authority.toBase58(),
			validUntil: validUntil.toNumber(),
			createdAt: Math.floor(Date.now() / 1000),
		});

		return { sessionTokenPDA, sessionKeypair };
	}

	/**
	 * Get the stored session keypair (if session is active)
	 */
	getSessionKeypair(): Keypair | null {
		const session = this.loadSession();
		if (!session) return null;
		if (this.isExpired(session)) {
			this.clearSession();
			return null;
		}
		return Keypair.fromSecretKey(new Uint8Array(session.secretKey));
	}

	/**
	 * Get the session token PDA (if session is active)
	 */
	getSessionTokenPDA(): PublicKey | null {
		const session = this.loadSession();
		if (!session) return null;
		if (this.isExpired(session)) {
			this.clearSession();
			return null;
		}
		return new PublicKey(session.sessionTokenPDA);
	}

	/**
	 * Check if there's an active (non-expired) session
	 */
	isSessionActive(): boolean {
		const session = this.loadSession();
		if (!session) return false;
		if (this.isExpired(session)) {
			this.clearSession();
			return false;
		}
		return true;
	}

	/**
	 * Check if the session belongs to the given wallet
	 */
	isSessionForWallet(walletPubkey: PublicKey): boolean {
		const session = this.loadSession();
		if (!session) return false;
		return session.authority === walletPubkey.toBase58();
	}

	/**
	 * Get remaining session time in seconds
	 */
	getSessionTimeRemaining(): number {
		const session = this.loadSession();
		if (!session) return 0;
		const remaining = session.validUntil - Math.floor(Date.now() / 1000);
		return Math.max(0, remaining);
	}

	/**
	 * Revoke the session on-chain and clear local storage
	 */
	async revokeSession(wallet: any): Promise<void> {
		const session = this.loadSession();
		if (!session) return;

		try {
			const authority = wallet.publicKey;
			const sessionTokenPDA = new PublicKey(session.sessionTokenPDA);

			const ix = buildRevokeSessionInstruction(authority, sessionTokenPDA);

			const tx = new Transaction().add(ix);
			tx.feePayer = authority;
			const { blockhash } = await this.connection.getLatestBlockhash();
			tx.recentBlockhash = blockhash;

			const signed = await wallet.signTransaction(tx);
			const sig = await this.connection.sendRawTransaction(signed.serialize());
			await this.connection.confirmTransaction(sig, 'confirmed');

			console.log('Session revoked:', sig);
		} catch (error) {
			console.error('Failed to revoke session on-chain:', error);
		}

		this.clearSession();
	}

	/**
	 * Clear session from local storage only (no on-chain revoke)
	 */
	clearSession(): void {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(SESSION_STORAGE_KEY);
		}
	}

	private isExpired(session: StoredSession): boolean {
		return Math.floor(Date.now() / 1000) >= session.validUntil;
	}

	private storeSession(session: StoredSession): void {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
		}
	}

	private loadSession(): StoredSession | null {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(SESSION_STORAGE_KEY);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as StoredSession;
		} catch {
			return null;
		}
	}
}

// Singleton
export const sessionKeyManager = new SessionKeyManager();
