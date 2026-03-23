//! BacktestEngine — core logic for running a backtest on prediction market data.
//!
//! Direct port of backtest_engine.py: loads trades from Parquet via Polars,
//! iterates chronologically, calls a user-supplied strategy function per trade,
//! settles resolved positions, and computes final metrics.

use std::collections::HashMap;
use anyhow::{Result, bail};
use chrono::NaiveDateTime;
use glob::glob;
use polars::prelude::*;
use serde::{Serialize, Deserialize};

// ── Types ──────────────────────────────────────────────────────────────────────

/// A single trade row in the standardised schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub platform: Option<String>,
    pub timestamp: Option<NaiveDateTime>,
    pub title: Option<String>,
    pub volume: Option<f64>,
    pub market_id: Option<String>,
    pub market_category: Option<String>,
    pub position: Option<String>,
    pub possible_outcomes: Option<Vec<String>>,
    pub price: Option<f64>,
    pub amount: Option<f64>,
    pub wallet_maker: Option<String>,
    pub wallet_taker: Option<String>,
}

/// Action returned by a strategy function.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub market_id: String,
    pub position: String,
    pub amount: i64,
    #[serde(default)]
    pub user_perso_parameters: Option<serde_json::Value>,
}

/// An executed-trade log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeLogEntry {
    pub market_id: String,
    pub position: String,
    pub amount: i64,
    pub cost: f64,
    pub time: Option<NaiveDateTime>,
}

/// A settle-log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettleLogEntry {
    pub market_id: String,
    pub position: String,
    pub amount: i64,
    pub outcome: Option<String>,
    pub refund: Option<f64>,
    pub timestamp: Option<NaiveDateTime>,
    /// Exit reason: "RESOLUTION", "STOP_LOSS", "TAKE_PROFIT", "TRAILING_STOP", "MAX_HOLD_TIME", "REIMBURSED"
    #[serde(default)]
    pub exit_reason: Option<String>,
    /// Price at which the position was exited (for SL/TP/trailing)
    #[serde(default)]
    pub exit_price: Option<f64>,
}

/// Portfolio state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portfolio {
    pub cash: f64,
    /// Key = (market_id, position), value = amount held.
    pub positions: HashMap<(String, String), i64>,
}

/// Final metrics returned by `BacktestEngine::run`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metrics {
    pub trades_executed: usize,
    pub final_cash: f64,
    pub initial_cash: f64,
    pub total_pnl: f64,
    pub roi_percent: f64,
    pub open_positions: HashMap<(String, String), i64>,
    pub final_portfolio: Portfolio,
}

/// Strategy function signature — matches the Python callback:
///   fn(trade, trade_log, portfolio, user_perso_parameters) -> Action
pub type StrategyFn = fn(&Trade, &[TradeLogEntry], &Portfolio, &serde_json::Value) -> Action;

// ── Column selector ────────────────────────────────────────────────────────────

const ALL_COLUMNS: [&str; 12] = [
    "platform", "timestamp", "title", "volume", "market_id", "market_category",
    "position", "possible_outcomes", "price", "amount", "wallet_maker", "wallet_taker",
];

fn selected_columns(strat_var: &[bool; 12]) -> Vec<String> {
    ALL_COLUMNS
        .iter()
        .zip(strat_var.iter())
        .filter_map(|(col, &use_it)| if use_it { Some(col.to_string()) } else { None })
        .collect()
}

// ── Engine ─────────────────────────────────────────────────────────────────────

pub struct BacktestEngine {
    pub initial_cash: f64,
    pub reimburse_open_positions: bool,

    // Exit rules
    pub stop_loss: Option<f64>,       // close if price drops this % from entry (e.g. 0.20 = 20%)
    pub take_profit: Option<f64>,     // close if price rises this % from entry (e.g. 0.50 = 50%)
    pub trailing_stop: Option<f64>,   // close if price drops this % from peak (e.g. 0.10 = 10%)
    pub max_hold_hours: Option<f64>,  // close after this many hours

    // Filters
    pub platform: Option<Vec<String>>,
    pub timestamp_start: Option<NaiveDateTime>,
    pub timestamp_end: Option<NaiveDateTime>,
    pub market_id: Option<Vec<String>>,
    pub market_title: Option<Vec<String>>,
    pub volume_inf: Option<f64>,
    pub volume_sup: Option<f64>,
    pub market_category: Option<Vec<String>>,
    pub position: Option<Vec<String>>,
    pub possible_outcomes: Option<Vec<String>>,
    pub price_inf: Option<f64>,
    pub price_sup: Option<f64>,
    pub amount_inf: Option<f64>,
    pub amount_sup: Option<f64>,
    pub wallet_maker: Option<Vec<String>>,
    pub wallet_taker: Option<Vec<String>>,

