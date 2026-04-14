import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	sendAndConfirmTransaction,
	LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { env } from '$env/dynamic/private';

// Simple in-memory rate limit: 1 airdrop per address per hour
const recentAirdrops = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const AIRDROP_AMOUNT_SOL = 1;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { address } = await request.json();

		if (!address || typeof address !== 'string') {
			return json({ error: 'Missing address' }, { status: 400 });
		}

		// Validate it's a real public key
		let pubkey: PublicKey;
		try {
			pubkey = new PublicKey(address);
		} catch {
			return json({ error: 'Invalid Solana address' }, { status: 400 });
		}

		// Rate limit
		const last = recentAirdrops.get(address);
		if (last && Date.now() - last < COOLDOWN_MS) {
			const waitMins = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60000);
			return json({ error: `Already airdropped to this address. Try again in ${waitMins} min.` }, { status: 429 });
		}

		// Load treasury keypair from env
		const secretB64 = env.TREASURY_SECRET_KEY;
		if (!secretB64) {
			return json({ error: 'Treasury not configured' }, { status: 500 });
		}

		const secretBytes = Buffer.from(secretB64, 'base64');
		const treasury = Keypair.fromSecretKey(secretBytes);

		const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

		// Check treasury has enough SOL
		const treasuryBalance = await conn.getBalance(treasury.publicKey);
		const needed = AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL + 5000; // + fee
		if (treasuryBalance < needed) {
			return json({ error: 'Treasury low on funds. Contact the team.' }, { status: 503 });
		}

		// Send SOL from treasury to user
		const tx = new Transaction().add(
			SystemProgram.transfer({
				fromPubkey: treasury.publicKey,
				toPubkey: pubkey,
				lamports: AIRDROP_AMOUNT_SOL * LAMPORTS_PER_SOL
			})
		);

		const sig = await sendAndConfirmTransaction(conn, tx, [treasury]);

		recentAirdrops.set(address, Date.now());

		return json({ success: true, signature: sig, amount: AIRDROP_AMOUNT_SOL });
	} catch (err: any) {
		console.error('[Airdrop API] Error:', err);
		return json({ error: err.message || 'Airdrop failed' }, { status: 500 });
	}
};
