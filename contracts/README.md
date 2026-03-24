# PolyMock Smart Contracts

Solana smart contracts for paper trading on Polymarket prediction markets. Built with the Anchor framework.

## Deployment

- **Network**: Solana (MagicBlock Devnet)
- **Program ID**: `6a5sw2ZVXkAqPF5F8jSvBFVWZSBenaMGnRjnhPoVD31Z`
- **RPC**: `https://rpc.magicblock.app/devnet/`

## Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_config` | One-time program setup (treasury, authority) |
| `initialize_account` | Create user account with 10,000 virtual USDC |
| `buy_yes` / `buy_no` | Open YES/NO positions in prediction markets |
| `close_position` | Close position and realize P&L |
| `close_position_auto` | Auto-close by bot when SL/TP triggers |

## Setup

### Prerequisites

- Rust 1.70+
- Solana CLI 1.16+
- Anchor CLI 0.30+
- Node.js 18+

### Build & Deploy

```bash
anchor build
anchor deploy --provider.cluster https://rpc.magicblock.app/devnet/
anchor run initialise
```

### Test

```bash
anchor test
```
