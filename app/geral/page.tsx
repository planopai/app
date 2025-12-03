'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type StockItem = {
    id: string;
    sku?: string;
    nome: string;
    categoria: string;
    unidade: string; // ex: un, kg, m, cx
    quantidade: number;
    minimo: number; // ponto de alerta
    local?: string;
    atualizadoEm: string; // ISO date
};

type MovementType = 'ENTRADA' | 'SAIDA';

type Movement = {
    id: string;
    tipo: MovementType;
    itemId: string;
    quantidade: number;
    responsavel: string;
    referencia?: string; // fornecedor / OS / destino / etc
    observacao?: string;
    criadoEm: string; // ISO date
};

type Note = {
    id: string;
    itemId?: string; // opcional
    titulo: string;
    texto: string;
    autor: string;
    criadoEm: string; // ISO date
};

type HistoryRow =
    | { kind: 'MOV'; data: Movement }
    | { kind: 'NOTE'; data: Note };

function uid(prefix = 'id') {
    // uid simples e determinístico o suficiente para uso local
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function nowISO() {
    return new Date().toISOString();
}

function fmtDate(iso: string) {
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function clampInt(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function useLocalStorageState<T>(key: string, initialValue: T) {
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            setValue(JSON.parse(raw));
        } catch {
            // se falhar, mantém o initialValue
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // sem storage? segue vida
        }
    }, [key, value]);

    return [value, setValue] as const;
}

type TabKey = 'ALERTAS' | 'ENTRADA' | 'SAIDA' | 'OBS' | 'HIST' | 'ESTOQUE';

const LS_KEY = 'estoque_admin_panel_v1';

type Persisted = {
    itens: StockItem[];
    movimentos: Movement[];
    observacoes: Note[];
};

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
            local: 'Prateleira A1',
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
            local: 'Gaveta B2',
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
            local: 'Armário EPI',
            atualizadoEm: nowISO(),
        },
    ],
    movimentos: [],
    observacoes: [],
};

