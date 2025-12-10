'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

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
    need_login?: 1;
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

type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    total?: number;
    msg?: string;
    need_login?: 1;
};

type UiTab =
    | 'HOME'
    | 'ENTRADA'
    | 'SAIDA'
    | 'TRANSFERENCIA'
    | 'ESTOQUE'
    | 'ALERTAS'
    | 'HISTORICO'
    | 'AVANCADO';

const API_BASE = '/api/php/estoque_admin.php';

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
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`Resposta inesperada (${ct}).`);
    return (await r.json()) as T;
}

async function apiPost<T>(body: any) {
    const r = await fetch(API_BASE, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return (await r.json()) as T & { ok?: boolean; msg?: string; need_login?: 1 };
}

/* =========================
   UI KIT (padronizado)
========================= */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <section className={['rounded-2xl border border-slate-200 bg-white shadow-sm', className].join(' ')}>{children}</section>;
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost' | 'soft' }) {
    const cls =
        variant === 'solid'
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : variant === 'soft'
                ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
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

function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
            {children}
        </span>
    );
}

/* =========================
   MODAL (centralizado real)
========================= */

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
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className={['fixed inset-0 z-50', 'flex items-center justify-center', 'bg-black/45', 'min-h-[100dvh] p-4'].join(' ')}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button
                        className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        aria-label="Fechar"
                        type="button"
                    >
                        ✕
                    </button>
                </div>

                <div className="max-h-[82dvh] overflow-y-auto p-4">{children}</div>
            </div>
        </div>
    );
}

/* =========================
   POPUP IMAGEM (zoom)
========================= */

function ImagePreviewModal({
    open,
    onClose,
    url,
    title,
}: {
    open: boolean;
    onClose: () => void;
    url?: string | null;
    title?: string;
}) {
    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center bg-black/70 p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title || 'Imagem do produto'}</h2>
                        <p className="mt-1 text-sm text-slate-600">Clique fora para fechar.</p>
                    </div>
                    <button className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
                        ✕
                    </button>
                </div>

                <div className="max-h-[82dvh] overflow-auto p-4">
                    {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={title || 'Imagem do produto'} className="mx-auto max-h-[76dvh] w-auto max-w-full rounded-2xl border border-slate-200 object-contain" />
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                            Produto sem imagem.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================
   FOTO MINIATURA CLICÁVEL
========================= */

function PhotoThumb({
    url,
    onClick,
}: {
    url?: string | null;
    onClick?: () => void;
}) {
    const clickable = !!url && !!onClick;

    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            className={[
                'relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600',
                clickable ? 'cursor-zoom-in hover:ring-2 hover:ring-slate-200' : 'cursor-default',
            ].join(' ')}
            aria-label={clickable ? 'Abrir imagem do produto' : 'Sem imagem'}
            title={clickable ? 'Clique para ampliar' : 'Sem imagem'}
        >
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Foto do produto" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
                <span className="text-lg">🖼️</span>
            )}

            {clickable ? (
                <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow ring-1 ring-slate-200">
                    🔍
                </span>
            ) : null}
        </button>
    );
}

