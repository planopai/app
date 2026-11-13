# -*- coding: utf-8 -*-
"""
AGENTE DAS SALAS DO MEMORIAL - Plano PAI  (roda em segundo plano no PC do Memorial)

Liga o App PAI (celular, de qualquer lugar) às TVs do Memorial:
- a cada 3 s pergunta à API (salas_tv_agente.php) se há pedido (ligar, desligar, atualizar, volume);
- executa nas TVs pela rede local (ADB), do mesmo jeito que o salas_pai.pyw;
- devolve o andamento e o resultado, e a cada ~30 s manda o estado das 6 TVs ("estou vivo").

Só faz conexões de SAÍDA (HTTPS para a API). Nada do Memorial fica aberto para a internet.

Arquivos nesta pasta
- agente.json            endereço da API e a chave do agente (gerado pelo instalar_agente.bat). NÃO compartilhe.
- pai-tv-agente.php      resumo da chave para subir no servidor (/home2/pla48587/). Pode apagar depois de subir.
- salas.json / tvs-conhecidas.json / historico.txt   os mesmos do salas_pai.pyw (pode ser a mesma pasta).
- agente.log             o que o agente fez (até ~1 MB; o antigo vira agente.log.1).

Uso
- Normal: o Agendador de Tarefas do Windows inicia sozinho (instalar_agente.bat).
- Gerar a chave: pythonw agente_salas.pyw --gerar-chave   (o instalar_agente.bat já faz isso)
- Testar a conexão: python agente_salas.pyw --testar
"""
import getpass
import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

VERSAO = '1.0.0'
PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_SALAS = os.path.join(PASTA, 'salas.json')
ARQ_CONHECIDAS = os.path.join(PASTA, 'tvs-conhecidas.json')
ARQ_HISTORICO = os.path.join(PASTA, 'historico.txt')
ARQ_LOG = os.path.join(PASTA, 'agente.log')
ARQ_CONFIG = os.path.join(PASTA, 'agente.json')
ARQ_CHAVE_SERVIDOR = os.path.join(PASTA, 'pai-tv-agente.php')
API_PADRAO = 'https://api.planoassistencialintegrado.com.br/salas_tv_agente.php'
PORTA = 5555
PACOTE_TVBRO = 'com.phlox.tvwebbrowser'
SEM_JANELA = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW
PORTA_TRAVA = 47651          # impede dois agentes ao mesmo tempo no PC
BUSCAR_A_CADA_S = 3
STATUS_A_CADA_S = 30
VARREDURA_A_CADA_S = 600     # procura TVs que trocaram de IP

SALAS_PADRAO = {
    'SALA 01': {'painel': 'PAINEL 01', 'dentro': 'SALA 01'},
    'SALA 02': {'painel': 'PAINEL 02', 'dentro': 'SALA 02'},
    'SALA 03': {'painel': 'PAINEL 03', 'dentro': 'SALA 03'},
}


def registrar_erro(texto):
    try:
        with open(ARQ_LOG, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%d/%m/%Y %H:%M:%S') + '\n' + texto + '\n\n')
    except OSError:
        pass


# ---------------------------------------------------------------------------
# ADB e rede
# ---------------------------------------------------------------------------
def achar_adb():
    for c in (os.environ.get('ADB_PATH', ''), r'C:\adb\adb.exe', os.path.join(PASTA, 'adb.exe'), shutil.which('adb') or ''):
        if c and os.path.isfile(c):
            return c
    return ''


ADB = achar_adb()


def adb(args, timeout=8, binario=False):
    try:
        p = subprocess.run([ADB] + list(args), capture_output=True, timeout=timeout, creationflags=SEM_JANELA)
    except subprocess.TimeoutExpired:
        return b'' if binario else 'TEMPO_ESGOTADO'
    except OSError as e:
        return b'' if binario else 'ERRO_ADB ' + str(e)
    if binario:
        return p.stdout
    return (p.stdout + p.stderr).decode('utf-8', 'replace').strip()


def shell(ip, *cmd, timeout=8):
    return adb(['-s', f'{ip}:{PORTA}', 'shell'] + list(cmd), timeout)


def falhou(saida):
    return bool(re.search(r'TEMPO_ESGOTADO|ERRO_ADB|error:|device offline|unauthorized|not found', saida))


def meu_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))  # não envia nada: só descobre a placa de rede em uso
        return s.getsockname()[0]
    except OSError:
        return ''
    finally:
        s.close()


