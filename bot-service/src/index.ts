import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import axios from 'axios';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IDL = JSON.parse(readFileSync(join(__dirname, 'idl.json'), 'utf-8'));

dotenv.config();

const PROGRAM_ID = new PublicKey('6a5sw2ZVXkAqPF5F8jSvBFVWZSBenaMGnRjnhPoVD31Z');
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com';
const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com';
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || '30000'); // 30 seconds default

interface Position {
  owner: PublicKey;
  marketId: string;
  positionId: bigint;
  predictionType: any;
  amountUsdc: bigint;
  pricePerShare: bigint;
  shares: bigint;
  remainingShares: bigint;
  totalSoldShares: bigint;
  averageSellPrice: bigint;
  status: any;
  openedAt: bigint;
  closedAt: bigint;
  stopLoss: bigint;
  takeProfit: bigint;
}


class SLTPBot {
  private connection: Connection;
  private program: Program;
  private wallet: Wallet;
  private isRunning: boolean = false;

  constructor() {
    // Initialize connection
    this.connection = new Connection(RPC_URL, 'confirmed');

    // Load bot wallet from env
    const privateKeyString = process.env.BOT_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new Error('BOT_PRIVATE_KEY environment variable not set');
    }

    let keypair: Keypair;
    try {
      // Try parsing as JSON array first
      const privateKeyArray = JSON.parse(privateKeyString);
      keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    } catch {
      // If not JSON, try as base58
      keypair = Keypair.fromSecretKey(bs58.decode(privateKeyString));
    }

    this.wallet = new Wallet(keypair);

