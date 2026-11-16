"""Gera os 3 painéis HTML a partir da Matriz Visitas 2025.xlsx (aba Resumo / Tabela1).

Uso:  python gerar_dashboards.py
Os HTML ficam nesta mesma pasta e funcionam offline (dados embutidos, sem bibliotecas externas).
"""
import json, os, unicodedata, datetime, warnings, glob, collections
import openpyxl

warnings.filterwarnings("ignore")
AQUI = os.path.dirname(os.path.abspath(__file__))
PLANILHA = r"C:\Users\Crystian\OneDrive - DEMARCO PARTICIPACOES E SERVICOS LTDA\DGGO3Auditores - Matriz de Visitas\Matriz Visitas 2025.xlsx"
EXCLUIR_TIPOS = {"UDC"}  # UDCs fora do escopo
# Cópia do painel principal para compartilhar internamente (OneDrive/SharePoint da empresa)
PUBLICAR_PAINEL = (os.path.join(os.path.dirname(PLANILHA), "Painel Visitas Demarco - DPO.html"), "modelo2_centro_de_comando.html")

# Base do app de auditoria (perguntas do Check MTE e Check Ambiental).
# Usa o arquivo BASE_APP_AUDITORIA*.xlsx mais recente encontrado nestas pastas.
PASTAS_BASE_APP = [os.path.expanduser(r"~\Desktop"), os.path.dirname(AQUI)]
CHECKS_APP = {"Check MTE": "mte", "Check Ambiental": "amb"}
GRUPOS_IGNORADOS = {"Gente"}          # pergunta de acessibilidade cadastrada por engano no Check Ambiental
ALIAS_UNIDADE = {               # nome no app de auditoria -> nome na Matriz (sem acento, maiúsculo)
    "CD MACACU": "CDI MACACU",
    "CD BH": "CD BELO HORIZONTE",
    "AS GOIANIA": "CD GOIANIA",
    "CDL PERNAMBUCO": "CD RECIFE",
}
# Unidades da Matriz que são a mesma operação: nome antigo -> nome que fica (e Geo correta)
UNIFICAR_UNIDADE = {"CD OLINDA": "CD RECIFE"}
GEO_FIXA = {"CD RECIFE": "NE"}
# Quando a unidade tem mais de um lançamento no mesmo semestre, por padrão vale o mais recente.
# Aqui ficam as exceções definidas pelo usuário: (unidade na Matriz, "ANO 1H/2H") -> data do lançamento a usar.
AUDITORIA_PREFERIDA = {
    ("CD GUARULHOS", "2025 1H"): "23/01/2025",
}   # as linhas de CD OLINDA estão com Geo "SP" na Matriz


def chave(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).upper().split())


def lvl(v):
    try:
        v = int(v)
        return v if 1 <= v <= 5 else None
    except (TypeError, ValueError):
        return None


def carregar():
    ws = openpyxl.load_workbook(PLANILHA, data_only=True)["Resumo"]
    ref = ws.tables["Tabela1"].ref
    ini, fim = ref.split(":")
    r0, r1 = int("".join(filter(str.isdigit, ini))) + 1, int("".join(filter(str.isdigit, fim)))
    notas, brutos = [], []
    notas_unif = set()
    for r in range(r0, r1 + 1):
        geo, uni, ano, sem, dist, arm, mte, man, amb = [ws.cell(r, c).value for c in range(1, 10)]
        if not uni or not ano or not sem:
            continue
        tipo = str(uni).split()[0].upper()
        if tipo in EXCLUIR_TIPOS:
            continue

        def pct(v, nome):
            if v is None or v == "" or str(v).strip().upper() == "N/A":
                return None
            if isinstance(v, (int, float)):
                return round(float(v), 4)
            notas.append(f"{uni} {ano} {sem}: valor de {nome} \"{v}\" (linha {r}) não é numérico — desconsiderado.")
            return None

        k = chave(uni)
        if k in UNIFICAR_UNIDADE:
            notas_unif.add(f"{str(uni).strip()} unificada com {UNIFICAR_UNIDADE[k]} (mesma unidade) — resultados exibidos como {UNIFICAR_UNIDADE[k]}.")
            uni = k = UNIFICAR_UNIDADE[k]
        geo = GEO_FIXA.get(k, geo)
        brutos.append(dict(linha=r, geo=geo, uni=str(uni).strip(), k=k, tipo=tipo, ano=int(ano), sem=str(sem).strip().upper(),
                           dist=lvl(dist), arm=lvl(arm), mte=pct(mte, "MTE"), man=pct(man, "Manutenção"), amb=pct(amb, "Ambiental")))

    # nome e Geo de exibição = os da auditoria mais recente da unidade (variações de acento unificadas)
    ult = {}
    for b in sorted(brutos, key=lambda b: (b["ano"], b["sem"], b["linha"])):
        ult[b["k"]] = b
    variantes = {}
    for b in brutos:
        variantes.setdefault(b["k"], set()).add(b["uni"])
    for k, vs in variantes.items():
        if len(vs) > 1:
            notas.append(f"Grafias diferentes unificadas como \"{ult[k]['uni']}\": {', '.join(sorted(vs))}.")

    vistos, recs = {}, []
    for b in brutos:
        id_ = (b["k"], b["ano"], b["sem"])
        sig = (b["dist"], b["arm"], b["mte"], b["man"], b["amb"])
        if id_ in vistos:
            if vistos[id_] == sig:
                notas.append(f"{ult[b['k']]['uni']} {b['ano']} {b['sem']}: linha duplicada (linha {b['linha']}) — considerada uma vez.")
            else:
                notas.append(f"{ult[b['k']]['uni']} {b['ano']} {b['sem']}: duas linhas com valores diferentes — usada a primeira; a linha {b['linha']} foi ignorada.")
            continue
        vistos[id_] = sig
        if b["man"] is not None and b["man"] < 0.3:
            notas.append(f"{ult[b['k']]['uni']} {b['ano']} {b['sem']}: Manutenção = {b['man']*100:.0f}% (linha {b['linha']}) — mantido como está na planilha; vale conferir.")
        recs.append([ult[b["k"]]["uni"], b["tipo"], ult[b["k"]]["geo"], b["ano"], b["sem"], b["dist"], b["arm"], b["mte"], b["man"], b["amb"]])

    notas.extend(sorted(notas_unif))
    notas.append("UDCs não fazem parte do escopo e foram excluídas dos painéis.")
    notas.append("Geo de cada unidade = Geo da auditoria mais recente na planilha.")
    notas.append("Nível de criticidade: 1 é o melhor resultado e 5 o mais crítico. \"% em Nível 1\" considera apenas auditorias com nível preenchido.")
    notas.append("Células vazias ou \"N/A\" não entram nas médias.")
    return {"recs": recs, "notes": notas, "gerado": datetime.datetime.now().strftime("%d/%m/%Y %H:%M")}


