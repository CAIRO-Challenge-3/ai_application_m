from pathlib import Path
from threading import Lock
from datetime import datetime, timezone
from contextlib import contextmanager
import io
import json
import os
import sqlite3
import urllib.request
import uuid
import hashlib

from flask import Flask, jsonify, request, send_from_directory, Response
from PIL import Image, UnidentifiedImageError
from ppe_policy import evaluate, GEAR
from navigation import NODES, EDGES, EXITS, PROFILES, route_for

ROOT = Path(__file__).resolve().parent
BUILD_ID = hashlib.sha256(b''.join((ROOT / filename).read_bytes() for filename in
    ('app.py', 'launcher.py', 'navigation.py', 'ppe_policy.py'))).hexdigest()[:16]
MODEL_PATH = ROOT / 'models' / 'best.pt'
MODEL_URL = 'https://huggingface.co/killuminati1/construction-ppe-yolov8/resolve/main/best.pt'
BRIDGE = os.environ.get('PEPPER_BRIDGE_URL', '').rstrip('/')
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config.update(MAX_CONTENT_LENGTH=5 * 1024 * 1024, HELP_DB=str(ROOT / 'help-requests.sqlite3'))
model = None
model_lock = Lock()
database_lock = Lock()
ROOMS = {'assembly', 'wood', 'dining', 'sanitary', 'support'}


def get_model():
    global model
    with model_lock:
        if model is None:
            if not MODEL_PATH.exists():
                MODEL_PATH.parent.mkdir(exist_ok=True)
                temporary = MODEL_PATH.with_suffix('.download')
                try:
                    urllib.request.urlretrieve(MODEL_URL, temporary)
                    temporary.replace(MODEL_PATH)
                finally:
                    temporary.unlink(missing_ok=True)
            from ultralytics import YOLO
            model = YOLO(str(MODEL_PATH))
    return model


def bridge(path, payload=None):
    if not BRIDGE:
        raise RuntimeError('Pepper bridge is not configured')
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    headers = {'Content-Type': 'application/json'}
    token = os.environ.get('PEPPER_BRIDGE_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    with urllib.request.urlopen(urllib.request.Request(BRIDGE + path, data=data, headers=headers), timeout=8) as response:
        return response.read()


@app.get('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.get('/assistant')
def assistant():
    return send_from_directory(app.static_folder, 'assistant.html')


@app.get('/api/status')
def status():
    return jsonify(model_loaded=model is not None, weights_available=MODEL_PATH.exists(),
                   camera_source='pepper' if BRIDGE else 'browser', speech_source='pepper' if BRIDGE else 'browser')


@app.get('/api/health')
def health():
    return jsonify(app_id='pepper-workplace-helper', build_id=BUILD_ID, ready=True)


@app.get('/api/companion')
def companion():
    return jsonify(profiles=PROFILES, nodes=NODES, edges=EDGES, exits=EXITS,
                   initial_location='reception', demo=True)


@app.post('/api/route')
def route():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(route_for(data.get('current'), data.get('profile'), data.get('mode')))
    except (ValueError, TypeError):
        return jsonify(error='Kein hinterlegter Weg für diesen Standort.'), 400


@app.get('/api/pepper/frame')
def pepper_frame():
    try:
        return Response(bridge('/frame'), mimetype='image/jpeg', headers={'Cache-Control': 'no-store'})
    except Exception:
        return jsonify(error='Pepper-Kamera nicht erreichbar.'), 503


@app.post('/api/speak')
def speak():
    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    if not isinstance(text, str) or len(text) > 1500:
        return jsonify(error='Invalid text'), 400
    try:
        bridge('/speak', {'text': text})
        return jsonify(ok=True)
    except Exception:
        return jsonify(error='Pepper-Stimme nicht erreichbar.'), 503


@app.post('/api/detect')
def detect():
    required = request.form.getlist('required') or ['helmet', 'gloves']
    if len(required) != len(set(required)) or any(key not in GEAR for key in required):
        return jsonify(error='Invalid safety check'), 400
    image = request.files.get('image')
    try:
        if request.form.get('source') == 'pepper':
            raw = bridge('/frame')
        elif image:
            raw = image.read()
        else:
            return jsonify(error='Kein Kamerabild erhalten.'), 400
        with Image.open(io.BytesIO(raw)) as source:
            if source.width * source.height > 12_000_000:
                return jsonify(error='Image is too large'), 400
            frame = source.convert('RGB')
        detector = get_model()
        with model_lock:
            result = detector.predict(frame, conf=0.45, imgsz=640, verbose=False)[0]
        detections = []
        for box in result.boxes:
            detections.append({'label': result.names[int(box.cls[0])],
                               'confidence': round(float(box.conf[0]), 3),
                               'box': [round(float(v), 2) for v in box.xyxy[0].tolist()]})
        return jsonify(detections=detections, width=frame.width, height=frame.height,
                       assessment=evaluate(detections, required))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return jsonify(error='Das Bild konnte nicht gelesen werden.'), 400
    except Exception:
        app.logger.exception('Detection failed')
        return jsonify(error='Der Check ist gerade nicht erreichbar. Bitte hole Hilfe.'), 503


@contextmanager
def database():
    db = sqlite3.connect(app.config['HELP_DB'])
    db.row_factory = sqlite3.Row
    try:
        with database_lock, db:
            db.execute("CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, room TEXT, reason TEXT, created TEXT, status TEXT, location TEXT DEFAULT 'reception')")
            columns = {row['name'] for row in db.execute('PRAGMA table_info(requests)')}
            if 'location' not in columns:
                db.execute("ALTER TABLE requests ADD COLUMN location TEXT DEFAULT 'reception'")
            yield db
    finally:
        db.close()


@app.post('/api/help')
def request_help():
    data = request.get_json(silent=True) or {}
    room, reason = data.get('room'), data.get('reason', 'general')
    location = data.get('location', 'reception')
    if room not in ROOMS or reason not in ('ppe', 'general') or location not in NODES:
        return jsonify(error='Invalid help request'), 400
    try:
        request_id = str(uuid.UUID(data.get('id', '')))
    except (ValueError, TypeError, AttributeError):
        return jsonify(error='Invalid request ID'), 400
    with database() as db:
        db.execute('INSERT OR IGNORE INTO requests (id, room, reason, created, status, location) VALUES (?, ?, ?, ?, ?, ?)',
                   (request_id, room, reason, datetime.now(timezone.utc).isoformat(), 'new', location))
        item = dict(db.execute('SELECT * FROM requests WHERE id=?', (request_id,)).fetchone())
    return jsonify(item), 201


@app.get('/api/help')
def list_help():
    with database() as db:
        items = [dict(r) for r in db.execute("SELECT * FROM requests WHERE status != 'resolved' ORDER BY created DESC")]
    return jsonify(items)


@app.get('/api/help/<request_id>')
def help_status(request_id):
    with database() as db:
        row = db.execute('SELECT * FROM requests WHERE id=?', (request_id,)).fetchone()
    return (jsonify(dict(row)), 200) if row else (jsonify(error='Not found'), 404)


@app.patch('/api/help/<request_id>')
def update_help(request_id):
    state = (request.get_json(silent=True) or {}).get('status')
    if state not in ('acknowledged', 'resolved'):
        return jsonify(error='Invalid status'), 400
    with database() as db:
        changed = db.execute('UPDATE requests SET status=? WHERE id=?', (state, request_id)).rowcount
    return (jsonify(ok=True), 200) if changed else (jsonify(error='Not found'), 404)


@app.after_request
def no_store(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


if __name__ == '__main__':
    from launcher import main
    raise SystemExit(main())
