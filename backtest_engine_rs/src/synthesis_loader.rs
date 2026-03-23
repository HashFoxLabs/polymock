//! Synthesis API → Backtest Engine Data Loader
//!
//! Fetches historical trade data and OHLC candlestick data from the Synthesis
//! Trade API and converts it into formats the BacktestEngine can use.
//!
//! Two data modes:
//!   1. TRADES  — individual trades → standardized Parquet (engine reads directly)
//!   2. CANDLES — OHLC price history → separate Parquet per market + combined file
//!
//! Output schema for trades (matches formating_data):
//!     platform, timestamp, title, volume, market_id, market_category,
//!     position, possible_outcomes, price, amount, wallet_maker, wallet_taker
//!
//! Output schema for candles:
//!     market_id, timestamp, open, high, low, close, volume

use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use anyhow::{Result, bail};
use polars::prelude::*;
use serde::{Deserialize, Serialize};

const SYNTHESIS_API_BASE: &str = "https://synthesis.trade/api/v1";
const TRADES_PER_REQUEST: u32 = 10000;

// ── API response types ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    success: Option<bool>,
    response: Option<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthesisMarket {
    pub condition_id: Option<String>,
    pub question: Option<String>,
    pub slug: Option<String>,
    pub volume: f64,
    pub category: Option<String>,
    pub left_token_id: Option<String>,
    pub right_token_id: Option<String>,
    pub left_outcome: String,
    pub right_outcome: String,
    pub left_price: Option<String>,
    pub right_price: Option<String>,
    pub resolved: Option<bool>,
    pub ends_at: Option<String>,
    pub image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MarketItem {
    event: Option<EventInfo>,
    markets: Option<Vec<MarketInfo>>,
}

#[derive(Debug, Deserialize)]
struct EventInfo {
    category: Option<String>,
    labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct MarketInfo {
    condition_id: Option<String>,
    question: Option<String>,
    slug: Option<String>,
    volume: Option<serde_json::Value>,
    left_token_id: Option<String>,
    right_token_id: Option<String>,
    left_outcome: Option<String>,
    right_outcome: Option<String>,
    left_price: Option<String>,
    right_price: Option<String>,
    resolved: Option<bool>,
    ends_at: Option<String>,
    image: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SynthesisTrade {
    tx_hash: Option<String>,
    token_id: Option<String>,
    address: Option<String>,
    side: Option<bool>,
    amount: Option<serde_json::Value>,
    shares: Option<serde_json::Value>,
    price: Option<serde_json::Value>,
    username: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CandleData {
    ohlc: Option<Vec<OhlcCandle>>,
    volume: Option<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
struct OhlcCandle {
    time: Option<i64>,
    open: Option<f64>,
    high: Option<f64>,
    low: Option<f64>,
    close: Option<f64>,
}

// ── Public functions ───────────────────────────────────────────────────────────

/// Fetch all available markets from Synthesis API.
pub fn fetch_markets(api_key: &str, limit: usize) -> Result<Vec<SynthesisMarket>> {
    println!("Fetching up to {} markets from Synthesis API...", limit);

    let client = reqwest::blocking::Client::new();
    let mut all_markets: Vec<SynthesisMarket> = Vec::new();
    let mut offset: usize = 0;
    let page_size = std::cmp::min(limit, 100);

    while all_markets.len() < limit {
        let resp = client
            .get(format!("{}/polymarket/markets", SYNTHESIS_API_BASE))
            .header("Accept", "application/json")
            .header("X-PROJECT-API-KEY", api_key)
            .query(&[
                ("limit", page_size.to_string()),
                ("offset", offset.to_string()),
                ("sort", "volume1wk".to_string()),
                ("order", "DESC".to_string()),
            ])
            .timeout(Duration::from_secs(15))
            .send()?;

        let data: ApiResponse<Vec<MarketItem>> = resp.json()?;

        if data.success != Some(true) {
            break;
        }

        let items = match data.response {
            Some(items) if !items.is_empty() => items,
            _ => break,
        };

        let items_len = items.len();

        for item in items {
            let event = item.event.unwrap_or(EventInfo { category: None, labels: None });
            let category = event.category.or_else(|| {
                event.labels.as_ref().and_then(|l| l.first().cloned())
            });

            if let Some(markets) = item.markets {
                for m in markets {
                    let vol = m.volume
                        .as_ref()
                        .and_then(|v| match v {
                            serde_json::Value::Number(n) => n.as_f64(),
                            serde_json::Value::String(s) => s.parse::<f64>().ok(),
                            _ => None,
                        })
                        .unwrap_or(0.0);

                    all_markets.push(SynthesisMarket {
                        condition_id: m.condition_id,
                        question: m.question,
                        slug: m.slug,
                        volume: vol,
                        category: category.clone(),
                        left_token_id: m.left_token_id,
                        right_token_id: m.right_token_id,
                        left_outcome: m.left_outcome.unwrap_or_else(|| "Yes".to_string()),
                        right_outcome: m.right_outcome.unwrap_or_else(|| "No".to_string()),
                        left_price: m.left_price,
                        right_price: m.right_price,
                        resolved: m.resolved,
                        ends_at: m.ends_at,
                        image: m.image,
                    });
                }
            }
        }

        offset += page_size;
        if items_len < page_size {
            break;
        }
    }

    all_markets.truncate(limit);
    println!("  Found {} markets", all_markets.len());
    Ok(all_markets)
}

/// Fetch all trades for a single market using pagination.
pub fn fetch_trades_for_market(api_key: &str, condition_id: &str, max_trades: usize) -> Result<Vec<SynthesisTrade>> {
    let client = reqwest::blocking::Client::new();
    let mut all_trades: Vec<SynthesisTrade> = Vec::new();
    let mut offset: u32 = 0;

    while all_trades.len() < max_trades {
        let resp = client
            .get(format!("{}/polymarket/market/{}/trades", SYNTHESIS_API_BASE, condition_id))
            .header("Accept", "application/json")
            .header("X-PROJECT-API-KEY", api_key)
            .query(&[
                ("limit", TRADES_PER_REQUEST.to_string()),
                ("offset", offset.to_string()),
            ])
            .timeout(Duration::from_secs(15))
            .send();

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                eprintln!("    Error fetching trades at offset {}: {}", offset, e);
                break;
            }
        };

        let data: ApiResponse<Vec<SynthesisTrade>> = match resp.json() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("    Error parsing trades at offset {}: {}", offset, e);
                break;
            }
        };

        if data.success != Some(true) {
            break;
        }

        let trades = match data.response {
            Some(t) if !t.is_empty() => t,
            _ => break,
        };

        let batch_len = trades.len();
        all_trades.extend(trades);
        offset += TRADES_PER_REQUEST;

        if batch_len < TRADES_PER_REQUEST as usize {
            break;
        }

        // Rate limit
        thread::sleep(Duration::from_millis(200));
    }

    all_trades.truncate(max_trades);
    Ok(all_trades)
}

/// Transform Synthesis trade data into the standardized DataFrame.
pub fn transform_trades(trades: &[SynthesisTrade], market: &SynthesisMarket) -> Result<DataFrame> {
    if trades.is_empty() {
        return Ok(DataFrame::empty());
    }

    let outcomes = vec![market.left_outcome.clone(), market.right_outcome.clone()];
    let left_token = market.left_token_id.as_deref().unwrap_or("");
    let right_token = market.right_token_id.as_deref().unwrap_or("");

    let mut platforms = Vec::with_capacity(trades.len());
    let mut timestamps = Vec::with_capacity(trades.len());
    let mut titles = Vec::with_capacity(trades.len());
    let mut volumes = Vec::with_capacity(trades.len());
    let mut market_ids = Vec::with_capacity(trades.len());
    let mut categories = Vec::with_capacity(trades.len());
    let mut positions = Vec::with_capacity(trades.len());
    let mut possible_outcomes_col = Vec::with_capacity(trades.len());
    let mut prices = Vec::with_capacity(trades.len());
    let mut amounts = Vec::with_capacity(trades.len());
    let mut wallet_makers = Vec::with_capacity(trades.len());
    let mut wallet_takers = Vec::with_capacity(trades.len());

    let mid = market.slug.as_deref()
        .unwrap_or_else(|| market.condition_id.as_deref().unwrap_or(""));
    let question = market.question.as_deref().unwrap_or("");
    let cat = market.category.as_deref().unwrap_or("");

    for t in trades {
        // Determine position from token_id
        let token_id = t.token_id.as_deref().unwrap_or("");
        let position = if token_id == left_token {
            &market.left_outcome
        } else if token_id == right_token {
            &market.right_outcome
        } else {
            // Fallback: side=true typically means Yes
            if t.side.unwrap_or(true) { &outcomes[0] } else { &outcomes[1] }
        };

        // Parse timestamp
        let ts = t.created_at.as_deref().unwrap_or("");
        let formatted_ts = parse_timestamp_to_string(ts);

        // Parse price
        let price: f64 = match &t.price {
            Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
            Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0.0),
            _ => 0.0,
        };

        // Parse amount (shares or amount)
        let amount_raw: f64 = t.shares.as_ref()
            .or(t.amount.as_ref())
            .map(|v| match v {
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
                _ => 0.0,
            })
            .unwrap_or(0.0);
        let amount = if amount_raw > 0.0 { amount_raw as i64 } else { 0 };

        platforms.push("polymarket".to_string());
        timestamps.push(formatted_ts);
        titles.push(question.to_string());
        volumes.push(market.volume);
        market_ids.push(mid.to_string());
        categories.push(cat.to_string());
        positions.push(position.clone());
        possible_outcomes_col.push(serde_json::to_string(&outcomes).unwrap_or_default());
        prices.push((price * 1e6).round() / 1e6);
        amounts.push(amount);
        wallet_makers.push(t.address.clone().unwrap_or_default());
        wallet_takers.push(t.address.clone().unwrap_or_default());
    }

    let df = DataFrame::new(vec![
        Column::new("platform".into(), &platforms),
        Column::new("timestamp".into(), &timestamps),
        Column::new("title".into(), &titles),
        Column::new("volume".into(), &volumes),
        Column::new("market_id".into(), &market_ids),
        Column::new("market_category".into(), &categories),
        Column::new("position".into(), &positions),
        Column::new("possible_outcomes".into(), &possible_outcomes_col),
        Column::new("price".into(), &prices),
        Column::new("amount".into(), &amounts),
        Column::new("wallet_maker".into(), &wallet_makers),
        Column::new("wallet_taker".into(), &wallet_takers),
    ])?;

    Ok(df)
}

