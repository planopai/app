# -*- coding: utf-8 -*-
"""
CENTRAL DAS TVs - Plano PAI  (um único arquivo, sem instalar nada além do Python)

Controla pelo PC, via Wi-Fi (ADB, porta 5555), as TVs SALA 01-03 e PAINEL 01-03:
volume, mudo, abrir o TV Bro, abrir/recarregar a página, voltar, início, ligar a tela,
desligar, ligar pela rede, reiniciar e print da tela.

Ligar pela rede: a TV precisa estar com "Ver TV no modo standby" ativado (Configurações >
Rede/Wi-Fi). A Central guarda o endereço físico (MAC) de cada TV enquanto ela está ligada.

Requisitos
- Python 3 para Windows (python.org) - o tkinter já vem junto.
- adb.exe em C:\\adb (ou na mesma pasta deste arquivo, ou no PATH).
- PC no mesmo Wi-Fi das TVs e a TV autorizada ("Sempre permitir deste computador").

Como abrir: dois cliques neste arquivo (.pyw abre sem a janela preta).
Arquivos que ele cria nesta pasta: tvs.json (página de cada TV), tvs-conhecidas.json
(TVs já vistas) e erros.log (só se der algum erro).

Sem essa opção, a TV desligada sai do Wi-Fi e só liga de novo pelo controle.
"""
import base64
import json
import math
import os
import queue
import re
import shutil
import socket
import subprocess
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

import tkinter as tk
from tkinter import messagebox, ttk

PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_PAGINAS = os.path.join(PASTA, 'tvs.json')
ARQ_CONHECIDAS = os.path.join(PASTA, 'tvs-conhecidas.json')
ARQ_LOG = os.path.join(PASTA, 'erros.log')
PORTA = 5555
PACOTE_TVBRO = 'com.phlox.tvwebbrowser'
SEM_JANELA = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW: não pisca janela preta a cada comando

PAGINAS_PADRAO = {
    'SALA 01': 'https://planoassistencialintegrado.com.br/mensagens-tv/',
    'SALA 02': 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-02/',
    'SALA 03': 'https://planoassistencialintegrado.com.br/mensagens-tv-sala-03/',
    'PAINEL 01': 'https://planoassistencialintegrado.com.br/painel-01/',
    'PAINEL 02': 'https://planoassistencialintegrado.com.br/painel-02/',
    'PAINEL 03': 'https://planoassistencialintegrado.com.br/painel-03/',
}

TECLAS = {
    'vol_mais': 'KEYCODE_VOLUME_UP', 'vol_menos': 'KEYCODE_VOLUME_DOWN', 'mudo': 'KEYCODE_VOLUME_MUTE',
    'recarregar': 'KEYCODE_F5', 'voltar': 'KEYCODE_BACK', 'inicio': 'KEYCODE_HOME',
    'ligar': 'KEYCODE_WAKEUP', 'desligar': 'KEYCODE_SLEEP',
}

# Cores do Plano PAI
COR_FUNDO = '#171C2A'
COR_CARD = '#232B3F'
COR_TELA = '#0B1020'
COR_TEXTO = '#FFFFFF'
COR_SUAVE = '#AEB6C8'
COR_AMARELO = '#F2CB3F'
COR_VERDE = '#3FBF7F'
COR_ERRO = '#FF7A7A'
FONTE = 'Segoe UI' if os.name == 'nt' else 'DejaVu Sans'


def registrar_erro(texto):
    try:
        with open(ARQ_LOG, 'a', encoding='utf-8') as f:
            f.write(time.strftime('%d/%m/%Y %H:%M:%S') + '\n' + texto + '\n\n')
    except OSError:
        pass


# ---------------------------------------------------------------------------
# ADB
# ---------------------------------------------------------------------------
def achar_adb():
    candidatos = [os.environ.get('ADB_PATH', ''), r'C:\adb\adb.exe', os.path.join(PASTA, 'adb.exe'),
                  shutil.which('adb') or '']
    for c in candidatos:
        if c and os.path.isfile(c):
            return c
    return ''


ADB = achar_adb()


def adb(args, timeout=8, binario=False):
    """Roda o adb e devolve a saída. Nunca levanta exceção: em falha devolve um texto de erro."""
    try:
        p = subprocess.run([ADB] + list(args), capture_output=True, timeout=timeout, creationflags=SEM_JANELA)
    except subprocess.TimeoutExpired:
        return b'' if binario else 'TEMPO_ESGOTADO'
    except OSError as e:
        return b'' if binario else 'ERRO_ADB ' + str(e)
    if binario:
        return p.stdout
    return (p.stdout + p.stderr).decode('utf-8', 'replace').strip()


def shell(alvo, *cmd, timeout=8):
    return adb(['-s', alvo, 'shell'] + list(cmd), timeout)


