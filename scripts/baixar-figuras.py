#!/usr/bin/env python3
"""Baixa os pacotes de figuras (MIT/ISC) em versoes fixadas e gera assets/figuras/catalogo.json.

Uso: python scripts/baixar-figuras.py [--destino assets/figuras] [--so-catalogo]

Somente biblioteca padrao. Os arquivos ficam fora do Git (assets/figuras/ no .gitignore).
Layout: <pacote>/<estilo>/<id>.<ext>, ext "png" so em fluent/3d, "svg" no resto.
"""
import argparse
import concurrent.futures
import datetime
import json
import os
import re
import shutil
import struct
import sys
import tarfile
import tempfile
import unicodedata
import urllib.request
import zipfile
import zlib
from pathlib import Path

FLUENT_COMMIT = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc"

PACOTES = {
    "fluent": {"versao": FLUENT_COMMIT, "licenca": "MIT",
               "url": f"https://codeload.github.com/microsoft/fluentui-emoji/zip/{FLUENT_COMMIT}",
               "estilos": ["3d", "color", "flat", "hc"]},
    "tabler": {"versao": "3.49.0", "licenca": "MIT",
               "url": "https://registry.npmjs.org/@tabler/icons/-/icons-3.49.0.tgz",
               "estilos": ["outline", "filled"]},
    "lucide": {"versao": "1.61.0", "licenca": "ISC",
               "url": "https://registry.npmjs.org/lucide-static/-/lucide-static-1.61.0.tgz",
               "estilos": ["line"]},
    "phosphor": {"versao": "2.1.1", "licenca": "MIT",
                 "url": "https://registry.npmjs.org/@phosphor-icons/core/-/core-2.1.1.tgz",
                 "estilos": ["thin", "light", "regular", "bold", "fill", "duotone"]},
}

FLUENT_ESTILOS = {"3D": "3d", "Color": "color", "Flat": "flat", "High Contrast": "hc"}
LIMIAR_ESCURA = 0.25
LIMIAR_CLARA = 0.80
ALFA_MIN = 0.1


# ---------------------------------------------------------------- funcoes puras

def slug(nome: str) -> str:
    s = unicodedata.normalize("NFKD", nome)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def _classificar(lum: float) -> str:
    if lum < LIMIAR_ESCURA:
        return "escura"
    if lum >= LIMIAR_CLARA:
        return "clara"
    return "colorida"


def _lum(r: float, g: float, b: float) -> float:
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def tom_png(dados: bytes) -> str:
    """Luminancia media dos pixels com alfa > 0.1. PNG 8 bits RGBA/RGB sem entrelacamento;
    qualquer outro modo (ou arquivo invalido) vira "colorida"."""
    try:
        if dados[:8] != b"\x89PNG\r\n\x1a\n":
            return "colorida"
        pos = 8
        ihdr = None
        idat = []
        while pos + 8 <= len(dados):
            n, tipo = struct.unpack(">I4s", dados[pos:pos + 8])
            corpo = dados[pos + 8:pos + 8 + n]
            pos += 12 + n
            if tipo == b"IHDR":
                ihdr = struct.unpack(">IIBBBBB", corpo)
            elif tipo == b"IDAT":
                idat.append(corpo)
            elif tipo == b"IEND":
                break
        if ihdr is None:
            return "colorida"
        w, h, prof, cor, _comp, _filt, entrelac = ihdr
        if prof != 8 or cor not in (2, 6) or entrelac != 0:
            return "colorida"
        bpp = 4 if cor == 6 else 3
        bruto = zlib.decompress(b"".join(idat))
        stride = w * bpp
        if len(bruto) < h * (stride + 1):
            return "colorida"
        anterior = bytearray(stride)
        soma = 0.0
        visiveis = 0
        for y in range(h):
            base = y * (stride + 1)
            f = bruto[base]
            linha = bytearray(bruto[base + 1:base + 1 + stride])
            if f == 1:
                for i in range(bpp, stride):
                    linha[i] = (linha[i] + linha[i - bpp]) & 255
            elif f == 2:
                for i in range(stride):
                    linha[i] = (linha[i] + anterior[i]) & 255
            elif f == 3:
                for i in range(stride):
                    esq = linha[i - bpp] if i >= bpp else 0
                    linha[i] = (linha[i] + ((esq + anterior[i]) >> 1)) & 255
            elif f == 4:
                for i in range(stride):
                    esq = linha[i - bpp] if i >= bpp else 0
                    ul = anterior[i - bpp] if i >= bpp else 0
                    linha[i] = (linha[i] + _paeth(esq, anterior[i], ul)) & 255
            elif f != 0:
                return "colorida"
            anterior = linha
            rs, gs, bs = linha[0::bpp], linha[1::bpp], linha[2::bpp]
            if bpp == 4:
                for r, g, b, a in zip(rs, gs, bs, linha[3::bpp]):
                    if a > 255 * ALFA_MIN:
                        soma += 0.2126 * r + 0.7152 * g + 0.0722 * b
                        visiveis += 1
            else:
                for r, g, b in zip(rs, gs, bs):
                    soma += 0.2126 * r + 0.7152 * g + 0.0722 * b
                visiveis += w
        if visiveis == 0:
            return "colorida"
        return _classificar(soma / visiveis / 255.0)
    except Exception:
        return "colorida"


