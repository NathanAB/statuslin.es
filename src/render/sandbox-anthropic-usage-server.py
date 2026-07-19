#!/usr/bin/env python3
"""Sandbox-local HTTPS stand-in for Anthropic's OAuth usage endpoint."""

import argparse
import hmac
import json
import os
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USAGE_HOST = "api.anthropic.com"
USAGE_PATH = "/api/oauth/usage"
SELF_TEST_TOKEN = "statuslines-preview-oauth-token"
UNPRIVILEGED_UID = 65534
UNPRIVILEGED_GID = 65534
MAX_WORKERS = 4
REQUEST_TIMEOUT_SECONDS = 2


def route_status(method, path, host, authorization, token):
    """Return the fixed status for a request without reading or reflecting its body."""
    request_host = (host or "").split(":", 1)[0]
    if method != "GET" or path != USAGE_PATH or request_host != USAGE_HOST:
        return 404
    expected = "Bearer " + token
    if not hmac.compare_digest(authorization or "", expected):
        return 401
    return 200


class UsageServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = MAX_WORKERS

    def __init__(self, *args, **kwargs):
        self._worker_slots = threading.BoundedSemaphore(MAX_WORKERS)
        super().__init__(*args, **kwargs)

    def get_request(self):
        request, client_address = super().get_request()
        request.settimeout(REQUEST_TIMEOUT_SECONDS)
        return request, client_address

    def process_request(self, request, client_address):
        if not self._worker_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._worker_slots.release()


class UsageHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "statuslines-preview"
    sys_version = ""
    response_body = b"{}"
    token = ""

    def _respond(self):
        status = route_status(
            self.command,
            self.path,
            self.headers.get("Host"),
            self.headers.get("Authorization"),
            self.token,
        )
        if status == 200:
            body = self.response_body
        elif status == 401:
            body = b'{"error":"unauthorized"}'
        else:
            body = b'{"error":"not found"}'

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_GET = _respond
    do_POST = _respond
    do_PUT = _respond
    do_PATCH = _respond
    do_DELETE = _respond
    do_HEAD = _respond
    do_OPTIONS = _respond

    def __getattr__(self, name):
        if name.startswith("do_"):
            return self._respond
        raise AttributeError(name)

    def log_message(self, _format, *_args):
        return


def self_test():
    expected = "Bearer " + SELF_TEST_TOKEN
    results = {
        "ok": route_status("GET", USAGE_PATH, USAGE_HOST, expected, SELF_TEST_TOKEN),
        "bad_auth": route_status("GET", USAGE_PATH, USAGE_HOST, "Bearer wrong", SELF_TEST_TOKEN),
        "bad_host": route_status("GET", USAGE_PATH, "example.com", expected, SELF_TEST_TOKEN),
        "bad_method": route_status("POST", USAGE_PATH, USAGE_HOST, expected, SELF_TEST_TOKEN),
        "bad_path": route_status("GET", "/v1/messages", USAGE_HOST, expected, SELF_TEST_TOKEN),
        "unsupported_method": route_status("TRACE", USAGE_PATH, USAGE_HOST, expected, SELF_TEST_TOKEN),
    }
    print(json.dumps(results, sort_keys=True, separators=(",", ":")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=443)
    parser.add_argument("--cert")
    parser.add_argument("--key")
    parser.add_argument("--response")
    parser.add_argument("--token")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    for name in ("cert", "key", "response", "token"):
        if not getattr(args, name):
            parser.error("--%s is required" % name)

    with open(args.response, encoding="utf-8") as response_file:
        response_data = json.load(response_file)
    UsageHandler.response_body = json.dumps(
        response_data, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    UsageHandler.token = args.token

    server = UsageServer((args.listen, args.port), UsageHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=args.cert, keyfile=args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    os.setgroups([])
    os.setgid(UNPRIVILEGED_GID)
    os.setuid(UNPRIVILEGED_UID)
    server.serve_forever()


if __name__ == "__main__":
    main()