    // Initialize Anchor provider and program
    const provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
    });

    this.program = new Program(IDL as any, provider);

    console.log('✅ Bot initialized');
    console.log('🔑 Bot wallet:', this.wallet.publicKey.toString());
    console.log('🌐 RPC URL:', RPC_URL);
    console.log('📊 Program ID:', PROGRAM_ID.toString());
  }

  async start() {
    console.log('🚀 Starting SL/TP monitoring bot...');
    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.checkAndExecuteOrders();
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
  }

  stop() {
    console.log('🛑 Stopping bot...');
    this.isRunning = false;
  }

  private async checkAndExecuteOrders() {
    console.log(`\n⏰ [${new Date().toISOString()}] Checking positions...`);

    // Fetch all position accounts from the program
    const positions = await this.fetchActivePositions();
    console.log(`📋 Found ${positions.length} active positions with SL/TP`);

    if (positions.length === 0) {
      return;
    }

    // Group positions by market ID for efficient price fetching
    const marketIds = [...new Set(positions.map((p) => p.account.marketId))];
    console.log(`📈 Fetching prices for ${marketIds.length} unique markets`);

    // Fetch prices for all markets
    const prices = await this.fetchPolymarketPrices(marketIds);

    // Check each position
    for (const position of positions) {
      await this.checkPosition(position, prices);
    }
  }

  private async fetchActivePositions(): Promise<
    Array<{ publicKey: PublicKey; account: Position }>
  > {
    try {
      // Fetch all position accounts
      const accounts = await (this.program.account as any).predictionPosition.all();

      // Filter for active positions with SL or TP set
      return accounts.filter((acc: any) => {
        const status = acc.account.status;
        const stopLoss = Number(acc.account.stopLoss);
        const takeProfit = Number(acc.account.takeProfit);

        // Check if status is Active (index 0 in enum)
        const isActive = status.active !== undefined;

        // Must have at least one SL or TP set
        const hasSLTP = stopLoss > 0 || takeProfit > 0;

        return isActive && hasSLTP;
      });
    } catch (error) {
      console.error('❌ Error fetching positions:', error);
      return [];
    }
  }

  private async fetchPolymarketPrices(
    marketIds: string[]
  ): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    for (const marketId of marketIds) {
      try {
        // Fetch market details from Polymarket Gamma API
        const marketResponse = await axios.get(
          `${POLYMARKET_GAMMA_API}/markets/${marketId}`,
          { timeout: 5000 }
        );

        if (!marketResponse.data || !marketResponse.data.clobTokenIds) {
          console.warn(`⚠️  Market ${marketId} has no clobTokenIds`);
          continue;
        }

        const tokenIds = typeof marketResponse.data.clobTokenIds === 'string'
          ? JSON.parse(marketResponse.data.clobTokenIds)
          : marketResponse.data.clobTokenIds;

        if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
          console.warn(`⚠️  Invalid clobTokenIds for market ${marketId}`);
          continue;
        }

        // Fetch price for YES token (index 0) using CLOB price endpoint
        const yesTokenId = tokenIds[0];
        const priceResponse = await axios.get(
          `${POLYMARKET_CLOB_API}/price`,
          {
            params: {
              token_id: yesTokenId,
              side: 'buy',
            },
            timeout: 5000,
          }
        );

        if (priceResponse.data && priceResponse.data.price) {
          const price = parseFloat(priceResponse.data.price);
          priceMap.set(marketId, price);
          console.log(`  💰 ${marketId}: ${(price * 100).toFixed(1)}¢ (Yes)`);
        }
      } catch (error: any) {
        console.error(
          `❌ Error fetching price for market ${marketId}:`,
          error.message
        );
      }
    }

    return priceMap;
  }

  private async checkPosition(
    position: { publicKey: PublicKey; account: Position },
    prices: Map<string, number>
  ) {
    const { publicKey, account } = position;
    const currentPriceDecimal = prices.get(account.marketId);

    if (!currentPriceDecimal) {
      console.log(`⚠️  No price data for market ${account.marketId}`);
      return;
    }

    // CLOB API returns price as decimal (0-1), convert to cents (0-100)
    const currentPriceCents = currentPriceDecimal * 100;

    // Program stores prices in cents (6-decimal format: 10_000_000 = 10¢)
    const stopLossCents = Number(account.stopLoss) / 1_000_000;
    const takeProfitCents = Number(account.takeProfit) / 1_000_000;
    const entryPriceCents = Number(account.pricePerShare) / 1_000_000;

    // Check if SL or TP triggered
    // Stop Loss: triggers when price drops BELOW the SL level (protecting from losses)
    // Take Profit: triggers when price rises ABOVE the TP level (securing profits)
    const slTriggered = stopLossCents > 0 && currentPriceCents <= stopLossCents;
    const tpTriggered = takeProfitCents > 0 && currentPriceCents >= takeProfitCents;

    if (slTriggered || tpTriggered) {
      const reason = slTriggered ? 'STOP LOSS' : 'TAKE PROFIT';
      const triggerPrice = slTriggered ? stopLossCents : takeProfitCents;

      console.log(`\n🎯 ${reason} TRIGGERED!`);
      console.log(`  Position: ${publicKey.toString()}`);
      console.log(`  Market: ${account.marketId}`);
      console.log(`  Entry Price: ${entryPriceCents.toFixed(1)}¢`);
      console.log(`  Current Price: ${currentPriceCents.toFixed(1)}¢`);
      console.log(`  Trigger Price: ${triggerPrice.toFixed(1)}¢`);

      await this.executeClose(position, currentPriceDecimal);
    }
  }

  private async executeClose(
    position: { publicKey: PublicKey; account: Position },
    currentPrice: number
  ) {
    try {
      // Current price comes from CLOB API as decimal (0-1 range, e.g., 0.11 = 11%)
      // Program expects price in 6-decimal format within 0-1 range (0 to 1_000_000)
      // So we just scale the decimal price: 0.11 * 1_000_000 = 110_000
      const currentPriceScaled = Math.floor(currentPrice * 1_000_000);

      // Convert to BN (BigNum) as required by Anchor
      const currentPriceBN = new BN(currentPriceScaled);

      // Derive the user account PDA
      const [userAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('user'), position.account.owner.toBuffer()],
        PROGRAM_ID
      );

      // Derive the config PDA
      const [configPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        PROGRAM_ID
      );

      console.log(`📤 Sending close_position_auto transaction...`);
      console.log(`   Current price: ${(currentPrice * 100).toFixed(1)}¢ (scaled: ${currentPriceScaled})`);

      const tx = await this.program.methods
        .closePositionAuto(currentPriceBN)
        .accounts({
          userAccount: userAccountPDA,
          positionAccount: position.publicKey,
          config: configPDA,
          bot: this.wallet.publicKey,
        })
        .rpc();

      console.log(`✅ Position closed successfully!`);
      console.log(`   Transaction: ${tx}`);
      console.log(
        `   Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      );
    } catch (error: any) {
      console.error(`❌ Failed to close position:`, error.message);
      if (error.logs) {
        console.error('Transaction logs:', error.logs);
      }
    }
  }
}

// Main execution
async function main() {
  const bot = new SLTPBot();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
