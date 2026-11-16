"""Lança na Matriz de Visitas os resultados dos fechamentos de auditoria (PPTX) das pastas VERDES.

Fluxo:
  1. Varre as pastas do semestre (PASTA_SEMESTRE). Cor da pasta (ícone do OneDrive no desktop.ini):
       verde = pronta para lançar · azul = já lançada · sem cor (amarela) = auditoria não fechada.
  2. Para cada pasta verde (exceto UDC), lê o PPTX de fechamento: nível Frota (selo), nível Armazém (selo),
     % Check MTE, % Cultura de Manutenção e % Check Ambiental.
  3. Mostra a lista e pede confirmação (S/N).
  4. Grava na Tabela1 da aba Resumo via Excel (cópia local -> confere -> substitui o original), com backup.
  5. Marca como AZUIS as pastas lançadas (e as verdes que já estavam na Matriz).

Uso: python lancar_fechamentos.py [--sim]   (--sim responde S automaticamente; sem argumento pergunta)
"""
import glob, io, json, os, re, shutil, subprocess, sys, tempfile, unicodedata, colorsys, datetime, warnings
from pptx import Presentation
from PIL import Image
import openpyxl

warnings.filterwarnings("ignore")
AQUI = os.path.dirname(os.path.abspath(__file__))
ONEDRIVE = r"C:\Users\Crystian\OneDrive - DEMARCO PARTICIPACOES E SERVICOS LTDA"
# >>> Ajustar quando abrir a pasta de 2027 <<<
PASTA_SEMESTRE = os.path.join(ONEDRIVE, r"DGGO3Auditores - Auditorias 2026\Auditorias H2 2026")
ANO, SEMESTRE = 2026, "2H"
MATRIZ = os.path.join(ONEDRIVE, r"DGGO3Auditores - Matriz de Visitas\Matriz Visitas 2025.xlsx")
BACKUPS = os.path.join(os.path.dirname(AQUI), "backups")
EXCLUIR_TIPOS = {"UDC"}
COR = {"27": "azul", "25": "verde"}
ICONE_AZUL = "27"
# Nome da pasta (normalizado) -> nome usado na Matriz
ALIAS_PASTA = {
    "CD CAXIAS DO SUL": "CD CAXIAS",
    "CD CABO DO SANTO AGOSTINHO": "CDL CABO",
    "CDI SAPUCAIA DO SUL": "CD SAPUCAIA",
    "CDL CAMACARI": "CDR CAMACARI",
    "CD SERGIPE": "CD ARACAJU",
    "CD CEARA-CASTELAO": "CD CEARA",
    "CD OLINDA": "CD RECIFE",
}
EMU = 12700


def chave(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).upper().split())


# ---------------------------------------------------------------- cor da pasta (OneDrive)
def ler_ini(path):
    raw = open(path, "rb").read()
    enc = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "latin-1"
    return raw.decode(enc), enc


def cor_pasta(path):
    ini = os.path.join(path, "desktop.ini")
    if os.path.isfile(ini):
        m = re.search(r"OneDrive\.exe,(\d+)", ler_ini(ini)[0])
        if m:
            return COR.get(m.group(1), "icone" + m.group(1))
    return "amarelo"


def pintar_azul(path):
    ini = os.path.join(path, "desktop.ini")
    if not os.path.isfile(ini):
        return False
    txt, enc = ler_ini(ini)
    novo = re.sub(r"(OneDrive\.exe,)\d+", r"\g<1>" + ICONE_AZUL, txt)
    if novo == txt:
        return cor_pasta(path) == "azul"
    subprocess.run(["attrib", "-s", "-h", "-r", ini], capture_output=True)
    open(ini, "w", encoding=enc, newline="").write(novo)
    subprocess.run(["attrib", "+s", "+h", ini], capture_output=True)
    subprocess.run(["attrib", "+r", path], capture_output=True)   # pasta precisa de +r para o Explorer ler o desktop.ini
    return cor_pasta(path) == "azul"


# ---------------------------------------------------------------- leitura do PPTX
def walk(shapes):
    for sh in shapes:
        yield sh
        if sh.shape_type == 6:
            yield from walk(sh.shapes)


def texto(sh):
    return " ".join(sh.text_frame.text.split()) if sh.has_text_frame else ""


def texto_slide(s):
    return chave(" ".join(texto(sh) for sh in walk(s.shapes)))


