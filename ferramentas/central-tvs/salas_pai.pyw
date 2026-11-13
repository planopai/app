# -*- coding: utf-8 -*-
"""
SALAS DO MEMORIAL - Plano PAI  (aplicativo dos colaboradores, um único arquivo)

Cada sala tem um par de TVs: o PAINEL de fora (QR Code) e a TV de dentro (mensagens).
  SALA 01 = PAINEL 01 + SALA 01     SALA 02 = PAINEL 02 + SALA 02     SALA 03 = PAINEL 03 + SALA 03
(o par de cada sala fica em salas.json, criado na primeira vez)

Botões de cada sala
- LIGAR SALA: liga as duas TVs pela rede, acende as telas e abre o TV Bro nas duas.
- Atualizar telas: traz o TV Bro para a frente e recarrega a página nas duas.
- Desligar sala: desliga as duas (pede confirmação).
- Som: volume da TV de dentro.

Requisitos
- Python 3 para Windows (python.org) - o tkinter já vem junto.
- adb.exe em C:\\adb (ou na mesma pasta deste arquivo, ou no PATH).
- PC no mesmo Wi-Fi das TVs, cada TV autorizada para este PC ("Sempre permitir").
- Para ligar pela rede: "Ver TV no modo standby" ativado em cada TV. O endereço físico (MAC)
  de cada TV é guardado em tvs-conhecidas.json quando ela é encontrada ligada.
  Pode copiar esse arquivo do PC do suporte (Central das TVs) para esta pasta.

Arquivos nesta pasta: salas.json, tvs-conhecidas.json, historico.txt e erros.log (só se der erro).
"""
import base64
import getpass
import json
import math
import os
import queue
import re
import shutil
import socket
import subprocess
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

import tkinter as tk
from tkinter import messagebox, ttk

PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_SALAS = os.path.join(PASTA, 'salas.json')
ARQ_CONHECIDAS = os.path.join(PASTA, 'tvs-conhecidas.json')
ARQ_HISTORICO = os.path.join(PASTA, 'historico.txt')
ARQ_LOG = os.path.join(PASTA, 'erros.log')
PORTA = 5555
PACOTE_TVBRO = 'com.phlox.tvwebbrowser'
SEM_JANELA = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW: não pisca janela preta a cada comando
CONFERIR_A_CADA_MS = 20000
PRINTS_A_CADA_S = 60

SALAS_PADRAO = {
    'SALA 01': {'painel': 'PAINEL 01', 'dentro': 'SALA 01'},
    'SALA 02': {'painel': 'PAINEL 02', 'dentro': 'SALA 02'},
    'SALA 03': {'painel': 'PAINEL 03', 'dentro': 'SALA 03'},
}

