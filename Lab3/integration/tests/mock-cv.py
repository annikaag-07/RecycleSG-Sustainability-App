"""TEST ONLY: run the real /verify adapter with deterministic fake inference."""
import json
import sys
from pathlib import Path
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'CV'))
import verification
import app
import uvicorn


def fake_classify(data, mime, filename):
    with urlopen('http://127.0.0.1:54321/__test/cv', timeout=5) as response:
        mode = json.load(response)['mode']
    return {'status': 'ok' if mode in ('ok', 'mismatch') else mode,
            'material': ('glass' if mode == 'mismatch' else 'plastic') if mode in ('ok', 'mismatch') else None,
            'confidence': 0.95 if mode in ('ok', 'mismatch') else 0.1}


verification.classify_image = fake_classify
app.classify_image = fake_classify
uvicorn.run(app.app, host='127.0.0.1', port=8001, log_level='warning')