/// Fetch OHLC candlestick data for a market via price-history endpoint.
pub fn fetch_candles_for_market(api_key: &str, token_id: &str, interval: &str) -> Result<Vec<(i64, f64, f64, f64, f64, f64)>> {
    let client = reqwest::blocking::Client::new();

    let resp = client
        .get(format!("{}/polymarket/market/{}/price-history", SYNTHESIS_API_BASE, token_id))
        .header("Accept", "application/json")
        .header("X-PROJECT-API-KEY", api_key)
        .query(&[("interval", interval), ("volume", "true")])
        .timeout(Duration::from_secs(30))
        .send()?;

    let data: ApiResponse<CandleData> = resp.json()?;

    if data.success != Some(true) {
        return Ok(Vec::new());
    }

    let candle_data = match data.response {
        Some(d) => d,
        None => return Ok(Vec::new()),
    };

    let ohlc = candle_data.ohlc.unwrap_or_default();
    let volumes = candle_data.volume.unwrap_or_default();

    let mut result = Vec::with_capacity(ohlc.len());
    for (i, c) in ohlc.iter().enumerate() {
        let vol = volumes.get(i).copied().unwrap_or(0.0);
        result.push((
            c.time.unwrap_or(0),
            c.open.unwrap_or(0.0),
            c.high.unwrap_or(0.0),
            c.low.unwrap_or(0.0),
            c.close.unwrap_or(0.0),
            vol,
        ));
    }

    Ok(result)
}

