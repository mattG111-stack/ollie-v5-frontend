"""Disposable browser-test API plus the real requested-stage worker.

No scheduled collection, live credentials or production database is used.
"""
import os
from pathlib import Path
import subprocess
import sys

assert os.environ.get('E2E_DATABASE_RESET') == '1'
assert os.environ.get('DATABASE_URL') == 'sqlite:////tmp/e2e.db'
sys.path.insert(0, str(Path.cwd()))
from scripts.seed_e2e import main as seed

assert seed() == 0
# These two synthetic arrivals must represent deals after the real pricing
# engine runs. The legacy fixture's $1.15m asks correctly fail the margin gate.
from db import SessionLocal
from models import PropertyForSale
with SessionLocal() as db:
    arrivals = db.query(PropertyForSale).filter(PropertyForSale.slug_id.in_(
        ['e2e-waiting-1', 'e2e-waiting-2'])).all()
    assert len(arrivals) == 2
    for listing in arrivals:
        listing.asking_price = 1_000_000
    db.commit()
worker = subprocess.Popen([
    sys.executable, '-c',
    'from requested_stages import poll_requested_stages; poll_requested_stages()',
])
try:
    import uvicorn
    uvicorn.run('main:app', host='127.0.0.1', port=8100)
finally:
    worker.terminate()
    try:
        worker.wait(timeout=10)
    except subprocess.TimeoutExpired:
        worker.kill()
        worker.wait()
