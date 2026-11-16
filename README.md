# Visitas Demarco – DPO · Painéis

Gerador dos painéis HTML da Matriz de Visitas (Frota, Armazém, Check MTE, Manutenção e Ambiental).

## Como gerar

```
cd dashboards
python gerar_dashboards.py
```

Requisitos: Python 3 com `openpyxl`, acesso à `Matriz Visitas 2025.xlsx` (OneDrive) e à base `BASE_APP_AUDITORIA*.xlsx` (Desktop ou pasta do projeto).

Os HTMLs são gerados em `dashboards/` e funcionam offline. **Eles contêm os dados das auditorias e não são versionados** (ver `.gitignore`).

## Estrutura

- `dashboards/gerar_dashboards.py` — lê as planilhas, trata os dados e monta os painéis.
- `dashboards/templates/` — templates HTML e a biblioteca de gráficos (`core.js`).
- Painel principal: `modelo2_centro_de_comando.html`.

Uso interno.
