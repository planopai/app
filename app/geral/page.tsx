'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type ID = number;

type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };
type Produto = {
    id: ID;
    nome: string;
    codigo_barras: string;
    valor: number;
    minimo: number;
    foto_url?: string | null;
    ativo: number;
};

type SaldoRow = {
    saldo_id: ID;
    produto_id: ID;
    deposito_id: ID;
    deposito_nome: string;
    quantidade: number;
    atualizado_em: string;

    nome: string;
    codigo_barras: string;
    valor: number;
    minimo: number;
    foto_url?: string | null;
};

type Bootstrap = {
    usuarios: Usuario[];
    depositos: Deposito[];
    produtos: Produto[];
    saldos: SaldoRow[];
};

type UiTab = 'HOME' | 'ESTOQUE';

function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}
function clampMoney(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n * 100) / 100);
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
        return `R$ ${Number(n || 0).toFixed(2)}`;
    }
}

async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
    });
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, {
        ...init,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
        cache: 'no-store',
    });
    const txt = await r.text();
    let data: any;
    try {
        data = txt ? JSON.parse(txt) : {};
    } catch {
        throw new Error(`Resposta inválida do servidor: ${txt.slice(0, 200)}`);
    }
    if (!r.ok) {
        throw new Error(data?.msg || data?.error || `Erro HTTP ${r.status}`);
    }
    if (data?.erro) {
        throw new Error(data?.msg || 'Erro');
    }
    return data as T;
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
                    <button className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose}>
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'ghost' }) {
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

export default function Page() {
    const [tab, setTab] = useState<UiTab>('HOME');

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string>('');

    const [data, setData] = useState<Bootstrap>({
        usuarios: [],
        depositos: [],
        produtos: [],
        saldos: [],
    });

    const [operadorId, setOperadorId] = useState<ID | ''>('');

    async function reload() {
        setErr('');
        setLoading(true);
        try {
            const boot = await fetchJSON<Bootstrap>('/api/php/estoque_admin.php?acao=bootstrap');
            setData(boot);
            if (!operadorId && boot.usuarios[0]?.id) setOperadorId(boot.usuarios[0].id);
        } catch (e: any) {
            setErr(e?.message || 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const userById = useMemo(() => new Map(data.usuarios.map((u) => [u.id, u])), [data.usuarios]);
    const depById = useMemo(() => new Map(data.depositos.map((d) => [d.id, d])), [data.depositos]);
    const prodById = useMemo(() => new Map(data.produtos.map((p) => [p.id, p])), [data.produtos]);

    const operador = operadorId ? userById.get(operadorId as ID) : undefined;

    const alertCount = useMemo(() => data.saldos.filter((s) => s.quantidade <= s.minimo).length, [data.saldos]);

    // ====== filtros estoque
    const [q, setQ] = useState('');
    const [depositoFiltroId, setDepositoFiltroId] = useState<ID | 'Todos'>('Todos');
    const [onlyLow, setOnlyLow] = useState(false);

    const estoqueView = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return data.saldos
            .filter((r) => (depositoFiltroId === 'Todos' ? true : r.deposito_id === depositoFiltroId))
            .filter((r) => (onlyLow ? r.quantidade <= r.minimo : true))
            .filter((r) => {
                if (!qq) return true;
                const blob = `${r.nome} ${r.codigo_barras} ${r.deposito_nome}`.toLowerCase();
                return blob.includes(qq);
            })
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    }, [data.saldos, depositoFiltroId, onlyLow, q]);

    // ====== modal: saída
    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saidaProdutoId, setSaidaProdutoId] = useState<ID | ''>('');
    const [saidaDepositoId, setSaidaDepositoId] = useState<ID | ''>('');
    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID | ''>('');
    const [saidaQtd, setSaidaQtd] = useState<number>(1);
    const [saidaDestinoTexto, setSaidaDestinoTexto] = useState('');
    const [saidaObs, setSaidaObs] = useState('');

    function openSaidaDefault() {
        const first = data.saldos[0];
        setSaidaProdutoId(first?.produto_id ?? '');
        setSaidaDepositoId(first?.deposito_id ?? '');
        setSaidaSolicitanteId(data.usuarios[0]?.id ?? '');
        setSaidaQtd(1);
        setSaidaDestinoTexto('');
        setSaidaObs('');
        setSaidaOpen(true);
    }

    async function applySaida() {
        if (!operadorId) return alert('Selecione o Operador.');
        if (!saidaProdutoId || !saidaDepositoId) return alert('Selecione produto e depósito.');
        const qtd = clampInt(saidaQtd);
        if (qtd <= 0) return alert('Quantidade inválida.');
        if (!saidaSolicitanteId) return alert('Selecione solicitante.');
        if (!saidaDestinoTexto.trim()) return alert('Informe destino.');

        try {
            await fetchJSON('/api/php/estoque_admin.php', {
                method: 'POST',
                body: JSON.stringify({
                    acao: 'saida',
                    operador_usuario_id: operadorId,
                    solicitante_usuario_id: saidaSolicitanteId,
                    produto_id: saidaProdutoId,
                    deposito_id: saidaDepositoId,
                    quantidade: qtd,
                    destino_texto: saidaDestinoTexto.trim(),
                    observacao: saidaObs.trim() || null,
                }),
            });
            setSaidaOpen(false);
            await reload();
            setTab('ESTOQUE');
        } catch (e: any) {
            alert(e?.message || 'Falha na saída');
        }
    }

    // ====== modal: transferência
    const [transferOpen, setTransferOpen] = useState(false);
    const [trProdutoId, setTrProdutoId] = useState<ID | ''>('');
    const [trOrigemId, setTrOrigemId] = useState<ID | ''>('');
    const [trDestinoId, setTrDestinoId] = useState<ID | ''>('');
    const [trSolicitanteId, setTrSolicitanteId] = useState<ID | ''>('');
    const [trQtd, setTrQtd] = useState<number>(1);
    const [trObs, setTrObs] = useState('');

    function openTransferDefault() {
        const first = data.saldos[0];
        setTrProdutoId(first?.produto_id ?? '');
        setTrOrigemId(first?.deposito_id ?? '');
        const otherDep = data.depositos.find((d) => d.id !== first?.deposito_id)?.id ?? first?.deposito_id ?? '';
        setTrDestinoId(otherDep ?? '');
        setTrSolicitanteId(data.usuarios[0]?.id ?? '');
        setTrQtd(1);
        setTrObs('');
        setTransferOpen(true);
    }

    async function applyTransfer() {
        if (!operadorId) return alert('Selecione o Operador.');
        if (!trProdutoId || !trOrigemId || !trDestinoId) return alert('Selecione produto e depósitos.');
        if (trOrigemId === trDestinoId) return alert('Origem e destino não podem ser iguais.');
        const qtd = clampInt(trQtd);
        if (qtd <= 0) return alert('Quantidade inválida.');
        if (!trSolicitanteId) return alert('Selecione solicitante.');

        try {
            await fetchJSON('/api/php/estoque_admin.php', {
                method: 'POST',
                body: JSON.stringify({
                    acao: 'transferencia',
                    operador_usuario_id: operadorId,
                    solicitante_usuario_id: trSolicitanteId,
                    produto_id: trProdutoId,
                    deposito_origem_id: trOrigemId,
                    deposito_destino_id: trDestinoId,
                    quantidade: qtd,
                    observacao: trObs.trim() || null,
                }),
            });
            setTransferOpen(false);
            await reload();
            setTab('ESTOQUE');
        } catch (e: any) {
            alert(e?.message || 'Falha na transferência');
        }
    }

    // ====== modal: entrada (produto existente ou cadastro)
    const [entradaOpen, setEntradaOpen] = useState(false);
    const [enDepositoId, setEnDepositoId] = useState<ID | ''>('');
    const [enQtd, setEnQtd] = useState<number>(1);
    const [enObs, setEnObs] = useState('');

    const [enProdutoExistenteId, setEnProdutoExistenteId] = useState<ID | ''>('');
    const [enModo, setEnModo] = useState<'EXISTENTE' | 'NOVO'>('EXISTENTE');

    // novo produto
    const [npNome, setNpNome] = useState('');
    const [npBarcode, setNpBarcode] = useState('');
    const [npValor, setNpValor] = useState<number>(0);
    const [npMin, setNpMin] = useState<number>(0);
    const [npFoto, setNpFoto] = useState<string>('');

    function openEntradaDefault() {
        setEnDepositoId(data.depositos[0]?.id ?? '');
        setEnQtd(1);
        setEnObs('');
        setEnProdutoExistenteId(data.produtos[0]?.id ?? '');
        setEnModo('EXISTENTE');
        setNpNome('');
        setNpBarcode('');
        setNpValor(0);
        setNpMin(0);
        setNpFoto('');
        setEntradaOpen(true);
    }

    async function onEntradaFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setNpFoto(url);
    }

    async function applyEntrada() {
        if (!operadorId) return alert('Selecione o Operador.');
        if (!enDepositoId) return alert('Selecione depósito.');
        const qtd = clampInt(enQtd);
        if (qtd <= 0) return alert('Quantidade inválida.');

        try {
            if (enModo === 'EXISTENTE') {
                if (!enProdutoExistenteId) return alert('Selecione um produto existente.');

                await fetchJSON('/api/php/estoque_admin.php', {
                    method: 'POST',
                    body: JSON.stringify({
                        acao: 'entrada',
                        operador_usuario_id: operadorId,
                        produto_id: enProdutoExistenteId,
                        deposito_id: enDepositoId,
                        quantidade: qtd,
                        observacao: enObs.trim() || null,
                    }),
                });
            } else {
                const nome = npNome.trim();
                const cb = npBarcode.trim();
                const valor = clampMoney(npValor);
                const min = clampInt(npMin);
                if (!nome) return alert('Informe nome do produto.');
                if (!cb) return alert('Informe código de barras.');
                await fetchJSON('/api/php/estoque_admin.php', {
                    method: 'POST',
                    body: JSON.stringify({
                        acao: 'entrada_novo_produto',
                        operador_usuario_id: operadorId,
                        deposito_id: enDepositoId,
                        quantidade: qtd,
                        observacao: enObs.trim() || null,
                        produto: {
                            nome,
                            codigo_barras: cb,
                            valor,
                            minimo: min,
                            foto_url: npFoto || null,
                        },
                    }),
                });
            }

            setEntradaOpen(false);
            await reload();
            setTab('ESTOQUE');
        } catch (e: any) {
            alert(e?.message || 'Falha na entrada');
        }
    }

    // ====== modal: editar (produto + saldo)
    const [editOpen, setEditOpen] = useState(false);
    const [editSaldoId, setEditSaldoId] = useState<ID | ''>('');

    const editingRow = useMemo(() => data.saldos.find((s) => s.saldo_id === editSaldoId), [data.saldos, editSaldoId]);

    const [edNome, setEdNome] = useState('');
    const [edBarcode, setEdBarcode] = useState('');
    const [edValor, setEdValor] = useState<number>(0);
    const [edMin, setEdMin] = useState<number>(0);
    const [edFoto, setEdFoto] = useState<string>('');
    const [edQtd, setEdQtd] = useState<number>(0);

    async function onEditFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setEdFoto(url);
    }

    function openEdit(row: SaldoRow) {
        setEditSaldoId(row.saldo_id);
        setEdNome(row.nome);
        setEdBarcode(row.codigo_barras);
        setEdValor(Number(row.valor || 0));
        setEdMin(Number(row.minimo || 0));
        setEdFoto(row.foto_url || '');
        setEdQtd(Number(row.quantidade || 0));
        setEditOpen(true);
    }

    async function applyEdit() {
        if (!operadorId) return alert('Selecione o Operador.');
        if (!editingRow) return;

        const nome = edNome.trim();
        const cb = edBarcode.trim();
        const valor = clampMoney(edValor);
        const minimo = clampInt(edMin);
        const qtd = clampInt(edQtd);

        if (!nome) return alert('Nome inválido.');
        if (!cb) return alert('Código de barras inválido.');

        try {
            await fetchJSON('/api/php/estoque_admin.php', {
                method: 'POST',
                body: JSON.stringify({
                    acao: 'editar_item',
                    operador_usuario_id: operadorId,
                    saldo_id: editingRow.saldo_id,
                    produto_id: editingRow.produto_id,
                    deposito_id: editingRow.deposito_id,
                    produto: {
                        nome,
                        codigo_barras: cb,
                        valor,
                        minimo,
                        foto_url: edFoto || null,
                    },
                    quantidade: qtd,
                }),
            });

            setEditOpen(false);
            await reload();
        } catch (e: any) {
            alert(e?.message || 'Falha ao salvar');
        }
    }

    const headerRight = (
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                    Alertas: {alertCount}
                </span>
                <Button variant="ghost" onClick={reload} title="Recarregar">
                    Recarregar
                </Button>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
                <span className="text-xs font-medium text-slate-700">Operador:</span>
                <Select value={operadorId as any} onChange={(e) => setOperadorId(Number(e.target.value) as any)}>
                    {data.usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.nome} ({u.usuario})
                        </option>
                    ))}
                </Select>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Admin do Estoque</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Conectado ao PHP (via /api/php). Produtos, depósitos, saldos e movimentações.
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Operador atual: <b>{operador?.nome ?? '—'}</b>
                        </p>
                    </div>
                    {headerRight}
                </div>

                <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                    <button
                        onClick={() => setTab('HOME')}
                        className={[
                            'rounded-xl px-3 py-2 text-sm font-medium',
                            tab === 'HOME' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                        ].join(' ')}
                    >
                        Principal
                    </button>
                    <button
                        onClick={() => setTab('ESTOQUE')}
                        className={[
                            'rounded-xl px-3 py-2 text-sm font-medium',
                            tab === 'ESTOQUE' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                        ].join(' ')}
                    >
                        Estoque
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                    {loading ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-sm text-slate-700">Carregando…</p>
                        </section>
                    ) : err ? (
                        <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
                            <p className="text-sm text-red-700">Erro: {err}</p>
                            <div className="mt-3">
                                <Button onClick={reload}>Tentar de novo</Button>
                            </div>
                        </section>
                    ) : null}

                    {tab === 'HOME' && !loading && !err ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Tela Principal</h2>
                                    <p className="mt-1 text-sm text-slate-600">Ações rápidas: saída, transferência e entrada.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={openSaidaDefault}>Saída</Button>
                                    <Button variant="ghost" onClick={openTransferDefault}>
                                        Transferência
                                    </Button>
                                    <Button variant="ghost" onClick={openEntradaDefault}>
                                        Entrada
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                Dica: tudo que você fizer grava em <b>estoque_movimentacoes</b>.
                            </div>
                        </section>
                    ) : null}

                    {tab === 'ESTOQUE' && !loading && !err ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Estoque (por depósito)</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Clique numa linha para editar (produto + quantidade do depósito).
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="ghost" onClick={openEntradaDefault}>
                                        Entrada
                                    </Button>
                                    <Button variant="ghost" onClick={openTransferDefault}>
                                        Transferência
                                    </Button>
                                    <Button variant="ghost" onClick={openSaidaDefault}>
                                        Saída
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <Field label="Pesquisar">
                                    <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, depósito ou código..." />
                                </Field>

                                <Field label="Depósito">
                                    <Select value={depositoFiltroId as any} onChange={(e) => setDepositoFiltroId(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value) as any)}>
                                        <option value="Todos">Todos</option>
                                        {data.depositos.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Somente em alerta (≤ mínimo)">
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

                                <Field label="Total linhas">
                                    <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
                                        {estoqueView.length}
                                    </div>
                                </Field>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {estoqueView.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {estoqueView.map((r) => {
                                            const low = r.quantidade <= r.minimo;
                                            return (
                                                <li key={r.saldo_id}>
                                                    <button onClick={() => openEdit(r)} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <PhotoThumb url={r.foto_url} />
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-slate-900">
                                                                        {r.nome} {low ? <span className="text-xs text-red-600">• alerta</span> : null}
                                                                    </p>
                                                                    <p className="mt-0.5 truncate text-xs text-slate-600">
                                                                        CB: <b>{r.codigo_barras}</b> • Depósito: <b>{r.deposito_nome}</b> • Valor: {moneyBRL(r.valor)}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <p className="text-sm font-semibold text-slate-900">{r.quantidade}</p>
                                                                <p className="text-xs text-slate-500">mín {r.minimo}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                            <p className="mt-3 text-xs text-slate-500">Atualização: a data aparece ao abrir o item.</p>
                        </section>
                    ) : null}
                </div>
            </div>

            {/* MODAL: Saída */}
            <Modal open={saidaOpen} title="Saída" subtitle="Baixa do estoque + movimentação" onClose={() => setSaidaOpen(false)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Produto (por depósito)">
                        <Select
                            value={`${saidaProdutoId || ''}:${saidaDepositoId || ''}`}
                            onChange={(e) => {
                                const [p, d] = e.target.value.split(':').map((x) => Number(x));
                                setSaidaProdutoId(p as any);
                                setSaidaDepositoId(d as any);
                            }}
                        >
                            {data.saldos.map((r) => (
                                <option key={r.saldo_id} value={`${r.produto_id}:${r.deposito_id}`}>
                                    {r.nome} — {r.deposito_nome} — disponível: {r.quantidade}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Quantidade">
                        <TextInput type="number" min={1} step={1} value={saidaQtd} onChange={(e) => setSaidaQtd(Number(e.target.value))} />
                    </Field>

                    <Field label="Solicitante">
                        <Select value={saidaSolicitanteId as any} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value) as any)}>
                            {data.usuarios.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome} ({u.usuario})
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Destino (obra/setor/local)">
                        <TextInput value={saidaDestinoTexto} onChange={(e) => setSaidaDestinoTexto(e.target.value)} placeholder="Ex: Obra X / Setor Y" />
                    </Field>

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} />
                        </Field>
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applySaida}>Confirmar saída</Button>
                        <Button variant="ghost" onClick={() => setSaidaOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: Transferência */}
            <Modal open={transferOpen} title="Transferência" subtitle="Move qty entre depósitos" onClose={() => setTransferOpen(false)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Produto">
                        <Select value={trProdutoId as any} onChange={(e) => setTrProdutoId(Number(e.target.value) as any)}>
                            {data.produtos.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.nome} — CB:{p.codigo_barras}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Quantidade">
                        <TextInput type="number" min={1} step={1} value={trQtd} onChange={(e) => setTrQtd(Number(e.target.value))} />
                    </Field>

                    <Field label="Origem">
                        <Select value={trOrigemId as any} onChange={(e) => setTrOrigemId(Number(e.target.value) as any)}>
                            {data.depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Destino">
                        <Select value={trDestinoId as any} onChange={(e) => setTrDestinoId(Number(e.target.value) as any)}>
                            {data.depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Solicitante">
                        <Select value={trSolicitanteId as any} onChange={(e) => setTrSolicitanteId(Number(e.target.value) as any)}>
                            {data.usuarios.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome} ({u.usuario})
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea value={trObs} onChange={(e) => setTrObs(e.target.value)} />
                        </Field>
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applyTransfer}>Confirmar transferência</Button>
                        <Button variant="ghost" onClick={() => setTransferOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: Entrada */}
            <Modal open={entradaOpen} title="Entrada" subtitle="Soma no saldo (existente) ou cadastra produto e dá entrada" onClose={() => setEntradaOpen(false)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Depósito">
                        <Select value={enDepositoId as any} onChange={(e) => setEnDepositoId(Number(e.target.value) as any)}>
                            {data.depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Quantidade">
                        <TextInput type="number" min={1} step={1} value={enQtd} onChange={(e) => setEnQtd(Number(e.target.value))} />
                    </Field>

                    <Field label="Modo">
                        <Select value={enModo} onChange={(e) => setEnModo(e.target.value as any)}>
                            <option value="EXISTENTE">Produto existente</option>
                            <option value="NOVO">Cadastrar novo produto</option>
                        </Select>
                    </Field>

                    {enModo === 'EXISTENTE' ? (
                        <Field label="Produto">
                            <Select value={enProdutoExistenteId as any} onChange={(e) => setEnProdutoExistenteId(Number(e.target.value) as any)}>
                                {data.produtos.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome} — CB:{p.codigo_barras}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    ) : (
                        <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-sm font-semibold text-slate-900">Novo produto</p>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Nome">
                                    <TextInput value={npNome} onChange={(e) => setNpNome(e.target.value)} />
                                </Field>
                                <Field label="Código de barras">
                                    <TextInput value={npBarcode} onChange={(e) => setNpBarcode(e.target.value)} inputMode="numeric" />
                                </Field>
                                <Field label="Valor">
                                    <TextInput type="number" step="0.01" value={npValor} onChange={(e) => setNpValor(Number(e.target.value))} />
                                </Field>
                                <Field label="Mínimo (alerta)">
                                    <TextInput type="number" min={0} step={1} value={npMin} onChange={(e) => setNpMin(Number(e.target.value))} />
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
                                {npFoto ? (
                                    <div className="sm:col-span-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={npFoto} alt="Prévia" className="h-40 w-full rounded-2xl border border-slate-200 object-cover" />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea value={enObs} onChange={(e) => setEnObs(e.target.value)} />
                        </Field>
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applyEntrada}>Confirmar entrada</Button>
                        <Button variant="ghost" onClick={() => setEntradaOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: Editar */}
            <Modal
                open={editOpen}
                title="Editar Produto / Saldo"
                subtitle={editingRow ? `Depósito: ${editingRow.deposito_nome} • Atualizado: ${fmtDateTime(editingRow.atualizado_em)}` : undefined}
                onClose={() => setEditOpen(false)}
            >
                {!editingRow ? (
                    <p className="text-sm text-slate-600">Registro não encontrado.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {edFoto ? (
                                    <img src={edFoto} alt="Foto" className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" />
                                ) : (
                                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-3xl text-slate-600">
                                        🖼️
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-slate-900">{editingRow.nome}</p>
                                <p className="mt-1 text-sm text-slate-600">CB: <b>{editingRow.codigo_barras}</b></p>
                                <p className="mt-1 text-xs text-slate-500">Valor: {moneyBRL(editingRow.valor)} • Mínimo: {editingRow.minimo}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Nome">
                                <TextInput value={edNome} onChange={(e) => setEdNome(e.target.value)} />
                            </Field>

                            <Field label="Código de barras">
                                <TextInput value={edBarcode} onChange={(e) => setEdBarcode(e.target.value)} inputMode="numeric" />
                            </Field>

                            <Field label="Valor">
                                <TextInput type="number" step="0.01" value={edValor} onChange={(e) => setEdValor(Number(e.target.value))} />
                            </Field>

                            <Field label="Mínimo (alerta)">
                                <TextInput type="number" min={0} step={1} value={edMin} onChange={(e) => setEdMin(Number(e.target.value))} />
                            </Field>

                            <Field label="Quantidade (neste depósito)">
                                <TextInput type="number" min={0} step={1} value={edQtd} onChange={(e) => setEdQtd(Number(e.target.value))} />
                            </Field>

                            <Field label="Foto (arquivo)">
                                <TextInput
                                    type="file"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        await onEditFoto(file);
                                    }}
                                />
                            </Field>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button onClick={applyEdit}>Salvar</Button>
                            <Button variant="ghost" onClick={() => setEditOpen(false)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </main>
    );
}
