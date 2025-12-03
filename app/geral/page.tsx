'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Unit = 'un' | 'cx' | 'kg' | 'm' | 'l';

type StockItem = {
    id: string;
    sku?: string;
    nome: string;
    categoria: string;
    unidade: Unit;
    quantidade: number;
    minimo: number;
    local: string; // ex: Almox A / Prat A1
    atualizadoEm: string; // ISO
};

type LogType = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'CONFERENCIA' | 'OBS';

type LogEntry = {
    id: string;
    tipo: LogType;
    itemId: string;
    criadoEm: string; // ISO
    usuario: string;
    qtd?: number;

    // contexto
    de?: string; // local origem
    para?: string; // local destino
    referencia?: string; // NF/OS/etc
    nota?: string;
    antes?: number;
    depois?: number;
};

type Persisted = {
    itens: StockItem[];
    logs: LogEntry[];
};

type TabKey = 'HOME' | 'ENTRADA' | 'SAIDA' | 'TRANSFER' | 'PESQUISA' | 'CONFER' | 'ALERTAS' | 'LOG';

const LS_KEY = 'estoque_admin_panel_dynamic_v2';

function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
function nowISO() {
    return new Date().toISOString();
}
function fmtDate(iso: string) {
    try {
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    } catch {
        return iso;
    }
}
function clampInt(n: unknown) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.floor(x));
}

function useLocalStorageState<T>(key: string, initialValue: T) {
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) setValue(JSON.parse(raw));
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore
        }
    }, [key, value]);

    return [value, setValue] as const;
}

const SEED: Persisted = {
    itens: [
        {
            id: 'it_001',
            sku: 'CABO-PP-2X2,5',
            nome: 'Cabo PP 2x2,5mm',
            categoria: 'Elétrica',
            unidade: 'm',
            quantidade: 120,
            minimo: 50,
            local: 'Almox A / Prat A1',
            atualizadoEm: nowISO(),
        },
        {
            id: 'it_002',
            sku: 'PARAF-10X50',
            nome: 'Parafuso 10x50',
            categoria: 'Fixação',
            unidade: 'un',
            quantidade: 38,
            minimo: 60,
            local: 'Almox A / Gaveta B2',
            atualizadoEm: nowISO(),
        },
        {
            id: 'it_003',
            sku: 'LUVA-NITRIL-M',
            nome: 'Luva nitrílica (M)',
            categoria: 'EPI',
            unidade: 'cx',
            quantidade: 6,
            minimo: 8,
            local: 'Almox B / Armário EPI',
            atualizadoEm: nowISO(),
        },
    ],
    logs: [],
};

function Badge({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode;
    tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
    const cls =
        tone === 'ok'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : tone === 'warn'
                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                : tone === 'danger'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
    return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Button({
    children,
    variant = 'solid',
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'solid' | 'ghost' | 'danger';
}) {
    const base =
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed';
    const cls =
        variant === 'solid'
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : variant === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-white text-slate-800 hover:bg-slate-50 ring-1 ring-slate-200';
    return (
        <button {...props} className={[base, cls, className ?? ''].join(' ')}>
            {children}
        </button>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
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
                'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none',
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
                'min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none',
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
                'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
                props.className ?? '',
            ].join(' ')}
        />
    );
}

