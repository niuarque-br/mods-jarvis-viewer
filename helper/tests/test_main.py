import http.client
import io
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from viewer.__main__ import figuras_dir, run, watch_parent


def busy(port):
    sock = socket.socket()
    sock.bind(("127.0.0.1", port))
    sock.listen()
    return sock


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def last(out):
    return json.loads(out.getvalue().splitlines()[-1])


def test_porta_ocupada_usa_a_proxima():
    base = free_port()
    sock = busy(base)
    out = io.StringIO()
    result = []
    try:
        t = threading.Thread(
            target=lambda: result.append(run(["--port-from", str(base), "--port-to", str(base + 3)], {"VIEWER_TOKEN": "t"}, out)),
            daemon=True,
        )
        t.start()
        end = time.time() + 5
        while "ready" not in out.getvalue() and time.time() < end:
            time.sleep(0.02)
        event = last(out)
        assert event == {"type": "ready", "port": base + 1}
        conn = http.client.HTTPConnection("127.0.0.1", base + 1, timeout=5)
        conn.request("POST", "/cmd", body=b'{"type":"quit"}', headers={"X-Viewer-Token": "t", "Content-Type": "application/json"})
        assert conn.getresponse().status == 204
        t.join(5)
        assert result == [0]
    finally:
        sock.close()


def test_todas_ocupadas():
    port = free_port()
    sock = busy(port)
    out = io.StringIO()
    try:
        code = run(["--port-from", str(port), "--port-to", str(port)], {"VIEWER_TOKEN": "t"}, out)
    finally:
        sock.close()
    assert code == 2
    assert last(out) == {"type": "error", "message": f"nenhuma porta livre entre {port} e {port}"}


def test_sem_token():
    out = io.StringIO()
    assert run([], {}, out) == 2
    assert last(out) == {"type": "error", "message": "VIEWER_TOKEN ausente"}


def test_watch_parent_fires_when_parent_exits():
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    fired = threading.Event()
    watch_parent(proc.pid, fired.set)
    assert not fired.wait(0.3)
    proc.kill()
    assert fired.wait(5)


def test_figuras_dir_no_modo_dev():
    repo = Path(__file__).resolve().parent.parent.parent
    assert figuras_dir() == repo / "assets" / "figuras"


def test_figuras_dir_no_exe(monkeypatch, tmp_path):
    exe = tmp_path / "plugin" / "bin" / "viewer-helper.exe"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(exe))
    assert figuras_dir() == (tmp_path / "plugin").resolve() / "assets" / "figuras"
