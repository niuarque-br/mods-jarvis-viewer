import importlib.util
import json
import struct
import sys
import zlib
from pathlib import Path

CAMINHO = Path(__file__).resolve().parent.parent / "baixar-figuras.py"
spec = importlib.util.spec_from_file_location("baixar_figuras", CAMINHO)
bf = importlib.util.module_from_spec(spec)
sys.modules["baixar_figuras"] = bf
spec.loader.exec_module(bf)


def png(pixels, largura, altura, tipo=6, filtro=0):
    """PNG de 8 bits; pixels = lista de tuplas por linha achatada."""
    canais = 4 if tipo == 6 else 3
    linhas = b""
    for y in range(altura):
        linha = b"".join(bytes(p) for p in pixels[y * largura:(y + 1) * largura])
        linhas += bytes([filtro]) + linha
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d))
    ihdr = struct.pack(">IIBBBBB", largura, altura, 8, tipo, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(linhas)) + chunk(b"IEND", b"")


def test_slug():
    assert bf.slug("Magnifying glass tilted left") == "magnifying-glass-tilted-left"
    assert bf.slug("Flag: Côte d'Ivoire") == "flag-cote-d-ivoire"


def test_tom_png_escuro_e_colorido():
    preto = png([(0, 0, 0, 255)] * 4, 2, 2)
    laranja = png([(255, 140, 0, 255)] * 4, 2, 2)
    branco = png([(255, 255, 255, 255)] * 4, 2, 2)
    assert bf.tom_png(preto) == "escura"
    assert bf.tom_png(laranja) == "colorida"
    assert bf.tom_png(branco) == "clara"


def test_tom_png_ignora_pixels_transparentes():
    # metade transparente (branca), metade preta opaca: so conta a preta
    px = [(255, 255, 255, 0), (0, 0, 0, 255)] * 2
    assert bf.tom_png(png(px, 2, 2)) == "escura"


def test_tom_png_rgb_e_filtro_sub():
    laranja = png([(255, 140, 0)] * 4, 2, 2, tipo=2)
    assert bf.tom_png(laranja) == "colorida"


def test_tom_png_modo_desconhecido_vira_colorida():
    assert bf.tom_png(b"nao e png") == "colorida"
    # paleta (tipo 3) nao e suportado
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d))
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)
    dados = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00\x00")) + chunk(b"IEND", b"")
    assert bf.tom_png(dados) == "colorida"


def test_tom_svg_mono_preto():
    assert bf.tom_svg('<svg><path fill="#212121"/></svg>') == "escura"


def test_tom_svg_colorido_e_gradiente():
    assert bf.tom_svg('<svg><path fill="#FF6723"/><stop stop-color="#FFB02E"/></svg>') == "colorida"
    assert bf.tom_svg('<svg><path fill="#fff"/></svg>') == "clara"
    assert bf.tom_svg('<svg><path fill="none" stroke="currentColor"/></svg>') == "mono"


def test_entrada_fluent_usa_metadata():
    meta = {"cldr": "gear", "group": "Objects", "keywords": ["cog", "cogwheel", "gear", "tool"]}
    e = bf.entrada_fluent("Gear", meta, "3d", "fluent/3d/gear.png", tom="colorida")
    assert e["nome"] == "fluent/3d:gear"
    assert e["pacote"] == "fluent" and e["estilo"] == "3d" and e["id"] == "gear"
    assert e["arquivo"] == "fluent/3d/gear.png"
    assert e["titulo"] == "Gear"
    assert e["palavras"] == ["gear", "cog", "cogwheel", "tool"]
    assert e["categoria"] == "Objects" and e["conceito"] == "gear" and e["tom"] == "colorida"


def test_entrada_fluent_hc_e_mono():
    meta = {"cldr": "thumbs up", "group": "People & Body", "keywords": ["+1", "hand"]}
    e = bf.entrada_fluent("Thumbs up", meta, "hc", "fluent/hc/thumbs-up.svg")
    assert e["id"] == "thumbs-up" and e["conceito"] == "thumbs-up" and e["tom"] == "mono"
    assert "thumbs up" in e["palavras"]


def test_entrada_icone_phosphor_tira_peso():
    e = bf.entrada_icone("phosphor", "duotone", "gear-duotone", ["cog"], "System")
    assert e["conceito"] == "gear" and e["id"] == "gear"
    assert e["nome"] == "phosphor/duotone:gear"
    assert e["arquivo"] == "phosphor/duotone/gear.svg"
    assert e["tom"] == "mono" and e["palavras"][0] == "gear" and "cog" in e["palavras"]


def test_entrada_icone_regular_nao_tira_nada():
    e = bf.entrada_icone("phosphor", "regular", "text-bolder", [], "")
    assert e["id"] == "text-bolder"
    e = bf.entrada_icone("lucide", "line", "database", ["storage"], "")
    assert e["arquivo"] == "lucide/line/database.svg" and e["nome"] == "lucide/line:database"


def test_catalogo_sem_nomes_duplicados(tmp_path):
    a = bf.entrada_icone("tabler", "outline", "database", [], "")
    b = bf.entrada_icone("tabler", "filled", "database", [], "")
    c = dict(a)
    out = bf.escrever_catalogo(tmp_path, [a, b, c], {"tabler": {"versao": "3.49.0", "licenca": "MIT"}})
    dados = json.loads((tmp_path / "catalogo.json").read_text(encoding="utf-8"))
    assert dados["versao"] == 1
    assert [f["nome"] for f in dados["figuras"]] == ["tabler/outline:database", "tabler/filled:database"]
    assert dados["pacotes"]["tabler"]["versao"] == "3.49.0"
    assert out == 2


def test_atualizado(tmp_path):
    assert bf.ja_atualizado(tmp_path) is False
    pacotes = {k: {"versao": v["versao"], "licenca": v["licenca"]} for k, v in bf.PACOTES.items()}
    bf.escrever_catalogo(tmp_path, [], pacotes)
    assert bf.ja_atualizado(tmp_path) is True
    pacotes["tabler"]["versao"] = "0.0.1"
    bf.escrever_catalogo(tmp_path, [], pacotes)
    assert bf.ja_atualizado(tmp_path) is False
