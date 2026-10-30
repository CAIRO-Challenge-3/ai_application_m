"""Single-instance local launcher with a readiness check and browser handoff."""
from pathlib import Path
import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent


def health(url):
    try:
        with urllib.request.urlopen(url + '/api/health', timeout=2) as response:
            return json.load(response)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    os.chdir(ROOT)
    try:
        from app import app, BUILD_ID
        from werkzeug.serving import make_server
    except ImportError as error:
        print('A required Python package is missing:', error, flush=True)
        print('Install it with: python -m pip install -r requirements.txt', flush=True)
        return 1

    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    local_host = '127.0.0.1' if host in ('0.0.0.0', 'localhost') else host
    url = 'http://{}:{}'.format(local_host, port)
    runtime = ROOT / '.runtime'
    runtime.mkdir(exist_ok=True)
    lock = open(runtime / ('server-{}.lock'.format(port)), 'a+b')
    if os.fstat(lock.fileno()).st_size == 0:
        lock.write(b'0')
        lock.flush()
    lock.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        for _ in range(20):
            active = health(url)
            if active:
                break
            time.sleep(.25)
        if active and active.get('app_id') == 'pepper-workplace-helper' and active.get('build_id') == BUILD_ID:
            print('Pepper is already running: ' + url, flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return 0
        print('An older instance is still running. Close its server window with Ctrl+C, then start again.', flush=True)
        return 1

    # Windows can permit multiple development sockets to bind the same port.
    # Probe before binding, in addition to the process-lifetime file lock.
    try:
        connection = socket.create_connection((local_host, port), timeout=1)
        connection.close()
    except OSError:
        pass
    else:
        print('Port {} is already occupied. Stop the old server before starting Pepper.'.format(port), flush=True)
        return 1

    try:
        server = make_server(host, port, app, threaded=True)
    except (OSError, SystemExit):
        print('Could not listen on {}. Check whether another server is running.'.format(url), flush=True)
        return 1

    def open_when_ready():
        for _ in range(30):
            active = health(url)
            if active and active.get('build_id') == BUILD_ID:
                print('READY: ' + url, flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
            time.sleep(.2)
        print('Browser handoff timed out. Open ' + url + ' manually.', flush=True)

    threading.Thread(target=open_when_ready, daemon=True).start()
    print('Starting Pepper. Keep this window open. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nPepper stopped.', flush=True)
    finally:
        server.server_close()
        lock.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
