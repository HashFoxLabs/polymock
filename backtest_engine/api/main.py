"""
FastAPI backend for Prediction Market Backtest Engine
Accepts user strategy code and runs backtests
"""

from fastapi import UploadFile, File
import os

import asyncio
import sys
import json
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from slowapi import Limiter
from slowapi.util import get_remote_address
import uvicorn

# Add parent directory to path to import backtest_engine
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backtest_engine import BacktestEngine, RestrictedStrategyExecutor

# ================================ PYDANTIC MODELS ================================

class BacktestRequest(BaseModel):
    """Request model for backtest endpoint - supports all BacktestEngine parameters"""
    
    # Strategy and portfolio
    strategy_code: str = Field(..., description="Strategy function body (Part 2 only) - custom logic between function signature and return statement", min_length=1, max_length=10000)
    initial_cash: float = Field(10000, gt=0, description="Initial portfolio cash")
    strat_var: Optional[List[bool]] = Field(
        None,
        description="Select columns: [platform, timestamp, title, volume, market_id, category, position, possible_outcomes, price, amount, wallet_maker, wallet_taker]. Defaults to all True."
    )
    reimburse_open_positions: bool = Field(False, description="Reimburse unsettled positions at end")
    
    # Platform and time filters
    platform: List[str] = Field(["polymarket"], description="Market platform(s): 'polymarket' and/or 'kalshi'")
    timestamp_start: Optional[str] = Field(None, description="Start date (ISO format, e.g., 2024-01-01T00:00:00)")
    timestamp_end: Optional[str] = Field(None, description="End date (ISO format, e.g., 2024-12-31T23:59:59)")
    
    # Market characteristic filters
    market_id: Optional[List[str]] = Field(None, description="Filter by market IDs")
    market_title: Optional[List[str]] = Field(None, description="Filter by market titles (Kalshi only)")
    market_category: Optional[List[str]] = Field(None, description="Filter by market categories")
    volume_inf: Optional[float] = Field(None, ge=0, description="Minimum volume (Kalshi only)")
    volume_sup: Optional[float] = Field(None, ge=0, description="Maximum volume (Kalshi only)")
    
    # Trade characteristic filters
    position: Optional[List[str]] = Field(None, description="Filter by position (Yes, No)")
    possible_outcomes: Optional[List[str]] = Field(None, description="Filter by possible outcomes")
    price_inf: Optional[float] = Field(None, ge=0, le=1, description="Minimum price")
    price_sup: Optional[float] = Field(None, ge=0, le=1, description="Maximum price")
    amount_inf: Optional[float] = Field(None, ge=0, description="Minimum amount")
    amount_sup: Optional[float] = Field(None, ge=0, description="Maximum amount")
    
    # Wallet filters (Polymarket only)
    wallet_maker: Optional[List[str]] = Field(None, description="Filter by maker wallet (Polymarket only)")
    wallet_taker: Optional[List[str]] = Field(None, description="Filter by taker wallet (Polymarket only)")
    
    @validator('strat_var')
    def validate_strat_var(cls, v):
        """Validate strat_var column selection - critical columns must be enabled"""
        if v is None:
            return v
        
        if len(v) != 12:
            raise ValueError(f"strat_var must have exactly 12 boolean values, got {len(v)}")
        
        # Columns: [platform, timestamp, title, volume, market_id, category, position, possible_outcomes, price, amount, wallet_maker, wallet_taker]
        # Indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        critical_indices = {
            1: "timestamp",  # needed for filtering and portfolio snapshots
            4: "market_id",  # needed for validation
            6: "position",   # needed for position tracking
            8: "price",      # needed for calculations
        }
        
        for idx, col_name in critical_indices.items():
            if not v[idx]:
                raise ValueError(f"Column '{col_name}' (index {idx}) is critical and must be enabled in strat_var")
        
        return v
    
    @validator('platform')
    def validate_platform(cls, v):
        for platform in v:
            if platform not in ['polymarket', 'kalshi']:
                raise ValueError(f'Platform must be "polymarket" or "kalshi", got "{platform}"')
        return v
    
    @validator('strategy_code')
    def validate_strategy_code(cls, v):
        """Pre-validate strategy code (Part 2) syntax"""
        if not v.strip():
            raise ValueError("Strategy code cannot be empty")
        try:
            # Validate Part 2 code is syntactically valid Python
            compile(v, "<string>", "exec")
        except SyntaxError as e:
            raise ValueError(f"Invalid Python syntax in strategy code: {str(e)[:200]}")
        return v