    strat_var: [bool; 12],
    pub data_path: String,

    // Runtime state
    pub trades_df: Option<DataFrame>,
    pub valid_market_ids: Vec<String>,
    pub market_possible_outcomes: HashMap<String, Vec<String>>,
    pub market_outcomes: HashMap<String, (Option<String>, NaiveDateTime)>,
    pub trade_log: Vec<TradeLogEntry>,
    pub settle_log: Vec<SettleLogEntry>,
    pub portfolio: Portfolio,
    last_known_price: HashMap<(String, String), f64>,
    /// Weighted average entry price per position (market_id, position) → avg_price
    entry_prices: HashMap<(String, String), f64>,
    /// Highest price seen since entry per position (for trailing stop)
    peak_prices: HashMap<(String, String), f64>,
    /// Entry timestamp per position (for max_hold_hours)
    entry_times: HashMap<(String, String), NaiveDateTime>,
}

impl BacktestEngine {
    pub fn new(
        initial_cash: f64,
        strat_var: Option<[bool; 12]>,
        reimburse_open_positions: bool,
        platform: Option<Vec<String>>,
        timestamp_start: Option<NaiveDateTime>,
        timestamp_end: Option<NaiveDateTime>,
        market_id: Option<Vec<String>>,
        market_title: Option<Vec<String>>,
        volume_inf: Option<f64>,
        volume_sup: Option<f64>,
        market_category: Option<Vec<String>>,
        position: Option<Vec<String>>,
        possible_outcomes: Option<Vec<String>>,
        price_inf: Option<f64>,
        price_sup: Option<f64>,
        amount_inf: Option<f64>,
        amount_sup: Option<f64>,
        wallet_maker: Option<Vec<String>>,
        wallet_taker: Option<Vec<String>>,
        data_path: String,
    ) -> Self {
        Self {
            initial_cash,
            reimburse_open_positions,
            stop_loss: None,
            take_profit: None,
            trailing_stop: None,
            max_hold_hours: None,
            platform,
            timestamp_start,
            timestamp_end,
            market_id,
            market_title,
            volume_inf,
            volume_sup,
            market_category,
            position,
            possible_outcomes,
            price_inf,
            price_sup,
            amount_inf,
            amount_sup,
            wallet_maker,
            wallet_taker,
            strat_var: strat_var.unwrap_or([true; 12]),
            data_path,
            trades_df: None,
            valid_market_ids: Vec::new(),
            market_possible_outcomes: HashMap::new(),
            market_outcomes: HashMap::new(),
            trade_log: Vec::new(),
            settle_log: Vec::new(),
            portfolio: Portfolio {
                cash: initial_cash,
                positions: HashMap::new(),
            },
            last_known_price: HashMap::new(),
            entry_prices: HashMap::new(),
            peak_prices: HashMap::new(),
            entry_times: HashMap::new(),
        }
    }

    // ── Load trades ────────────────────────────────────────────────────────

    pub fn load_trades(&mut self) -> Result<()> {
        let platforms = self.platform.clone().unwrap_or_default();
        let mut dfs: Vec<DataFrame> = Vec::new();

        if platforms.contains(&"kalshi".to_string()) {
            let df = self.load_trades_kalshi()?;
            dfs.push(df);
        }
        if platforms.contains(&"polymarket".to_string()) {
            let df = self.load_trades_polymarket()?;
            dfs.push(df);
        }
        if dfs.is_empty() {
            bail!("Unknown platform: {:?}", platforms);
        }

        // Concat all DataFrames
        let mut combined = dfs.remove(0);
        for df in dfs {
            combined = combined.vstack(&df)?;
        }

        // Sort by timestamp
        combined = combined.sort(["timestamp"], Default::default())?;

        // Extract valid market ids
        let market_id_col = combined.column("market_id")?.str()?;
        let mut ids_set = std::collections::HashSet::new();
        for val in market_id_col.into_iter() {
            if let Some(v) = val {
                ids_set.insert(v.to_string());
            }
        }
        self.valid_market_ids = ids_set.into_iter().collect();

        // Build market_possible_outcomes: first possible_outcomes per market_id
        self.market_possible_outcomes = Self::build_market_outcomes_map(&combined)?;

        println!("Loaded {} trades", combined.height());
        self.trades_df = Some(combined);
        Ok(())
    }

