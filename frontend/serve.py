"""Local development server for the page: serves this folder and tells the browser never to cache.
Every request is printed, so you can see what the browser is actually asking for.

Run from this folder:  python3 serve.py          (port 5173)
                       python3 serve.py 5180     (another port, if you need a fresh address)
Then open http://127.0.0.1:5173
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as server:
    print(f"Serving {os.getcwd()}")
    print(f"Caching off: http://127.0.0.1:{PORT}")
    print("Each request below shows what the browser asked for.")
    server.serve_forever()