function Card({
    title,
    subtitle,
    right,
    children,
}: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

function toneFor(tipo: LogType): { tone: 'neutral' | 'ok' | 'warn' | 'danger'; label: string } {
    switch (tipo) {
        case 'ENTRADA':
            return { tone: 'ok', label: 'Entrada' };
        case 'SAIDA':
            return { tone: 'danger', label: 'Saída' };
        case 'TRANSFERENCIA':
            return { tone: 'warn', label: 'Transferência' };
        case 'CONFERENCIA':
            return { tone: 'neutral', label: 'Conferência' };
        case 'OBS':
            return { tone: 'neutral', label: 'Obs' };
        default:
            return { tone: 'neutral', label: 'Log' };
    }
}

export default function Page() {
    const [persist, setPersist] = useLocalStorageState<Persisted>(LS_KEY, SEED);
    const [tab, setTab] = useState<TabKey>('HOME');

    // usuário (mock)
    const [usuario, setUsuario] = useState('Admin');

    // seletores comuns
    const [itemId, setItemId] = useState<string>(persist.itens[0]?.id ?? '');
    useEffect(() => {
        if (!itemId && persist.itens[0]?.id) setItemId(persist.itens[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persist.itens.length]);

    // HOME quick search
    const [quickQ, setQuickQ] = useState('');
    // Pesquisa
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('Todas');
    const [onlyLow, setOnlyLow] = useState(false);

    // Entrada
    const [inQtd, setInQtd] = useState<number>(1);
    const [inRef, setInRef] = useState('');
    const [inNota, setInNota] = useState('');

    // Saída
    const [outQtd, setOutQtd] = useState<number>(1);
    const [outRef, setOutRef] = useState('');
    const [outNota, setOutNota] = useState('');

    // Transferência
    const [trQtd, setTrQtd] = useState<number>(1);
    const [trPara, setTrPara] = useState('Almox B / Prat C1');
    const [trRef, setTrRef] = useState('');
    const [trNota, setTrNota] = useState('');

    // Conferência
    const [confQtd, setConfQtd] = useState<number>(0);
    const [confNota, setConfNota] = useState('');

    // Logs
    const [logTipo, setLogTipo] = useState<'TUDO' | LogType>('TUDO');
    const [logItem, setLogItem] = useState<string>('TODOS');

    const categorias = useMemo(() => {
        const set = new Set(persist.itens.map((i) => i.categoria));
        return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
    }, [persist.itens]);

    const alerts = useMemo(() => persist.itens.filter((i) => i.quantidade <= i.minimo), [persist.itens]);

    const estoqueBase = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return persist.itens
            .filter((i) => (cat === 'Todas' ? true : i.categoria === cat))
            .filter((i) => (onlyLow ? i.quantidade <= i.minimo : true))
            .filter((i) => {
                if (!qq) return true;
                return (
                    i.nome.toLowerCase().includes(qq) ||
                    (i.sku ?? '').toLowerCase().includes(qq) ||
                    i.categoria.toLowerCase().includes(qq) ||
                    i.local.toLowerCase().includes(qq)
                );
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [persist.itens, q, cat, onlyLow]);

    const quickItens = useMemo(() => {
        const qq = quickQ.trim().toLowerCase();
        if (!qq) return persist.itens.slice(0, 5);
        return persist.itens
            .filter(
                (i) =>
                    i.nome.toLowerCase().includes(qq) ||
                    (i.sku ?? '').toLowerCase().includes(qq) ||
                    i.local.toLowerCase().includes(qq) ||
                    i.categoria.toLowerCase().includes(qq),
            )
            .slice(0, 6);
    }, [persist.itens, quickQ]);

    const logs = useMemo(() => {
        const filtered = persist.logs.filter((l) => {
            if (logTipo !== 'TUDO' && l.tipo !== logTipo) return false;
            if (logItem !== 'TODOS' && l.itemId !== logItem) return false;
            return true;
        });
        return filtered.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    }, [persist.logs, logTipo, logItem]);

    function getItem(id: string) {
        return persist.itens.find((i) => i.id === id);
    }

    function pushLog(entry: Omit<LogEntry, 'id' | 'criadoEm'>) {
        const log: LogEntry = { id: uid('log'), criadoEm: nowISO(), ...entry };
        setPersist((prev) => ({ ...prev, logs: [log, ...prev.logs] }));
    }

    function updateItem(updated: StockItem) {
        setPersist((prev) => ({
            ...prev,
            itens: prev.itens.map((it) => (it.id === updated.id ? updated : it)),
        }));
    }

    function applyEntrada() {
        const it = getItem(itemId);
        if (!it) return alert('Selecione um item válido.');
        const qtd = clampInt(inQtd);
        if (qtd <= 0) return alert('Quantidade deve ser maior que 0.');
        const user = usuario.trim();
        if (!user) return alert('Informe usuário.');

        const antes = it.quantidade;
        const depois = antes + qtd;

        updateItem({ ...it, quantidade: depois, atualizadoEm: nowISO() });
        pushLog({
            tipo: 'ENTRADA',
            itemId: it.id,
            usuario: user,
            qtd,
            referencia: inRef.trim() || undefined,
            nota: inNota.trim() || undefined,
            antes,
            depois,
        });

        setInQtd(1);
        setInRef('');
        setInNota('');
        setTab('LOG');
    }

    function applySaida() {
        const it = getItem(itemId);
        if (!it) return alert('Selecione um item válido.');
        const qtd = clampInt(outQtd);
        if (qtd <= 0) return alert('Quantidade deve ser maior que 0.');
        const user = usuario.trim();
        if (!user) return alert('Informe usuário.');
        if (qtd > it.quantidade) return alert(`Saída maior que o disponível (${it.quantidade} ${it.unidade}).`);

        const antes = it.quantidade;
        const depois = antes - qtd;

        updateItem({ ...it, quantidade: depois, atualizadoEm: nowISO() });
        pushLog({
            tipo: 'SAIDA',
            itemId: it.id,
            usuario: user,
            qtd,
            referencia: outRef.trim() || undefined,
            nota: outNota.trim() || undefined,
            antes,
            depois,
        });

        setOutQtd(1);
        setOutRef('');
        setOutNota('');
        setTab('LOG');
    }

    function applyTransferencia() {
        const it = getItem(itemId);
        if (!it) return alert('Selecione um item válido.');
        const qtd = clampInt(trQtd);
        if (qtd <= 0) return alert('Quantidade deve ser maior que 0.');
        const user = usuario.trim();
        if (!user) return alert('Informe usuário.');
        if (qtd > it.quantidade) return alert(`Transferência maior que o disponível (${it.quantidade} ${it.unidade}).`);

        const origem = it.local;
        const destino = trPara.trim();
        if (!destino) return alert('Informe o local de destino.');

        const antes = it.quantidade;
        const depois = antes; // qtd não muda (só muda local) — se você quiser “quebrar” por locais, isso vira 2 depósitos
        updateItem({ ...it, local: destino, atualizadoEm: nowISO() });

        pushLog({
            tipo: 'TRANSFERENCIA',
            itemId: it.id,
            usuario: user,
            qtd,
            de: origem,
            para: destino,
            referencia: trRef.trim() || undefined,
            nota: trNota.trim() || undefined,
            antes,
            depois,
        });

        setTrQtd(1);
        setTrPara('Almox B / Prat C1');
        setTrRef('');
        setTrNota('');
        setTab('LOG');
    }

    function applyConferencia() {
        const it = getItem(itemId);
        if (!it) return alert('Selecione um item válido.');
        const user = usuario.trim();
        if (!user) return alert('Informe usuário.');
        const qtd = clampInt(confQtd);
        if (qtd < 0) return alert('Quantidade inválida.');

        const antes = it.quantidade;
        const depois = qtd;

        updateItem({ ...it, quantidade: depois, atualizadoEm: nowISO() });
        pushLog({
            tipo: 'CONFERENCIA',
            itemId: it.id,
            usuario: user,
            qtd,
            nota: confNota.trim() || undefined,
            antes,
            depois,
        });

        setConfQtd(0);
        setConfNota('');
        setTab('LOG');
    }

    function resetLocal() {
        const ok = confirm('Resetar dados locais (estoque + logs) para o padrão?');
        if (!ok) return;
        setPersist(SEED);
        setItemId(SEED.itens[0]?.id ?? '');
        setTab('HOME');
    }

    // UI: item selector label
    const selectedItem = useMemo(() => getItem(itemId), [itemId, persist.itens]);

    // Bottom nav (mobile-first)
    const nav = useMemo(
        () => [
            { key: 'HOME' as const, label: 'Início' },
            { key: 'SAIDA' as const, label: 'Saída', emphasis: true },
            { key: 'TRANSFER' as const, label: 'Transferir', emphasis: true },
            { key: 'ENTRADA' as const, label: 'Entrada' },
            { key: 'LOG' as const, label: 'Log' },
        ],
        [],
    );

    return (
        <main className="min-h-screen bg-slate-50 pb-28">
            <div className="mx-auto w-full max-w-6xl px-4 py-6">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Estoque • Admin</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Entrada, saída, transferência, conferência, alertas de baixo estoque e histórico estilo log.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-center gap-3 text-sm">
                                <span className="text-slate-600">
                                    Itens <b className="text-slate-900">{persist.itens.length}</b>
                                </span>
                                <span className="h-4 w-px bg-slate-200" />
                                <span className="text-slate-600">
                                    Alertas <b className="text-slate-900">{alerts.length}</b>
                                </span>
                                <span className="h-4 w-px bg-slate-200" />
                                <span className="text-slate-600">
                                    Logs <b className="text-slate-900">{persist.logs.length}</b>
                                </span>
                            </div>
                        </div>

                        <Button variant="ghost" onClick={resetLocal}>
                            Reset local
                        </Button>
                    </div>
                </div>

                {/* Top quick actions (desktop/tablet) */}
                <div className="mt-5 hidden gap-2 sm:flex">
                    <Button onClick={() => setTab('SAIDA')} className="w-full">
                        - Saída (rápido)
                    </Button>
                    <Button onClick={() => setTab('TRANSFER')} className="w-full">
                        ⇄ Transferir (destaque)
                    </Button>
                    <Button onClick={() => setTab('ENTRADA')} className="w-full">
                        + Entrada
                    </Button>
                    <Button variant="ghost" onClick={() => setTab('PESQUISA')} className="w-full">
                        🔎 Pesquisa
                    </Button>
                    <Button variant="ghost" onClick={() => setTab('ALERTAS')} className="w-full">
                        ⚠ Alertas ({alerts.length})
                    </Button>
                </div>

                {/* Main content */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* Left column (forms) */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* Item picker block (shared) */}
                        <Card
                            title="Selecionar item"
                            subtitle="Escolha o item antes de registrar saída/entrada/transferência/conferência."
                            right={
                                <div className="flex items-center gap-2">
                                    {selectedItem ? (
                                        selectedItem.quantidade <= selectedItem.minimo ? (
                                            <Badge tone="danger">Baixo estoque</Badge>
                                        ) : (
                                            <Badge tone="ok">OK</Badge>
                                        )
                                    ) : (
                                        <Badge>Selecione</Badge>
                                    )}
                                </div>
                            }
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Usuário">
                                    <TextInput value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Ex: Admin" />
                                </Field>

                                <Field label="Item">
                                    <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                                        {persist.itens.map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.nome} {it.sku ? `(${it.sku})` : ''} — {it.quantidade} {it.unidade}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                {selectedItem ? (
                                    <div className="sm:col-span-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold text-slate-900">{selectedItem.nome}</p>
                                                <p className="mt-1 text-xs text-slate-600">
                                                    {selectedItem.sku ? `SKU: ${selectedItem.sku} • ` : ''}
                                                    Cat: {selectedItem.categoria} • Local: {selectedItem.local}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-slate-700">
                                                    <b className="text-slate-900">{selectedItem.quantidade}</b> {selectedItem.unidade}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    Mínimo: {selectedItem.minimo} {selectedItem.unidade}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </Card>

                        {tab === 'HOME' ? (
                            <Card
                                title="Ações rápidas"
                                subtitle="No celular, use a barra inferior. Aqui vai um modo rápido pra localizar itens."
                                right={
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" onClick={() => setTab('ALERTAS')}>
                                            Ver alertas
                                        </Button>
                                        <Button variant="ghost" onClick={() => setTab('PESQUISA')}>
                                            Pesquisa completa
                                        </Button>
                                    </div>
                                }
                            >
                                <Field label="Busca rápida">
                                    <TextInput value={quickQ} onChange={(e) => setQuickQ(e.target.value)} placeholder="Digite nome, SKU, local..." />
                                </Field>

                                <div className="mt-3 grid grid-cols-1 gap-2">
                                    {quickItens.map((it) => {
                                        const low = it.quantidade <= it.minimo;
                                        return (
                                            <button
                                                key={it.id}
                                                onClick={() => {
                                                    setItemId(it.id);
                                                    setTab(low ? 'TRANSFER' : 'SAIDA');
                                                }}
                                                className="rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:bg-slate-50"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-bold text-slate-900">{it.nome}</p>
                                                        <p className="mt-1 text-xs text-slate-600">
                                                            {it.sku ? `SKU: ${it.sku} • ` : ''}{it.categoria} • {it.local}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {it.quantidade} <span className="text-slate-600">{it.unidade}</span>
                                                        </p>
                                                        <Badge tone={low ? 'danger' : 'ok'}>{low ? 'Baixo' : 'OK'}</Badge>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'ENTRADA' ? (
                            <Card
                                title="Entrada"
                                subtitle="Aumenta o saldo do item e registra no log."
                                right={<Badge tone="ok">ENTRADA</Badge>}
                            >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Quantidade">
                                        <TextInput type="number" min={1} step={1} value={inQtd} onChange={(e) => setInQtd(Number(e.target.value))} />
                                    </Field>
                                    <Field label="Referência (opcional)" hint="NF / fornecedor / pedido...">
                                        <TextInput value={inRef} onChange={(e) => setInRef(e.target.value)} placeholder="Ex: NF 123" />
                                    </Field>
                                    <div className="sm:col-span-2">
                                        <Field label="Nota (opcional)">
                                            <TextArea value={inNota} onChange={(e) => setInNota(e.target.value)} placeholder="Detalhes da entrada..." />
                                        </Field>
                                    </div>
                                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                                        <Button onClick={applyEntrada}>Confirmar entrada</Button>
                                        <Button variant="ghost" onClick={() => setTab('LOG')}>
                                            Ver log
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'SAIDA' ? (
                            <Card
                                title="Saída (destaque)"
                                subtitle="Reduz o saldo do item. Bloqueia se a saída for maior que o disponível."
                                right={<Badge tone="danger">SAÍDA</Badge>}
                            >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Quantidade">
                                        <TextInput type="number" min={1} step={1} value={outQtd} onChange={(e) => setOutQtd(Number(e.target.value))} />
                                    </Field>
                                    <Field label="Referência (opcional)" hint="OS / obra / destino / centro de custo...">
                                        <TextInput value={outRef} onChange={(e) => setOutRef(e.target.value)} placeholder="Ex: OS-9912" />
                                    </Field>
                                    <div className="sm:col-span-2">
                                        <Field label="Nota (opcional)">
                                            <TextArea value={outNota} onChange={(e) => setOutNota(e.target.value)} placeholder="Detalhes da saída..." />
                                        </Field>
                                    </div>
                                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                                        <Button variant="danger" onClick={applySaida}>
                                            Confirmar saída
                                        </Button>
                                        <Button variant="ghost" onClick={() => setTab('LOG')}>
                                            Ver log
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'TRANSFER' ? (
                            <Card
                                title="Transferência (destaque)"
                                subtitle="Move o item para outro local e registra no log (não altera saldo)."
                                right={<Badge tone="warn">TRANSFERÊNCIA</Badge>}
                            >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Quantidade (informativo)">
                                        <TextInput
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={trQtd}
                                            onChange={(e) => setTrQtd(Number(e.target.value))}
                                        />
                                    </Field>
                                    <Field label="Destino (local)">
                                        <TextInput value={trPara} onChange={(e) => setTrPara(e.target.value)} placeholder="Ex: Almox B / Prat C1" />
                                    </Field>
                                    <Field label="Referência (opcional)">
                                        <TextInput value={trRef} onChange={(e) => setTrRef(e.target.value)} placeholder="Ex: Transfer interno" />
                                    </Field>
                                    <div className="sm:col-span-2">
                                        <Field label="Nota (opcional)">
                                            <TextArea value={trNota} onChange={(e) => setTrNota(e.target.value)} placeholder="Motivo / quem solicitou / detalhe..." />
                                        </Field>
                                    </div>

                                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                                        <Button onClick={applyTransferencia}>Confirmar transferência</Button>
                                        <Button variant="ghost" onClick={() => setTab('LOG')}>
                                            Ver log
                                        </Button>
                                    </div>

                                    {selectedItem ? (
                                        <div className="sm:col-span-2 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                            <b>Atenção:</b> este exemplo trabalha com <b>1 local por item</b>. Ao transferir, ele altera o campo
                                            <b> local</b> do item. Se você precisar “quantidade por depósito”, o modelo vira “estoque por local”
                                            (eu adapto fácil).
                                        </div>
                                    ) : null}
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'CONFER' ? (
                            <Card
                                title="Conferência"
                                subtitle="Ajusta o saldo para o valor conferido (ex: inventário)."
                                right={<Badge>CONFERÊNCIA</Badge>}
                            >
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Quantidade conferida">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={confQtd}
                                            onChange={(e) => setConfQtd(Number(e.target.value))}
                                        />
                                    </Field>
                                    <Field label="Nota (opcional)" hint="Motivo do ajuste / divergência...">
                                        <TextInput value={confNota} onChange={(e) => setConfNota(e.target.value)} placeholder="Ex: inventário 03/12" />
                                    </Field>
                                    <div className="sm:col-span-2 flex flex-wrap gap-2">
                                        <Button onClick={applyConferencia}>Confirmar conferência</Button>
                                        <Button variant="ghost" onClick={() => setTab('LOG')}>
                                            Ver log
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'ALERTAS' ? (
                            <Card
                                title="Alertas de Estoque Baixo"
                                subtitle="Itens com quantidade no mínimo ou abaixo do mínimo."
                                right={<Badge tone={alerts.length ? 'danger' : 'ok'}>{alerts.length ? `${alerts.length} alerta(s)` : 'OK'}</Badge>}
                            >
                                {alerts.length === 0 ? (
                                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                                        Nenhum item em alerta 🎉
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {alerts
                                            .slice()
                                            .sort((a, b) => (a.quantidade - a.minimo) - (b.quantidade - b.minimo))
                                            .map((it) => {
                                                const deficit = it.minimo - it.quantidade;
                                                return (
                                                    <div key={it.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-extrabold text-slate-900">{it.nome}</p>
                                                                <p className="mt-1 text-xs text-slate-600">
                                                                    {it.categoria} • {it.local} {it.sku ? `• SKU: ${it.sku}` : ''}
                                                                </p>
                                                                <p className="mt-2 text-sm text-slate-800">
                                                                    Disponível: <b>{it.quantidade}</b> {it.unidade} • Mínimo: <b>{it.minimo}</b> {it.unidade}
                                                                    {deficit > 0 ? (
                                                                        <>
                                                                            {' '}
                                                                            • Falta: <b>{deficit}</b> {it.unidade}
                                                                        </>
                                                                    ) : null}
                                                                </p>
                                                            </div>
                                                            <Badge tone="danger">Baixo</Badge>
                                                        </div>

                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <Button
                                                                onClick={() => {
                                                                    setItemId(it.id);
                                                                    setTab('ENTRADA');
                                                                }}
                                                            >
                                                                + Entrada
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setItemId(it.id);
                                                                    setTab('TRANSFER');
                                                                }}
                                                            >
                                                                ⇄ Transferir
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                onClick={() => {
                                                                    setItemId(it.id);
                                                                    setTab('SAIDA');
                                                                }}
                                                            >
                                                                - Saída
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </Card>
                        ) : null}

                        {tab === 'PESQUISA' ? (
                            <Card title="Pesquisa de Estoque" subtitle="Filtros por texto, categoria e itens com estoque baixo.">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <Field label="Busca">
                                        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, SKU, local, categoria..." />
                                    </Field>
                                    <Field label="Categoria">
                                        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
                                            {categorias.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    <Field label="Somente baixo estoque">
                                        <div className="flex h-[50px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
                                            <input id="onlyLow" type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" />
                                            <label htmlFor="onlyLow" className="text-sm text-slate-700">
                                                Mostrar
                                            </label>
                                        </div>
                                    </Field>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-2">
                                    {estoqueBase.length === 0 ? (
                                        <p className="text-sm text-slate-500">Nenhum item encontrado.</p>
                                    ) : (
                                        estoqueBase.map((it) => {
                                            const low = it.quantidade <= it.minimo;
                                            return (
                                                <div key={it.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-extrabold text-slate-900">{it.nome}</p>
                                                            <p className="mt-1 text-xs text-slate-600">
                                                                {it.categoria} • {it.local} {it.sku ? `• SKU: ${it.sku}` : ''}
                                                            </p>
                                                            <p className="mt-2 text-sm text-slate-800">
                                                                <b>{it.quantidade}</b> {it.unidade} <span className="text-slate-500">• mín {it.minimo}</span>
                                                            </p>
                                                        </div>
                                                        <Badge tone={low ? 'danger' : 'ok'}>{low ? 'Baixo' : 'OK'}</Badge>
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <Button
                                                            variant="danger"
                                                            onClick={() => {
                                                                setItemId(it.id);
                                                                setTab('SAIDA');
                                                            }}
                                                        >
                                                            - Saída
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setItemId(it.id);
                                                                setTab('ENTRADA');
                                                            }}
                                                        >
                                                            + Entrada
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setItemId(it.id);
                                                                setTab('TRANSFER');
                                                            }}
                                                        >
                                                            ⇄ Transferir
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setItemId(it.id);
                                                                setConfQtd(it.quantidade);
                                                                setTab('CONFER');
                                                            }}
                                                        >
                                                            ✓ Conferir
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </Card>
                        ) : null}

                        {tab === 'LOG' ? (
                            <Card
                                title="Histórico (Log)"
                                subtitle="Registro cronológico de tudo: entrada, saída, transferências e conferências."
                                right={
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Select value={logTipo} onChange={(e) => setLogTipo(e.target.value as any)} className="sm:w-[200px]">
                                            <option value="TUDO">Tudo</option>
                                            <option value="ENTRADA">Entradas</option>
                                            <option value="SAIDA">Saídas</option>
                                            <option value="TRANSFERENCIA">Transferências</option>
                                            <option value="CONFERENCIA">Conferências</option>
                                            <option value="OBS">Observações</option>
                                        </Select>
                                        <Select value={logItem} onChange={(e) => setLogItem(e.target.value)} className="sm:w-[220px]">
                                            <option value="TODOS">Todos os itens</option>
                                            {persist.itens.map((it) => (
                                                <option key={it.id} value={it.id}>
                                                    {it.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </div>
                                }
                            >
                                {logs.length === 0 ? (
                                    <p className="text-sm text-slate-500">Sem registros ainda.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {logs.map((l) => {
                                            const it = getItem(l.itemId);
                                            const { tone, label } = toneFor(l.tipo);
                                            return (
                                                <div key={l.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-extrabold text-slate-900">
                                                                {label} • {it?.nome ?? 'Item removido'}
                                                            </p>
                                                            <p className="mt-1 text-xs text-slate-600">
                                                                {fmtDate(l.criadoEm)} • {l.usuario}
                                                                {l.referencia ? ` • Ref: ${l.referencia}` : ''}
                                                            </p>
                                                        </div>
                                                        <Badge tone={tone}>{l.tipo}</Badge>
                                                    </div>

                                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {typeof l.qtd === 'number' ? (
                                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                                                                Qtd: <b>{l.qtd}</b> {it?.unidade ?? ''}
                                                            </div>
                                                        ) : null}

                                                        {typeof l.antes === 'number' && typeof l.depois === 'number' ? (
                                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                                                                Saldo: <b>{l.antes}</b> → <b>{l.depois}</b> {it?.unidade ?? ''}
                                                            </div>
                                                        ) : null}

                                                        {l.tipo === 'TRANSFERENCIA' ? (
                                                            <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                                                Local: <b>{l.de ?? '-'}</b> → <b>{l.para ?? '-'}</b>
                                                            </div>
                                                        ) : null}

                                                        {l.nota ? (
                                                            <div className="sm:col-span-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-800">
                                                                {l.nota}
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <Button
                                                            variant="danger"
                                                            onClick={() => {
                                                                setItemId(l.itemId);
                                                                setTab('SAIDA');
                                                            }}
                                                        >
                                                            Nova saída
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setItemId(l.itemId);
                                                                setTab('ENTRADA');
                                                            }}
                                                        >
                                                            Nova entrada
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setItemId(l.itemId);
                                                                setTab('TRANSFER');
                                                            }}
                                                        >
                                                            Transferir
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        ) : null}
                    </div>

                    {/* Right column (overview) */}
                    <div className="lg:col-span-5 space-y-4">
                        <Card title="Painel rápido" subtitle="Visão geral + atalhos.">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold text-slate-600">Alertas</p>
                                    <p className="mt-1 text-2xl font-extrabold text-slate-900">{alerts.length}</p>
                                </div>
                                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold text-slate-600">Logs hoje</p>
                                    <p className="mt-1 text-2xl font-extrabold text-slate-900">
                                        {persist.logs.filter((x) => x.criadoEm.slice(0, 10) === nowISO().slice(0, 10)).length}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-2">
                                <Button variant="danger" onClick={() => setTab('SAIDA')}>
                                    - Saída (principal)
                                </Button>
                                <Button onClick={() => setTab('TRANSFER')}>⇄ Transferir (principal)</Button>
                                <Button variant="ghost" onClick={() => setTab('CONFER')}>
                                    ✓ Conferência
                                </Button>
                                <Button variant="ghost" onClick={() => setTab('ALERTAS')}>
                                    ⚠ Alertas de baixo estoque
                                </Button>
                                <Button variant="ghost" onClick={() => setTab('PESQUISA')}>
                                    🔎 Pesquisa
                                </Button>
                            </div>
                        </Card>

                        <Card title="Itens em alerta (top)" subtitle="Clique para atuar rápido.">
                            {alerts.length === 0 ? (
                                <p className="text-sm text-slate-500">Sem alertas.</p>
                            ) : (
                                <div className="space-y-2">
                                    {alerts
                                        .slice()
                                        .sort((a, b) => (a.quantidade - a.minimo) - (b.quantidade - b.minimo))
                                        .slice(0, 5)
                                        .map((it) => (
                                            <button
                                                key={it.id}
                                                onClick={() => {
                                                    setItemId(it.id);
                                                    setTab('ENTRADA');
                                                }}
                                                className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:bg-slate-50"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-extrabold text-slate-900">{it.nome}</p>
                                                        <p className="mt-1 text-xs text-slate-600">{it.local}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-extrabold text-slate-900">
                                                            {it.quantidade} <span className="text-slate-600">{it.unidade}</span>
                                                        </p>
                                                        <Badge tone="danger">Baixo</Badge>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </Card>

                        <Card title="Admin: ajuste mínimo/local" subtitle="Opcional (salvo no navegador).">
                            <div className="space-y-3">
                                {persist.itens.map((it) => (
                                    <div key={it.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <p className="text-sm font-extrabold text-slate-900">{it.nome}</p>
                                        <p className="mt-1 text-xs text-slate-600">{it.sku ? `SKU: ${it.sku} • ` : ''}{it.categoria}</p>

                                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <Field label="Mínimo">
                                                <TextInput
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={it.minimo}
                                                    onChange={(e) => updateItem({ ...it, minimo: clampInt(e.target.value), atualizadoEm: nowISO() })}
                                                />
                                            </Field>
                                            <Field label="Local">
                                                <TextInput
                                                    value={it.local}
                                                    onChange={(e) => updateItem({ ...it, local: e.target.value, atualizadoEm: nowISO() })}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Mobile bottom nav (destaque Saída e Transferir) */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-3">
                    {nav.map((n) => {
                        const active = tab === n.key;
                        const isEmphasis = (n as any).emphasis;
                        return (
                            <button
                                key={n.key}
                                onClick={() => setTab(n.key)}
                                className={[
                                    'flex-1 rounded-2xl px-2 py-2 text-center text-xs font-extrabold transition',
                                    active ? 'bg-slate-900 text-white' : isEmphasis ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'text-slate-700 hover:bg-slate-50',
                                ].join(' ')}
                            >
                                {n.label}
                            </button>
                        );
                    })}
                </div>
            </nav>
        </main>
    );
}