class BacktestResponse(BaseModel):
    """Response model for backtest results"""
    status: str = "success"
    trades_executed: int
    buy_count: int
    sell_count: int
    unique_markets_traded: int
    final_cash: float
    total_pnl: float
    roi_percent: float
    max_drawdown: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    volatility: float
    downside_risk: float
    total_positions_settled: int
    winning_positions: int
    losing_positions: int
    execution_time_seconds: float

class ErrorResponse(BaseModel):
    """Error response model"""
    status: str = "error"
    error: str
    detail: Optional[str] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "healthy"
    timestamp: str
    version: str = "1.0.0"

class StrategyCodeRequest(BaseModel):
    """Request body for strategy code validation"""
    strategy_code: str = Field(..., description="Python strategy function code", min_length=1, max_length=10000)

class TradesFilterRequest(BaseModel):
    """Request model for trades showcase endpoint"""
    page: int = Field(1, ge=1, description="Page number (1-indexed)")
    limit: int = Field(100, ge=1, le=10000, description="Trades per page")
    platform: List[str] = Field(["polymarket"], description="Platform filter(s)")
    strat_var: Optional[List[bool]] = Field(None, description="Column selection")
    
    # Time filters
    timestamp_start: Optional[str] = Field(None, description="ISO format: 2024-01-01T00:00:00")
    timestamp_end: Optional[str] = Field(None, description="ISO format: 2024-12-31T23:59:59")
    
    # Market filters
    market_id: Optional[List[str]] = Field(None, description="Filter by market IDs")
    market_title: Optional[List[str]] = Field(None, description="Filter by market titles (Kalshi)")
    market_category: Optional[List[str]] = Field(None, description="Filter by categories")
    volume_inf: Optional[float] = Field(None, ge=0, description="Min volume (Kalshi)")
    volume_sup: Optional[float] = Field(None, ge=0, description="Max volume (Kalshi)")
    
    # Trade filters
    position: Optional[List[str]] = Field(None, description="Filter by position (Yes/No)")
    possible_outcomes: Optional[List[str]] = Field(None, description="Filter by outcomes")
    price_inf: Optional[float] = Field(None, ge=0, le=1, description="Min price")
    price_sup: Optional[float] = Field(None, ge=0, le=1, description="Max price")
    amount_inf: Optional[float] = Field(None, ge=0, description="Min amount")
    amount_sup: Optional[float] = Field(None, ge=0, description="Max amount")
    
    # Wallet filters
    wallet_maker: Optional[List[str]] = Field(None, description="Filter by maker wallet (Polymarket)")
    wallet_taker: Optional[List[str]] = Field(None, description="Filter by taker wallet (Polymarket)")

class TradesResponse(BaseModel):
    """Response model for trades showcase"""
    trades: list = Field(..., description="List of trades")
    page: int
    limit: int
    platform: str
    error: Optional[str] = None

# ================================ FASTAPI APP ================================

