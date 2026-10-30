# Pepper — safety inspection and workplace guidance

An orange-and-white, tablet-friendly application with simple German, large illustrated controls and spoken explanations. The UI uses plain HTML, CSS and JavaScript; Python runs the YOLO model. No frontend build step, API key or cloud AI account is required.

## Run on this laptop

Double-click `start.bat`. The launcher waits for the service to be ready, then opens **http://127.0.0.1:5000** in your default browser. Keep the server window open. Launching again reuses the running version instead of starting another server. Use `start.bat --no-browser` to suppress browser opening.

If an older version is running after a code update, close its server window with Ctrl+C and start again; reload the browser with Ctrl+F5. The launcher detects occupied ports and stale versions and shows an error instead of silently binding another process to the same port. `python app.py` also uses this launcher. Its `/api/health` endpoint reports application identity and backend build ID.

For a new machine:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Model weights are already in `models/best.pt` on this laptop. If missing, the first inspection downloads the requested checkpoint from [killuminati1/construction-ppe-yolov8](https://huggingface.co/killuminati1/construction-ppe-yolov8). Subsequent model inference is local. Downloaded weights are not committed to Git.

## Robot companion workflow

The employee UI is a fullscreen, sequential companion, with no dashboard columns or browsing navigation. It runs in Pepper's tablet webview; the interaction itself is designed as a robot conversation. The large **Willkommen / Welcome** target requests fullscreen on supported browsers.

1. Tap **Willkommen** and choose a named demo profile. Names are chosen explicitly; there is no face recognition.
2. Pepper asks **Bist du bereit für den Sicherheits-Check?** The camera is untouched until **Ja, jetzt prüfen** is pressed. **Noch nicht** waits quietly.
3. One image is inspected. The camera stops after the result. If a required item is missing or uncertain, Pepper explains it once, then waits. There is no automatic repeated inspection or recurring spoken warning.
4. **Erneut prüfen** starts the next single inspection. After a second unsuccessful result, **Assistenz rufen** is available. Technical errors also offer assistance.
5. A pass requires exactly one detected worker, every selected positive PPE class near that person's box, and no contradictory missing-PPE label. A blank frame or uncertain result cannot pass.
6. Pepper welcomes the employee by name, displays their example station and asks **Soll ich dir den Weg zeigen?** The map opens only after **Ja, zeig mir den Weg**.
7. The map fills the screen with a thick orange route to the assigned station. Only route-related signs are highlighted. Tapping a sign opens a single visual explanation and German speech. Task instructions also show one step at a time.
8. Pepper gives the next waypoint and waits for the user. **Hier angekommen** asks for confirmation before changing position. **Standort bestätigen** permits an explicit manual correction. Clicking a room or reading a sign does not change location.
9. **Ausgang / Exit** is always available, including inside popups and before an inspection passes. It immediately shows a red example route and speaks calm instructions. It does not require an inspection or movement confirmation first.

The fixed sample profiles in `navigation.py` are **Alex → Packplatz A / Werkstatt 1**, **Sam → Handarbeitsplatz H1 / Werkstatt 2**, and **Kim → Platz B1 / Betreuung**. Their check profiles exercise both PPE items, helmet only, and gloves only respectively. This is a clearly labelled demo roster, not a connection to the organization's daily shift planner. A real deployment needs an authenticated employee/shift source and approved task-specific PPE requirements.

### Routing and location

`navigation.py` defines a small connected graph with corridor waypoints and exact example station coordinates. Routes follow graph edges, rather than lines through unrelated rooms. Dijkstra's algorithm selects the shortest path to the assigned station or nearest configured exit by schematic walkable length. It does not calculate real metres or route safety.

Only the main entrance from the supplied drawing is configured as an **example exit**. No secondary verified emergency exit or real assembly point is invented. The graph algorithm supports multiple exits, but their actual positions and suitability must be confirmed before adding them. It has no smoke, fire, obstacle or accessibility sensing. The red path is a training illustration, not an approved evacuation route.

The default start is reception. The current position is the user's **last confirmed location**, not live robot or employee tracking. A Pepper camera connection does not provide localization. `GET /api/companion` supplies the demo roster and graph; `POST /api/route` computes routes from a validated node. Names stay in the browser's active session; there is no biometric recognition.

The PPE result is a **demo check, not permission to work**. A bounding box does not establish correct fit, both hands being protected, task suitability or certified PPE. Requirements must come from the employer's risk assessment. In particular, do not infer that gloves are appropriate near rotating woodworking machinery. The glove example concerns manual packaging; the woodworking task uses a hand sanding block and requires instruction.

## During work: the five room guides

| Room | Three example safety symbols | Illustrated task |
|---|---|---|
| Workshop 1: assembly / packaging | Gloves, protective footwear, trip hazard | Count parts → put them in a box → close and label |
| Workshop 2: woodworking | Eye protection, hearing protection, no smoking | Place wood securely → sand by hand → collect dust with a brush |
| Dining hall / cafeteria | Wash hands, hot surface, no smoking | Wash hands → bring meal to table → return dishes |
| Sanitary / care | Wash hands, slippery floor, first aid | Water and soap → wash thoroughly → dry hands |
| Support / care | First aid, emergency exit, no smoking | Speak to support person → show what you need → begin together |

Map signs and room signs open a single visual explanation with short German text and automatic speech. The replay button repeats it. Voice can be disabled globally. Native browser speech uses an available German system voice, preferring a local voice; availability and offline behavior depend on the device. The AI itself is the YOLO vision model. The safety guidance is curated text, rather than generated advice.

Tap a room on the map, or **Mein Arbeitsplatz**, for:

- **Wo ist der Feuerlöscher?**: a proposed position beside the exit, on the corridor side, plus a large pictogram and spoken explanation. Sanitary equipment is proposed outside the wet area. These are suggestions, not verified installed equipment.
- **Meine Aufgabe**: a pictorial task with 2–3 short steps. Each step is shown separately and only advances when requested.
- **Sicherheitszeichen**: the room's three example signs, each opening a single explanation.

The persistent **Ausgang / Exit** action replaces the old room-specific escape menu. It recomputes the red example route from the last confirmed position. The orange work route remains tied to the assigned station. Reading another room's information does not silently change that assignment or location.

`static/content.js` holds room content and symbol explanations. Active route geometry, profiles and sign placements are in `navigation.py`. The old route coordinate fields in content.js are retained as reference and are not used by the companion router. `static/icons.js` contains small editable SVG illustrations. These are learning illustrations, not certified ISO sign artwork. Replace them with approved facility signs before operational use.

## Help reaches a real local assistant screen

Open **http://127.0.0.1:5000/assistant** in another browser window and keep it open. It polls for requests every three seconds. Workers must tap **Ja, Assistenz rufen** to send a request. The worker is told only that the local service received it, not that somebody has seen it. When an assistant clicks **Ich kümmere mich**, the worker sees and hears confirmation. **Erledigt** resolves the request.

Requests contain an anonymous random ID, target room, manually confirmed location, reason, timestamp and status. They persist in `help-requests.sqlite3`; no names or photos are stored. Requests are not sent to email, SMS or external services. The assistant screen shows the manually confirmed location. It must not be interpreted as a live location feed. The prototype assistant API has no staff authentication: keep it local or on a controlled demonstration network. A real deployment needs authentication and a retention policy for these records.

## Connect Pepper when the hardware is available

Recommended architecture:

```text
Pepper tablet ── HTTP ── Laptop Python app + YOLO
                            │
                            └── optional NAOqi bridge ── Pepper camera + speaker
```

The current default is laptop browser camera + browser speech. The optional `pepper_bridge.py` provides a concrete adapter for a **compatible NAOqi Pepper**. It uses `ALVideoDevice` for the head camera, `ALTextToSpeech` for German speech and, optionally, `ALTabletService.showWebview` to open the app. It performs no motion and does not record the microphone. Face recognition is not implemented.

First confirm Pepper's software generation, SDK and available German voice with the organizers. The bridge must run in a Python environment compatible with the supplied `qi` SDK and Pillow. Many legacy Pepper SDKs use Python 2.7; do not move the modern YOLO runtime into that environment. The bridge is Python 2/3 compatible source, but has **not been hardware-tested**. Android/QiSDK-only deployments may require a different robot adapter, and older tablet browsers may need a bundled/polyfilled client.

On the SDK-compatible machine, set a random shared secret in `PEPPER_BRIDGE_TOKEN`, then run:

```text
python pepper_bridge.py --robot-ip <PEPPER_IP> --web-url http://<LAPTOP_IP>:5000
```

On the laptop application side, set the same token and bridge address:

```powershell
$env:PEPPER_BRIDGE_URL='http://127.0.0.1:8765'
$env:PEPPER_BRIDGE_TOKEN='<same-shared-secret>'
$env:HOST='0.0.0.0'
python app.py
```

Replace the bridge address if it runs on another machine and bind its `--host` to the appropriate private interface. The bridge defaults to loopback and requires its token. The tablet URL must be reachable from Pepper; `localhost` on Pepper refers to Pepper, not the laptop. Use only a controlled demonstration network for plain HTTP. Production requires authenticated HTTPS, a suitable server and a reviewed security setup.

When the bridge is configured, the frontend uses server-provided Pepper frames instead of `getUserMedia`, and routes speech to Pepper with browser fallback. This avoids needing browser camera access over plain network HTTP. The robot camera is not assumed to be the tablet webcam. The microphone remains unused because the required interaction is tap input plus spoken output.

## Layout and safety review

The supplied PDF is an illustrative workshop plan, not an approved fire/escape plan. The new schematic preserves the requested room grouping but simplifies the geometry. It must not be used as the building's emergency plan. A competent site reviewer must confirm actual doors, exits, route clearances, obstructions, accessible evacuation arrangements, equipment selection/locations and the assembly point. At runtime, all proposed paths and equipment positions are marked as examples.

Content reference sources (reviewed for this prototype):

- [BAuA ASR A2.2 — measures against fires](https://www.baua.de/DE/Angebote/Regelwerk/ASR/ASR-A2-2.html): equipment should be visible and accessible; entrances, exits and circulation areas are useful candidate positions. A position alone does not establish compliant provision.
- [BAuA ASR A2.3 — escape routes and emergency exits](https://www.baua.de/DE/Angebote/Rechtstexte-und-Technische-Regeln/Regelwerk/ASR/pdf/ASR-A2-3.pdf?__blob=publicationFile): the actual facility needs a suitable, current plan and instruction.
- [Aldebaran ALTextToSpeech documentation](https://doc.aldebaran.com/2-5/naoqi/audio/altexttospeech-api.html), [ALVideoDevice](https://doc.aldebaran.com/2-5/naoqi/vision/alvideodevice-api.html), [ALTabletService](https://doc.aldebaran.com/2-5/naoqi/core/altabletservice-api.html).

Camera frames are processed in memory and are not intentionally persisted. This does not by itself establish GDPR compliance. The organization must review camera processing, notices, consent or other lawful basis, assistance logs, access and retention before employee deployment. Model/dependency licenses also require review for the intended deployment.

## Verification

Run `python -m unittest test_app -v`. Thirteen backend checks cover conservative PPE rules, help delivery and acknowledged location, exact assignment routing, connected paths, invalid/disconnected locations, and choosing an exit by graph distance rather than straight-line distance.

`check_browser.py` requires Playwright and installed Chrome. Start the app on port 5055 first, then run `python check_browser.py`. It supplies a generated canvas camera stream, mocked PPE results and captured speech calls. It exercises explicit camera consent, quiet failure/no automatic retry, stopped camera tracks, named assignment, route consent, waypoint confirmation, all room guides, exit access before a pass, local assistant delivery/acknowledgement and mobile layout. Navigation and help APIs are real in this test. No test establishes physical camera quality, PPE accuracy, audible speech or Pepper compatibility.
