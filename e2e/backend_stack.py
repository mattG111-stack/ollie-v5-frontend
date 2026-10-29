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
# Real retained-price capture on existing synthetic customer fixtures only.
from datetime import timedelta, timezone
from models import ImportBatch
from asking_history import record_batch
with SessionLocal() as db:
    subject = db.query(PropertyForSale).filter(PropertyForSale.address.like('1 Test Street%')).order_by(PropertyForSale.id).first()
    assert subject is not None
    current = db.get(ImportBatch, subject.import_batch_id)
    subject.sale_method = 'fixed'
    subject.asking_basis = 'advertised'
    subject.url = 'https://example.invalid/e2e/advertised-price'
    old = ImportBatch(batch_type='for_sale', region='Auckland', filename='synthetic-price-baseline.csv',
        status='archived', is_active=False,
        created_at=current.created_at.replace(tzinfo=timezone.utc) - timedelta(days=7))
    db.add(old); db.flush()
    db.add(PropertyForSale(import_batch_id=old.id, address=subject.address,
        suburb=subject.suburb, region=subject.region, asking_price=subject.asking_price + 50000,
        asking_basis='advertised', sale_method='fixed', url=subject.url,
        cv_numeric=subject.cv_numeric, is_held=False))
    db.flush()
    record_batch(db, old.id)
    record_batch(db, current.id)
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