app = FastAPI(
    title="Prediction Market Backtest API",
    description="API for running strategy backtests on historical prediction market data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# CORS middleware - allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],  # Add your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================ ENDPOINTS ================================

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Check API health status"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/backtest", response_model=BacktestResponse, tags=["Backtest"])
@limiter.limit("10/minute")
async def run_backtest(request: Request, backtest_request: BacktestRequest):
    """
    Run a backtest with user-provided strategy code
    
    - **strategy_code**: Python function that takes (trade, trade_log, portfolio, user_perso_parameters)
    - **platform**: "polymarket" or "kalshi"
    - **initial_cash**: Starting portfolio value
    - **price_sup**: Max price filter (optional)
    - **price_inf**: Min price filter (optional)
    
    Returns backtest metrics including returns, drawdown, Sharpe ratio, etc.
    """
    try:
        start_time = datetime.now()
        
        # Parse datetime strings if provided
        timestamp_start = None
        timestamp_end = None
        if backtest_request.timestamp_start:
            try:
                timestamp_start = datetime.fromisoformat(backtest_request.timestamp_start)
            except ValueError:
                raise ValueError(f"Invalid start date format: {backtest_request.timestamp_start}. Use ISO format (e.g., 2024-01-01T00:00:00)")
        if backtest_request.timestamp_end:
            try:
                timestamp_end = datetime.fromisoformat(backtest_request.timestamp_end)
            except ValueError:
                raise ValueError(f"Invalid end date format: {backtest_request.timestamp_end}. Use ISO format (e.g., 2024-12-31T23:59:59)")
        
        # Use strat_var from request or default to all True
        strat_var = backtest_request.strat_var or [True] * 12
        
        # Initialize engine with all parameters
        engine = BacktestEngine(
            initial_cash=backtest_request.initial_cash,
            strat_var=strat_var,
            reimburse_open_positions=backtest_request.reimburse_open_positions,
            platform=backtest_request.platform,
            timestamp_start=timestamp_start,
            timestamp_end=timestamp_end,
            market_id=backtest_request.market_id,
            market_title=backtest_request.market_title,
            volume_inf=backtest_request.volume_inf,
            volume_sup=backtest_request.volume_sup,
            market_category=backtest_request.market_category,
            position=backtest_request.position,
            possible_outcomes=backtest_request.possible_outcomes,
            price_inf=backtest_request.price_inf,
            price_sup=backtest_request.price_sup,
            amount_inf=backtest_request.amount_inf,
            amount_sup=backtest_request.amount_sup,
            wallet_maker=backtest_request.wallet_maker,
            wallet_taker=backtest_request.wallet_taker,
        )
        
        # Assemble full strategy code (Parts 1+2+3) from user-provided Part 2
        full_strategy_code = BacktestEngine.assemble_strategy_code(
            backtest_request.strategy_code
        )
        
        # Validate assembled code can be compiled
        try:
            RestrictedStrategyExecutor.compile_strategy(full_strategy_code)
        except SyntaxError as e:
            raise ValueError(f"Strategy compilation failed: {str(e)[:200]}")
        
        # Run backtest in thread pool (avoid blocking event loop)
        metrics = await asyncio.to_thread(
            engine.run_with_user_code,
            full_strategy_code
        )
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "status": "success",
            "trades_executed": metrics['trades_executed'],
            "buy_count": metrics['buy_count'],
            "sell_count": metrics['sell_count'],
            "unique_markets_traded": metrics['unique_markets_traded'],
            "final_cash": metrics['final_portfolio']['cash'],
            "total_pnl": metrics['total_pnl'],
            "roi_percent": metrics['roi_percent'],
            "max_drawdown": metrics['max_drawdown'],
            "sharpe_ratio": metrics['sharpe_ratio'],
            "sortino_ratio": metrics['sortino_ratio'],
            "calmar_ratio": metrics['calmar_ratio'],
            "volatility": metrics['volatility'],
            "downside_risk": metrics['downside_risk'],
            "total_positions_settled": metrics['total_positions_settled'],
            "winning_positions": metrics['winning_positions'],
            "losing_positions": metrics['losing_positions'],
            "execution_time_seconds": execution_time,
        }
    
    except ValueError as e:
        # Validation errors
        raise HTTPException(
            status_code=400,
            detail=f"Validation error: {str(e)}"
        )
    except TimeoutError as e:
        # Strategy execution timeout
        raise HTTPException(
            status_code=408,
            detail="Strategy execution timeout (exceeded 5 seconds per trade)"
        )
    except SyntaxError as e:
        # Strategy code syntax error
        raise HTTPException(
            status_code=400,
            detail=f"Strategy syntax error: {str(e)[:200]}"
        )
    except Exception as e:
        # Catch all other errors
        raise HTTPException(
            status_code=500,
            detail=f"Backtest execution failed: {str(e)[:200]}"
        )