/* =========================
   SCANNER (retângulo estreito)
========================= */

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
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const [err, setErr] = useState<string>('');

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setErr('');

        const start = async () => {
            try {
                const codeReader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                const backCam = devices.find((d) => /back|traseira|environment/i.test(d.label))?.deviceId || devices[0]?.deviceId;

                if (!videoRef.current) throw new Error('Vídeo não disponível.');

                const controls = await codeReader.decodeFromVideoDevice(backCam ?? undefined, videoRef.current, (result) => {
                    if (cancelled) return;
                    if (result) {
                        const text = result.getText().trim();
                        if (text) {
                            onDetected(text);
                            onClose();
                        }
                    }
                });

                controlsRef.current = { stop: () => controls.stop() };
            } catch (e: any) {
                setErr(e?.message || 'Não foi possível abrir a câmera.');
            }
        };

        start();

        return () => {
            cancelled = true;
            try {
                controlsRef.current?.stop();
            } catch { }
            controlsRef.current = null;

            const el = videoRef.current;
            if (el?.srcObject) {
                const tracks = (el.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
                (el.srcObject as any) = null;
            }
        };
    }, [open, onClose, onDetected]);

    return (
        <Modal open={open} title={title} subtitle="Aponte para o código. Ao detectar, preenche automaticamente." onClose={onClose}>
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            ) : (
                <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                        <video ref={videoRef} className="h-[320px] w-full object-cover sm:h-[420px]" playsInline muted />

                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute inset-0 bg-black/25" />

                            <div className="absolute left-1/2 top-1/2 w-[92%] max-w-[560px] -translate-x-1/2 -translate-y-1/2">
                                <div className="relative mx-auto h-[110px] w-full rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                <p className="mt-2 text-center text-xs text-white/90">Centralize o código dentro do retângulo</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   TABS (menu responsivo top)
========================= */

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            type="button"
            className={[
                'w-full rounded-xl px-3 py-2 text-sm font-medium transition',
                active ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200',
            ].join(' ')}
        >
            {label}
        </button>
    );
}

/* =========================
   PAGE
========================= */