function Badge({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode;
    tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
    const toneCls =
        tone === 'ok'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : tone === 'warn'
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                : tone === 'danger'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneCls}`}>
            {children}
        </span>
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
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
                    {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

function Field({
    label,
    children,
    hint,
}: {
    label: string;
    children: React.ReactNode;
    hint?: string;
}) {
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
                'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900',
                'placeholder:text-slate-400 shadow-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
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
                'min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900',
                'placeholder:text-slate-400 shadow-sm outline-none',
                'focus:border-slate-400 focus:ring-2 focus:ring-slate-200',
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
    variant?: 'solid' | 'ghost' | 'danger';
}) {
    const cls =
        variant === 'solid'
            ? 'bg-slate-900 text-white hover:bg-slate-800'
            : variant === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-transparent text-slate-700 hover:bg-slate-100';
    return (
        <button
            {...props}
            className={[
                'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
                'disabled:cursor-not-allowed disabled:opacity-50',
                cls,
                props.className ?? '',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

export default function Page() {
    const [persist, setPersist] = useLocalStorageState<Persisted>(LS_KEY, SEED);
    const [tab, setTab] = useState<TabKey>('ESTOQUE');

    // filtros de estoque
    const [q, setQ] = useState('');
    const [cat, setCat] = useState<string>('Todas');
    const [onlyAlerts, setOnlyAlerts] = useState(false);

    // movimentos (entrada/saida)
    const [movItemId, setMovItemId] = useState<string>(persist.itens[0]?.id ?? '');
    const [movQtd, setMovQtd] = useState<number>(1);
    const [movResp, setMovResp] = useState<string>('Admin');
    const [movRef, setMovRef] = useState<string>('');
    const [movObs, setMovObs] = useState<string>('');

    // observações
    const [noteItemId, setNoteItemId] = useState<string>('');
    const [noteTitulo, setNoteTitulo] = useState<string>('');
    const [noteTexto, setNoteTexto] = useState<string>('');
    const [noteAutor, setNoteAutor] = useState<string>('Admin');

    // histórico
    const [histTipo, setHistTipo] = useState<'TUDO' | 'MOV' | 'NOTE' | 'ENTRADA' | 'SAIDA'>('TUDO');

    const resetSeedRef = useRef(false);
    useEffect(() => {
        // se o storage vier vazio (ex: primeira carga), ajusta selects
        if (!movItemId && persist.itens[0]?.id) setMovItemId(persist.itens[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persist.itens.length]);

    const categorias = useMemo(() => {
        const set = new Set(persist.itens.map((i) => i.categoria).filter(Boolean));
        return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
    }, [persist.itens]);

    const alerts = useMemo(() => {
        return persist.itens
            .filter((i) => i.quantidade <= i.minimo)
            .sort((a, b) => (a.quantidade - a.minimo) - (b.quantidade - b.minimo));
    }, [persist.itens]);

    const estoqueFiltrado = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return persist.itens
            .filter((i) => (cat === 'Todas' ? true : i.categoria === cat))
            .filter((i) => (onlyAlerts ? i.quantidade <= i.minimo : true))
            .filter((i) => {
                if (!qq) return true;
                return (
                    i.nome.toLowerCase().includes(qq) ||
                    (i.sku ?? '').toLowerCase().includes(qq) ||
                    i.categoria.toLowerCase().includes(qq) ||
                    (i.local ?? '').toLowerCase().includes(qq)
                );
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [persist.itens, q, cat, onlyAlerts]);

    const totalItens = useMemo(() => persist.itens.length, [persist.itens.length]);

    const totalAlertas = alerts.length;

    const totalQuantidade = useMemo(() => {
        // soma bruta de quantidades (não-uniforme por unidade, mas útil como “volume”)
        return persist.itens.reduce((acc, it) => acc + (Number.isFinite(it.quantidade) ? it.quantidade : 0), 0);
    }, [persist.itens]);

    const historico = useMemo<HistoryRow[]>(() => {
        const rows: HistoryRow[] = [
            ...persist.movimentos.map((m) => ({ kind: 'MOV', data: m } as const)),
            ...persist.observacoes.map((n) => ({ kind: 'NOTE', data: n } as const)),
        ];

        const filtered = rows.filter((r) => {
            if (histTipo === 'TUDO') return true;
            if (histTipo === 'MOV') return r.kind === 'MOV';
            if (histTipo === 'NOTE') return r.kind === 'NOTE';
            if (histTipo === 'ENTRADA') return r.kind === 'MOV' && r.data.tipo === 'ENTRADA';
            if (histTipo === 'SAIDA') return r.kind === 'MOV' && r.data.tipo === 'SAIDA';
            return true;
        });

        return filtered.sort((a, b) => {
            const da = a.kind === 'MOV' ? a.data.criadoEm : a.data.criadoEm;
            const db = b.kind === 'MOV' ? b.data.criadoEm : b.data.criadoEm;
            return db.localeCompare(da);
        });
    }, [persist.movimentos, persist.observacoes, histTipo]);

    function upsertItem(updated: StockItem) {
        setPersist((prev) => ({
            ...prev,
            itens: prev.itens.map((i) => (i.id === updated.id ? updated : i)),
        }));
    }

    function addMovement(tipo: MovementType) {
        const item = persist.itens.find((i) => i.id === movItemId);
        if (!item) {
            alert('Selecione um item válido.');
            return;
        }

        const qtd = clampInt(Number(movQtd));
        if (qtd <= 0) {
            alert('Quantidade deve ser maior que 0.');
            return;
        }

        const responsavel = movResp.trim();
        if (!responsavel) {
            alert('Informe o responsável.');
            return;
        }

        if (tipo === 'SAIDA' && qtd > item.quantidade) {
            alert(`Saída maior que o disponível. Disponível: ${item.quantidade} ${item.unidade}.`);
            return;
        }

        const novoMov: Movement = {
            id: uid('mov'),
            tipo,
            itemId: item.id,
            quantidade: qtd,
            responsavel,
            referencia: movRef.trim() || undefined,
            observacao: movObs.trim() || undefined,
            criadoEm: nowISO(),
        };

        const novaQtd = tipo === 'ENTRADA' ? item.quantidade + qtd : item.quantidade - qtd;
        const updatedItem: StockItem = {
            ...item,
            quantidade: novaQtd,
            atualizadoEm: nowISO(),
        };

        setPersist((prev) => ({
            ...prev,
            itens: prev.itens.map((i) => (i.id === item.id ? updatedItem : i)),
            movimentos: [novoMov, ...prev.movimentos],
        }));

        // limpa campos “seguros”
        setMovQtd(1);
        setMovRef('');
        setMovObs('');
    }

    function addNote() {
        const autor = noteAutor.trim();
        const titulo = noteTitulo.trim();
        const texto = noteTexto.trim();

        if (!autor) {
            alert('Informe o autor.');
            return;
        }
        if (!titulo) {
            alert('Informe um título.');
            return;
        }
        if (!texto) {
            alert('Escreva a observação.');
            return;
        }

        const novo: Note = {
            id: uid('note'),
            itemId: noteItemId || undefined,
            autor,
            titulo,
            texto,
            criadoEm: nowISO(),
        };

        setPersist((prev) => ({
            ...prev,
            observacoes: [novo, ...prev.observacoes],
        }));

        setNoteTitulo('');
        setNoteTexto('');
        setNoteItemId('');
    }

    function hardReset() {
        const ok = confirm('Tem certeza que deseja resetar os dados (estoque, histórico e observações) para o padrão?');
        if (!ok) return;
        resetSeedRef.current = true;
        setPersist(SEED);
        setMovItemId(SEED.itens[0]?.id ?? '');
        setTab('ESTOQUE');
    }

    const tabs: { key: TabKey; label: string; pill?: () => React.ReactNode }[] = [
        { key: 'ESTOQUE', label: 'Estoque' },
        {
            key: 'ALERTAS',
            label: 'Alertas',
            pill: () =>
                totalAlertas > 0 ? (
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-2 text-xs font-semibold text-white">
                        {totalAlertas}
                    </span>
                ) : (
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700">
                        0
                    </span>
                ),
        },
        { key: 'ENTRADA', label: 'Entrada de material' },
        { key: 'SAIDA', label: 'Saída de material' },
        { key: 'OBS', label: 'Observações' },
        { key: 'HIST', label: 'Histórico' },
    ];

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Painel Administrativo de Estoque</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Controle entradas/saídas, alertas de mínimo, observações e histórico em um único lugar.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                            <div className="flex items-center gap-3 text-sm">
                                <span className="text-slate-600">
                                    Itens: <span className="font-semibold text-slate-900">{totalItens}</span>
                                </span>
                                <span className="h-4 w-px bg-slate-200" />
                                <span className="text-slate-600">
                                    Alertas: <span className="font-semibold text-slate-900">{totalAlertas}</span>
                                </span>
                                <span className="h-4 w-px bg-slate-200" />
                                <span className="text-slate-600">
                                    Volume: <span className="font-semibold text-slate-900">{totalQuantidade}</span>
                                </span>
                            </div>
                        </div>

                        <Button variant="ghost" onClick={hardReset} title="Resetar dados locais">
                            Reset local
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                    <div role="tablist" aria-label="Abas do painel" className="flex flex-wrap gap-2">
                        {tabs.map((t) => {
                            const active = tab === t.key;
                            return (
                                <button
                                    key={t.key}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setTab(t.key)}
                                    className={[
                                        'inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition',
                                        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                                    ].join(' ')}
                                >
                                    {t.label}
                                    {t.pill ? t.pill() : null}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="mt-6 grid grid-cols-1 gap-4">
                    {tab === 'ESTOQUE' ? (
                        <Card
                            title="Estoque (com filtros)"
                            subtitle="Pesquise por nome, SKU, categoria ou local. Filtre por categoria e por itens em alerta."
                            right={
                                <div className="flex items-center gap-2">
                                    <Badge tone={totalAlertas > 0 ? 'danger' : 'ok'}>
                                        {totalAlertas > 0 ? 'Atenção: itens abaixo do mínimo' : 'Tudo OK'}
                                    </Badge>
                                </div>
                            }
                        >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <Field label="Busca">
                                    <TextInput
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder="Ex: parafuso, LUVA, A1, CABO..."
                                    />
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

                                <Field label="Apenas em alerta">
                                    <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                                        <input
                                            id="onlyAlerts"
                                            type="checkbox"
                                            checked={onlyAlerts}
                                            onChange={(e) => setOnlyAlerts(e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        <label htmlFor="onlyAlerts" className="text-sm text-slate-700">
                                            Mostrar somente itens com quantidade ≤ mínimo
                                        </label>
                                    </div>
                                </Field>
                            </div>

                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[760px] border-separate border-spacing-0">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-500">
                                            <th className="border-b border-slate-200 pb-2 pr-3">Item</th>
                                            <th className="border-b border-slate-200 pb-2 pr-3">Categoria</th>
                                            <th className="border-b border-slate-200 pb-2 pr-3">Local</th>
                                            <th className="border-b border-slate-200 pb-2 pr-3">Qtd.</th>
                                            <th className="border-b border-slate-200 pb-2 pr-3">Mín.</th>
                                            <th className="border-b border-slate-200 pb-2 pr-3">Status</th>
                                            <th className="border-b border-slate-200 pb-2">Atualizado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {estoqueFiltrado.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-6 text-center text-slate-500">
                                                    Nenhum item encontrado com os filtros atuais.
                                                </td>
                                            </tr>
                                        ) : (
                                            estoqueFiltrado.map((it) => {
                                                const emAlerta = it.quantidade <= it.minimo;
                                                const status = emAlerta ? 'Em alerta' : 'OK';
                                                return (
                                                    <tr key={it.id} className="border-b border-slate-100">
                                                        <td className="py-3 pr-3">
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-slate-900">{it.nome}</span>
                                                                <span className="text-xs text-slate-500">
                                                                    {it.sku ? `SKU: ${it.sku} • ` : ''}
                                                                    Unidade: {it.unidade}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 pr-3 text-slate-700">{it.categoria}</td>
                                                        <td className="py-3 pr-3 text-slate-700">{it.local ?? '-'}</td>
                                                        <td className="py-3 pr-3 text-slate-900">
                                                            {it.quantidade} <span className="text-slate-500">{it.unidade}</span>
                                                        </td>
                                                        <td className="py-3 pr-3 text-slate-700">
                                                            {it.minimo} <span className="text-slate-500">{it.unidade}</span>
                                                        </td>
                                                        <td className="py-3 pr-3">
                                                            <Badge tone={emAlerta ? 'danger' : 'ok'}>{status}</Badge>
                                                        </td>
                                                        <td className="py-3 text-slate-500">{fmtDate(it.atualizadoEm)}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <Button variant="ghost" onClick={() => setTab('ENTRADA')}>
                                    + Registrar entrada
                                </Button>
                                <Button variant="ghost" onClick={() => setTab('SAIDA')}>
                                    - Registrar saída
                                </Button>
                                <Button variant="ghost" onClick={() => setTab('OBS')}>
                                    ✎ Nova observação
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {tab === 'ALERTAS' ? (
                        <Card title="Alertas" subtitle="Itens com quantidade no mínimo ou abaixo do mínimo.">
                            {alerts.length === 0 ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                                    Nenhum alerta no momento 🎉
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {alerts.map((it) => {
                                        const deficit = it.minimo - it.quantidade;
                                        return (
                                            <div
                                                key={it.id}
                                                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate font-semibold text-slate-900">{it.nome}</span>
                                                        <Badge tone="danger">Baixo estoque</Badge>
                                                        <span className="text-xs text-slate-500">{it.categoria}</span>
                                                    </div>
                                                    <p className="mt-1 text-sm text-slate-700">
                                                        Disponível: <b>{it.quantidade}</b> {it.unidade} • Mínimo: <b>{it.minimo}</b> {it.unidade}
                                                        {deficit > 0 ? (
                                                            <>
                                                                {' '}
                                                                • Falta: <b>{deficit}</b> {it.unidade}
                                                            </>
                                                        ) : null}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Local: {it.local ?? '-'} • Atualizado: {fmtDate(it.atualizadoEm)}
                                                    </p>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        onClick={() => {
                                                            setMovItemId(it.id);
                                                            setTab('ENTRADA');
                                                        }}
                                                    >
                                                        Registrar entrada
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setNoteItemId(it.id);
                                                            setNoteTitulo(`Reposição necessária: ${it.nome}`);
                                                            setTab('OBS');
                                                        }}
                                                    >
                                                        Criar observação
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    ) : null}

                    {tab === 'ENTRADA' ? (
                        <Card title="Entrada de material" subtitle="Registre entradas para atualizar o estoque e gerar histórico.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Field label="Item">
                                    <Select value={movItemId} onChange={(e) => setMovItemId(e.target.value)}>
                                        {persist.itens.map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.nome} {it.sku ? `(${it.sku})` : ''} — {it.quantidade} {it.unidade}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Quantidade (inteiro)">
                                    <TextInput
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={movQtd}
                                        onChange={(e) => setMovQtd(Number(e.target.value))}
                                        placeholder="Ex: 10"
                                    />
                                </Field>

                                <Field label="Responsável">
                                    <TextInput value={movResp} onChange={(e) => setMovResp(e.target.value)} placeholder="Ex: João" />
                                </Field>

                                <Field label="Referência (opcional)" hint="Ex: fornecedor, NF, pedido de compra...">
                                    <TextInput value={movRef} onChange={(e) => setMovRef(e.target.value)} placeholder="Ex: NF 12345" />
                                </Field>

                                <div className="md:col-span-2">
                                    <Field label="Observação (opcional)">
                                        <TextArea
                                            value={movObs}
                                            onChange={(e) => setMovObs(e.target.value)}
                                            placeholder="Detalhes úteis sobre a entrada..."
                                        />
                                    </Field>
                                </div>

                                <div className="md:col-span-2 flex flex-wrap gap-2">
                                    <Button onClick={() => addMovement('ENTRADA')}>Confirmar entrada</Button>
                                    <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                        Voltar ao estoque
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    {tab === 'SAIDA' ? (
                        <Card title="Saída de material" subtitle="Registre saídas com validação de quantidade disponível.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Field label="Item">
                                    <Select value={movItemId} onChange={(e) => setMovItemId(e.target.value)}>
                                        {persist.itens.map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.nome} {it.sku ? `(${it.sku})` : ''} — {it.quantidade} {it.unidade}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Quantidade (inteiro)">
                                    <TextInput
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={movQtd}
                                        onChange={(e) => setMovQtd(Number(e.target.value))}
                                        placeholder="Ex: 5"
                                    />
                                </Field>

                                <Field label="Responsável">
                                    <TextInput value={movResp} onChange={(e) => setMovResp(e.target.value)} placeholder="Ex: Maria" />
                                </Field>

                                <Field label="Referência (opcional)" hint="Ex: obra, OS, centro de custo, destino...">
                                    <TextInput value={movRef} onChange={(e) => setMovRef(e.target.value)} placeholder="Ex: OS-9912" />
                                </Field>

                                <div className="md:col-span-2">
                                    <Field label="Observação (opcional)">
                                        <TextArea
                                            value={movObs}
                                            onChange={(e) => setMovObs(e.target.value)}
                                            placeholder="Detalhes úteis sobre a saída..."
                                        />
                                    </Field>
                                </div>

                                <div className="md:col-span-2 flex flex-wrap gap-2">
                                    <Button onClick={() => addMovement('SAIDA')}>Confirmar saída</Button>
                                    <Button variant="ghost" onClick={() => setTab('ESTOQUE')}>
                                        Voltar ao estoque
                                    </Button>
                                </div>

                                <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                    Dica: a saída é bloqueada caso a quantidade informada seja maior que o disponível do item.
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    {tab === 'OBS' ? (
                        <Card title="Observações" subtitle="Registre anotações gerais ou vinculadas a um item do estoque.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Field label="Vincular a um item (opcional)">
                                    <Select value={noteItemId} onChange={(e) => setNoteItemId(e.target.value)}>
                                        <option value="">(Sem vínculo)</option>
                                        {persist.itens.map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.nome} {it.sku ? `(${it.sku})` : ''}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Autor">
                                    <TextInput value={noteAutor} onChange={(e) => setNoteAutor(e.target.value)} placeholder="Ex: Admin" />
                                </Field>

                                <div className="md:col-span-2">
                                    <Field label="Título">
                                        <TextInput
                                            value={noteTitulo}
                                            onChange={(e) => setNoteTitulo(e.target.value)}
                                            placeholder="Ex: Reposição pendente / Item danificado / Inventário..."
                                        />
                                    </Field>
                                </div>

                                <div className="md:col-span-2">
                                    <Field label="Texto">
                                        <TextArea
                                            value={noteTexto}
                                            onChange={(e) => setNoteTexto(e.target.value)}
                                            placeholder="Escreva a observação aqui..."
                                        />
                                    </Field>
                                </div>

                                <div className="md:col-span-2 flex flex-wrap gap-2">
                                    <Button onClick={addNote}>Salvar observação</Button>
                                    <Button variant="ghost" onClick={() => setTab('HIST')}>
                                        Ver no histórico
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h3 className="text-sm font-semibold text-slate-900">Recentes</h3>
                                <div className="mt-3 space-y-2">
                                    {persist.observacoes.length === 0 ? (
                                        <p className="text-sm text-slate-500">Ainda não há observações.</p>
                                    ) : (
                                        persist.observacoes.slice(0, 6).map((n) => {
                                            const item = n.itemId ? persist.itens.find((i) => i.id === n.itemId) : undefined;
                                            return (
                                                <div key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-900">{n.titulo}</p>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                {fmtDate(n.criadoEm)} • {n.autor}
                                                                {item ? ` • Item: ${item.nome}` : ''}
                                                            </p>
                                                        </div>
                                                        <Badge tone="neutral">OBS</Badge>
                                                    </div>
                                                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.texto}</p>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    {tab === 'HIST' ? (
                        <Card
                            title="Histórico"
                            subtitle="Mostra todas as observações e movimentações (entradas/saídas) em ordem cronológica."
                            right={
                                <Select value={histTipo} onChange={(e) => setHistTipo(e.target.value as any)} className="w-[220px]">
                                    <option value="TUDO">Tudo</option>
                                    <option value="MOV">Somente movimentações</option>
                                    <option value="ENTRADA">Somente entradas</option>
                                    <option value="SAIDA">Somente saídas</option>
                                    <option value="NOTE">Somente observações</option>
                                </Select>
                            }
                        >
                            {historico.length === 0 ? (
                                <p className="text-sm text-slate-500">Sem registros no histórico ainda.</p>
                            ) : (
                                <div className="space-y-2">
                                    {historico.map((r) => {
                                        if (r.kind === 'MOV') {
                                            const m = r.data as Movement;
                                            const item = persist.itens.find((i) => i.id === m.itemId);
                                            const tone = m.tipo === 'ENTRADA' ? 'ok' : 'warn';
                                            return (
                                                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-900">
                                                                {m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} • {item?.nome ?? 'Item removido'}
                                                            </p>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                {fmtDate(m.criadoEm)} • {m.responsavel}
                                                                {m.referencia ? ` • Ref.: ${m.referencia}` : ''}
                                                            </p>
                                                        </div>
                                                        <Badge tone={tone}>{m.tipo}</Badge>
                                                    </div>
                                                    <p className="mt-2 text-sm text-slate-700">
                                                        Quantidade: <b>{m.quantidade}</b>
                                                        {item ? ` ${item.unidade}` : ''}
                                                    </p>
                                                    {m.observacao ? (
                                                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{m.observacao}</p>
                                                    ) : null}
                                                </div>
                                            );
                                        }

                                        const n = r.data as Note;
                                        const item = n.itemId ? persist.itens.find((i) => i.id === n.itemId) : undefined;
                                        return (
                                            <div key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-900">{n.titulo}</p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            {fmtDate(n.criadoEm)} • {n.autor}
                                                            {item ? ` • Item: ${item.nome}` : ''}
                                                        </p>
                                                    </div>
                                                    <Badge tone="neutral">OBS</Badge>
                                                </div>
                                                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{n.texto}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    ) : null}

                    {/* Extra: edição rápida de mínimos (opcional, útil no admin) */}
                    <Card
                        title="Admin rápido (opcional)"
                        subtitle="Ajuste o mínimo de alerta e localização (fica salvo no localStorage)."
                    >
                        <div className="space-y-3">
                            {persist.itens.map((it) => (
                                <div key={it.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
                                    <div className="md:col-span-2">
                                        <p className="text-sm font-semibold text-slate-900">{it.nome}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {it.sku ? `SKU: ${it.sku} • ` : ''}Qtd: {it.quantidade} {it.unidade}
                                        </p>
                                    </div>

                                    <Field label="Mínimo">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={it.minimo}
                                            onChange={(e) => upsertItem({ ...it, minimo: clampInt(Number(e.target.value)), atualizadoEm: nowISO() })}
                                        />
                                    </Field>

                                    <Field label="Local (opcional)">
                                        <TextInput
                                            value={it.local ?? ''}
                                            onChange={(e) => upsertItem({ ...it, local: e.target.value, atualizadoEm: nowISO() })}
                                            placeholder="Ex: Prateleira A1"
                                        />
                                    </Field>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <footer className="mt-8 text-center text-xs text-slate-500">
                    Dados salvos localmente no navegador (localStorage). Para integrar de verdade, substitua o estado local por API
                    (Route Handlers/Server Actions + banco).
                </footer>
            </div>
        </main>
    );
}
