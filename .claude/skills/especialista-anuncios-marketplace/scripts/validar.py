"""Valida a planilha de importação do Anymarket gerada pela skill especialista-anuncios-marketplace.

Uso: python3 validar.py <planilha.xlsx>
Confere título (<= 60, sem código/parênteses/promoção), descrição (>= 200 palavras, sem link/telefone)
e ficha técnica (mínimo de características). Imprime os problemas e sai com código 1 se houver algum.
"""
import re
import sys

import openpyxl

PROIBIDAS = re.compile(r'(?i)\b(promo[cç][aã]o|oferta|frete gr[aá]tis|barato|melhor pre[cç]o)\b')
LINK = re.compile(r'(?i)(https?://|www\.|@\w+\.\w|\(\d{2}\)\s?\d{4})')


def main(path):
    ws = openpyxl.load_workbook(path, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = {h: i for i, h in enumerate(rows[0]) if h}
    problemas = []
    for n, r in enumerate(rows[1:], start=2):
        sku = r[head['CÓDIGO FORNECEDOR / SKU INTERNO']]
        tit = str(r[head['TÍTULO']] or '')
        if len(tit) > 60:
            problemas.append((n, sku, 'título com %d caracteres' % len(tit)))
        if re.search(r'\(|\)|\d{3}\.\d{3}', tit):
            problemas.append((n, sku, 'título com código/parênteses'))
        if PROIBIDAS.search(tit):
            problemas.append((n, sku, 'título com palavra proibida'))
        desc = re.sub(r'<[^>]+>', ' ', str(r[head['DESCRICAO TÉCNICA']] or ''))
        if len(desc.split()) < 200:
            problemas.append((n, sku, 'descrição com %d palavras' % len(desc.split())))
        if LINK.search(desc):
            problemas.append((n, sku, 'descrição com link/contato'))
        fichas = sum(1 for i in range(head['NOME 1'], len(r) - 1, 2) if r[i] and r[i + 1] not in (None, ''))
        if fichas < 8:
            problemas.append((n, sku, 'ficha técnica com %d características' % fichas))
    for p in problemas:
        print('linha %d | %s | %s' % p)
    print('%d problema(s) em %d linha(s)' % (len(problemas), len(rows) - 1))
    return 1 if problemas else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
