'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type Depot = string;

type StockItem = {
    id: string;
    nome: string;
    deposito: Depot;
    quantidade: number;
    minimo: number;
    fotoUrl?: string; // url/base64 (demo)
    atualizadoEm: string; // ISO
};

type SaidaPayload = {
    produtoId: string;
    quantidade: number;
    solicitante: string;
    destino: string;
    observacao?: string;
};

type TransferPayload = {
    produtoId: string;
    solicitante: string;
    destino: string;
    observacao?: string;
};

type EntradaPayload = {
    nome: string;
    deposito: string;
    quantidade: number;
    minimo: number;
    fotoUrl?: string;
};

type UiTab = 'HOME' | 'TRANSFERIR' | 'ESTOQUE';

type Persisted = {
    itens: StockItem[];
};

const LS_KEY = 'estoque_simple_v3';

function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
function nowISO() {
    return new Date().toISOString();
}
function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}
function fmtDate(iso: string) {
    try {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    } catch {
        return iso;
    }
}
function useLocalStorageState<T>(key: string, initialValue: T) {
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) setValue(JSON.parse(raw));
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch { }
    }, [key, value]);

    return [value, setValue] as const;
}

const SEED: Persisted = {
    itens: [
        {
            id: 'it_001',
            nome: 'Parafuso 10x50',
            deposito: 'Almox A',
            quantidade: 38,
            minimo: 60,
            fotoUrl: '',
            atualizadoEm: nowISO(),
        },
        {
            id: 'it_002',
            nome: 'Luva nitrílica (M)',
            deposito: 'Almox B',
            quantidade: 6,
            minimo: 8,
            fotoUrl: '',
            atualizadoEm: nowISO(),
        },
        {
            id: 'it_003',
            nome: 'Cabo PP 2x2,5mm',
            deposito: 'Almox A',
            quantidade: 120,
            minimo: 50,
            fotoUrl: '',
            atualizadoEm: nowISO(),
        },
    ],
};

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
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
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

