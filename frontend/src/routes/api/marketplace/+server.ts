import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const { data, error } = await supabaseAdmin
		.from('backtest_strategies')
		.select(`
			id,
			user_id,
			strategy_name,
			description,
			strategy_type,
			initial_capital,
			final_capital,
			total_return_percent,
			total_trades,
			winning_trades,
			losing_trades,
			win_rate,
			sharpe_ratio,
			max_drawdown,
			profit_factor,
			avg_win,
			avg_loss,
			best_trade,
			worst_trade,
			start_date,
			end_date,
			equity_curve,
			market_ids,
			likes_count,
			comments_count,
			created_at,
			backtest_data,
			users(username, wallet_address)
		`)
		.eq('is_published', true)
		.order('total_return_percent', { ascending: false })
		.limit(100);

	if (error) {
		console.error('[marketplace] fetch error:', error);
		return json({ error: error.message }, { status: 500 });
	}

	const strategies = (data ?? []).map((s: any) => {
		// Normalize equity curve to {timestamp, equity} shape the chart expects
		const rawCurve = s.equity_curve ?? [];
		const equityCurve = rawCurve.map((p: any, i: number) => {
			if (typeof p === 'number') return { timestamp: String(i), equity: p };
			return {
				timestamp: p.timestamp ?? String(i),
				equity: p.equity ?? p.capital ?? p.value ?? 0,
			};
		});

		return {
			id: s.id,
			userId: s.user_id,
			strategyName: s.strategy_name ?? 'Unnamed Strategy',
			userName: s.users?.username ?? null,
			walletAddress: s.users?.wallet_address ?? '',
			marketIds: s.market_ids ?? [],
			description: s.description ?? null,
			strategyType: s.strategy_type ?? null,
			initialCapital: Number(s.initial_capital) || 0,
			finalCapital: Number(s.final_capital) || 0,
			totalReturnPercent: Number(s.total_return_percent) || 0,
			totalTrades: s.total_trades || 0,
			winningTrades: s.winning_trades || 0,
			losingTrades: s.losing_trades || 0,
			winRate: Number(s.win_rate) || 0,
			sharpeRatio: Number(s.sharpe_ratio) || 0,
			maxDrawdown: Number(s.max_drawdown) || 0,
			profitFactor: Number(s.profit_factor) || 0,
			avgWin: Number(s.avg_win) || 0,
			avgLoss: Number(s.avg_loss) || 0,
			largestWin: Number(s.best_trade) || 0,
			largestLoss: Number(s.worst_trade) || 0,
			startDate: s.start_date ?? s.created_at,
			endDate: s.end_date ?? s.created_at,
			equityCurve,
			likesCount: s.likes_count || 0,
			commentsCount: s.comments_count || 0,
			createdAt: s.created_at,
			strategyConfig: (s.backtest_data as any)?.strategyConfig ?? null,
		};
	});

	return json({ strategies });
};
