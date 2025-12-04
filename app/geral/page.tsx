'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type ID = number;

type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };

type Produto = {
    id: ID;
    nome: string;
    codigo_barras: string;
    valor: string | number;
    minimo: number;
    foto_url?: string | null;
    ativo: 0 | 1 | number;
    atualizado_em: string;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    atualizado_em: string;
};

type Me = { id: ID; nome: string; usuario: string };

type InitResp = {
    ok: boolean;
    me: Me;
    usuarios: Usuario[];
    depositos: Deposito[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
};

type HistoricoRow = {
    id: number;
    tipo: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE' | 'CADASTRO_PRODUTO';
    produto_id: ID;
    codigo_barras_snapshot: string;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto: string | null;
    solicitante_usuario_id: ID | null;
    operador_usuario_id: ID;
    observacao: string | null;
    criado_em: string;

    produto_nome?: string;
    operador_nome?: string;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
};

type UiTab = 'HOME' | 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'ESTOQUE' | 'ALERTAS' | 'AVANCADO';

const API_BASE = '/api/php/estoque_admin.php';

function nowISO() {
    return new Date().toISOString();
}
function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}
function fmtDateTime(iso: string) {
    try {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    } catch {
        return iso;
    }
}
function moneyBRL(n: number) {
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
    } catch {
        return `R$ ${n.toFixed(2)}`;
    }
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), { method: 'GET', cache: 'no-store', credentials: 'include' });
    // export CSV vem como text/csv; aqui só usamos JSON nos GETs
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        throw new Error(`Resposta inesperada (${ct}).`);
    }
    const j = (await r.json()) as T;
    return j;
}

async function apiPost<T>(body: any) {
    const r = await fetch(API_BASE, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const j = (await r.json()) as T & { ok?: boolean; msg?: string };
    return j;
}

function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button
                        className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
                'placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                props.className ?? '',
            ].join(' ')}
        />
    );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                'min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
                'placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                props.className ?? '',
            ].join(' ')}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                props.className ?? '',
            ].join(' ')}
        />
    );
}