def base_rede(ip_referencia=''):
    if os.environ.get('CENTRAL_REDE'):
        return os.environ['CENTRAL_REDE']
    ip = ip_referencia or meu_ip()
    return ip.rsplit('.', 1)[0] + '.' if ip else ''


def porta_aberta(ip, tempo=0.8):
    try:
        with socket.create_connection((ip, PORTA), timeout=tempo):
            return True
    except OSError:
        return False


def procurar_ips(base):
    ips = [f'{base}{i}' for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=128) as ex:
        return [ip for ip, ok in zip(ips, ex.map(porta_aberta, ips)) if ok]


RE_MAC = re.compile(r'([0-9a-fA-F]{2}[-:]){5}[0-9a-fA-F]{2}')


def mac_pela_rede(ip):
    """MAC da TV pela tabela ARP do Windows (precisa ter falado com ela agora há pouco)."""
    try:
        p = subprocess.run(['arp', '-a', ip], capture_output=True, timeout=5, creationflags=SEM_JANELA)
    except (OSError, subprocess.TimeoutExpired):
        return ''
    for linha in p.stdout.decode('cp850', 'replace').splitlines():
        if re.search(r'(^|\s)' + re.escape(ip) + r'\s', linha):
            m = RE_MAC.search(linha)
            if m:
                mac = m.group(0).lower().replace(':', '-')
                if mac not in ('ff-ff-ff-ff-ff-ff', '00-00-00-00-00-00'):
                    return mac
    return ''


def enviar_wol(mac, ip=''):
    """Wake-on-LAN: "pacote mágico" (6x FF + 16x o MAC) para a rede inteira."""
    bytes_mac = bytes.fromhex(re.sub(r'[^0-9a-fA-F]', '', mac or ''))
    if len(bytes_mac) != 6:
        return
    pacote = b'\xff' * 6 + bytes_mac * 16
    destinos = ['255.255.255.255'] + ([ip.rsplit('.', 1)[0] + '.255'] if re.fullmatch(r'\d+\.\d+\.\d+\.\d+', ip or '') else [])
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        for d in destinos:
            for porta in (9, 7):
                for _ in range(3):
                    try:
                        s.sendto(pacote, (d, porta))
                    except OSError:
                        pass
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Leitura e comandos das TVs
# ---------------------------------------------------------------------------
RE_VOL = re.compile(r'volume is (\d+) in range \[(\d+)\.\.(\d+)\]')


def ler_volume(ip):
    for cmd in (('cmd', 'media_session', 'volume', '--stream', '3', '--get'), ('media', 'volume', '--stream', '3', '--get')):
        m = RE_VOL.search(shell(ip, *cmd, timeout=4))
        if m:
            return int(m.group(1)), int(m.group(3))
    d = shell(ip, 'dumpsys', 'audio', timeout=6)  # TCL: lê do relatório de áudio
    bloco = re.search(r'- STREAM_MUSIC:(.*?)(?:- STREAM_|\Z)', d, re.S)
    if bloco:
        b = bloco.group(1)
        mx = re.search(r'Max:\s*(\d+)', b)
        at = (re.search(r'streamVolume:\s*(\d+)', b) or re.search(r'Current:[^\r\n]*?\(speaker\):\s*(\d+)', b)
              or re.search(r'Current:[^\r\n]*?\):\s*(\d+)', b))
        if mx and at:
            mx, at = int(mx.group(1)), int(at.group(1))
            if at > mx and at % 10 == 0:
                at //= 10
            return at, mx
    return None, None


