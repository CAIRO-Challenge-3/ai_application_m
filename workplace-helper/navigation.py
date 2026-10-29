"""Example facility graph. Coordinates are schematic, not live robot positions."""
import heapq
import math

NODES = {
    'reception': {'x': 530, 'y': 410, 'name': 'Empfang'},
    'hub': {'x': 530, 'y': 270, 'name': 'Flur am Empfang'},
    'west': {'x': 350, 'y': 270, 'name': 'linker Flur'},
    'west_top': {'x': 350, 'y': 165, 'name': 'Tür zu Werkstatt 1'},
    'assembly': {'x': 195, 'y': 165, 'name': 'Packplatz A · Werkstatt 1'},
    'west_bottom': {'x': 350, 'y': 390, 'name': 'Tür zu Werkstatt 2'},
    'wood': {'x': 195, 'y': 390, 'name': 'Handarbeitsplatz H1 · Werkstatt 2'},
    'dining': {'x': 530, 'y': 165, 'name': 'Tisch 1 · Speisesaal'},
    'east': {'x': 710, 'y': 270, 'name': 'rechter Flur'},
    'east_top': {'x': 710, 'y': 165, 'name': 'Tür zur Betreuung'},
    'support': {'x': 870, 'y': 165, 'name': 'Platz B1 · Betreuung'},
    'east_bottom': {'x': 710, 'y': 390, 'name': 'Tür zum Sanitärbereich'},
    'sanitary': {'x': 870, 'y': 390, 'name': 'Sanitär- und Pflegebereich'},
    'exit_main': {'x': 530, 'y': 520, 'name': 'Hauptausgang'},
}
EDGES = [('reception', 'hub'), ('hub', 'west'), ('west', 'west_top'),
         ('west_top', 'assembly'), ('west', 'west_bottom'), ('west_bottom', 'wood'),
         ('hub', 'dining'), ('hub', 'east'), ('east', 'east_top'), ('east_top', 'support'),
         ('east', 'east_bottom'), ('east_bottom', 'sanitary'), ('reception', 'exit_main')]
# The supplied drawing has no approved exit inventory. Only its main entrance is
# represented as an example exit; no unseen "safe" alternatives are invented.
EXITS = ['exit_main']
PROFILES = [
    {'id': 'demo-alex', 'name': 'Alex', 'room': 'assembly', 'station': 'Packplatz A', 'required': ['helmet', 'gloves']},
    {'id': 'demo-sam', 'name': 'Sam', 'room': 'wood', 'station': 'Handarbeitsplatz H1', 'required': ['helmet']},
    {'id': 'demo-kim', 'name': 'Kim', 'room': 'support', 'station': 'Platz B1', 'required': ['gloves']},
]
SIGNS = [
    {'id': 'reception-aid', 'node': 'reception', 'key': 'aid', 'x': 615, 'y': 392},
    {'id': 'hall-no-smoke', 'node': 'hub', 'key': 'noSmoke', 'x': 590, 'y': 270},
    {'id': 'west-trip', 'node': 'west', 'key': 'trip', 'x': 398, 'y': 270},
    {'id': 'east-trip', 'node': 'east', 'key': 'trip', 'x': 658, 'y': 270},
    {'id': 'assembly-gloves', 'node': 'west_top', 'key': 'gloves', 'x': 350, 'y': 109},
    {'id': 'wood-glasses', 'node': 'west_bottom', 'key': 'glasses', 'x': 350, 'y': 445},
    {'id': 'dining-wash', 'node': 'dining', 'key': 'wash', 'x': 605, 'y': 185},
    {'id': 'dining-hot', 'node': 'dining', 'key': 'hot', 'x': 455, 'y': 185},
    {'id': 'care-wash', 'node': 'east_bottom', 'key': 'wash', 'x': 710, 'y': 445},
    {'id': 'support-aid', 'node': 'east_top', 'key': 'aid', 'x': 710, 'y': 109},
    {'id': 'main-exit', 'node': 'exit_main', 'key': 'exit', 'x': 600, 'y': 515},
]


def shortest_path(start, goals, nodes=NODES, edges=EDGES):
    """Dijkstra by schematic path length, never straight-line distance through walls."""
    if start not in nodes or not goals or any(g not in nodes for g in goals):
        raise ValueError('Unknown location')
    adjacent = {key: [] for key in nodes}
    for a, b in edges:
        distance = math.hypot(nodes[a]['x'] - nodes[b]['x'], nodes[a]['y'] - nodes[b]['y'])
        adjacent[a].append((b, distance))
        adjacent[b].append((a, distance))
    todo, visited = [(0, start, [start])], set()
    while todo:
        length, node, path = heapq.heappop(todo)
        if node in visited:
            continue
        visited.add(node)
        if node in goals:
            return path, length
        for next_node, cost in adjacent[node]:
            if next_node not in visited:
                heapq.heappush(todo, (length + cost, next_node, path + [next_node]))
    raise ValueError('No configured route')


def route_for(current, profile_id, mode):
    profile = next((p for p in PROFILES if p['id'] == profile_id), None)
    if mode not in ('work', 'exit') or (mode == 'work' and profile is None):
        raise ValueError('Unknown assignment')
    path, distance = shortest_path(current, EXITS if mode == 'exit' else [profile['room']])
    return {'path': path, 'destination': path[-1], 'distance_units': round(distance, 1),
            'mode': mode, 'demo': True, 'live_position': False, 'verified_escape_plan': False,
            'signs': [s for s in SIGNS if s['node'] in path]}
