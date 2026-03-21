# =======================================================================================================================================

# # When receiving user code from the browser:
# try:
#     compiled = RestrictedStrategyExecutor.compile_strategy(user_code)
#     # Store compiled_code for later execution
#     engine.compiled_strategy = compiled
# except SyntaxError as e:
#     return {"error": str(e)}  # Return error to user


from RestrictedPython import compile_restricted
from RestrictedPython.Guards import safe_builtins, guarded_iter_unpack_sequence
import signal
import sys

class RestrictedStrategyExecutor:
    """Safely execute user-provided strategy functions."""
    
    TIMEOUT_SECONDS = 5  # Max time per trade evaluation
    
    @staticmethod
    def create_restricted_globals():
        """Build a safe globals dict for strategy execution."""
        safe_globals = {
            "__builtins__": safe_builtins,
            "__name__": "restricted_strategy",
            "__metaclass__": type,
            "_print_": print,  # Only allow print via guarded wrapper
            "_getiter_": iter,
            "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
            # Whitelist only safe imports
            "math": __import__("math"),
            "datetime": __import__("datetime"),
            "json": __import__("json"),
        }
        return safe_globals
    
    @staticmethod
    def compile_strategy(user_code: str):
        """Compile user code with RestrictedPython."""
        result = compile_restricted(user_code, filename="<strategy>", mode="exec")
        
        # Handle both old and new RestrictedPython API versions
        if hasattr(result, 'errors'):
            # Old API: returns object with .errors and .code attributes
            if result.errors:
                raise SyntaxError(f"Strategy compilation failed: {result.errors}")
            return result.code
        else:
            # New API: returns code object directly
            if result is None:
                raise SyntaxError("Strategy compilation failed: unknown error")
            return result
    
    @staticmethod
    def execute_strategy(compiled_code, strategy_params: dict, timeout=TIMEOUT_SECONDS):
        """Execute compiled strategy with timeout and call the defined function."""
        safe_globals = RestrictedStrategyExecutor.create_restricted_globals()
        safe_globals.update(strategy_params)
        
        def timeout_handler(signum, frame):
            raise TimeoutError(f"Strategy exceeded {timeout}s timeout")
        
        # Try to set up signal-based timeout (only works in main thread)
        signal_set = False
        try:
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(timeout)
            signal_set = True
        except ValueError:
            # Signal only works in main thread - skip timeout when running in thread pool
            pass
        
        try:
            exec(compiled_code, safe_globals)
            
            # Look for a callable (function) in the executed code
            # The user code typically defines a strategy function
            strategy_func = None
            for name, obj in safe_globals.items():
                if callable(obj) and not name.startswith('_'):
                    strategy_func = obj
                    break
            
            if strategy_func is None:
                # Fallback: look for 'action' variable (if user code just sets a variable)
                return safe_globals.get("action")
            
            # Call the strategy function with the provided parameters
            action = strategy_func(
                trade=safe_globals.get("trade"),
                trade_log=safe_globals.get("trade_log"),
                portfolio=safe_globals.get("portfolio"),
                user_perso_parameters=safe_globals.get("user_perso_parameters")
            )
            
            return action
        finally:
            if signal_set:
                signal.alarm(0)  # Disable alarm


# =======================================================================================================================================

"""
BacktestEngine class - core logic for running a backtest on prediction market data.
"""

from typing import Callable, Optional, Dict, Any
from glob import glob
from datetime import datetime
import duckdb
import pandas as pd
import json
import inspect
import os


# Try external disk first, then environment variable, then Docker fallback
if os.path.exists("/Volumes/Extreme SSD/prediction-market-data/data"):
    DATA_PATH = "/Volumes/Extreme SSD/prediction-market-data/data"
else:
    DATA_PATH = os.getenv("DATA_PATH", "/data/prediction-market-data/data")

