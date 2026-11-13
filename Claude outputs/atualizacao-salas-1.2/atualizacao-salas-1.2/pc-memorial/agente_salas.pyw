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

VERSAO = '1.2.0'
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
ESPERA_NA_API_S = 20         # conexão em espera: o pedido chega na hora (a API segura a pergunta até 20 s)
STATUS_A_CADA_S = 30
VARREDURA_A_CADA_S = 120     # procura TVs que trocaram de IP (depois de queda de energia o roteador troca os IPs)

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


def adb(args, timeout=8, binario=False, _tentar_de_novo=True):
    try:
        p = subprocess.run([ADB] + list(args), capture_output=True, timeout=timeout, creationflags=SEM_JANELA)
    except subprocess.TimeoutExpired:
        return b'' if binario else 'TEMPO_ESGOTADO'
    except OSError as e:
        return b'' if binario else 'ERRO_ADB ' + str(e)
    if binario:
        return p.stdout
    saida = (p.stdout + p.stderr).decode('utf-8', 'replace').strip()
    if _tentar_de_novo and re.search(r'daemon not running|cannot connect to daemon|failed to start daemon', saida):
        try:
            subprocess.run([ADB, 'start-server'], capture_output=True, timeout=20, creationflags=SEM_JANELA)
        except (OSError, subprocess.TimeoutExpired):
            return saida
        return adb(args, timeout, binario, _tentar_de_novo=False)
    return saida


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