_HEX = re.compile(r"""(?:fill|stop-color)\s*[=:]\s*["']?\s*#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b""")


def tom_svg(texto: str) -> str:
    """Media de luminancia das cores hex em fill/stop-color. Sem cores hex: "mono"
    (traco currentColor) ou "colorida"."""
    lums = []
    for m in _HEX.finditer(texto):
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        lums.append(_lum(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)))
    if not lums:
        return "mono" if "currentColor" in texto else "colorida"
    return _classificar(sum(lums) / len(lums))


def _palavras(*grupos) -> list:
    vistas, saida = set(), []
    for g in grupos:
        for p in g:
            p = str(p).strip().lower()
            if p and p != "*new*" and p not in vistas:
                vistas.add(p)
                saida.append(p)
    return saida


def entrada_fluent(pasta: str, metadata: dict, estilo: str, arquivo: str, tom: str = None) -> dict:
    id_ = slug(pasta)
    if tom is None:
        tom = "mono" if estilo == "hc" else "colorida"
    return {
        "nome": f"fluent/{estilo}:{id_}", "pacote": "fluent", "estilo": estilo, "id": id_,
        "arquivo": arquivo, "titulo": pasta,
        "palavras": _palavras([metadata.get("cldr", "")], metadata.get("keywords", [])),
        "categoria": metadata.get("group", ""), "conceito": id_, "tom": tom,
    }


def entrada_icone(pacote: str, estilo: str, id: str, tags, categoria: str, tom: str = "mono") -> dict:
    if pacote == "phosphor" and estilo != "regular" and id.endswith("-" + estilo):
        id = id[: -len(estilo) - 1]
    return {
        "nome": f"{pacote}/{estilo}:{id}", "pacote": pacote, "estilo": estilo, "id": id,
        "arquivo": f"{pacote}/{estilo}/{id}.svg", "titulo": id.replace("-", " ").title(),
        "palavras": _palavras([id], tags or []),
        "categoria": categoria or "", "conceito": id, "tom": tom,
    }


