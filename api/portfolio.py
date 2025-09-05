from fastapi import APIRouter, HTTPException, File, UploadFile, Depends
from typing import List
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.models import (
    Holding, HoldingCreate, HoldingUpdate, HoldingWithMetrics,
    PortfolioOverview, CSVUploadResponse, ErrorResponse
)
from app.services.portfolio_service import portfolio_service

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

@router.get("/holdings", response_model=List[Holding])
async def get_holdings():
    """Get all holdings in the current session"""
    return portfolio_service.get_all_holdings()

@router.get("/holdings-with-metrics", response_model=List[HoldingWithMetrics])
async def get_holdings_with_metrics():
    """Get all holdings with current prices and calculated metrics"""
    return await portfolio_service.get_holdings_with_current_prices()

@router.get("/holdings/{holding_id}", response_model=Holding)
async def get_holding(holding_id: str):
    """Get a specific holding by ID"""
    holding = portfolio_service.get_holding(holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding

@router.post("/holdings", response_model=Holding)
async def create_holding(holding: HoldingCreate):
    """Create a new holding"""
    try:
        return portfolio_service.create_holding(holding)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/holdings/{holding_id}", response_model=Holding)
async def update_holding(holding_id: str, holding_update: HoldingUpdate):
    """Update an existing holding"""
    updated_holding = portfolio_service.update_holding(holding_id, holding_update)
    if not updated_holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    return updated_holding

@router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: str):
    """Delete a holding"""
    success = portfolio_service.delete_holding(holding_id)
    if not success:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding deleted successfully"}

@router.post("/upload-csv", response_model=CSVUploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """Upload portfolio data via CSV file"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        # Read CSV content
        csv_content = await file.read()
        csv_string = csv_content.decode('utf-8')
        
        # Process CSV data
        holdings_to_create = portfolio_service.process_csv_data(csv_string)
        
        if not holdings_to_create:
            return CSVUploadResponse(
                success=False,
                message="No valid holdings found in CSV",
                holdings_added=0,
                errors=["CSV format should include: symbol, quantity, buy_price, buy_date (optional)"]
            )
        
        # Add holdings to portfolio
        added_count = 0
        errors = []
        
        for holding_data in holdings_to_create:
            try:
                portfolio_service.create_holding(holding_data)
                added_count += 1
            except Exception as e:
                errors.append(f"Error adding {holding_data.symbol}: {str(e)}")
        
        return CSVUploadResponse(
            success=added_count > 0,
            message=f"Successfully added {added_count} holdings",
            holdings_added=added_count,
            errors=errors
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing CSV: {str(e)}")

@router.get("/overview", response_model=PortfolioOverview)
async def get_portfolio_overview():
    """Get complete portfolio overview with summary and current prices"""
    return await portfolio_service.get_portfolio_overview()

@router.post("/reset")
async def reset_portfolio():
    """Clear all holdings from the portfolio"""
    portfolio_service.clear_portfolio()
    return {"message": "Portfolio cleared successfully"}