def ips_locais():
    """IPv4 deste PC (pode ter cabo e Wi-Fi): o sinal de ligar sai por todas as placas de rede."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    m = meu_ip()
    if m:
        ips.add(m)
    return sorted(i for i in ips if not i.startswith('127.') and not i.startswith('169.254.'))


def enviar_wol(mac, ip='', rajadas=1):
    """Wake-on-LAN reforçado: "pacote mágico" (6x FF + 16x o MAC) por todas as placas de rede do PC,
    para a rede inteira, para a faixa da TV e direto para o último IP dela, nas portas 9 e 7."""
    bytes_mac = bytes.fromhex(re.sub(r'[^0-9a-fA-F]', '', mac or ''))
    if len(bytes_mac) != 6:
        return
    pacote = b'\xff' * 6 + bytes_mac * 16
    destinos = {'255.255.255.255'}
    if re.fullmatch(r'\d+\.\d+\.\d+\.\d+', ip or ''):
        destinos.add(ip.rsplit('.', 1)[0] + '.255')
        destinos.add(ip)
    locais = ips_locais() or ['']
    for local in locais:
        if local:
            destinos.add(local.rsplit('.', 1)[0] + '.255')
    for local in locais:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            if local:
                try:
                    s.bind((local, 0))
                except OSError:
                    pass
            for _ in range(max(1, rajadas)):
                for d in destinos:
                    for porta in (9, 7):
                        for _ in range(2):
                            try:
                                s.sendto(pacote, (d, porta))
                            except OSError:
                                pass
                time.sleep(0.2)
        finally:
            s.close()


def responde_na_rede(ip):
    """A TV está na rede mesmo sem o ADB? (ping ou portas do Google TV/Cast)."""
    if not ip:
        return False
    for porta in (6466, 6467, 8008, 8009, 8443):
        try:
            with socket.create_connection((ip, porta), timeout=0.5):
                return True
        except OSError:
            pass
    cmd = ['ping', '-n', '1', '-w', '800', ip] if os.name == 'nt' else ['ping', '-c', '1', '-W', '1', ip]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=4, creationflags=SEM_JANELA)
        return p.returncode == 0 and b'TTL=' in p.stdout.upper()
    except (OSError, subprocess.TimeoutExpired):
        return False


def garantir_adb(ip, tentativas=3):
    """Conexão ADB pronta para comandos: reconecta (disconnect/connect) se estiver offline ou caída."""
    alvo = f'{ip}:{PORTA}'
    for i in range(tentativas):
        estado = adb(['-s', alvo, 'get-state'], 5)
        if estado.strip() == 'device':
            return 'ok'
        if 'unauthorized' in estado:
            return 'nao_autorizada'
        adb(['disconnect', alvo], 4)
        saida = adb(['connect', alvo], 6)
        if 'unauthorized' in saida:
            return 'nao_autorizada'
        time.sleep(1 + i)
    return 'ok' if adb(['-s', alvo, 'get-state'], 5).strip() == 'device' else 'falhou'


# ---------------------------------------------------------------------------
# Leitura e comandos das TVs
# ---------------------------------------------------------------------------
RE_VOL = re.compile(r'volume is (\d+) in range \[(\d+)\.\.(\d+)\]')


_volume_pelo_relatorio = set()   # TVs (IP) que só informam o volume pelo relatório de áudio (TCL)


def ler_volume(ip):
    if ip not in _volume_pelo_relatorio:
        for cmd in (('cmd', 'media_session', 'volume', '--stream', '3', '--get'), ('media', 'volume', '--stream', '3', '--get')):
            m = RE_VOL.search(shell(ip, *cmd, timeout=4))
            if m:
                return int(m.group(1)), int(m.group(3))
    # TCL: lê do relatório de áudio, filtrando DENTRO da TV (o relatório inteiro é grande e lento).
    d = shell(ip, 'dumpsys audio | grep -A16 "STREAM_MUSIC:"', timeout=6)
    if '- STREAM_MUSIC:' not in d:
        d = shell(ip, 'dumpsys', 'audio', timeout=8)
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
            _volume_pelo_relatorio.add(ip)
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
    """True = acesa, False = apagada, None = não deu para saber. Filtra o relatório dentro da TV (rápido)."""
    m = re.search(r'mWakefulness=(\w+)', shell(ip, 'dumpsys power | grep mWakefulness=', timeout=5))
    if m:
        return m.group(1) == 'Awake'
    m = re.search(r'mScreenState=(\w+)', shell(ip, 'dumpsys display | grep mScreenState=', timeout=5))
    if m:
        return m.group(1) == 'ON'
    return None


def _esperar_tela(ip, quer, segundos=4):
    """Confere a cada ~0,4 s e segue assim que a TV responde (sem espera fixa)."""
    fim = time.time() + segundos
    while time.time() < fim:
        time.sleep(0.4)
        if tela_acesa(ip) is quer:
            return True
    return False


def acender_tela(ip):
    """Acende a tela tentando teclas diferentes, conferindo depois de cada uma.
    POWER e TV_POWER alternam liga/desliga: só são usadas quando a TV confirmou que está apagada."""
    if tela_acesa(ip):
        return True
    for tecla in ('KEYCODE_WAKEUP', 'KEYCODE_POWER', 'KEYCODE_TV_POWER', 'KEYCODE_WAKEUP'):
        estado = tela_acesa(ip)
        if estado:
            return True
        if estado is None and tecla != 'KEYCODE_WAKEUP':
            continue
        shell(ip, 'input', 'keyevent', tecla, timeout=5)
        if _esperar_tela(ip, True):
            return True
    return tela_acesa(ip) is None   # sem como conferir: considera que acendeu


def apagar_tela(ip):
    """Desliga (espera) conferindo; mesma regra das teclas que alternam."""
    if tela_acesa(ip) is False:
        return True
    for tecla in ('KEYCODE_SLEEP', 'KEYCODE_POWER', 'KEYCODE_TV_POWER', 'KEYCODE_SLEEP'):
        estado = tela_acesa(ip)
        if estado is False:
            return True
        if estado is None and tecla != 'KEYCODE_SLEEP':
            continue
        shell(ip, 'input', 'keyevent', tecla, timeout=5)
        if _esperar_tela(ip, False):
            return True
        if not porta_aberta(ip):   # algumas TVs saem da rede ao desligar: é sinal de que desligou
            return True
    return tela_acesa(ip) is None


_ja_ajustadas = set()


def manter_sempre_ligada(ip, nome):
    """Painel/TV de sala não pode apagar sozinho: tira o tempo de tela, a suspensão e o protetor de tela
    do Android (uma vez por TV a cada vez que o programa abre). Não impede o Desligar."""
    if nome in _ja_ajustadas:
        return
    for cmd in (('settings', 'put', 'system', 'screen_off_timeout', '2147483647'),
                ('settings', 'put', 'secure', 'sleep_timeout', '0'),
                ('settings', 'put', 'secure', 'screensaver_enabled', '0'),
                ('settings', 'put', 'secure', 'screensaver_activate_on_sleep', '0'),
                ('settings', 'put', 'global', 'stay_on_while_plugged_in', '7')):
        shell(ip, *cmd, timeout=5)
    _ja_ajustadas.add(nome)


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


def app_na_frente(ip):
    """Pacote do app que está na tela ('' se não deu para saber)."""
    s = shell(ip, 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"', timeout=5)
    m = (re.search(r'mCurrentFocus=Window\{[^}]*?\s([\w.]+)/', s)
         or re.search(r'mFocusedApp=.*?\s([\w.]+)/', s))
    return m.group(1) if m else ''


_pacote_por_ip = {}


def pacote_tvbro(ip):
    if _pacote_por_ip.get(ip):
        return _pacote_por_ip[ip]
    lista = shell(ip, 'pm', 'list', 'packages', timeout=6)
    pac = PACOTE_TVBRO if 'package:' + PACOTE_TVBRO in lista else ''
    if not pac:
        m = re.search(r'package:(\S*(?:tvbro|tvwebbrowser)\S*)', lista)
        pac = m.group(1) if m else ''
    if pac:
        _pacote_por_ip[ip] = pac
    return pac


PAGINAS_PADRAO = {
    'SALA 01': 'https://planoassistencialintegrado.com.br/mensagens-tv/',
    'SALA 02': 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-02/',
    'SALA 03': 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-03/',
    'PAINEL 01': 'https://planoassistencialintegrado.com.br/painel-01/',
    'PAINEL 02': 'https://planoassistencialintegrado.com.br/painel-02/',
    'PAINEL 03': 'https://planoassistencialintegrado.com.br/painel-03/',
}


def url_da_tv(nome):
    """Endereço da página de cada TV: tvs.json desta pasta (criado na 1ª vez com os endereços padrão)."""
    arq = os.path.join(PASTA, 'tvs.json')
    if not os.path.isfile(arq):
        gravar_json(arq, PAGINAS_PADRAO)
    paginas = {str(k).upper().strip(): str(v).strip() for k, v in ler_json(arq).items()}
    url = paginas.get((nome or '').upper().strip()) or PAGINAS_PADRAO.get((nome or '').upper().strip(), '')
    return url if url.startswith('https://') or url.startswith('http://') else ''


def esperar_pronta(ip, segundos=75):
    """Depois de acordar/reiniciar (queda de energia = logo do Android), espera o Android terminar de iniciar."""
    fim = time.time() + segundos
    while time.time() < fim:
        if shell(ip, 'getprop', 'sys.boot_completed', timeout=4).strip() == '1':
            return True
        time.sleep(0.5)
    return False


def esperar_na_frente(ip, pac, segundos=8):
    """Confere a cada ~0,5 s se o app ficou na tela."""
    fim = time.time() + segundos
    sem_resposta = 0
    while time.time() < fim:
        frente = app_na_frente(ip)
        if frente == pac:
            return True
        if frente == '':
            sem_resposta += 1
            if sem_resposta >= 3:      # a TV não informa o app da frente: não dá para conferir
                return True
        time.sleep(0.5)
    return False


def abrir_tvbro(ip, nome=''):
    """Fecha o TV Bro à força e abre a URL certa da TV (tvs.json); confere se ficou na tela.
    Fechar antes evita o TV Bro voltar travado na página que estava carregando (tela branca)."""
    pac = pacote_tvbro(ip)
    if not pac:
        return False
    url = url_da_tv(nome)
    if url:
        u = url.replace("'", '')
        saida = shell(ip, f"am force-stop {pac}; am start -a android.intent.action.VIEW -d '{u}' -p {pac}", timeout=12)
        if re.search(r'Error|unable to resolve', saida):
            saida = shell(ip, f"am start -a android.intent.action.VIEW -d '{u}'", timeout=10)
            if 'Error' in saida:
                return False
    else:
        saida = shell(ip, 'monkey', '-p', pac, '-c', 'android.intent.category.LAUNCHER', '1', timeout=10)
        if re.search(r'No activities found|aborted', saida) or falhou(saida):
            return False
    return esperar_na_frente(ip, pac)


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
        # ligada | tela_apagada | desligada | sem_controle | nao_autorizada | desconhecida
        self.estado = 'desconhecida'
        self.volume = None
        self.volume_max = None
        self.print_png = None
        self.print_hora = 0

    def conferir(self):
        """Atualiza o estado (roda numa thread)."""
        if not self.ip or not porta_aberta(self.ip):
            # Sem ADB: a TV pode estar ligada na rede com a depuração desligada (comum na TCL depois de queda de energia).
            if self.ip and self.mac and responde_na_rede(self.ip) and mac_pela_rede(self.ip) == self.mac:
                self.estado = 'sem_controle'
            else:
                self.estado = 'desligada'
            return
        if garantir_adb(self.ip, tentativas=2) == 'nao_autorizada':
            self.estado = 'nao_autorizada'
            return
        # Nome e tela numa chamada só (mais rápido).
        saida = shell(self.ip, 'settings get global device_name; dumpsys power | grep mWakefulness=', timeout=6)
        if 'unauthorized' in saida:
            self.estado = 'nao_autorizada'
            return
        linhas = [l.strip() for l in saida.splitlines() if l.strip()]
        nome = '' if falhou(saida) or not linhas else linhas[0].upper()
        if nome in ('', 'NULL') and not falhou(saida):
            nome = shell(self.ip, 'getprop', 'ro.product.model', timeout=4).strip().upper()
        m = re.search(r'mWakefulness=(\w+)', saida)
        if nome and nome != self.nome:
            # O IP agora é de outra TV (o roteador troca os IPs): esta precisa ser procurada de novo.
            self.ip = ''
            self.estado = 'desligada'
            return
        if not nome:
            self.estado = 'sem_controle' if responde_na_rede(self.ip) else 'desligada'
            return
        acesa = (m.group(1) == 'Awake') if m else tela_acesa(self.ip)
        self.estado = 'tela_apagada' if acesa is False else 'ligada'
        if not self.mac:
            self.mac = mac_pela_rede(self.ip)
        if self.estado == 'ligada':
            self.volume, self.volume_max = ler_volume(self.ip)


MSG_SEM_CONTROLE = ('está na rede, mas a depuração (ADB) não responde: ative de novo em Opções do desenvolvedor '
                    '(a TCL costuma desligar depois de queda de energia)')


def ligar_tv(tv, avisar):
    """Liga a TV em camadas, conferindo cada passo: sinal de rede (WoL reforçado) → reconexão do ADB →
    acender a tela (WAKEUP/POWER/TV_POWER) → manter sempre ligada → TV Bro na frente. Devolve (ok, mensagem)."""
    if not tv.ip or not porta_aberta(tv.ip):
        if not tv.mac:
            return False, 'sem o endereço físico (MAC): ligue pelo controle uma vez com o agente rodando'
        avisar('ligando pela rede…')
        inicio, ultimo_envio, ultima_busca = time.time(), 0, time.time()
        while time.time() - inicio < 120:
            if time.time() - ultimo_envio > 6:
                enviar_wol(tv.mac, tv.ip, rajadas=2)
                ultimo_envio = time.time()
            if time.time() - ultima_busca > 25:
                # Pode ter voltado com outro IP: procura na rede pelo MAC ou pelo nome.
                ultima_busca = time.time()
                for outro in procurar_ips(base_rede(tv.ip)):
                    if mac_pela_rede(outro) == tv.mac or nome_da_tv(outro) == tv.nome:
                        tv.ip = outro
                        break
            if tv.ip and porta_aberta(tv.ip):
                break
            time.sleep(1)
        else:
            if responde_na_rede(tv.ip) and mac_pela_rede(tv.ip) == tv.mac:
                tv.estado = 'sem_controle'
                return False, MSG_SEM_CONTROLE
            return False, 'não acordou pela rede (confira "Ver TV no modo standby" ou ligue pelo controle)'

    avisar('conectando…')
    con = garantir_adb(tv.ip)
    if con == 'nao_autorizada':
        tv.estado = 'nao_autorizada'
        return False, 'falta autorizar este PC na TV ("Sempre permitir")'
    if con != 'ok':
        tv.estado = 'sem_controle'
        return False, MSG_SEM_CONTROLE

    if shell(tv.ip, 'getprop', 'sys.boot_completed', timeout=4).strip() != '1':
        avisar('a TV está iniciando (logo do Android)…')
        esperar_pronta(tv.ip)
    avisar('acendendo a tela…')
    if not acender_tela(tv.ip):
        return False, 'a TV respondeu, mas a tela não acendeu (tentei WAKEUP, POWER e TV_POWER)'
    manter_sempre_ligada(tv.ip, tv.nome)

    avisar('abrindo a página no TV Bro…')
    # Fecha o TV Bro e abre a URL certa; se a TV ainda estiver subindo, tenta de novo (até ~40 s).
    for tentativa in range(6):
        if abrir_tvbro(tv.ip, tv.nome):
            break
        time.sleep(3)
        garantir_adb(tv.ip, tentativas=1)
    else:
        return False, 'ligou, mas o TV Bro não ficou na tela'
    tv.estado = 'ligada'
    return True, 'ligada com a página aberta'


def desligar_tv(tv):
    """Desliga conferindo (SLEEP/POWER/TV_POWER até a TV confirmar que apagou)."""
    if not tv.ip or not porta_aberta(tv.ip):
        if tv.ip and tv.mac and responde_na_rede(tv.ip) and mac_pela_rede(tv.ip) == tv.mac:
            tv.estado = 'sem_controle'
            return False, MSG_SEM_CONTROLE
        tv.estado = 'desligada'
        return True, 'já estava desligada'
    con = garantir_adb(tv.ip)
    if con != 'ok':
        tv.estado = 'nao_autorizada' if con == 'nao_autorizada' else 'sem_controle'
        return False, 'falta autorizar este PC na TV' if con == 'nao_autorizada' else MSG_SEM_CONTROLE
    if not apagar_tela(tv.ip):
        return False, 'mandei desligar, mas a tela continua acesa'
    tv.estado = 'desligada'
    return True, 'desligada'


def atualizar_tv(tv):
    if not tv.ip or tv.estado != 'ligada':
        return False, 'está desligada'
    if garantir_adb(tv.ip) != 'ok':
        return False, MSG_SEM_CONTROLE
    # Fecha o TV Bro e abre a URL do zero (o F5 numa página travada não resolvia).
    for tentativa in range(2):
        if abrir_tvbro(tv.ip, tv.nome):
            return True, 'página reaberta'
        time.sleep(2)
    return False, 'não consegui abrir a página no TV Bro'


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
            if nome in self.tvs and not self.tvs[nome].mac:
                mac = mac_pela_rede(ip)
                if mac:
                    log(f'{nome}: MAC {mac} guardado')
                    self.tvs[nome].mac = mac
        self.ultima_varredura = time.time()

    def conferir_todas(self):
        self.recarregar_conhecidas()
        with self.trava:
            alvo = [t for n, t in self.tvs.items() if n not in self.ocupadas]
        with ThreadPoolExecutor(max_workers=6) as ex:
            list(ex.map(lambda t: t.conferir(), alvo))
        # TV sem IP ou que não respondeu no IP antigo: pode ter voltado com outro IP. Varre a rede pelo nome.
        if any(not t.ip or t.estado == 'desligada' for t in alvo) and time.time() - self.ultima_varredura > VARREDURA_A_CADA_S:
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
                # TV que não responde no IP guardado pode estar ligada com outro IP: procura antes de mandar o sinal.
                if any(not t.ip or not porta_aberta(t.ip) for t in par):
                    avisar('Painel', 'procurando as TVs na rede…')
                    self.varrer_rede()
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
                msg = {'ligar': 'Sala ligada, página aberta nas duas TVs.', 'desligar': 'Sala desligada.',
                       'atualizar': 'Páginas reabertas nas duas TVs.', 'volume': res[1][1].capitalize() + '.'}.get(acao, 'Feito.')
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
            self.enviar_status_agora(par)

    def enviar_status_agora(self, par=()):
        """Depois de um pedido, confere o par da sala e manda o estado já (sem esperar a próxima conferência)."""
        try:
            for t in par:
                t.conferir()
            r = chamar_api(self.api, self.chave, 'buscar',
                           {'versao': VERSAO, 'maquina': self.maquina, 'status': self.status_para_api(), 'esperar': 0}, timeout=15)
            for cmd in r.get('comandos') or []:
                self.execucao.submit(self.executar, cmd)
        except Exception as e:
            self.ultimo_status = 0   # manda na próxima busca
            log(f'Não consegui mandar o estado logo após o pedido: {e}')

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
            dados = {'versao': VERSAO, 'maquina': self.maquina, 'esperar': ESPERA_NA_API_S}
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
            elif conferencia is not None:
                dados['esperar'] = 3   # a conferência está terminando: volta logo para mandar o estado
            try:
                r = chamar_api(self.api, self.chave, 'buscar', dados, timeout=dados['esperar'] + 15)
                if self.falhas_seguidas:
                    log(f'Conexão com a API de volta (depois de {self.falhas_seguidas} falhas).')
                self.falhas_seguidas = 0
                comandos = r.get('comandos') or []
                for cmd in comandos:
                    self.execucao.submit(self.executar, cmd)
                # Com a conexão em espera, pergunta de novo na hora. Se a API respondeu na hora sem nada
                # (versão antiga do PHP, que não espera), volta ao ritmo de 3 s para não sobrecarregar.
                if comandos or time.time() - inicio >= min(2, dados['esperar']):
                    continue
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