import time
import sys
@app.post("/trades", response_model=TradesResponse, tags=["Trades"])
@limiter.limit("20/minute")
async def showcase_trades(request: Request, trades_request: TradesFilterRequest):
    """
    Get paginated trades with filters (for frontend preview)
    
    - **page**: Page number (1-indexed)
    - **limit**: Trades per page (default 100)
    - **platform**: Filter by platform(s)
    - All standard backtest filters supported (timestamps, prices, positions, etc.)
    
    Returns paginated list of trade snapshots matching filters.
    """
    try:
        start = time.time()
        print(f"[API] Request received: page={trades_request.page}, limit={trades_request.limit}", file=sys.stderr)
        # Parse datetime strings
        timestamp_start = None
        timestamp_end = None
        if trades_request.timestamp_start:
            try:
                timestamp_start = datetime.fromisoformat(trades_request.timestamp_start)
            except ValueError:
                raise ValueError(f"Invalid start date format: {trades_request.timestamp_start}. Use ISO format (e.g., 2024-01-01T00:00:00)")
        if trades_request.timestamp_end:
            try:
                timestamp_end = datetime.fromisoformat(trades_request.timestamp_end)
            except ValueError:
                raise ValueError(f"Invalid end date format: {trades_request.timestamp_end}. Use ISO format (e.g., 2024-12-31T23:59:59)")
        
        # Use strat_var from request or default to all True
        strat_var = trades_request.strat_var or [True] * 12
        
        # Create engine with all filter parameters
        engine = BacktestEngine(
            strat_var=strat_var,
            platform=trades_request.platform,
            timestamp_start=timestamp_start,
            timestamp_end=timestamp_end,
            market_id=trades_request.market_id,
            market_title=trades_request.market_title,
            volume_inf=trades_request.volume_inf,
            volume_sup=trades_request.volume_sup,
            market_category=trades_request.market_category,
            position=trades_request.position,
            possible_outcomes=trades_request.possible_outcomes,
            price_inf=trades_request.price_inf,
            price_sup=trades_request.price_sup,
            amount_inf=trades_request.amount_inf,
            amount_sup=trades_request.amount_sup,
            wallet_maker=trades_request.wallet_maker,
            wallet_taker=trades_request.wallet_taker,
        )
        
        platform_str = trades_request.platform[0] if trades_request.platform else "polymarket"
        print(f"[API] Engine initialized in {time.time() - start:.2f}s", file=sys.stderr)


        # Fetch paginated trades
        fetch_start = time.time()
        result = await asyncio.to_thread(
            engine.showcase_trades,
            page=trades_request.page,
            limit=trades_request.limit,
            platform=platform_str
        )
        print(f"[API] showcase_trades took {time.time() - fetch_start:.2f}s", file=sys.stderr)
        
        return {
            'trades': result['trades'],
            'page': trades_request.page,
            'limit': trades_request.limit,
            'platform': result['platform'],
            'error': None
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Validation error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch trades: {str(e)[:200]}"
        )

@app.get("/strategies/example", tags=["Documentation"])
async def get_example_strategy():
    """Get an example strategy that works with the API"""
    return {
        "example_code": '''def mean_reversion(trade, trade_log, portfolio, user_perso_parameters):
    """Simple mean reversion strategy - buy when price is low"""
    threshold_low = 0.01
    market_id = trade.get("market_id")
    position = trade.get("position")
    direction = "hold"
    amount = 0

    if trade.get("price") <= threshold_low:
        direction = "buy"
        amount = 10

    return {
        "market_id": market_id,
        "position": position,
        "direction": direction,
        "amount": amount
    }
''',
        "description": "A simple strategy that buys when price <= 0.01",
        "parameters": {
            "trade": "Current trade dict with keys: market_id, position, price, amount, etc.",
            "trade_log": "List of all executed trades",
            "portfolio": "Dict with cash and positions",
            "user_perso_parameters": "Dict for storing strategy state across trades"
        },
        "return": {
            "market_id": "The market to trade",
            "position": "Yes or No",
            "direction": "buy, sell, or hold",
            "amount": "Number of contracts",
            "take_profit": "(optional) Exit price for profit",
            "stop_loss": "(optional) Exit price for loss"
        }
    }

@app.post("/validate-strategy", tags=["Validation"])
async def validate_strategy(request: StrategyCodeRequest):
    """Validate strategy code without running backtest"""
    try:
        RestrictedStrategyExecutor.compile_strategy(request.strategy_code)
        return {
            "status": "valid",
            "message": "Strategy code is syntactically correct and safe"
        }
    except SyntaxError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy validation failed: {str(e)[:200]}"
        )

# ================================ EXCEPTION HANDLERS ================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error": exc.detail,
            "detail": None
        }
    )

@app.post("/upload-temp")
async def upload_temp(file: UploadFile = File(...)):
    """Temporary file upload - for initial data setup only"""
    upload_dir = "/data/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {"filename": file.filename, "path": file_path, "size_bytes": len(content)}

# ================================ MAIN ================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