def escrever_catalogo(destino: Path, entradas: list, pacotes: dict) -> int:
    vistos, figuras = set(), []
    for e in entradas:
        if e["nome"] in vistos:
            continue
        vistos.add(e["nome"])
        figuras.append(e)
    # ordem dos pacotes: juntar as partes na ordem de `pacotes` da exatamente o catalogo inteiro
    ordem = {p: i for i, p in enumerate(pacotes)}
    figuras.sort(key=lambda f: ordem.get(f["pacote"], len(ordem)))
    doc = {
        "versao": 1,
        "gerado": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "pacotes": pacotes,
        "figuras": figuras,
    }
    Path(destino).mkdir(parents=True, exist_ok=True)
    (Path(destino) / "catalogo.json").write_text(
        json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    escrever_partes(destino, figuras, pacotes)
    return len(figuras)


def escrever_partes(destino: Path, figuras: list, pacotes: dict) -> None:
    # O plugin le arquivos de ate 4 MiB ($.fs.read): o catalogo inteiro passa disso,
    # entao cada pacote tambem vai num arquivo proprio (catalogo-<pacote>.json).
    for pacote in pacotes:
        parte = {"versao": 1, "pacote": pacote, "figuras": [f for f in figuras if f["pacote"] == pacote]}
        (Path(destino) / f"catalogo-{pacote}.json").write_text(
            json.dumps(parte, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _pacotes_info() -> dict:
    return {k: {"versao": v["versao"], "licenca": v["licenca"]} for k, v in PACOTES.items()}


def ja_atualizado(destino: Path) -> bool:
    try:
        doc = json.loads((Path(destino) / "catalogo.json").read_text(encoding="utf-8"))
        if not (doc.get("versao") == 1 and doc.get("pacotes") == _pacotes_info()):
            return False
        # instalacao feita antes das partes por pacote: gera as que faltam a partir do catalogo
        if not all((Path(destino) / f"catalogo-{p}.json").is_file() for p in doc["pacotes"]):
            escrever_partes(destino, doc["figuras"], doc["pacotes"])
        return True
    except Exception:
        return False


# ---------------------------------------------------------------- rede e extracao

def baixar(url: str, alvo: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "jarvis-viewer-figuras"})
    with urllib.request.urlopen(req, timeout=120) as r, open(alvo, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        lido = 0
        while True:
            bloco = r.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)
            lido += len(bloco)
            if total:
                print(f"\r    baixando {lido >> 20}/{total >> 20} MB", end="", flush=True)
    print()


def _gravar(caminho: Path, dados: bytes) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(dados)


def _salvar_meta(raiz: Path, pacote: str, meta: dict) -> None:
    _gravar(raiz / pacote / "metadados.json",
            json.dumps(meta, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _segura(nome: str) -> bool:
    return re.fullmatch(r"[A-Za-z0-9._-]+", nome) is not None


def _tar_membros(arquivo_tgz: Path):
    with tarfile.open(arquivo_tgz, "r|gz") as t:
        for m in t:
            if m.isfile():
                yield m.name, t.extractfile(m)


def extrair_tabler(tgz: Path, raiz: Path) -> None:
    meta = {}
    icones = {}
    for nome, f in _tar_membros(tgz):
        partes = nome.split("/")
        if nome == "package/LICENSE":
            _gravar(raiz / "tabler" / "LICENSE", f.read())
        elif nome == "package/icons.json":
            icones = json.loads(f.read())
        elif len(partes) == 4 and partes[1] == "icons" and partes[2] in ("outline", "filled") \
                and partes[3].endswith(".svg") and _segura(partes[3]):
            _gravar(raiz / "tabler" / partes[2] / partes[3], f.read())
    for k, v in icones.items():
        meta[k] = {"tags": [str(t) for t in v.get("tags", [])], "categoria": v.get("category", "")}
    _salvar_meta(raiz, "tabler", meta)


def extrair_lucide(tgz: Path, raiz: Path) -> None:
    tags = {}
    for nome, f in _tar_membros(tgz):
        partes = nome.split("/")
        if nome == "package/LICENSE":
            _gravar(raiz / "lucide" / "LICENSE", f.read())
        elif nome == "package/tags.json":
            tags = json.loads(f.read())
        elif len(partes) == 3 and partes[1] == "icons" and partes[2].endswith(".svg") and _segura(partes[2]):
            _gravar(raiz / "lucide" / "line" / partes[2], f.read())
    _salvar_meta(raiz, "lucide", {k: {"tags": v, "categoria": ""} for k, v in tags.items()})


def _meta_phosphor(dts: str, mjs: str) -> dict:
    enum = {}
    m = re.search(r'\(i\.ARROWS\s*=.*?\|\|\s*\{\}\)', mjs, re.S)
    if m:
        enum = dict(re.findall(r'i\.([A-Z_]+)\s*=\s*"([^"]*)"', m.group(0)))
    saida = {}
    for bloco in dts.split("}, {"):
        n = re.search(r'readonly name:\s*"([^"]+)"', bloco)
        if not n:
            continue
        cats = re.search(r'readonly categories:\s*readonly\s*\[(.*?)\]', bloco, re.S)
        tags = re.search(r'readonly tags:\s*readonly\s*\[(.*?)\]', bloco, re.S)
        nomes = re.findall(r'IconCategory\.([A-Z_]+)', cats.group(1)) if cats else []
        saida[n.group(1)] = {
            "tags": re.findall(r'"([^"]*)"', tags.group(1)) if tags else [],
            "categoria": enum.get(nomes[0], nomes[0].lower()) if nomes else "",
        }
    return saida


def extrair_phosphor(tgz: Path, raiz: Path) -> None:
    dts = mjs = ""
    pesos = set(PACOTES["phosphor"]["estilos"])
    for nome, f in _tar_membros(tgz):
        partes = nome.split("/")
        if nome == "package/LICENSE":
            _gravar(raiz / "phosphor" / "LICENSE", f.read())
        elif nome == "package/dist/icons.d.ts":
            dts = f.read().decode("utf-8")
        elif nome == "package/dist/index.mjs":
            mjs = f.read().decode("utf-8")
        elif len(partes) == 4 and partes[1] == "assets" and partes[2] in pesos \
                and partes[3].endswith(".svg") and _segura(partes[3]):
            base = partes[3][:-4]
            if partes[2] != "regular" and base.endswith("-" + partes[2]):
                base = base[: -len(partes[2]) - 1]
            _gravar(raiz / "phosphor" / partes[2] / (base + ".svg"), f.read())
    _salvar_meta(raiz, "phosphor", _meta_phosphor(dts, mjs))


def extrair_fluent(zip_path: Path, raiz: Path) -> None:
    meta = {}
    with zipfile.ZipFile(zip_path) as z:
        nomes = z.namelist()
        prefixo = nomes[0].split("/")[0] + "/"
        ass = prefixo + "assets/"
        pastas = {}
        for n in nomes:
            if not n.startswith(ass) or n.endswith("/"):
                continue
            resto = n[len(ass):].split("/")
            pastas.setdefault(resto[0], []).append(resto[1:])
        for pasta, itens in pastas.items():
            id_ = slug(pasta)
            if not id_ or id_ in meta:
                continue
            tem_tom = any(len(i) > 2 and i[0] == "Default" for i in itens)
            for i in itens:
                if i == ["metadata.json"]:
                    m = json.loads(z.read(f"{ass}{pasta}/metadata.json"))
                    meta[id_] = {"titulo": pasta, "cldr": m.get("cldr", ""),
                                 "keywords": m.get("keywords", []), "group": m.get("group", "")}
                    continue
                if tem_tom:
                    if len(i) != 3 or i[0] != "Default":
                        continue
                    estilo_dir, arq = i[1], i[2]
                else:
                    if len(i) != 2:
                        continue
                    estilo_dir, arq = i[0], i[1]
                estilo = FLUENT_ESTILOS.get(estilo_dir)
                if not estilo:
                    continue
                ext = "png" if estilo == "3d" else "svg"
                if not arq.lower().endswith("." + ext):
                    continue
                _gravar(raiz / "fluent" / estilo / f"{id_}.{ext}", z.read(f"{ass}{'/'.join([pasta] + i)}"))
        _gravar(raiz / "fluent" / "LICENSE", z.read(prefixo + "LICENSE"))
    _salvar_meta(raiz, "fluent", {k: v for k, v in meta.items()})


EXTRATORES = {"fluent": extrair_fluent, "tabler": extrair_tabler,
              "lucide": extrair_lucide, "phosphor": extrair_phosphor}


# ---------------------------------------------------------------- catalogo a partir do disco

def _tom_arquivo(caminho: str) -> str:
    dados = Path(caminho).read_bytes()
    if caminho.endswith(".png"):
        return tom_png(dados)
    return tom_svg(dados.decode("utf-8", "replace"))


def gerar_catalogo(raiz: Path) -> int:
    raiz = Path(raiz)
    entradas = []
    tons_pendentes = []  # (indice, caminho)
    for pacote, info in PACOTES.items():
        mp = raiz / pacote / "metadados.json"
        meta = json.loads(mp.read_text(encoding="utf-8")) if mp.exists() else {}
        for estilo in info["estilos"]:
            pasta = raiz / pacote / estilo
            if not pasta.is_dir():
                continue
            for arq in sorted(pasta.iterdir()):
                if arq.suffix not in (".svg", ".png"):
                    continue
                id_ = arq.stem
                rel = f"{pacote}/{estilo}/{arq.name}"
                if pacote == "fluent":
                    m = meta.get(id_, {})
                    e = entrada_fluent(m.get("titulo", id_), m, estilo, rel)
                    e["id"] = e["conceito"] = id_
                    e["nome"] = f"fluent/{estilo}:{id_}"
                    if estilo in ("3d", "color", "flat"):
                        tons_pendentes.append((len(entradas), str(arq)))
                else:
                    m = meta.get(id_, {})
                    e = entrada_icone(pacote, estilo, id_, m.get("tags", []), m.get("categoria", ""))
                entradas.append(e)
    print(f"  calculando o tom de {len(tons_pendentes)} figuras coloridas...")
    with concurrent.futures.ProcessPoolExecutor() as ex:
        tons = list(ex.map(_tom_arquivo, [c for _, c in tons_pendentes], chunksize=64))
    for (i, _), t in zip(tons_pendentes, tons):
        entradas[i]["tom"] = "colorida" if t == "mono" else t
    return escrever_catalogo(raiz, entradas, _pacotes_info())


# ---------------------------------------------------------------- principal

def principal(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Baixa as figuras e gera o catalogo.")
    ap.add_argument("--destino", default=None, help="pasta de saida (padrao: assets/figuras do repositorio)")
    ap.add_argument("--so-catalogo", action="store_true",
                    help="nao baixa nada; regenera catalogo.json a partir do que ja esta na pasta")
    args = ap.parse_args(argv)
    destino = Path(args.destino) if args.destino else Path(__file__).resolve().parent.parent / "assets" / "figuras"
    destino = destino.resolve()

    if args.so_catalogo:
        if not destino.is_dir():
            print(f"pasta {destino} nao existe; rode sem --so-catalogo", file=sys.stderr)
            return 1
        n = gerar_catalogo(destino)
        print(f"catalogo regenerado: {n} figuras")
        return 0

    if ja_atualizado(destino):
        print("figuras ja estao atualizadas")
        return 0

    tmp = destino.with_name(destino.name + ".tmp")
    velho = destino.with_name(destino.name + ".old")
    for p in (tmp, velho):
        if p.exists():
            shutil.rmtree(p)
    tmp.mkdir(parents=True)
    try:
        with tempfile.TemporaryDirectory(prefix="figuras-dl-") as dl:
            for i, (nome, info) in enumerate(PACOTES.items(), 1):
                print(f"[{i}/{len(PACOTES)}] {nome} {info['versao'][:12]}")
                arq = Path(dl) / (nome + (".zip" if nome == "fluent" else ".tgz"))
                baixar(info["url"], arq)
                print("    extraindo...")
                EXTRATORES[nome](arq, tmp)
                arq.unlink()
        print("gerando catalogo")
        n = gerar_catalogo(tmp)
        if destino.exists():
            os.replace(destino, velho)
        os.replace(tmp, destino)
        if velho.exists():
            shutil.rmtree(velho, ignore_errors=True)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    print(f"pronto: {n} figuras em {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
