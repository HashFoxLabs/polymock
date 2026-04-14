import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

// GET /api/users?username=foo  — check if username is taken
export const GET: RequestHandler = async ({ url }) => {
	const username = url.searchParams.get('username');
	if (!username) return json({ error: 'Missing username' }, { status: 400 });

	const { data } = await supabaseAdmin
		.from('users')
		.select('id')
		.eq('username', username)
		.maybeSingle();

	return json({ taken: !!data });
};

// POST /api/users  — upsert wallet address + username (bypasses RLS via service role)
export const POST: RequestHandler = async ({ request }) => {
	const { wallet_address, username } = await request.json();

	if (!wallet_address || !username) {
		return json({ error: 'Missing wallet_address or username' }, { status: 400 });
	}

	if (!/^[a-z0-9_]+$/.test(username)) {
		return json({ error: 'Invalid username format' }, { status: 400 });
	}

	// Check uniqueness first
	const { data: existing } = await supabaseAdmin
		.from('users')
		.select('id')
		.eq('username', username)
		.maybeSingle();

	if (existing) {
		return json({ error: 'Username already taken' }, { status: 409 });
	}

	const { error } = await supabaseAdmin
		.from('users')
		.upsert({ wallet_address, username }, { onConflict: 'wallet_address' });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};

// PATCH /api/users  — update avatar_url / banner_url (bypasses RLS via service role)
export const PATCH: RequestHandler = async ({ request }) => {
	const { wallet_address, avatar_url, banner_url } = await request.json();

	if (!wallet_address) {
		return json({ error: 'Missing wallet_address' }, { status: 400 });
	}

	const updates: Record<string, string> = {};
	if (avatar_url !== undefined) updates.avatar_url = avatar_url;
	if (banner_url !== undefined) updates.banner_url = banner_url;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Nothing to update' }, { status: 400 });
	}

	const { error } = await supabaseAdmin
		.from('users')
		.update(updates)
		.eq('wallet_address', wallet_address);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
