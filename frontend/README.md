# PolyMock Frontend

SvelteKit web application for paper trading on Polymarket prediction markets.

## Stack

- **SvelteKit 2** + TypeScript + Vite 7
- **Solana Web3.js** + Anchor SDK for on-chain trading
- **Supabase** for auth and saved strategies
- **Web3Auth** for social login
- **Synthesis Trade API** for market data and historical trades

## Features

- Real-time Polymarket data (markets, prices, events)
- Virtual USDC paper trading on Solana
- Strategy backtesting wizard (proxies to Rust engine on Fly.io)
- Saved strategies with full backtest history
- Portfolio dashboard with P&L tracking
- Competition leaderboards
- Market browser and news feed

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main trading terminal |
| `/backtesting` | Strategy backtesting wizard |
| `/strategies` | Saved backtest strategies |
| `/dashboard` | Portfolio & positions |
| `/competition` | Leaderboards |
| `/marketplace` | Market browser |
| `/news` | News feed |
| `/event/[slug]` | Event detail + trading |
| `/market/[id]` | Market detail |
| `/profile` | User profile |

## API Routes

| Route | Description |
|-------|-------------|
| `/api/backtest/run` | Proxies to Fly.io Rust backtest engine |
| `/api/backtest/trades` | Streams trade data from Synthesis |
| `/api/markets` | Market listing from Synthesis |
| `/api/strategies` | CRUD for saved strategies (Supabase) |
| `/api/news`, `/api/newsdata` | News feeds |
| `/api/auth/*` | Authentication (Google, wallet) |

## Setup

```bash
npm install
cp ../.env.example .env  # Fill in your keys
npm run dev              # http://localhost:5173
```

## Scripts

- `npm run dev` — Dev server with HMR
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run check` — Svelte type checking

## Environment Variables

See `../.env.example` for the full list. Key ones:

- `SYNTHESIS_API_KEY` — Synthesis Trade API key
- `BACKTEST_ENGINE_URL` — Fly.io backtest server (`https://polymock-backtest.fly.dev`)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
- `VITE_WEB3AUTH_CLIENT_ID` — Web3Auth social login
- `TWELVE_DATA_API_KEY` — Market price data
