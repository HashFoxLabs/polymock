<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	type WizardStep = 'intro' | 'category_select' | 'market_loading' | 'market_select' | 'position_filter' | 'time_period' | 'start_date' | 'end_date' | 'review' | 'done';

	interface EngineConfig {
		data_source: 'synthesis' | 'parquet';
		platform: string[];
		timestamp_start: string | null;
		timestamp_end: string | null;
		market_category: string[] | null;
		position: string[] | null;
	}

	interface ConfigCompletePayload {
		config: EngineConfig;
		dataSource: 'synthesis' | 'parquet';
		useTimePeriod: boolean;
		timestampStartStr: string;
		timestampEndStr: string;
		filterTitleSearch: string;
		filterVolumeInf: number | null;
		filterVolumeSup: number | null;
		filterCategories: Set<string>;
		filterOutcomesSearch: string;
		selectedMarkets: any[];
	}

	let { onConfigComplete }: { onConfigComplete?: (payload: ConfigCompletePayload) => void } = $props();

	// Wizard state
	let wizardStep: WizardStep = $state('intro');
	let dataSource: 'synthesis' | 'parquet' = $state('synthesis');
	let currentInputLine = $state('');

	// Filter state
	let useTimePeriod = $state(false);
	let timestampStartStr = $state('');
	let timestampEndStr = $state('');
	let selectedCategories: string[] = $state([]);
	let positionFilter: 'both' | 'yes' | 'no' = $state('both');

	// Market selection state
	let availableMarkets: any[] = $state([]);
	let selectedMarketsList: any[] = $state([]);

	function formatVolume(v: number): string {
		if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
		if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
		return `$${v.toFixed(0)}`;
	}

	const availableCategories = [
		'crypto', 'culture', 'economy', 'elections', 'finance',
		'geopolitics', 'politics', 'sports', 'tech', 'world',
		'science', 'entertainment', 'health'
	];

	async function fetchMarketsByCategory(term: any) {
		try {
			const tagsParam = selectedCategories.join(',');
			term.writeln(`${DIM}Fetching ended markets for: ${selectedCategories.join(', ')}...${R}`);
			const response = await fetch(`/api/markets?limit=250&tags=${encodeURIComponent(tagsParam)}&ended=true`);
			if (!response.ok) throw new Error('API error');
			const markets = await response.json();
			if (Array.isArray(markets) && markets.length > 0) {
				availableMarkets = markets;
				term.writeln(`${G}✓ Found ${markets.length} ended markets${R}`);
				wizardStep = 'market_select';
				showWizardStep(term);
			} else {
				term.writeln(`${O}No ended markets found for these categories. Try different ones.${R}`);
				wizardStep = 'category_select';
				showWizardStep(term);
			}
		} catch (err) {
			term.writeln(`${O}Failed to fetch markets. Try again.${R}`);
			wizardStep = 'category_select';
			showWizardStep(term);
		}
	}

	// Xterm state
	let xtermContainer: HTMLDivElement | undefined = $state();
	let xtermInitialized = $state(false);
	let xtermInstance: any = $state(null);

	// Terminal color constants
	const O = '\x1b[38;5;208m'; // orange
	const G = '\x1b[32m'; // green
	const R = '\x1b[0m'; // reset
	const DIM = '\x1b[90m'; // dim/gray

	const introLines = [
		'',
		'\x1b[38;5;208m ___  ___  ________  ________  ___  ___  ________ ________     ___    ___    ___       ________  ________  ________\x1b[0m',
		'\x1b[38;5;208m|\\  \\|\\  \\|\\   __  \\|\\   ____\\|\\  \\|\\  \\|\\  _____\\\\   __  \\   |\\  \\  /  /|  |\\  \\     |\\   __  \\|\\   __  \\|\\   ____\\\x1b[0m',
		'\x1b[38;5;208m\\ \\  \\\\\\  \\ \\  \\|\\  \\ \\  \\___|\\ \\  \\\\\\  \\ \\  \\__/\\ \\  \\|\\  \\  \\ \\  \\/  / /  \\ \\  \\    \\ \\  \\|\\  \\ \\  \\|\\ /\\ \\  \\___|_\x1b[0m',
		'\x1b[38;5;208m \\ \\   __  \\ \\   __  \\ \\_____  \\ \\   __  \\ \\   __\\\\ \\  \\\\\\  \\  \\ \\    / /    \\ \\  \\    \\ \\   __  \\ \\   __  \\ \\_____  \\\x1b[0m',
		'\x1b[38;5;208m  \\ \\  \\ \\  \\ \\  \\ \\  \\|____|\\  \\ \\  \\ \\  \\ \\  \\_| \\ \\  \\\\\\  \\  /     \\/      \\ \\  \\____\\ \\  \\ \\  \\ \\  \\|\\  \\|____|\\  \\\x1b[0m',
		'\x1b[38;5;208m   \\ \\__\\ \\__\\ \\__\\ \\__\\____\\_\\  \\ \\__\\ \\__\\ \\__\\   \\ \\_______\\/  /\\   \\      \\ \\_______\\ \\__\\ \\__\\ \\_______\\____\\_\\  \\\x1b[0m',
		'\x1b[38;5;208m    \\|__|\\|__|\\|__|\\|__|\\_________\\|__|\\|__|\\|__|    \\|_______/__/ /\\ __\\      \\|_______|\\|__|\\|__|\\|_______|\\_________\\\x1b[0m',
		'\x1b[38;5;208m                       \\|_________|                           |__|/ \\|__|                                  \\|_________|\x1b[0m',
		'',
		'',
		'BACKTEST ENGINE v2.0',
		'',
		'──────────────────────────────────────────────',
		'',
		'Initializing engine...',
		'Loading Polymarket dataset ............ \x1b[32m404M+ trades\x1b[0m',
		'Connecting to Synthesis Trade API ..... \x1b[32mconnected\x1b[0m',
		'',
		'\x1b[32m✓ Parquet dataset ready         (local pre-downloaded trades)\x1b[0m',
		'\x1b[32m✓ Synthesis API ready            (live historical trades & OHLC candles)\x1b[0m',
		'\x1b[32mAll systems operational.\x1b[0m',
		'',
		'──────────────────────────────────────────────',
		'',
		'The backtest engine replays historical prediction market trades through your custom strategy.',
		'Each trade is evaluated chronologically — your strategy decides whether to buy, hold, or skip based on real market conditions and price data.',
		'',
		'Platform: Polymarket',
		'',
		'\x1b[32mReady.\x1b[0m Type \x1b[38;5;208mgo\x1b[0m to start.',
	];

	function getEngineConfig(): EngineConfig {
		return {
			data_source: dataSource,
			platform: ['polymarket'],
			timestamp_start: useTimePeriod && timestampStartStr ? timestampStartStr : null,
			timestamp_end: useTimePeriod && timestampEndStr ? timestampEndStr : null,
			market_category: selectedCategories.length > 0 ? selectedCategories : null,
			position: positionFilter === 'both' ? null : [positionFilter === 'yes' ? 'Yes' : 'No'],
		};
	}

	function fireConfigComplete() {
		if (onConfigComplete) {
			onConfigComplete({
				config: getEngineConfig(),
				dataSource,
				useTimePeriod,
				timestampStartStr,
				timestampEndStr,
				filterTitleSearch: '',
				filterVolumeInf: null,
				filterVolumeSup: null,
				filterCategories: new Set(selectedCategories),
				filterOutcomesSearch: '',
				selectedMarkets: selectedMarketsList,
			});
		}
	}

	function prompt(term: any) {
		term.write(`\r\n${O}❯${R} `);
		term.scrollToBottom();
	}

	function showWizardStep(term: any) {
		const step = wizardStep;
		term.writeln('');
		if (step === 'category_select') {
			term.writeln(`${O}━━━ STEP 1/5: SELECT CATEGORIES ━━━${R}`);
			term.writeln('');
			term.writeln('Available categories:');
			term.writeln('');
			for (let i = 0; i < availableCategories.length; i++) {
				const idx = String(i + 1).padStart(2, ' ');
				term.writeln(`  ${O}${idx}${R}  ${availableCategories[i]}`);
			}
			term.writeln('');
			term.writeln(`Select categories (comma-separated), e.g. ${O}1,3,5${R} or ${O}crypto,sports${R}`);
			term.writeln(`${DIM}Type ${O}all${R}${DIM} to select all categories${R}`);
		} else if (step === 'market_loading') {
			term.writeln(`${O}━━━ STEP 2/5: SELECT MARKETS ━━━${R}`);
			fetchMarketsByCategory(term);
			return;
		} else if (step === 'market_select') {
			term.writeln('');
			term.writeln(`Ended markets for ${O}${selectedCategories.join(', ')}${R} (by volume):`);
			term.writeln('');
			const displayCount = Math.min(availableMarkets.length, 30);
			for (let i = 0; i < displayCount; i++) {
				const m = availableMarkets[i];
				const idx = String(i + 1).padStart(2, ' ');
				const q = (m.question || m.title || '').slice(0, 45);
				const qPad = q.padEnd(47);
				const vol = formatVolume(m.volume || 0);
				const endDate = m.endDate ? new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?';
				const outcome = m.resolvedOutcome ? `${G}${m.resolvedOutcome}${R}` : `${DIM}unclear${R}`;
				term.writeln(`  ${O}${idx}${R}  ${qPad} ${DIM}Vol: ${vol}  End: ${endDate}${R}  → ${outcome}`);
			}
			if (availableMarkets.length > 30) {
				term.writeln(`  ${DIM}... and ${availableMarkets.length - 30} more${R}`);
			}
			term.writeln('');
			term.writeln(`Select markets (comma-separated), e.g. ${O}1,3,5${R}`);
			term.writeln(`${DIM}Type ${O}all${R}${DIM} to select all, or ${O}top <n>${R}${DIM} for top N by volume${R}`);
		} else if (step === 'position_filter') {
			term.writeln(`${O}━━━ STEP 3/5: POSITION FILTER ━━━${R}`);
			term.writeln('');
			term.writeln(`Filter trades by position side:`);
			term.writeln('');
			term.writeln(`  ${O}1${R}  Both    ${DIM}— Include Yes and No trades${R}`);
			term.writeln(`  ${O}2${R}  Yes     ${DIM}— Only Yes trades${R}`);
			term.writeln(`  ${O}3${R}  No      ${DIM}— Only No trades${R}`);
			term.writeln('');
			term.writeln(`${DIM}Type ${O}1${R}${DIM}, ${O}2${R}${DIM}, or ${O}3${R}${DIM} (default: 1 — both)${R}`);
		} else if (step === 'time_period') {
			term.writeln(`${O}━━━ STEP 4/5: TIME PERIOD ━━━${R}`);
			term.writeln('');
			term.writeln(`Enable time period filter? (${O}yes${R}/${O}no${R})`);
			term.writeln(`${DIM}Press ENTER for no (use all data)${R}`);
		} else if (step === 'start_date') {
			term.writeln(`Start date (${O}YYYY-MM-DD${R}):`);
			term.writeln(`${DIM}e.g. 2024-01-01${R}`);
		} else if (step === 'end_date') {
			term.writeln(`End date (${O}YYYY-MM-DD${R}):`);
			term.writeln(`${DIM}e.g. 2025-01-01${R}`);
		} else if (step === 'review') {
			term.writeln(`${O}━━━ STEP 5/5: REVIEW CONFIG ━━━${R}`);
			term.writeln('');
			term.writeln(`${G}Data:${R}        Synthesis API + Parquet dataset (404M+ trades)`);
			term.writeln(`${G}Platform:${R}    Polymarket`);
			term.writeln(`${G}Categories:${R}  ${selectedCategories.join(', ')}`);
			if (selectedMarketsList.length > 0) {
				term.writeln(`${G}Markets:${R}     ${selectedMarketsList.length} selected (ended)`);
				for (const m of selectedMarketsList.slice(0, 5)) {
					term.writeln(`  ${DIM}• ${(m.question || m.title || '').slice(0, 60)}${R}`);
				}
				if (selectedMarketsList.length > 5) {
					term.writeln(`  ${DIM}... and ${selectedMarketsList.length - 5} more${R}`);
				}
			}
			term.writeln(`${G}Position:${R}    ${positionFilter === 'both' ? 'Yes & No' : positionFilter === 'yes' ? 'Yes only' : 'No only'}`);
			term.writeln(`${G}Time:${R}        ${useTimePeriod ? `${timestampStartStr} → ${timestampEndStr}` : 'ALL TIME'}`);
			term.writeln('');
			term.writeln(`Type ${O}confirm${R} to finalize, ${O}reset${R} to start over, or ${O}edit <step>${R} to change a setting.`);
			term.writeln(`${DIM}Steps: categories, markets, position, time${R}`);
		}
		prompt(term);
	}

	function handleWizardInput(term: any, input: string) {
		const val = input.trim();
		const valLower = val.toLowerCase();

		// Global commands
		if (valLower === 'reset') {
			dataSource = 'synthesis';
			useTimePeriod = false;
			timestampStartStr = '';
			timestampEndStr = '';
			selectedCategories = [];
			positionFilter = 'both';
			availableMarkets = [];
			selectedMarketsList = [];
			term.clear();
			term.writeln(`${O}Terminal reset.${R}`);
			wizardStep = 'intro';
			term.writeln(`\n${G}Ready.${R} Type ${O}go${R} to start.`);
			prompt(term);
			return;
		}
		if (valLower === 'clear' && wizardStep !== 'intro') {
			term.clear();
			prompt(term);
			return;
		}

		switch (wizardStep) {
			case 'intro':
				if (valLower === 'go') {
					dataSource = 'synthesis';
					wizardStep = 'category_select';
					showWizardStep(term);
				} else if (valLower === 'help') {
					term.writeln('Available commands:');
					term.writeln(`  ${O}go${R}      - Start configuring your backtest`);
					term.writeln(`  ${O}help${R}    - Show this help message`);
					term.writeln(`  ${O}clear${R}   - Clear the terminal`);
					prompt(term);
				} else if (valLower === 'clear') {
					term.clear();
					prompt(term);
				} else {
					prompt(term);
				}
				break;

	
			case 'category_select':
				if (valLower === 'all') {
					selectedCategories = [...availableCategories];
					term.writeln(`${G}✓ Selected all categories${R}`);
					wizardStep = 'market_loading';
					showWizardStep(term);
				} else {
					// Support both numbers (1,3,5) and names (crypto,sports)
					const parts = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
					const resolved: string[] = [];
					for (const p of parts) {
						const num = parseInt(p);
						if (!isNaN(num) && num >= 1 && num <= availableCategories.length) {
							resolved.push(availableCategories[num - 1]);
						} else if (availableCategories.includes(p)) {
							resolved.push(p);
						}
					}
					if (resolved.length > 0) {
						selectedCategories = [...new Set(resolved)];
						term.writeln(`${G}✓ Categories: ${selectedCategories.join(', ')}${R}`);
						wizardStep = 'market_loading';
						showWizardStep(term);
					} else {
						term.writeln(`${O}Invalid selection. Use numbers (1,3,5) or names (crypto,sports)${R}`);
						prompt(term);
					}
				}
				break;

			case 'market_loading':
				// Auto-handled by fetchMarketsByCategory
				prompt(term);
				break;

			case 'market_select':
				if (valLower === 'all') {
					selectedMarketsList = [...availableMarkets];
					term.writeln(`${G}✓ Selected all ${availableMarkets.length} markets${R}`);
					wizardStep = 'position_filter';
					showWizardStep(term);
				} else if (valLower.startsWith('top ')) {
					const n = parseInt(valLower.replace('top ', ''));
					if (n > 0 && n <= availableMarkets.length) {
						selectedMarketsList = availableMarkets.slice(0, n);
						term.writeln(`${G}✓ Selected top ${n} markets by volume${R}`);
						wizardStep = 'position_filter';
						showWizardStep(term);
					} else {
						term.writeln(`${O}Invalid number. Choose 1-${availableMarkets.length}${R}`);
						prompt(term);
					}
				} else {
					const nums = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= availableMarkets.length);
					if (nums.length > 0) {
						selectedMarketsList = nums.map(n => availableMarkets[n - 1]);
						term.writeln(`${G}✓ Selected ${nums.length} market(s):${R}`);
						for (const m of selectedMarketsList) {
							term.writeln(`  ${DIM}• ${(m.question || m.title || '').slice(0, 60)}${R}`);
						}
						wizardStep = 'position_filter';
						showWizardStep(term);
					} else {
						term.writeln(`${O}Invalid selection. Use numbers like: 1,3,5${R}`);
						prompt(term);
					}
				}
				break;

			case 'position_filter':
				if (valLower === '2' || valLower === 'yes') {
					positionFilter = 'yes';
					term.writeln(`${G}✓ Position: Yes only${R}`);
				} else if (valLower === '3' || valLower === 'no') {
					positionFilter = 'no';
					term.writeln(`${G}✓ Position: No only${R}`);
				} else {
					positionFilter = 'both';
					term.writeln(`${G}✓ Position: Both (Yes & No)${R}`);
				}
				wizardStep = 'time_period';
				showWizardStep(term);
				break;

			case 'time_period':
				if (valLower === 'yes' || valLower === 'y') {
					useTimePeriod = true;
					wizardStep = 'start_date';
					showWizardStep(term);
				} else {
					useTimePeriod = false;
					term.writeln(`${G}✓ Time period: ALL TIME${R}`);
					wizardStep = 'review';
					showWizardStep(term);
				}
				break;

			case 'start_date':
				if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
					timestampStartStr = val;
					term.writeln(`${G}✓ Start: ${val}${R}`);
					wizardStep = 'end_date';
					showWizardStep(term);
				} else {
					term.writeln(`${O}Invalid format. Use YYYY-MM-DD${R}`);
					prompt(term);
				}
				break;

			case 'end_date':
				if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
					timestampEndStr = val;
					term.writeln(`${G}✓ Period: ${timestampStartStr} → ${val}${R}`);
					wizardStep = 'review';
					showWizardStep(term);
				} else {
					term.writeln(`${O}Invalid format. Use YYYY-MM-DD${R}`);
					prompt(term);
				}
				break;

			case 'review':
				if (valLower === 'confirm') {
					term.writeln('');
					term.writeln(`${G}━━━ Configuration saved! Loading strategy editor... ━━━${R}`);
					wizardStep = 'done';
					setTimeout(() => { fireConfigComplete(); }, 500);
				} else if (valLower === 'reset') {
					selectedCategories = [];
					availableMarkets = [];
					selectedMarketsList = [];
					useTimePeriod = false;
					timestampStartStr = '';
					timestampEndStr = '';
					term.writeln(`${O}Config reset.${R}`);
					wizardStep = 'category_select';
					showWizardStep(term);
				} else if (valLower.startsWith('edit ')) {
					const target = valLower.replace('edit ', '').trim();
					const stepMap: Record<string, WizardStep> = {
						categories: 'category_select', category: 'category_select',
						markets: 'market_loading', market: 'market_loading',
						position: 'position_filter',
						time: 'time_period',
					};
					if (stepMap[target]) {
						wizardStep = stepMap[target];
						showWizardStep(term);
					} else {
						term.writeln(`${O}Unknown step. Options: categories, markets, position, time${R}`);
						prompt(term);
					}
				} else {
					prompt(term);
				}
				break;

			case 'done':
				if (valLower === 'clear') {
					term.clear();
				} else if (valLower === 'config') {
					wizardStep = 'review';
					showWizardStep(term);
				}
				prompt(term);
				break;
		}
	}

	function setupInput(term: any) {
		term.onData((data: string) => {
			const code = data.charCodeAt(0);

			if (data === '\r') {
				term.write('\r\n');
				handleWizardInput(term, currentInputLine);
				currentInputLine = '';
			} else if (data === '\x7f') {
				if (currentInputLine.length > 0) {
					currentInputLine = currentInputLine.slice(0, -1);
					term.write('\b \b');
				}
			} else if (code >= 32) {
				currentInputLine += data;
				term.write(data);
			}
		});
	}

	async function initXterm() {
		if (xtermInitialized || !xtermContainer) return;
		xtermInitialized = true;

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
		term.open(xtermContainer);
		fitAddon.fit();
		xtermInstance = term;

		const resizeObserver = new ResizeObserver(() => fitAddon.fit());
		resizeObserver.observe(xtermContainer);

		await new Promise(r => setTimeout(r, 150));
		fitAddon.fit();

		setupInput(term);

		if (wizardStep !== 'intro') {
			showWizardStep(term);
			return;
		}

		let lineIdx = 0;
		const typeInterval = setInterval(() => {
			if (lineIdx < introLines.length) {
				term.writeln(introLines[lineIdx]);
				lineIdx++;
			} else {
				clearInterval(typeInterval);
				term.write('\r\n\x1b[38;5;208m❯\x1b[0m ');
			}
		}, 60);
	}

	export function resetWizard() {
		dataSource = 'synthesis';
		useTimePeriod = false;
		timestampStartStr = '';
		timestampEndStr = '';
		selectedCategories = [];
		availableMarkets = [];
		selectedMarketsList = [];
		wizardStep = 'intro';
		currentInputLine = '';

		if (xtermInstance) {
			xtermInstance.dispose();
			xtermInstance = null;
			xtermInitialized = false;
		}

		if (browser && xtermContainer) {
			setTimeout(() => initXterm(), 100);
		}
	}

	onMount(() => {
		if (browser) {
			setTimeout(() => initXterm(), 100);
		}
	});

	onDestroy(() => {
		if (xtermInstance) {
			xtermInstance.dispose();
			xtermInstance = null;
		}
	});
</script>

<div class="engine-container">
	<div class="engine-intro">
		<div class="xterm-wrapper" bind:this={xtermContainer}></div>
	</div>
</div>

<style>
	.engine-container {
		background: #000000;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.engine-intro {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: #000000;
	}
	.xterm-wrapper {
		flex: 1;
		min-height: 0;
		width: 100%;
		border: 1px solid #f97316;
		box-shadow: 0 0 20px rgba(249, 115, 22, 0.15), 0 0 60px rgba(249, 115, 22, 0.05);
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
	}
	.xterm-wrapper :global(.xterm) {
		padding: 12px;
		height: 100%;
	}
	.xterm-wrapper :global(.xterm-viewport) {
		background-color: #000000 !important;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar) {
		width: 6px;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) {
		background: #000000;
	}
	.xterm-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) {
		background: #f97316;
		border-radius: 3px;
	}
</style>
