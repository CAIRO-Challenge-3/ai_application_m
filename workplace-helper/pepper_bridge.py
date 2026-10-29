# -*- coding: utf-8 -*-
"""Optional NAOqi bridge. Run with Pepper-compatible qi + Pillow, not the AI runtime.

PEPPER_BRIDGE_TOKEN must be set. No movement or microphone recording is enabled.
"""
from __future__ import print_function
import argparse
import hmac
import io
import json
import os
import threading
try:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from socketserver import ThreadingMixIn
except ImportError:
    from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
    from SocketServer import ThreadingMixIn


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--robot-ip', required=True)
    parser.add_argument('--robot-port', type=int, default=9559)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--web-url', help='Optional URL to open on Pepper tablet; must be reachable from Pepper')
    args = parser.parse_args()
    token = os.environ.get('PEPPER_BRIDGE_TOKEN')
    if not token:
        raise SystemExit('Set PEPPER_BRIDGE_TOKEN in both bridge and app environments.')
    import qi
    from PIL import Image
    session = qi.Session()
    session.connect('tcp://{}:{}'.format(args.robot_ip, args.robot_port))
    camera = session.service('ALVideoDevice')
    tts = session.service('ALTextToSpeech')
    tts.setLanguage('German')
    camera_id = camera.subscribeCamera('pepper_safety_helper', 0, 2, 11, 5)
    camera_lock, speech_lock = threading.Lock(), threading.Lock()
    if args.web_url:
        session.service('ALTabletService').showWebview(args.web_url)

    class Handler(BaseHTTPRequestHandler):
        def authorized(self):
            received = self.headers.get('Authorization', '')
            if not hmac.compare_digest(received.encode('utf-8'), ('Bearer ' + token).encode('utf-8')):
                self.send_error(401)
                return False
            return True

        def reply(self, raw, content_type='application/json'):
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if not self.authorized():
                return
            try:
                if self.path == '/status':
                    self.reply(b'{"connected":true}')
                elif self.path == '/frame':
                    with camera_lock:
                        frame = camera.getImageRemote(camera_id)
                        if not frame or frame[2] != 3:
                            raise RuntimeError('No RGB camera frame')
                        raw = frame[6]
                        if not isinstance(raw, bytes):
                            raw = raw.encode('latin1') if isinstance(raw, str) else bytes(raw)
                        image = Image.frombytes('RGB', (frame[0], frame[1]), raw)
                        output = io.BytesIO()
                        image.save(output, format='JPEG', quality=85)
                    self.reply(output.getvalue(), 'image/jpeg')
                else:
                    self.send_error(404)
            except Exception:
                self.send_error(503, 'Robot service unavailable')

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != '/speak':
                self.send_error(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 8192:
                    self.send_error(413)
                    return
                payload = json.loads(self.rfile.read(length).decode('utf-8'))
                text = payload.get('text', '')
                if len(text) > 1500:
                    self.send_error(400)
                    return
                with speech_lock:
                    tts.stopAll()
                    if text:
                        tts.say(text, _async=True)
                self.reply(b'{"ok":true}')
            except Exception:
                self.send_error(503, 'Speech unavailable')

        def log_message(self, fmt, *values):
            pass  # Never log speech text or camera contents.

    class Server(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    server = Server((args.host, args.port), Handler)
    print('Pepper bridge ready on {}:{}'.format(args.host, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        camera.unsubscribe(camera_id)
        tts.stopAll()


if __name__ == '__main__':
    main()