/// Transform raw OHLC candles into a DataFrame.
pub fn transform_candles(
    candles: &[(i64, f64, f64, f64, f64, f64)],
    market: &SynthesisMarket,
) -> Result<DataFrame> {
    if candles.is_empty() {
        return Ok(DataFrame::empty());
    }

    let mid = market.slug.as_deref()
        .unwrap_or_else(|| market.condition_id.as_deref().unwrap_or(""));
    let question = market.question.as_deref().unwrap_or("");
    let cat = market.category.as_deref().unwrap_or("");

    let mut market_ids = Vec::with_capacity(candles.len());
    let mut titles_col = Vec::with_capacity(candles.len());
    let mut categories_col = Vec::with_capacity(candles.len());
    let mut timestamps = Vec::with_capacity(candles.len());
    let mut opens = Vec::with_capacity(candles.len());
    let mut highs = Vec::with_capacity(candles.len());
    let mut lows = Vec::with_capacity(candles.len());
    let mut closes = Vec::with_capacity(candles.len());
    let mut vols = Vec::with_capacity(candles.len());

    for &(time, open, high, low, close, vol) in candles {
        let ts = chrono::DateTime::from_timestamp(time, 0)
            .map(|dt| dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        market_ids.push(mid.to_string());
        titles_col.push(question.to_string());
        categories_col.push(cat.to_string());
        timestamps.push(ts);
        opens.push(open);
        highs.push(high);
        lows.push(low);
        closes.push(close);
        vols.push(vol);
    }

    let df = DataFrame::new(vec![
        Column::new("market_id".into(), &market_ids),
        Column::new("title".into(), &titles_col),
        Column::new("category".into(), &categories_col),
        Column::new("timestamp".into(), &timestamps),
        Column::new("open".into(), &opens),
        Column::new("high".into(), &highs),
        Column::new("low".into(), &lows),
        Column::new("close".into(), &closes),
        Column::new("volume".into(), &vols),
    ])?;

    Ok(df)
}

/// Convert OHLC candles into synthetic trade rows matching the engine's schema.
pub fn candles_to_trades(candles_df: &DataFrame, market: &SynthesisMarket) -> Result<DataFrame> {
    if candles_df.height() == 0 {
        return Ok(DataFrame::empty());
    }

    let outcomes = vec![market.left_outcome.clone(), market.right_outcome.clone()];
    let mid = market.slug.as_deref()
        .unwrap_or_else(|| market.condition_id.as_deref().unwrap_or(""));
    let question = market.question.as_deref().unwrap_or("");
    let cat = market.category.as_deref().unwrap_or("");

    let ts_col = candles_df.column("timestamp")?.str()?;
    let close_col = candles_df.column("close")?.f64()?;
    let vol_col = candles_df.column("volume")?.f64()?;

    let n = candles_df.height();
    let mut platforms = Vec::with_capacity(n);
    let mut timestamps = Vec::with_capacity(n);
    let mut titles = Vec::with_capacity(n);
    let mut volumes_col = Vec::with_capacity(n);
    let mut market_ids = Vec::with_capacity(n);
    let mut categories = Vec::with_capacity(n);
    let mut positions = Vec::with_capacity(n);
    let mut po_col = Vec::with_capacity(n);
    let mut prices = Vec::with_capacity(n);
    let mut amounts_col = Vec::with_capacity(n);
    let mut wm = Vec::with_capacity(n);
    let mut wt = Vec::with_capacity(n);

    let outcomes_str = serde_json::to_string(&outcomes).unwrap_or_default();

    for i in 0..n {
        platforms.push("polymarket".to_string());
        timestamps.push(ts_col.get(i).unwrap_or("").to_string());
        titles.push(question.to_string());
        volumes_col.push(market.volume);
        market_ids.push(mid.to_string());
        categories.push(cat.to_string());
        positions.push(outcomes[0].clone()); // Yes side
        po_col.push(outcomes_str.clone());
        prices.push((close_col.get(i).unwrap_or(0.0) * 1e6).round() / 1e6);
        let v = vol_col.get(i).unwrap_or(0.0);
        amounts_col.push(if v > 0.0 { v as i64 } else { 1_i64 });
        wm.push(String::new());
        wt.push(String::new());
    }

    let df = DataFrame::new(vec![
        Column::new("platform".into(), &platforms),
        Column::new("timestamp".into(), &timestamps),
        Column::new("title".into(), &titles),
        Column::new("volume".into(), &volumes_col),
        Column::new("market_id".into(), &market_ids),
        Column::new("market_category".into(), &categories),
        Column::new("position".into(), &positions),
        Column::new("possible_outcomes".into(), &po_col),
        Column::new("price".into(), &prices),
        Column::new("amount".into(), &amounts_col),
        Column::new("wallet_maker".into(), &wm),
        Column::new("wallet_taker".into(), &wt),
    ])?;

    Ok(df)
}

/// Save market metadata as a Parquet file for BacktestEngine outcome resolution.
pub fn save_market_metadata(markets: &[SynthesisMarket], output_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(output_dir)?;

    let mut questions = Vec::new();
    let mut volumes = Vec::new();
    let mut slugs = Vec::new();
    let mut outcomes_col = Vec::new();
    let mut outcome_prices_col = Vec::new();
    let mut clob_token_ids_col = Vec::new();
    let mut categories = Vec::new();
    let mut end_dates = Vec::new();
    let mut condition_ids = Vec::new();

    for m in markets {
        let outs = vec![&m.left_outcome, &m.right_outcome];
        let prices = vec![
            m.left_price.as_deref().unwrap_or("0.5"),
            m.right_price.as_deref().unwrap_or("0.5"),
        ];
        let tokens = vec![
            m.left_token_id.as_deref().unwrap_or(""),
            m.right_token_id.as_deref().unwrap_or(""),
        ];

        questions.push(m.question.clone().unwrap_or_default());
        volumes.push(m.volume);
        slugs.push(m.slug.clone().unwrap_or_default());
        outcomes_col.push(serde_json::to_string(&outs).unwrap_or_default());
        outcome_prices_col.push(serde_json::to_string(&prices).unwrap_or_default());
        clob_token_ids_col.push(serde_json::to_string(&tokens).unwrap_or_default());
        categories.push(m.category.clone().unwrap_or_default());
        end_dates.push(m.ends_at.clone().unwrap_or_default());
        condition_ids.push(m.condition_id.clone().unwrap_or_default());
    }

    let mut df = DataFrame::new(vec![
        Column::new("question".into(), &questions),
        Column::new("volume".into(), &volumes),
        Column::new("slug".into(), &slugs),
        Column::new("outcomes".into(), &outcomes_col),
        Column::new("outcome_prices".into(), &outcome_prices_col),
        Column::new("clob_token_ids".into(), &clob_token_ids_col),
        Column::new("category".into(), &categories),
        Column::new("end_date".into(), &end_dates),
        Column::new("condition_id".into(), &condition_ids),
    ])?;

    let path = output_dir.join("synthesis_markets.parquet");
    let file = std::fs::File::create(&path)?;
    ParquetWriter::new(file).finish(&mut df)?;
    println!("  Saved {} markets metadata to {:?}", df.height(), path);
    Ok(())
}

/// Main pipeline: fetch markets → fetch trades/candles → transform → save Parquet.
pub fn run(
    api_key: &str,
    limit: usize,
    output_dir: &Path,
    markets_dir: &Path,
    candles_dir: &Path,
    max_trades_per_market: usize,
    fetch_candles_flag: bool,
    candles_only: bool,
    candle_interval: &str,
) -> Result<()> {
    if api_key.is_empty() {
        bail!("SYNTHESIS_API_KEY environment variable not set.\n  Set it with: export SYNTHESIS_API_KEY=sk_...");
    }

    std::fs::create_dir_all(output_dir)?;
    std::fs::create_dir_all(candles_dir)?;

    // Step 1: Fetch all markets
    let markets = fetch_markets(api_key, limit)?;
    if markets.is_empty() {
        println!("No markets found. Exiting.");
        return Ok(());
    }

    // Step 2: Save market metadata
    save_market_metadata(&markets, markets_dir)?;

    // Step 3: Fetch trades/candles for each market
    let mut total_trades: usize = 0;
    let mut total_candles: usize = 0;
    let mut skipped: usize = 0;
    let mut all_candles_dfs: Vec<DataFrame> = Vec::new();

    for (i, market) in markets.iter().enumerate() {
        let cid = match &market.condition_id {
            Some(c) if !c.is_empty() => c.clone(),
            _ => {
                println!("  [{}] skipped (no condition_id)", i + 1);
                skipped += 1;
                continue;
            }
        };

        let slug = market.slug.as_deref().unwrap_or(&cid[..std::cmp::min(16, cid.len())]);
        let safe_name: String = slug.replace('/', "_").replace(' ', "_").chars().take(80).collect();

        print!("  [{}/{}] {}: ", i + 1, markets.len(), slug);

        // --- Trades ---
        if !candles_only {
            let trades = fetch_trades_for_market(api_key, &cid, max_trades_per_market)?;
            if !trades.is_empty() {
                let mut df = transform_trades(&trades, market)?;
                if df.height() > 0 {
                    let out_path = output_dir.join(format!("{}_std.parquet", safe_name));
                    let file = std::fs::File::create(&out_path)?;
                    ParquetWriter::new(file).finish(&mut df)?;
                    total_trades += df.height();
                    print!("{} trades", df.height());
                } else {
                    print!("0 trades");
                }
            } else {
                print!("0 trades");
            }
        }

        // --- Candles ---
        if fetch_candles_flag || candles_only {
            if let Some(ref token_id) = market.left_token_id {
                let raw_candles = fetch_candles_for_market(api_key, token_id, candle_interval)?;
                let candles_df = transform_candles(&raw_candles, market)?;

                if candles_df.height() > 0 {
                    let candle_path = candles_dir.join(format!("{}_candles.parquet", safe_name));
                    let mut candles_df_clone = candles_df.clone();
                    let file = std::fs::File::create(&candle_path)?;
                    ParquetWriter::new(file).finish(&mut candles_df_clone)?;
                    total_candles += candles_df.height();

                    // If candles_only, also generate synthetic trades from candles
                    if candles_only {
                        let mut synthetic_df = candles_to_trades(&candles_df, market)?;
                        if synthetic_df.height() > 0 {
                            let out_path = output_dir.join(format!("{}_std.parquet", safe_name));
                            let file = std::fs::File::create(&out_path)?;
                            ParquetWriter::new(file).finish(&mut synthetic_df)?;
                            total_trades += synthetic_df.height();
                        }
                    }

                    all_candles_dfs.push(candles_df);
                    print!(" + {} candles", total_candles);
                }

                thread::sleep(Duration::from_millis(200));
            }
        }

        println!(); // newline
        thread::sleep(Duration::from_millis(300));
    }

    // Save combined candles file
    if !all_candles_dfs.is_empty() {
        let mut combined = all_candles_dfs.remove(0);
        for df in all_candles_dfs {
            combined = combined.vstack(&df)?;
        }
        combined = combined.sort(["timestamp"], Default::default())?;

        let combined_path = candles_dir.join("_all_candles.parquet");
        let file = std::fs::File::create(&combined_path)?;
        ParquetWriter::new(file).finish(&mut combined)?;
        println!("\n  Combined candles saved to {:?}", combined_path);
    }

    println!("\nDone!");
    if !candles_only {
        println!("  Trades: {} from {} markets → {:?}", total_trades, markets.len() - skipped, output_dir);
    }
    if fetch_candles_flag || candles_only {
        println!("  Candles: {} → {:?}", total_candles, candles_dir);
    }
    println!("  Markets metadata: {:?}", markets_dir);

    Ok(())
}

/// Default output directories (relative to the binary location).
pub fn default_output_dir() -> PathBuf {
    PathBuf::from("data/polymarket/standardized_trades")
}

pub fn default_markets_dir() -> PathBuf {
    PathBuf::from("data/polymarket/markets")
}

pub fn default_candles_dir() -> PathBuf {
    PathBuf::from("data/polymarket/candles")
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn parse_timestamp_to_string(ts: &str) -> String {
    // Try to parse ISO 8601 and output as "YYYY-MM-DD HH:MM:SS"
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S") {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S") {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // Try with timezone offset
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return dt.naive_utc().format("%Y-%m-%d %H:%M:%S").to_string();
    }
    ts.to_string()
}
