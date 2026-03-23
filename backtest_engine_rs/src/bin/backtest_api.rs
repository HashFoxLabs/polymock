//! Backtest API binary — accepts JSON config via stdin, runs the full pipeline:
//!   1. Fetch trades from Synthesis API → save as Parquet
//!   2. Run BacktestEngine on the Parquet data
//!   3. Output JSON result to stdout
//!
//! Input JSON (stdin):
//!   {
//!     "markets": [{ "conditionId": "...", "question": "...", ... }],
//!     "strategy": "mean_reversion",
//!     "initialCash": 10000,
//!     "reimburseOpenPositions": false,
//!     "maxTradesPerMarket": 50000,
//!     "priceInf": null,
//!     "priceSup": null,
//!     "position": null,
//!     "timestampStart": null,
//!     "timestampEnd": null
//!   }
//!
//! Output (stdout): NDJSON lines
//!   { "type": "progress", "progress": 10, "message": "..." }
//!   { "type": "result", "data": { ... } }
//!   { "type": "error", "error": "..." }

use backtest_engine_rs::engine::BacktestEngine;
use backtest_engine_rs::strategies;
use backtest_engine_rs::synthesis_loader;
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BacktestRequest {
    markets: Vec<serde_json::Value>,
    strategy: String,
    #[serde(default = "default_cash")]
    initial_cash: f64,
    #[serde(default)]
    reimburse_open_positions: bool,
    #[serde(default = "default_max_trades")]
    max_trades_per_market: usize,
    price_inf: Option<serde_json::Value>,
    price_sup: Option<serde_json::Value>,
    position: Option<serde_json::Value>,
    timestamp_start: Option<serde_json::Value>,
    timestamp_end: Option<serde_json::Value>,
    /// Strategy-specific parameters: threshold_low, amount, cooldown_days, etc.
    #[serde(default)]
    strategy_params: Option<serde_json::Value>,
    /// Stop loss: close if price drops this % from entry (e.g. 0.20 = 20%)
    stop_loss: Option<f64>,
    /// Take profit: close if price rises this % from entry (e.g. 0.50 = 50%)
    take_profit: Option<f64>,
    /// Trailing stop: close if price drops this % from peak (e.g. 0.10 = 10%)
    trailing_stop: Option<f64>,
    /// Max hold time in hours
    max_hold_hours: Option<f64>,
}

fn default_cash() -> f64 { 10000.0 }
fn default_max_trades() -> usize { 50000 }

/// Extract a string from a Value (handles strings, arrays of strings, numbers).
fn val_to_string(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Array(arr) => arr.first().and_then(|v| val_to_string(v)),
        _ => None,
    }
}