function Button({
    children,
    variant = 'solid',
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'solid' | 'ghost';
}) {
    const cls =
        variant === 'solid'
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : 'bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200';

    return (
        <button
            {...props}
            className={[
                'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
                'disabled:cursor-not-allowed disabled:opacity-50',
                cls,
                props.className ?? '',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function PhotoThumb({ url }: { url?: string | null }) {
    return (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Foto do produto" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
                <span className="text-lg">🖼️</span>
            )}
        </div>
    );
}

// ===== Scanner (Camera + BarcodeDetector) =====
function BarcodeScannerModal({
    open,
    title,
    onClose,
    onDetected,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    onDetected: (code: string) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const [err, setErr] = useState<string>('');

    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        const start = async () => {
            setErr('');

            // @ts-ignore
            const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;
            if (!hasDetector) {
                setErr('Seu navegador não suporta leitura por câmera (BarcodeDetector). Use digitação.');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });
                if (cancelled) return;

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                // @ts-ignore
                const detector = new window.BarcodeDetector({
                    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
                });

                let lastHit = '';
                let lastAt = 0;

                const tick = async () => {
                    if (cancelled) return;
                    try {
                        const v = videoRef.current;
                        if (!v) return;

                        const now = Date.now();
                        // throttle
                        if (now - lastAt > 140) {
                            lastAt = now;
                            const codes = await detector.detect(v);
                            if (codes && codes.length) {
                                const raw = (codes[0].rawValue || '').trim();
                                if (raw && raw !== lastHit) {
                                    lastHit = raw;
                                    onDetected(raw);
                                    onClose();
                                    return;
                                }
                            }
                        }
                    } catch (e: any) {
                        // ignora erros pontuais
                    }
                    rafRef.current = requestAnimationFrame(tick);
                };

                rafRef.current = requestAnimationFrame(tick);
            } catch (e: any) {
                setErr(e?.message || 'Não foi possível abrir a câmera.');
            }
        };

        start();

        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [open, onClose, onDetected]);

    return (
        <Modal open={open} title={title} subtitle="Aponte para o código. Ao detectar, preenche automaticamente." onClose={onClose}>
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            ) : (
                <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
                        <video ref={videoRef} className="h-[360px] w-full object-cover" playsInline muted />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={onClose}>Fechar</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

export default function Page() {
    const [tab, setTab] = useState<UiTab>('HOME');

    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState<string>('');

    const [me, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const userById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);

    const saldosMap = useMemo(() => {
        const m = new Map<string, Saldo>();
        for (const s of saldos) m.set(`${s.produto_id}::${s.deposito_id}`, s);
        return m;
    }, [saldos]);

    async function refreshInit() {
        setLoading(true);
        setInitErr('');
        try {
            const j = await apiGet<InitResp>({ init: 1 });
            if (!j.ok) throw new Error(j.msg || 'Falha no init');
            setMe(j.me);
            setUsuarios(j.usuarios || []);
            setDepositos(j.depositos || []);
            setProdutos((j.produtos || []).filter((p) => Number(p.ativo) === 1));
            setSaldos(j.saldos || []);
        } catch (e: any) {
            setInitErr(e?.message || 'Erro ao carregar.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshInit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ======= Derivações de UI =======
    const alertRows = useMemo(() => {
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; s?: Saldo }> = [];
        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;
            const min = clampInt(p.minimo);
            const qtd = clampInt(s.quantidade);
            if (qtd <= min) rows.push({ p, d, qtd, min, s });
        }
        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
        return rows;
    }, [saldos, prodById, depById]);

    const alertCount = alertRows.length;

    // ======= ESTOQUE (lista) =======
    const [qEstoque, setQEstoque] = useState('');
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID | 'Todos'>('Todos');
    const [onlyLow, setOnlyLow] = useState(false);

    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; s?: Saldo }> = [];

        // mostra só onde existe saldo (linha por produto+depósito)
        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            if (depFiltroEstoque !== 'Todos' && d.id !== depFiltroEstoque) continue;

            const qtd = clampInt(s.quantidade);
            const min = clampInt(p.minimo);
            if (onlyLow && !(qtd <= min)) continue;

            if (qq) {
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({ p, d, qtd, s });
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, 'pt-BR') || a.d.nome.localeCompare(b.d.nome, 'pt-BR'));
        return rows;
    }, [saldos, prodById, depById, qEstoque, depFiltroEstoque, onlyLow]);

    // ======= ENTRADA =======
    const [entradaOpen, setEntradaOpen] = useState(false);
    const [entradaScanOpen, setEntradaScanOpen] = useState(false);

    const [entradaBarcode, setEntradaBarcode] = useState('');
    const [entradaDepositoId, setEntradaDepositoId] = useState<ID>(() => depositos[0]?.id ?? 0);
    const [entradaQtd, setEntradaQtd] = useState<number>(1);
    const [entradaObs, setEntradaObs] = useState('');

    // cadastro se não existir
    const [novoNome, setNovoNome] = useState('');
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>('');

    const entradaProdutoExistente = useMemo(() => {
        const cb = entradaBarcode.trim();
        if (!cb) return null;
        return produtos.find((p) => p.codigo_barras === cb) ?? null;
    }, [entradaBarcode, produtos]);

    async function fileToDataUrl(file: File): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(file);
        });
    }
    async function onEntradaFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setNovoFoto(url);
    }

    useEffect(() => {
        if (depositos.length && !entradaDepositoId) setEntradaDepositoId(depositos[0].id);
    }, [depositos, entradaDepositoId]);

    async function applyEntrada() {
        if (!me) return alert('Sessão inválida. Recarregue a página.');
        const deposito_id = Number(entradaDepositoId);
        const quantidade = clampInt(entradaQtd);
        const codigo_barras = entradaBarcode.trim();

        if (!deposito_id) return alert('Selecione o depósito.');
        if (!codigo_barras) return alert('Informe/Leia o código de barras.');
        if (quantidade <= 0) return alert('Quantidade inválida.');

        const payload: any = {
            action: 'entrada',
            deposito_id,
            quantidade,
            codigo_barras,
            observacao: entradaObs.trim() || undefined,
        };

        // se não existir, exige dados
        if (!entradaProdutoExistente) {
            const nome = novoNome.trim();
            if (!nome) return alert('Produto novo: informe o nome.');
            payload.nome = nome;
            payload.valor = Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0;
            payload.minimo = clampInt(novoMin);
            payload.foto_url = novoFoto || '';
        }

        const r = await apiPost<{ ok: boolean; msg?: string; produto_id?: number }>(payload);
        if (!r.ok) return alert(r.msg || 'Falha na entrada.');

        setEntradaBarcode('');
        setEntradaQtd(1);
        setEntradaObs('');
        setNovoNome('');
        setNovoValor(0);
        setNovoMin(0);
        setNovoFoto('');
        setEntradaOpen(false);
        await refreshInit();
        setTab('ESTOQUE');
    }

    // ======= SAÍDA =======
    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saidaScanOpen, setSaidaScanOpen] = useState(false);

    const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(() => depositos[0]?.id ?? 0);
    const [saidaBusca, setSaidaBusca] = useState('');
    const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
    const [saidaBarcode, setSaidaBarcode] = useState('');
    const [saidaQtd, setSaidaQtd] = useState<number>(1);
    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
    const [saidaDestino, setSaidaDestino] = useState('');
    const [saidaObs, setSaidaObs] = useState('');

    useEffect(() => {
        if (!saidaSolicitanteId && usuarios[0]?.id) setSaidaSolicitanteId(usuarios[0].id);
    }, [usuarios, saidaSolicitanteId]);

    useEffect(() => {
        if (depositos.length && !saidaDepositoId) setSaidaDepositoId(depositos[0].id);
    }, [depositos, saidaDepositoId]);

    // produtos disponíveis no depósito selecionado (com saldo >= 0)
    const saidaProdutosNoDeposito = useMemo(() => {
        const depId = Number(saidaDepositoId);
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        const qq = saidaBusca.trim().toLowerCase();
        const list = produtos
            .filter((p) => ids.has(p.id))
            .filter((p) => {
                if (!qq) return true;
                return `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq);
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        return list;
    }, [saldos, produtos, saidaDepositoId, saidaBusca]);

    useEffect(() => {
        // mantém produto selecionado válido
        if (!saidaProdutoId && saidaProdutosNoDeposito[0]?.id) setSaidaProdutoId(saidaProdutosNoDeposito[0].id);
        if (saidaProdutoId && !saidaProdutosNoDeposito.find((p) => p.id === saidaProdutoId)) {
            setSaidaProdutoId(saidaProdutosNoDeposito[0]?.id ?? 0);
        }
    }, [saidaProdutosNoDeposito, saidaProdutoId]);

    function onSaidaBarcodePick(code: string) {
        setSaidaBarcode(code);
        const p = produtos.find((x) => x.codigo_barras === code);
        if (p) setSaidaProdutoId(p.id);
    }

    async function applySaida() {
        if (!me) return alert('Sessão inválida. Recarregue a página.');

        const produto_id = Number(saidaProdutoId);
        const deposito_id = Number(saidaDepositoId);
        const quantidade = clampInt(saidaQtd);
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const destino_texto = saidaDestino.trim();

        if (!produto_id) return alert('Selecione um produto.');
        if (!deposito_id) return alert('Selecione o depósito.');
        if (quantidade <= 0) return alert('Quantidade inválida.');
        if (!solicitante_usuario_id) return alert('Selecione o solicitante.');
        if (!destino_texto) return alert('Informe o destino.');

        // valida disponível
        const s = saldosMap.get(`${produto_id}::${deposito_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) return alert(`Quantidade maior que disponível (${atual}).`);

        const r = await apiPost<{ ok: boolean; msg?: string }>({
            action: 'saida',
            produto_id,
            deposito_id,
            quantidade,
            solicitante_usuario_id,
            destino_texto,
            observacao: saidaObs.trim() || undefined,
        });

        if (!r.ok) return alert(r.msg || 'Falha na saída.');

        setSaidaBarcode('');
        setSaidaQtd(1);
        setSaidaDestino('');
        setSaidaObs('');
        setSaidaOpen(false);
        await refreshInit();
        setTab('ESTOQUE');
    }

    // ======= TRANSFERÊNCIA =======
    const [trfBusca, setTrfBusca] = useState('');
    const [trfProdutoId, setTrfProdutoId] = useState<ID>(0);
    const [trfOrigemId, setTrfOrigemId] = useState<ID>(0);
    const [trfDestinoId, setTrfDestinoId] = useState<ID>(0);
    const [trfQtd, setTrfQtd] = useState<number>(1);
    const [trfSolicitanteId, setTrfSolicitanteId] = useState<ID>(0);
    const [trfObs, setTrfObs] = useState('');

    useEffect(() => {
        if (depositos.length) {
            if (!trfOrigemId) setTrfOrigemId(depositos[0].id);
            if (!trfDestinoId) setTrfDestinoId(depositos[1]?.id ?? depositos[0].id);
        }
    }, [depositos, trfOrigemId, trfDestinoId]);

    useEffect(() => {
        if (!trfSolicitanteId && usuarios[0]?.id) setTrfSolicitanteId(usuarios[0].id);
    }, [usuarios, trfSolicitanteId]);

    const trfProdutosNaOrigem = useMemo(() => {
        const depId = Number(trfOrigemId);
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        const qq = trfBusca.trim().toLowerCase();
        const list = produtos
            .filter((p) => ids.has(p.id))
            .filter((p) => {
                if (!qq) return true;
                return `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq);
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        return list;
    }, [saldos, produtos, trfOrigemId, trfBusca]);

    useEffect(() => {
        if (!trfProdutoId && trfProdutosNaOrigem[0]?.id) setTrfProdutoId(trfProdutosNaOrigem[0].id);
        if (trfProdutoId && !trfProdutosNaOrigem.find((p) => p.id === trfProdutoId)) {
            setTrfProdutoId(trfProdutosNaOrigem[0]?.id ?? 0);
        }
    }, [trfProdutosNaOrigem, trfProdutoId]);

    async function applyTransferencia() {
        if (!me) return alert('Sessão inválida. Recarregue a página.');

        const produto_id = Number(trfProdutoId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const quantidade = clampInt(trfQtd);
        const solicitante_usuario_id = Number(trfSolicitanteId);

        if (!produto_id) return alert('Selecione um produto.');
        if (!deposito_origem_id || !deposito_destino_id) return alert('Selecione depósitos.');
        if (deposito_origem_id === deposito_destino_id) return alert('Origem e destino não podem ser iguais.');
        if (quantidade <= 0) return alert('Quantidade inválida.');
        if (!solicitante_usuario_id) return alert('Selecione o solicitante.');

        const s = saldosMap.get(`${produto_id}::${deposito_origem_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) return alert(`Quantidade maior que disponível na origem (${atual}).`);

        const r = await apiPost<{ ok: boolean; msg?: string }>({
            action: 'transferencia',
            produto_id,
            deposito_origem_id,
            deposito_destino_id,
            quantidade,
            solicitante_usuario_id,
            observacao: trfObs.trim() || undefined,
        });

        if (!r.ok) return alert(r.msg || 'Falha na transferência.');

        setTrfQtd(1);
        setTrfObs('');
        await refreshInit();
        setTab('ESTOQUE');
    }

    // ======= AVANÇADO (depósitos) =======
    const [novoDepNome, setNovoDepNome] = useState('');
    const [renomearDepId, setRenomearDepId] = useState<ID>(0);
    const [renomearDepNome, setRenomearDepNome] = useState('');
    const [busyDep, setBusyDep] = useState(false);

    useEffect(() => {
        if (!renomearDepId && depositos[0]?.id) {
            setRenomearDepId(depositos[0].id);
            setRenomearDepNome(depositos[0].nome);
        }
    }, [depositos, renomearDepId]);

    useEffect(() => {
        const d = depositos.find((x) => x.id === renomearDepId);
        if (d) setRenomearDepNome(d.nome);
    }, [renomearDepId, depositos]);

    async function criarDeposito() {
        const nome = novoDepNome.trim();
        if (!nome) return alert('Informe o nome do depósito.');
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({ action: 'deposito_criar', nome });
            if (!r.ok) return alert(r.msg || 'Falha ao criar depósito.');
            setNovoDepNome('');
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    async function renomearDeposito() {
        const deposito_id = Number(renomearDepId);
        const nome = renomearDepNome.trim();
        if (!deposito_id) return alert('Selecione o depósito.');
        if (!nome) return alert('Informe o novo nome.');
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({ action: 'deposito_renomear', deposito_id, nome });
            if (!r.ok) return alert(r.msg || 'Falha ao renomear.');
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    function exportarDeposito(deposito_id: ID) {
        // abre download CSV via proxy
        const url = `${API_BASE}?export_deposito_id=${deposito_id}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    // ======= HOME =======
    const headerRight = (
        <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                Alertas: {alertCount}
            </span>
            <Button variant="ghost" onClick={refreshInit} disabled={loading}>
                Atualizar
            </Button>
        </div>
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Admin do Estoque</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Entrada, Saída, Transferência, Estoque por depósito, Alertas e Avançado (depósitos + export).
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Operador (fixo): <b>{me ? `${me.nome} (${me.usuario})` : '—'}</b>
                        </p>
                    </div>
                    {headerRight}
                </div>

                {/* Estado inicial */}
                {initErr ? (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {initErr}{' '}
                        <button className="underline" onClick={refreshInit}>
                            Tentar novamente
                        </button>
                    </div>
                ) : null}

                {/* Tabs */}
                <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                    {[
                        ['HOME', 'Principal'],
                        ['ENTRADA', 'Entrada'],
                        ['SAIDA', 'Saída'],
                        ['TRANSFERENCIA', 'Transferência'],
                        ['ESTOQUE', 'Estoque'],
                        ['ALERTAS', 'Alertas'],
                        ['AVANCADO', 'Avançado'],
                    ].map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k as UiTab)}
                            className={[
                                'rounded-xl px-3 py-2 text-sm font-medium',
                                tab === (k as UiTab) ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Conteúdo */}
                <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* HOME */}
                    {tab === 'HOME' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Entrada</p>
                                    <p className="mt-1 text-xs text-slate-600">Cadastrar (se não existir) e somar saldo no depósito.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setEntradaOpen(true)}>Abrir Entrada</Button>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Saída</p>
                                    <p className="mt-1 text-xs text-slate-600">Escolha depósito, solicitante, destino e quantidade.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setSaidaOpen(true)}>Abrir Saída</Button>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Alertas</p>
                                    <p className="mt-1 text-xs text-slate-600">Itens com saldo ≤ mínimo (precisa reposição).</p>
                                    <div className="mt-3">
                                        <Button variant="ghost" onClick={() => setTab('ALERTAS')}>
                                            Ver Alertas ({alertCount})
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                Dica: na Entrada/Saída você pode usar <b>câmera</b> para ler o código de barras (se o navegador suportar).
                            </div>
                        </section>
                    ) : null}

                    {/* ENTRADA */}
                    {tab === 'ENTRADA' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Entrada</h2>
                                    <p className="mt-1 text-sm text-slate-600">Leia/digite o código de barras. Se não existir, cadastre o produto.</p>
                                </div>
                                <Button onClick={() => setEntradaOpen(true)} variant="ghost">
                                    Abrir Entrada
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    {/* SAÍDA */}
                    {tab === 'SAIDA' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Saída</h2>
                                    <p className="mt-1 text-sm text-slate-600">Pode escanear por câmera ou pesquisar manualmente (filtrando por depósito).</p>
                                </div>
                                <Button onClick={() => setSaidaOpen(true)} variant="ghost">
                                    Abrir Saída
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    {/* TRANSFERÊNCIA */}
                    {tab === 'TRANSFERENCIA' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Transferência entre Depósitos</h2>
                                    <p className="mt-1 text-sm text-slate-600">Pesquisa e filtro por depósito de origem. Move quantidade de origem para destino.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <Field label="Origem (Depósito)">
                                        <Select value={trfOrigemId} onChange={(e) => setTrfOrigemId(Number(e.target.value))}>
                                            {depositos.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Destino (Depósito)">
                                        <Select value={trfDestinoId} onChange={(e) => setTrfDestinoId(Number(e.target.value))}>
                                            {depositos.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Solicitante">
                                        <Select value={trfSolicitanteId} onChange={(e) => setTrfSolicitanteId(Number(e.target.value))}>
                                            {usuarios.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nome} ({u.usuario})
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <div className="sm:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <Field label="Buscar produto (nome/código)">
                                            <TextInput value={trfBusca} onChange={(e) => setTrfBusca(e.target.value)} placeholder="Ex: URNA ou 174501..." />
                                        </Field>

                                        <Field label="Produto (na origem)">
                                            <Select value={trfProdutoId} onChange={(e) => setTrfProdutoId(Number(e.target.value))}>
                                                {trfProdutosNaOrigem.length ? (
                                                    trfProdutosNaOrigem.map((p) => {
                                                        const s = saldosMap.get(`${p.id}::${trfOrigemId}`);
                                                        const qtd = s ? clampInt(s.quantidade) : 0;
                                                        return (
                                                            <option key={p.id} value={p.id}>
                                                                {p.nome} — CB:{p.codigo_barras} — disp:{qtd}
                                                            </option>
                                                        );
                                                    })
                                                ) : (
                                                    <option value={0}>Sem itens no depósito</option>
                                                )}
                                            </Select>
                                        </Field>

                                        <Field label="Quantidade">
                                            <TextInput type="number" min={1} step={1} value={trfQtd} onChange={(e) => setTrfQtd(Number(e.target.value))} />
                                        </Field>

                                        <div className="sm:col-span-3">
                                            <Field label="Observação (opcional)">
                                                <TextArea value={trfObs} onChange={(e) => setTrfObs(e.target.value)} placeholder="Detalhes da transferência..." />
                                            </Field>
                                        </div>

                                        <div className="sm:col-span-3 flex flex-wrap gap-2">
                                            <Button onClick={applyTransferencia} disabled={!trfProdutosNaOrigem.length}>
                                                Confirmar transferência
                                            </Button>
                                            <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                                Ir para Estoque
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {/* ESTOQUE */}
                    {tab === 'ESTOQUE' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Estoque (por depósito)</h2>
                                    <p className="mt-1 text-sm text-slate-600">Busca por nome/código e filtro por depósito. (Mostrando linhas que têm saldo.)</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={() => setEntradaOpen(true)}>
                                        Entrada
                                    </Button>
                                    <Button variant="ghost" onClick={() => setSaidaOpen(true)}>
                                        Saída
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <Field label="Pesquisar">
                                    <TextInput value={qEstoque} onChange={(e) => setQEstoque(e.target.value)} placeholder="Nome, código, depósito..." />
                                </Field>

                                <Field label="Depósito">
                                    <Select value={depFiltroEstoque} onChange={(e) => setDepFiltroEstoque(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value))}>
                                        <option value="Todos">Todos</option>
                                        {depositos.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Somente alerta (≤ mínimo)">
                                    <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                                        <input
                                            id="onlyLow"
                                            type="checkbox"
                                            checked={onlyLow}
                                            onChange={(e) => setOnlyLow(e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        <label htmlFor="onlyLow" className="text-sm text-slate-700">
                                            Mostrar
                                        </label>
                                    </div>
                                </Field>

                                <Field label="Ações">
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setTab('ALERTAS')}>
                                            Alertas ({alertCount})
                                        </Button>
                                        <Button variant="ghost" onClick={() => setTab('AVANCADO')}>
                                            Avançado
                                        </Button>
                                    </div>
                                </Field>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {loading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : estoqueRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {estoqueRows.map(({ p, d, qtd, s }) => {
                                            const min = clampInt(p.minimo);
                                            const low = qtd <= min;
                                            const valorNum = Number(p.valor) || 0;

                                            return (
                                                <li key={`${p.id}_${d.id}`}>
                                                    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <PhotoThumb url={p.foto_url} />
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-slate-900">
                                                                    {p.nome} {low ? <span className="text-xs text-red-600">• alerta</span> : null}
                                                                </p>
                                                                <p className="mt-0.5 truncate text-xs text-slate-600">
                                                                    CB: <b>{p.codigo_barras}</b> • Depósito: <b>{d.nome}</b> • Valor: {moneyBRL(valorNum)}
                                                                </p>
                                                                <p className="mt-0.5 text-[11px] text-slate-500">
                                                                    Atualizado: {s?.atualizado_em ? fmtDateTime(s.atualizado_em) : '—'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <p className="text-sm font-semibold text-slate-900">{qtd}</p>
                                                            <p className="text-xs text-slate-500">mín {min}</p>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </section>
                    ) : null}

                    {/* ALERTAS */}
                    {tab === 'ALERTAS' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Alertas (Reposição)</h2>
                                    <p className="mt-1 text-sm text-slate-600">Lista dos itens com quantidade ≤ mínimo.</p>
                                </div>
                                <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                    Voltar ao Estoque
                                </Button>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {alertRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum item em alerta 🎉</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {alertRows.map(({ p, d, qtd, min }) => (
                                            <li key={`${p.id}_${d.id}`} className="px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-900">{p.nome}</p>
                                                        <p className="mt-0.5 truncate text-xs text-slate-600">
                                                            CB: <b>{p.codigo_barras}</b> • Depósito: <b>{d.nome}</b>
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-semibold text-red-700">{qtd}</p>
                                                        <p className="text-xs text-slate-500">mín {min}</p>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button onClick={() => setEntradaOpen(true)}>Fazer Entrada</Button>
                                <Button variant="ghost" onClick={() => setTab('AVANCADO')}>
                                    Exportar por Depósito
                                </Button>
                            </div>
                        </section>
                    ) : null}

                    {/* AVANÇADO */}
                    {tab === 'AVANCADO' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Avançado</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Depósitos: criar, renomear e exportar CSV para conferência. (Exclusão desabilitada.)
                                    </p>
                                </div>
                                <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                    Voltar
                                </Button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar Depósito</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <Field label="Nome do novo depósito">
                                            <TextInput value={novoDepNome} onChange={(e) => setNovoDepNome(e.target.value)} placeholder="Ex: Almox C" />
                                        </Field>
                                        <Button onClick={criarDeposito} disabled={busyDep || !novoDepNome.trim()}>
                                            Criar depósito
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear Depósito</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <Field label="Depósito">
                                            <Select value={renomearDepId} onChange={(e) => setRenomearDepId(Number(e.target.value))}>
                                                {depositos.map((d) => (
                                                    <option key={d.id} value={d.id}>
                                                        {d.nome}
                                                    </option>
                                                ))}
                                            </Select>
                                        </Field>
                                        <Field label="Novo nome">
                                            <TextInput value={renomearDepNome} onChange={(e) => setRenomearDepNome(e.target.value)} />
                                        </Field>
                                        <Button onClick={renomearDeposito} disabled={busyDep || !renomearDepId || !renomearDepNome.trim()}>
                                            Renomear
                                        </Button>

                                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                            Observação: não há opção de excluir depósito (por segurança).
                                        </div>
                                    </div>
                                </div>

                                <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Exportação para Conferência (CSV)</p>
                                    <p className="mt-1 text-xs text-slate-600">Exporta a lista do depósito com quantidade (inclui itens sem saldo como 0).</p>

                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        {depositos.map((d) => (
                                            <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                                    <p className="text-[11px] text-slate-500">CSV para conferência</p>
                                                </div>
                                                <Button variant="ghost" onClick={() => exportarDeposito(d.id)}>
                                                    Exportar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>

            {/* ===== MODAL: ENTRADA ===== */}
            <Modal
                open={entradaOpen}
                title="Entrada"
                subtitle="Leia/digite o código (ou use a câmera). Se não existir, preencha dados do produto."
                onClose={() => setEntradaOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Código de barras">
                        <div className="flex gap-2">
                            <TextInput
                                value={entradaBarcode}
                                onChange={(e) => setEntradaBarcode(e.target.value)}
                                placeholder="Leia com leitor ou digite"
                                inputMode="numeric"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        // só dispara UI — se não existir, aparece bloco de cadastro
                                        if (!entradaBarcode.trim()) return;
                                        // nada a fazer aqui, pois o bloco já reage ao estado
                                    }
                                }}
                            />
                            <Button variant="ghost" type="button" onClick={() => setEntradaScanOpen(true)} title="Abrir câmera">
                                📷 Escanear
                            </Button>
                        </div>
                    </Field>

                    <Field label="Depósito (entrada)">
                        <Select value={entradaDepositoId} onChange={(e) => setEntradaDepositoId(Number(e.target.value))}>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Quantidade (entrada)">
                        <TextInput type="number" min={1} step={1} value={entradaQtd} onChange={(e) => setEntradaQtd(Number(e.target.value))} />
                    </Field>

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea value={entradaObs} onChange={(e) => setEntradaObs(e.target.value)} placeholder="Detalhes da entrada..." />
                        </Field>
                    </div>

                    {!entradaProdutoExistente && entradaBarcode.trim() ? (
                        <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">Produto novo (código não encontrado)</p>
                            <p className="mt-1 text-xs text-slate-600">Preencha para cadastrar junto com a entrada.</p>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Nome do produto">
                                    <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: URNA 008 ..." />
                                </Field>

                                <Field label="Valor">
                                    <TextInput type="number" step="0.01" value={novoValor} onChange={(e) => setNovoValor(Number(e.target.value))} />
                                </Field>

                                <Field label="Mínimo (alerta)">
                                    <TextInput type="number" min={0} step={1} value={novoMin} onChange={(e) => setNovoMin(Number(e.target.value))} />
                                </Field>

                                <Field label="Foto (arquivo)">
                                    <TextInput
                                        type="file"
                                        accept="image/*"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            await onEntradaFoto(file);
                                        }}
                                    />
                                </Field>

                                {novoFoto ? (
                                    <div className="sm:col-span-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={novoFoto} alt="Prévia" className="h-40 w-full rounded-2xl border border-slate-200 object-cover" />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applyEntrada} disabled={loading}>
                            Confirmar entrada
                        </Button>
                        <Button variant="ghost" onClick={() => setEntradaOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Scanner Entrada */}
            <BarcodeScannerModal
                open={entradaScanOpen}
                title="Escanear código de barras (Entrada)"
                onClose={() => setEntradaScanOpen(false)}
                onDetected={(code) => setEntradaBarcode(code)}
            />

            {/* ===== MODAL: SAÍDA ===== */}
            <Modal
                open={saidaOpen}
                title="Saída"
                subtitle="Filtre pelo depósito, procure o produto, ou escaneie por câmera. Operador é fixo."
                onClose={() => setSaidaOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Depósito (origem)">
                        <Select value={saidaDepositoId} onChange={(e) => setSaidaDepositoId(Number(e.target.value))}>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Código de barras (opcional)">
                        <div className="flex gap-2">
                            <TextInput
                                value={saidaBarcode}
                                onChange={(e) => setSaidaBarcode(e.target.value)}
                                placeholder="Escaneie ou digite"
                                inputMode="numeric"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const code = saidaBarcode.trim();
                                        if (code) onSaidaBarcodePick(code);
                                    }
                                }}
                            />
                            <Button variant="ghost" type="button" onClick={() => setSaidaScanOpen(true)} title="Abrir câmera">
                                📷 Escanear
                            </Button>
                        </div>
                    </Field>

                    <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Buscar produto (nome/código)">
                            <TextInput value={saidaBusca} onChange={(e) => setSaidaBusca(e.target.value)} placeholder="Ex: URNA ou 174501..." />
                        </Field>

                        <Field label="Produto (no depósito)">
                            <Select value={saidaProdutoId} onChange={(e) => setSaidaProdutoId(Number(e.target.value))}>
                                {saidaProdutosNoDeposito.length ? (
                                    saidaProdutosNoDeposito.map((p) => {
                                        const s = saldosMap.get(`${p.id}::${saidaDepositoId}`);
                                        const qtd = s ? clampInt(s.quantidade) : 0;
                                        return (
                                            <option key={p.id} value={p.id}>
                                                {p.nome} — CB:{p.codigo_barras} — disp:{qtd}
                                            </option>
                                        );
                                    })
                                ) : (
                                    <option value={0}>Sem itens no depósito</option>
                                )}
                            </Select>
                        </Field>
                    </div>

                    <Field label="Quantidade">
                        <TextInput type="number" min={1} step={1} value={saidaQtd} onChange={(e) => setSaidaQtd(Number(e.target.value))} />
                    </Field>

                    <Field label="Solicitante">
                        <Select value={saidaSolicitanteId} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value))}>
                            {usuarios.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome} ({u.usuario})
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="sm:col-span-2">
                        <Field label="Destino (obra/setor/local)">
                            <TextInput value={saidaDestino} onChange={(e) => setSaidaDestino(e.target.value)} placeholder="Ex: Obra X / Setor Y" />
                        </Field>
                    </div>

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} placeholder="Detalhes da saída..." />
                        </Field>
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applySaida} disabled={loading || !saidaProdutosNoDeposito.length || !saidaProdutoId}>
                            Confirmar saída
                        </Button>
                        <Button variant="ghost" onClick={() => setSaidaOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Scanner Saída */}
            <BarcodeScannerModal
                open={saidaScanOpen}
                title="Escanear código de barras (Saída)"
                onClose={() => setSaidaScanOpen(false)}
                onDetected={(code) => onSaidaBarcodePick(code)}
            />
        </main>
    );
}