def falhou(saida):
    return bool(re.search(r'TEMPO_ESGOTADO|ERRO_ADB|error:|device offline|unauthorized|not found', saida))


# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------
def meu_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))  # não envia nada: só descobre qual placa de rede sai para a internet
        return s.getsockname()[0]
    except OSError:
        return ''
    finally:
        s.close()


def porta_aberta(ip):
    try:
        with socket.create_connection((ip, PORTA), timeout=0.8):
            return True
    except OSError:
        return False


RE_MAC = re.compile(r'([0-9a-fA-F]{2}[-:]){5}[0-9a-fA-F]{2}')


def mac_pela_rede(ip):
    """Lê o endereço físico (MAC) da TV na tabela ARP do Windows (precisa ter falado com ela agora há pouco)."""
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
    bytes_mac = bytes.fromhex(re.sub(r'[^0-9a-fA-F]', '', mac))
    if len(bytes_mac) != 6:
        return False
    pacote = b'\xff' * 6 + bytes_mac * 16
    destinos = ['255.255.255.255']
    if re.fullmatch(r'\d+\.\d+\.\d+\.\d+', ip or ''):
        destinos.append(ip.rsplit('.', 1)[0] + '.255')
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
    return True


def ligar_pela_rede(tv):
    """Manda o pacote mágico e espera a TV voltar ao Wi-Fi (até ~90 s). Devolve os dados novos da TV ou None."""
    ip, mac = tv.get('ip', ''), tv.get('mac', '')
    if not mac:
        return None
    inicio = time.time()
    ultimo_envio = 0
    ultima_varredura = time.time()
    while time.time() - inicio < 90:
        if time.time() - ultimo_envio > 15:
            enviar_wol(mac, ip)
            ultimo_envio = time.time()
        if time.time() - ultima_varredura > 25 and ip:
            # Pode ter voltado com outro IP (o roteador não fixa): procura na rede quem tem esse MAC.
            ultima_varredura = time.time()
            for outro in procurar_ips(ip.rsplit('.', 1)[0] + '.'):
                if outro != ip and mac_pela_rede(outro) == mac:
                    ip = outro
                    break
        if ip and porta_aberta(ip):
            time.sleep(2)
            alvo = f'{ip}:{PORTA}'
            adb(['connect', alvo], 5)
            shell(alvo, 'input', 'keyevent', 'KEYCODE_WAKEUP', timeout=5)  # se só a rede acordou, acende a tela
            time.sleep(1.5)
            novo = ler_tv(ip)
            if novo.get('status') == 'ok' and novo.get('tela') is False:
                shell(alvo, 'input', 'keyevent', 'KEYCODE_POWER', timeout=5)  # TCL que ignora o WAKEUP
                time.sleep(1.5)
                novo = ler_tv(ip)
            if novo.get('status') == 'ok':
                novo['mac'] = mac
                return novo
        time.sleep(3)
    return None


def conferir_tv(tv):
    """Conferência rápida de uma TV conhecida (usada a cada 30 s): devolve os dados atualizados ou None se não mudou."""
    ip = tv.get('ip', '')
    if not ip or tv.get('ligando'):
        return None
    aberta = porta_aberta(ip)
    if tv['status'] == 'ok':
        if not aberta:
            return {**tv, 'status': 'fora_da_rede', 'visto': time.strftime('%d/%m/%Y %H:%M')}
        m = re.search(r'mWakefulness=(\w+)', shell(f'{ip}:{PORTA}', 'dumpsys', 'power', timeout=6))
        tela = (m.group(1) == 'Awake') if m else tv.get('tela')
        return {**tv, 'tela': tela} if tela != tv.get('tela') else None
    if aberta:
        novo = ler_tv(ip)
        if novo.get('status') == 'ok' and novo.get('nome') == tv.get('nome'):
            novo['mac'] = novo.get('mac') or tv.get('mac', '')
            return novo
    return None


def procurar_ips(base):
    ips = [f'{base}{i}' for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=128) as ex:
        return [ip for ip, ok in zip(ips, ex.map(porta_aberta, ips)) if ok]


# ---------------------------------------------------------------------------
# Leitura das TVs
# ---------------------------------------------------------------------------
RE_VOL = re.compile(r'volume is (\d+) in range \[(\d+)\.\.(\d+)\]')


def ler_volume(alvo):
    for cmd in (('cmd', 'media_session', 'volume', '--stream', '3', '--get'),
                ('media', 'volume', '--stream', '3', '--get')):
        m = RE_VOL.search(shell(alvo, *cmd, timeout=4))
        if m:
            return int(m.group(1)), int(m.group(3))
    # TVs TCL (painéis) não respondem aos comandos acima: lê do relatório de áudio do Android.
    d = shell(alvo, 'dumpsys', 'audio', timeout=6)
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


