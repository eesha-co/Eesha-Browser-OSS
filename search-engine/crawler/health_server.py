#!/usr/bin/env python3
"""
Eesha Crawler — Health Check Server
=====================================
Minimal HTTP server for Render health checks.
The Crawler Instance must bind to $PORT within 60 seconds.
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler


class HealthHandler(BaseHTTPRequestHandler):
    """Simple health check handler."""

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = json.dumps({
                'status': 'ok',
                'service': 'eesha-crawler',
                'description': 'Eesha Search Crawler Instance — builds the search index',
                'search_url': os.environ.get('EESHA_SEARCH_URL', 'https://eesha-search.onrender.com'),
            })
            self.wfile.write(response.encode())
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<html><body><h1>Eesha Crawler</h1><p>Crawler Instance is running.</p></body></html>')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        """Suppress access logs."""
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10001))
    server = HTTPServer(('0.0.0.0', port), HealthHandler)
    print(f"[HEALTH] Eesha Crawler health server on 0.0.0.0:{port}")
    server.serve_forever()
