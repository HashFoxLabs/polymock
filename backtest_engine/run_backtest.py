"""
Run a backtest with the simple strategy.
"""

from backtest_engine import BacktestEngine
from mean_reversion_example_strategies import mean_reversion as strategy
from datetime import datetime

# Filters — narrow scope for first test run
filters = {
    "initial_cash": 10000,
    "platform": ["polymarket"],
    "timestamp_start": datetime(2025, 1, 25),
    "timestamp_end": datetime(2025, 1, 26),
    "market_id": None,              # all markets
    "market_title": None,
    "volume_inf": None,             # only markets with meaningful volume
    "volume_sup": None,
    "position": None,
    "price_inf": None,
    "price_sup": 0.1,
    "amount_inf": 10000000,
    "amount_sup": None,
}


# Initialize engine
engine = BacktestEngine(
    initial_cash=filters["initial_cash"],
    platform=filters["platform"],
    timestamp_start=filters["timestamp_start"],
    timestamp_end=filters["timestamp_end"],
    market_id=filters["market_id"],
    market_title=filters["market_title"],
    volume_inf=filters["volume_inf"],
    volume_sup=filters["volume_sup"],
    position=filters["position"],
    price_inf=filters["price_inf"],
    price_sup=filters["price_sup"],
    amount_inf=filters["amount_inf"],
    amount_sup=filters["amount_sup"],
    reimburse_open_positions=False,
)

# Run backtest
print("Running backtest...")
# metrics = engine.run(strategy)


metrics = engine.run_with_user_code("""def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        direction = "buy"
        amount = 10

    action = {"market_id": market_id, "position": position, "direction": direction, "amount": amount}

    return action""")


print("\n=== BACKTEST RESULTS ===")
print(f"Trades executed : {metrics['trades_executed']}")
print(f"Buys / Sells    : {metrics['buy_count']} / {metrics['sell_count']}")
print(f"Markets traded  : {metrics['unique_markets_traded']}")
print(f"Final cash      : ${metrics['final_portfolio']['cash']:.2f}")
print(f"Total PnL       : ${metrics['total_pnl']:.2f}")
print(f"ROI             : {metrics['roi_percent']:.2f}%")
print(f"Avg PnL/trade   : ${metrics['average_pnl_per_trade']:.2f}")
print(f"Avg ROI/trade   : {metrics['average_roi_per_trade_percent']:.4f}%")

print("\n=== FLOW METRICS ===")
print(f"Total invested  : ${metrics['total_invested']:.2f}")
print(f"Total proceeds  : ${metrics['total_proceeeds']:.2f}")

print("\n=== SETTLEMENT METRICS ===")
print(f"Settled pos.    : {metrics['total_positions_settled']}")
print(f"Wins / Losses   : {metrics['winning_positions']} / {metrics['losing_positions']}")
print(f"Avg win payout  : ${metrics['average_winning_payout']:.2f}")

print("\n=== RISK METRICS ===")
print(f"Volatility      : {metrics['volatility']:.6f}")
print(f"Downside risk   : {metrics['downside_risk']:.6f}")
print(f"Max drawdown    : {metrics['max_drawdown']:.2%}")
print(f"Sharpe ratio    : {metrics['sharpe_ratio']:.4f}")
print(f"Sortino ratio   : {metrics['sortino_ratio']:.4f}")
print(f"Calmar ratio    : {metrics['calmar_ratio']:.4f}")