function PhotoThumb({ url }: { url?: string }) {
    // ícone simples, sem cores chamativas
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
    const [persist, setPersist] = useLocalStorageState<Persisted>(LS_KEY, SEED);
    const [tab, setTab] = useState<UiTab>('HOME');

    // ====== HOME: Saída via modal ======
    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saida, setSaida] = useState<SaidaPayload>({
        produtoId: persist.itens[0]?.id ?? '',
        quantidade: 1,
        solicitante: '',
        destino: '',
        observacao: '',
    });

    // ====== TRANSFERIR: formulário simples ======
    const [transferir, setTransferir] = useState<TransferPayload>({
        produtoId: persist.itens[0]?.id ?? '',
        solicitante: '',
        destino: '',
        observacao: '',
    });

    // ====== ESTOQUE: listagem, filtros e editor ======
    const [q, setQ] = useState('');
    const [depositoFiltro, setDepositoFiltro] = useState<string>('Todos');
    const [onlyLow, setOnlyLow] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editId, setEditId] = useState<string>('');
    const editing = useMemo(() => persist.itens.find((i) => i.id === editId), [persist.itens, editId]);
    const [editQtd, setEditQtd] = useState<number>(0);
    const [editMin, setEditMin] = useState<number>(0);
    const [editDep, setEditDep] = useState<string>('');
    const [editFoto, setEditFoto] = useState<string>('');

    // ====== ESTOQUE: Entrada (criar produto) ======
    const [entradaOpen, setEntradaOpen] = useState(false);
    const [entrada, setEntrada] = useState<EntradaPayload>({
        nome: '',
        deposito: '',
        quantidade: 0,
        minimo: 0,
        fotoUrl: '',
    });

    useEffect(() => {
        // mantém selects válidos
        if (!saida.produtoId && persist.itens[0]?.id) setSaida((s) => ({ ...s, produtoId: persist.itens[0].id }));
        if (!transferir.produtoId && persist.itens[0]?.id)
            setTransferir((t) => ({ ...t, produtoId: persist.itens[0].id }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persist.itens.length]);

    const depositos = useMemo(() => {
        const set = new Set(persist.itens.map((i) => i.deposito).filter(Boolean));
        return ['Todos', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
    }, [persist.itens]);

    const alertCount = useMemo(
        () => persist.itens.filter((i) => i.quantidade <= i.minimo).length,
        [persist.itens],
    );

    const itemsFiltered = useMemo(() => {
        const qq = q.trim().toLowerCase();

        return persist.itens
            .filter((i) => (depositoFiltro === 'Todos' ? true : i.deposito === depositoFiltro))
            .filter((i) => (onlyLow ? i.quantidade <= i.minimo : true))
            .filter((i) => {
                if (!qq) return true;
                return i.nome.toLowerCase().includes(qq) || i.deposito.toLowerCase().includes(qq);
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [persist.itens, q, depositoFiltro, onlyLow]);

    function updateItem(id: string, patch: Partial<StockItem>) {
        setPersist((prev) => ({
            ...prev,
            itens: prev.itens.map((it) => (it.id === id ? { ...it, ...patch, atualizadoEm: nowISO() } : it)),
        }));
    }

    function applySaida() {
        const it = persist.itens.find((x) => x.id === saida.produtoId);
        if (!it) return alert('Selecione um produto.');
        const qtd = clampInt(saida.quantidade);
        if (qtd <= 0) return alert('Quantidade inválida.');
        if (qtd > it.quantidade) return alert(`Quantidade maior que o disponível (${it.quantidade}).`);
        if (!saida.solicitante.trim()) return alert('Informe o solicitante.');
        if (!saida.destino.trim()) return alert('Informe o destino.');

        updateItem(it.id, { quantidade: it.quantidade - qtd });

        setSaida((s) => ({ ...s, quantidade: 1, solicitante: '', destino: '', observacao: '' }));
        setSaidaOpen(false);
    }

    function applyTransferir() {
        const it = persist.itens.find((x) => x.id === transferir.produtoId);
        if (!it) return alert('Selecione um produto.');
        if (!transferir.solicitante.trim()) return alert('Informe o solicitante.');
        if (!transferir.destino.trim()) return alert('Informe o destino.');

        // Aqui entendemos "transferir" como mudança de depósito/local do item.
        // Se você quiser estoque por depósito (quantidades separadas), dá pra modelar diferente.
        updateItem(it.id, { deposito: transferir.destino.trim() });

        setTransferir({ produtoId: persist.itens[0]?.id ?? '', solicitante: '', destino: '', observacao: '' });
        setTab('ESTOQUE');
    }

    function openEdit(it: StockItem) {
        setEditId(it.id);
        setEditQtd(it.quantidade);
        setEditMin(it.minimo);
        setEditDep(it.deposito);
        setEditFoto(it.fotoUrl ?? '');
        setEditOpen(true);
    }

    function applyEdit() {
        if (!editing) return;
        const qtd = clampInt(editQtd);
        const min = clampInt(editMin);
        const dep = editDep.trim();
        if (!dep) return alert('Informe o depósito.');
        updateItem(editing.id, { quantidade: qtd, minimo: min, deposito: dep, fotoUrl: editFoto.trim() || '' });
        setEditOpen(false);
    }

    // Foto: sem upload real (pra não depender de backend). Converte arquivo local em base64.
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
        setEntrada((e) => ({ ...e, fotoUrl: url }));
    }

    async function onEditFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setEditFoto(url);
    }

    function applyEntrada() {
        const nome = entrada.nome.trim();
        const dep = entrada.deposito.trim();
        const qtd = clampInt(entrada.quantidade);
        const min = clampInt(entrada.minimo);

        if (!nome) return alert('Informe o nome do produto.');
        if (!dep) return alert('Informe o depósito.');
        if (qtd < 0) return alert('Quantidade inválida.');
        if (min < 0) return alert('Mínimo inválido.');

        const novo: StockItem = {
            id: uid('it'),
            nome,
            deposito: dep,
            quantidade: qtd,
            minimo: min,
            fotoUrl: entrada.fotoUrl?.trim() || '',
            atualizadoEm: nowISO(),
        };

        setPersist((prev) => ({ ...prev, itens: [novo, ...prev.itens] }));
        setEntrada({ nome: '', deposito: '', quantidade: 0, minimo: 0, fotoUrl: '' });
        setEntradaOpen(false);
    }

    const headerRight = (
        <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                Alertas: {alertCount}
            </span>
            <Button variant="ghost" onClick={() => setPersist(SEED)} title="Reset local">
                Reset
            </Button>
        </div>
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-5xl px-4 py-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Painel de Estoque</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Saída (modal), Transferir e Estoque (pesquisa, filtros por depósito, editar item e entrada de produto).
                        </p>
                    </div>
                    {headerRight}
                </div>

                {/* Tabs */}
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
                        onClick={() => setTab('TRANSFERIR')}
                        className={[
                            'rounded-xl px-3 py-2 text-sm font-medium',
                            tab === 'TRANSFERIR' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                        ].join(' ')}
                    >
                        Transferir
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

                {/* Content */}
                <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* HOME */}
                    {tab === 'HOME' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Tela Principal</h2>
                                    <p className="mt-1 text-sm text-slate-600">Aqui só tem Saída. Ao abrir, entra no modal.</p>
                                </div>
                                <Button onClick={() => setSaidaOpen(true)}>Saída</Button>
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                Dica: no modal você escolhe <b>produto</b>, <b>quantidade</b>, <b>solicitante</b>, <b>destino</b> e (opcional) observação.
                            </div>
                        </section>
                    ) : null}

                    {/* TRANSFERIR */}
                    {tab === 'TRANSFERIR' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Transferir</h2>
                                    <p className="mt-1 text-sm text-slate-600">Produto, solicitante, destino e observação (opcional).</p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Produto">
                                    <Select
                                        value={transferir.produtoId}
                                        onChange={(e) => setTransferir((t) => ({ ...t, produtoId: e.target.value }))}
                                    >
                                        {persist.itens.map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.nome} — {it.deposito} — {it.quantidade}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Solicitante">
                                    <TextInput
                                        value={transferir.solicitante}
                                        onChange={(e) => setTransferir((t) => ({ ...t, solicitante: e.target.value }))}
                                        placeholder="Ex: João"
                                    />
                                </Field>

                                <Field label="Destino (depósito)">
                                    <TextInput
                                        value={transferir.destino}
                                        onChange={(e) => setTransferir((t) => ({ ...t, destino: e.target.value }))}
                                        placeholder="Ex: Almox B"
                                    />
                                </Field>

                                <div className="sm:col-span-2">
                                    <Field label="Observação (opcional)">
                                        <TextArea
                                            value={transferir.observacao ?? ''}
                                            onChange={(e) => setTransferir((t) => ({ ...t, observacao: e.target.value }))}
                                            placeholder="Detalhes da transferência..."
                                        />
                                    </Field>
                                </div>

                                <div className="sm:col-span-2 flex flex-wrap gap-2">
                                    <Button onClick={applyTransferir}>Confirmar transferência</Button>
                                    <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                        Ir para Estoque
                                    </Button>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {/* ESTOQUE */}
                    {tab === 'ESTOQUE' ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Estoque</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Listagem com pesquisa e filtros por depósito. Clique no item para editar e ver foto.
                                    </p>
                                </div>
                                <Button variant="ghost" onClick={() => setEntradaOpen(true)}>
                                    Fazer entrada (novo produto)
                                </Button>
                            </div>

                            {/* Filters */}
                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Field label="Pesquisar">
                                    <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou depósito..." />
                                </Field>

                                <Field label="Depósito">
                                    <Select value={depositoFiltro} onChange={(e) => setDepositoFiltro(e.target.value)}>
                                        {depositos.map((d) => (
                                            <option key={d} value={d}>
                                                {d}
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
                            </div>

                            {/* List */}
                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {itemsFiltered.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum produto encontrado.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {itemsFiltered.map((it) => {
                                            const low = it.quantidade <= it.minimo;
                                            return (
                                                <li key={it.id}>
                                                    <button
                                                        onClick={() => openEdit(it)}
                                                        className="w-full px-4 py-3 text-left hover:bg-slate-50"
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <PhotoThumb url={it.fotoUrl} />
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-slate-900">{it.nome}</p>
                                                                    <p className="mt-0.5 truncate text-xs text-slate-600">
                                                                        Depósito: {it.deposito}
                                                                        {low ? ' • (alerta)' : ''}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <p className="text-sm font-semibold text-slate-900">{it.quantidade}</p>
                                                                <p className="text-xs text-slate-500">mín {it.minimo}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            <p className="mt-3 text-xs text-slate-500">Última atualização por item aparece ao abrir o produto.</p>
                        </section>
                    ) : null}
                </div>
            </div>

            {/* MODAL: Saída */}
            <Modal
                open={saidaOpen}
                title="Saída de Produto"
                subtitle="Selecione produto, quantidade, solicitante e destino."
                onClose={() => setSaidaOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Produto">
                        <Select
                            value={saida.produtoId}
                            onChange={(e) => setSaida((s) => ({ ...s, produtoId: e.target.value }))}
                        >
                            {persist.itens.map((it) => (
                                <option key={it.id} value={it.id}>
                                    {it.nome} — {it.deposito} — {it.quantidade}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Quantidade">
                        <TextInput
                            type="number"
                            min={1}
                            step={1}
                            value={saida.quantidade}
                            onChange={(e) => setSaida((s) => ({ ...s, quantidade: Number(e.target.value) }))}
                        />
                    </Field>

                    <Field label="Solicitante">
                        <TextInput
                            value={saida.solicitante}
                            onChange={(e) => setSaida((s) => ({ ...s, solicitante: e.target.value }))}
                            placeholder="Ex: João"
                        />
                    </Field>

                    <Field label="Destino">
                        <TextInput
                            value={saida.destino}
                            onChange={(e) => setSaida((s) => ({ ...s, destino: e.target.value }))}
                            placeholder="Ex: Obra X / Setor Y / Almox B"
                        />
                    </Field>

                    <div className="sm:col-span-2">
                        <Field label="Observação (opcional)">
                            <TextArea
                                value={saida.observacao ?? ''}
                                onChange={(e) => setSaida((s) => ({ ...s, observacao: e.target.value }))}
                                placeholder="Detalhes da saída..."
                            />
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

            {/* MODAL: Editar item / ver foto */}
            <Modal
                open={editOpen}
                title="Produto"
                subtitle={editing ? `Atualizado em ${fmtDate(editing.atualizadoEm)}` : undefined}
                onClose={() => setEditOpen(false)}
            >
                {!editing ? (
                    <p className="text-sm text-slate-600">Produto não encontrado.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {editFoto ? (
                                    <img src={editFoto} alt="Foto" className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" />
                                ) : (
                                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-3xl text-slate-600">
                                        🖼️
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-slate-900">{editing.nome}</p>
                                <p className="mt-1 text-sm text-slate-600">Depósito atual: {editing.deposito}</p>
                                <p className="mt-2 text-xs text-slate-500">
                                    Quantidade atual: {editing.quantidade} • Mínimo: {editing.minimo}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Depósito">
                                <TextInput value={editDep} onChange={(e) => setEditDep(e.target.value)} placeholder="Ex: Almox A" />
                            </Field>

                            <Field label="Quantidade">
                                <TextInput
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={editQtd}
                                    onChange={(e) => setEditQtd(Number(e.target.value))}
                                />
                            </Field>

                            <Field label="Quantidade mínima (alerta)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={editMin}
                                    onChange={(e) => setEditMin(Number(e.target.value))}
                                />
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

            {/* MODAL: Entrada (novo produto) */}
            <Modal
                open={entradaOpen}
                title="Entrada (novo produto)"
                subtitle="Cadastrar produto com depósito, quantidade, foto e mínimo (alerta)."
                onClose={() => setEntradaOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Nome do produto">
                        <TextInput value={entrada.nome} onChange={(e) => setEntrada((x) => ({ ...x, nome: e.target.value }))} />
                    </Field>

                    <Field label="Depósito">
                        <TextInput
                            value={entrada.deposito}
                            onChange={(e) => setEntrada((x) => ({ ...x, deposito: e.target.value }))}
                            placeholder="Ex: Almox A"
                        />
                    </Field>

                    <Field label="Quantidade">
                        <TextInput
                            type="number"
                            min={0}
                            step={1}
                            value={entrada.quantidade}
                            onChange={(e) => setEntrada((x) => ({ ...x, quantidade: Number(e.target.value) }))}
                        />
                    </Field>

                    <Field label="Quantidade mínima (alerta)">
                        <TextInput
                            type="number"
                            min={0}
                            step={1}
                            value={entrada.minimo}
                            onChange={(e) => setEntrada((x) => ({ ...x, minimo: Number(e.target.value) }))}
                        />
                    </Field>

                    <div className="sm:col-span-2">
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
                    </div>

                    {entrada.fotoUrl ? (
                        <div className="sm:col-span-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={entrada.fotoUrl}
                                alt="Prévia de foto"
                                className="h-40 w-full rounded-2xl border border-slate-200 object-cover"
                            />
                        </div>
                    ) : null}

                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                        <Button onClick={applyEntrada}>Cadastrar produto</Button>
                        <Button variant="ghost" onClick={() => setEntradaOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}