    fn build_market_outcomes_map(df: &DataFrame) -> Result<HashMap<String, Vec<String>>> {
        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        let mid_col = df.column("market_id")?.str()?;
        let po_col = df.column("possible_outcomes")?.str()?;

        for i in 0..df.height() {
            if let (Some(mid), Some(po_str)) = (mid_col.get(i), po_col.get(i)) {
                let mid = mid.to_string();
                if !map.contains_key(&mid) {
                    if let Ok(outcomes) = serde_json::from_str::<Vec<String>>(po_str) {
                        map.insert(mid, outcomes);
                    }
                }
            }
        }
        Ok(map)
    }

    fn load_trades_kalshi(&self) -> Result<DataFrame> {
        let pattern = format!("{}/kalshi/standardized_trades/*.parquet", self.data_path);
        let files = Self::glob_parquet(&pattern)?;
        if files.is_empty() {
            bail!("No Kalshi parquet files found at {}", pattern);
        }

        let cols = selected_columns(&self.strat_var);
        let mut lf = Self::scan_parquet_files(&files, &cols)?;
        lf = self.apply_common_filters(lf);
        lf = self.apply_kalshi_filters(lf);
        lf = lf.sort(["timestamp"], Default::default());

        let mut df = lf.collect()?;
        // Convert timestamp to naive datetime (strip tz)
        df = Self::normalize_timestamp(df)?;
        Ok(df)
    }

    fn load_trades_polymarket(&self) -> Result<DataFrame> {
        let pattern = format!("{}/polymarket/standardized_trades/*.parquet", self.data_path);
        let files = Self::glob_parquet(&pattern)?;
        if files.is_empty() {
            bail!("No Polymarket parquet files found at {}", pattern);
        }

        let cols = selected_columns(&self.strat_var);
        let mut lf = Self::scan_parquet_files(&files, &cols)?;
        lf = self.apply_common_filters(lf);
        lf = self.apply_polymarket_filters(lf);
        lf = lf.sort(["timestamp"], Default::default());

        let mut df = lf.collect()?;
        df = Self::normalize_timestamp(df)?;
        Ok(df)
    }

    fn glob_parquet(pattern: &str) -> Result<Vec<String>> {
        let mut files: Vec<String> = Vec::new();
        for entry in glob(pattern)? {
            let path = entry?;
            let fname = path.file_name().unwrap_or_default().to_string_lossy();
            if !fname.starts_with("._") {
                files.push(path.to_string_lossy().to_string());
            }
        }
        Ok(files)
    }

    fn scan_parquet_files(files: &[String], cols: &[String]) -> Result<LazyFrame> {
        let paths: Vec<std::path::PathBuf> = files.iter().map(std::path::PathBuf::from).collect();

        let args = ScanArgsParquet {
            ..Default::default()
        };

        let lf = LazyFrame::scan_parquet_files(paths.into(), args)?;

        // Select only the columns we need (that exist in the schema)
        let col_exprs: Vec<Expr> = cols.iter().map(|c| col(c.as_str())).collect();
        if !col_exprs.is_empty() {
            Ok(lf.select(col_exprs))
        } else {
            Ok(lf)
        }
    }

    fn normalize_timestamp(df: DataFrame) -> Result<DataFrame> {
        // Timestamp parsing is handled at row-extraction time in extract_naive_datetime.
        // No need to transform the column in-place.
        Ok(df)
    }

