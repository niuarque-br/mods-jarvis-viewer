import http.client
import io
import json
import threading
import time

import pytest

from viewer.server import make_server

TOKEN = "tok-123"


class Out(io.StringIO):
    def events(self):
        return [json.loads(line) for line in self.getvalue().splitlines() if line.strip()]


@pytest.fixture
def helper(tmp_path):
    (tmp_path / "index.html").write_text("<title>Viewer</title>", encoding="utf-8")
    (tmp_path / "app.js").write_text("export {}", encoding="utf-8")
    out = Out()
    quits = []
    server = make_server(0, TOKEN, out, web_dir=tmp_path, on_quit=lambda: quits.append(1))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1], out, quits
    server.shutdown()
    server.server_close()


def request(helper, method, path, body=None, token=TOKEN):
    conn = http.client.HTTPConnection("127.0.0.1", helper[0], timeout=5)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Viewer-Token"] = token
    data = None if body is None else json.dumps(body).encode()
    conn.request(method, path, body=data, headers=headers)
    resp = conn.getresponse()
    raw = resp.read()
    conn.close()
    return resp.status, raw


def get(helper, path, token=None):
    status, raw = request(helper, "GET", path, token=token)
    return status, json.loads(raw)


def status(helper, method, path, token=TOKEN):
    return request(helper, method, path, body={} if method == "POST" else None, token=token)[0]


def post_cmd(helper, body):
    return request(helper, "POST", "/cmd", body)[0]


def post_event(helper, body):
    return request(helper, "POST", f"/event?t={TOKEN}", body, token=None)[0]


class Page:
    def __init__(self, helper):
        self.conn = http.client.HTTPConnection("127.0.0.1", helper[0], timeout=5)
        self.conn.request("GET", f"/events?t={TOKEN}")
        self.resp = self.conn.getresponse()
        assert self.resp.status == 200

    def next(self):
        while True:
            line = self.resp.fp.readline().decode().strip()
            if line.startswith("data: "):
                return json.loads(line[6:])

    def close(self):
        self.resp.close()
        self.conn.close()


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def types(out):
    return [e["type"] for e in out.events()]


def test_ping_sem_token(helper):
    assert get(helper, "/ping") == (200, {"app": "jarvis-viewer"})


def test_rotas_exigem_token(helper):
    assert status(helper, "GET", "/events", token=None) == 401
    assert status(helper, "POST", "/cmd", token=None) == 401
    assert status(helper, "GET", "/state", token=None) == 401
    assert status(helper, "GET", "/", token="errado") == 401


def test_pagina_servida_com_token_na_query(helper):
    code, raw = request(helper, "GET", f"/?t={TOKEN}", token=None)
    assert code == 200 and b"<title>Viewer</title>" in raw
    assert request(helper, "GET", f"/app.js?t={TOKEN}", token=None)[0] == 200


def test_estatico_nao_escapa(helper):
    assert status(helper, "GET", "/../server.py?t=" + TOKEN, token=None) == 404
    assert status(helper, "GET", "/%2e%2e/server.py?t=" + TOKEN, token=None) == 404


def test_cmd_desconhecido(helper):
    assert post_cmd(helper, {"type": "xyz"}) == 400


def test_sse_recebe_cena(helper):
    page = Page(helper)
    assert post_cmd(helper, {"type": "scene", "scene": {"id": "s1"}}) == 204
    assert page.next()["type"] == "scene"
    page.close()


def test_caption_aceito_e_publicado(helper):
    page = Page(helper)
    assert post_cmd(helper, {"type": "caption", "text": "narrando pela página"}) == 204
    assert page.next() == {"type": "caption", "text": "narrando pela página"}
    page.close()


@pytest.mark.parametrize("kind", ["play", "goto", "advance", "pause", "mode"])
def test_outros_comandos_publicados(helper, kind):
    page = Page(helper)
    assert post_cmd(helper, {"type": kind}) == 204
    assert page.next()["type"] == kind
    page.close()


def test_ultima_cena_reenviada_ao_reconectar(helper):
    post_cmd(helper, {"type": "scene", "scene": {"id": "velha"}})
    post_cmd(helper, {"type": "scene", "scene": {"id": "nova"}})
    post_cmd(helper, {"type": "mode", "narrator": "jarvis"})
    page = Page(helper)
    assert page.next() == {"type": "scene", "scene": {"id": "nova"}}
    assert page.next() == {"type": "mode", "narrator": "jarvis"}
    page.close()


def test_page_open_e_closed_no_stdout(helper):
    _, out, _ = helper
    page = Page(helper)
    assert wait_for(lambda: "page-open" in types(out))
    page.close()
    assert wait_for(lambda: "page-closed" in types(out))


def test_page_closed_so_quando_a_ultima_fecha(helper):
    _, out, _ = helper
    a, b = Page(helper), Page(helper)
    assert wait_for(lambda: types(out).count("page-open") == 2)
    a.close()
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1] == {"pages": 1})
    assert "page-closed" not in types(out)
    b.close()
    assert wait_for(lambda: "page-closed" in types(out))
    time.sleep(0.5)
    assert types(out).count("page-closed") == 1


def test_evento_da_pagina_vai_ao_stdout(helper):
    _, out, _ = helper
    assert post_event(helper, {"type": "pick", "scene": "s1", "node": "aux"}) == 204
    assert out.events()[-1] == {"type": "pick", "scene": "s1", "node": "aux"}
    assert post_event(helper, {"type": "resume", "scene": "s1", "step": 2}) == 204
    assert out.events()[-1]["type"] == "resume"


def test_evento_desconhecido(helper):
    assert post_event(helper, {"type": "xyz"}) == 400


def test_state_conta_paginas(helper):
    assert get(helper, f"/state?t={TOKEN}") == (200, {"pages": 0})
    page = Page(helper)
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1] == {"pages": 1})
    page.close()
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1] == {"pages": 0})


def test_quit_chama_on_quit(helper):
    _, _, quits = helper
    assert post_cmd(helper, {"type": "quit"}) == 204
    assert wait_for(lambda: quits == [1])