def mudar_volume(ip, n):
    saida = shell(ip, 'cmd', 'media_session', 'volume', '--stream', '3', '--set', str(n))
    if re.search(r'Unknown|Error|not found', saida):
        shell(ip, 'media', 'volume', '--stream', '3', '--set', str(n))
    atual, mx = ler_volume(ip)
    voltas = 0
    while atual is not None and atual != n and voltas < 3:  # TCL ignora o valor direto: aperta Vol+/Vol-
        tecla = '24' if n > atual else '25'
        shell(ip, 'input', 'keyevent', *([tecla] * min(abs(n - atual), 40)), timeout=15)
        atual, mx = ler_volume(ip)
        voltas += 1
    return atual, mx


def tela_acesa(ip):
    m = re.search(r'mWakefulness=(\w+)', shell(ip, 'dumpsys', 'power', timeout=6))
    return (m.group(1) == 'Awake') if m else None


def nome_da_tv(ip):
    """Nome do aparelho (SALA 01, PAINEL 01...). '' se não respondeu; 'NAO_AUTORIZADA' se falta aceitar."""
    adb(['connect', f'{ip}:{PORTA}'], 5)
    nome = shell(ip, 'settings', 'get', 'global', 'device_name', timeout=5)
    if 'unauthorized' in nome:
        return 'NAO_AUTORIZADA'
    if falhou(nome):
        return ''
    if not nome or nome == 'null':
        nome = shell(ip, 'getprop', 'ro.product.model', timeout=4)
    return nome.strip().upper()


def abrir_tvbro(ip):
    lista = shell(ip, 'pm', 'list', 'packages', timeout=6)
    pac = PACOTE_TVBRO if 'package:' + PACOTE_TVBRO in lista else ''
    if not pac:
        m = re.search(r'package:(\S*(?:tvbro|tvwebbrowser)\S*)', lista)
        pac = m.group(1) if m else ''
    if not pac:
        return False
    saida = shell(ip, 'monkey', '-p', pac, '-c', 'android.intent.category.LAUNCHER', '1', timeout=10)
    return not re.search(r'No activities found|aborted', saida) and not falhou(saida)


def tirar_print(ip):
    dados = adb(['-s', f'{ip}:{PORTA}', 'exec-out', 'screencap', '-p'], 15, binario=True)
    i = dados.find(b'\x89PNG', 0, 4096)  # TCL escreve avisos antes da imagem
    return dados[i:] if i >= 0 and len(dados) - i > 100 else None


# ---------------------------------------------------------------------------
# Arquivos
# ---------------------------------------------------------------------------
def ler_json(caminho):
    try:
        with open(caminho, encoding='utf-8-sig') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def gravar_json(caminho, dados):
    try:
        tmp = caminho + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
        os.replace(tmp, caminho)
    except OSError as e:
        registrar_erro(f'Não consegui gravar {caminho}: {e}')


def ler_salas():
    if not os.path.isfile(ARQ_SALAS):
        gravar_json(ARQ_SALAS, SALAS_PADRAO)
    salas = {}
    for nome, par in ler_json(ARQ_SALAS).items():
        if isinstance(par, dict) and par.get('painel') and par.get('dentro'):
            salas[nome.upper().strip()] = {'painel': str(par['painel']).upper().strip(),
                                           'dentro': str(par['dentro']).upper().strip()}
    return salas or SALAS_PADRAO


def registrar_historico(texto):
    try:
        usuario = os.environ.get('USERNAME') or getpass.getuser()
    except Exception:
        usuario = ''
    try:
        with open(ARQ_HISTORICO, 'a', encoding='utf-8') as f:
            f.write(f"{time.strftime('%d/%m/%Y %H:%M')} | {texto} | {socket.gethostname()} {usuario}\n")
    except OSError:
        pass