    fn apply_common_filters(&self, mut lf: LazyFrame) -> LazyFrame {
        // Timestamps may be stored as strings "YYYY-MM-DD HH:MM:SS" or as datetime.
        // Use string comparison which works for both (ISO format sorts lexicographically).
        if let Some(ref ts_start) = self.timestamp_start {
            let ts_str = ts_start.format("%Y-%m-%d %H:%M:%S").to_string();
            lf = lf.filter(col("timestamp").cast(DataType::String).gt_eq(lit(ts_str)));
        }
        if let Some(ref ts_end) = self.timestamp_end {
            let ts_str = ts_end.format("%Y-%m-%d %H:%M:%S").to_string();
            lf = lf.filter(col("timestamp").cast(DataType::String).lt_eq(lit(ts_str)));
        }
        if let Some(ref ids) = self.market_id {
            let series = Series::new(PlSmallStr::from("_filter"), ids);
            lf = lf.filter(col("market_id").is_in(lit(series)));
        }
        if let Some(ref cats) = self.market_category {
            let series = Series::new(PlSmallStr::from("_filter"), cats);
            lf = lf.filter(col("market_category").is_in(lit(series)));
        }
        if let Some(pi) = self.price_inf {
            lf = lf.filter(col("price").gt_eq(lit(pi)));
        }
        if let Some(ps) = self.price_sup {
            lf = lf.filter(col("price").lt_eq(lit(ps)));
        }
        if let Some(ai) = self.amount_inf {
            lf = lf.filter(col("amount").gt_eq(lit(ai)));
        }
        if let Some(a_s) = self.amount_sup {
            lf = lf.filter(col("amount").lt_eq(lit(a_s)));
        }
        if let Some(ref pos) = self.position {
            let series = Series::new(PlSmallStr::from("_filter"), pos);
            lf = lf.filter(col("position").is_in(lit(series)));
        }
        lf
    }

    fn apply_kalshi_filters(&self, mut lf: LazyFrame) -> LazyFrame {
        if let Some(ref titles) = self.market_title {
            let series = Series::new(PlSmallStr::from("_filter"), titles);
            lf = lf.filter(col("title").is_in(lit(series)));
        }
        if let Some(vi) = self.volume_inf {
            lf = lf.filter(col("volume").gt_eq(lit(vi)));
        }
        if let Some(vs) = self.volume_sup {
            lf = lf.filter(col("volume").lt_eq(lit(vs)));
        }
        lf
    }

    fn apply_polymarket_filters(&self, mut lf: LazyFrame) -> LazyFrame {
        if let Some(ref titles) = self.market_title {
            let series = Series::new(PlSmallStr::from("_filter"), titles);
            lf = lf.filter(col("title").is_in(lit(series)));
        }
        if let Some(vi) = self.volume_inf {
            lf = lf.filter(col("volume").gt_eq(lit(vi)));
        }
        if let Some(vs) = self.volume_sup {
            lf = lf.filter(col("volume").lt_eq(lit(vs)));
        }
        lf
    }

    // ── Load outcomes ──────────────────────────────────────────────────────

    pub fn load_all_outcomes(&mut self) -> Result<()> {
        let platforms = self.platform.clone().unwrap_or_default();

        if platforms.contains(&"kalshi".to_string()) {
            let kalshi = self.load_outcomes_kalshi()?;
            self.market_outcomes.extend(kalshi);
        }
        if platforms.contains(&"polymarket".to_string()) {
            let poly = self.load_outcomes_polymarket()?;
            self.market_outcomes.extend(poly);
        }
        Ok(())
    }

    fn load_outcomes_kalshi(&self) -> Result<HashMap<String, (Option<String>, NaiveDateTime)>> {
        let pattern = format!("{}/kalshi/markets/*.parquet", self.data_path);
        let files = Self::glob_parquet(&pattern)?;
        if files.is_empty() {
            return Ok(HashMap::new());
        }

        let paths: Vec<std::path::PathBuf> = files.iter().map(std::path::PathBuf::from).collect();
        let args = ScanArgsParquet { ..Default::default() };
        let lf = LazyFrame::scan_parquet_files(paths.into(), args)?;

        // Filter for resolved markets in our valid set
        let valid_series = Series::new(PlSmallStr::from("_filter"), &self.valid_market_ids);
        let df = lf
            .select([col("ticker"), col("result"), col("close_time")])
            .filter(col("result").is_in(lit(Series::new(PlSmallStr::from("_f"), &["yes", "no"]))))
            .filter(col("ticker").is_in(lit(valid_series)))
            .collect()?;

        let mut map = HashMap::new();
        let ticker_col = df.column("ticker")?.str()?;
        let result_col = df.column("result")?.str()?;
        let close_col = df.column("close_time")?;

        for i in 0..df.height() {
            if let (Some(ticker), Some(result)) = (ticker_col.get(i), result_col.get(i)) {
                let outcome = if result.eq_ignore_ascii_case("yes") {
                    "Yes".to_string()
                } else {
                    "No".to_string()
                };
                // Parse close_time
                let far_future = NaiveDateTime::parse_from_str("2099-12-31 23:59:59", "%Y-%m-%d %H:%M:%S").unwrap();
                let close_time = Self::extract_naive_datetime(close_col, i)
                    .unwrap_or(far_future);
                map.insert(ticker.to_string(), (Some(outcome), close_time));
            }
        }
        Ok(map)
    }