def base_app_mais_recente():
    arqs = [f for d in PASTAS_BASE_APP for f in glob.glob(os.path.join(d, "BASE_APP_AUDITORIA*.xlsx"))
            if os.path.getsize(f) > 0 and not os.path.basename(f).startswith("~$")]
    return max(arqs, key=os.path.getmtime) if arqs else None


def carregar_checklist(unidades_matriz):
    """Perguntas/respostas/observações do Check MTE e Ambiental, ligadas às unidades da Matriz.
    Unidade, ano e semestre vêm da aba HISTORICO (via HISTORICO_ID). Não guarda nomes de auditores."""
    arq = base_app_mais_recente()
    if not arq:
        return None, ["Base do app de auditoria (BASE_APP_AUDITORIA*.xlsx) não encontrada — checklist não exibido."]
    wb = openpyxl.load_workbook(arq, read_only=True, data_only=True)
    rows = list(wb["B_RESPOSTAS"].iter_rows(values_only=True)); ix = {h: i for i, h in enumerate(rows[0])}
    perg = list(wb["B_PERGUNTAS"].iter_rows(values_only=True)); px = {h: i for i, h in enumerate(perg[0])}
    hrows = list(wb["HISTORICO"].iter_rows(values_only=True)); hx = {h: i for i, h in enumerate(hrows[1])}
    hist = {str(r[hx["ID"]]): r for r in hrows[2:] if r[hx["ID"]] is not None}
    cad = {str(p[px["ID"]]): p for p in perg[1:] if p[px["ID"]] is not None}
    por_chave = {chave(u): u for u in unidades_matriz}
    notas = [f"Checklist (perguntas e observações) lido de {os.path.basename(arq)}, abas B_RESPOSTAS/B_PERGUNTAS/HISTORICO."]

    def unidade_hist(h):
        txt = h[hx["UNIDADE_DMPEOPLE"]]
        if txt:
            p = str(txt).split("-")
            if len(p) > 2:
                return p[2].split(" - ")[0].strip()
        return h[hx["OPERACAO"]]

    auds = collections.defaultdict(list)
    for r in rows[1:]:
        chk = CHECKS_APP.get(r[ix["CHECK"]])
        if chk:
            auds[(chk, str(r[ix["HISTORICO_ID"]]))].append(r)

    perguntas, qidx, obs, oidx = [], {}, [], {}
    porunid = {}
    sem_hist = fora = 0
    duplicadas = [0]
    nao_ligadas = collections.Counter()
    for (chk, hid), rs in auds.items():
        h = hist.get(hid)
        if not h:
            sem_hist += len(rs); continue
        k = chave(unidade_hist(h)); k = ALIAS_UNIDADE.get(k, k); k = UNIFICAR_UNIDADE.get(k, k)
        if k.split(" ")[0] in EXCLUIR_TIPOS:
            continue
        u = por_chave.get(k)
        if not u:
            nao_ligadas[k] += 1; fora += len(rs); continue
        d = h[hx["DATA"]] or next((r[ix["DATA"]] for r in rs if r[ix["DATA"]]), None)
        sem = (h[hx["SEMESTRE"]] or "").replace("H1", "1H").replace("H2", "2H")
        if not isinstance(d, datetime.datetime) or sem not in ("1H", "2H"):
            sem_hist += len(rs); continue
        per = f"{d.year} {sem}"
        # uma resposta por pergunta: se o app gravou a mesma pergunta mais de uma vez, vale a mais recente (maior ID)
        ult_por_perg = {}
        for r in sorted(rs, key=lambda r: int(r[ix["ID"]] or 0)):
            ult_por_perg[str(r[ix["PERGUNTA_ID"]])] = r
        duplicadas[0] += len(rs) - len(ult_por_perg)
        rs = list(ult_por_perg.values())
        resp = []
        for r in rs:
            q = cad.get(str(r[ix["PERGUNTA_ID"]]))
            if not q or q[px["CHECK"]] in GRUPOS_IGNORADOS:
                continue
            qid = str(q[px["ID"]])
            if qid not in qidx:
                qidx[qid] = len(perguntas)
                perguntas.append([chk, str(q[px["CHECK"]]).replace("MTE| ", ""), int(q[px["ORDEM"]] or 0), str(q[px["PERGUNTA"]]).strip()])
            a = r[ix["RESPOSTA"]]
            code = 0 if a == "OK" else 1 if a == "NOK" else 2 if a == "N/A" else 3
            o = (r[ix["OBSERVACAO"]] or "").strip()
            oi = -1
            if o:
                if o not in oidx:
                    oidx[o] = len(obs); obs.append(o)
                oi = oidx[o]
            resp.append([qidx[qid], code, oi])
        if not resp:
            continue
        chave_aud = (chk, u, per)
        atual = porunid.get(chave_aud)
        pref = AUDITORIA_PREFERIDA.get((u, per))
        if pref:                                # lançamento escolhido manualmente para este semestre
            if d.strftime("%d/%m/%Y") == pref or not atual:
                if not atual or atual[0].strftime("%d/%m/%Y") != pref:
                    porunid[chave_aud] = (d, resp)
        elif not atual or d > atual[0]:        # se houver duas auditorias no mesmo semestre, vale a mais recente
            porunid[chave_aud] = (d, resp)
    auditorias = [[chk, u, per, d.strftime("%d/%m/%Y"), resp] for (chk, u, per), (d, resp) in sorted(porunid.items(), key=lambda x: x[0])]
    if nao_ligadas:
        notas.append("Checklist: auditorias de unidades que não constam na Matriz foram ignoradas: " + ", ".join(sorted(nao_ligadas)) + ".")
    if duplicadas[0]:
        notas.append(f"Checklist: {duplicadas[0]} respostas duplicadas (mesma pergunta gravada mais de uma vez na mesma auditoria) foram descartadas — vale a mais recente.")
    if sem_hist:
        notas.append(f"Checklist: {sem_hist} respostas sem auditoria/semestre identificável na aba HISTORICO foram ignoradas.")
    notas.append("Checklist: % conforme por pergunta calculado com as respostas do app — no Check MTE, N/A conta como OK [(OK + N/A) ÷ total]; no Ambiental, OK ÷ (OK + NOK). Os percentuais oficiais dos indicadores continuam vindo da Matriz.")
    print(f"checklist: {len(perguntas)} perguntas, {len(auditorias)} auditorias, {len(obs)} observações distintas")
    return {"q": perguntas, "a": auditorias, "o": obs}, notas


