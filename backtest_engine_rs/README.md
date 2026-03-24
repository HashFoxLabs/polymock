# PolyMock Backtest Engine

Rust-based backtesting engine for Polymarket prediction markets. Deployed as an HTTP server on Fly.io.

## Stack

- **Rust** with Axum (HTTP server)
- **Polars** for high-performance data processing
- **Synthesis Trade API** for historical trade data
- Deployed on **Fly.io** as `polymock-backtest`

## How It Works

1. Receives backtest config via `POST /backtest/run` (markets, strategy, params)
2. Fetches historical trades from Synthesis API (up to 200k per market)
3. Transforms trades into Parquet format via Polars
4. Runs the selected strategy against the trade stream
5. Computes all metrics (PnL, win rate, equity curve, drawdown, etc.)
6. Streams NDJSON progress updates + final result back to the caller

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/backtest/run` | Run backtest, streams NDJSON response |

## Strategies

1. **mean_reversion** — Buy when price <= threshold
2. **mean_reversion_with_portfolio_cash** — Dynamic sizing based on available cash
3. **mean_reversion_with_portfolio_positions** — Skip markets with existing positions
4. **mean_reversion_with_trade_log** — Only buy at better price than previous
5. **mean_reversion_with_trade_log_time** — Time-based cooldown between trades
6. **mean_reversion_with_user_perso_parameter_internal** — Scale by trade count

## Local Development

```bash
SYNTHESIS_API_KEY=your-key cargo run --release --bin backtest_server
# Server at http://localhost:8080
```

## Deployment

Deployed to Fly.io via Docker:

```bash
fly deploy
fly secrets set SYNTHESIS_API_KEY=your-key
```

- **App**: `polymock-backtest`
- **Region**: CDG (Paris)
- **URL**: `https://polymock-backtest.fly.dev`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SYNTHESIS_API_KEY` | Synthesis Trade API key (set as Fly.io secret) |
| `PORT` | Server port (default: 8080) |
