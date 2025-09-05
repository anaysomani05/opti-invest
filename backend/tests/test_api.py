#!/usr/bin/env python3
"""
Test script for QuantIQ Backend APIs
Tests all Portfolio and Market endpoints
"""

import asyncio
import httpx
import json
from datetime import date

BASE_URL = "http://localhost:8000"

async def test_health():
    """Test health endpoint"""
    print("Testing Health Endpoint...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        print("Health check passed\n")

async def test_portfolio_crud():
    """Test Portfolio CRUD operations"""
    print("Testing Portfolio CRUD Operations...")
    
    async with httpx.AsyncClient() as client:
        # 1. Test empty portfolio
        print("1. Getting empty portfolio...")
        response = await client.get(f"{BASE_URL}/api/portfolio/holdings")
        print(f"Empty holdings: {response.json()}")
        
        # 2. Add holdings
        print("\n2. Adding test holdings...")
        holdings_to_add = [
            {"symbol": "AAPL", "quantity": 100, "buy_price": 150.00},
            {"symbol": "MSFT", "quantity": 75, "buy_price": 280.00},
            {"symbol": "GOOGL", "quantity": 50, "buy_price": 120.00},
        ]
        
        added_holdings = []
        for holding_data in holdings_to_add:
            response = await client.post(
                f"{BASE_URL}/api/portfolio/holdings",
                json=holding_data
            )
            if response.status_code == 200:
                holding = response.json()
                added_holdings.append(holding)
                print(f"Added {holding['symbol']}: {holding['id']}")
            else:
                print(f"Failed to add {holding_data['symbol']}: {response.text}")
        
        # 3. Get all holdings
        print("\n3. Getting all holdings...")
        response = await client.get(f"{BASE_URL}/api/portfolio/holdings")
        holdings = response.json()
        print(f"Total holdings: {len(holdings)}")
        for holding in holdings:
            print(f"  - {holding['symbol']}: {holding['quantity']} shares @ ${holding['buy_price']}")
        
        # 4. Update a holding
        if added_holdings:
            print("\n4. Updating a holding...")
            holding_to_update = added_holdings[0]
            update_data = {"quantity": 120, "buy_price": 155.00}
            response = await client.put(
                f"{BASE_URL}/api/portfolio/holdings/{holding_to_update['id']}",
                json=update_data
            )
            if response.status_code == 200:
                updated = response.json()
                print(f"Updated {updated['symbol']}: {updated['quantity']} shares @ ${updated['buy_price']}")
            else:
                print(f"Failed to update: {response.text}")
        
        # 5. Get portfolio overview
        print("\n5. Getting portfolio overview...")
        response = await client.get(f"{BASE_URL}/api/portfolio/overview")
        if response.status_code == 200:
            overview = response.json()
            summary = overview['summary']
            print(f"Portfolio Summary:")
            print(f"  Total Value: ${summary['total_value']:,.2f}")
            print(f"  Total Gain/Loss: ${summary['total_gain_loss']:,.2f}")
            print(f"  Gain/Loss %: {summary['total_gain_loss_percent']:.2f}%")
            print(f"  Holdings Count: {summary['holdings_count']}")
            
            if overview.get('sector_allocation'):
                print(f"Sector Allocation:")
                for sector, percentage in overview['sector_allocation'].items():
                    print(f"  - {sector}: {percentage:.1f}%")
        else:
            print(f"Failed to get overview: {response.text}")
        
        # 6. Test holdings with metrics
        print("\n6. Getting holdings with metrics...")
        response = await client.get(f"{BASE_URL}/api/portfolio/holdings-with-metrics")
        if response.status_code == 200:
            holdings_with_metrics = response.json()
            print(f"Holdings with current prices:")
            for holding in holdings_with_metrics:
                print(f"  - {holding['symbol']}: ${holding['current_price']:.2f} "
                      f"(${holding['gain_loss']:+.2f}, {holding['gain_loss_percent']:+.2f}%)")
        else:
            print(f"Failed to get holdings with metrics: {response.text}")
        
        print("Portfolio CRUD tests completed\n")
        return added_holdings

async def test_market_data():
    """Test Market Data endpoints"""
    print("Testing Market Data APIs...")
    
    async with httpx.AsyncClient() as client:
        # 1. Test single quote
        print("1. Getting single quote...")
        response = await client.get(f"{BASE_URL}/api/market/quote/AAPL")
        if response.status_code == 200:
            quote = response.json()
            print(f"AAPL Quote: ${quote['price']:.2f} ({quote['change_percent']:+.2f}%)")
        else:
            print(f"Failed to get quote: {response.text}")
        
        # 2. Test batch quotes
        print("\n2. Getting batch quotes...")
        symbols = ["AAPL", "MSFT", "GOOGL"]
        response = await client.post(
            f"{BASE_URL}/api/market/quotes",
            json=symbols
        )
        if response.status_code == 200:
            quotes = response.json()
            print(f"Batch quotes:")
            for symbol, quote in quotes.items():
                if quote:
                    print(f"  - {symbol}: ${quote['price']:.2f}")
                else:
                    print(f"  - {symbol}: No data")
        else:
            print(f"Failed to get batch quotes: {response.text}")
        
        # 3. Test symbol search
        print("\n3. Testing symbol search...")
        response = await client.get(f"{BASE_URL}/api/market/search?q=Apple")
        if response.status_code == 200:
            search_results = response.json()
            print(f"Search results for 'Apple': {len(search_results.get('results', []))} found")
            for result in search_results.get('results', [])[:3]:  # Show first 3
                print(f"  - {result.get('1. symbol', 'N/A')}: {result.get('2. name', 'N/A')}")
        else:
            print(f"Failed to search: {response.text}")
        
        print("Market data tests completed\n")

async def test_csv_upload():
    """Test CSV upload functionality"""
    print("Testing CSV Upload...")
    
    # Create test CSV content
    csv_content = """symbol,quantity,buy_price,buy_date
TSLA,25,200.00,2024-01-15
NVDA,30,400.00,2024-01-20
META,40,300.00,2024-01-25"""
    
    async with httpx.AsyncClient() as client:
        # Test CSV upload
        files = {"file": ("test_portfolio.csv", csv_content, "text/csv")}
        response = await client.post(f"{BASE_URL}/api/portfolio/upload-csv", files=files)
        
        if response.status_code == 200:
            result = response.json()
            print(f"CSV Upload Result:")
            print(f"  Success: {result['success']}")
            print(f"  Message: {result['message']}")
            print(f"  Holdings Added: {result['holdings_added']}")
            if result.get('errors'):
                print(f"  Errors: {result['errors']}")
        else:
            print(f"Failed to upload CSV: {response.text}")
    
    print("CSV upload test completed\n")

async def test_portfolio_reset():
    """Test portfolio reset"""
    print("Testing Portfolio Reset...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/api/portfolio/reset")
        if response.status_code == 200:
            result = response.json()
            print(f"Reset result: {result['message']}")
            
            # Verify portfolio is empty
            response = await client.get(f"{BASE_URL}/api/portfolio/holdings")
            holdings = response.json()
            print(f"Holdings after reset: {len(holdings)}")
        else:
            print(f"Failed to reset portfolio: {response.text}")
    
    print("Portfolio reset test completed\n")

async def main():
    """Run all tests"""
    print("Starting QuantIQ Backend API Tests")
    print("=" * 50)
    
    try:
        # Test all endpoints
        await test_health()
        holdings = await test_portfolio_crud()
        await test_market_data()
        await test_csv_upload()
        await test_portfolio_reset()
        
        print("All tests completed successfully!")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