def pacote_navegador(alvo):
    lista = shell(alvo, 'pm', 'list', 'packages', timeout=6)
    if 'package:' + PACOTE_TVBRO in lista:
        return PACOTE_TVBRO
    m = re.search(r'package:(\S*(?:tvbro|tvwebbrowser)\S*)', lista)
    return m.group(1) if m else ''


def ler_tv(ip):
    alvo = f'{ip}:{PORTA}'
    adb(['connect', alvo], 5)
    nome = shell(alvo, 'settings', 'get', 'global', 'device_name', timeout=5)
    if 'unauthorized' in nome:
        return {'ip': ip, 'nome': ip, 'status': 'nao_autorizada'}
    if falhou(nome):
        return {'ip': ip, 'nome': ip, 'status': 'sem_resposta'}
    if not nome or nome == 'null':
        nome = shell(alvo, 'getprop', 'ro.product.model', timeout=4)
    m = re.search(r'mWakefulness=(\w+)', shell(alvo, 'dumpsys', 'power', timeout=6))
    vol, vmax = ler_volume(alvo)
    return {'ip': ip, 'nome': nome.strip() or ip, 'status': 'ok', 'tela': (m.group(1) == 'Awake') if m else None,
            'volume': vol, 'volume_max': vmax, 'navegador': pacote_navegador(alvo), 'mac': mac_pela_rede(ip)}


def tirar_print(ip):
    dados = adb(['-s', f'{ip}:{PORTA}', 'exec-out', 'screencap', '-p'], 15, binario=True)
    # TVs TCL escrevem avisos ("Init wrapper sys mutex...") antes da imagem: corta até o início do PNG.
    i = dados.find(b'\x89PNG', 0, 4096)
    if i < 0:
        return None
    dados = dados[i:]
    return dados if len(dados) > 100 else None


# ---------------------------------------------------------------------------
# Arquivos de configuração
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


def paginas():
    if not os.path.isfile(ARQ_PAGINAS):
        gravar_json(ARQ_PAGINAS, PAGINAS_PADRAO)
    return {k.upper().strip(): str(v) for k, v in ler_json(ARQ_PAGINAS).items()}


