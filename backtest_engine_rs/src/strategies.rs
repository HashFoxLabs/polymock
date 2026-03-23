//! Mean reversion example strategies — direct port of mean_reversion_example_strategies.py
//!
//! inputs:
//!   - trade: the current trade being processed
//!   - trade_log: list of all past trades executed by the strategy
//!   - portfolio: current state of the portfolio
//!   - user_perso_parameters: JSON value for custom persistent parameters
//!     Customizable keys (set via frontend/terminal):
//!       "threshold_low": f64 — buy when price <= this (default 0.01)
//!       "amount": i64 — fixed amount per trade (default 10)
//!       "cooldown_days": i64 — for time-based strategy (default 1)
//!
//! output:
//!   Action { market_id, position, amount, user_perso_parameters }

use crate::engine::{Action, Trade, TradeLogEntry, Portfolio};

/// Read threshold_low from user params, fallback to default.
fn get_threshold(params: &serde_json::Value, default: f64) -> f64 {
    params.get("threshold_low")
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}

/// Read fixed amount from user params, fallback to default.
fn get_amount(params: &serde_json::Value, default: i64) -> i64 {
    params.get("amount")
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

/// Read cooldown days from user params, fallback to default.
fn get_cooldown_days(params: &serde_json::Value, default: i64) -> i64 {
    params.get("cooldown_days")
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn hold_action(market_id: &str) -> Action {
    Action {
        market_id: market_id.to_string(),
        position: "hold".to_string(),
        amount: 0,
        user_perso_parameters: None,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 1: Basic mean reversion — buy low
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion(
    trade: &Trade,
    _trade_log: &[TradeLogEntry],
    _portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let amount = get_amount(user_perso_parameters, 10);
    let market_id = trade.market_id.as_deref().unwrap_or("");

    if trade.price.unwrap_or(f64::MAX) <= threshold_low {
        Action {
            market_id: market_id.to_string(),
            position: trade.position.clone().unwrap_or_else(|| "hold".to_string()),
            amount,
            user_perso_parameters: None,
        }
    } else {
        hold_action(market_id)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 2: Mean reversion with portfolio cash — dynamic sizing
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion_with_portfolio_cash(
    trade: &Trade,
    _trade_log: &[TradeLogEntry],
    portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let market_id = trade.market_id.as_deref().unwrap_or("");

    if trade.price.unwrap_or(f64::MAX) <= threshold_low {
        let amount = (portfolio.cash as i64) / 100;
        Action {
            market_id: market_id.to_string(),
            position: trade.position.clone().unwrap_or_else(|| "hold".to_string()),
            amount,
            user_perso_parameters: None,
        }
    } else {
        hold_action(market_id)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 3: Mean reversion with portfolio positions — no duplicates
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion_with_portfolio_positions(
    trade: &Trade,
    _trade_log: &[TradeLogEntry],
    portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let amount = get_amount(user_perso_parameters, 10);
    let market_id = trade.market_id.as_deref().unwrap_or("");
    let position = trade.position.as_deref().unwrap_or("hold");

    if trade.price.unwrap_or(f64::MAX) <= threshold_low {
        let key = (market_id.to_string(), position.to_string());
        if portfolio.positions.contains_key(&key) {
            hold_action(market_id)
        } else {
            Action {
                market_id: market_id.to_string(),
                position: position.to_string(),
                amount,
                user_perso_parameters: None,
            }
        }
    } else {
        hold_action(market_id)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 4: Mean reversion with trade log — buy only at better price
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion_with_trade_log(
    trade: &Trade,
    trade_log: &[TradeLogEntry],
    _portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let amount = get_amount(user_perso_parameters, 10);
    let market_id = trade.market_id.as_deref().unwrap_or("");
    let position = trade.position.as_deref().unwrap_or("hold");
    let price = trade.price.unwrap_or(f64::MAX);

    if price <= threshold_low {
        let trades_on_market: Vec<&TradeLogEntry> = trade_log
            .iter()
            .filter(|t| t.market_id == market_id && t.position == position)
            .collect();

        if !trades_on_market.is_empty() {
            let min_price = trades_on_market
                .iter()
                .map(|t| t.cost / t.amount as f64)
                .fold(f64::MAX, f64::min);

            if price < min_price {
                Action {
                    market_id: market_id.to_string(),
                    position: position.to_string(),
                    amount,
                    user_perso_parameters: None,
                }
            } else {
                hold_action(market_id)
            }
        } else {
            Action {
                market_id: market_id.to_string(),
                position: position.to_string(),
                amount,
                user_perso_parameters: None,
            }
        }
    } else {
        hold_action(market_id)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 5: Mean reversion with trade log time — cooldown
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion_with_trade_log_time(
    trade: &Trade,
    trade_log: &[TradeLogEntry],
    _portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let amount = get_amount(user_perso_parameters, 10);
    let cooldown_days = get_cooldown_days(user_perso_parameters, 1);
    let market_id = trade.market_id.as_deref().unwrap_or("");
    let position = trade.position.as_deref().unwrap_or("hold");
    let price = trade.price.unwrap_or(f64::MAX);

    if price <= threshold_low {
        let trades_on_market: Vec<&TradeLogEntry> = trade_log
            .iter()
            .filter(|t| t.market_id == market_id && t.position == position)
            .collect();

        if !trades_on_market.is_empty() {
            let latest_trade_time = trades_on_market
                .iter()
                .filter_map(|t| t.time)
                .max();

            if let (Some(latest), Some(current)) = (latest_trade_time, trade.timestamp) {
                let diff = current.signed_duration_since(latest);
                if diff.num_days() > cooldown_days {
                    Action {
                        market_id: market_id.to_string(),
                        position: position.to_string(),
                        amount,
                        user_perso_parameters: Some(user_perso_parameters.clone()),
                    }
                } else {
                    Action {
                        market_id: market_id.to_string(),
                        position: "hold".to_string(),
                        amount: 0,
                        user_perso_parameters: Some(user_perso_parameters.clone()),
                    }
                }
            } else {
                Action {
                    market_id: market_id.to_string(),
                    position: position.to_string(),
                    amount,
                    user_perso_parameters: Some(user_perso_parameters.clone()),
                }
            }
        } else {
            Action {
                market_id: market_id.to_string(),
                position: position.to_string(),
                amount,
                user_perso_parameters: Some(user_perso_parameters.clone()),
            }
        }
    } else {
        Action {
            market_id: market_id.to_string(),
            position: "hold".to_string(),
            amount: 0,
            user_perso_parameters: Some(user_perso_parameters.clone()),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy 6: Mean reversion with user_perso_parameter internal — scaled by exposure
// ═══════════════════════════════════════════════════════════════════════════════

pub fn mean_reversion_with_user_perso_parameter_internal(
    trade: &Trade,
    _trade_log: &[TradeLogEntry],
    _portfolio: &Portfolio,
    user_perso_parameters: &serde_json::Value,
) -> Action {
    let threshold_low = get_threshold(user_perso_parameters, 0.01);
    let market_id = trade.market_id.as_deref().unwrap_or("");
    let position = trade.position.as_deref().unwrap_or("hold");

    let mut params = user_perso_parameters.clone();

    // Ensure trade_count map exists
    if params.get("trade_count").is_none() {
        params["trade_count"] = serde_json::json!({});
    }

    // Increment trade count for this market
    let current_count = params["trade_count"]
        .get(market_id)
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    params["trade_count"][market_id] = serde_json::json!(current_count + 1);

    let trade_count = current_count + 1;

    if trade.price.unwrap_or(f64::MAX) <= threshold_low {
        let amount = std::cmp::min(100, trade_count);
        Action {
            market_id: market_id.to_string(),
            position: position.to_string(),
            amount,
            user_perso_parameters: Some(params),
        }
    } else {
        Action {
            market_id: market_id.to_string(),
            position: "hold".to_string(),
            amount: 0,
            user_perso_parameters: Some(params),
        }
    }
}

/// Returns a strategy function by name.
pub fn get_strategy(name: &str) -> Option<crate::engine::StrategyFn> {
    match name {
        "mean_reversion" => Some(mean_reversion),
        "mean_reversion_with_portfolio_cash" => Some(mean_reversion_with_portfolio_cash),
        "mean_reversion_with_portfolio_positions" => Some(mean_reversion_with_portfolio_positions),
        "mean_reversion_with_trade_log" => Some(mean_reversion_with_trade_log),
        "mean_reversion_with_trade_log_time" => Some(mean_reversion_with_trade_log_time),
        "mean_reversion_with_user_perso_parameter_internal" => Some(mean_reversion_with_user_perso_parameter_internal),
        _ => None,
    }
}

/// List all available strategy names.
pub fn list_strategies() -> Vec<&'static str> {
    vec![
        "mean_reversion",
        "mean_reversion_with_portfolio_cash",
        "mean_reversion_with_portfolio_positions",
        "mean_reversion_with_trade_log",
        "mean_reversion_with_trade_log_time",
        "mean_reversion_with_user_perso_parameter_internal",
    ]
}
