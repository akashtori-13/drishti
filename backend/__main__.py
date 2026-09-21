"""Entry point for running backend as a module."""
from .app import app
import uvicorn
from .config import API_HOST, API_PORT

if __name__ == "__main__":
    uvicorn.run(app, host=API_HOST, port=API_PORT)
