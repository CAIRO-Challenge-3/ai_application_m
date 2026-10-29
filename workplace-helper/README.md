# Hallo — workplace helper prototype

A local, tablet-friendly prototype for the Mainfränkische Werkstätten hackathon. The interface is in simple German.

## Start on Windows

1. Install Python 3.10–3.12, if needed.
2. Open PowerShell in this folder and run:

   ```powershell
   python -m pip install -r requirements.txt
   python app.py
   ```

3. Open http://127.0.0.1:5000 in Chrome or Edge. Allow access to the laptop camera when asked. Click **Schutz prüfen**, turn on the camera, then select **Jetzt prüfen**. The first inference may take a little longer.
4. In **Werkstatt entdecken**, tap the plan or the + button to zoom; scroll the map to move around. Pick a colour and tap a sign to hear its explanation. Your browser and operating system need a German speech voice. The sound button mutes or enables speech.

The first inference downloads `models/best.pt` if it is missing. Internet is needed for that first download and for installation; the model then runs on the laptop. The checkpoint comes from https://huggingface.co/killuminati1/construction-ppe-yolov8 . Review the model and dependency licenses before use beyond the hackathon.

## Where AI is used

The Python service runs the YOLOv8 checkpoint on a single image captured when the user presses **Jetzt prüfen**. Boxes represent the model's visible object and missing-PPE predictions. An empty result is uncertain, not a pass; the UI asks a person to check. This model was trained for construction sites and its author reports missed detections, including missing gloves. It has not been validated for this workshop. It does not check whether a detected item belongs to a particular person or whether all required PPE for a task is present. Do not use it as a safety or compliance decision.

Map explanations are pre-written, and voice uses the browser's speech synthesis. This makes explanations repeatable and avoids needing an external AI service. The supplied map is an example: the example signs are not linked to confirmed equipment locations. Update the plan and verify locations with workshop staff before showing real locations.

## Privacy and Pepper

Camera permission is requested only after the camera button is pressed. A frame is sent to the local Python process only on request and is not intentionally saved. Stop the camera with **Kamera aus** or by leaving the screen. This prototype does not establish GDPR compliance; agree on the lawful use and handling of camera images with the organization before involving employees.

The server binds to localhost by default. Pepper integration is not implemented. To try the UI from a tablet on the same network, you can set `$env:HOST='0.0.0.0'` before starting the app and open the laptop's network address on the tablet. This exposes the prototype to that network and has no authentication. Browser camera access normally requires HTTPS or localhost; a plain HTTP network address may show the UI but cannot reliably use the tablet camera. Verify Pepper's browser, secure access, speech voices and robot camera integration when the robot is available. Do not deploy the development server to an untrusted network.
