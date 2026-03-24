# PolyMock Bot Service

Automated Stop Loss / Take Profit execution bot for PolyMock paper trading positions. Deployed on Fly.io.

## Stack

- **Node.js** + TypeScript
- **Anchor SDK** for Solana program interaction
- **Polymarket CLOB API** for real-time prices
- Deployed on **Fly.io** as `polymock-bot`

## How It Works

1. Queries all active positions on the Solana program that have SL or TP set
2. Fetches current market prices from Polymarket CLOB API
3. Compares prices against SL/TP thresholds
4. Automatically closes positions when conditions are met via `close_position_auto`
5. Repeats every 30 seconds

## Trigger Conditions

- **Stop Loss**: Triggered when `current_price <= stop_loss`
- **Take Profit**: Triggered when `current_price >= take_profit`

## Setup

```bash
npm install
cp .env.example .env  # Fill in values
npm run dev
```

## Deployment

Deployed to Fly.io:

```bash
fly deploy
fly secrets set BOT_PRIVATE_KEY=your-key RPC_URL=https://rpc.magicblock.app/devnet/
```

- **App**: `polymock-bot`
- **Region**: Singapore

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RPC_URL` | Yes | Solana RPC endpoint |
| `BOT_PRIVATE_KEY` | Yes | Bot wallet private key |
| `CHECK_INTERVAL_MS` | No | Check interval (default: 30000) |
| `PROGRAM_ID` | No | Solana program ID |

## Scripts

- `npm run dev` — Run in development mode
- `npm run build` — Compile TypeScript
- `npm run typecheck` — Type checking