def nivel_pela_cor(blob):
    im = Image.open(io.BytesIO(blob)).convert("RGBA").resize((60, 60))
    px = [(r, g, b) for r, g, b, a in im.getdata() if a > 200 and not (r > 220 and g > 220 and b > 220)]
    if not px:
        return None
    r = sum(p[0] for p in px) / len(px); g = sum(p[1] for p in px) / len(px); b = sum(p[2] for p in px) / len(px)
    h, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if s < 0.25:
        return None
    # legenda "Selos Criticidade": 1 verde · 2 roxo · 3 azul · 4 laranja · 5 vermelho
    if 120 <= h < 175: return 1
    if 225 <= h < 290: return 2
    if 175 <= h < 225: return 3
    if 22 <= h < 60: return 4
    if h < 22 or h >= 330: return 5
    return None


def selos(slide):
    out = []
    for sh in slide.shapes:
        if sh.shape_type != 6:
            continue
        nv = None
        for c in walk(sh.shapes):
            if c.shape_type == 13 and c.width and c.width / EMU >= 100:
                try:
                    nv = nivel_pela_cor(c.image.blob)
                except Exception:
                    nv = None
                if nv:
                    break
        if nv:
            out.append((sh.width / EMU, sh.left / EMU, nv))
    return out


def nivel_h2(slide):
    # selo do semestre atual fica na área "Resultado H2" (à esquerda, ~197pt); havendo selos empilhados vale o de cima
    ss = [s for s in selos(slide) if s[1] < 760 and s[0] >= 160]
    if not ss:
        return None, "selo não encontrado"
    return ss[-1][2], (f"selos sobrepostos {[s[2] for s in ss]} — usado o de cima" if len(ss) > 1 else "")


PCT = re.compile(r"^(\d{1,3}(?:[.,]\d+)?)\s*%$")


def caixas_pct(slide):
    return [(sh.left / EMU, sh.top / EMU, float(PCT.match(texto(sh)).group(1).replace(",", ".")) / 100)
            for sh in slide.shapes if PCT.match(texto(sh))]


def achar(prs, *keys):
    for s in prs.slides:
        t = texto_slide(s)
        if all(chave(k) in t for k in keys):
            return s
    return None


def extrair(pptx):
    prs = Presentation(pptx)
    r, obs = {}, []
    s = achar(prs, "Frota - Distribui", "Resultado H2")
    r["dist"], o = nivel_h2(s) if s else (None, "slide de Frota não encontrado")
    if o: obs.append("Frota: " + o)
    s = achar(prs, "Equipamentos - Armaz", "Resultado H2")
    r["arm"], o = nivel_h2(s) if s else (None, "")
    if o: obs.append("Armazém: " + o)
    s = achar(prs, "Ader", "Check Minist")
    b = sorted([x for x in caixas_pct(s) if x[0] < 455], key=lambda x: x[1]) if s else []
    r["mte"] = round(b[0][2], 2) if b else None
    s = achar(prs, "Cultura de Manuten")
    r["man"] = None
    if s:
        for sh in walk(s.shapes):
            m = PCT.match(texto(sh))
            if m:
                r["man"] = round(float(m.group(1).replace(",", ".")) / 100, 4); break
    s = achar(prs, "Ader", "Check Ambiental")
    b = sorted([x for x in caixas_pct(s) if x[0] > 600], key=lambda x: x[0]) if s else []
    r["amb"] = round(b[0][2], 3) if b else None
    if r["dist"] is None: obs.append("sem nível de Frota")
    if r["mte"] is None: obs.append("sem % MTE")
    return r, obs


# ---------------------------------------------------------------- Matriz
def ler_matriz():
    ws = openpyxl.load_workbook(MATRIZ, data_only=True)["Resumo"]
    nomes, existentes = {}, set()
    for row in ws.iter_rows(min_row=9, values_only=True):
        u, ano, sem = row[1], row[2], row[3]
        if not u or u == "Nacional":
            continue
        k = chave(u)
        nomes.setdefault(k, u)
        if ano and sem:
            existentes.add((k, int(ano), str(sem).strip().upper()))
    return nomes, existentes


