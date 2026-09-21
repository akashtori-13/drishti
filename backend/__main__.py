"""Entry point for running backend as a module: python -m backend."""
from backend.app import app
import uvicorn
from backend.config import API_HOST, API_PORT

if __name__ == "__main__":
    uvicorn.run(app, host=API_HOST, port=API_PORT)
