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
    web = tmp_path / "web"
    web.mkdir()
    (tmp_path / "secret.txt").write_text("segredo", encoding="utf-8")
    (web / "index.html").write_text("<title>Viewer</title>", encoding="utf-8")
    (web / "app.js").write_text("export {}", encoding="utf-8")
    (web / "meu arquivo.js").write_text("ok", encoding="utf-8")
    out = Out()
    quits = []
    server = make_server(0, TOKEN, out, web_dir=web, on_quit=lambda: quits.append(1))
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
    assert request(helper, "GET", f"/?t={TOKEN}", token=None)[0] == 302  # redireciona para /TOKEN/
    assert request(helper, "GET", f"/app.js?t={TOKEN}", token=None)[0] == 200


def test_estatico_nao_escapa(helper):
    for form in ("/../secret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt", "/.." + chr(92) + "secret.txt", "/%2e%2e%5csecret.txt"):
        code, raw = request(helper, "GET", form + "?t=" + TOKEN, token=None)
        assert code == 404 and b"segredo" not in raw, form


def test_estatico_com_espaco_codificado(helper):
    code, raw = request(helper, "GET", "/meu%20arquivo.js?t=" + TOKEN, token=None)
    assert (code, raw) == (200, b"ok")


def raw_exchange(helper, payload):
    import socket

    s = socket.create_connection(("127.0.0.1", helper[0]), timeout=3)
    s.sendall(payload)
    data = b""
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    except OSError:
        pass
    s.close()
    return data


def test_content_length_negativo(helper):
    data = raw_exchange(helper, b"POST /cmd HTTP/1.1\r\nHost: x\r\nX-Viewer-Token: tok-123\r\nContent-Length: -5\r\n\r\n")
    assert data.startswith(b"HTTP/1.1 400")


def test_corpo_grande_demais_fecha_a_conexao(helper):
    smuggled = b'POST /cmd HTTP/1.1\r\nX-Viewer-Token: tok-123\r\nContent-Length: 15\r\n\r\n{"type":"quit"}'
    data = raw_exchange(helper, b"POST /cmd HTTP/1.1\r\nHost: x\r\nX-Viewer-Token: tok-123\r\nContent-Length: 2000000\r\n\r\n" + smuggled)
    assert data.startswith(b"HTTP/1.1 400")
    assert data.count(b"HTTP/1.1") == 1
    assert helper[2] == []


def test_401_com_corpo_fecha_a_conexao(helper):
    smuggled = b'POST /cmd HTTP/1.1\r\nX-Viewer-Token: tok-123\r\nContent-Length: 15\r\n\r\n{"type":"quit"}'
    data = raw_exchange(helper, b"POST /cmd HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n" % len(smuggled) + smuggled)
    assert data.startswith(b"HTTP/1.1 401")
    assert data.count(b"HTTP/1.1") == 1
    assert helper[2] == []


def test_reconexao_rapida_termina_em_page_open(helper):
    _, out, _ = helper
    page = Page(helper)
    for _ in range(60):
        page.close()
        page = Page(helper)
        assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1]["pages"] == 1)
        time.sleep(0.05)
        assert types(out)[-1] == "page-open"
    page.close()


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
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1]["pages"] == 1)
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
    assert get(helper, f"/state?t={TOKEN}")[1]["pages"] == 0
    page = Page(helper)
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1]["pages"] == 1)
    page.close()
    assert wait_for(lambda: get(helper, f"/state?t={TOKEN}")[1]["pages"] == 0)


def test_quit_chama_on_quit(helper):
    _, _, quits = helper
    assert post_cmd(helper, {"type": "quit"}) == 204
    assert wait_for(lambda: quits == [1])


def raw_get(helper, path):
    conn = http.client.HTTPConnection("127.0.0.1", helper[0], timeout=5)
    conn.request("GET", path)
    resp = conn.getresponse()
    body = resp.read()
    headers = dict(resp.getheaders())
    conn.close()
    return resp.status, headers, body


def test_raiz_com_token_redireciona_para_prefixo(helper):
    status_, headers, _ = raw_get(helper, f"/?t={TOKEN}")
    assert status_ == 302
    assert headers["Location"] == f"/{TOKEN}/"


def test_raiz_sem_token_401(helper):
    assert raw_get(helper, "/")[0] == 401


def test_prefixo_serve_index_e_estaticos(helper):
    status_, _, body = raw_get(helper, f"/{TOKEN}/")
    assert (status_, body) == (200, b"<title>Viewer</title>")
    assert raw_get(helper, f"/{TOKEN}/app.js")[2] == b"export {}"
    assert raw_get(helper, f"/{TOKEN}/meu%20arquivo.js")[2] == b"ok"


def test_prefixo_nao_escapa(helper):
    assert raw_get(helper, f"/{TOKEN}/../secret.txt")[0] in (401, 404)
    assert raw_get(helper, f"/{TOKEN}/%2e%2e/secret.txt")[0] == 404


def test_prefixo_errado_401(helper):
    assert raw_get(helper, "/outro/")[0] == 401
    assert raw_get(helper, "/outro/app.js")[0] == 401
    assert raw_get(helper, "/outro/events")[0] == 401


def test_prefixo_favicon_204(helper):
    assert raw_get(helper, f"/{TOKEN}/favicon.ico")[0] == 204


