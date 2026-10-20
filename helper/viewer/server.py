from __future__ import annotations

import hmac
import json
import mimetypes
import queue
import select
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, TextIO
from urllib.parse import parse_qs, quote, unquote, urlparse

from viewer.bus import Bus

COMMANDS = {"scene", "play", "goto", "advance", "pause", "mode", "caption", "quit"}
PAGE_EVENTS = {"step-done", "pick", "narration", "paused", "resume"}
MAX_BODY = 1024 * 1024
KEEPALIVE_SECONDS = 15.0
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html"}


class Emitter:
    def __init__(self, out: TextIO) -> None:
        self.out = out
        self.lock = threading.Lock()

    def __call__(self, event: dict) -> None:
        with self.lock:
            self.out.write(json.dumps(event, ensure_ascii=False) + "\n")
            self.out.flush()


class ViewerServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, port: int, handler: type, bus: Bus, emit: Emitter, on_quit: Callable[[], None] | None) -> None:
        super().__init__(("127.0.0.1", port), handler)
        self.bus = bus
        self.emit = emit
        self.on_quit = on_quit
        self.state_lock = threading.Lock()
        self.pages = 0
        self.last_scene: dict | None = None
        self.last_mode: dict | None = None


def make_server(
    port: int,
    token: str,
    out: TextIO,
    web_dir: Path,
    on_quit: Callable[[], None] | None = None,
) -> ViewerServer:
    web_root = Path(web_dir).resolve()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args: Any) -> None:
            pass

        def _prefixed(self, path: str) -> str | None:
            """'/TOKEN/resto' com o token certo -> '/resto'; senão None."""
            first, sep, rest = path.lstrip("/").partition("/")
            if not sep or not hmac.compare_digest(unquote(first).encode(), token.encode()):
                return None
            return "/" + rest

        def _authorized(self) -> bool:
            query = parse_qs(urlparse(self.path).query)
            given = self.headers.get("X-Viewer-Token") or (query.get("t") or [""])[0]
            return hmac.compare_digest(given.encode(), token.encode())

        def _send(self, status: int, body: bytes = b"", ctype: str = "application/json") -> None:
            self.send_response(status)
            if body or status != 204:
                self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def _json(self, status: int, payload: Any) -> None:
            self._send(status, json.dumps(payload, ensure_ascii=False).encode())

        def _payload(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if length < 0 or length > MAX_BODY:
                self.close_connection = True
                raise ValueError("corpo inválido")
            raw = self.rfile.read(length) if length else b""
            data = json.loads(raw or b"{}")
            if not isinstance(data, dict):
                raise ValueError("objeto esperado")
            return data

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/ping":
                return self._json(200, {"app": "jarvis-viewer"})
            if path == "/favicon.ico":
                return self._send(204)
            inner = self._prefixed(path)
            if inner is not None:
                path = inner
            elif not self._authorized():
                return self._json(401, {"error": "token"})
            elif path == "/":
                # página aberta com ?t=: muda para /TOKEN/ para que as URLs relativas carreguem sem token
                self.send_response(302)
                self.send_header("Location", f"/{quote(token, safe='')}/")
                self.send_header("Content-Length", "0")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if path == "/favicon.ico":
                return self._send(204)
            if path == "/events":
                return self._events()
            if path == "/state":
                return self._json(200, {"pages": self.server.pages})
            self._static("index.html" if path == "/" else unquote(path).lstrip("/"))

        def _static(self, name: str) -> None:
            try:
                target = (web_root / name).resolve()
            except (OSError, ValueError):
                return self._json(404, {"error": "arquivo"})
            if web_root not in target.parents or not target.is_file():
                return self._json(404, {"error": "arquivo"})
            ctype = TYPES.get(target.suffix) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(200, target.read_bytes(), ctype)

        def _closed(self) -> bool:
            try:
                ready, _, _ = select.select([self.connection], [], [], 0)
                if not ready:
                    return False
                return self.connection.recv(1, socket.MSG_PEEK) == b""
            except (OSError, ValueError):
                return True

        def _events(self) -> None:
            srv = self.server
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            with srv.state_lock:
                q = srv.bus.subscribe()
                srv.pages += 1
                for message in (srv.last_scene, srv.last_mode):
                    if message is not None:
                        q.put(message)
                try:
                    srv.emit({"type": "page-open"})
                except BaseException:
                    srv.bus.unsubscribe(q)
                    srv.pages -= 1
                    raise
            last_write = time.monotonic()
            try:
                self.wfile.write(b": ok\n\n")
                self.wfile.flush()
                while True:
                    try:
                        message = q.get(timeout=0.2)
                        chunk = f"data: {json.dumps(message, ensure_ascii=False)}\n\n".encode()
                    except queue.Empty:
                        if self._closed():
                            break
                        if time.monotonic() - last_write < KEEPALIVE_SECONDS:
                            continue
                        chunk = b": ping\n\n"
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    last_write = time.monotonic()
            except (ConnectionError, OSError):
                pass
            finally:
                with srv.state_lock:
                    srv.bus.unsubscribe(q)
                    srv.pages -= 1
                    if srv.pages == 0:
                        srv.emit({"type": "page-closed"})

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            inner = self._prefixed(path)
            if inner is not None:
                path = inner
            elif not self._authorized():
                self.close_connection = True
                return self._json(401, {"error": "token"})
            try:
                route = {"/cmd": self._cmd, "/event": self._event}.get(path)
                if route is None:
                    return self._json(404, {"error": "rota"})
                route()
            except (ValueError, json.JSONDecodeError) as exc:
                self._json(400, {"error": str(exc)})

        def _cmd(self) -> None:
            data = self._payload()
            kind = data.get("type")
            if kind not in COMMANDS:
                raise ValueError("comando desconhecido")
            srv = self.server
            with srv.state_lock:
                if kind == "scene":
                    # the old scene's mode does not belong to the new one
                    srv.last_scene = data
                    srv.last_mode = None
                elif kind == "mode":
                    # a reopened page starts at step 1: the `from` was for the page that was open
                    srv.last_mode = {k: v for k, v in data.items() if k != "from"}
                srv.bus.publish(data)
            self._send(204)
            if kind == "quit" and srv.on_quit:
                threading.Thread(target=srv.on_quit, daemon=True).start()

        def _event(self) -> None:
            data = self._payload()
            if data.get("type") not in PAGE_EVENTS:
                raise ValueError("evento desconhecido")
            self.server.emit(data)
            self._send(204)

    return ViewerServer(port, Handler, Bus(), Emitter(out), on_quit)
