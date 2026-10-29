# Pepper — safety inspection and workplace guidance

An orange-and-white, tablet-friendly application with simple German, large illustrated controls and spoken explanations. The UI uses plain HTML, CSS and JavaScript; Python runs the YOLO model. No frontend build step, API key or cloud AI account is required.

## Run on this laptop

Double-click `start.bat`, then open **http://127.0.0.1:5000** in Chrome or Edge. If an older version is running, stop it with Ctrl+C and start it again; reload the browser with Ctrl+F5.

For a new machine:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Model weights are already in `models/best.pt` on this laptop. If missing, the first inspection downloads the requested checkpoint from [killuminati1/construction-ppe-yolov8](https://huggingface.co/killuminati1/construction-ppe-yolov8). Subsequent model inference is local. Downloaded weights are not committed to Git.

## Before work

1. **Arbeit beginnen** opens the inspection. Select a destination room. The expandable demo settings select helmet, gloves, or both.
2. **Check starten** greets the worker, requests camera permission, then captures an image after a short positioning pause.
3. Each selected item gets an illustrated result. A missing or uncertain item prompts another check. After the second unsuccessful inference, **Assistenz rufen** appears. Camera/service errors also expose help immediately.
4. A pass requires exactly one detected worker, every selected positive PPE class near that person's box, and no contradictory missing-PPE label. A blank frame, two people, uncertain equipment or unassociated equipment cannot pass.
5. A pass opens access to **Zum Arbeitsplatz**: a schematic example route from reception to the selected room. **Ich bin im Raum** opens that room's guidance.

The result is a **demo check, not permission to work**. A bounding box does not establish correct fit, both hands being protected, task suitability or certified PPE. Requirements must come from the employer's risk assessment. In particular, do not infer that gloves are appropriate near rotating woodworking machinery. The glove example here concerns manual packaging; the woodworking task uses a hand sanding block and requires instruction.

## During work: the five room guides

| Room | Three example safety symbols | Illustrated task |
|---|---|---|
| Workshop 1: assembly / packaging | Gloves, protective footwear, trip hazard | Count parts → put them in a box → close and label |
| Workshop 2: woodworking | Eye protection, hearing protection, no smoking | Place wood securely → sand by hand → collect dust with a brush |
| Dining hall / cafeteria | Wash hands, hot surface, no smoking | Wash hands → bring meal to table → return dishes |
| Sanitary / care | Wash hands, slippery floor, first aid | Water and soap → wash thoroughly → dry hands |
| Support / care | First aid, emergency exit, no smoking | Speak to support person → show what you need → begin together |

Each symbol opens a visual explanation with short German text and automatic speech. The replay button repeats it. Voice can be disabled globally. Native browser speech uses an available German system voice, preferring a local voice; availability and offline behavior depend on the device. The AI itself is the YOLO vision model. The safety guidance is curated text, rather than generated advice.

Each room also has:

- **Feuerlöscher**: a proposed position beside its exit, on the corridor side, plus a schematic marker and spoken explanation. Sanitary equipment is proposed outside the wet area. These are suggestions, not verified installed equipment.
- **Aufgabe zeigen**: a pictorial task with 2–3 short steps and spoken narration.
- **Fluchtweg lernen**: a clearly marked training route through the corridor and reception to the main entrance, with an outdoor arrow. The assembly point is deliberately not fabricated; it must be confirmed locally.
- **Weg zum Raum**: an example route from reception. There is no live localization or robot movement.

`static/content.js` holds the room content, symbol assignments and route coordinates. `static/icons.js` contains small editable SVG illustrations. These are learning illustrations, not certified ISO sign artwork. Replace them with approved facility signs before operational use.

## Help reaches a real local assistant screen

Open **http://127.0.0.1:5000/assistant** in another browser window and keep it open. It polls for requests every three seconds. Workers must tap **Assistenz jetzt rufen** to send a request. The worker is told only that the local screen received it, not that somebody has seen it. When an assistant clicks **Ich kümmere mich**, the worker sees and hears confirmation. **Erledigt** resolves the request.

Requests contain an anonymous random ID, target room, reason, timestamp and status. They persist in `help-requests.sqlite3`; no names or photos are stored. Requests are not sent to email, SMS or external services. The assumed meeting place is Pepper at reception. The prototype assistant API has no staff authentication: keep it local or on a controlled demonstration network. A real deployment needs authentication and a retention policy for these records.

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

Run `python -m unittest test_app -v` for conservative PPE decision rules and the persistent/idempotent help workflow. Nine checks cover empty frames, missing/contradictory gear, equipment without a person, two-person ambiguity, out-of-person equipment, positive results, malformed requests and help acknowledgement.

`check_browser.py` is a development check requiring Playwright and installed Chrome. Start the app on port 5055 (`$env:PORT='5055'; python app.py`) first, then run `python check_browser.py`. It uses a fake browser camera and mocked detections to exercise retries, second-failure escalation, actual local help delivery/acknowledgement, success navigation, room popups and mobile layout. It does not validate model accuracy, physical camera placement, audible output or real Pepper hardware.
