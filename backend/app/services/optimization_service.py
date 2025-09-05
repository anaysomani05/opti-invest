import pandas as pd
import numpy as np
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import logging
from pypfopt import EfficientFrontier, risk_models, expected_returns
from pypfopt.discrete_allocation import DiscreteAllocation
from pypfopt import objective_functions
import warnings
warnings.filterwarnings('ignore')

from app.models import (
    OptimizationRequest, OptimizationResult, EfficientFrontierPoint, 
    PortfolioMetrics, OptimizationError, HoldingWithMetrics
)
from app.services.portfolio_service import portfolio_service
from app.external.marketstack import marketstack_client

logger = logging.getLogger(__name__)

class OptimizationService:
    """Portfolio optimization service using PyPortfolioOpt"""
    
    # Risk profile configurations
    RISK_PROFILES = {
        "conservative": {
            "max_volatility": 0.15,
            "min_weight": 0.05,
            "max_weight": 0.25,
            "objective": "min_volatility",
            "target_return": 0.08
        },
        "moderate": {
            "target_return": 0.12,
            "min_weight": 0.02,
            "max_weight": 0.30,
            "objective": "efficient_return",
            "max_volatility": 0.20
        },
        "aggressive": {
            "min_weight": 0.01,
            "max_weight": 0.40,
            "objective": "max_sharpe",
            "target_return": 0.15
        }
    }
    
    def __init__(self):
        self.cache = {}
        self.cache_timeout = 3600  # 1 hour cache for historical data
        # Cache for optimization results to avoid duplicate API calls
        self._optimization_cache: Dict[str, OptimizationResult] = {}
        self._cache_timestamp: Dict[str, datetime] = {}
        self._cache_duration = timedelta(minutes=5)  # Cache for 5 minutes
        self._active_optimizations: Dict[str, bool] = {}  # Track active optimizations
    
    async def optimize_portfolio(self, request: OptimizationRequest) -> OptimizationResult:
        """Main optimization function"""
        try:
            # Create cache key based on risk profile and holdings
            cache_key = f"{request.risk_profile}_{request.objective}_{request.lookback_period}"
            
            # Check if we have a recent cached result
            if cache_key in self._optimization_cache:
                cache_time = self._cache_timestamp.get(cache_key)
                if cache_time and datetime.now() - cache_time < self._cache_duration:
                    logger.info(f"Using cached optimization result for {request.risk_profile}")
                    return self._optimization_cache[cache_key]
            
            # Check if optimization is already in progress for this key
            if cache_key in self._active_optimizations:
                logger.info(f"Optimization already in progress for {request.risk_profile}, waiting...")
                # Wait a bit and check cache again
                import asyncio
                await asyncio.sleep(1)
                if cache_key in self._optimization_cache:
                    return self._optimization_cache[cache_key]
            
            # Mark optimization as active
            self._active_optimizations[cache_key] = True
            
            logger.info(f"Starting portfolio optimization with risk profile: {request.risk_profile}")
            
            # Get current portfolio holdings (use provided prices if available)
            if request.current_prices:
                # Use prices from frontend to avoid API calls
                holdings = await portfolio_service.get_holdings_with_provided_prices(request.current_prices)
                logger.info("Using current prices from frontend to avoid API calls")
            else:
                # Fallback to fetching current prices (for backward compatibility)
                holdings = await portfolio_service.get_holdings_with_current_prices()
            
            if not holdings:
                raise ValueError("No holdings found in portfolio")
            
            if len(holdings) < 3:
                raise ValueError("Need at least 3 holdings for meaningful optimization")
            
            # Extract symbols and current weights
            symbols = [h.symbol for h in holdings]
            current_weights = self._calculate_current_weights(holdings)
            
            logger.info(f"Optimizing portfolio with {len(symbols)} symbols: {symbols}")
            
            # Fetch historical data
            historical_data = await self._fetch_historical_data(symbols, request.lookback_period)
            if historical_data.empty:
                raise ValueError("No historical data available for optimization")
            
            # Calculate expected returns and covariance matrix
            mu = expected_returns.mean_historical_return(historical_data)
            S = risk_models.sample_cov(historical_data)
            
            # Apply risk profile settings
            risk_config = self._get_risk_config(request)
            
            # Perform optimization
            optimal_weights = self._optimize_weights(mu, S, risk_config, request)
            
            # Calculate portfolio metrics
            optimal_metrics = self._calculate_portfolio_metrics(optimal_weights, mu, S)
            current_metrics = self._calculate_portfolio_metrics(current_weights, mu, S)
            
            # Generate efficient frontier
            efficient_frontier_points = self._generate_efficient_frontier(mu, S, risk_config)
            
            # Calculate rebalancing trades
            rebalancing_trades = self._calculate_rebalancing_trades(
                current_weights, optimal_weights, holdings
            )
            
            # Calculate additional risk metrics
            max_drawdown = self._calculate_max_drawdown(historical_data, optimal_weights)
            cvar = self._calculate_cvar(historical_data, optimal_weights)
            
            result = OptimizationResult(
                optimal_weights=optimal_weights,
                expected_return=optimal_metrics.expected_return,
                volatility=optimal_metrics.volatility,
                sharpe_ratio=optimal_metrics.sharpe_ratio,
                max_drawdown=max_drawdown,
                cvar=cvar,
                efficient_frontier=efficient_frontier_points,
                optimization_method=risk_config["objective"],
                risk_profile=request.risk_profile,
                current_weights=current_weights,
                rebalancing_trades=rebalancing_trades,
                data_period=f"{request.lookback_period} days"
            )
            
            logger.info(f"Optimization completed successfully. Sharpe ratio: {optimal_metrics.sharpe_ratio:.2f}")
            
            # Cache the result to avoid duplicate API calls
            self._optimization_cache[cache_key] = result
            self._cache_timestamp[cache_key] = datetime.now()
            
            return result
            
        except Exception as e:
            logger.error(f"Optimization failed: {str(e)}")
            raise ValueError(f"Portfolio optimization failed: {str(e)}")
        finally:
            # Clean up active optimization flag
            if cache_key in self._active_optimizations:
                del self._active_optimizations[cache_key]
    
    def _calculate_current_weights(self, holdings: List[HoldingWithMetrics]) -> Dict[str, float]:
        """Calculate current portfolio weights from holdings"""
        total_value = sum(h.value for h in holdings)
        if total_value <= 0:
            raise ValueError("Portfolio has no value")
        
        weights = {}
        for holding in holdings:
            weights[holding.symbol] = holding.value / total_value
        
        return weights
    
    async def _fetch_historical_data(self, symbols: List[str], lookback_days: int) -> pd.DataFrame:
        """Fetch historical price data using Marketstack API"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=lookback_days + 30)  # Extra buffer for holidays
        
        cache_key = f"{'-'.join(sorted(symbols))}_{lookback_days}"
        
        # Check cache first
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if (datetime.now() - cached_time).seconds < self.cache_timeout:
                logger.info("Using cached historical data")
                return cached_data
        
        logger.info(f"Fetching historical data from Marketstack for {len(symbols)} symbols from {start_date.date()} to {end_date.date()}")
        
        try:
            # Use Marketstack client to fetch data
            historical_data = marketstack_client.get_historical_data(symbols, start_date, end_date)
            
            if historical_data.empty:
                raise ValueError("No historical data retrieved from Marketstack")
            
            # Remove symbols with insufficient data (less than 60 days)
            min_data_points = 60
            valid_symbols = []
            for symbol in historical_data.columns:
                if len(historical_data[symbol].dropna()) >= min_data_points:
                    valid_symbols.append(symbol)
                else:
                    logger.warning(f"Insufficient data for {symbol}, removing from optimization")
            
            historical_data = historical_data[valid_symbols]
            
            if historical_data.empty or len(valid_symbols) < 3:
                raise ValueError("Insufficient valid historical data for optimization")
            
            # Cache the result
            self.cache[cache_key] = (historical_data, datetime.now())
            
            logger.info(f"Successfully fetched {len(historical_data)} days of data for {len(valid_symbols)} symbols")
            return historical_data
            
        except Exception as e:
            logger.error(f"Failed to fetch historical data from Marketstack: {str(e)}")
            raise ValueError(f"Failed to fetch historical data: {str(e)}")
    
    def _get_risk_config(self, request: OptimizationRequest) -> Dict:
        """Get risk configuration based on risk profile and request parameters"""
        if request.risk_profile not in self.RISK_PROFILES:
            raise ValueError(f"Invalid risk profile: {request.risk_profile}")
        
        config = self.RISK_PROFILES[request.risk_profile].copy()
        
        # Override with request parameters
        if request.target_return:
            config["target_return"] = request.target_return
        if request.min_weight:
            config["min_weight"] = request.min_weight
        if request.max_weight:
            config["max_weight"] = request.max_weight
        if request.objective:
            config["objective"] = request.objective
        
        return config
    
    def _optimize_weights(self, mu: pd.Series, S: pd.DataFrame, risk_config: Dict, request: OptimizationRequest) -> Dict[str, float]:
        """Perform portfolio optimization using PyPortfolioOpt"""
        try:
            # Create EfficientFrontier object
            ef = EfficientFrontier(mu, S)
            
            # Add weight constraints
            ef.add_constraint(lambda w: w >= risk_config["min_weight"])
            ef.add_constraint(lambda w: w <= risk_config["max_weight"])
            
            # Optimize based on objective
            objective = risk_config["objective"]
            
            if objective == "max_sharpe":
                ef.max_sharpe()
            elif objective == "min_volatility":
                ef.min_volatility()
            elif objective == "efficient_return":
                target_return = risk_config.get("target_return", 0.12)
                ef.efficient_return(target_return)
            else:
                raise ValueError(f"Unknown optimization objective: {objective}")
            
            # Get cleaned weights (removes tiny allocations)
            weights = ef.clean_weights(cutoff=0.005)
            
            # Ensure weights sum to 1
            total_weight = sum(weights.values())
            if total_weight > 0:
                weights = {symbol: weight/total_weight for symbol, weight in weights.items()}
            
            return weights
            
        except Exception as e:
            logger.error(f"Optimization failed: {str(e)}")
            raise ValueError(f"Optimization failed: {str(e)}")
    
    def _calculate_portfolio_metrics(self, weights: Dict[str, float], mu: pd.Series, S: pd.DataFrame) -> PortfolioMetrics:
        """Calculate portfolio performance metrics"""
        weights_array = np.array([weights.get(symbol, 0) for symbol in mu.index])
        
        # Expected return
        expected_return = np.sum(weights_array * mu.values)
        
        # Volatility
        volatility = np.sqrt(np.dot(weights_array.T, np.dot(S.values, weights_array)))
        
        # Sharpe ratio (assuming 2% risk-free rate)
        risk_free_rate = 0.02
        sharpe_ratio = (expected_return - risk_free_rate) / volatility if volatility > 0 else 0
        
        return PortfolioMetrics(
            expected_return=expected_return,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            weights=weights
        )
    
    def _generate_efficient_frontier(self, mu: pd.Series, S: pd.DataFrame, risk_config: Dict, num_points: int = 20) -> List[EfficientFrontierPoint]:
        """Generate efficient frontier points"""
        try:
            frontier_points = []
            
            # Define return range - use a much wider range for better frontier
            min_return = mu.min() * 0.1  # Start much lower
            max_return = mu.max() * 2.0  # Go much higher
            
            target_returns = np.linspace(min_return, max_return, num_points)
            
            for target_return in target_returns:
                try:
                    ef = EfficientFrontier(mu, S)
                    
                    # Use very flexible constraints for better frontier
                    min_weight = 0.001  # Very small minimum
                    max_weight = 0.95   # Very high maximum
                    
                    ef.add_constraint(lambda w: w >= min_weight)
                    ef.add_constraint(lambda w: w <= max_weight)
                    
                    weights = ef.efficient_return(target_return)
                    cleaned_weights = ef.clean_weights(cutoff=0.0001)  # Very low cutoff
                    
                    metrics = self._calculate_portfolio_metrics(cleaned_weights, mu, S)
                    
                    point = EfficientFrontierPoint(
                        expected_return=metrics.expected_return,
                        volatility=metrics.volatility,
                        sharpe_ratio=metrics.sharpe_ratio,
                        weights=cleaned_weights
                    )
                    frontier_points.append(point)
                    
                except Exception as e:
                    logger.debug(f"Skipping target return {target_return}: {str(e)}")
                    continue  # Skip invalid points
            
            # If we don't have enough points, try with even more flexible constraints
            if len(frontier_points) < 5:
                logger.info("Trying with more flexible constraints...")
                for target_return in target_returns:
                    try:
                        ef = EfficientFrontier(mu, S)
                        # No constraints at all for maximum flexibility
                        weights = ef.efficient_return(target_return)
                        cleaned_weights = ef.clean_weights(cutoff=0.0001)
                        
                        metrics = self._calculate_portfolio_metrics(cleaned_weights, mu, S)
                        
                        point = EfficientFrontierPoint(
                            expected_return=metrics.expected_return,
                            volatility=metrics.volatility,
                            sharpe_ratio=metrics.sharpe_ratio,
                            weights=cleaned_weights
                        )
                        frontier_points.append(point)
                        
                    except Exception as e:
                        continue
            
            # Remove duplicate points (same return and volatility)
            unique_points = []
            seen = set()
            for point in frontier_points:
                key = (round(point.expected_return, 4), round(point.volatility, 4))
                if key not in seen:
                    seen.add(key)
                    unique_points.append(point)
            
            # Sort by volatility for better visualization
            unique_points.sort(key=lambda x: x.volatility)
            
            logger.info(f"Generated {len(unique_points)} unique efficient frontier points")
            return unique_points
            
        except Exception as e:
            logger.warning(f"Failed to generate efficient frontier: {str(e)}")
            return []
    
    def _calculate_rebalancing_trades(self, current_weights: Dict[str, float], 
                                    optimal_weights: Dict[str, float], 
                                    holdings: List[HoldingWithMetrics]) -> Dict[str, float]:
        """Calculate required trades to reach optimal allocation"""
        trades = {}
        total_value = sum(h.value for h in holdings)
        
        for symbol in set(list(current_weights.keys()) + list(optimal_weights.keys())):
            current_weight = current_weights.get(symbol, 0)
            optimal_weight = optimal_weights.get(symbol, 0)
            
            weight_diff = optimal_weight - current_weight
            dollar_amount = weight_diff * total_value
            
            if abs(dollar_amount) > total_value * 0.01:  # Only trades > 1% of portfolio
                trades[symbol] = dollar_amount
        
        return trades
    
    def _calculate_max_drawdown(self, historical_data: pd.DataFrame, weights: Dict[str, float]) -> float:
        """Calculate maximum drawdown for the portfolio"""
        try:
            # Calculate portfolio returns
            returns = historical_data.pct_change().dropna()
            weights_array = np.array([weights.get(symbol, 0) for symbol in returns.columns])
            portfolio_returns = returns.dot(weights_array)
            
            # Calculate cumulative returns
            cumulative = (1 + portfolio_returns).cumprod()
            
            # Calculate drawdowns
            running_max = cumulative.expanding().max()
            drawdowns = (cumulative - running_max) / running_max
            
            return abs(drawdowns.min())
            
        except Exception as e:
            logger.warning(f"Failed to calculate max drawdown: {str(e)}")
            return None
    
    def _calculate_cvar(self, historical_data: pd.DataFrame, weights: Dict[str, float], confidence: float = 0.05) -> float:
        """Calculate Conditional Value at Risk (CVaR)"""
        try:
            # Calculate portfolio returns
            returns = historical_data.pct_change().dropna()
            weights_array = np.array([weights.get(symbol, 0) for symbol in returns.columns])
            portfolio_returns = returns.dot(weights_array)
            
            # Calculate VaR
            var = np.percentile(portfolio_returns, confidence * 100)
            
            # Calculate CVaR (average of returns below VaR)
            cvar_returns = portfolio_returns[portfolio_returns <= var]
            cvar = cvar_returns.mean() if len(cvar_returns) > 0 else var
            
            # Annualize and return as positive number
            return abs(cvar * np.sqrt(252))
            
        except Exception as e:
            logger.warning(f"Failed to calculate CVaR: {str(e)}")
            return None

# Global optimization service instance
optimization_service = OptimizationService()
