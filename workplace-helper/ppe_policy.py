"""Conservative, image-level prototype check; never an occupational clearance."""

GEAR = {
    'helmet': {'name': 'Helm', 'positive': 'Hard_hat', 'negative': 'No-Helmet'},
    'gloves': {'name': 'Handschuhe', 'positive': 'Glove', 'negative': 'No-Glove'},
}


def evaluate(detections, required):
    workers = [d for d in detections if d['label'] == 'Worker']
    person_ok = len(workers) == 1

    def belongs_to_worker(detection):
        if not person_ok:
            return False
        x1, y1, x2, y2 = workers[0]['box']
        a, b, c, d = detection['box']
        mx, my = (c + a) / 2, (d + b) / 2
        dx, dy = (x2 - x1) * .12, (y2 - y1) * .08
        return x1 - dx <= mx <= x2 + dx and y1 - dy <= my <= y2 + dy

    checks = []
    for key in required:
        gear = GEAR[key]
        positive = any(d['label'] == gear['positive'] and belongs_to_worker(d) for d in detections)
        negative = any(d['label'] == gear['negative'] for d in detections)
        state = 'missing' if negative else 'seen' if positive else 'uncertain'
        checks.append({'key': key, 'name': gear['name'], 'state': state})
    passed = bool(checks) and person_ok and all(c['state'] == 'seen' for c in checks)
    return {'passed': passed, 'checks': checks, 'person_count': len(workers),
            'person_ok': person_ok, 'scope': 'demo_not_work_clearance'}
