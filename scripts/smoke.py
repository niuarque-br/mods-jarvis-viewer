"""Smoke ponta a ponta: exe -> cena por /cmd -> Edge headless -> page-open + step-done 0."""
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "bin" / "viewer-helper.exe"
TIMEOUT = 30


def find_edge() -> str | None:
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if base:
            p = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
            if p.exists():
                return str(p)
    return shutil.which("msedge")


def kill_tree(proc: subprocess.Popen) -> None:
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)


def main() -> int:
    edge = find_edge()
    if not EXE.exists() or not edge:
        print(f"FALHOU: faltando {'exe' if not EXE.exists() else 'msedge'}")
        return 1
    token = uuid.uuid4().hex
    scene = json.loads((ROOT / "docs" / "exemplos" / "arquitetura.json").read_text(encoding="utf-8"))
    helper = subprocess.Popen([str(EXE)], env={**os.environ, "VIEWER_TOKEN": token},
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
    events: "queue.Queue[dict]" = queue.Queue()

    def pump() -> None:
        for line in helper.stdout:
            try:
                events.put(json.loads(line))
            except ValueError:
                pass

    threading.Thread(target=pump, daemon=True).start()
    seen: list[dict] = []
    browser = None
    profile = tempfile.mkdtemp(prefix="viewer-smoke-")
    try:
        def wait_for(pred, secs):
            end = time.time() + secs
            while time.time() < end:
                try:
                    ev = events.get(timeout=0.2)
                except queue.Empty:
                    continue
                seen.append(ev)
                if pred(ev):
                    return ev
            return None

        ready = wait_for(lambda e: e.get("type") == "ready", 10)
        if not ready:
            print("FALHOU: o auxiliar não emitiu ready")
            return 1
        port = ready["port"]
        body = json.dumps({"type": "scene", "id": "s1", "scene": scene, "narrator": "caption", "from": 0}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{port}/cmd", data=body, method="POST",
                                     headers={"X-Viewer-Token": token, "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()
        url = f"http://127.0.0.1:{port}/?t={token}"
        browser = subprocess.Popen([edge, "--headless=new", f"--user-data-dir={profile}", "--no-first-run", url],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wait_for(lambda e: e.get("type") == "page-open", TIMEOUT):
            print("FALHOU: page-open não chegou. Eventos vistos:", seen)
            return 1
        if not wait_for(lambda e: e.get("type") == "step-done" and e.get("step") == 0, TIMEOUT):
            print("FALHOU: step-done do passo 0 não chegou. Eventos vistos:", seen)
            return 1
        # A cena de exemplo tem figuras: a página precisa ter pedido figuras/ ao auxiliar (contador do /state).
        if (ROOT / "assets" / "figuras").is_dir():
            end = time.time() + 10
            served = 0
            while time.time() < end and served < 1:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/state?t={token}", timeout=5) as r:
                    served = json.loads(r.read()).get("figuras", 0)
                if served < 1:
                    time.sleep(0.3)
            if served < 1:
                print("FALHOU: a página não pediu nenhuma figura ao auxiliar")
                return 1
            print(f"figuras servidas: {served}")
        else:
            print("aviso: sem assets/figuras, a parte das figuras foi pulada (rode scripts/baixar-figuras.py)")
        try:
            urllib.request.urlopen(urllib.request.Request(
                f"http://127.0.0.1:{port}/cmd", data=b'{"type":"quit"}', method="POST",
                headers={"X-Viewer-Token": token, "Content-Type": "application/json"}), timeout=5).read()
        except Exception:
            pass
        print("OK")
        return 0
    finally:
        if browser:
            kill_tree(browser)
        try:
            helper.wait(timeout=5)
        except subprocess.TimeoutExpired:
            kill_tree(helper)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
