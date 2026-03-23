<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// Props
	let {
		dataSource,
		useTimePeriod,
		timestampStartStr,
		timestampEndStr,
		filterTitleSearch,
		filterCategories,
		filterVolumeInf,
		filterVolumeSup,
		selectedMarkets = [],
		onEditConfig,
		onRunBacktest,
	}: {
		dataSource: 'synthesis' | 'parquet';
		useTimePeriod: boolean;
		timestampStartStr: string;
		timestampEndStr: string;
		filterTitleSearch: string;
		filterCategories: Set<string>;
		filterVolumeInf: number | null;
		filterVolumeSup: number | null;
		selectedMarkets?: any[];
		onEditConfig: () => void;
		onRunBacktest: (strategyCode: string, strategyType: string | null, strategyParams?: Record<string, unknown>) => void | Promise<void>;
	} = $props();

	// Strategy execution params (configurable via terminal)
	let initialCash = $state(10000);
	let reimburseOpenPositions = $state(false);
	let priceInf: number | null = $state(null);
	let priceSup: number | null = $state(null);

	// Strategy-specific params
	let thresholdLow = $state(0.30);
	let amount = $state(10);

	// Exit rules
	let stopLoss: number | null = $state(null);      // e.g. 0.20 = 20%
	let takeProfit: number | null = $state(null);     // e.g. 0.50 = 50%
	let trailingStop: number | null = $state(null);   // e.g. 0.10 = 10%
	let maxHoldHours: number | null = $state(null);   // e.g. 168 = 7 days

	/** Parse a number that may use comma as decimal separator */
	function parseNum(s: string): number {
		return parseFloat(s.replace(',', '.'));
	}

	// Terminal color constants
	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m'; // green
	const R = '\x1b[0m'; // reset
	const DIM = '\x1b[90m'; // dim/gray

	let selectedStrategy: number | null = $state(null);

	// Strategies matching the real backtest_engine Python strategies
	const strategies = [
		{
			id: 'mean_reversion',
			name: 'Mean Reversion',
			description: 'Buy when price drops very low, betting on reversion to the mean.',
			logic: 'If price ≤ threshold → BUY position, else HOLD',
			uses: ['trade.price', 'trade.position'],
			tags: ['simple', 'price-based'],
			code: `def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    amount = 10
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
    else:
        market_id = trade.get("market_id")
        position = "hold"
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_portfolio_cash',
			name: 'Cash-Weighted',
			description: 'Size positions dynamically using 1% of available cash instead of fixed amounts.',
			logic: 'If price ≤ threshold → BUY with floor(cash/100) shares',
			uses: ['trade.price', 'portfolio.cash'],
			tags: ['dynamic sizing', 'portfolio-aware'],
			code: `def mean_reversion_with_portfolio_cash(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        import math
        amount = math.floor(int(portfolio["cash"])/100)
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_portfolio_positions',
			name: 'No Duplicates',
			description: 'Skip markets where you already hold a position. Diversifies across markets.',
			logic: 'If price ≤ threshold AND not already holding → BUY, else HOLD',
			uses: ['trade.price', 'portfolio.positions'],
			tags: ['diversification', 'portfolio-aware'],
			code: `def mean_reversion_with_portfolio_positions(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        if (market_id, position) in portfolio["positions"]:
            position = "hold"
            amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_trade_log',
			name: 'Better Price',
			description: 'Only buy if the current price is lower than the minimum price you previously paid.',
			logic: 'If price ≤ threshold AND price < min(past prices) → BUY',
			uses: ['trade.price', 'trade_log'],
			tags: ['price improvement', 'trade-log'],
			code: `def mean_reversion_with_trade_log(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [t for t in trade_log if t["market_id"] == market_id and t["position"] == position]
        if len(trades_on_market) > 0:
            min_price = min(int(t["cost"])/int(t["amount"]) for t in trades_on_market)
            if trade.get("price") < min_price:
                amount = 10
            else:
                position = "hold"
                amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_trade_log_time',
			name: 'Cooldown',
			description: 'Enforce a 1-day cooldown between trades on the same market/position.',
			logic: 'If price ≤ threshold AND >1 day since last trade on same market → BUY',
			uses: ['trade.price', 'trade.timestamp', 'trade_log'],
			tags: ['time-based', 'rate-limiting'],
			code: `def mean_reversion_with_trade_log_time(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        trades_on_market = [t for t in trade_log if t["market_id"] == market_id and t["position"] == position]
        if len(trades_on_market) > 0:
            from datetime import timedelta
            latest = max(t["time"] for t in trades_on_market)
            if trade.get("timestamp") - latest > timedelta(days=1):
                amount = 10
            else:
                position = "hold"
                amount = 0
        else:
            amount = 10
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount}`,
		},
		{
			id: 'mean_reversion_with_user_perso_parameter_internal',
			name: 'Scaled by Exposure',
			description: 'Amount scales with how many trades you\'ve made on a market (up to 100). More confidence = bigger position.',
			logic: 'If price ≤ threshold → BUY min(100, trade_count_on_market) shares',
			uses: ['trade.price', 'user_perso_parameters'],
			tags: ['adaptive', 'custom-state'],
			code: `def mean_reversion_with_user_perso_parameter_internal(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    if "trade_count" not in user_perso_parameters:
        user_perso_parameters["trade_count"] = {}
    if trade.get("market_id") not in user_perso_parameters["trade_count"]:
        user_perso_parameters["trade_count"][trade.get("market_id")] = 0
    user_perso_parameters["trade_count"][trade.get("market_id")] += 1
    if trade.get("price") <= threshold_low:
        market_id = trade.get("market_id")
        position = trade.get("position")
        amount = min(100, user_perso_parameters["trade_count"][market_id])
    else:
        market_id = trade.get("market_id")
        position = "hold"
        amount = 0
    return {"market_id": market_id, "position": position, "amount": amount, "user_perso_parameters": user_perso_parameters}`,
		},
	];

	function selectStrategy(idx: number) {
		selectedStrategy = idx;
		if (termInstance) {
			termInstance.clear();
			const s = strategies[idx];
			termInstance.writeln(`${G}✓ Strategy selected: ${s.name}${R}`);
			termInstance.writeln(`  ${s.description}`);
			termInstance.writeln('');
			showCode(termInstance);
			termInstance.writeln('');
			showParams(termInstance);
			termInstance.writeln('');
			termInstance.writeln(`  ${DIM}Configure params with ${O}set${R}${DIM} commands, or:${R}`);
			termInstance.writeln('');
			termInstance.writeln(`  ${O}>>> Type ${G}run${R}${O} to launch the backtest <<<${R}`);
			termPrompt(termInstance);
		}
	}

	// Terminal state
	let termContainer: HTMLDivElement;
	let termInitialized = $state(false);
	let termInstance: any = $state(null);
	let inputLine = '';

	function showParams(term: any) {
		term.writeln(`${O}━━━ Parameters ━━━${R}`);
		term.writeln(`  ${G}cash${R}         $${initialCash.toLocaleString()}        ${DIM}set cash <amount>${R}`);
		term.writeln(`  ${G}reimburse${R}    ${reimburseOpenPositions ? 'on' : 'off'}                 ${DIM}set reimburse on/off${R}`);
		term.writeln(`  ${G}price${R}        ${priceInf ?? '0'} → ${priceSup ?? '1'}            ${DIM}set price <min> <max>${R}`);
		term.writeln(`${O}━━━ Strategy Params ━━━${R}`);
		term.writeln(`  ${G}threshold${R}    ${thresholdLow}              ${DIM}set threshold <value>${R}`);
		term.writeln(`  ${G}amount${R}       ${amount}                 ${DIM}set amount <shares>${R}`);
		term.writeln(`${O}━━━ Exit Rules ━━━${R}`);
		term.writeln(`  ${G}stoploss${R}     ${stopLoss != null ? (stopLoss * 100).toFixed(0) + '%' : 'off'}              ${DIM}set stoploss <% or off>${R}`);
		term.writeln(`  ${G}takeprofit${R}   ${takeProfit != null ? (takeProfit * 100).toFixed(0) + '%' : 'off'}              ${DIM}set takeprofit <% or off>${R}`);
		term.writeln(`  ${G}trailing${R}     ${trailingStop != null ? (trailingStop * 100).toFixed(0) + '%' : 'off'}              ${DIM}set trailing <% or off>${R}`);
		term.writeln(`  ${G}maxhold${R}      ${maxHoldHours != null ? maxHoldHours + 'h' : 'off'}              ${DIM}set maxhold <hours or off>${R}`);
		term.writeln(`${O}━━━━━━━━━━━━━━━━━━━${R}`);
	}

	function showCode(term: any) {
		if (selectedStrategy === null) return;
		const s = strategies[selectedStrategy];
		term.writeln(`${O}━━━ ${s.name} — Python Code ━━━${R}`);
		term.writeln('');
		// Show the code with dynamic param values injected
		const code = s.code
			.replace(/threshold_low = [\d.]+/, `threshold_low = ${priceInf ?? 0.01}`)
			.replace(/amount = 10(?!\d)/, `amount = ${Math.floor(initialCash * 0.01) || 10}`);
		for (const line of code.split('\n')) {
			term.writeln(`  ${G}${line}${R}`);
		}
		term.writeln('');
		term.writeln(`${DIM}Config: cash=${O}$${initialCash.toLocaleString()}${R}${DIM}, reimburse=${O}${reimburseOpenPositions ? 'on' : 'off'}${R}${DIM}, price_filter=${O}${priceInf ?? '0'}→${priceSup ?? '1'}${R}`);
		term.writeln(`${O}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}`);
	}

	function termPrompt(term: any) {
		term.write(`\r\n${O}❯${R} `);
		term.scrollToBottom();
	}

	function handleInput(term: any, input: string) {
		const trimmed = input.trim().toLowerCase();

		if (trimmed === 'run') {
			if (selectedStrategy === null) {
				term.writeln(`${O}Select a strategy first by clicking one above.${R}`);
				termPrompt(term);
				return;
			}
			const s = strategies[selectedStrategy];
			term.writeln('');
			term.writeln(`${G}━━━ Running: ${s.name} ━━━${R}`);
			term.writeln(`${DIM}cash=$${initialCash.toLocaleString()}, reimburse=${reimburseOpenPositions ? 'yes' : 'no'}, price=${priceInf ?? '0'}→${priceSup ?? '1'}${R}`);
			term.writeln(`${O}Starting backtest...${R}`);
			onRunBacktest(s.code, s.id, {
				initialCash,
				reimburseOpenPositions,
				priceInf,
				priceSup,
			});
			return;
		}
		if (trimmed === 'params') {
			term.writeln('');
			showParams(term);
			termPrompt(term);
			return;
		}
		if (trimmed === 'clear') {
			term.clear();
			termPrompt(term);
			return;
		}
		if (trimmed === 'code') {
			if (selectedStrategy !== null) {
				term.writeln('');
				showCode(term);
			} else {
				term.writeln(`${O}Select a strategy first.${R}`);
			}
			termPrompt(term);
			return;
		}
		if (trimmed.startsWith('set ')) {
			const parts = input.trim().substring(4).trim().split(/\s+/);
			const key = parts[0].toLowerCase();
			let valid = true;
			if (key === 'cash' && parts[1]) {
				const val = parseNum(parts[1]);
				if (!isNaN(val) && val > 0) {
					initialCash = val;
				} else {
					term.writeln(`${O}Invalid. Use: set cash 10000${R}`);
					valid = false;
				}
			} else if (key === 'reimburse') {
				reimburseOpenPositions = parts[1]?.toLowerCase() === 'on' || parts[1]?.toLowerCase() === 'true' || parts[1]?.toLowerCase() === 'yes';
			} else if (key === 'price') {
				const min = parts[1] ? parseNum(parts[1]) : null;
				const max = parts[2] ? parseNum(parts[2]) : null;
				priceInf = min !== null && !isNaN(min) ? min : null;
				priceSup = max !== null && !isNaN(max) ? max : null;
			} else {
				term.writeln(`${O}Unknown param. Options: cash, reimburse, price${R}`);
				valid = false;
			}
			if (valid) {
				term.writeln(`${G}✓ Updated${R}`);
				term.writeln('');
				if (selectedStrategy !== null) showCode(term);
				term.writeln('');
				showParams(term);
			}
			termPrompt(term);
			return;
		}

		if (trimmed === 'help') {
			term.writeln('');
			term.writeln(`  ${O}run${R}                    — Run backtest with selected strategy`);
			term.writeln(`  ${O}params${R}                 — Show current parameters`);
			term.writeln(`  ${O}code${R}                   — Show strategy code with current params`);
			term.writeln(`  ${O}set cash <n>${R}           — Set initial bankroll`);
			term.writeln(`  ${O}set reimburse on/off${R}   — Toggle end-of-backtest reimbursement`);
			term.writeln(`  ${O}set price <min> <max>${R}  — Price range filter (supports 0,2 or 0.2)`);
			term.writeln(`  ${O}clear${R}                  — Clear terminal`);
			termPrompt(term);
			return;
		}

		termPrompt(term);
	}

	async function initTerm() {
		if (termInitialized || !termContainer) return;
		termInitialized = true;

		const { Terminal } = await import('@xterm/xterm');
		const { FitAddon } = await import('@xterm/addon-fit');
		await import('@xterm/xterm/css/xterm.css');

		const term = new Terminal({
			theme: {
				background: '#000000',
				foreground: '#ffffff',
				cursor: '#f97316',
				cursorAccent: '#000000',
				selectionBackground: 'rgba(249, 115, 22, 0.3)',
			},
			fontSize: 13,
			cursorBlink: true,
			cursorStyle: 'block',
			scrollback: 1000,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.open(termContainer);
		fitAddon.fit();
		termInstance = term;

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(termContainer);

		await new Promise(r => setTimeout(r, 150));
		fitAddon.fit();

		term.writeln(`${O}━━━ STRATEGY & PARAMETERS ━━━${R}`);
		term.writeln('');
		term.writeln(`Select a strategy above, then configure parameters below.`);
		term.writeln('');
		showParams(term);
		term.writeln('');
		term.writeln(`${DIM}Commands: ${O}run${R}${DIM}, ${O}params${R}${DIM}, ${O}code${R}${DIM}, ${O}set cash/reimburse/price${R}${DIM}, ${O}help${R}${DIM}, ${O}clear${R}`);
		termPrompt(term);

		term.onData((data: string) => {
			const code = data.charCodeAt(0);
			if (data === '\r') {
				term.write('\r\n');
				handleInput(term, inputLine);
				inputLine = '';
			} else if (data === '\x7f') {
				if (inputLine.length > 0) {
					inputLine = inputLine.slice(0, -1);
					term.write('\b \b');
				}
			} else if (code >= 32) {
				inputLine += data;
				term.write(data);
			}
		});
	}

	$effect(() => {
		if (browser && termContainer) {
			if (termInstance && !termContainer.querySelector('.xterm')) {
				termInstance = null;
				termInitialized = false;
			}
			setTimeout(() => initTerm(), 100);
		}
	});

	onDestroy(() => {
		if (termInstance) {
			termInstance.dispose();
			termInstance = null;
			termInitialized = false;
		}
	});
</script>

<div class="strategy-page">
	<!-- TOP: Dataset summary bar -->
	<div class="data-bar">
		<div class="data-header">
			<span class="data-title">
				<span class="cbl">DATASET</span>
				<span class="data-tag"><span class="dtl">SOURCE</span> {dataSource === 'synthesis' ? 'Synthesis API' : 'Parquet'}</span>
				<span class="data-tag"><span class="dtl">MARKETS</span> {selectedMarkets.length}</span>
				<span class="data-tag"><span class="dtl">PLATFORM</span> Polymarket</span>
				<span class="data-tag"><span class="dtl">TIME</span> {useTimePeriod ? `${timestampStartStr} → ${timestampEndStr}` : 'All time'}</span>
				{#if filterCategories.size > 0}<span class="data-tag"><span class="dtl">CATEGORY</span> {Array.from(filterCategories).join(', ')}</span>{/if}
			</span>
			<span class="edit-btn" role="button" tabindex="0" onclick={() => onEditConfig()} onkeydown={(e) => { if (e.key === 'Enter') onEditConfig(); }}>EDIT CONFIG</span>
		</div>
	</div>

	<!-- MIDDLE: Strategy cards -->
	<div class="strategies-section">
		<div class="strategies-label">SELECT STRATEGY</div>
		<div class="strategies-grid">
			{#each strategies as s, i}
				<button
					class="strategy-card"
					class:selected={selectedStrategy === i}
					onclick={() => selectStrategy(i)}
				>
					<div class="sc-header">
						<span class="sc-num">{i + 1}</span>
						<span class="sc-name">{s.name}</span>
						{#if selectedStrategy === i}
							<span class="sc-active">SELECTED</span>
						{/if}
					</div>
					<p class="sc-desc">{s.description}</p>
					<div class="sc-logic">
						<span class="sc-logic-label">LOGIC</span>
						<span class="sc-logic-text">{s.logic}</span>
					</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- BOTTOM: Params terminal -->
	<div class="term-wrapper" bind:this={termContainer}></div>
</div>

<style>
	.strategy-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #000;
	}

	/* ── Data Bar ── */
	.data-bar {
		flex-shrink: 0;
		border-bottom: 1px solid #222;
		background: #000;
	}
	.data-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 20px;
		background: #000;
		border: none;
		color: #eee;
		cursor: pointer;
		font-size: 13px;
	}
	.data-header:hover { background: #0a0a0a; }
	.data-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.cbl { color: #f97316; font-weight: 700; font-size: 11px; letter-spacing: 1px; }
	.data-tag {
		display: inline-flex; align-items: center; gap: 4px;
		font-family: monospace; font-size: 11px; color: #aaa;
		background: #111; padding: 2px 8px; border-radius: 3px; border: 1px solid #222;
	}
	.dtl { color: #f97316; font-weight: 700; font-size: 9px; letter-spacing: 0.5px; }
	.data-right { display: flex; align-items: center; gap: 12px; }
	.edit-btn {
		background: transparent; border: 1px solid #555; color: #ccc;
		padding: 4px 12px; font-family: monospace; font-size: 11px;
		cursor: pointer; border-radius: 3px; letter-spacing: 1px; font-weight: 600;
	}
	.edit-btn:hover { color: #f97316; border-color: #f97316; }

	/* ── Strategy Cards ── */
	.strategies-section {
		flex-shrink: 0;
		overflow-x: auto;
		overflow-y: hidden;
		border-bottom: 1px solid #f97316;
		background: #000;
		padding: 12px 16px 14px;
	}
	.strategies-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		color: #f97316;
		letter-spacing: 2px;
		margin-bottom: 10px;
		padding-left: 2px;
	}
	.strategies-grid {
		display: flex;
		gap: 10px;
		min-width: min-content;
	}
	.strategy-card {
		flex: 0 0 210px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px;
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 6px;
		color: #ccc;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}
	.strategy-card:hover {
		border-color: #f97316;
		background: #111;
	}
	.strategy-card.selected {
		border-color: #f97316;
		background: #1a0d00;
		box-shadow: 0 0 16px rgba(249, 115, 22, 0.2), inset 0 0 30px rgba(249, 115, 22, 0.03);
	}
	.sc-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sc-num {
		font-family: 'Share Tech Mono', monospace;
		font-size: 11px;
		font-weight: 700;
		color: #555;
		background: #1a1a1a;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.strategy-card:hover .sc-num { color: #f97316; background: #1a0d00; }
	.strategy-card.selected .sc-num { color: #000; background: #f97316; }
	.sc-name {
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		font-weight: 700;
		color: #fff;
		letter-spacing: 0.3px;
		flex: 1;
	}
	.strategy-card.selected .sc-name { color: #f97316; }
	.sc-active {
		font-size: 8px;
		font-weight: 700;
		color: #f97316;
		background: rgba(249, 115, 22, 0.2);
		padding: 2px 6px;
		border-radius: 3px;
		letter-spacing: 1px;
		flex-shrink: 0;
	}
	.sc-desc {
		font-size: 12px;
		color: #bbb;
		line-height: 1.5;
		margin: 0;
	}
	.strategy-card.selected .sc-desc { color: #ddd; }
	.sc-logic {
		font-size: 11px;
		font-family: monospace;
		background: #050505;
		padding: 8px 10px;
		border-radius: 4px;
		border: 1px solid #222;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sc-logic-label {
		font-size: 9px;
		font-weight: 700;
		color: #f97316;
		letter-spacing: 1px;
	}
	.sc-logic-text {
		color: #ccc;
	}
	.strategy-card:hover .sc-logic { border-color: #444; }
	.strategy-card.selected .sc-logic { border-color: #f97316; background: #0a0500; }
	.strategy-card.selected .sc-logic-text { color: #eee; }

	/* ── Terminal ── */
	.term-wrapper {
		flex: 1;
		min-height: 120px;
		width: 100%;
		box-sizing: border-box;
		position: relative;
	}
	.term-wrapper :global(.xterm) { padding: 12px; height: 100%; }
	.term-wrapper :global(.xterm-viewport) { background-color: #000 !important; overflow-y: auto !important; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar) { width: 6px; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) { background: #000; }
	.term-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) { background: #f97316; border-radius: 3px; }
</style>