COR_FUNDO = '#171C2A'
COR_CARD = '#232B3F'
COR_CAIXA = '#1A2133'
COR_TELA = '#0B1020'
COR_BORDA = '#33405C'
COR_TEXTO = '#FFFFFF'
COR_SUAVE = '#AEB6C8'
COR_APAGADO = '#5A6580'
COR_AMARELO = '#F2CB3F'
COR_VERDE = '#3FBF7F'
COR_ERRO = '#FF7A7A'
FONTE = 'Segoe UI' if os.name == 'nt' else 'DejaVu Sans'
DIAS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']


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
# Janela
# ---------------------------------------------------------------------------
class CartaoSala(tk.Frame):
    LARG = 236
    ALT = 133

    def __init__(self, app, pai, nome, par):
        super().__init__(pai, bg=COR_CARD, padx=22, pady=20, highlightthickness=2, highlightbackground=COR_BORDA)
        self.app, self.nome, self.par = app, nome, par
        self.ocupado = False
        self._vazia = tk.PhotoImage(width=self.LARG, height=self.ALT)
        self.fotos = {}

        topo = tk.Frame(self, bg=COR_CARD)
        topo.pack(fill='x')
        tk.Label(topo, text=nome, font=(FONTE, 22, 'bold'), bg=COR_CARD, fg=COR_TEXTO).pack(side='left')
        self.selo = tk.Label(topo, text='', font=(FONTE, 10, 'bold'), bg=COR_CARD, fg=COR_SUAVE)
        self.selo.pack(side='right')

        caixas = tk.Frame(self, bg=COR_CARD)
        caixas.pack(fill='x', pady=(14, 0))
        self.caixa = {}
        for col, (chave, titulo) in enumerate((('painel', 'PAINEL (FORA)'), ('dentro', 'TV (DENTRO)'))):
            f = tk.Frame(caixas, bg=COR_CAIXA, padx=10, pady=10)
            f.grid(row=0, column=col, sticky='nsew', padx=(0, 8) if col == 0 else (0, 0))
            caixas.columnconfigure(col, weight=1)
            tk.Label(f, text=titulo, font=(FONTE, 8, 'bold'), bg=COR_CAIXA, fg=COR_SUAVE, anchor='w').pack(fill='x')
            estado = tk.Label(f, text='', font=(FONTE, 11, 'bold'), bg=COR_CAIXA, fg=COR_TEXTO, anchor='w')
            estado.pack(fill='x', pady=(4, 6))
            tela = tk.Label(f, bg=COR_TELA, fg=COR_APAGADO, font=(FONTE, 8), image=self._vazia, compound='center',
                            width=self.LARG, height=self.ALT, text='')
            tela.pack()
            self.caixa[chave] = {'estado': estado, 'tela': tela}

        self.aviso = tk.Label(self, text='', font=(FONTE, 9, 'bold'), bg=COR_CARD, fg=COR_AMARELO, anchor='w',
                              justify='left', wraplength=2 * self.LARG + 20)
        self.aviso.pack(fill='x', pady=(12, 0))
        self.bind('<Configure>', lambda e: self.aviso.configure(wraplength=max(200, e.width - 50)))

        self.linha_vol = tk.Frame(self, bg=COR_CARD)
        self.linha_vol.pack(fill='x', pady=(8, 0))
        tk.Label(self.linha_vol, text='Som da TV de dentro', font=(FONTE, 9), bg=COR_CARD, fg=COR_SUAVE).pack(side='left')
        self.vol_txt = tk.Label(self.linha_vol, text='—', width=5, font=(FONTE, 10, 'bold'), bg=COR_CARD, fg=COR_TEXTO)
        self.vol_txt.pack(side='right')
        self.escala = ttk.Scale(self.linha_vol, from_=0, to=15, orient='horizontal',
                                command=lambda v: self._mostrar_vol(float(v)))
        self.escala.pack(side='left', fill='x', expand=True, padx=10)
        self.escala.bind('<ButtonRelease-1>', lambda e: self.app.volume(self.nome, int(round(self.escala.get()))))

        self.botoes = tk.Frame(self, bg=COR_CARD)
        self.botoes.pack(fill='x', pady=(12, 0))

    def _bt(self, texto, comando, tipo='sec', grande=False):
        cores = {'prim': (COR_AMARELO, '#232B3F', '#FFE07A'), 'sec': ('#2E3852', COR_TEXTO, '#3A4666'),
                 'des': (COR_CARD, '#FF9A9A', '#2E3852')}[tipo]
        return tk.Button(self.botoes, text=texto, command=comando, relief='flat', bd=0, cursor='hand2',
                         font=(FONTE, 14 if grande else 11, 'bold'), pady=14 if grande else 10,
                         bg=cores[0], fg=cores[1], activebackground=cores[2], activeforeground=cores[1],
                         highlightthickness=1 if tipo == 'des' else 0, highlightbackground='#7A3B48',
                         disabledforeground=COR_APAGADO)

    def _mostrar_vol(self, v):
        dentro = self.app.tvs.get(self.par['dentro'])
        mx = (dentro.volume_max if dentro else None) or 15
        self.vol_txt.configure(text=f'{round(v / mx * 100)}%')

    def desenhar(self, mensagem=None):
        tvs = [self.app.tvs[self.par[k]] for k in ('painel', 'dentro')]
        estados = [t.estado for t in tvs]
        ligadas = sum(e == 'ligada' for e in estados)

        # Selo e borda
        if self.ocupado:
            selo, cor, borda = 'Aguarde…', COR_AMARELO, COR_AMARELO
        elif ligadas == 2:
            selo, cor, borda = '● Sala ligada', COR_VERDE, '#2F7A57'
        elif all(e == 'desligada' for e in estados):
            selo, cor, borda = 'Sala desligada', COR_SUAVE, COR_BORDA
        elif 'desconhecida' in estados:
            selo, cor, borda = 'Verificando…', COR_SUAVE, COR_BORDA
        else:
            selo, cor, borda = '⚠ Atenção', COR_AMARELO, '#7A6A2A'
        self.selo.configure(text=selo, fg=cor)
        self.configure(highlightbackground=borda)

        # Caixas das TVs
        textos = {'ligada': ('● Ligada', COR_VERDE), 'tela_apagada': ('● Tela apagada', COR_AMARELO),
                  'desligada': ('● Desligada', COR_APAGADO), 'nao_autorizada': ('● Falta autorizar este PC', COR_ERRO),
                  'desconhecida': ('● Verificando…', COR_APAGADO)}
        for chave, tv in zip(('painel', 'dentro'), tvs):
            txt, c = textos.get(tv.estado, ('●', COR_APAGADO))
            cx = self.caixa[chave]
            cx['estado'].configure(text=txt, fg=c)
            if tv.estado == 'ligada' and tv.print_png:
                foto = self._foto(tv)
                cx['tela'].configure(image=foto or self._vazia, text='' if foto else 'sem imagem')
            else:
                cx['tela'].configure(image=self._vazia, text={'ligada': 'carregando…', 'tela_apagada': 'tela apagada',
                                                              'nao_autorizada': 'aceite na TV'}.get(tv.estado, 'tela desligada'))

        # Aviso
        if mensagem is not None:
            self.aviso.configure(text=mensagem, fg=COR_AMARELO)
        elif not self.ocupado:
            problemas = [f"{'Painel' if k == 'painel' else 'TV de dentro'}: falta autorizar este PC na TV "
                         '("Sempre permitir")' for k, t in zip(('painel', 'dentro'), tvs) if t.estado == 'nao_autorizada']
            if not problemas and 0 < ligadas < 2:
                problemas = ['Só uma das TVs está ligada. Clique em Ligar sala para ligar as duas.']
            self.aviso.configure(text='\n'.join(problemas))

        # Volume da TV de dentro
        dentro = tvs[1]
        if dentro.estado == 'ligada' and dentro.volume is not None:
            self.escala.configure(to=dentro.volume_max or 15)
            self.escala.state(['!disabled'])
            self.escala.set(dentro.volume)
            self._mostrar_vol(dentro.volume)
        else:
            self.escala.state(['disabled'])
            self.vol_txt.configure(text='—')

        # Botões conforme o estado
        for w in self.botoes.winfo_children():
            w.destroy()
        estado_bt = 'disabled' if self.ocupado else 'normal'
        if ligadas == 2:
            self._bt('↻  Atualizar telas', lambda: self.app.atualizar(self.nome)).grid(row=0, column=0, sticky='ew', padx=(0, 5))
            self._bt('⏻  Desligar sala', lambda: self.app.desligar(self.nome), 'des').grid(row=0, column=1, sticky='ew', padx=(5, 0))
        elif all(e in ('desligada', 'desconhecida') for e in estados):
            self._bt(f'⏻  LIGAR {self.nome}', lambda: self.app.ligar(self.nome), 'prim', grande=True).grid(
                row=0, column=0, columnspan=2, sticky='ew')
        else:
            self._bt('⏻  Ligar sala', lambda: self.app.ligar(self.nome), 'prim').grid(row=0, column=0, sticky='ew', padx=(0, 5))
            self._bt('Desligar sala', lambda: self.app.desligar(self.nome), 'des').grid(row=0, column=1, sticky='ew', padx=(5, 0))
        for w in self.botoes.winfo_children():
            w.configure(state=estado_bt)
        self.botoes.columnconfigure(0, weight=1, uniform='b')
        self.botoes.columnconfigure(1, weight=1, uniform='b')

    def _foto(self, tv):
        chave = (tv.nome, tv.print_hora)
        if chave not in self.fotos:
            try:
                img = tk.PhotoImage(data=base64.b64encode(tv.print_png))
                f = max(1, math.ceil(img.width() / self.LARG), math.ceil(img.height() / self.ALT))
                self.fotos = {k: v for k, v in self.fotos.items() if k[0] != tv.nome}
                self.fotos[chave] = img.subsample(f, f)
            except tk.TclError:
                return None
        return self.fotos[chave]


