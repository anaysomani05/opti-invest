from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.models import (
    OptimizationRequest, OptimizationResult, EfficientFrontierPoint,
    PortfolioMetrics, OptimizationError, ErrorResponse
)
from app.services.optimization_service import optimization_service
from app.services.portfolio_service import portfolio_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/optimization", tags=["optimization"])

@router.post("/optimize", response_model=OptimizationResult)
async def optimize_portfolio(request: OptimizationRequest):
    """
    Optimize the current portfolio based on risk profile and constraints
    """
    try:
        logger.info(f"Received optimization request for risk profile: {request.risk_profile}")
        
        # Validate request
        if request.risk_profile not in ["conservative", "moderate", "aggressive"]:
            raise HTTPException(
                status_code=400, 
                detail="Invalid risk profile. Must be 'conservative', 'moderate', or 'aggressive'"
            )
        
        if request.objective not in ["max_sharpe", "min_volatility", "efficient_return"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid objective. Must be 'max_sharpe', 'min_volatility', or 'efficient_return'"
            )
        
        if request.objective == "efficient_return" and not request.target_return:
            raise HTTPException(
                status_code=400,
                detail="target_return is required when objective is 'efficient_return'"
            )
        
        # Check if portfolio has holdings
        holdings = await portfolio_service.get_holdings_with_current_prices()
        if not holdings:
            raise HTTPException(
                status_code=400,
                detail="No holdings found in portfolio. Please add some holdings first."
            )
        
        if len(holdings) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 3 holdings for optimization. Current holdings: {len(holdings)}"
            )
        
        # Perform optimization
        result = await optimization_service.optimize_portfolio(request)
        
        logger.info(f"Optimization completed successfully. Sharpe ratio: {result.sharpe_ratio:.2f}")
        return result
        
    except ValueError as e:
        logger.error(f"Optimization validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Optimization failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@router.get("/efficient-frontier/{risk_profile}", response_model=List[EfficientFrontierPoint])
async def get_efficient_frontier(risk_profile: str, lookback_period: int = 252):
    """
    Generate efficient frontier points for visualization
    """
    try:
        if risk_profile not in ["conservative", "moderate", "aggressive"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid risk profile. Must be 'conservative', 'moderate', or 'aggressive'"
            )
        
        # Create optimization request for efficient frontier
        request = OptimizationRequest(
            risk_profile=risk_profile,
            objective="max_sharpe",  # Default objective for frontier generation
            lookback_period=lookback_period
        )
        
        # Get optimization result (which includes efficient frontier)
        result = await optimization_service.optimize_portfolio(request)
        
        return result.efficient_frontier
        
    except ValueError as e:
        logger.error(f"Efficient frontier validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Efficient frontier generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate efficient frontier: {str(e)}")

@router.get("/portfolio-metrics", response_model=PortfolioMetrics)
async def get_current_portfolio_metrics(lookback_period: int = 252):
    """
    Get performance metrics for the current portfolio
    """
    try:
        # Get current holdings
        holdings = await portfolio_service.get_holdings_with_current_prices()
        if not holdings:
            raise HTTPException(
                status_code=400,
                detail="No holdings found in portfolio"
            )
        
        # Create a dummy optimization request to get current metrics
        request = OptimizationRequest(
            risk_profile="moderate",  # Doesn't matter for current metrics
            objective="max_sharpe",
            lookback_period=lookback_period
        )
        
        # Get optimization result to access current portfolio metrics
        result = await optimization_service.optimize_portfolio(request)
        
        # Return current portfolio metrics
        current_metrics = PortfolioMetrics(
            expected_return=result.expected_return,  # This will be calculated for current weights
            volatility=result.volatility,
            sharpe_ratio=result.sharpe_ratio,
            weights=result.current_weights
        )
        
        return current_metrics
        
    except ValueError as e:
        logger.error(f"Portfolio metrics validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Portfolio metrics calculation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate portfolio metrics: {str(e)}")

@router.post("/compare", response_model=Dict[str, PortfolioMetrics])
async def compare_portfolios(request: OptimizationRequest):
    """
    Compare current portfolio with optimized portfolio
    """
    try:
        # Get optimization result
        result = await optimization_service.optimize_portfolio(request)
        
        # Extract current and optimized metrics
        comparison = {
            "current": PortfolioMetrics(
                expected_return=0,  # Will be calculated based on current weights
                volatility=0,
                sharpe_ratio=0,
                weights=result.current_weights
            ),
            "optimized": PortfolioMetrics(
                expected_return=result.expected_return,
                volatility=result.volatility,
                sharpe_ratio=result.sharpe_ratio,
                weights=result.optimal_weights
            )
        }
        
        return comparison
        
    except ValueError as e:
        logger.error(f"Portfolio comparison validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Portfolio comparison failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to compare portfolios: {str(e)}")

@router.get("/risk-profiles", response_model=List[Dict])
async def get_risk_profiles():
    """
    Get available risk profiles with their configurations
    """
    return [
        {
            "id": "conservative",
            "name": "Conservative",
            "description": "Low risk, stable returns",
            "target_return": 0.07,  # 7% average
            "max_volatility": 0.15,  # 15%
            "min_weight": 0.05,     # 5%
            "max_weight": 0.25      # 25%
        },
        {
            "id": "moderate",
            "name": "Moderate",
            "description": "Balanced risk and return",
            "target_return": 0.10,  # 10% average
            "max_volatility": 0.20,  # 20%
            "min_weight": 0.01,     # 1%
            "max_weight": 0.30      # 30%
        },
        {
            "id": "aggressive",
            "name": "Aggressive",
            "description": "High risk, high potential returns",
            "target_return": 0.15,  # 15% average
            "max_volatility": 0.25,  # 25%
            "min_weight": 0.01,     # 1%
            "max_weight": 0.40      # 40%
        }
    ]

@router.post("/validate", response_model=Dict)
async def validate_portfolio():
    """
    Validate if current portfolio is ready for optimization
    """
    try:
        holdings = await portfolio_service.get_holdings_with_current_prices()
        
        total_value = sum(h.value for h in holdings) if holdings else 0
        symbols = [h.symbol for h in holdings] if holdings else []
        
        issues = []
        suggestions = []
        
        if len(holdings) == 0:
            issues.append("No holdings found in portfolio")
            suggestions.append("Add at least 3 holdings to your portfolio")
        elif len(holdings) < 3:
            issues.append(f"Need at least 3 holdings for optimization (current: {len(holdings)})")
            suggestions.append("Add more holdings to diversify your portfolio")
        
        if total_value <= 0:
            issues.append("Portfolio has no value")
            suggestions.append("Ensure all holdings have positive values")
        
        is_valid = len(holdings) >= 3 and total_value > 0
        
        validation = {
            "is_valid": is_valid,
            "issues": issues,
            "suggestions": suggestions,
            "portfolio_summary": {
                "total_value": total_value,
                "holdings_count": len(holdings),
                "symbols": symbols
            }
        }
        
        return validation
        
    except Exception as e:
        logger.error(f"Portfolio validation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@router.get("/health")
async def optimization_health_check():
    """
    Health check for optimization service
    """
    try:
        # Test if we can import required libraries
        import pypfopt
        import pandas
        import numpy
        from app.external.marketstack import marketstack_client
        
        # Test Marketstack connection
        marketstack_healthy = marketstack_client.test_connection()
        
        return {
            "status": "healthy",
            "dependencies": {
                "pypfopt": True,
                "pandas": True,
                "numpy": True,
                "marketstack": marketstack_healthy
            },
            "cache_size": len(optimization_service.cache),
            "marketstack_api_key_configured": bool(marketstack_client.api_key)
        }
    except ImportError as e:
        return {
            "status": "unhealthy",
            "error": f"Missing dependency: {str(e)}",
            "dependencies": {
                "pypfopt": False,
                "pandas": False,
                "numpy": False,
                "marketstack": False
            }
        }
