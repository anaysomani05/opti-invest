# Backend Tests

This directory contains integration tests for the QuantIQ backend API.

## Test Files

- `test_api.py` - Tests all portfolio and market data endpoints
- `test_optimization_api.py` - Tests portfolio optimization functionality
- `test_marketstack.py` - Tests Marketstack integration for historical data

## Running Tests

Make sure the backend server is running on `http://localhost:8000`, then:

```bash
# Test all API endpoints
python tests/test_api.py

# Test optimization functionality
python tests/test_optimization_api.py

# Test Marketstack integration
python tests/test_marketstack.py
```

## Test Data

The `fixtures/` directory contains sample CSV files for testing portfolio upload functionality.

## Note

These are integration tests that require the backend server to be running. They test the full API functionality including external service integrations.
