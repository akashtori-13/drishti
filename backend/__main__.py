"""Run the dev API: python -m backend."""
import uvicorn
from backend.app import app
from backend.config import API_HOST, API_PORT

if __name__ == "__main__":
    uvicorn.run(app, host=API_HOST, port=API_PORT)