    fn load_outcomes_polymarket(&self) -> Result<HashMap<String, (Option<String>, NaiveDateTime)>> {
        let pattern = format!("{}/polymarket/markets/*.parquet", self.data_path);
        let files = Self::glob_parquet(&pattern)?;
        if files.is_empty() {
            return Ok(HashMap::new());
        }

        let paths: Vec<std::path::PathBuf> = files.iter().map(std::path::PathBuf::from).collect();
        let args = ScanArgsParquet { ..Default::default() };
        let lf = LazyFrame::scan_parquet_files(paths.into(), args)?;

        let valid_series = Series::new(PlSmallStr::from("_filter"), &self.valid_market_ids);
        let df = lf
            .select([col("slug"), col("outcomes"), col("outcome_prices"), col("end_date")])
            .filter(col("slug").is_in(lit(valid_series)))
            .collect()?;

        let mut map = HashMap::new();
        let slug_col = df.column("slug")?.str()?;
        let outcomes_col = df.column("outcomes")?.str()?;
        let prices_col = df.column("outcome_prices")?.str()?;
        let end_col = df.column("end_date")?;

        for i in 0..df.height() {
            if let (Some(slug), Some(outcomes_str), Some(prices_str)) =
                (slug_col.get(i), outcomes_col.get(i), prices_col.get(i))
            {
                let final_outcome = Self::get_final_outcome(outcomes_str, prices_str);
                // Default to far future so unresolved markets are never settled by timestamp alone
                let far_future = NaiveDateTime::parse_from_str("2099-12-31 23:59:59", "%Y-%m-%d %H:%M:%S").unwrap();
                let end_date = Self::extract_naive_datetime(end_col, i)
                    .unwrap_or(far_future);
                map.insert(slug.to_string(), (final_outcome, end_date));
            }
        }
        Ok(map)
    }

    fn get_final_outcome(outcomes_str: &str, prices_str: &str) -> Option<String> {
        let outcomes: Vec<String> = serde_json::from_str(outcomes_str).ok()?;
        let prices: Vec<f64> = serde_json::from_str::<Vec<serde_json::Value>>(prices_str)
            .ok()?
            .iter()
            .map(|v| match v {
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                serde_json::Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
                _ => 0.0,
            })
            .collect();

        if prices.is_empty() || outcomes.is_empty() {
            return None;
        }

        let (best_idx, &best_price) = prices
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())?;

