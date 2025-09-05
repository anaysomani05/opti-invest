#!/usr/bin/env python3
"""
Test script for Portfolio Optimization API endpoints
"""

import asyncio
import httpx
import json
from datetime import date

BASE_URL = "http://localhost:8000"

async def test_optimization_health():
    """Test optimization health endpoint"""
    print("Testing Optimization Health...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/api/optimization/health")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            return response.status_code == 200
        except Exception as e:
            print(f"Error: {e}")
            return False

async def test_risk_profiles():
    """Test get risk profiles endpoint"""
    print("\nTesting Risk Profiles...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/api/optimization/risk-profiles")
            print(f"Status: {response.status_code}")
            data = response.json()
            print(f"Available Risk Profiles: {list(data.keys())}")
            for profile, config in data.items():
                print(f"  • {profile}: {config['name']} - {config['description']}")
            return response.status_code == 200
        except Exception as e:
            print(f"Error: {e}")
            return False

async def setup_test_portfolio():
    """Setup a test portfolio with 3 holdings"""
    print("\nSetting up test portfolio...")
    
    # Clear existing portfolio
    async with httpx.AsyncClient() as client:
        await client.post(f"{BASE_URL}/api/portfolio/reset")
    
    # Add test holdings (only 3 to avoid rate limiting)
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
            else:
                print(f"  Failed to add {holding['symbol']}: {response.text}")
    
    return True

async def test_portfolio_validation():
    """Test portfolio validation endpoint"""
    print("\nTesting Portfolio Validation...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(f"{BASE_URL}/api/optimization/validate")
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Validation Results:")
                for key, value in data.items():
                    status = "PASS" if value else "FAIL"
                    print(f"  {status} {key}: {value}")
                return data.get("ready_for_optimization", False)
            else:
                print(f"Validation failed: {response.text}")
                return False
        except Exception as e:
            print(f"Error: {e}")
            return False

async def test_portfolio_optimization():
    """Test portfolio optimization endpoint"""
    print("\nTesting Portfolio Optimization...")
    
    optimization_request = {
        "risk_profile": "moderate",
        "objective": "max_sharpe",
        "lookback_period": 252,
        "min_weight": 0.05,
        "max_weight": 0.50
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:  # Longer timeout for optimization
        try:
            print(f"Sending optimization request: {optimization_request}")
            response = await client.post(
                f"{BASE_URL}/api/optimization/optimize",
                json=optimization_request
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print("Optimization Successful!")
                print(f"Expected Return: {data['expected_return']:.1%}")
                print(f"Volatility: {data['volatility']:.1%}")
                print(f"Sharpe Ratio: {data['sharpe_ratio']:.2f}")
                
                if data.get('max_drawdown'):
                    print(f"Max Drawdown: {data['max_drawdown']:.1%}")
                
                if data.get('cvar'):
                    print(f"CVaR (95%): {data['cvar']:.1%}")
                
                print(f"Optimal Weights:")
                for symbol, weight in data['optimal_weights'].items():
                    if weight > 0.01:  # Only show weights > 1%
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
                
                return True
            else:
                print(f"Optimization failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"Error during optimization: {e}")
            return False

async def test_portfolio_metrics():
    """Test current portfolio metrics endpoint"""
    print("\nTesting Current Portfolio Metrics...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.get(f"{BASE_URL}/api/optimization/portfolio-metrics")
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print("Current Portfolio Metrics:")
                print(f"  • Expected Return: {data['expected_return']:.1%}")
                print(f"  • Volatility: {data['volatility']:.1%}")
                print(f"  • Sharpe Ratio: {data['sharpe_ratio']:.2f}")
                return True
            else:
                print(f"Failed: {response.text}")
                return False
        except Exception as e:
            print(f"Error: {e}")
            return False

async def test_efficient_frontier():
    """Test efficient frontier endpoint"""
    print("\nTesting Efficient Frontier...")
    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            response = await client.get(f"{BASE_URL}/api/optimization/efficient-frontier/moderate")
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Generated {len(data)} efficient frontier points")
                if len(data) > 0:
                    print("Sample points:")
                    for i, point in enumerate(data[:3]):  # Show first 3 points
                        print(f"  Point {i+1}: Return={point['expected_return']:.1%}, "
                              f"Volatility={point['volatility']:.1%}, "
                              f"Sharpe={point['sharpe_ratio']:.2f}")
                return True
            else:
                print(f"Failed: {response.text}")
                return False
        except Exception as e:
            print(f"Error: {e}")
            return False

async def main():
    """Run all optimization tests"""
    print("Portfolio Optimization API Tests")
    print("=" * 50)
    
    results = {}
    
    # Test 1: Health check
    results['health'] = await test_optimization_health()
    
    # Test 2: Risk profiles
    results['risk_profiles'] = await test_risk_profiles()
    
    # Test 3: Setup portfolio
    results['setup'] = await setup_test_portfolio()
    
    # Test 4: Portfolio validation
    results['validation'] = await test_portfolio_validation()
    
    # Only proceed with optimization if portfolio is valid
    if results['validation']:
        # Test 5: Portfolio optimization
        results['optimization'] = await test_portfolio_optimization()
        
        # Test 6: Portfolio metrics
        results['metrics'] = await test_portfolio_metrics()
        
        # Test 7: Efficient frontier
        results['frontier'] = await test_efficient_frontier()
    else:
        print("Skipping optimization tests due to invalid portfolio")
        results['optimization'] = False
        results['metrics'] = False
        results['frontier'] = False
    
    # Summary
    print("\n" + "=" * 50)
    print("Test Results Summary:")
    for test, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {status} {test}")
    
    total_tests = len(results)
    passed_tests = sum(results.values())
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("All tests passed! Portfolio optimization is working correctly.")
    else:
        print("Some tests failed. Check the logs above for details.")

if __name__ == "__main__":
    asyncio.run(main())