def ultimas_acoes(n=3):
    try:
        with open(ARQ_HISTORICO, encoding='utf-8') as f:
            linhas = [l.strip() for l in f if l.strip()]
    except OSError:
        return []
    hoje = time.strftime('%d/%m/%Y')
    saida = []
    for l in reversed(linhas[-50:]):
        partes = l.split(' | ')
        if len(partes) >= 2:
            data, hora = (partes[0].split(' ') + [''])[:2]
            saida.append((hora if data == hoje else f'{data[:5]} {hora}', partes[1]))
        if len(saida) >= n:
            break
    return saida


# ---------------------------------------------------------------------------
# Registro das TVs (nome -> ip, mac, estado). Compartilhado entre as threads só por cópia.
# ---------------------------------------------------------------------------
class TV:
    def __init__(self, nome, ip='', mac=''):
        self.nome = nome
        self.ip = ip
        self.mac = mac
        self.estado = 'desconhecida'   # ligada | tela_apagada | desligada | nao_autorizada | desconhecida
        self.volume = None
        self.volume_max = None
        self.print_png = None
        self.print_hora = 0

    def conferir(self):
        """Atualiza o estado (roda numa thread)."""
        if not self.ip or not porta_aberta(self.ip):
            self.estado = 'desligada'
            return
        nome = nome_da_tv(self.ip)
        if nome == 'NAO_AUTORIZADA':
            self.estado = 'nao_autorizada'
            return
        if nome and nome != self.nome:
            # O IP agora é de outra TV (o roteador troca os IPs): esta precisa ser procurada de novo.
            self.ip = ''
            self.estado = 'desligada'
            return
        if not nome:
            self.estado = 'desligada'
            return
        acesa = tela_acesa(self.ip)
        self.estado = 'tela_apagada' if acesa is False else 'ligada'
        if not self.mac:
            self.mac = mac_pela_rede(self.ip)
        if self.estado == 'ligada':
            self.volume, self.volume_max = ler_volume(self.ip)


def ligar_tv(tv, avisar):
    """Liga a TV (pela rede se precisar), acende a tela e abre o TV Bro. Devolve (ok, mensagem)."""
    if not tv.ip or not porta_aberta(tv.ip):
        if not tv.mac:
            return False, 'sem o endereço físico (MAC): ligue pelo controle uma vez'
        avisar('ligando pela rede…')
        inicio, ultimo_envio, ultima_busca = time.time(), 0, time.time()
        while time.time() - inicio < 90:
            if time.time() - ultimo_envio > 15:
                enviar_wol(tv.mac, tv.ip)
                ultimo_envio = time.time()
            if time.time() - ultima_busca > 25:
                # Pode ter voltado com outro IP: procura na rede quem tem esse MAC.
                ultima_busca = time.time()
                for outro in procurar_ips(base_rede(tv.ip)):
                    if mac_pela_rede(outro) == tv.mac:
                        tv.ip = outro
                        break
            if tv.ip and porta_aberta(tv.ip):
                break
            time.sleep(3)
        else:
            return False, 'não respondeu (confira "Ver TV no modo standby" ou ligue pelo controle)'
        time.sleep(3)
    avisar('acendendo a tela…')
    adb(['connect', f'{tv.ip}:{PORTA}'], 5)
    shell(tv.ip, 'input', 'keyevent', 'KEYCODE_WAKEUP', timeout=5)
    time.sleep(1.5)
    if tela_acesa(tv.ip) is False:
        shell(tv.ip, 'input', 'keyevent', 'KEYCODE_POWER', timeout=5)  # TCL que ignora o WAKEUP
        time.sleep(2)
    avisar('abrindo o TV Bro…')
    time.sleep(2)
    if not abrir_tvbro(tv.ip):
        time.sleep(4)
        if not abrir_tvbro(tv.ip):
            return False, 'ligou, mas não consegui abrir o TV Bro'
    tv.estado = 'ligada'
    return True, 'ligada com TV Bro aberto'


