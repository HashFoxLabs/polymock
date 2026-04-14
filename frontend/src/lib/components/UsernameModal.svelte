<script lang="ts">
	export let walletAddress: string;
	export let onComplete: (username: string) => void;

	let username = '';
	let error = '';
	let checking = false;
	let saving = false;

	async function handleSubmit() {
		error = '';
		const trimmed = username.trim().toLowerCase();

		if (trimmed.length < 3) {
			error = 'Username must be at least 3 characters';
			return;
		}
		if (trimmed.length > 20) {
			error = 'Username must be 20 characters or less';
			return;
		}
		if (!/^[a-z0-9_]+$/.test(trimmed)) {
			error = 'Only lowercase letters, numbers, and underscores';
			return;
		}

		// Check availability
		checking = true;
		const checkRes = await fetch(`/api/users?username=${encodeURIComponent(trimmed)}`);
		const checkData = await checkRes.json();
		checking = false;

		if (checkData.taken) {
			error = 'Username already taken';
			return;
		}

		// Save via server-side API (bypasses Supabase RLS)
		saving = true;
		const saveRes = await fetch('/api/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ wallet_address: walletAddress, username: trimmed })
		});
		const saveData = await saveRes.json();
		saving = false;

		if (!saveRes.ok) {
			error = saveData.error || 'Failed to save username';
			return;
		}

		onComplete(trimmed);
	}
</script>

<div class="modal-overlay">
	<div class="modal-box">
		<h2>Set your username</h2>
		<p class="subtitle">This is required to use Polymock. Choose wisely — it's permanent.</p>

		<form on:submit|preventDefault={handleSubmit}>
			<div class="input-wrapper">
				<span class="prefix">@</span>
				<input
					type="text"
					bind:value={username}
					placeholder="username"
					maxlength="20"
					autofocus
					disabled={saving}
				/>
			</div>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button type="submit" class="submit-btn" disabled={saving || checking || username.trim().length < 3}>
				{#if saving}
					Saving...
				{:else if checking}
					Checking...
				{:else}
					Continue
				{/if}
			</button>
		</form>

		<p class="wallet-info">Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		backdrop-filter: blur(4px);
	}

	.modal-box {
		background: #111;
		border: 1px solid #333;
		border-radius: 12px;
		padding: 32px;
		width: 400px;
		max-width: 90vw;
	}

	h2 {
		margin: 0 0 4px 0;
		font-size: 20px;
		color: #fff;
	}

	.subtitle {
		margin: 0 0 20px 0;
		color: #888;
		font-size: 13px;
	}

	.input-wrapper {
		display: flex;
		align-items: center;
		background: #000;
		border: 1px solid #333;
		border-radius: 8px;
		overflow: hidden;
	}

	.prefix {
		padding: 0 0 0 12px;
		color: #666;
		font-size: 16px;
		font-weight: 600;
	}

	input {
		flex: 1;
		background: transparent;
		border: none;
		color: #fff;
		padding: 12px 12px 12px 4px;
		font-size: 16px;
		outline: none;
	}

	input::placeholder {
		color: #555;
	}

	.error {
		color: #ff4444;
		font-size: 13px;
		margin: 8px 0 0 0;
	}

	.submit-btn {
		width: 100%;
		margin-top: 16px;
		padding: 12px;
		background: #F97316;
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.wallet-info {
		margin: 16px 0 0 0;
		color: #555;
		font-size: 12px;
		text-align: center;
		font-family: 'SF Mono', Consolas, monospace;
	}
</style>