def test_prefixo_events_e_event(helper):
    conn = http.client.HTTPConnection("127.0.0.1", helper[0], timeout=5)
    conn.request("GET", f"/{TOKEN}/events")
    resp = conn.getresponse()
    assert resp.status == 200
    assert resp.getheader("Content-Type") == "text/event-stream"
    conn2 = http.client.HTTPConnection("127.0.0.1", helper[0], timeout=5)
    conn2.request("POST", f"/{TOKEN}/event", body=json.dumps({"type": "pick", "node": "a"}).encode(),
                  headers={"Content-Type": "application/json"})
    assert conn2.getresponse().status == 204
    conn2.close()
    conn.close()
    assert {"type": "pick", "node": "a"} in helper[1].events()


def test_cena_nova_esquece_o_mode_anterior(helper):
    # M1: a mode of the old scene must not reach a page that opens on the new one
    post_cmd(helper, {"type": "scene", "scene": {"id": "velha"}})
    post_cmd(helper, {"type": "mode", "narrator": "page", "narration": True, "from": 2})
    post_cmd(helper, {"type": "scene", "scene": {"id": "nova"}, "narrator": "jarvis"})
    page = Page(helper)
    assert page.next() == {"type": "scene", "scene": {"id": "nova"}, "narrator": "jarvis"}
    post_cmd(helper, {"type": "caption", "text": "depois"})
    assert page.next() == {"type": "caption", "text": "depois"}
    page.close()


def test_mode_reenviado_sem_from(helper):
    # M1: a reopened page starts at step 1; the fallback's `from` belonged to the old page
    post_cmd(helper, {"type": "scene", "scene": {"id": "s1"}})
    page = Page(helper)
    page.next()
    post_cmd(helper, {"type": "mode", "narrator": "page", "narration": True, "from": 2})
    assert page.next() == {"type": "mode", "narrator": "page", "narration": True, "from": 2}
    page.close()
    again = Page(helper)
    assert again.next()["type"] == "scene"
    assert again.next() == {"type": "mode", "narrator": "page", "narration": True}
    again.close()


@pytest.fixture
def figuras_helper(tmp_path):
    figs = tmp_path / "figuras"
    (figs / "fluent" / "3d").mkdir(parents=True)
    (figs / "fluent" / "3d" / "gear.png").write_bytes(b"PNG fake")
    (figs / "tabler").mkdir()
    (figs / "tabler" / "gear.svg").write_text("<svg/>", encoding="utf-8")
    (figs / "tabler" / "nota.txt").write_text("x", encoding="utf-8")
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("x", encoding="utf-8")
    (web / "server.py").write_text("x", encoding="utf-8")
    server = make_server(0, TOKEN, Out(), web_dir=web, figuras_dir=figs)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


def fig_get(port, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", path, headers=headers or {})
    resp = conn.getresponse()
    body = resp.read()
    out = (resp.status, dict(resp.getheaders()), body)
    conn.close()
    return out


def test_figuras_png_e_svg_com_tipo_certo(figuras_helper):
    status_, headers, body = fig_get(figuras_helper, f"/{TOKEN}/figuras/fluent/3d/gear.png")
    assert status_ == 200 and headers["Content-Type"] == "image/png" and body == b"PNG fake"
    assert headers["Cache-Control"] == "max-age=86400"
    status_, headers, _ = fig_get(figuras_helper, f"/{TOKEN}/figuras/tabler/gear.svg")
    assert status_ == 200 and headers["Content-Type"] == "image/svg+xml"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["Content-Security-Policy"] == "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    _, headers, _ = fig_get(figuras_helper, f"/{TOKEN}/figuras/fluent/3d/gear.png")
    assert "Content-Security-Policy" not in headers


def test_state_conta_figuras_servidas(figuras_helper):
    def served():
        return json.loads(fig_get(figuras_helper, f"/state?t={TOKEN}")[2])["figuras"]
    assert served() == 0
    fig_get(figuras_helper, f"/{TOKEN}/figuras/tabler/gear.svg")
    fig_get(figuras_helper, f"/{TOKEN}/figuras/tabler/nao-existe.svg")
    assert served() == 1


def test_figuras_sem_token_401(figuras_helper):
    assert fig_get(figuras_helper, "/figuras/tabler/gear.svg")[0] == 401
    assert fig_get(figuras_helper, "/errado/figuras/tabler/gear.svg")[0] in (401, 404)


def test_figuras_travessia_404(figuras_helper):
    for path in ("/figuras/../web/server.py", "/figuras/..%2Fweb%2Fserver.py", "/figuras/%2e%2e/web/index.html"):
        assert fig_get(figuras_helper, f"/{TOKEN}{path}")[0] == 404


def test_figuras_outra_extensao_e_inexistente_404(figuras_helper):
    assert fig_get(figuras_helper, f"/{TOKEN}/figuras/tabler/nota.txt")[0] == 404
    assert fig_get(figuras_helper, f"/{TOKEN}/figuras/tabler/nao.svg")[0] == 404


def test_figuras_pasta_ausente_404(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    for kwargs in ({"figuras_dir": tmp_path / "nada"}, {}):
        server = make_server(0, TOKEN, Out(), web_dir=web, **kwargs)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            assert fig_get(server.server_address[1], f"/{TOKEN}/figuras/a.png")[0] == 404
        finally:
            server.shutdown()
            server.server_close()