fn val_to_f64(v: &serde_json::Value) -> f64 {
    match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn val_to_string_vec(v: &serde_json::Value) -> Option<Vec<String>> {
    match v {
        serde_json::Value::Array(arr) => {
            Some(arr.iter().filter_map(|v| val_to_string(v)).collect())
        }
        _ => None,
    }
}

#[derive(Serialize)]
struct ProgressMsg {
    r#type: &'static str,
    progress: u32,
    message: String,
}

#[derive(Serialize)]
struct ErrorMsg {
    r#type: &'static str,
    error: String,
}

#[derive(Serialize)]
struct ResultMsg {
    r#type: &'static str,
    data: serde_json::Value,
}

fn send_progress(progress: u32, message: &str) {
    let msg = ProgressMsg { r#type: "progress", progress, message: message.to_string() };
    println!("{}", serde_json::to_string(&msg).unwrap());
}

fn send_error(error: &str) {
    let msg = ErrorMsg { r#type: "error", error: error.to_string() };
    println!("{}", serde_json::to_string(&msg).unwrap());
}

fn send_result(data: serde_json::Value) {
    let msg = ResultMsg { r#type: "result", data };
    println!("{}", serde_json::to_string(&msg).unwrap());
}

fn main() {
    // Read JSON from stdin
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        send_error(&format!("Failed to read stdin: {}", e));
        std::process::exit(1);
    }

    let req: BacktestRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[backtest_api] Parse error: {}", e);
            eprintln!("[backtest_api] Raw input ({} bytes):", input.len());
            // Show context around the error column
            if let Some(col) = extract_column(&format!("{}", e)) {
                let start = col.saturating_sub(100);
                let end = (col + 100).min(input.len());
                eprintln!("[backtest_api] ...around col {}: {}", col, &input[start..end]);
            } else {
                eprintln!("[backtest_api] {}", &input[..input.len().min(2000)]);
            }
            send_error(&format!("Invalid JSON input: {}", e));
            std::process::exit(1);
        }
    };

    if req.markets.is_empty() {
        send_error("No markets provided");
        std::process::exit(1);
    }

    let strategy_fn = match strategies::get_strategy(&req.strategy) {
        Some(f) => f,
        None => {
            send_error(&format!("Unknown strategy: {}", req.strategy));
            std::process::exit(1);
        }
    };

    let api_key = std::env::var("SYNTHESIS_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        send_error("SYNTHESIS_API_KEY environment variable not set");
        std::process::exit(1);
    }

    // Create a temp directory for Parquet files
    let tmp_dir = std::env::temp_dir().join(format!("backtest_{}", std::process::id()));
    let trades_dir = tmp_dir.join("polymarket/standardized_trades");
    let markets_dir = tmp_dir.join("polymarket/markets");
    std::fs::create_dir_all(&trades_dir).unwrap();
    std::fs::create_dir_all(&markets_dir).unwrap();

    send_progress(5, "Fetching trades from Synthesis...");

    // Convert MarketInput → SynthesisMarket and fetch trades
    let mut synthesis_markets: Vec<synthesis_loader::SynthesisMarket> = Vec::new();
    let market_count = req.markets.len().min(15);

    for (i, m) in req.markets.iter().take(market_count).enumerate() {
        send_progress(
            5 + ((i as u32 * 15) / market_count as u32),
            &format!("Fetching trades for market {}/{}...", i + 1, market_count),
        );

        let condition_id = m.get("conditionId").and_then(val_to_string).unwrap_or_default();
        if condition_id.is_empty() {
            eprintln!("  Skipping market {} (no conditionId)", i + 1);
            continue;
        }

        // Parse outcomes
        let outcomes_val = m.get("outcomes");
        let (left_outcome, right_outcome) = parse_outcomes(&outcomes_val.cloned());

        // Extract token IDs from either leftTokenId/rightTokenId or clobTokenIds
        let clob_ids = m.get("clobTokenIds").and_then(val_to_string_vec);
        let left_token = m.get("leftTokenId").and_then(val_to_string)
            .or_else(|| clob_ids.as_ref().and_then(|ids| ids.first().cloned()));
        let right_token = m.get("rightTokenId").and_then(val_to_string)
            .or_else(|| clob_ids.as_ref().and_then(|ids| ids.get(1).cloned()));

        // Determine resolved prices from resolvedOutcome
        // If a market resolved, set winning side price to "1" and losing to "0"
        // so the engine's get_final_outcome can detect resolution
        let resolved_outcome = m.get("resolvedOutcome").and_then(val_to_string);
        let (left_price, right_price, resolved) = match &resolved_outcome {
            Some(outcome) if outcome == &left_outcome => {
                (Some("1".to_string()), Some("0".to_string()), Some(true))
            }
            Some(outcome) if outcome == &right_outcome => {
                (Some("0".to_string()), Some("1".to_string()), Some(true))
            }
            Some(_) => {
                // Resolved but outcome doesn't match either side
                (None, None, Some(true))
            }
            None => (None, None, None),
        };

        // Build SynthesisMarket
        let synth_market = synthesis_loader::SynthesisMarket {
            condition_id: Some(condition_id.clone()),
            question: m.get("question").and_then(val_to_string),
            slug: m.get("slug").and_then(val_to_string),
            volume: m.get("volume").map(val_to_f64).unwrap_or(0.0),
            category: m.get("category").and_then(val_to_string),
            left_token_id: left_token,
            right_token_id: right_token,
            left_outcome: left_outcome.clone(),
            right_outcome: right_outcome.clone(),
            left_price,
            right_price,
            resolved,
            ends_at: m.get("endDate").and_then(val_to_string),
            image: None,
        };

        // Fetch trades for this market
        match synthesis_loader::fetch_trades_for_market(&api_key, &condition_id, req.max_trades_per_market) {
            Ok(trades) => {
                if !trades.is_empty() {
                    match synthesis_loader::transform_trades(&trades, &synth_market) {
                        Ok(mut df) => {
                            if df.height() > 0 {
                                let safe_name: String = synth_market.slug.as_deref()
                                    .unwrap_or(&condition_id[..std::cmp::min(16, condition_id.len())])
                                    .replace('/', "_")
                                    .replace(' ', "_")
                                    .chars()
                                    .take(80)
                                    .collect();
                                let out_path = trades_dir.join(format!("{}_std.parquet", safe_name));
                                let file = std::fs::File::create(&out_path).unwrap();
                                polars::prelude::ParquetWriter::new(file).finish(&mut df).unwrap();
                                eprintln!("  Saved {} trades for market {}", df.height(), safe_name);
                            }
                        }
                        Err(e) => eprintln!("  Transform error for {}: {}", condition_id, e),
                    }
                }
            }
            Err(e) => eprintln!("  Fetch error for {}: {}", condition_id, e),
        }

        synthesis_markets.push(synth_market);
    }

    // Save market metadata (needed for outcome resolution)
    if let Err(e) = synthesis_loader::save_market_metadata(&synthesis_markets, &markets_dir) {
        send_error(&format!("Failed to save market metadata: {}", e));
        cleanup(&tmp_dir);
        std::process::exit(1);
    }

    send_progress(20, "Trades loaded. Running backtest engine...");

    // Parse timestamp filters
    let ts_start = req.timestamp_start.as_ref().and_then(val_to_string).and_then(|s| parse_timestamp(&s));
    let ts_end = req.timestamp_end.as_ref().and_then(val_to_string).and_then(|s| parse_timestamp(&s));

    // Parse price filters
    let price_inf = req.price_inf.as_ref().map(val_to_f64);
    let price_sup = req.price_sup.as_ref().map(val_to_f64);

    // Parse position filter
    let position_filter = req.position.as_ref().and_then(|v| {
        if v.is_null() { return None; }
        if let Some(arr) = v.as_array() {
            return Some(arr.iter().filter_map(|x| x.as_str().map(String::from)).collect());
        }
        let p = val_to_string(v)?;
        if p == "Both" { Some(vec!["Yes".to_string(), "No".to_string()]) }
        else { Some(p.split(',').map(|s| s.trim().to_string()).collect()) }
    });

    // Build and run engine
    let mut engine = BacktestEngine::new(
        req.initial_cash,
        None,
        req.reimburse_open_positions,
        Some(vec!["polymarket".to_string()]),
        ts_start,
        ts_end,
        None, // market_id filter — we already fetched only the ones we need
        None, // market_title
        None, // volume_inf
        None, // volume_sup
        None, // market_category
        position_filter,
        None, // possible_outcomes
        price_inf,
        price_sup,
        None, // amount_inf
        None, // amount_sup
        None, // wallet_maker
        None, // wallet_taker
        tmp_dir.to_string_lossy().to_string(),
    );

    // Set exit rules
    engine.stop_loss = req.stop_loss;
    engine.take_profit = req.take_profit;
    engine.trailing_stop = req.trailing_stop;
    engine.max_hold_hours = req.max_hold_hours;

    let start_time = std::time::Instant::now();

    let strategy_params = req.strategy_params.unwrap_or_else(|| serde_json::json!({}));
    eprintln!("[backtest_api] Strategy params: {}", strategy_params);
    eprintln!("[backtest_api] Exit rules: SL={:?} TP={:?} trail={:?} max_hold={:?}",
        req.stop_loss, req.take_profit, req.trailing_stop, req.max_hold_hours);

    match engine.run_with_params(strategy_fn, strategy_params) {
        Ok(metrics) => {
            let execution_time = start_time.elapsed().as_millis() as u64;

            // Build trade log for output (serialize with string timestamps)
            let trade_log: Vec<serde_json::Value> = engine.trade_log.iter().map(|t| {
                serde_json::json!({
                    "market_id": t.market_id,
                    "position": t.position,
                    "amount": t.amount,
                    "cost": t.cost,
                    "time": t.time.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
                })
            }).collect();

            let settle_log: Vec<serde_json::Value> = engine.settle_log.iter().map(|s| {
                serde_json::json!({
                    "market_id": s.market_id,
                    "position": s.position,
                    "amount": s.amount,
                    "outcome": s.outcome,
                    "refund": s.refund,
                    "timestamp": s.timestamp.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
                    "exit_reason": s.exit_reason,
                    "exit_price": s.exit_price,
                })
            }).collect();

            let open_positions: serde_json::Map<String, serde_json::Value> = metrics.open_positions.iter()
                .map(|((mid, pos), amt)| {
                    (format!("{}|{}", mid, pos), serde_json::json!(amt))
                })
                .collect();

            let result = serde_json::json!({
                "trades_executed": metrics.trades_executed,
                "initial_cash": metrics.initial_cash,
                "final_cash": metrics.final_cash,
                "total_pnl": metrics.total_pnl,
                "roi_percent": metrics.roi_percent,
                "trade_log": trade_log,
                "settle_log": settle_log,
                "open_positions": open_positions,
                "execution_time": execution_time,
                "markets_analyzed": market_count,
            });

            send_progress(95, "Finalizing results...");
            send_result(result);
        }
        Err(e) => {
            send_error(&format!("Backtest engine error: {}", e));
        }
    }

    // Cleanup temp files
    cleanup(&tmp_dir);
}

fn parse_outcomes(outcomes: &Option<serde_json::Value>) -> (String, String) {
    match outcomes {
        Some(serde_json::Value::Array(arr)) => {
            let left = arr.first()
                .and_then(|v| v.as_str())
                .unwrap_or("Yes")
                .to_string();
            let right = arr.get(1)
                .and_then(|v| v.as_str())
                .unwrap_or("No")
                .to_string();
            (left, right)
        }
        Some(serde_json::Value::String(s)) => {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(s) {
                let left = arr.first().cloned().unwrap_or_else(|| "Yes".to_string());
                let right = arr.get(1).cloned().unwrap_or_else(|| "No".to_string());
                (left, right)
            } else {
                ("Yes".to_string(), "No".to_string())
            }
        }
        _ => ("Yes".to_string(), "No".to_string()),
    }
}

fn parse_timestamp(s: &str) -> Option<chrono::NaiveDateTime> {
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").ok())
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok())
        .or_else(|| {
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
        })
}

fn cleanup(tmp_dir: &std::path::Path) {
    if let Err(e) = std::fs::remove_dir_all(tmp_dir) {
        eprintln!("Warning: failed to cleanup temp dir {:?}: {}", tmp_dir, e);
    }
}

fn extract_column(err_msg: &str) -> Option<usize> {
    // serde error format: "... at line X column Y"
    let idx = err_msg.rfind("column ")?;
    err_msg[idx + 7..].split_whitespace().next()?.parse().ok()
}