export default function Page() {
    const [tab, setTab] = useState<UiTab>('HOME');

    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState<string>('');

    const [me, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // === imagem popup ===
    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState<string>('');

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

    // ======= ALERTAS =======
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

    // ======= ESTOQUE =======
    const [qEstoque, setQEstoque] = useState('');
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID | 'Todos'>('Todos');
    const [onlyLow, setOnlyLow] = useState(false);

    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; s?: Saldo }> = [];

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
    const [entradaDepositoId, setEntradaDepositoId] = useState<ID>(0);
    const [entradaQtd, setEntradaQtd] = useState<number>(1);
    const [entradaObs, setEntradaObs] = useState('');

    const [novoNome, setNovoNome] = useState('');
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>('');

    useEffect(() => {
        if (depositos.length && !entradaDepositoId) setEntradaDepositoId(depositos[0].id);
    }, [depositos, entradaDepositoId]);

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

        if (!entradaProdutoExistente) {
            const nome = novoNome.trim();
            if (!nome) return alert('Produto novo: informe o nome.');
            payload.nome = nome;
            payload.valor = Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0;
            payload.minimo = clampInt(novoMin);
            payload.foto_url = novoFoto || '';
        }

        const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
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

    const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(0);
    const [saidaBusca, setSaidaBusca] = useState('');
    const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
    const [saidaBarcode, setSaidaBarcode] = useState('');
    const [saidaQtd, setSaidaQtd] = useState<number>(1);
    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
    const [saidaDestino, setSaidaDestino] = useState('');
    const [saidaObs, setSaidaObs] = useState('');

    useEffect(() => {
        if (depositos.length && !saidaDepositoId) setSaidaDepositoId(depositos[0].id);
    }, [depositos, saidaDepositoId]);

    useEffect(() => {
        if (!saidaSolicitanteId && usuarios[0]?.id) setSaidaSolicitanteId(usuarios[0].id);
    }, [usuarios, saidaSolicitanteId]);

    const saidaProdutosNoDeposito = useMemo(() => {
        const depId = Number(saidaDepositoId);
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        const qq = saidaBusca.trim().toLowerCase();
        return produtos
            .filter((p) => ids.has(p.id))
            .filter((p) => (!qq ? true : `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq)))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [saldos, produtos, saidaDepositoId, saidaBusca]);

    useEffect(() => {
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
        return produtos
            .filter((p) => ids.has(p.id))
            .filter((p) => (!qq ? true : `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq)))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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

    // ======= AVANÇADO =======
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
        const url = `${API_BASE}?export_deposito_id=${deposito_id}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    // ======= HISTÓRICO =======
    const [histLoading, setHistLoading] = useState(false);
    const [histErr, setHistErr] = useState('');
    const [histRows, setHistRows] = useState<HistoricoRow[]>([]);
    const [histQ, setHistQ] = useState('');
    const [histTipo, setHistTipo] = useState<'Todos' | HistoricoRow['tipo']>('Todos');
    const [histDep, setHistDep] = useState<ID | 'Todos'>('Todos');
    const [histFrom, setHistFrom] = useState('');
    const [histTo, setHistTo] = useState('');
    const [histLimit, setHistLimit] = useState(80);
    const [histOffset, setHistOffset] = useState(0);
    const [histTotal, setHistTotal] = useState<number | undefined>(undefined);

    async function loadHistorico(nextOffset?: number) {
        setHistLoading(true);
        setHistErr('');
        try {
            const o = nextOffset ?? histOffset;
            const resp = await apiGet<HistoricoResp>({
                historico: 1,
                limit: histLimit,
                offset: o,
                q: histQ.trim() || undefined,
                tipo: histTipo !== 'Todos' ? histTipo : undefined,
                deposito_id: histDep !== 'Todos' ? histDep : undefined,
                from: histFrom || undefined,
                to: histTo || undefined,
            });
            if (!resp.ok) throw new Error(resp.msg || 'Falha ao carregar histórico.');
            setHistRows(resp.rows || []);
            setHistTotal(resp.total);
            setHistOffset(o);
        } catch (e: any) {
            setHistErr(e?.message || 'Erro ao carregar histórico.');
        } finally {
            setHistLoading(false);
        }
    }

    useEffect(() => {
        if (tab === 'HISTORICO') loadHistorico(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const tabs = useMemo(
        () =>
            [
                ['HOME', 'Principal'],
                ['ENTRADA', 'Entrada'],
                ['SAIDA', 'Saída'],
                ['TRANSFERENCIA', 'Transferência'],
                ['ESTOQUE', 'Estoque'],
                ['ALERTAS', `Alertas (${alertCount})`],
                ['HISTORICO', 'Histórico'],
                ['AVANCADO', 'Avançado'],
            ] as const,
        [alertCount]
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
                <Card className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Admin do Estoque</h1>
                            <p className="mt-1 text-sm text-slate-600">Entrada, Saída, Transferência, Estoque por depósito, Alertas, Histórico e Avançado.</p>
                            <p className="mt-1 text-xs text-slate-500">
                                Operador (fixo): <b>{me ? `${me.nome} (${me.usuario})` : '—'}</b>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Badge>Alertas: {alertCount}</Badge>
                            <Button variant="ghost" onClick={refreshInit} disabled={loading} type="button">
                                Atualizar
                            </Button>
                        </div>
                    </div>

                    {initErr ? (
                        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {initErr}{' '}
                            <button className="underline" onClick={refreshInit} type="button">
                                Tentar novamente
                            </button>
                        </div>
                    ) : null}
                </Card>

                <div className="mt-4">
                    <div className="grid grid-cols-2 gap-2 sm:hidden">
                        {tabs.map(([k, label]) => (
                            <TabButton key={k} label={label} active={tab === (k as UiTab)} onClick={() => setTab(k as UiTab)} />
                        ))}
                    </div>

                    <Card className="hidden p-2 sm:block">
                        <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
                            {tabs.map(([k, label]) => (
                                <TabButton key={k} label={label} active={tab === (k as UiTab)} onClick={() => setTab(k as UiTab)} />
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* HOME */}
                    {tab === 'HOME' ? (
                        <Card className="p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Entrada</p>
                                    <p className="mt-1 text-xs text-slate-600">Cadastrar (se não existir) e somar saldo no depósito.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setEntradaOpen(true)} type="button">
                                            Abrir Entrada
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Saída</p>
                                    <p className="mt-1 text-xs text-slate-600">Escolha depósito, solicitante, destino e quantidade.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setSaidaOpen(true)} type="button">
                                            Abrir Saída
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Histórico</p>
                                    <p className="mt-1 text-xs text-slate-600">Auditoria: entradas/saídas/transferências e cadastros.</p>
                                    <div className="mt-3">
                                        <Button variant="ghost" onClick={() => setTab('HISTORICO')} type="button">
                                            Ver Histórico
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                Dica: na Entrada/Saída você pode usar <b>câmera</b> para ler o código de barras.
                            </div>
                        </Card>
                    ) : null}

                    {/* ENTRADA */}
                    {tab === 'ENTRADA' ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Entrada</h2>
                                    <p className="mt-1 text-sm text-slate-600">Leia/digite o código de barras. Se não existir, cadastre o produto.</p>
                                </div>
                                <Button onClick={() => setEntradaOpen(true)} variant="ghost" type="button">
                                    Abrir Entrada
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {/* SAÍDA */}
                    {tab === 'SAIDA' ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Saída</h2>
                                    <p className="mt-1 text-sm text-slate-600">Pode escanear por câmera ou pesquisar manualmente (filtrando por depósito).</p>
                                </div>
                                <Button onClick={() => setSaidaOpen(true)} variant="ghost" type="button">
                                    Abrir Saída
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {/* TRANSFERÊNCIA */}
                    {tab === 'TRANSFERENCIA' ? (
                        <Card className="p-4">
                            {/* ... mantém igual ao seu (sem alteração) ... */}
                            <div className="flex flex-col gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Transferência entre Depósitos</h2>
                                    <p className="mt-1 text-sm text-slate-600">Move quantidade de origem para destino (com validação de saldo).</p>
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
                                            <Button onClick={applyTransferencia} disabled={!trfProdutosNaOrigem.length} type="button">
                                                Confirmar transferência
                                            </Button>
                                            <Button variant="ghost" onClick={() => setTab('ESTOQUE')} type="button">
                                                Ir para Estoque
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    {/* ESTOQUE */}
                    {tab === 'ESTOQUE' ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Estoque (por depósito)</h2>
                                    <p className="mt-1 text-sm text-slate-600">Busca por nome/código e filtro por depósito. (Mostrando linhas que têm saldo.)</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={() => setEntradaOpen(true)} type="button">
                                        Entrada
                                    </Button>
                                    <Button variant="ghost" onClick={() => setSaidaOpen(true)} type="button">
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
                                        <input id="onlyLow" type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" />
                                        <label htmlFor="onlyLow" className="text-sm text-slate-700">
                                            Mostrar
                                        </label>
                                    </div>
                                </Field>

                                <Field label="Ações">
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setTab('ALERTAS')} type="button">
                                            Alertas ({alertCount})
                                        </Button>
                                        <Button variant="ghost" onClick={() => setTab('HISTORICO')} type="button">
                                            Histórico
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
                                                            <PhotoThumb
                                                                url={p.foto_url}
                                                                onClick={() => {
                                                                    if (!p.foto_url) return;
                                                                    setImgUrl(p.foto_url);
                                                                    setImgTitle(p.nome);
                                                                    setImgOpen(true);
                                                                }}
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-slate-900">
                                                                    {p.nome} {low ? <span className="text-xs text-red-600">• alerta</span> : null}
                                                                </p>
                                                                <p className="mt-0.5 truncate text-xs text-slate-600">
                                                                    CB: <b>{p.codigo_barras}</b> • Depósito: <b>{d.nome}</b> • Valor: {moneyBRL(valorNum)}
                                                                </p>
                                                                <p className="mt-0.5 text-[11px] text-slate-500">Atualizado: {s?.atualizado_em ? fmtDateTime(s.atualizado_em) : '—'}</p>
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
                        </Card>
                    ) : null}

                    {/* ALERTAS */}
                    {tab === 'ALERTAS' ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Alertas (Reposição)</h2>
                                    <p className="mt-1 text-sm text-slate-600">Lista dos itens com quantidade ≤ mínimo.</p>
                                </div>
                                <Button variant="ghost" onClick={() => setTab('ESTOQUE')} type="button">
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
                                <Button onClick={() => setEntradaOpen(true)} type="button">
                                    Fazer Entrada
                                </Button>
                                <Button variant="ghost" onClick={() => setTab('HISTORICO')} type="button">
                                    Ver Histórico
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {/* HISTÓRICO */}
                    {tab === 'HISTORICO' ? (
                        <Card className="p-4">
                            {/* ... mantém igual ao seu (sem alteração relevante) ... */}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Histórico</h2>
                                    <p className="mt-1 text-sm text-slate-600">Auditoria de movimentações (Entrada/Saída/Transferência + Cadastro).</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={() => loadHistorico(0)} disabled={histLoading} type="button">
                                        Atualizar
                                    </Button>
                                </div>
                            </div>

                            {histErr ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{histErr}</div> : null}

                            {/* filtros */}
                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-2">
                                    <Field label="Buscar (produto, CB, destino, obs)">
                                        <TextInput value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Ex: URNA, 1745..., Obra X" />
                                    </Field>
                                </div>

                                <Field label="Tipo">
                                    <Select value={histTipo} onChange={(e) => setHistTipo(e.target.value as any)}>
                                        <option value="Todos">Todos</option>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                        <option value="TRANSFERENCIA">Transferência</option>
                                        <option value="CADASTRO_PRODUTO">Cadastro produto</option>
                                    </Select>
                                </Field>

                                <Field label="Depósito (origem/destino)">
                                    <Select value={histDep} onChange={(e) => setHistDep(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value))}>
                                        <option value="Todos">Todos</option>
                                        {depositos.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="De (data)">
                                    <TextInput type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
                                </Field>

                                <Field label="Até (data)">
                                    <TextInput type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
                                </Field>

                                <div className="sm:col-span-6 flex flex-wrap gap-2">
                                    <Button onClick={() => loadHistorico(0)} disabled={histLoading} type="button">
                                        Filtrar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setHistQ('');
                                            setHistTipo('Todos');
                                            setHistDep('Todos');
                                            setHistFrom('');
                                            setHistTo('');
                                            setHistOffset(0);
                                            setTimeout(() => loadHistorico(0), 0);
                                        }}
                                        disabled={histLoading}
                                        type="button"
                                    >
                                        Limpar
                                    </Button>

                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-xs text-slate-500">{histTotal !== undefined ? `Total: ${histTotal}` : `Mostrando: ${histRows.length}`}</span>
                                        <Select value={histLimit} onChange={(e) => setHistLimit(Number(e.target.value))} className="w-[120px]">
                                            <option value={40}>40</option>
                                            <option value={80}>80</option>
                                            <option value={120}>120</option>
                                            <option value={200}>200</option>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {histLoading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : histRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {histRows.map((h) => {
                                            const tipoBadge =
                                                h.tipo === 'ENTRADA'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : h.tipo === 'SAIDA'
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                        : h.tipo === 'TRANSFERENCIA'
                                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                            : 'bg-slate-50 text-slate-700 border-slate-200';

                                            const origem = h.deposito_origem_nome || (h.deposito_origem_id ? depById.get(h.deposito_origem_id)?.nome : null);
                                            const destino = h.deposito_destino_nome || (h.deposito_destino_id ? depById.get(h.deposito_destino_id)?.nome : null);

                                            return (
                                                <li key={h.id} className="px-4 py-3">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tipoBadge}`}>{h.tipo}</span>
                                                                <span className="text-xs text-slate-500">{fmtDateTime(h.criado_em)}</span>
                                                            </div>

                                                            <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                                                                {h.produto_nome || `Produto ${h.produto_id}`}{' '}
                                                                <span className="text-xs font-normal text-slate-500">• CB {h.codigo_barras_snapshot}</span>
                                                            </p>

                                                            <p className="mt-0.5 text-xs text-slate-600">
                                                                {h.tipo === 'ENTRADA' ? (
                                                                    <>
                                                                        Depósito: <b>{destino || '—'}</b>
                                                                    </>
                                                                ) : h.tipo === 'SAIDA' ? (
                                                                    <>
                                                                        Depósito: <b>{origem || '—'}</b> • Destino: <b>{h.destino_texto || '—'}</b>
                                                                    </>
                                                                ) : h.tipo === 'TRANSFERENCIA' ? (
                                                                    <>
                                                                        Origem: <b>{origem || '—'}</b> → Destino: <b>{destino || '—'}</b>
                                                                    </>
                                                                ) : (
                                                                    <>—</>
                                                                )}
                                                            </p>

                                                            <p className="mt-0.5 text-[11px] text-slate-500">
                                                                Operador: <b>{h.operador_nome || userById.get(h.operador_usuario_id)?.nome || `#${h.operador_usuario_id}`}</b>
                                                                {h.solicitante_usuario_id ? (
                                                                    <>
                                                                        {' '}
                                                                        • Solicitante:{' '}
                                                                        <b>{h.solicitante_nome || userById.get(h.solicitante_usuario_id)?.nome || `#${h.solicitante_usuario_id}`}</b>
                                                                    </>
                                                                ) : null}
                                                                {h.observacao ? <> • Obs: {h.observacao}</> : null}
                                                            </p>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <p className="text-sm font-semibold text-slate-900">{h.quantidade === null ? '—' : h.quantidade}</p>
                                                            <p className="text-xs text-slate-500">qtd</p>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button variant="ghost" onClick={() => loadHistorico(Math.max(0, histOffset - histLimit))} disabled={histLoading || histOffset <= 0} type="button">
                                    ← Anterior
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => loadHistorico(histOffset + histLimit)}
                                    disabled={histLoading || (histTotal !== undefined ? histOffset + histLimit >= histTotal : histRows.length < histLimit)}
                                    type="button"
                                >
                                    Próximo →
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {/* AVANÇADO */}
                    {tab === 'AVANCADO' ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Avançado</h2>
                                    <p className="mt-1 text-sm text-slate-600">Depósitos: criar, renomear e exportar CSV para conferência.</p>
                                </div>
                                <Button variant="ghost" onClick={() => setTab('ESTOQUE')} type="button">
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
                                        <Button onClick={criarDeposito} disabled={busyDep || !novoDepNome.trim()} type="button">
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
                                        <Button onClick={renomearDeposito} disabled={busyDep || !renomearDepId || !renomearDepNome.trim()} type="button">
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
                                                <Button variant="ghost" onClick={() => exportarDeposito(d.id)} type="button">
                                                    Exportar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : null}
                </div>
            </div>

            {/* ===== POPUP DA IMAGEM (Estoque) ===== */}
            <ImagePreviewModal open={imgOpen} onClose={() => setImgOpen(false)} url={imgUrl} title={imgTitle} />

            {/* ===== MODAL: ENTRADA ===== */}
            <Modal open={entradaOpen} title="Entrada" subtitle="Leia/digite o código (ou use a câmera). Se não existir, preencha dados do produto." onClose={() => setEntradaOpen(false)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Código de barras">
                        <div className="flex gap-2">
                            <TextInput value={entradaBarcode} onChange={(e) => setEntradaBarcode(e.target.value)} placeholder="Leia com leitor ou digite" inputMode="numeric" />
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
                        <Button onClick={applyEntrada} disabled={loading} type="button">
                            Confirmar entrada
                        </Button>
                        <Button variant="ghost" onClick={() => setEntradaOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            <BarcodeScannerModal open={entradaScanOpen} title="Escanear código de barras (Entrada)" onClose={() => setEntradaScanOpen(false)} onDetected={(code) => setEntradaBarcode(code)} />

            {/* ===== MODAL: SAÍDA ===== */}
            <Modal open={saidaOpen} title="Saída" subtitle="Filtre pelo depósito, procure o produto, ou escaneie por câmera. Operador é fixo." onClose={() => setSaidaOpen(false)}>
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
                        <Button onClick={applySaida} disabled={loading || !saidaProdutosNoDeposito.length || !saidaProdutoId} type="button">
                            Confirmar saída
                        </Button>
                        <Button variant="ghost" onClick={() => setSaidaOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            <BarcodeScannerModal open={saidaScanOpen} title="Escanear código de barras (Saída)" onClose={() => setSaidaScanOpen(false)} onDetected={(code) => onSaidaBarcodePick(code)} />
        </main>
    );
}
