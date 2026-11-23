"""Gera o pacote de importação da Mango para o aurora_15.php.

Uso: python3 -I mango_pacote.py <pasta_backup> <pasta_saida>
A pasta do backup tem contacts.json, attendances.json, channels.json, users.json, tags.json, sectors.json e
messages.json (ou messages.json.gz). Saída: contatos_NNN, atendimentos_NNN e mensagens_NNN (.ndjson.gz).
Horários da Mango vêm em UTC; o pacote já sai no horário da Bahia (UTC-3).
"""
import gzip, json, os, re, sys
from datetime import datetime, timedelta

ORIGEM, SAIDA = sys.argv[1], sys.argv[2]
os.makedirs(SAIDA, exist_ok=True)


def ler(nome):
    for n in (nome, nome + '.gz'):
        p = os.path.join(ORIGEM, n)
        if os.path.exists(p):
            return json.load(gzip.open(p, 'rt', encoding='utf-8') if n.endswith('.gz') else open(p, encoding='utf-8'))
    return []


def hora(s):
    if not s:
        return None
    s = s.rstrip('Z')[:19]
    try:
        return (datetime.strptime(s, '%Y-%m-%dT%H:%M:%S') - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def telefone(c):
    ident = c.get('identifier') or ''
    if c.get('isGroup') or ident.endswith('@g.us') or ident.endswith('@lid'):
        return ''
    d = re.sub(r'\D', '', ident.split('@')[0] if ident.endswith('@c.us') else (c.get('number') or ''))
    if len(d) in (10, 11):
        d = '55' + d
    return d if d.startswith('55') and len(d) in (12, 13) else ''


canais = {}
for ch in ler('channels.json'):
    desc = (ch.get('description') or '').lower()
    canais[ch['id']] = ('plantao' if 'funer' in desc else 'financeiro' if 'financ' in desc else 'cobranca' if 'cobran' in desc
                        else 'instagram' if 'insta' in desc or 'face' in desc else 'escritorio')
usuarios = {}
for u in ler('users.json'):
    nome = ' '.join((u.get('nickname') or u.get('name') or '').split())
    usuarios[u['id']] = nome[:100]
setores = {s['id']: ' '.join((s.get('description') or '').split())[:60] for s in ler('sectors.json')}

# Etiquetas da Mango -> Conecta (decisão de 21/11/2026). Fora do mapa: descartada.
MAPA = {
    'Comprovante': 'Comprovante', 'Negociação': 'Negociação', 'Fornecedor': 'Fornecedor', 'Reclamação': 'Reclamação',
    'Sócio': 'Sócio', 'Particular': 'Particular', 'Prefeitura': 'Prefeitura', 'Não-Sócio': 'Lead',
    'Plano': 'Novo Plano', 'Vendas': 'Novo Plano', 'Vendas de plano': 'Novo Plano', 'Flex': 'Novo Plano', 'Light': 'Novo Plano', 'Plus': 'Novo Plano',
    'Atendimento': 'Óbito', 'Memorial': 'Óbito', 'Velório Online': 'Óbito', 'Seguradora': 'Óbito',
    'Pagamento': 'Pagamento', 'Financeiro': 'Pagamento', 'Segunda Via': 'Pagamento',
    'Coroas': 'Coroas', 'Natural': 'Coroas', 'Artificial': 'Coroas',
    'Consultas Médicas': 'Benefícios', 'Material Ortopédico': 'Benefícios', 'Clube': 'Benefícios', 'Telemedicina': 'Benefícios',
    'Ambulâncias': 'Benefícios', 'Aluguel': 'Benefícios', 'Empréstimo': 'Benefícios', 'UTI': 'Benefícios', 'Básica': 'Benefícios',
}
tags = {t['id']: MAPA.get((t.get('description') or '').strip()) for t in ler('tags.json')}
uso = {}
contatos_raw = ler('contacts.json')
for c in contatos_raw:
    for t in c.get('tags') or []:
        if tags.get(t):
            uso[tags[t]] = uso.get(tags[t], 0) + 1

tel_do_contato, pessoas = {}, {}
for c in contatos_raw:
    t = telefone(c)
    if not t:
        continue
    tel_do_contato[c['id']] = t
    nome = ' '.join((c.get('name') or c.get('nameFromPlatform') or '').split())[:150]
    p = pessoas.setdefault(t, {'t': t, 'n': '', 'e': set()})
    if len(re.sub(r'[^A-Za-zÀ-ú]', '', nome)) > len(re.sub(r'[^A-Za-zÀ-ú]', '', p['n'])):
        p['n'] = nome
    p['e'].update(tags[x] for x in (c.get('tags') or []) if tags.get(x))


def gravar(prefixo, linhas, tamanho):
    n = 0
    for i in range(0, len(linhas), tamanho):
        n += 1
        with gzip.open(os.path.join(SAIDA, f'{prefixo}_{n:03d}.ndjson.gz'), 'wt', encoding='utf-8') as f:
            for l in linhas[i:i + tamanho]:
                f.write(json.dumps(l, ensure_ascii=False, separators=(',', ':')) + '\n')
    return n


contatos = []
for p in pessoas.values():
    e = sorted(p['e'], key=lambda x: -uso.get(x, 0))[:4]
    contatos.append({'t': p['t'], 'n': p['n'], 'e': e})

atend, atend_ok = [], set()
for a in ler('attendances.json'):
    t = tel_do_contato.get(a.get('contactId'))
    ini = hora(a.get('startedIn') or a.get('createdIn'))
    if not t or not ini:
        continue
    atend_ok.add(a['id'])
    atend.append({'id': a['id'], 't': t, 'num': canais.get(a.get('channelId'), 'escritorio'), 'setor': setores.get(a.get('sectorId')),
                  'por': usuarios.get(a.get('endedUserId')), 'ini': ini, 'fim': hora(a.get('endedIn'))})

TIPOS = {0: 'texto', 1: 'audio', 3: 'imagem', 4: 'video', 5: 'documento', 6: 'figurinha', 7: 'localizacao', 8: 'contato', 12: 'ligacao'}
AUTO = {0: 'Robô', 4: 'Lembrete', 6: 'Mensagem automática', 7: 'Aurora (Mango)'}
msgs, pulos = [], {'sistema': 0, 'apagada': 0, 'sem_telefone': 0, 'vazia': 0, 'tipo': 0}
for m in ler('messages.json'):
    if m.get('systemMessage'):
        pulos['sistema'] += 1; continue
    if m.get('deletedTime'):
        pulos['apagada'] += 1; continue
    t = tel_do_contato.get(m.get('contactId'))
    if not t:
        pulos['sem_telefone'] += 1; continue
    tp = TIPOS.get(m.get('type'))
    if not tp:
        pulos['tipo'] += 1; continue
    tx = (m.get('text') or '').strip()
    if tp == 'texto' and not tx:
        pulos['vazia'] += 1; continue
    em = hora(m.get('messageTime') or m.get('createdIn'))
    if not em:
        pulos['vazia'] += 1; continue
    o = m.get('origin')
    if o == 2:
        au, an = 'c', None
    elif o == 1:
        au, an = 'e', usuarios.get(m.get('userId')) or 'Equipe'
    else:
        au, an = 'a', AUTO.get(o, 'Automática')
    msgs.append({'id': m['id'], 'a': m.get('attendanceId') if m.get('attendanceId') in atend_ok else None, 't': t,
                 'num': canais.get(m.get('channelId'), 'escritorio'), 'au': au, 'an': an, 'tp': tp, 'tx': tx[:20000] or None, 'em': em})
msgs.sort(key=lambda x: x['em'])
atend.sort(key=lambda x: x['ini'])

resumo = {
    'contatos': len(contatos), 'arquivos_contatos': gravar('contatos', contatos, 3000),
    'atendimentos': len(atend), 'arquivos_atendimentos': gravar('atendimentos', atend, 5000),
    'mensagens': len(msgs), 'arquivos_mensagens': gravar('mensagens', msgs, 5000),
    'mensagens_de': msgs[0]['em'] if msgs else None, 'mensagens_ate': msgs[-1]['em'] if msgs else None,
    'puladas': pulos, 'etiquetas': uso, 'gerado_em': datetime.now().strftime('%Y-%m-%d %H:%M'),
}
json.dump(resumo, open(os.path.join(SAIDA, 'resumo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(resumo, ensure_ascii=False, indent=1))