def main():
    dados = carregar()
    ck, notas_ck = carregar_checklist(sorted({r[0] for r in dados["recs"]}))
    dados["chk"] = ck
    dados["notes"].extend(notas_ck)
    core = open(os.path.join(AQUI, "templates", "core.js"), encoding="utf-8").read()
    js_dados = "window.__DATA__=" + json.dumps(dados, ensure_ascii=False) + ";"
    for nome in ["modelo1_panorama_executivo", "modelo2_centro_de_comando", "modelo3_raio_x_unidades"]:
        tpl = open(os.path.join(AQUI, "templates", nome + ".html"), encoding="utf-8").read()
        html = tpl.replace("/*__DATA__*/", js_dados).replace("/*__CORE__*/", core)
        open(os.path.join(AQUI, nome + ".html"), "w", encoding="utf-8").write(html)
        print("gerado:", nome + ".html")
    import shutil
    destino, origem = PUBLICAR_PAINEL
    try:
        shutil.copyfile(os.path.join(AQUI, origem), destino)
        print("publicado no OneDrive:", destino)
    except OSError as e:
        print("aviso: não foi possível copiar o painel para o OneDrive:", e)
    # cópia na raiz do repositório (é o arquivo publicado no GitHub)
    shutil.copyfile(os.path.join(AQUI, origem), os.path.join(os.path.dirname(AQUI), "index.html"))
    print("index.html atualizado na raiz do repositório")
    print(f"{len(dados['recs'])} auditorias · {len(dados['notes'])} notas")
    for n in dados["notes"]:
        print("  -", n)


if __name__ == "__main__":
    main()