class App:
    def __init__(self, raiz):
        self.raiz = raiz
        self.fila = queue.Queue()
        self.trabalho = ThreadPoolExecutor(max_workers=10)
        self.salas = ler_salas()
        conh = ler_json(ARQ_CONHECIDAS)
        self.tvs = {}
        for par in self.salas.values():
            for nome in par.values():
                c = conh.get(nome) if isinstance(conh.get(nome), dict) else {}
                self.tvs[nome] = TV(nome, str(c.get('ip', '')), str(c.get('mac', '')))
        self.conferindo = False

        raiz.title('Salas do Memorial - Plano PAI')
        raiz.configure(bg=COR_FUNDO)
        raiz.geometry('1360x820')
        try:
            raiz.state('zoomed')
        except tk.TclError:
            pass
        try:
            ttk.Style().theme_use('clam')
        except tk.TclError:
            pass
        ttk.Style().configure('Horizontal.TScale', background=COR_CARD, troughcolor='#3A4666')

        self._montar()
        self.raiz.after(100, self._processar_fila)
        self._relogio()
        if not ADB:
            self.rodape_dir.configure(text='Não achei o adb.exe. Coloque em C:\\adb e abra de novo.', fg=COR_ERRO)
            return
        self.procurar(primeira=True)
        self.raiz.after(CONFERIR_A_CADA_MS, self._ciclo)

    # -- layout -------------------------------------------------------------
    def _montar(self):
        topo = tk.Frame(self.raiz, bg=COR_FUNDO, padx=36, pady=24)
        topo.pack(fill='x')
        tk.Label(topo, text='PAI', font=(FONTE, 13, 'bold'), bg=COR_AMARELO, fg='#232B3F', width=4, pady=8).pack(side='left')
        tit = tk.Frame(topo, bg=COR_FUNDO, padx=14)
        tit.pack(side='left')
        tk.Label(tit, text='Salas do Memorial', font=(FONTE, 22, 'bold'), bg=COR_FUNDO, fg=COR_TEXTO, anchor='w').pack(fill='x')
        tk.Label(tit, text='Ligue e desligue as TVs de cada sala: painel de fora + TV de dentro', font=(FONTE, 10),
                 bg=COR_FUNDO, fg=COR_SUAVE, anchor='w').pack(fill='x')
        rel = tk.Frame(topo, bg=COR_FUNDO)
        rel.pack(side='right')
        self.hora = tk.Label(rel, font=(FONTE, 24, 'bold'), bg=COR_FUNDO, fg=COR_TEXTO, anchor='e')
        self.hora.pack(fill='x')
        self.data = tk.Label(rel, font=(FONTE, 10), bg=COR_FUNDO, fg=COR_SUAVE, anchor='e')
        self.data.pack(fill='x')

        grade = tk.Frame(self.raiz, bg=COR_FUNDO, padx=26)
        grade.pack(fill='both', expand=True)
        self.cartoes = {}
        for i, (nome, par) in enumerate(sorted(self.salas.items())):
            c = CartaoSala(self, grade, nome, par)
            c.grid(row=0, column=i, sticky='nsew', padx=10)
            grade.columnconfigure(i, weight=1, uniform='s')
            self.cartoes[nome] = c
            c.desenhar()

        rod = tk.Frame(self.raiz, bg=COR_FUNDO, padx=36, pady=16)
        rod.pack(fill='x', side='bottom')
        self.rodape_esq = tk.Label(rod, text='', font=(FONTE, 9), bg=COR_FUNDO, fg=COR_SUAVE, anchor='w')
        self.rodape_esq.pack(side='left')
        tk.Button(rod, text='Procurar TVs', command=self.procurar, relief='flat', bd=0, cursor='hand2', padx=10, pady=4,
                  font=(FONTE, 9, 'bold'), bg='#2E3852', fg=COR_TEXTO, activebackground='#3A4666').pack(side='right')
        self.rodape_dir = tk.Label(rod, text='', font=(FONTE, 9), bg=COR_FUNDO, fg=COR_SUAVE, anchor='e')
        self.rodape_dir.pack(side='right', padx=12)
        self._mostrar_historico()

    def _relogio(self):
        self.hora.configure(text=time.strftime('%H:%M'))
        self.data.configure(text=f"{DIAS[time.localtime().tm_wday]}, {time.strftime('%d/%m/%Y')}")
        self.raiz.after(5000, self._relogio)

    def _mostrar_historico(self):
        acoes = ultimas_acoes()
        self.rodape_esq.configure(text=('Últimas ações:  ' + '   ·   '.join(f'{h}  {t}' for h, t in acoes)) if acoes else '')

    def redesenhar(self, mensagens=None):
        for nome, c in self.cartoes.items():
            c.desenhar((mensagens or {}).get(nome))

    # -- threads ------------------------------------------------------------
    def _bg(self, funcao, depois=None):
        def rodar():
            try:
                r = funcao()
            except Exception:
                registrar_erro(traceback.format_exc())
                r = None
            if depois:
                self.fila.put((depois, r))
        self.trabalho.submit(rodar)

    def _ui(self, funcao):
        """Agenda algo para rodar na janela (chamado de dentro das threads)."""
        self.fila.put((lambda _: funcao(), None))

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

    # -- busca e conferência -------------------------------------------------
    def _salvar_conhecidas(self):
        conh = ler_json(ARQ_CONHECIDAS)
        agora = time.strftime('%d/%m/%Y %H:%M')
        for tv in self.tvs.values():
            if tv.ip and tv.estado in ('ligada', 'tela_apagada'):
                antes = conh.get(tv.nome) if isinstance(conh.get(tv.nome), dict) else {}
                conh[tv.nome] = {**antes, 'ip': tv.ip, 'mac': tv.mac or antes.get('mac', ''), 'visto': agora}
        gravar_json(ARQ_CONHECIDAS, conh)

    def procurar(self, primeira=False):
        """Varre a rede e acha cada TV pelo nome (o IP muda, o nome não)."""
        if self.conferindo:
            return
        self.conferindo = True
        self.rodape_dir.configure(text='Procurando as TVs na rede…', fg=COR_SUAVE)
        ocupadas = {n for c in self.cartoes.values() if c.ocupado for n in c.par.values()}

        def tarefa():
            adb(['start-server'], 15)
            base = base_rede()
            if not base:
                return 'O PC não está conectado em nenhuma rede.'
            ips = procurar_ips(base)
            with ThreadPoolExecutor(max_workers=8) as ex:
                nomes = dict(zip(ips, ex.map(nome_da_tv, ips)))
            achadas = set()
            for ip, nome in nomes.items():
                if nome in self.tvs and nome not in ocupadas:
                    self.tvs[nome].ip = ip
                    achadas.add(nome)
                elif nome == 'NAO_AUTORIZADA':
                    for tv in self.tvs.values():
                        if tv.ip == ip:
                            achadas.add(tv.nome)
            for nome, tv in self.tvs.items():
                if nome not in ocupadas and nome not in achadas:
                    tv.estado = 'desligada'
            with ThreadPoolExecutor(max_workers=6) as ex:
                list(ex.map(lambda t: t.conferir(), [self.tvs[n] for n in achadas]))
            self._salvar_conhecidas()
            self._prints(forcar=True)
            return None

        self._bg(tarefa, self._fim_conferencia)

    def _ciclo(self):
        self.raiz.after(CONFERIR_A_CADA_MS, self._ciclo)
        if self.conferindo:
            return
        self.conferindo = True
        ocupadas = {n for c in self.cartoes.values() if c.ocupado for n in c.par.values()}

        def tarefa():
            alvo = [t for n, t in self.tvs.items() if n not in ocupadas]
            with ThreadPoolExecutor(max_workers=6) as ex:
                list(ex.map(lambda t: t.conferir(), alvo))
            perdidas = [t for t in alvo if not t.ip]
            if perdidas:  # alguma TV trocou de IP: varre a rede para achá-la pelo nome
                for ip in procurar_ips(base_rede()):
                    if ip in {t.ip for t in self.tvs.values()}:
                        continue
                    nome = nome_da_tv(ip)
                    if nome in self.tvs and not self.tvs[nome].ip:
                        self.tvs[nome].ip = ip
                        self.tvs[nome].conferir()
            self._salvar_conhecidas()
            self._prints()
            return None

        self._bg(tarefa, self._fim_conferencia)

    def _prints(self, forcar=False):
        agora = time.time()
        alvo = [t for t in self.tvs.values() if t.estado == 'ligada' and (forcar or agora - t.print_hora > PRINTS_A_CADA_S)]
        with ThreadPoolExecutor(max_workers=6) as ex:
            for tv, png in zip(alvo, ex.map(lambda t: tirar_print(t.ip), alvo)):
                if png:
                    tv.print_png, tv.print_hora = png, time.time()

    def _fim_conferencia(self, erro):
        self.conferindo = False
        if erro:
            self.rodape_dir.configure(text=erro, fg=COR_ERRO)
        else:
            self.rodape_dir.configure(text='Conferido às ' + time.strftime('%H:%M:%S') + ' · atualiza sozinho', fg=COR_SUAVE)
        self.redesenhar()

    # -- ações das salas -----------------------------------------------------
    def _executar_sala(self, nome, titulo, funcao, historico):
        cartao = self.cartoes[nome]
        if cartao.ocupado:
            return
        cartao.ocupado = True
        cartao.desenhar(titulo + '…')
        par = [self.tvs[cartao.par['painel']], self.tvs[cartao.par['dentro']]]
        rotulos = ['Painel', 'TV de dentro']
        andamento = {r: '' for r in rotulos}

        def avisar(rotulo, txt):
            andamento[rotulo] = txt
            linhas = '\n'.join(f'{r}: {t}' for r, t in andamento.items() if t)
            self._ui(lambda: cartao.aviso.configure(text=linhas, fg=COR_AMARELO))

        def tarefa():
            with ThreadPoolExecutor(max_workers=2) as ex:
                res = list(ex.map(lambda i: funcao(par[i], lambda t: avisar(rotulos[i], t)), range(2)))
            for tv in par:
                if tv.estado == 'ligada':
                    try:
                        tv.volume, tv.volume_max = ler_volume(tv.ip)
                    except Exception:
                        pass
            self._salvar_conhecidas()
            time.sleep(2)
            for tv in par:
                if tv.estado == 'ligada':
                    png = tirar_print(tv.ip)
                    if png:
                        tv.print_png, tv.print_hora = png, time.time()
            return res

        def fim(res):
            cartao.ocupado = False
            if not res:
                cartao.desenhar('Erro inesperado. Detalhes em erros.log.')
                return
            falhas = [f'{r}: {m}' for r, (ok, m) in zip(rotulos, res) if not ok]
            if falhas:
                registrar_historico(f'{nome}: {historico} com problema ({"; ".join(falhas)})')
                cartao.desenhar('\n'.join(falhas) + '\nSe continuar, use o controle e avise o suporte.')
            else:
                registrar_historico(f'{nome} {historico}')
                cartao.desenhar('')
            self._mostrar_historico()

        self._bg(tarefa, fim)

    def ligar(self, nome):
        self._executar_sala(nome, 'Ligando as duas TVs e abrindo o TV Bro', ligar_tv, 'ligada')

    def atualizar(self, nome):
        self._executar_sala(nome, 'Atualizando as telas', lambda tv, avisar: atualizar_tv(tv), 'telas atualizadas')

    def desligar(self, nome):
        if not messagebox.askyesno('Desligar sala', f'Desligar a {nome}?\n\nO painel de fora e a TV de dentro serão desligados.',
                                   icon='warning'):
            return
        self._executar_sala(nome, 'Desligando as duas TVs', lambda tv, avisar: desligar_tv(tv), 'desligada')

    def volume(self, nome, valor):
        cartao = self.cartoes[nome]
        tv = self.tvs[cartao.par['dentro']]
        if tv.estado != 'ligada' or cartao.ocupado:
            return

        def tarefa():
            tv.volume, tv.volume_max = mudar_volume(tv.ip, valor)

        self._bg(tarefa, lambda _: cartao.desenhar())


def main():
    raiz = tk.Tk()
    try:
        App(raiz)
        raiz.mainloop()
    except Exception:
        registrar_erro(traceback.format_exc())
        messagebox.showerror('Salas do Memorial', 'Erro inesperado. Detalhes em erros.log, na pasta do aplicativo.')


if __name__ == '__main__':
    main()
