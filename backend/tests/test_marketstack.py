#!/usr/bin/env python3
"""
Test Marketstack integration for portfolio optimization
"""

import asyncio
import httpx
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

async def test_marketstack_health():
    """Test if Marketstack is properly configured"""
    print("Testing Marketstack Health...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/api/optimization/health")
            print(f"Status: {response.status_code}")
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get('dependencies', {}).get('marketstack'):
                print("Marketstack is healthy and accessible")
                return True
            else:
                print("Marketstack is not accessible")
                return False
        except Exception as e:
            print(f"Error: {e}")
            return False

async def setup_test_portfolio():
    """Setup a test portfolio"""
    print("\nSetting up test portfolio...")
    
    # Clear existing portfolio
    async with httpx.AsyncClient() as client:
        await client.post(f"{BASE_URL}/api/portfolio/reset")
    
    # Add test holdings
    test_holdings = [
        {"symbol": "AAPL", "quantity": 100, "buy_price": 150.0},
        {"symbol": "MSFT", "quantity": 50, "buy_price": 300.0},
        {"symbol": "GOOGL", "quantity": 25, "buy_price": 120.0}
    ]
    
    for holding in test_holdings:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/api/portfolio/holdings",
                json=holding
            )
            if response.status_code == 200:
                print(f"  Added {holding['symbol']}: {holding['quantity']} shares @ ${holding['buy_price']}")

async def test_optimization_with_marketstack():
    """Test optimization using Marketstack data"""
    print("\nTesting Portfolio Optimization with Marketstack...")
    
    optimization_request = {
        "risk_profile": "moderate",
        "objective": "max_sharpe",
        "lookback_period": 100,  # Shorter period to save API calls
        "min_weight": 0.05,
        "max_weight": 0.50
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            print(f"Sending optimization request: {optimization_request}")
            response = await client.post(
                f"{BASE_URL}/api/optimization/optimize",
                json=optimization_request
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print("Optimization Successful with Marketstack!")
                print(f"Expected Return: {data['expected_return']:.1%}")
                print(f"Volatility: {data['volatility']:.1%}")
                print(f"Sharpe Ratio: {data['sharpe_ratio']:.2f}")
                
                if data.get('max_drawdown'):
                    print(f"Max Drawdown: {data['max_drawdown']:.1%}")
                
                if data.get('cvar'):
                    print(f"CVaR (95%): {data['cvar']:.1%}")
                
                print(f"Optimal Weights:")
                for symbol, weight in data['optimal_weights'].items():
                    if weight > 0.01:
                        print(f"  • {symbol}: {weight:.1%}")
                
                print(f"Current Weights:")
                for symbol, weight in data['current_weights'].items():
                    print(f"  • {symbol}: {weight:.1%}")
                
                print(f"Rebalancing Trades:")
                if data['rebalancing_trades']:
                    for symbol, amount in data['rebalancing_trades'].items():
                        action = "BUY" if amount > 0 else "SELL"
                        print(f"  • {action} ${abs(amount):,.0f} of {symbol}")
                else:
                    print("  • No significant rebalancing needed")
                
                print(f"Efficient Frontier Points: {len(data['efficient_frontier'])}")
                print(f"Data Period: {data['data_period']}")
                
                return True
            else:
                print(f"Optimization failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"Error during optimization: {e}")
            return False

async def main():
    """Main test function"""
    print("Marketstack Integration Test")
    print("=" * 50)
    
    # Test 1: Health check
    health_ok = await test_marketstack_health()
    
    if not health_ok:
        print("\nMarketstack is not properly configured.")
        print("Please add your Marketstack API key to the .env file:")
        print("MARKETSTACK_API_KEY=your_api_key_here")
        return
    
    # Test 2: Setup portfolio
    await setup_test_portfolio()
    
    # Test 3: Optimization
    success = await test_optimization_with_marketstack()
    
    if success:
        print("\nMarketstack integration test completed successfully!")
        print("Portfolio optimization is now using Marketstack for historical data")
        print("100 free API requests per month available")
    else:
        print("\nOptimization test failed. Check the logs above for details.")

if __name__ == "__main__":
    asyncio.run(main())