        if best_price >= 0.999 {
            outcomes.get(best_idx).cloned()
        } else {
            None
        }
    }

    fn extract_naive_datetime(col: &Column, idx: usize) -> Option<NaiveDateTime> {
        // Try datetime column first
        if let Ok(dt_col) = col.datetime() {
            if let Some(us) = dt_col.get(idx) {
                return chrono::DateTime::from_timestamp_micros(us)
                    .map(|dt| dt.naive_utc());
            }
        }
        // Try string column
        if let Ok(str_col) = col.str() {
            if let Some(s) = str_col.get(idx) {
                // Try common formats
                if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                    return Some(dt);
                }
                if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
                    return Some(dt);
                }
                if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f") {
                    return Some(dt);
                }
                // Try as date only
                if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    return Some(d.and_hms_opt(0, 0, 0).unwrap());
                }
            }
        }
        None
    }

    // ── Settle resolved positions ──────────────────────────────────────────

    fn settle_resolved_positions(&mut self, current_timestamp: NaiveDateTime) {
        let mut to_settle: Vec<(String, String, Option<String>)> = Vec::new();

        for (market_id, position) in self.portfolio.positions.keys() {
            if let Some((outcome, end_date)) = self.market_outcomes.get(market_id) {
                // Only settle if the market has actually resolved (outcome is known)
                // AND the current timestamp is past the end date
                if outcome.is_some() && current_timestamp >= *end_date {
                    to_settle.push((market_id.clone(), position.clone(), outcome.clone()));
                }
            }
        }

        for (market_id, position, outcome) in to_settle {
            let key = (market_id.clone(), position.clone());
            if let Some(&amount) = self.portfolio.positions.get(&key) {
                let won = outcome.as_ref() == Some(&position);
                if won {
                    // Winning side: payout = amount * 1.00
                    self.portfolio.cash += amount as f64 * 1.00;
                }
                // Log settlement for both winning and losing sides
                self.settle_log.push(SettleLogEntry {
                    market_id: market_id.clone(),
                    position: position.clone(),
                    amount,
                    outcome: outcome.clone(),
                    refund: None,
                    timestamp: Some(current_timestamp),
                    exit_reason: Some("RESOLUTION".to_string()),
                    exit_price: Some(if won { 1.0 } else { 0.0 }),
                });
                self.portfolio.positions.remove(&key);
                self.entry_prices.remove(&key);
                self.peak_prices.remove(&key);
                self.entry_times.remove(&key);
            }
        }
    }

    // ── Validate action ────────────────────────────────────────────────────

    fn is_valid_action(&self, action: &Action) -> Result<bool> {
        if !self.valid_market_ids.contains(&action.market_id) {
            bail!("Market ID '{}' not found in trade data", action.market_id);
        }

        if action.position != "hold" {
            if let Some(outcomes) = self.market_possible_outcomes.get(&action.market_id) {
                if !outcomes.contains(&action.position) {
                    bail!(
                        "Position '{}' not in possible outcomes {:?} for market '{}'",
                        action.position, outcomes, action.market_id
                    );
                }
            }
        }

        if action.amount < 0 {
            bail!("Amount must be a positive integer");
        }

        Ok(true)
    }

    fn get_market_last_price(&self, market_id: &str, position: &str) -> Result<f64> {
        let key = (market_id.to_string(), position.to_string());
        self.last_known_price
            .get(&key)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("No price found for market_id: {}, position: {}", market_id, position))
    }

    // ── Calculate metrics ──────────────────────────────────────────────────

    fn calculate_metrics(&self) -> Metrics {
        let total_pnl = self.portfolio.cash - self.initial_cash;
        let roi_percent = if self.initial_cash != 0.0 {
            (total_pnl / self.initial_cash) * 100.0
        } else {
            0.0
        };

        Metrics {
            trades_executed: self.trade_log.len(),
            final_cash: self.portfolio.cash,
            initial_cash: self.initial_cash,
            total_pnl,
            roi_percent,
            open_positions: self.portfolio.positions.clone(),
            final_portfolio: self.portfolio.clone(),
        }
    }

    // ── Check exit rules (SL / TP / Trailing / Max Hold) ──────────────────

    fn check_exit_rules(&mut self, current_timestamp: NaiveDateTime) {
        let has_any = self.stop_loss.is_some()
            || self.take_profit.is_some()
            || self.trailing_stop.is_some()
            || self.max_hold_hours.is_some();
        if !has_any {
            return;
        }

        let mut to_exit: Vec<(String, String, f64, String)> = Vec::new(); // (market_id, position, exit_price, reason)

        for ((market_id, position), &amount) in &self.portfolio.positions {
            let current_price = match self.last_known_price.get(&(market_id.clone(), position.clone())) {
                Some(&p) => p,
                None => continue,
            };
            let entry_price = match self.entry_prices.get(&(market_id.clone(), position.clone())) {
                Some(&p) => p,
                None => continue,
            };

            // Update peak price for trailing stop
            let peak = self.peak_prices
                .entry((market_id.clone(), position.clone()))
                .or_insert(entry_price);
            if current_price > *peak {
                *peak = current_price;
            }
            let peak_price = *peak;

            // Stop Loss: price dropped SL% from entry
            if let Some(sl_pct) = self.stop_loss {
                let sl_price = entry_price * (1.0 - sl_pct);
                if current_price <= sl_price {
                    to_exit.push((market_id.clone(), position.clone(), current_price, "STOP_LOSS".to_string()));
                    continue;
                }
            }

            // Take Profit: price rose TP% from entry
            if let Some(tp_pct) = self.take_profit {
                let tp_price = entry_price * (1.0 + tp_pct);
                if current_price >= tp_price {
                    to_exit.push((market_id.clone(), position.clone(), current_price, "TAKE_PROFIT".to_string()));
                    continue;
                }
            }

            // Trailing Stop: price dropped trailing% from peak
            if let Some(trail_pct) = self.trailing_stop {
                let trail_price = peak_price * (1.0 - trail_pct);
                if current_price <= trail_price && peak_price > entry_price {
                    to_exit.push((market_id.clone(), position.clone(), current_price, "TRAILING_STOP".to_string()));
                    continue;
                }
            }

            // Max Hold Time: position held too long
            if let Some(max_hours) = self.max_hold_hours {
                if let Some(entry_time) = self.entry_times.get(&(market_id.clone(), position.clone())) {
                    let hours_held = current_timestamp.signed_duration_since(*entry_time).num_hours() as f64;
                    if hours_held >= max_hours {
                        to_exit.push((market_id.clone(), position.clone(), current_price, "MAX_HOLD_TIME".to_string()));
                        continue;
                    }
                }
            }
        }

        // Execute exits
        for (market_id, position, exit_price, reason) in to_exit {
            let key = (market_id.clone(), position.clone());
            if let Some(&amount) = self.portfolio.positions.get(&key) {
                let payout = (amount as f64 * exit_price * 1e6).round() / 1e6;
                self.portfolio.cash += payout;
                println!(
                    "[EXIT:{}] market={} pos={} amount={} exit_price={:.4} payout={:.2} cash_after={:.2}",
                    reason, market_id, position, amount, exit_price, payout, self.portfolio.cash
                );
                self.settle_log.push(SettleLogEntry {
                    market_id: market_id.clone(),
                    position: position.clone(),
                    amount,
                    outcome: None,
                    refund: Some(payout),
                    timestamp: Some(current_timestamp),
                    exit_reason: Some(reason),
                    exit_price: Some(exit_price),
                });
                self.portfolio.positions.remove(&key);
                self.entry_prices.remove(&key);
                self.peak_prices.remove(&key);
                self.entry_times.remove(&key);
            }
        }
    }

    // ── Reimburse open positions ───────────────────────────────────────────

    fn reimburse_open(&mut self) {
        let keys: Vec<(String, String)> = self.portfolio.positions.keys().cloned().collect();
        for key in keys {
            let amount = self.portfolio.positions[&key];
            match self.get_market_last_price(&key.0, &key.1) {
                Ok(last_price) => {
                    let refund = (amount as f64 * last_price * 1e6).round() / 1e6;
                    self.portfolio.cash += refund;
                    self.settle_log.push(SettleLogEntry {
                        market_id: key.0.clone(),
                        position: key.1.clone(),
                        amount,
                        outcome: None,
                        refund: Some(refund),
                        timestamp: None,
                        exit_reason: Some("REIMBURSED".to_string()),
                        exit_price: Some(last_price),
                    });
                }
                Err(e) => {
                    eprintln!("[Reimburse] Could not reimburse {} / {}: {}", key.0, key.1, e);
                }
            }
            self.portfolio.positions.remove(&key);
            self.entry_prices.remove(&key);
            self.peak_prices.remove(&key);
            self.entry_times.remove(&key);
        }
    }

    // ── Run ────────────────────────────────────────────────────────────────

    /// Run the backtest with default (empty) strategy parameters.
    pub fn run(&mut self, strategy_func: StrategyFn) -> Result<Metrics> {
        self.run_with_params(strategy_func, serde_json::Value::Object(serde_json::Map::new()))
    }

    /// Run the backtest loop with the given strategy function.
    /// `strategy_params` are the user-customizable strategy parameters (threshold_low, amount, etc.)
    /// that get passed as the initial `user_perso_parameters` to every strategy call.
    pub fn run_with_params(&mut self, strategy_func: StrategyFn, strategy_params: serde_json::Value) -> Result<Metrics> {
        println!("Loading trades...");
        self.load_trades()?;
        println!("Loading market outcomes...");
        self.load_all_outcomes()?;

        let mut user_perso_parameters = strategy_params;
        self.last_known_price.clear();
        self.settle_log.clear();
        self.trade_log.clear();
        self.entry_prices.clear();
        self.peak_prices.clear();
        self.entry_times.clear();
        self.portfolio = Portfolio {
            cash: self.initial_cash,
            positions: HashMap::new(),
        };

        let df = self.trades_df.take().expect("trades_df should be loaded");
        let total_rows = df.height();

        println!("Starting backtest...");

        // Extract columns for fast row access
        let platform_col = df.column("platform").ok().and_then(|c| c.str().ok().cloned());
        let timestamp_col = df.column("timestamp").ok().cloned();
        let title_col = df.column("title").ok().and_then(|c| c.str().ok().cloned());
        let volume_col = df.column("volume").ok().and_then(|c| c.f64().ok().cloned());
        let market_id_col = df.column("market_id").ok().and_then(|c| c.str().ok().cloned());
        let market_cat_col = df.column("market_category").ok().and_then(|c| c.str().ok().cloned());
        let position_col = df.column("position").ok().and_then(|c| c.str().ok().cloned());
        let po_col = df.column("possible_outcomes").ok().and_then(|c| c.str().ok().cloned());
        let price_col = df.column("price").ok().and_then(|c| c.f64().ok().cloned());
        let amount_col = df.column("amount").ok().and_then(|c| c.f64().ok().cloned());
        let wm_col = df.column("wallet_maker").ok().and_then(|c| c.str().ok().cloned());
        let wt_col = df.column("wallet_taker").ok().and_then(|c| c.str().ok().cloned());

        for idx in 0..total_rows {
            let cpt = idx + 1;
            if cpt % 1000 == 0 || cpt == total_rows {
                eprint!("\rProcessing trade {}/{}", cpt, total_rows);
            }

            let trade = Trade {
                platform: platform_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                timestamp: timestamp_col.as_ref().and_then(|c| Self::extract_naive_datetime(c, idx)),
                title: title_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                volume: volume_col.as_ref().and_then(|c| c.get(idx)),
                market_id: market_id_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                market_category: market_cat_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                position: position_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                possible_outcomes: po_col.as_ref().and_then(|c| c.get(idx)).and_then(|s| serde_json::from_str(s).ok()),
                price: price_col.as_ref().and_then(|c| c.get(idx)),
                amount: amount_col.as_ref().and_then(|c| c.get(idx)),
                wallet_maker: wm_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
                wallet_taker: wt_col.as_ref().and_then(|c| c.get(idx).map(|s| s.to_string())),
            };

            // Update rolling price dict
            if let (Some(ref mid), Some(ref pos), Some(price)) = (&trade.market_id, &trade.position, trade.price) {
                self.last_known_price.insert((mid.clone(), pos.clone()), price);
            }

            // Settle resolved positions
            if let Some(ts) = trade.timestamp {
                self.settle_resolved_positions(ts);
                // Check exit rules (SL/TP/trailing/max hold)
                self.check_exit_rules(ts);
            }

            // Call user strategy
            let action = strategy_func(&trade, &self.trade_log, &self.portfolio, &user_perso_parameters);

            // Update user_perso_parameters if strategy provided them
            if let Some(ref new_params) = action.user_perso_parameters {
                user_perso_parameters = new_params.clone();
            }

            // Validate action
            if self.is_valid_action(&action).is_err() {
                continue;
            }

            // Hold — do nothing
            if action.position == "hold" {
                continue;
            }

            // Compute cost via rolling price dict
            let price = match self.get_market_last_price(&action.market_id, &action.position) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let cost = (action.amount as f64 * price * 1e6).round() / 1e6;

            // Reject if not enough cash
            if cost > self.portfolio.cash {
                continue;
            }

            // Execute trade
            self.portfolio.cash -= cost;
            println!(
                "[TRADE] market={} pos={} amount={} price={} cost={} cash_after={:.2}",
                action.market_id, action.position, action.amount, price, cost, self.portfolio.cash
            );

            let key = (action.market_id.clone(), action.position.clone());
            let existing_amount = *self.portfolio.positions.get(&key).unwrap_or(&0);
            let new_amount = existing_amount + action.amount;
            *self.portfolio.positions.entry(key.clone()).or_insert(0) += action.amount;

            // Update weighted average entry price
            let old_entry = self.entry_prices.get(&key).copied().unwrap_or(0.0);
            let new_avg = if new_amount > 0 {
                (old_entry * existing_amount as f64 + cost) / new_amount as f64
            } else {
                price
            };
            self.entry_prices.insert(key.clone(), new_avg);

            // Initialize peak price for trailing stop
            self.peak_prices.entry(key.clone()).or_insert(price);

            // Track entry time (first entry time)
            if let Some(ts) = trade.timestamp {
                self.entry_times.entry(key).or_insert(ts);
            }

            // Log the trade
            self.trade_log.push(TradeLogEntry {
                market_id: action.market_id,
                position: action.position,
                amount: action.amount,
                cost,
                time: trade.timestamp,
            });
        }
        eprintln!(); // newline after progress

        if self.reimburse_open_positions {
            self.reimburse_open();
        }

        println!("{:?}", self.settle_log);
        Ok(self.calculate_metrics())
    }
}