def gravar(linhas):
    os.makedirs(BACKUPS, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(MATRIZ, os.path.join(BACKUPS, f"Matriz Visitas 2025 - antes {stamp}.xlsx"))
    tmp = tempfile.mkdtemp()
    js = os.path.join(tmp, "inserir.json")
    json.dump(linhas, open(js, "w", encoding="utf-8"), ensure_ascii=False)
    p = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                        os.path.join(AQUI, "gravar_matriz.ps1"), "-Matriz", MATRIZ, "-Dados", js, "-Ano", str(ANO), "-Sem", SEMESTRE],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(p.stdout.strip())
    if p.returncode != 0 or "SALVO: True" not in p.stdout:
        print(p.stderr.strip())
        return False
    # conferência: todas as linhas devem existir com os mesmos valores
    _, existentes = ler_matriz()
    falt = [l["unidade"] for l in linhas if (chave(l["unidade"]), ANO, SEMESTRE) not in existentes]
    if falt:
        print("ATENÇÃO: não encontrei na Matriz após gravar:", ", ".join(falt))
        return False
    return True


def fmt(v, kind):
    if v is None: return "—"
    return f"N{v}" if kind == "n" else f"{v*100:.1f}%".replace(".", ",")


def main():
    auto = "--sim" in sys.argv
    print(f"\nSemestre: {ANO} {SEMESTRE}  ·  pasta: {os.path.basename(PASTA_SEMESTRE)}")
    nomes, existentes = ler_matriz()
    novas, ja_lancadas, problemas = [], [], []
    for d in sorted(os.listdir(PASTA_SEMESTRE)):
        p = os.path.join(PASTA_SEMESTRE, d)
        if not os.path.isdir(p) or cor_pasta(p) != "verde":
            continue
        if chave(d).split(" ")[0] in EXCLUIR_TIPOS:
            continue
        k = chave(d); k = ALIAS_PASTA.get(k, k)
        nome = nomes.get(k)
        if not nome:
            problemas.append((d, "unidade não encontrada na Matriz (cadastre o nome em ALIAS_PASTA)")); continue
        if (k, ANO, SEMESTRE) in existentes:
            ja_lancadas.append((d, p)); continue
        pp = glob.glob(os.path.join(p, "Fechamento*.pptx"))
        if not pp:
            problemas.append((d, "pasta verde sem PPTX de fechamento")); continue
        try:
            r, obs = extrair(pp[0])
        except Exception as e:
            problemas.append((d, f"erro ao ler o PPTX: {e}")); continue
        if r["dist"] is None or r["mte"] is None:
            problemas.append((d, "; ".join(obs))); continue
        novas.append(dict(pasta=d, caminho=p, unidade=nome, obs=obs, **r))

    print(f"\nPastas verdes já lançadas na Matriz (serão marcadas de azul): {len(ja_lancadas)}")
    if problemas:
        print("\nNÃO serão lançadas — conferir manualmente:")
        for d, m in problemas:
            print(f"  - {d}: {m}")
    if not novas:
        print("\nNenhuma unidade nova para lançar.")
    else:
        print(f"\nUnidades a lançar em {ANO} {SEMESTRE}: {len(novas)}")
        print(f"  {'Unidade':28} {'Frota':>6} {'Armaz.':>6} {'MTE':>7} {'Manut.':>8} {'Amb.':>7}")
        for n in novas:
            print(f"  {n['unidade']:28} {fmt(n['dist'],'n'):>6} {fmt(n['arm'],'n'):>6} {fmt(n['mte'],'p'):>7} {fmt(n['man'],'p'):>8} {fmt(n['amb'],'p'):>7}"
                  + (f"   ! {'; '.join(n['obs'])}" if n["obs"] else ""))
    if not novas and not ja_lancadas:
        return 0
    resp = "S" if auto else input("\nConfirmar lançamento na Matriz e marcar as pastas de azul? (S/N): ").strip().upper()
    if resp != "S":
        print("Cancelado — nada foi alterado.")
        return 0
    if novas:
        ok = gravar([{k: n[k] for k in ("unidade", "dist", "arm", "mte", "man", "amb")} for n in novas])
        if not ok:
            print("\nA Matriz NÃO foi alterada (ou a conferência falhou). As pastas continuam verdes.")
            return 1
        print(f"Matriz atualizada: {len(novas)} unidade(s) lançada(s).")
    pintadas = [d for d, p in [(n["pasta"], n["caminho"]) for n in novas] + ja_lancadas if pintar_azul(p)]
    print(f"Pastas marcadas de azul: {len(pintadas)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
