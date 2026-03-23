/**
 * POST /api/backtest/run
 *
 * Runs a backtest using the Rust backtest engine.
 * Streams NDJSON: { type: 'progress' | 'result' | 'error', ... }
 *
 * Spawns the `backtest_api` Rust binary, pipes market config as JSON via stdin,
 * and streams NDJSON output back to the client.
 */

import { SYNTHESIS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const {
		markets,
		strategyType,
		initialCash = 10000,
		reimburseOpenPositions = false,
		priceInf = null,
		priceSup = null,
		position = null,
		timestampStart = null,
		timestampEnd = null,
		strategyParams = null,
		stopLoss = null,
		takeProfit = null,
		trailingStop = null,
		maxHoldHours = null,
	} = body;

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			const send = (obj: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
			};

			if (!markets?.length) {
				send({ type: 'error', error: 'No markets provided' });
				controller.close();
				return;
			}

			// Build the JSON input for the Rust binary
			const toStr = (v: unknown): string | null =>
				v == null ? null : Array.isArray(v) ? v[0]?.toString() ?? null : String(v);

			const rustInput = JSON.stringify({
				markets: markets.slice(0, 15).map((m: Record<string, unknown>) => ({
					conditionId: toStr(m.conditionId || m.id) || '',
					question: toStr(m.question || m.title),
					slug: toStr(m.slug),
					volume: typeof m.volume === 'number' ? m.volume : 0,
					category: toStr(m.category) || 'unknown',
					outcomes: m.outcomes,
					clobTokenIds: Array.isArray(m.clobTokenIds) ? m.clobTokenIds.map(String) : null,
					resolvedOutcome: toStr(m.resolvedOutcome),
					endDate: toStr(m.endDate || m.end_date_iso),
					leftTokenId: toStr(m.leftTokenId),
					rightTokenId: toStr(m.rightTokenId),
				})),
				strategy: strategyType,
				initialCash,
				reimburseOpenPositions,
				maxTradesPerMarket: 50000,
				priceInf,
				priceSup,
				position,
				timestampStart,
				timestampEnd,
				strategyParams: strategyParams || undefined,
				stopLoss: stopLoss || undefined,
				takeProfit: takeProfit || undefined,
				trailingStop: trailingStop || undefined,
				maxHoldHours: maxHoldHours || undefined,
			});

			// Resolve the path to the Rust binary
			const engineDir = path.resolve('..', 'backtest_engine_rs');
			const binaryPath = path.join(engineDir, 'target', 'release', 'backtest_api');
			const devBinaryPath = path.join(engineDir, 'target', 'debug', 'backtest_api');

			// Check if release binary exists, fallback to debug, then cargo run
			let useBinary: string;
			if (existsSync(binaryPath)) {
				useBinary = binaryPath;
			} else if (existsSync(devBinaryPath)) {
				useBinary = devBinaryPath;
			} else {
				useBinary = '';
			}

			let child: ReturnType<typeof spawn>;

			if (useBinary) {
				child = spawn(useBinary, [], {
					env: { ...process.env, SYNTHESIS_API_KEY },
					cwd: engineDir,
				});
			} else {
				child = spawn('cargo', ['run', '--bin', 'backtest_api', '--release'], {
					env: { ...process.env, SYNTHESIS_API_KEY },
					cwd: engineDir,
				});
			}

			// Log the full JSON input for debugging
			console.log('[backtest] Rust binary:', useBinary || 'cargo run');
			console.log('[backtest] Input JSON:', rustInput);

			// Write JSON to stdin
			child.stdin?.write(rustInput);
			child.stdin?.end();

			// Stream stdout (NDJSON from the Rust binary)
			let buffer = '';
			child.stdout?.on('data', (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // Keep incomplete line in buffer

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const parsed = JSON.parse(line);

						if (parsed.type === 'result') {
							console.log('[backtest] Got result from engine:',
								'trades_executed=', parsed.data.trades_executed,
								'settle_log_len=', parsed.data.settle_log?.length,
								'total_pnl=', parsed.data.total_pnl);
							const result = buildBacktestResult(parsed.data, initialCash);
							console.log('[backtest] Transformed result:',
								'winningTrades=', result.metrics.winningTrades,
								'losingTrades=', result.metrics.losingTrades,
								'first trade exitPrice=', result.trades[0]?.exitPrice,
								'first trade pnl=', result.trades[0]?.pnl);
							send({ type: 'result', data: result });
						} else {
							// Forward progress/error messages as-is
							controller.enqueue(encoder.encode(line + '\n'));
						}
					} catch {
						// Not valid JSON, ignore
					}
				}
			});

			// Log stderr (Rust engine debug output)
			child.stderr?.on('data', (chunk: Buffer) => {
				const text = chunk.toString().trim();
				if (text) {
					console.error('[backtest_engine]', text);
				}
			});

			child.on('close', (code) => {
				// Flush remaining buffer
				if (buffer.trim()) {
					try {
						const parsed = JSON.parse(buffer);
						if (parsed.type === 'result') {
							const result = buildBacktestResult(parsed.data, initialCash);
							send({ type: 'result', data: result });
						} else {
							controller.enqueue(encoder.encode(buffer + '\n'));
						}
					} catch {
						// ignore
					}
				}

				if (code !== 0 && code !== null) {
					send({ type: 'error', error: `Backtest engine exited with code ${code}` });
				}
				controller.close();
			});

			child.on('error', (err) => {
				send({ type: 'error', error: `Failed to start backtest engine: ${err.message}` });
				controller.close();
			});
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Transfer-Encoding': 'chunked',
			'Cache-Control': 'no-cache',
		},
	});
};