# ---------------------------------------------------------------------------
# Ações
# ---------------------------------------------------------------------------
def executar(tv, acao, valor=None):
    """Executa uma ação numa TV. Devolve (ok, mensagem)."""
    alvo = f"{tv['ip']}:{PORTA}"
    if acao in TECLAS:
        saida = shell(alvo, 'input', 'keyevent', TECLAS[acao])
    elif acao == 'volume':
        n = int(valor)
        saida = shell(alvo, 'cmd', 'media_session', 'volume', '--stream', '3', '--set', str(n))
        if re.search(r'Unknown|Error|not found', saida):
            saida = shell(alvo, 'media', 'volume', '--stream', '3', '--set', str(n))
        atual, _ = ler_volume(alvo)
        voltas = 0
        while atual is not None and atual != n and voltas < 3:
            # Não obedeceu ao valor direto (TCL): chega lá apertando Vol+/Vol-.
            tecla = '24' if n > atual else '25'
            shell(alvo, 'input', 'keyevent', *([tecla] * min(abs(n - atual), 40)), timeout=15)
            atual, _ = ler_volume(alvo)
            voltas += 1
        saida = ''
    elif acao == 'tvbro':
        pac = tv.get('navegador') or pacote_navegador(alvo)
        if not pac:
            return False, 'O TV Bro não está instalado nesta TV.'
        saida = shell(alvo, 'monkey', '-p', pac, '-c', 'android.intent.category.LAUNCHER', '1')
        if re.search(r'No activities found|aborted', saida):
            return False, 'Não consegui abrir o TV Bro.'
        saida = ''
    elif acao == 'abrir_pagina':
        url = paginas().get(tv['nome'].upper().strip())
        if not url:
            return False, f"Sem endereço para '{tv['nome']}' no arquivo tvs.json."
        if tv.get('tela') is False:
            shell(alvo, 'input', 'keyevent', 'KEYCODE_WAKEUP')
        pac = tv.get('navegador') or pacote_navegador(alvo)
        base = ['am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]
        saida = shell(alvo, *(base + (['-p', pac] if pac else [])))
        if pac and re.search(r'Error|unable to resolve', saida):
            saida = shell(alvo, *base)
        if 'Error' in saida:
            return False, 'Não consegui abrir a página.'
        saida = ''
    elif acao == 'reiniciar':
        saida = adb(['-s', alvo, 'reboot'], 6)
    else:
        return False, 'Ação desconhecida.'
    if falhou(saida):
        return False, 'A TV não respondeu. Clique em Procurar TVs.'
    return True, ''


# ---------------------------------------------------------------------------
# Janela
# ---------------------------------------------------------------------------
class Card(tk.Frame):
    LARG_TELA = 352
    ALT_TELA = 198

    def __init__(self, app, pai, tv):
        super().__init__(pai, bg=COR_CARD, padx=14, pady=12, highlightthickness=1, highlightbackground='#33405C')
        self.app = app
        self.tv = tv
        self.foto = None
        self._montar()

    # -- construção ---------------------------------------------------------
    def _bt(self, pai, texto, acao=None, comando=None, destaque=False):
        b = tk.Button(pai, text=texto, font=(FONTE, 9, 'bold'), relief='flat', bd=0, cursor='hand2',
                      padx=6, pady=6, bg=COR_AMARELO if destaque else '#2E3852',
                      fg='#232B3F' if destaque else COR_TEXTO,
                      activebackground='#FFE07A' if destaque else '#3A4666', activeforeground='#232B3F' if destaque else COR_TEXTO,
                      command=comando or (lambda: self.app.acao(self.tv['ip'], acao)))
        return b

    def _montar(self):
        tv = self.tv
        st = tv['status']
        topo = tk.Frame(self, bg=COR_CARD)
        topo.pack(fill='x')
        tk.Label(topo, text=tv['nome'], font=(FONTE, 14, 'bold'), bg=COR_CARD, fg=COR_TEXTO).pack(side='left')
        selo, cor = {
            'ok': ('Ligada' if tv.get('tela') is not False else 'Tela apagada', COR_VERDE if tv.get('tela') is not False else COR_AMARELO),
            'nao_autorizada': ('Falta autorizar', COR_AMARELO),
        }.get(st, ('Desligada / fora da rede', COR_SUAVE))
        tk.Label(topo, text=selo, font=(FONTE, 9, 'bold'), bg=COR_CARD, fg=cor).pack(side='right')
        sub = f"IP {tv['ip']}" + (f" · visto em {tv['visto']}" if st != 'ok' and tv.get('visto') else '')
        tk.Label(self, text=sub, font=(FONTE, 8), bg=COR_CARD, fg=COR_SUAVE, anchor='w').pack(fill='x')

        self.tela = tk.Label(self, bg=COR_TELA, fg=COR_SUAVE, font=(FONTE, 9), wraplength=self.LARG_TELA - 30,
                             width=self.LARG_TELA, height=self.ALT_TELA, compound='center')
        # Label com imagem vazia para o tamanho ficar em pixels.
        self._vazia = tk.PhotoImage(width=self.LARG_TELA, height=self.ALT_TELA)
        self.tela.configure(image=self._vazia, width=self.LARG_TELA, height=self.ALT_TELA)
        self.tela.pack(pady=(8, 8))

        if st == 'ok':
            self.tela.configure(text='Carregando o print…')
            self._controles()
        elif st == 'nao_autorizada':
            self.tela.configure(text='Aceite na tela da TV:\n"Permitir depuração" > "Sempre permitir deste computador".\nDepois clique em Procurar TVs.')
        else:
            if tv.get('mac'):
                self.tela.configure(text='A TV está desligada ou fora do Wi-Fi.\n\nUse "Ligar pela rede" (precisa da opção\n"Ver TV no modo standby" ativada na TV).')
                linha = tk.Frame(self, bg=COR_CARD)
                linha.pack(fill='x')
                self._bt(linha, 'Ligar pela rede', comando=lambda: self.app.ligar_rede(tv['nome']), destaque=True).pack(
                    side='left', fill='x', expand=True, padx=(0, 4))
                self._bt(linha, 'Procurar de novo', comando=self.app.buscar).pack(side='left', fill='x', expand=True)
            else:
                self.tela.configure(text='A TV está desligada ou fora do Wi-Fi.\nLigue pelo controle e clique em Procurar TVs.')

        self.msg = tk.Label(self, text='', font=(FONTE, 8), bg=COR_CARD, fg=COR_SUAVE, anchor='w', justify='left',
                            wraplength=self.LARG_TELA)
        self.msg.pack(fill='x', pady=(6, 0))

    def _controles(self):
        tv = self.tv
        linha = tk.Frame(self, bg=COR_CARD)
        linha.pack(fill='x')
        tk.Label(linha, text='Volume', font=(FONTE, 9), bg=COR_CARD, fg=COR_SUAVE).pack(side='left')
        vmax = tv.get('volume_max') or 15
        self.vol_var = tk.IntVar(value=tv.get('volume') or 0)
        self.vol_txt = tk.Label(linha, width=5, font=(FONTE, 9, 'bold'), bg=COR_CARD, fg=COR_TEXTO)
        self.vol_txt.pack(side='right')
        self.escala = ttk.Scale(linha, from_=0, to=vmax, orient='horizontal',
                                command=lambda v: self._mostrar_vol(float(v)))
        self.escala.set(tv.get('volume') or 0)
        self.escala.pack(side='left', fill='x', expand=True, padx=8)
        self.escala.bind('<ButtonRelease-1>', lambda e: self.app.acao(tv['ip'], 'volume', int(round(self.escala.get()))))
        if tv.get('volume') is None:
            self.escala.state(['disabled'])
            self.vol_txt.configure(text='—')
        else:
            self._mostrar_vol(tv['volume'])

        grade = tk.Frame(self, bg=COR_CARD)
        grade.pack(fill='x', pady=(8, 0))
        botoes = [('Vol −', 'vol_menos'), ('Vol +', 'vol_mais'), ('Mudo', 'mudo'), ('TV Bro', 'tvbro'),
                  ('Abrir página', 'abrir_pagina'), ('Recarregar', 'recarregar'), ('Voltar', 'voltar'),
                  ('Início', 'inicio'), ('Print', None)]
        for i, (txt, ac) in enumerate(botoes):
            cmd = (lambda: self.app.print_tv(tv['ip'])) if ac is None else None
            self._bt(grade, txt, ac, cmd).grid(row=i // 3, column=i % 3, sticky='ew', padx=2, pady=2)
        if tv.get('tela') is False:
            self._bt(grade, 'Ligar a tela', 'ligar', destaque=True).grid(row=3, column=0, columnspan=2, sticky='ew', padx=2, pady=2)
        else:
            self._bt(grade, 'Desligar', comando=lambda: self.app.desligar(tv['ip'])).grid(row=3, column=0, columnspan=2, sticky='ew', padx=2, pady=2)
        self._bt(grade, 'Reiniciar', comando=lambda: self.app.reiniciar(tv['ip'])).grid(row=3, column=2, sticky='ew', padx=2, pady=2)
        for c in range(3):
            grade.columnconfigure(c, weight=1)

    # -- atualizações -------------------------------------------------------
    def _mostrar_vol(self, v):
        vmax = self.tv.get('volume_max') or 15
        self.vol_txt.configure(text=f'{round(v / vmax * 100)}%')

    def mostrar_print(self, png):
        if png is None:
            self.tela.configure(image=self._vazia, text='Não foi possível tirar o print.')
            return
        try:
            img = tk.PhotoImage(data=base64.b64encode(png))
            fator = max(1, math.ceil(img.width() / self.LARG_TELA), math.ceil(img.height() / self.ALT_TELA))
            self.foto = img.subsample(fator, fator)
            self.tela.configure(image=self.foto, text='')
        except tk.TclError:
            self.tela.configure(image=self._vazia, text='Não foi possível mostrar o print.')

    def mensagem(self, texto, erro=False):
        self.msg.configure(text=texto, fg=COR_ERRO if erro else COR_SUAVE)


class App:
    def __init__(self, raiz):
        self.raiz = raiz
        self.fila = queue.Queue()            # tudo que vem das threads passa por aqui (tkinter não é thread-safe)
        self.tvs = {}                        # ip -> dados
        self.cards = {}                      # ip -> Card
        self.buscando = False
        self.trabalho = ThreadPoolExecutor(max_workers=8)

        raiz.title('Central das TVs - Plano PAI')
        raiz.configure(bg=COR_FUNDO)
        raiz.geometry('1240x860')
        try:
            raiz.state('zoomed')
        except tk.TclError:
            pass
        estilo = ttk.Style()
        try:
            estilo.theme_use('clam')
        except tk.TclError:
            pass
        estilo.configure('Horizontal.TScale', background=COR_CARD, troughcolor='#3A4666')
        estilo.configure('Vertical.TScrollbar', background='#2E3852', troughcolor=COR_FUNDO)

        self._topo()
        self._area()
        self.raiz.after(100, self._processar_fila)
        self.raiz.after(30000, self._conferencia)
        if not ADB:
            self.status.configure(text='Não achei o adb.exe. Coloque em C:\\adb e abra de novo.', fg=COR_ERRO)
        else:
            self.buscar()

    # -- layout -------------------------------------------------------------
    def _botao(self, pai, texto, comando, destaque=False):
        return tk.Button(pai, text=texto, command=comando, font=(FONTE, 9, 'bold'), relief='flat', bd=0, cursor='hand2',
                         padx=12, pady=7, bg=COR_AMARELO if destaque else '#2E3852',
                         fg='#232B3F' if destaque else COR_TEXTO,
                         activebackground='#FFE07A' if destaque else '#3A4666')

    def _topo(self):
        topo = tk.Frame(self.raiz, bg=COR_FUNDO, padx=20, pady=12)
        topo.pack(fill='x')
        tk.Label(topo, text='Central das TVs', font=(FONTE, 18, 'bold'), bg=COR_FUNDO, fg=COR_TEXTO).pack(side='left')
        self.bt_buscar = self._botao(topo, 'Procurar TVs', self.buscar, destaque=True)
        self.bt_buscar.pack(side='right')
        self._botao(topo, 'Atualizar prints', self.atualizar_prints).pack(side='right', padx=8)
        self.status = tk.Label(topo, text='', font=(FONTE, 9), bg=COR_FUNDO, fg=COR_SUAVE)
        self.status.pack(side='right', padx=12)

        geral = tk.Frame(self.raiz, bg=COR_FUNDO, padx=20)
        geral.pack(fill='x', pady=(0, 8))
        tk.Label(geral, text='Todas as TVs:', font=(FONTE, 9, 'bold'), bg=COR_FUNDO, fg=COR_AMARELO).pack(side='left', padx=(0, 8))
        for txt, ac in (('Volume −', 'vol_menos'), ('Volume +', 'vol_mais'), ('Mudo', 'mudo'),
                        ('Abrir TV Bro', 'tvbro'), ('Abrir páginas', 'abrir_pagina'), ('Recarregar', 'recarregar')):
            self._botao(geral, txt, lambda a=ac: self.acao_todas(a)).pack(side='left', padx=3)
        self._botao(geral, 'Ligar desligadas (pela rede)', self.ligar_todas, destaque=True).pack(side='left', padx=(12, 3))

    def _area(self):
        caixa = tk.Frame(self.raiz, bg=COR_FUNDO)
        caixa.pack(fill='both', expand=True)
        self.canvas = tk.Canvas(caixa, bg=COR_FUNDO, highlightthickness=0)
        barra = ttk.Scrollbar(caixa, orient='vertical', command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=barra.set)
        barra.pack(side='right', fill='y')
        self.canvas.pack(side='left', fill='both', expand=True)
        self.grade = tk.Frame(self.canvas, bg=COR_FUNDO, padx=14)
        self.janela_grade = self.canvas.create_window((0, 0), window=self.grade, anchor='n')
        self.grade.bind('<Configure>', lambda e: self.canvas.configure(scrollregion=self.canvas.bbox('all')))
        self.canvas.bind('<Configure>', self._redimensionar)
        self.raiz.bind_all('<MouseWheel>', lambda e: self.canvas.yview_scroll(int(-e.delta / 120), 'units'))
        self.raiz.bind_all('<Button-4>', lambda e: self.canvas.yview_scroll(-1, 'units'))
        self.raiz.bind_all('<Button-5>', lambda e: self.canvas.yview_scroll(1, 'units'))
        self.colunas = 3

    def _redimensionar(self, e):
        self.canvas.coords(self.janela_grade, e.width / 2, 0)
        colunas = max(1, min(3, e.width // 395))
        if colunas != self.colunas:
            self.colunas = colunas
            self._posicionar()

    def _posicionar(self):
        ordem = sorted(self.cards.values(), key=lambda c: (c.tv['nome'].startswith('SALA'), c.tv['nome']))
        for i, card in enumerate(ordem):
            card.grid(row=i // self.colunas, column=i % self.colunas, padx=8, pady=8, sticky='n')

    def _desenhar(self):
        for c in self.cards.values():
            c.destroy()
        self.cards = {ip: Card(self, self.grade, tv) for ip, tv in self.tvs.items()}
        self._posicionar()

    def _redesenhar_um(self, ip, msg='', erro=False):
        antigo = self.cards.get(ip)
        if antigo:
            foto = antigo.foto
            antigo.destroy()
        else:
            foto = None
        card = Card(self, self.grade, self.tvs[ip])
        if foto is not None and self.tvs[ip]['status'] == 'ok':
            card.foto = foto
            card.tela.configure(image=foto, text='')
        self.cards[ip] = card
        self._posicionar()
        if msg:
            card.mensagem(msg, erro)

    # -- threads ------------------------------------------------------------
    def _em_segundo_plano(self, funcao, depois):
        def rodar():
            try:
                r = funcao()
            except Exception:  # registra e mostra em vez de matar a thread em silêncio
                registrar_erro(traceback.format_exc())
                r = None
            self.fila.put((depois, r))
        self.trabalho.submit(rodar)

    def _processar_fila(self):
        try:
            while True:
                depois, r = self.fila.get_nowait()
                try:
                    depois(r)
                except Exception:
                    registrar_erro(traceback.format_exc())
        except queue.Empty:
            pass
        self.raiz.after(100, self._processar_fila)

    # -- busca --------------------------------------------------------------
    def buscar(self):
        if self.buscando:
            return
        self.buscando = True
        self.bt_buscar.configure(state='disabled', text='Procurando…')
        self.status.configure(text='Procurando as TVs na rede…', fg=COR_SUAVE)

        def tarefa():
            adb(['start-server'], 15)
            meu = meu_ip()
            if not meu:
                return {'erro': 'O PC não está conectado em nenhuma rede.'}
            base = os.environ.get('CENTRAL_REDE') or meu.rsplit('.', 1)[0] + '.'
            ips = procurar_ips(base)
            with ThreadPoolExecutor(max_workers=6) as ex:
                achadas = list(ex.map(ler_tv, ips))
            return {'meu': meu, 'base': base, 'tvs': achadas}

        self._em_segundo_plano(tarefa, self._fim_busca)

    def _fim_busca(self, r):
        self.buscando = False
        self.bt_buscar.configure(state='normal', text='Procurar TVs')
        if not r or r.get('erro'):
            self.status.configure(text=(r or {}).get('erro', 'Erro ao procurar (veja erros.log).'), fg=COR_ERRO)
            return
        conh = ler_json(ARQ_CONHECIDAS)
        agora = time.strftime('%d/%m/%Y %H:%M')
        tvs = {}
        for tv in r['tvs']:
            if tv['status'] == 'sem_resposta':
                continue
            tvs[tv['ip']] = tv
            if tv['status'] == 'ok':
                antes = conh.get(tv['nome']) if isinstance(conh.get(tv['nome']), dict) else {}
                if not tv.get('mac'):
                    tv['mac'] = antes.get('mac', '')
                conh[tv['nome']] = {'ip': tv['ip'], 'mac': tv.get('mac', ''), 'visto': agora,
                                    'navegador': tv.get('navegador', '')}
        gravar_json(ARQ_CONHECIDAS, conh)
        nomes = {t['nome'] for t in tvs.values()}
        for nome, c in conh.items():
            if nome not in nomes and isinstance(c, dict):
                ip = str(c.get('ip', '')) or nome
                chave = ip if ip not in tvs else 'x-' + nome
                tvs[chave] = {'ip': ip, 'nome': nome, 'status': 'fora_da_rede', 'visto': c.get('visto', ''),
                              'mac': c.get('mac', '')}
        self.tvs = tvs
        self._desenhar()
        on = sum(1 for t in tvs.values() if t['status'] == 'ok')
        self.status.configure(text=f"PC {r['meu']} · {on} TV(s) encontrada(s) · {time.strftime('%H:%M:%S')}",
                              fg=COR_SUAVE if on else COR_ERRO)
        self.atualizar_prints()

    # -- conferência automática (a cada 30 s): mantém os cards certos sem precisar clicar em Procurar --
    def _conferencia(self):
        self.raiz.after(30000, self._conferencia)
        if self.buscando or not ADB:
            return
        itens = [(k, dict(t)) for k, t in self.tvs.items() if t['status'] in ('ok', 'fora_da_rede')]

        def tarefa():
            with ThreadPoolExecutor(max_workers=6) as ex:
                return [(k, r) for (k, _), r in zip(itens, ex.map(lambda kt: conferir_tv(kt[1]), itens)) if r]

        self._em_segundo_plano(tarefa, self._fim_conferencia)

    def _fim_conferencia(self, mudancas):
        for chave, novo in mudancas or []:
            atual = self.tvs.get(chave)
            if not atual or atual.get('ligando') or atual.get('nome') != novo.get('nome'):
                continue
            voltou = atual['status'] != 'ok' and novo['status'] == 'ok'
            self.tvs[chave] = novo
            self._redesenhar_um(chave, 'Voltou à rede às ' + time.strftime('%H:%M:%S') if voltou else '')
            if novo['status'] == 'ok':
                self.raiz.after(1500, lambda c=chave: self.print_tv(c))

    # -- prints -------------------------------------------------------------
    def print_tv(self, ip):
        card = self.cards.get(ip)
        if not card or self.tvs.get(ip, {}).get('status') != 'ok':
            return
        card.mensagem('Tirando print…')
        self._em_segundo_plano(lambda: tirar_print(ip), lambda png: self._fim_print(ip, png))

    def _fim_print(self, ip, png):
        card = self.cards.get(ip)
        if card:
            card.mostrar_print(png)
            card.mensagem('Print às ' + time.strftime('%H:%M:%S') if png else '')

    def atualizar_prints(self):
        for ip, tv in self.tvs.items():
            if tv['status'] == 'ok':
                self.print_tv(ip)

    # -- ações --------------------------------------------------------------
    def acao(self, ip, acao, valor=None):
        tv = self.tvs.get(ip)
        card = self.cards.get(ip)
        if not tv or tv['status'] != 'ok':
            return
        if card:
            card.mensagem('Enviando…')

        def tarefa():
            ok, msg = executar(tv, acao, valor)
            if ok and acao not in ('reiniciar', 'desligar'):
                time.sleep(0.3)
                tv['volume'], tv['volume_max'] = ler_volume(f'{ip}:{PORTA}')
            return ok, msg

        self._em_segundo_plano(tarefa, lambda r: self._fim_acao(ip, acao, r))

    def _fim_acao(self, ip, acao, r):
        ok, msg = r if r else (False, 'Erro inesperado (veja erros.log).')
        tv = self.tvs.get(ip)
        if not tv:
            return
        if ok:
            if acao == 'ligar' or acao == 'abrir_pagina':
                tv['tela'] = True
            if acao in ('desligar', 'reiniciar'):
                tv['status'] = 'fora_da_rede'
                tv['visto'] = time.strftime('%d/%m/%Y %H:%M')
            texto = {'desligar': 'Desligada. Para ligar: "Ligar pela rede" (se a TV tiver a opção ativada) ou o controle.',
                     'reiniciar': 'Reiniciando. Em alguns minutos clique em Procurar TVs.'}.get(
                acao, 'Feito às ' + time.strftime('%H:%M:%S'))
            self._redesenhar_um(ip, texto)
            if acao in ('abrir_pagina', 'tvbro', 'recarregar', 'ligar', 'inicio', 'voltar'):
                self.raiz.after(2500, lambda: self.print_tv(ip))
        else:
            card = self.cards.get(ip)
            if card:
                card.mensagem(msg, erro=True)

    def acao_todas(self, acao):
        for ip, tv in list(self.tvs.items()):
            if tv['status'] == 'ok':
                self.acao(ip, acao)

    def desligar(self, ip):
        tv = self.tvs.get(ip, {})
        nome = tv.get('nome', ip)
        if tv.get('mac'):
            aviso = ('Para ligar de novo pela Central, a TV precisa estar com "Ver TV no modo standby" ativado '
                     '(Configurações > Rede/Wi-Fi). Sem isso, só pelo controle.')
        else:
            aviso = 'A Central ainda não tem o endereço físico (MAC) desta TV: para ligar de novo, só pelo controle.'
        if messagebox.askyesno('Desligar TV', f'Desligar a {nome}?\n\n{aviso}', icon='warning'):
            self.acao(ip, 'desligar')

    def ligar_rede(self, nome):
        chave = next((k for k, t in self.tvs.items() if t['nome'] == nome), None)
        if chave is None:
            return
        tv = self.tvs[chave]
        card = self.cards.get(chave)
        if tv.get('ligando'):
            return
        tv['ligando'] = True
        if card:
            card.mensagem('Pedido de ligar enviado. Aguardando a TV voltar ao Wi-Fi (até 1,5 min)…')
        self._em_segundo_plano(lambda: ligar_pela_rede(dict(tv)), lambda novo: self._fim_ligar(chave, novo))

    def _fim_ligar(self, chave, novo):
        tv = self.tvs.get(chave)
        if tv is None:
            return
        tv.pop('ligando', None)
        if not novo:
            card = self.cards.get(chave)
            if card:
                card.mensagem('A TV não voltou. Confira se "Ver TV no modo standby" está ativado nela; '
                              'se ela ligou com outro IP, clique em Procurar TVs.', erro=True)
            return
        conh = ler_json(ARQ_CONHECIDAS)
        conh[novo['nome']] = {'ip': novo['ip'], 'mac': novo.get('mac', ''), 'visto': time.strftime('%d/%m/%Y %H:%M'),
                              'navegador': novo.get('navegador', '')}
        gravar_json(ARQ_CONHECIDAS, conh)
        if chave != novo['ip']:
            antigo = self.cards.pop(chave, None)
            if antigo:
                antigo.destroy()
            self.tvs.pop(chave, None)
        self.tvs[novo['ip']] = novo
        self._redesenhar_um(novo['ip'], 'Ligada pela rede às ' + time.strftime('%H:%M:%S'))
        self.raiz.after(3000, lambda: self.print_tv(novo['ip']))

    def ligar_todas(self):
        for tv in list(self.tvs.values()):
            if tv['status'] != 'ok' and tv.get('mac'):
                self.ligar_rede(tv['nome'])

    def reiniciar(self, ip):
        nome = self.tvs.get(ip, {}).get('nome', ip)
        if messagebox.askyesno('Reiniciar TV', f'Reiniciar a {nome}?\n\nEla fica alguns minutos sem imagem.'):
            self.acao(ip, 'reiniciar')


def main():
    raiz = tk.Tk()
    try:
        App(raiz)
        raiz.mainloop()
    except Exception:
        registrar_erro(traceback.format_exc())
        messagebox.showerror('Central das TVs', 'Erro inesperado. Detalhes em erros.log, na pasta da Central.')


if __name__ == '__main__':
    main()
