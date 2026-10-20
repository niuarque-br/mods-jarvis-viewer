from __future__ import annotations

import argparse
import ctypes
import os
import sys
import threading
from pathlib import Path
from typing import Mapping, TextIO

from viewer.server import Emitter, make_server


def web_dir() -> Path:
    base = getattr(sys, "_MEIPASS", None)
    return Path(base) / "web" if base else Path(__file__).resolve().parent.parent / "web"


def watch_parent(pid: int, on_gone) -> None:
    def wait() -> None:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x00100000, False, pid)
        if handle:
            kernel32.WaitForSingleObject(handle, 0xFFFFFFFF)
            kernel32.CloseHandle(handle)
        on_gone()

    threading.Thread(target=wait, daemon=True).start()


def run(argv: list[str], environ: Mapping[str, str], out: TextIO) -> int:
    parser = argparse.ArgumentParser(prog="viewer-helper")
    parser.add_argument("--port-from", type=int, default=47821)
    parser.add_argument("--port-to", type=int, default=47830)
    args = parser.parse_args(argv)
    emit = Emitter(out)
    token = environ.get("VIEWER_TOKEN", "")
    if not token:
        emit({"type": "error", "message": "VIEWER_TOKEN ausente"})
        return 2
    stop = threading.Event()
    server = None
    for port in range(args.port_from, args.port_to + 1):
        try:
            server = make_server(port, token, out, web_dir(), on_quit=stop.set)
            break
        except OSError:
            continue
    if server is None:
        emit({"type": "error", "message": f"nenhuma porta livre entre {args.port_from} e {args.port_to}"})
        return 2
    emit = server.emit
    threading.Thread(target=server.serve_forever, daemon=True).start()
    watch_parent(os.getppid(), stop.set)
    emit({"type": "ready", "port": server.server_address[1]})
    stop.wait()
    server.shutdown()
    server.server_close()
    return 0


def main() -> None:
    sys.exit(run(sys.argv[1:], os.environ, sys.stdout))


if __name__ == "__main__":
    main()