class BacktestEngine:

    def __init__(self, 
                initial_cash: float = 10000, strat_var: Optional[list[bool]] = [True for i in range(12)], # user's strategy
                reimburse_open_positions: bool = False, # if True, refund open positions at last known price at end of backtest
                platform: list[str] = None, # filter
                timestamp_start: Optional[datetime] = None, # filter
                timestamp_end: Optional[datetime] = None, # filter
                market_id: list[str] = None, market_title: Optional[list[str]] = None, volume_inf: Optional[float] = None, volume_sup: Optional[float] = None, market_category: Optional[list[str]] = None, # filters on market characteristics
                position: list[str] = None, possible_outcomes: list[str] = None, price_inf: Optional[float] = None, price_sup: Optional[float] = None, amount_inf: Optional[float] = None, amount_sup: Optional[float] = None, # filters on trades characteristics
                wallet_maker: Optional[list[str]] = None, wallet_taker: Optional[list[str]] = None, # filters on wallets (only for Polymarket)
                ):

        self.initial_cash = initial_cash
        self.reimburse_open_positions = reimburse_open_positions

        self.platform = platform
        self.timestamp_start = timestamp_start
        self.timestamp_end = timestamp_end

        self.market_id = market_id # ticker for Kalshi, market_id for Polymarket
        self.market_title = market_title # only for Kalshi trades
        self.volume_inf = volume_inf # only for Kalshi trades
        self.volume_sup = volume_sup # only for Kalshi trades
        self.market_category = market_category
        self.position = position
        self.possible_outcomes = possible_outcomes
        self.price_inf = price_inf
        self.price_sup = price_sup
        self.amount_inf = amount_inf
        self.amount_sup = amount_sup

        self.wallet_maker = wallet_maker # only available for Polymarket trades
        self.wallet_taker = wallet_taker # only available for Polymarket trades

        self.columns = ['platform', 'timestamp', 'title', 'volume', 'market_id', 'category', 'position', 'possible_outcomes', 'price', 'amount', 'wallet_maker', 'wallet_taker']
        self.selected_columns = ", ".join([col for col, use in zip(self.columns, strat_var) if use])

        self.trade_log = []
        self.tp_sp_log = {}
        self.settle_log = []
        self.portfolio = {"cash": initial_cash, "positions": {}}