def desligar_tv(tv):
    if not tv.ip or not porta_aberta(tv.ip):
        tv.estado = 'desligada'
        return True, 'já estava desligada'
    saida = shell(tv.ip, 'input', 'keyevent', 'KEYCODE_SLEEP', timeout=6)
    if falhou(saida):
        return False, 'não respondeu'
    tv.estado = 'desligada'
    return True, 'desligada'


def atualizar_tv(tv):
    if not tv.ip or tv.estado != 'ligada':
        return False, 'está desligada'
    if not abrir_tvbro(tv.ip):
        return False, 'não consegui abrir o TV Bro'
    time.sleep(2.5)
    shell(tv.ip, 'input', 'keyevent', 'KEYCODE_F5')
    return True, 'página recarregada'


# ---------------------------------------------------------------------------
# Log
# ---------------------------------------------------------------------------
_trava_log = threading.Lock()


def log(texto):
    linha = f"{time.strftime('%d/%m/%Y %H:%M:%S')}  {texto}\n"
    with _trava_log:
        try:
            if os.path.isfile(ARQ_LOG) and os.path.getsize(ARQ_LOG) > 1_000_000:
                os.replace(ARQ_LOG, ARQ_LOG + '.1')
            with open(ARQ_LOG, 'a', encoding='utf-8') as f:
                f.write(linha)
        except OSError:
            pass
    if sys.stdout and not sys.executable.lower().endswith('pythonw.exe'):
        try:
            print(linha, end='')
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Chave e configuração
# ---------------------------------------------------------------------------
def gerar_chave():
    """Cria a chave do agente (fica só neste PC) e o arquivo com o resumo para o servidor."""
    cfg = ler_json(ARQ_CONFIG)
    if cfg.get('chave'):
        chave = cfg['chave']
        nova = False
    else:
        chave = secrets.token_urlsafe(48)
        nova = True
    cfg = {'api': cfg.get('api') or API_PADRAO, 'chave': chave}
    gravar_json(ARQ_CONFIG, cfg)
    resumo = hashlib.sha256(chave.encode('utf-8')).hexdigest()
    with open(ARQ_CHAVE_SERVIDOR, 'w', encoding='utf-8', newline='\n') as f:
        f.write("<?php\n"
                f"// Chave do agente das Salas do Memorial (gerada em {time.strftime('%d/%m/%Y %H:%M')} no PC {socket.gethostname()}).\n"
                "// Só o resumo SHA-256: a chave fica no PC. Coloque em /home2/pla48587/pai-tv-agente.php\n"
                f"return ['token_sha256' => '{resumo}'];\n")
    return nova


def ler_config():
    cfg = ler_json(ARQ_CONFIG)
    if not cfg.get('chave'):
        raise RuntimeError('agente.json sem chave: rode o instalar_agente.bat')
    return cfg.get('api') or API_PADRAO, cfg['chave']


class ErroApi(Exception):
    pass