// ── Helpers ────────────────────────────────────────────────────────────────────

interface RustEngineResult {
	trades_executed: number;
	initial_cash: number;
	final_cash: number;
	total_pnl: number;
	roi_percent: number;
	trade_log: Array<{
		market_id: string;
		position: string;
		amount: number;
		cost: number;
		time: string | null;
	}>;
	settle_log: Array<{
		market_id: string;
		position: string;
		amount: number;
		outcome: string | null;
		refund: number | null;
		timestamp: string | null;
		exit_reason: string | null;
		exit_price: number | null;
	}>;
	open_positions: Record<string, number>;
	execution_time: number;
	markets_analyzed: number;
}

function buildBacktestResult(engine: RustEngineResult, initialCash: number) {
	// Build settle map: "market_id|position" → { exitPrice, exit_time, exitReason }
	// Uses exit_price/exit_reason from engine when available
	const settleMap = new Map<string, { exitPrice: number; exitTime: string | null; exitReason: string }>();
	for (const s of engine.settle_log) {
		const key = `${s.market_id}|${s.position}`;
		const reason = s.exit_reason ?? 'RESOLUTION';
		if (s.exit_price != null) {
			// Engine provided explicit exit price (SL/TP/trailing/resolution)
			settleMap.set(key, {
				exitPrice: s.exit_price,
				exitTime: s.timestamp ?? null,
				exitReason: reason,
			});
		} else if (s.refund != null && s.amount > 0) {
			settleMap.set(key, {
				exitPrice: s.refund / s.amount,
				exitTime: s.timestamp ?? null,
				exitReason: reason,
			});
		} else {
			const won = s.outcome != null && s.outcome === s.position;
			settleMap.set(key, {
				exitPrice: won ? 1.0 : 0.0,
				exitTime: s.timestamp ?? null,
				exitReason: reason,
			});
		}
	}

	console.log('[backtest] Settle map built:', settleMap.size, 'entries');
	for (const [k, v] of settleMap) {
		console.log(`[backtest]   ${k} → exitPrice=${v.exitPrice} reason=${v.exitReason}`);
	}

	// Mark positions still open (not settled)
	const openKeys = new Set(Object.keys(engine.open_positions));

	// Compute per-trade PnL
	const trades = engine.trade_log.map((t, i) => {
		const key = `${t.market_id}|${t.position}`;
		const entryPrice = t.amount > 0 ? t.cost / t.amount : 0;
		const settle = settleMap.get(key);
		const isOpen = openKeys.has(key);

		let exitPrice = 0;
		let pnl = 0;
		let status: 'OPEN' | 'CLOSED' = 'CLOSED';
		let exitReason: string | undefined;
		let exitTime: string | undefined;
		let holdingDuration = 0;

		if (settle) {
			exitPrice = settle.exitPrice;
			pnl = (exitPrice - entryPrice) * t.amount;
			exitReason = settle.exitReason;
			exitTime = settle.exitTime ?? undefined;
			if (t.time && settle.exitTime) {
				holdingDuration = Math.abs(new Date(settle.exitTime).getTime() - new Date(t.time).getTime()) / (1000 * 60 * 60);
			}
		} else if (isOpen) {
			status = 'OPEN';
			pnl = 0;
		} else {
			// Lost (position removed without settle log entry = losing side)
			exitPrice = 0;
			pnl = -t.cost;
		}

		const pnlPercentage = t.cost > 0 ? (pnl / t.cost) * 100 : 0;

		return {
			id: `trade-${i}`,
			marketId: t.market_id,
			marketName: t.market_id,
			conditionId: t.market_id,
			entryTime: t.time || new Date().toISOString(),
			exitTime,
			side: t.position as 'YES' | 'NO',
			entryPrice,
			exitPrice,
			shares: t.amount,
			amountInvested: t.cost,
			pnl,
			pnlPercentage,
			fees: 0,
			status,
			entryReason: 'PRICE_THRESHOLD' as const,
			exitReason,
			holdingDuration,
			capitalAllocation: initialCash > 0 ? (t.cost / initialCash) * 100 : 0,
		};
	});

	// Compute aggregate metrics from per-trade PnL
	const closedTrades = trades.filter((t) => t.status === 'CLOSED');
	const wins = closedTrades.filter((t) => t.pnl > 0);
	const losses = closedTrades.filter((t) => t.pnl <= 0);
	const winPnls = wins.map((t) => t.pnl);
	const lossPnls = losses.map((t) => t.pnl);

	const avgWin = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0;
	const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 0;
	const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl)) : 0;
	const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl)) : 0;

	const totalWinPnl = winPnls.reduce((a, b) => a + b, 0);
	const totalLossPnl = Math.abs(lossPnls.reduce((a, b) => a + b, 0));
	const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0;
	const expectancy = closedTrades.length > 0 ? engine.total_pnl / closedTrades.length : 0;

	// Yes/No performance
	const yesTrades = closedTrades.filter((t) => (t.side as string).toLowerCase() === 'yes');
	const noTrades = closedTrades.filter((t) => (t.side as string).toLowerCase() === 'no');
	const sidePerf = (arr: typeof closedTrades) => {
		const w = arr.filter((t) => t.pnl > 0);
		const l = arr.filter((t) => t.pnl <= 0);
		return {
			count: arr.length,
			winRate: arr.length > 0 ? (w.length / arr.length) * 100 : 0,
			pnl: arr.reduce((a, t) => a + t.pnl, 0),
			avgWin: w.length > 0 ? w.reduce((a, t) => a + t.pnl, 0) / w.length : 0,
			avgLoss: l.length > 0 ? l.reduce((a, t) => a + t.pnl, 0) / l.length : 0,
		};
	};

	// Streaks
	let curWins = 0, curLosses = 0, maxWinStreak = 0, maxLossStreak = 0;
	for (const t of closedTrades) {
		if (t.pnl > 0) { curWins++; curLosses = 0; maxWinStreak = Math.max(maxWinStreak, curWins); }
		else { curLosses++; curWins = 0; maxLossStreak = Math.max(maxLossStreak, curLosses); }
	}

	// Equity curve with settlements factored in
	let equity = initialCash;
	let peakEquity = initialCash;
	let maxDrawdown = 0;
	let maxDrawdownPct = 0;
	const equityCurve = engine.trade_log.map((t) => {
		equity -= t.cost;
		// Check if this position was settled — add the payout
		const key = `${t.market_id}|${t.position}`;
		const settle = settleMap.get(key);
		if (settle) {
			equity += settle.exitPrice * t.amount;
		}
		peakEquity = Math.max(peakEquity, equity);
		const dd = peakEquity - equity;
		const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
		maxDrawdown = Math.max(maxDrawdown, dd);
		maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
		return {
			timestamp: t.time || new Date().toISOString(),
			equity,
			drawdown: dd,
			drawdownPercentage: ddPct,
		};
	});

	// Avg holding duration
	const durations = closedTrades.filter((t) => t.holdingDuration > 0).map((t) => t.holdingDuration);
	const avgHoldTime = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

	return {
		strategyConfig: {
			entryType: 'BOTH',
			exitRules: { resolveOnExpiry: true },
			positionSizing: { type: 'FIXED', fixedAmount: 10 },
			startDate: engine.trade_log[0]?.time || new Date().toISOString(),
			endDate: engine.trade_log[engine.trade_log.length - 1]?.time || new Date().toISOString(),
			initialBankroll: initialCash,
		},
		trades,
		metrics: {
			totalTrades: engine.trades_executed,
			winningTrades: wins.length,
			losingTrades: losses.length,
			winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
			totalPnl: engine.total_pnl,
			totalFees: 0,
			netPnl: engine.total_pnl,
			roi: engine.roi_percent,
			avgWin,
			avgLoss,
			bestTrade,
			worstTrade,
			yesPerformance: sidePerf(yesTrades),
			noPerformance: sidePerf(noTrades),
			exitReasonDistribution: {
				resolution: engine.settle_log.filter((s) => (s.exit_reason ?? 'RESOLUTION') === 'RESOLUTION').length,
				stopLoss: engine.settle_log.filter((s) => s.exit_reason === 'STOP_LOSS').length,
				takeProfit: engine.settle_log.filter((s) => s.exit_reason === 'TAKE_PROFIT').length,
				maxHoldTime: engine.settle_log.filter((s) => s.exit_reason === 'MAX_HOLD_TIME').length,
				trailingStop: engine.settle_log.filter((s) => s.exit_reason === 'TRAILING_STOP').length,
				partialExits: engine.settle_log.filter((s) => s.exit_reason === 'REIMBURSED').length,
			},
			equityCurve,
			maxDrawdown,
			maxDrawdownPercentage: maxDrawdownPct,
			sharpeRatio: 0,
			volatility: 0,
			expectancy,
			profitFactor,
			medianWin: 0,
			medianLoss: 0,
			avgHoldTime,
			medianHoldTime: 0,
			capitalUtilization: 0,
			avgCapitalAllocation: closedTrades.length > 0
				? closedTrades.reduce((a, t) => a + t.capitalAllocation, 0) / closedTrades.length
				: 0,
			consecutiveWins: 0,
			consecutiveLosses: 0,
			longestWinStreak: maxWinStreak,
			longestLossStreak: maxLossStreak,
			dailyPnl: [],
			drawdownCurve: [],
			capitalUtilizationOverTime: [],
		},
		startingCapital: initialCash,
		endingCapital: engine.final_cash,
		marketsAnalyzed: engine.markets_analyzed,
		executionTime: engine.execution_time,
	};
}
