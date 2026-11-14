"""Local development server for the page: serves this folder and tells the browser never to cache.

Run from this folder:  python3 serve.py
Then open http://127.0.0.1:5173
"""
import http.server
import socketserver

PORT = 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as server:
    print(f"Serving {PORT} with caching off: http://127.0.0.1:{PORT}")
    server.serve_forever()
