//! Synthesis API data loader CLI — equivalent of synthesis_data_loader.py
//!
//! Usage:
//!   cargo run --bin synthesis_loader -- [OPTIONS]
//!
//! Examples:
//!   cargo run --bin synthesis_loader                           # trades only
//!   cargo run --bin synthesis_loader -- --candles              # trades + candles
//!   cargo run --bin synthesis_loader -- --candles-only         # candles only
//!   cargo run --bin synthesis_loader -- --candles --interval 1d
//!   cargo run --bin synthesis_loader -- --limit 50

use backtest_engine_rs::synthesis_loader;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "synthesis_loader")]
#[command(about = "Fetch Synthesis API data for backtest engine")]
struct Args {
    /// Max number of markets to fetch
    #[arg(long, default_value_t = 200)]
    limit: usize,

    /// Output directory for standardized trade Parquet files
    #[arg(long)]
    output: Option<PathBuf>,

    /// Output directory for market metadata Parquet
    #[arg(long)]
    markets_dir: Option<PathBuf>,

    /// Output directory for candlestick Parquet files
    #[arg(long)]
    candles_dir: Option<PathBuf>,

    /// Max trades per market
    #[arg(long, default_value_t = 50000)]
    max_trades: usize,

    /// Also fetch OHLC candlestick data
    #[arg(long)]
    candles: bool,

    /// Fetch candles only (generates synthetic trades from candles)
    #[arg(long)]
    candles_only: bool,

    /// Candle interval: 1h, 6h, 1d, 1w, 1m, all
    #[arg(long, default_value = "1d")]
    interval: String,
}

fn main() {
    let args = Args::parse();

    let api_key = std::env::var("SYNTHESIS_API_KEY").unwrap_or_default();

    let output_dir = args.output.unwrap_or_else(synthesis_loader::default_output_dir);
    let markets_dir = args.markets_dir.unwrap_or_else(synthesis_loader::default_markets_dir);
    let candles_dir = args.candles_dir.unwrap_or_else(synthesis_loader::default_candles_dir);

    match synthesis_loader::run(
        &api_key,
        args.limit,
        &output_dir,
        &markets_dir,
        &candles_dir,
        args.max_trades,
        args.candles,
        args.candles_only,
        &args.interval,
    ) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}