# =======================================================================================================================================

    def load_trades(self):
        
        # dfs = []
        # if "kalshi" in self.platform:
        #     self.load_trades_kalshi()
        #     self.kalshi_trades_df["timestamp"] = pd.to_datetime(self.kalshi_trades_df["timestamp"], utc=True).dt.tz_convert(None)
        #     dfs.append(self.kalshi_trades_df)
        if "polymarket" in self.platform:
            self.load_trades_polymarket_streaming()
            # self.polymarket_trades_df["timestamp"] = pd.to_datetime(self.polymarket_trades_df["timestamp"], utc=True).dt.tz_convert(None)
            # dfs.append(self.polymarket_trades_df)
        # if not dfs:
        #     raise ValueError(f"Unknown platform: {self.platform}")

        # self.trades_df = pd.concat(dfs, ignore_index=True).sort_values("timestamp").reset_index(drop=True)
        self.trades_df = self.polymarket_trades_df
        self.valid_market_ids = set(self.trades_df["market_id"].unique())
        self.market_possible_outcomes = self.trades_df.groupby("market_id")["possible_outcomes"].first().to_dict()
        print(f"Loaded {len(self.trades_df)} trades")


    def load_trades_kalshi(self):
        """Load Kalshi trades for a market."""
        trade_files = [f for f in glob(f"{DATA_PATH}/kalshi/standardized_trades/*.parquet") 
                       if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        query = f"""
            SELECT {self.selected_columns}
            FROM read_parquet({trade_files}, union_by_name=True)
            WHERE 1=1
        """
        
        if self.timestamp_start:
            query += f" AND timestamp >= '{self.timestamp_start}'"
        if self.timestamp_end:
            query += f" AND timestamp <= '{self.timestamp_end}'"

        if self.market_id is not None:
            query += f" AND market_id IN {tuple(self.market_id)}"
        if self.market_title is not None:
            query += f" AND title IN {tuple(self.market_title)}"
        if self.market_category is not None:
            query += f" AND category IN {tuple(self.market_category)}"
        if self.volume_inf is not None:
            query += f" AND volume >= {self.volume_inf}"
        if self.volume_sup is not None:
            query += f" AND volume <= {self.volume_sup}"

        if self.price_inf is not None:
            query += f" AND price >= {self.price_inf}"
        if self.price_sup is not None:
            query += f" AND price <= {self.price_sup}"
        if self.amount_inf is not None:
            query += f" AND amount >= {self.amount_inf}"
        if self.amount_sup is not None:
            query += f" AND amount <= {self.amount_sup}"

        if self.position is not None:
            conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
            query += f" AND ({conditions})"
        if self.possible_outcomes is not None:
            conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
            query += f" AND ({conditions})"
           
        query += " ORDER BY timestamp"
        self.kalshi_trades_df = con.execute(query).df()

    def load_trades_polymarket(self):
        """Load Polymarket trades for a market."""
        trade_files = [f for f in glob(f"{DATA_PATH}/polymarket/standardized_trades/*.parquet") 
                       if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        query = f"""
            SELECT {self.selected_columns}
            FROM read_parquet({trade_files}, union_by_name=True)
            WHERE 1=1
        """
        
        if self.timestamp_start:
            query += f" AND timestamp >= '{self.timestamp_start}'"
        if self.timestamp_end:
            query += f" AND timestamp <= '{self.timestamp_end}'"

        if self.market_id is not None:
            query += f" AND market_id IN {tuple(self.market_id)}"
        if self.market_title is not None:
            query += f" AND title IN {tuple(self.market_title)}"
        if self.volume_inf is not None:
            query += f" AND volume >= {self.volume_inf}"
        if self.volume_sup is not None:
            query += f" AND volume <= {self.volume_sup}"
        if self.market_category is not None:
            query += f" AND category IN {tuple(self.market_category)}"

        if self.price_inf is not None:
            query += f" AND price >= {self.price_inf}"
        if self.price_sup is not None:
            query += f" AND price <= {self.price_sup}"
        if self.amount_inf is not None:
            query += f" AND amount >= {self.amount_inf}"
        if self.amount_sup is not None:
            query += f" AND amount <= {self.amount_sup}"

        if self.position is not None:
            conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
            query += f" AND ({conditions})"
        if self.possible_outcomes is not None:
            conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
            query += f" AND ({conditions})"
           
        query += " ORDER BY timestamp"
        self.polymarket_trades_df = con.execute(query).df()

    def load_trades_polymarket_streaming(self):
        
        trade_files = [f for f in glob(f"{DATA_PATH}/polymarket/standardized_trades/*.parquet") 
                    if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        dfs = []
        
        for trade_file in trade_files:
            print(f"Loading trades from {trade_file}...")
            query = f"""
                SELECT {self.selected_columns}
                FROM read_parquet('{trade_file}')
                WHERE 1=1
            """
            
            # Apply all filters (including category)
            if self.timestamp_start:
                query += f" AND timestamp >= '{self.timestamp_start}'"
            if self.timestamp_end:
                query += f" AND timestamp <= '{self.timestamp_end}'"

            if self.market_id is not None:
                query += f" AND market_id IN {tuple(self.market_id)}"
            if self.market_title is not None:
                query += f" AND title IN {tuple(self.market_title)}"
            if self.volume_inf is not None:
                query += f" AND volume >= {self.volume_inf}"
            if self.volume_sup is not None:
                query += f" AND volume <= {self.volume_sup}"
            if self.market_category is not None:
                query += f" AND category IN {tuple(self.market_category)}"

            if self.price_inf is not None:
                query += f" AND price >= {self.price_inf}"
            if self.price_sup is not None:
                query += f" AND price <= {self.price_sup}"
            if self.amount_inf is not None:
                query += f" AND amount >= {self.amount_inf}"
            if self.amount_sup is not None:
                query += f" AND amount <= {self.amount_sup}"

            if self.position is not None:
                conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
                query += f" AND ({conditions})"
            if self.possible_outcomes is not None:
                conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
                query += f" AND ({conditions})"
            
            df = con.execute(query).df()
            print(f"Loaded {len(df)} trades from {trade_file}")
            df = df.sort_values("timestamp").reset_index(drop=True)
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(None)
            dfs.append(df)

        print(f"Finished loading all trade files. Total trades loaded: {sum(len(df) for df in dfs)}")
        
        # Efficiently merge pre-sorted dataframes using mergesort (O(n log k) for nearly-sorted data)
        self.polymarket_trades_df = pd.concat(dfs, ignore_index=True).sort_values(
            "timestamp", kind="mergesort"
        ).reset_index(drop=True)
        
        # Final sanity check
        print(f"Final combined trades sorted: {self.polymarket_trades_df['timestamp'].is_monotonic_increasing}")

# =======================================================================================================================================

    def load_all_outcomes(self):
        if "kalshi" in self.platform:
            self.load_all_outcomes_kalshi()
        if "polymarket" in self.platform:
            self.load_all_outcomes_polymarket()

        self.market_outcomes = {
            **getattr(self, "market_outcomes_kalshi", {}),
            **getattr(self, "market_outcomes_polymarket", {})
        }
    def load_all_outcomes_kalshi(self):
        """Load resolution outcomes only for markets present in the loaded trades."""

        market_files = [f for f in glob(f"{DATA_PATH}/kalshi/markets/*.parquet")
                        if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        tickers = tuple(self.valid_market_ids)

        result = con.execute(f"""
            SELECT ticker, result, close_time
            FROM read_parquet({market_files}, union_by_name=True)
            WHERE result IN ('yes', 'no')
            AND ticker IN {tickers}
        """).df()
        
        # Normalize timestamps vectorially before building dict
        result["result"] = result.apply(lambda row: "Yes" if row["result"].lower() == "yes" else "No", axis=1)
        result["close_time"] = pd.to_datetime(result["close_time"]).dt.tz_localize(None)
        
        # Build dict from zip — 100x faster than iterrows
        self.market_outcomes_kalshi = dict(zip(
            result["ticker"],
            zip(result["result"], result["close_time"])
    ))
        
    def load_all_outcomes_polymarket(self):
        """Load resolution outcomes only for markets present in the loaded trades."""

        market_files = [f for f in glob(f"{DATA_PATH}/polymarket/markets/*.parquet")
                        if not f.split('/')[-1].startswith("._")]
        con = duckdb.connect()
        market_ids = tuple(self.valid_market_ids)

        result = con.execute(f"""
            SELECT slug, outcomes, outcome_prices, end_date
            FROM read_parquet({market_files}, union_by_name=True)
            WHERE slug IN {market_ids}
        """).df()
        
        # Normalize timestamps vectorially before building dict
        def get_final_outcome(row):
            try:
                outcomes = json.loads(row["outcomes"])
                prices = [float(p) for p in json.loads(row["outcome_prices"])]
                best_idx = prices.index(max(prices))
                return outcomes[best_idx] if prices[best_idx] >= 0.999 else None
            except Exception:
                return None

        result["final_outcome"] = result.apply(get_final_outcome, axis=1)
        result["end_date"] = pd.to_datetime(result["end_date"]).dt.tz_localize(None)
        
        # Build dict from zip — 100x faster than iterrows
        self.market_outcomes_polymarket = dict(zip(
            result["slug"],
            zip(result["final_outcome"], result["end_date"])
    ))

# =======================================================================================================================================
    
    def _settle_resolved_positions(self, current_timestamp):
        """Settle any open positions whose market has resolved before current timestamp."""
        to_settle = []
        
        for (market_id, position) in list(self.portfolio["positions"].keys()):
            if market_id not in self.market_outcomes:
                continue
            
            outcome, end_date = self.market_outcomes[market_id]
            
            if current_timestamp >= end_date:
                to_settle.append((market_id, position, outcome))
        
        for market_id, position, outcome in to_settle:
            key = (market_id, position)
            amount = self.portfolio["positions"][key]
            
            if position == outcome:  # winning side
                self.portfolio["cash"] += amount * 1.00
                self.settle_log.append({
                "market_id": market_id,
                "position": position,
                "amount": amount,
                "outcome": outcome,
                "timestamp": current_timestamp
            })
            # losing side: payout = 0, just remove
            
            del self.portfolio["positions"][key]

    def _is_valid_action(self, action: Any) -> bool: # support function for the run method of the BacktestEngine class
        """Validate the action returned by the strategy function."""

        if not isinstance(action, dict):
            raise ValueError("Action returned by the strategy must be a dictionary")
        
        if "market_id" not in action or "position" not in action or "amount" not in action:
            raise ValueError("Action must contain 'market_id', 'position', and 'amount' keys")
        
        if action["market_id"] not in self.valid_market_ids:
            raise ValueError(f"Market ID '{action['market_id']}' not found in trade data")

        direction = action.get("direction")
        if direction is not None and direction not in ("buy", "hold", "sell"):
            raise ValueError(f"Direction must be 'buy', 'hold', or 'sell', got '{direction}'")

        # Only validate position as a market outcome when actually acting on it
        is_hold = (direction == "hold") or (direction is None and action["position"] == "hold")
        if not is_hold:
            possible_outcomes = self.market_possible_outcomes[action["market_id"]]
            if action["position"] not in possible_outcomes:
                raise ValueError(f"Position '{action['position']}' not in possible outcomes {possible_outcomes} for market '{action['market_id']}'")
        
        if not isinstance(action["amount"], int) or action["amount"] < 0:
            raise ValueError("Amount must be a positive integer")
        
        return True

    def _get_market_last_price(self, market_id: str, position: str) -> float:
        """Return the last known price for a specific (market_id, position) pair — O(1) via rolling dict."""
        key = (market_id, position)
        if key not in self._last_known_price:
            raise ValueError(f"No price found for market_id: {market_id}, position: {position}")
        return self._last_known_price[key]
    
    def _settle_take_profit_stop_losses(self, current_timestamp, market_id, position, price):
        if any(m == market_id and p == position for (m, p, t) in self.tp_sp_log):
            for (m,p,t), (amount, take_profit, stop_loss) in list(self.tp_sp_log.items()):
                if m == market_id and p == position:
                    if take_profit is not None and price >= take_profit:
                        proceeds = round(amount * price, 6)
                        self.portfolio["cash"] += proceeds
                        self.trade_log.append({
                            "market_id": market_id,
                            "position": position,
                            "direction": "sell",
                            "amount": amount,
                            "cost": -proceeds,
                            "time": t
                        })
                        del self.tp_sp_log[m,p,t]
                    elif stop_loss is not None and price <= stop_loss:
                        # For a stop loss, we assume the position is sold at the stop loss price
                        proceeds = round(amount * price, 6)
                        self.portfolio["cash"] += proceeds
                        self.trade_log.append({
                            "market_id": market_id,
                            "position": position,
                            "amount": amount,
                            "direction": "sell",
                            "cost": -proceeds,
                            "time": t
                        })
                        del self.tp_sp_log[m,p,t]
    

    def _mark_to_market_portfolio_value(self) -> float:
        """Estimate current portfolio value using the latest observed prices."""
        total_value = self.portfolio["cash"]
        for (market_id, position), amount in self.portfolio["positions"].items():
            last_price = self._last_known_price.get((market_id, position))
            if last_price is not None:
                total_value += amount * last_price
        return float(total_value)

    def _record_portfolio_snapshot(self, timestamp: Any):
        """Store a mark-to-market snapshot used for risk metrics."""
        self.portfolio_value_history.append({
            "timestamp": timestamp,
            "value": self._mark_to_market_portfolio_value(),
        })

    def _build_daily_equity_curve(self) -> pd.Series:
        """Convert irregular portfolio snapshots into a continuous daily end-of-day series."""
        history = getattr(self, "portfolio_value_history", [])
        if not history:
            return pd.Series(dtype=float)

        history_df = pd.DataFrame(history)
        if "timestamp" not in history_df.columns or "value" not in history_df.columns:
            return pd.Series(dtype=float)

        history_df["timestamp"] = pd.to_datetime(history_df["timestamp"], errors="coerce", utc=True).dt.tz_convert(None)
        history_df["value"] = pd.to_numeric(history_df["value"], errors="coerce")
        history_df = history_df.dropna(subset=["timestamp", "value"]).sort_values("timestamp")

        if history_df.empty:
            return pd.Series(dtype=float)

        daily_equity = history_df.set_index("timestamp")["value"].resample("D").last().ffill()
        return daily_equity.astype(float)

    def _calculate_metrics(self):
        """Calculate basic metrics after backtest."""
        annualization_days = 365.0
        annualization_sqrt = annualization_days ** 0.5

        equity_curve = self._build_daily_equity_curve()
        returns = equity_curve.pct_change().dropna() if len(equity_curve) > 1 else pd.Series(dtype=float)

        mean_daily_return = float(returns.mean()) if not returns.empty else 0.0
        daily_volatility = float(returns.std(ddof=0)) if not returns.empty else 0.0

        downside_returns = returns[returns < 0]
        downside_deviation_daily = float((downside_returns.pow(2).mean() ** 0.5)) if not downside_returns.empty else 0.0

        annualized_return = mean_daily_return * annualization_days
        annualized_volatility = daily_volatility * annualization_sqrt
        annualized_downside_deviation = downside_deviation_daily * annualization_sqrt

        if not equity_curve.empty:
            running_max = equity_curve.cummax()
            drawdowns = (equity_curve / running_max) - 1
            max_drawdown = float(drawdowns.min())

            first_value = float(equity_curve.iloc[0])
            last_value = float(equity_curve.iloc[-1])
            elapsed_days = float((equity_curve.index[-1] - equity_curve.index[0]).days) if len(equity_curve) > 1 else 0.0
            if first_value > 0 and elapsed_days > 0:
                cagr = (last_value / first_value) ** (annualization_days / elapsed_days) - 1
            else:
                cagr = 0.0
        else:
            max_drawdown = 0.0
            cagr = 0.0

        sharpe_ratio = annualized_return / annualized_volatility if annualized_volatility > 0 else 0.0
        sortino_ratio = annualized_return / annualized_downside_deviation if annualized_downside_deviation > 0 else 0.0
        calmar_ratio = cagr / abs(max_drawdown) if max_drawdown < 0 else 0.0

        self.metrics = {
            'final_portfolio': self.portfolio,
            'final_trade_log': self.trade_log,
            'final_settle_log': self.settle_log,
            'open_positions': self.portfolio["positions"],

            'trades_executed': len(self.trade_log),
            'buy_count': sum(1 for trade in self.trade_log if trade["direction"] == "buy"),
            'sell_count': sum(1 for trade in self.trade_log if trade["direction"] == "sell"),
            'unique_markets_traded': len(set(trade["market_id"] for trade in self.trade_log)),
            'total_invested': sum(trade["cost"] for trade in self.trade_log if trade["direction"] == "buy"),
            'total_proceeeds': sum(-trade["cost"] for trade in self.trade_log if trade["direction"] == "sell"),

            'total_positions_settled': len(self.settle_log),
            'winning_positions': sum(1 for settle in self.settle_log if settle["position"] == settle["outcome"]),
            'losing_positions': sum(1 for settle in self.settle_log if settle["position"] != settle["outcome"]),
            'average_winning_payout': sum(settle["amount"] for settle in self.settle_log if settle["position"] == settle["outcome"]) / (sum(1 for settle in self.settle_log if settle["position"] == settle["outcome"]) if sum(1 for settle in self.settle_log if settle["position"] == settle["outcome"]) > 0 else 1),

            'total_pnl': self.portfolio["cash"] - self.initial_cash,
            'average_pnl_per_trade': (self.portfolio["cash"] - self.initial_cash) / len(self.trade_log) if self.trade_log else 0,
            'roi_percent': ((self.portfolio["cash"] - self.initial_cash) / self.initial_cash) * 100 if self.initial_cash else 0,
            'average_roi_per_trade_percent': (((self.portfolio["cash"] - self.initial_cash) / self.initial_cash) * 100) / len(self.trade_log) if self.initial_cash and self.trade_log else 0,

            'volatility': annualized_volatility,
            'downside_risk': annualized_downside_deviation,
            'max_drawdown': max_drawdown,
            'sharpe_ratio': sharpe_ratio,
            'sortino_ratio': sortino_ratio,
            'calmar_ratio': calmar_ratio,
        }
        return self.metrics 

# =======================================================================================================================================


    def run(self, strategy_func: Callable):

        self.cpt_trade = 0

        """Run the backtest loop with the given strategy function."""
        
        print("Loading trades...")
        self.load_trades()
        print("Loading market outcomes...")
        self.load_all_outcomes()
        user_perso_parameters= {}

        self._last_known_price = {}
        self.settle_log = []
        self.portfolio_value_history = [{"timestamp": None, "value": float(self.initial_cash)}]

        print("Starting backtest...")
        for idx, trade in self.trades_df.iterrows():

            self.cpt_trade += 1
            print(f"Processing trade {self.cpt_trade}/{len(self.trades_df)}", end="\r")

            trade_dict = trade.to_dict()

            # Update rolling price dict with current trade
            self._last_known_price[(trade_dict["market_id"], trade_dict["position"])] = trade_dict["price"]

            # Check all open positions for resolution
            self._settle_resolved_positions(pd.Timestamp(trade_dict["timestamp"]).tz_localize(None))
            self._settle_take_profit_stop_losses(pd.Timestamp(trade_dict["timestamp"]).tz_localize(None), trade_dict['market_id'], trade_dict['position'], trade_dict['price'])
            self._record_portfolio_snapshot(trade_dict.get("timestamp"))
                      
            # Call user strategy
            action = strategy_func(trade_dict, self.trade_log, self.portfolio, user_perso_parameters)
            user_perso_parameters = action.get("user_perso_parameters", user_perso_parameters) # update user_perso_parameters if provided by strategy
            
            if not self._is_valid_action(action): # Validate action
                continue

            # Resolve direction — backward compat: no direction + position=="hold" → hold
            direction = action.get("direction")

            if direction == "hold":
                continue

            price = self._get_market_last_price(action["market_id"], action["position"])
            key = (action["market_id"], action["position"])

            if direction == "buy":
                cost = round(action["amount"] * price, 6)
                if cost > self.portfolio["cash"]: # Reject if not enough cash
                    continue
                self.portfolio["cash"] -= cost
                self.portfolio["positions"][key] = self.portfolio["positions"].get(key, 0) + action["amount"]
                print(f"[BUY] market={action['market_id']} pos={action['position']} amount={action['amount']} price={price} cost={cost} cash_after={self.portfolio['cash']:.2f}")
                enriched_action = {
                    "market_id": action["market_id"],
                    "position": action["position"],
                    "direction": "buy",
                    "amount": action["amount"],
                    "cost": cost,
                    "time": trade_dict.get("timestamp"),
                    "take_profit": action.get("take_profit", None),
                    "stop_loss": action.get("stop_loss", None)
                }
                if enriched_action["take_profit"] is not None or enriched_action["stop_loss"] is not None:
                    self.tp_sp_log[enriched_action["market_id"], enriched_action["position"], enriched_action["time"]] = (enriched_action["amount"], enriched_action["take_profit"], enriched_action["stop_loss"])

            elif direction == "sell":
                held = self.portfolio["positions"].get(key, 0)
                if held == 0: # Nothing to sell
                    continue
                amount_to_sell = min(action["amount"], held)
                proceeds = round(amount_to_sell * price, 6)
                self.portfolio["cash"] += proceeds
                self.portfolio["positions"][key] = held - amount_to_sell
                if self.portfolio["positions"][key] == 0:
                    del self.portfolio["positions"][key]
                print(f"[SELL] market={action['market_id']} pos={action['position']} amount={amount_to_sell} price={price} proceeds={proceeds} cash_after={self.portfolio['cash']:.2f}")
                enriched_action = {
                    "market_id": action["market_id"],
                    "position": action["position"],
                    "direction": "sell",
                    "amount": amount_to_sell,
                    "cost": -proceeds,
                    "time": trade_dict.get("timestamp")
                }

            print(trade_dict.get("timestamp"))
            self.trade_log.append(enriched_action)
        
        if self.reimburse_open_positions:
            self._reimburse_open_positions()
            self._record_portfolio_snapshot(self.trades_df.iloc[-1].get("timestamp") if not self.trades_df.empty else None)
        print(self.settle_log)
        return self._calculate_metrics()

    def run_with_user_code(self, user_code: str):
        """Compile and run a user-provided strategy function."""
        compiled_strategy = RestrictedStrategyExecutor.compile_strategy(user_code)
        return self.run(lambda trade, trade_log, portfolio, user_perso_parameters: RestrictedStrategyExecutor.execute_strategy(compiled_strategy, {
            "trade": trade,
            "trade_log": trade_log,
            "portfolio": portfolio,
            "user_perso_parameters": user_perso_parameters
        }))

    def showcase_trades(self, page: int = 1, limit: int = 100, platform: str = "polymarket"):
        """Fetch paginated trades - load files incrementally until we have enough"""
        
        # Validate platform and get file list (excluding macOS metadata files)
        if platform == "polymarket":
            pattern = f"{DATA_PATH}/polymarket/standardized_trades/*.parquet"
        elif platform == "kalshi":
            pattern = f"{DATA_PATH}/kalshi/standardized_trades/*.parquet"
        else:
            raise ValueError(f"Unknown platform: {platform}")
        
        # Get list of files, filtering out macOS metadata files (._*)
        trade_files = [f for f in glob(pattern) if not f.split('/')[-1].startswith("._")]
        
        if not trade_files:
            raise ValueError(f"No parquet files found for platform: {platform}")
        
        con = duckdb.connect()
        all_trades = []
        
        # Load files one by one until we have enough trades
        for trade_file in trade_files:
            query = f"""
                SELECT {self.selected_columns}
                FROM read_parquet('{trade_file}')
                WHERE 1=1
            """
            
            # Apply filters
            if self.timestamp_start:
                query += f" AND timestamp >= '{self.timestamp_start}'"
            if self.timestamp_end:
                query += f" AND timestamp <= '{self.timestamp_end}'"
            if self.market_id is not None:
                query += f" AND market_id IN {tuple(self.market_id)}"
            if self.market_title is not None:
                query += f" AND title IN {tuple(self.market_title)}"
            if self.market_category is not None:
                query += f" AND category IN {tuple(self.market_category)}"
            if self.volume_inf is not None:
                query += f" AND volume >= {self.volume_inf}"
            if self.volume_sup is not None:
                query += f" AND volume <= {self.volume_sup}"
            if self.price_inf is not None:
                query += f" AND price >= {self.price_inf}"
            if self.price_sup is not None:
                query += f" AND price <= {self.price_sup}"
            if self.amount_inf is not None:
                query += f" AND amount >= {self.amount_inf}"
            if self.amount_sup is not None:
                query += f" AND amount <= {self.amount_sup}"
            
            if self.position is not None:
                conditions = " OR ".join(f"position = '{pos}'" for pos in self.position)
                query += f" AND ({conditions})"
            if self.possible_outcomes is not None:
                conditions = " OR ".join(f"list_contains(possible_outcomes, '{outcome}')" for outcome in self.possible_outcomes)
                query += f" AND ({conditions})"
            if self.wallet_maker is not None:
                conditions = " OR ".join(f"wallet_maker = '{wallet}'" for wallet in self.wallet_maker)
                query += f" AND ({conditions})"
            if self.wallet_taker is not None:
                conditions = " OR ".join(f"wallet_taker = '{wallet}'" for wallet in self.wallet_taker)
                query += f" AND ({conditions})"
            
            query += " ORDER BY timestamp"
            
            # Fetch rows as native Python types (not numpy)
            cursor = con.execute(query)
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            
            # Convert to list of dicts
            trades = [dict(zip(columns, row)) for row in rows]
            all_trades.extend(trades)
            
            # Stop early if we have enough for all requested pages
            if len(all_trades) >= limit * page:
                break
        
        # Return only the requested page
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        return {
            "trades": all_trades[start_idx:end_idx],
            "platform": platform
        }
    
# =======================================================================================================================================
    
    def _reimburse_open_positions(self):
        """Refund open positions at their last known price at the end of the backtest period."""
        to_remove = []
        for (market_id, position), amount in self.portfolio["positions"].items():
            try:
                last_price = self._get_market_last_price(market_id, position)
                refund = round(amount * last_price, 6)
                self.portfolio["cash"] += refund
                self.settle_log.append({
                    "market_id": market_id,
                    "position": position,
                    "amount": amount,
                    "refund": refund
                })
            except ValueError as e:
                print(f"[Reimburse] Could not reimburse {market_id} / {position}: {e}")
            to_remove.append((market_id, position))
        for key in to_remove:
            del self.portfolio["positions"][key]