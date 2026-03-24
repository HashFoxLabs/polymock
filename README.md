```
 _   _    _    ____  _   _ _____ _____  __  ___      _    ____ ____
| | | |  / \  / ___|| | | |  ___/ _ \ \/ / | |    / \  | __ ) ___|
| |_| | / _ \ \___ \| |_| | |_ | | | \  /  | |   / _ \ |  _ \___ \
|  _  |/ ___ \ ___) |  _  |  _|| |_| /  \  | |__/ ___ \| |_) |__) |
|_| |_/_/   \_\____/|_| |_|_|   \___/_/\_\ |____/_/   \_\____/____/

                        
```

## Overview

PolyMock is a full-stack Web3 paper trading platform for Polymarket prediction markets. Built on Solana with a Rust-powered backtesting engine deployed on Fly.io, it lets users practice trading strategies risk-free with virtual USDC balances.

## Architecture

```
polymock/
├── frontend/                # SvelteKit web application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/  # UI components (trading, backtesting, charts)
│   │   │   ├── backtesting/ # Backtest types & definitions
│   │   │   ├── solana/      # Solana integration
│   │   │   └── wallet/      # Wallet adapter
│   │   └── routes/
│   │       ├── +page.svelte       # Main trading interface
│   │       ├── backtesting/       # Strategy backtesting wizard
│   │       ├── strategies/        # Saved strategies
│   │       ├── dashboard/         # Portfolio dashboard
│   │       ├── competition/       # Leaderboards
│   │       ├── marketplace/       # Market browser
│   │       ├── news/              # News feed
│   │       └── api/               # Server-side API routes
│   └── package.json
│
├── backtest_engine_rs/      # Rust backtest engine (deployed to Fly.io)
│   ├── src/
│   │   ├── bin/
│   │   │   └── backtest_server.rs # HTTP server (axum)
│   │   ├── engine.rs              # Core backtest engine
│   │   ├── strategies.rs          # Trading strategies
│   │   └── synthesis_loader.rs    # Synthesis API data loader
│   ├── Dockerfile
│   └── fly.toml
│
├── bot-service/             # Trading bot (Stop Loss / Take Profit)
│   ├── src/                 # TypeScript bot logic
│   ├── Dockerfile
│   └── fly.toml
│
├── contracts/               # Solana smart contracts (Anchor)
│   ├── programs/polymock/
│   │   └── src/lib.rs       # On-chain program
│   └── Anchor.toml
│
└── landing/                 # Next.js landing page
    └── package.json
```

## Services

| Service | Stack | Deployment | URL |
|---------|-------|------------|-----|
| Frontend | SvelteKit, TypeScript | Cloudflare / Vercel | — |
| Backtest Engine | Rust, Axum, Polars | Fly.io | `polymock-backtest.fly.dev` |
| Bot Service | Node.js, TypeScript | Fly.io | `polymock-bot.fly.dev` |
| Smart Contracts | Rust, Anchor | Solana MagicBlock | Program ID below |
| Landing Page | Next.js, React | Vercel | — |

**Program ID:** `6a5sw2ZVXkAqPF5F8jSvBFVWZSBenaMGnRjnhPoVD31Z`

## Backtesting Flow

```
User selects markets → Frontend fetches market list from Synthesis API
                     → User picks strategy + params in wizard
                     → Frontend POSTs config to /api/backtest/run
                     → SvelteKit proxies to Fly.io Rust engine
                     → Rust engine fetches trades from Synthesis (up to 200k/market)
                     → Runs strategy, computes all metrics
                     → Streams NDJSON (progress + final result) back
                     → Frontend displays results (equity curve, metrics, trades)
```

**Available Strategies:**
1. Mean Reversion — buy when price ≤ threshold
2. Dynamic Sizing — scale position by available cash
3. No Duplicates — skip markets with existing positions
4. Better Price — only buy at better price than previous
5. Cooldown — enforce time delay between trades
6. Exposure Scaling — scale by trade count

## Setup

### Prerequisites

- Node.js 18+
- Rust 1.80+ (for backtest engine development)
- Solana CLI + Anchor CLI (for contract development)

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env  # Fill in your keys
npm run dev              # http://localhost:5173
```

### Backtest Engine (local development)

```bash
cd backtest_engine_rs
SYNTHESIS_API_KEY=your-key cargo run --release --bin backtest_server
# Server at http://localhost:8080
```

### Smart Contracts

```bash
cd contracts
npm install
anchor build
anchor deploy --provider.cluster https://rpc.magicblock.app/devnet/
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Service | Description |
|----------|---------|-------------|
| `SYNTHESIS_API_KEY` | Frontend + Backtest Engine | Synthesis Trade API key |
| `BACKTEST_ENGINE_URL` | Frontend | Fly.io backtest server URL |
| `TWELVE_DATA_API_KEY` | Frontend | Market price data |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend + Landing | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend + Landing | Supabase anon key |
| `VITE_WEB3AUTH_CLIENT_ID` | Frontend | Web3Auth social login |

## License

MIT