def chamar_api(api, chave, acao, dados, timeout=20):
    corpo = json.dumps(dados, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(f'{api}?action={acao}', data=corpo, method='POST', headers={
        'Content-Type': 'application/json; charset=utf-8',
        'X-Agente-Chave': chave,
        'User-Agent': f'PAI-AgenteSalas/{VERSAO}',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            resposta = json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode('utf-8')).get('msg', '')
        except Exception:
            msg = ''
        raise ErroApi(f'HTTP {e.code} {msg}'.strip())
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, ValueError) as e:
        raise ErroApi(str(getattr(e, 'reason', e)))
    if resposta.get('erro'):
        raise ErroApi(resposta.get('msg') or 'erro da API')
    return resposta


# ---------------------------------------------------------------------------
# Agente
# ---------------------------------------------------------------------------
NOMES_ACAO = {'ligar': 'Ligar', 'desligar': 'Desligar', 'atualizar': 'Atualizar telas', 'volume': 'Volume'}


class Agente:
    def __init__(self):
        self.api, self.chave = ler_config()
        self.salas = ler_salas()
        conh = ler_json(ARQ_CONHECIDAS)
        self.tvs = {}
        for par in self.salas.values():
            for nome in par.values():
                c = conh.get(nome) if isinstance(conh.get(nome), dict) else {}
                self.tvs[nome] = TV(nome, str(c.get('ip', '')), str(c.get('mac', '')))
        self.ocupadas = set()                 # TVs com pedido em execução (não conferir no meio)
        self.trava = threading.Lock()
        self.execucao = ThreadPoolExecutor(max_workers=3)   # um pedido por sala ao mesmo tempo
        self.ultimo_status = 0
        self.ultima_varredura = 0
        self.falhas_seguidas = 0
        self.maquina = socket.gethostname()

    # -- estado das TVs ------------------------------------------------------
    def recarregar_conhecidas(self):
        """O salas_pai.pyw (janela) também grava tvs-conhecidas.json: aproveita IP/MAC novos dele."""
        conh = ler_json(ARQ_CONHECIDAS)
        for nome, tv in self.tvs.items():
            c = conh.get(nome)
            if isinstance(c, dict):
                if not tv.mac and c.get('mac'):
                    tv.mac = str(c['mac'])
                if not tv.ip and c.get('ip'):
                    tv.ip = str(c['ip'])

    def salvar_conhecidas(self):
        conh = ler_json(ARQ_CONHECIDAS)
        agora = time.strftime('%d/%m/%Y %H:%M')
        mudou = False
        for tv in self.tvs.values():
            if tv.ip and tv.estado in ('ligada', 'tela_apagada'):
                antes = conh.get(tv.nome) if isinstance(conh.get(tv.nome), dict) else {}
                novo = {**antes, 'ip': tv.ip, 'mac': tv.mac or antes.get('mac', ''), 'visto': agora}
                if novo.get('ip') != antes.get('ip') or novo.get('mac') != antes.get('mac'):
                    mudou = True
                conh[tv.nome] = novo
        if mudou:
            gravar_json(ARQ_CONHECIDAS, conh)

    def varrer_rede(self):
        """Acha cada TV pelo nome (o IP muda, o nome não)."""
        base = base_rede()
        if not base:
            log('Sem rede local.')
            return
        ips = procurar_ips(base)
        with ThreadPoolExecutor(max_workers=8) as ex:
            nomes = dict(zip(ips, ex.map(nome_da_tv, ips)))
        with self.trava:
            ocupadas = set(self.ocupadas)
        for ip, nome in nomes.items():
            if nome in self.tvs and nome not in ocupadas and self.tvs[nome].ip != ip:
                log(f'{nome} encontrada em {ip}')
                self.tvs[nome].ip = ip
        self.ultima_varredura = time.time()

    def conferir_todas(self):
        self.recarregar_conhecidas()
        with self.trava:
            alvo = [t for n, t in self.tvs.items() if n not in self.ocupadas]
        with ThreadPoolExecutor(max_workers=6) as ex:
            list(ex.map(lambda t: t.conferir(), alvo))
        if any(not t.ip for t in alvo) and time.time() - self.ultima_varredura > VARREDURA_A_CADA_S:
            self.varrer_rede()
            with ThreadPoolExecutor(max_workers=6) as ex:
                list(ex.map(lambda t: t.conferir(), [t for t in alvo if t.ip]))
        self.salvar_conhecidas()

    def status_para_api(self):
        return [{'tv': t.nome, 'estado': t.estado, 'volume': t.volume, 'volume_max': t.volume_max}
                for t in self.tvs.values()]

    # -- pedidos -------------------------------------------------------------
    def enviar_resultado(self, cid, final, msg, ok=False):
        for tentativa in range(4 if final else 1):
            try:
                chamar_api(self.api, self.chave, 'resultado', {'id': cid, 'final': final, 'ok': ok, 'msg': msg}, timeout=15)
                return
            except ErroApi as e:
                if not final:
                    return
                log(f'Pedido {cid}: falha ao enviar o resultado ({e}); tentando de novo')
                time.sleep(3 * (tentativa + 1))

    def executar(self, cmd):
        cid, sala, acao = cmd['id'], cmd['sala'], cmd['acao']
        par_nomes = cmd.get('tvs') or self.salas.get(sala)
        if not par_nomes or par_nomes.get('painel') not in self.tvs or par_nomes.get('dentro') not in self.tvs:
            self.enviar_resultado(cid, True, f'{sala} não está no salas.json deste PC.')
            return
        par = [self.tvs[par_nomes['painel']], self.tvs[par_nomes['dentro']]]
        rotulos = ['Painel', 'TV de dentro']
        with self.trava:
            self.ocupadas.update(t.nome for t in par)
        log(f'Pedido {cid}: {NOMES_ACAO.get(acao, acao)} {sala}' + (f' ({cmd.get("valor")})' if acao == 'volume' else ''))
        andamento = {r: '' for r in rotulos}
        ultimo_aviso = [0.0]
        trava_aviso = threading.Lock()

        def avisar(rotulo, txt):
            with trava_aviso:
                andamento[rotulo] = txt
                texto = ' · '.join(f'{r}: {t}' for r, t in andamento.items() if t)
                if time.time() - ultimo_aviso[0] < 1.5:
                    return
                ultimo_aviso[0] = time.time()
            self.enviar_resultado(cid, False, texto)

        try:
            if acao in ('atualizar', 'volume', 'desligar'):
                for t in par:
                    t.conferir()
            if acao == 'ligar':
                with ThreadPoolExecutor(max_workers=2) as ex:
                    res = list(ex.map(lambda i: ligar_tv(par[i], lambda t: avisar(rotulos[i], t)), range(2)))
            elif acao == 'desligar':
                res = [desligar_tv(t) for t in par]
            elif acao == 'atualizar':
                with ThreadPoolExecutor(max_workers=2) as ex:
                    res = list(ex.map(atualizar_tv, par))
            elif acao == 'volume':
                dentro = par[1]
                if dentro.estado != 'ligada':
                    res = [(True, ''), (False, 'está desligada')]
                else:
                    dentro.volume, dentro.volume_max = mudar_volume(dentro.ip, int(cmd.get('valor') or 0))
                    res = [(True, ''), (True, f'volume {dentro.volume}')]
            else:
                res = [(False, 'ação desconhecida'), (False, 'ação desconhecida')]

            falhas = [f'{r}: {m}' for r, (ok, m) in zip(rotulos, res) if not ok]
            if falhas:
                msg = ' · '.join(falhas) + '. Se continuar, use o controle e avise o suporte.'
                registrar_historico(f'{sala}: {NOMES_ACAO.get(acao, acao).lower()} pelo app com problema ({"; ".join(falhas)})')
                self.enviar_resultado(cid, True, msg, ok=False)
                log(f'Pedido {cid}: problema - {msg}')
            else:
                msg = {'ligar': 'Sala ligada, TV Bro aberto nas duas TVs.', 'desligar': 'Sala desligada.',
                       'atualizar': 'Telas atualizadas.', 'volume': res[1][1].capitalize() + '.'}.get(acao, 'Feito.')
                if acao != 'volume':
                    registrar_historico(f'{sala} {"ligada" if acao == "ligar" else "desligada" if acao == "desligar" else "telas atualizadas"} pelo app')
                self.enviar_resultado(cid, True, msg, ok=True)
                log(f'Pedido {cid}: concluído - {msg}')
        except Exception:
            log(f'Pedido {cid}: erro inesperado\n{traceback.format_exc()}')
            self.enviar_resultado(cid, True, 'Erro inesperado no agente do Memorial.', ok=False)
        finally:
            with self.trava:
                self.ocupadas.difference_update(t.nome for t in par)
            self.salvar_conhecidas()
            self.ultimo_status = 0   # manda o estado novo na próxima busca

    # -- laço principal ------------------------------------------------------
    def rodar(self):
        log(f'Agente {VERSAO} iniciado no PC {self.maquina}. API: {self.api}')
        adb(['start-server'], 20)
        self.varrer_rede()
        self.conferir_todas()
        conferencia = None
        executor_conf = ThreadPoolExecutor(max_workers=1)
        while True:
            inicio = time.time()
            dados = {'versao': VERSAO, 'maquina': self.maquina}
            # Conferência das TVs em paralelo, para não atrasar a busca de pedidos.
            if conferencia is None and time.time() - self.ultimo_status >= STATUS_A_CADA_S:
                conferencia = executor_conf.submit(self.conferir_todas)
            if conferencia is not None and conferencia.done():
                try:
                    conferencia.result()
                except Exception:
                    log('Erro ao conferir as TVs\n' + traceback.format_exc())
                dados['status'] = self.status_para_api()
                self.ultimo_status = time.time()
                conferencia = None
            try:
                r = chamar_api(self.api, self.chave, 'buscar', dados)
                if self.falhas_seguidas:
                    log(f'Conexão com a API de volta (depois de {self.falhas_seguidas} falhas).')
                self.falhas_seguidas = 0
                for cmd in r.get('comandos') or []:
                    self.execucao.submit(self.executar, cmd)
            except ErroApi as e:
                self.falhas_seguidas += 1
                if 'status' in dados:
                    self.ultimo_status = 0
                if self.falhas_seguidas in (1, 5) or self.falhas_seguidas % 100 == 0:
                    log(f'Sem conexão com a API ({self.falhas_seguidas}x): {e}')
                if 'Chave do agente' in str(e):
                    time.sleep(60)
            espera = BUSCAR_A_CADA_S if self.falhas_seguidas < 5 else 15
            time.sleep(max(0.2, espera - (time.time() - inicio)))


def travar_instancia():
    """Só um agente por PC (o Agendador pode tentar abrir de novo)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', PORTA_TRAVA))
        s.listen(1)
        return s
    except OSError:
        s.close()
        return None


def main():
    args = sys.argv[1:]
    if '--gerar-chave' in args:
        nova = gerar_chave()
        log('Chave do agente ' + ('criada.' if nova else 'já existia (mantida).') + ' Suba o pai-tv-agente.php no servidor.')
        return
    if '--testar' in args:
        api, chave = ler_config()
        try:
            r = chamar_api(api, chave, 'buscar', {'versao': VERSAO, 'maquina': socket.gethostname()})
            print('OK: a API aceitou a chave. Pedidos pendentes:', len(r.get('comandos') or []))
            for cmd in r.get('comandos') or []:
                chamar_api(api, chave, 'resultado', {'id': cmd['id'], 'final': True, 'ok': False,
                                                    'msg': 'Teste do agente: pedido não executado.'})
        except Exception as e:
            print('FALHOU:', e)
        print('ADB:', ADB or 'NÃO ENCONTRADO (coloque em C:\\adb)')
        return
    trava = travar_instancia()
    if trava is None:
        log('Outro agente já está rodando neste PC; este fecha.')
        return
    if not ADB:
        log('adb.exe não encontrado (coloque em C:\\adb). Tentando de novo em 1 min.')
        time.sleep(60)
        sys.exit(2)
    while True:
        try:
            Agente().rodar()
        except Exception:
            log('Erro grave; reiniciando em 30 s\n' + traceback.format_exc())
            time.sleep(30)


if __name__ == '__main__':
    main()
