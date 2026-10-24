"""Local static-only harness; production route rewriting is tested separately."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import os
os.chdir(Path(__file__).resolve().parents[3] / 'public')
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/schoolmap':
            self.path = '/commute/index.html'
        super().do_GET()
ThreadingHTTPServer(('127.0.0.1',3312),Handler).serve_forever()
