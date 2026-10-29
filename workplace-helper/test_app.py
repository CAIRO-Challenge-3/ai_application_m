import io
import tempfile
import unittest
import uuid
from pathlib import Path
from PIL import Image
from ppe_policy import evaluate
from app import app
from navigation import route_for, shortest_path, NODES, EDGES


def det(label, box=(15, 15, 35, 35)):
    return {'label': label, 'box': box, 'confidence': .9}


class SafetyPolicyTests(unittest.TestCase):
    def setUp(self):
        self.person = det('Worker', (0, 0, 100, 200))

    def test_empty_frame_cannot_pass(self):
        self.assertFalse(evaluate([], ['helmet'])['passed'])

    def test_gear_without_person_cannot_pass(self):
        self.assertFalse(evaluate([det('Hard_hat')], ['helmet'])['passed'])

    def test_all_required_gear_must_be_present(self):
        self.assertFalse(evaluate([self.person, det('Hard_hat')], ['helmet', 'gloves'])['passed'])

    def test_conflicting_missing_label_blocks_pass(self):
        self.assertFalse(evaluate([self.person, det('Hard_hat'), det('No-Helmet')], ['helmet'])['passed'])

    def test_positive_single_person_check(self):
        self.assertTrue(evaluate([self.person, det('Hard_hat'), det('Glove')], ['helmet', 'gloves'])['passed'])

    def test_two_people_cannot_pass(self):
        self.assertFalse(evaluate([self.person, self.person, det('Hard_hat')], ['helmet'])['passed'])

    def test_unassociated_equipment_cannot_pass(self):
        self.assertFalse(evaluate([self.person, det('Hard_hat', (300, 300, 350, 350))], ['helmet'])['passed'])


class HelpWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        app.config.update(TESTING=True, HELP_DB=str(Path(self.folder.name) / 'help.sqlite3'))
        self.client = app.test_client()

    def tearDown(self):
        self.folder.cleanup()

    def test_help_delivery_retry_acknowledgement_and_resolution(self):
        data = {'id': str(uuid.uuid4()), 'room': 'wood', 'reason': 'ppe', 'location': 'west_bottom'}
        first = self.client.post('/api/help', json=data)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json['location'], 'west_bottom')
        self.client.post('/api/help', json=data)
        self.assertEqual(len(self.client.get('/api/help').json), 1)
        url = '/api/help/' + data['id']
        self.assertEqual(self.client.patch(url, json={'status': 'acknowledged'}).status_code, 200)
        self.assertEqual(self.client.get(url).json['status'], 'acknowledged')
        self.client.patch(url, json={'status': 'resolved'})
        self.assertEqual(self.client.get('/api/help').json, [])

    def test_invalid_requests_rejected(self):
        self.assertEqual(self.client.post('/api/help', json={'room': 'unknown'}).status_code, 400)
        self.assertEqual(self.client.post('/api/detect').status_code, 400)
        self.assertEqual(self.client.post('/api/detect', data={'required': 'unknown'}).status_code, 400)
        self.assertEqual(self.client.post('/api/detect', data={'image': (io.BytesIO(b'not a photo'), 'bad.jpg')}).status_code, 400)


class NavigationTests(unittest.TestCase):
    def test_assignment_has_exact_target_and_connected_route(self):
        route = route_for('reception', 'demo-alex', 'work')
        self.assertEqual(route['path'][0], 'reception')
        self.assertEqual(route['destination'], 'assembly')
        self.assertEqual(route['path'][-1], 'assembly')
        for a, b in zip(route['path'], route['path'][1:]):
            self.assertTrue((a, b) in EDGES or (b, a) in EDGES)
        self.assertEqual({s['key'] for s in route['signs']}, {'aid', 'noSmoke', 'trip', 'gloves'})

    def test_exit_starts_at_confirmed_position(self):
        for current in NODES:
            route = route_for(current, None, 'exit')
            self.assertEqual(route['path'][0], current)
            self.assertEqual(route['path'][-1], 'exit_main')
            self.assertFalse(route['verified_escape_plan'])
            self.assertFalse(route['live_position'])

    def test_nearest_exit_uses_walkable_graph_not_euclidean_distance(self):
        nodes = {'start': {'x': 0, 'y': 0}, 'detour': {'x': 0, 'y': 100},
                 'looks_close': {'x': 1, 'y': 0}, 'actually_close': {'x': 10, 'y': 0}}
        path, length = shortest_path('start', ['looks_close', 'actually_close'], nodes,
                                    [('start', 'detour'), ('detour', 'looks_close'), ('start', 'actually_close')])
        self.assertEqual(path, ['start', 'actually_close'])
        self.assertEqual(length, 10)

    def test_invalid_or_unreachable_location_not_routed(self):
        with self.assertRaises(ValueError):
            route_for('unconfirmed-room', None, 'exit')
        with self.assertRaises(ValueError):
            shortest_path('reception', ['assembly'], NODES, [])
        self.assertEqual(app.test_client().post('/api/route', json={'current':'unknown','mode':'exit'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
