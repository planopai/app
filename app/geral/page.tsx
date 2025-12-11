'use client';

import React, { useEffect, useMemo, useState } from 'react';

const API = '/api/estoque_api.php';

type ID = number;

type Deposito = { id: ID; nome: string };
type Categoria = { id: ID; nome: string };
type Fabricante = { id: ID; nome: string };
type Produto = {
    id: ID;
    codigo: string;
    descricao: string;
    categoria_id: ID | null;
    fabricante_id: ID | null;
    preco_venda: number;
    est_minimo: number;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
};
type Saldo = { id: ID; produto_id: ID; deposito_id: ID; quantidade: number };

type InitResp = {
    ok: 1;
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    produtos: Produto[];
    saldos: Saldo[];
};

type MovItem = {
    produto_id: ID;
    dep_origem?: ID | null;
    dep_destino?: ID | null;
    quantidade: number;
    obs?: string;
};

function money(n: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
}

export default function EstoquePage() {
    const [tab, setTab] = useState<'MOV' | 'ESTOQUE' | 'AVANCADO'>('MOV');
    const [tipoMov, setTipoMov] = useState<'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA'>('ENTRADA');

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // filtros estoque
    const [buscaEst, setBuscaEst] = useState('');
    const [depEst, setDepEst] = useState<'all' | ID>('all');
    const [catEst, setCatEst] = useState<'all' | ID>('all');
    const [fabEst, setFabEst] = useState<'all' | ID>('all');

    // formulário de movimentação
    const [produtoId, setProdutoId] = useState<ID | 0>(0);
    const [depOrigem, setDepOrigem] = useState<ID | 0>(0);
    const [depDestino, setDepDestino] = useState<ID | 0>(0);
    const [qtd, setQtd] = useState(1);
    const [obs, setObs] = useState('');
    const [itens, setItens] = useState<MovItem[]>([]);

    const depById = useMemo(
        () => new Map(depositos.map((d) => [d.id, d] as const)),
        [depositos],
    );
    const prodById = useMemo(
        () => new Map(produtos.map((p) => [p.id, p] as const)),
        [produtos],
    );

    async function loadInit() {
        setLoading(true);
        setErr('');
        try {
            const r = await fetch(`${API}?op=init`, { credentials: 'include' });
            const j: InitResp = await r.json();
            if (!j.ok) throw new Error('Falha no init');

            setDepositos(j.depositos);
            setCategorias(j.categorias);
            setFabricantes(j.fabricantes);
            setProdutos(j.produtos);
            setSaldos(j.saldos);

            if (j.produtos[0]) setProdutoId(j.produtos[0].id);
            if (j.depositos[0]) {
                setDepOrigem(j.depositos[0].id);
                setDepDestino(j.depositos[0].id);
            }
        } catch (e: any) {
            setErr(e?.message || 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadInit();
    }, []);

    // estoque filtrado
    const estoque = useMemo(() => {
        const search = buscaEst.trim().toLowerCase();
        return saldos
            .map((s) => {
                const p = prodById.get(s.produto_id);
                const d = depById.get(s.deposito_id);
                if (!p || !d) return null;
                return { s, p, d };
            })
            .filter(Boolean)
            .filter((row: any) => {
                if (depEst !== 'all' && row.d.id !== depEst) return false;
                if (catEst !== 'all' && row.p.categoria_id !== catEst) return false;
                if (fabEst !== 'all' && row.p.fabricante_id !== fabEst) return false;
                if (!search) return true;
                const blob = `${row.p.descricao} ${row.p.codigo} ${row.d.nome} ${row.p.categoria_nome || ''
                    } ${row.p.fabricante_nome || ''}`.toLowerCase();
                return blob.includes(search);
            })
            .sort((a: any, b: any) => a.p.descricao.localeCompare(b.p.descricao, 'pt-BR'));
    }, [saldos, prodById, depById, buscaEst, depEst, catEst, fabEst]);

    function resetForm() {
        setQtd(1);
        setObs('');
    }

    function addItem() {
        if (!produtoId || qtd <= 0) return;
        const base: MovItem = {
            produto_id: produtoId,
            dep_origem: null,
            dep_destino: null,
            quantidade: qtd,
            obs: obs || undefined,
        };

        if (tipoMov === 'ENTRADA') base.dep_destino = depDestino || depOrigem;
        if (tipoMov === 'SAIDA') base.dep_origem = depOrigem;
        if (tipoMov === 'TRANSFERENCIA') {
            base.dep_origem = depOrigem;
            base.dep_destino = depDestino;
            if (!depOrigem || !depDestino || depOrigem === depDestino) return;
        }

        setItens((prev) => [...prev, base]);
        resetForm();
    }

    async function enviarLote() {
        if (!itens.length) return;
        const resp = await fetch(API, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: tipoMov.toLowerCase(), items: itens }),
        });
        const j = await resp.json();
        if (!j.ok) {
            alert(j.msg || 'Erro ao lançar');
            return;
        }
        setItens([]);
        await loadInit();
        alert('Movimentação salva');
    }

    return (
        <main className="mx-auto max-w-6xl px-3 py-4 text-sm">
            <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Controle de Estoque</h1>
                    <p className="text-xs text-slate-500">
                        Entrada • Saída • Transferência • Estoque • Importação CSV
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="rounded-lg border px-3 py-1 text-xs"
                        onClick={loadInit}
                    >
                        Atualizar
                    </button>
                </div>
            </header>

            {err && (
                <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {err}
                </div>
            )}

            {/* abas principais */}
            <div className="mb-3 flex gap-2">
                <button
                    className={`flex-1 rounded-lg px-3 py-1 text-xs font-medium ${tab === 'MOV' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border'
                        }`}
                    onClick={() => setTab('MOV')}
                >
                    Movimentações
                </button>
                <button
                    className={`flex-1 rounded-lg px-3 py-1 text-xs font-medium ${tab === 'ESTOQUE' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border'
                        }`}
                    onClick={() => setTab('ESTOQUE')}
                >
                    Estoque
                </button>
                <button
                    className={`flex-1 rounded-lg px-3 py-1 text-xs font-medium ${tab === 'AVANCADO' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border'
                        }`}
                    onClick={() => setTab('AVANCADO')}
                >
                    Avançado
                </button>
            </div>

            {/* MOVIMENTAÇÕES */}
            {tab === 'MOV' && (
                <section className="rounded-xl bg-white p-3 shadow-sm">
                    {/* sub-abas */}
                    <div className="mb-3 flex gap-2">
                        {(['ENTRADA', 'SAIDA', 'TRANSFERENCIA'] as const).map((t) => (
                            <button
                                key={t}
                                className={`flex-1 rounded-lg px-2 py-1 text-xs ${tipoMov === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                                    }`}
                                onClick={() => {
                                    setTipoMov(t);
                                    setItens([]);
                                    resetForm();
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">Produto</span>
                            <select
                                value={produtoId}
                                onChange={(e) => setProdutoId(Number(e.target.value))}
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                            >
                                {produtos.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.descricao} — CB:{p.codigo}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">Quantidade</span>
                            <input
                                type="number"
                                min={1}
                                value={qtd}
                                onChange={(e) => setQtd(Number(e.target.value))}
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                            />
                        </label>

                        {(tipoMov === 'SAIDA' || tipoMov === 'TRANSFERENCIA') && (
                            <label className="text-xs">
                                <span className="mb-1 block text-[11px] text-slate-600">
                                    Depósito origem
                                </span>
                                <select
                                    value={depOrigem}
                                    onChange={(e) => setDepOrigem(Number(e.target.value))}
                                    className="w-full rounded-lg border px-2 py-1 text-xs"
                                >
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {(tipoMov === 'ENTRADA' || tipoMov === 'TRANSFERENCIA') && (
                            <label className="text-xs">
                                <span className="mb-1 block text-[11px] text-slate-600">
                                    Depósito destino
                                </span>
                                <select
                                    value={depDestino}
                                    onChange={(e) => setDepDestino(Number(e.target.value))}
                                    className="w-full rounded-lg border px-2 py-1 text-xs"
                                >
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <label className="sm:col-span-2 text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">
                                Observação (opcional)
                            </span>
                            <textarea
                                value={obs}
                                onChange={(e) => setObs(e.target.value)}
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                            />
                        </label>

                        <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                                onClick={addItem}
                            >
                                Adicionar item
                            </button>
                            <button
                                type="button"
                                className="rounded-lg border px-3 py-1 text-xs"
                                onClick={enviarLote}
                                disabled={!itens.length}
                            >
                                Enviar lote ({itens.length})
                            </button>
                        </div>
                    </div>

                    {itens.length > 0 && (
                        <div className="mt-3 rounded-lg border bg-slate-50 p-2 text-[11px]">
                            <p className="mb-1 font-semibold">Itens do lote</p>
                            <ul className="space-y-1">
                                {itens.map((it, idx) => {
                                    const p = prodById.get(it.produto_id);
                                    return (
                                        <li
                                            key={idx}
                                            className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1"
                                        >
                                            <span className="truncate">
                                                {p?.descricao || `#${it.produto_id}`} – qtd {it.quantidade}{' '}
                                                {tipoMov !== 'ENTRADA' && it.dep_origem
                                                    ? ` • Origem: ${depById.get(it.dep_origem)?.nome || it.dep_origem}`
                                                    : ''}
                                                {tipoMov !== 'SAIDA' && it.dep_destino
                                                    ? ` • Destino: ${depById.get(it.dep_destino)?.nome || it.dep_destino}`
                                                    : ''}
                                            </span>
                                            <button
                                                className="text-[10px] text-red-600"
                                                onClick={() =>
                                                    setItens((prev) => prev.filter((_, i) => i !== idx))
                                                }
                                            >
                                                remover
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {/* ESTOQUE */}
            {tab === 'ESTOQUE' && (
                <section className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="mb-3 grid gap-2 sm:grid-cols-4">
                        <label className="text-xs sm:col-span-2">
                            <span className="mb-1 block text-[11px] text-slate-600">
                                Buscar (nome, código, etc.)
                            </span>
                            <input
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                                value={buscaEst}
                                onChange={(e) => setBuscaEst(e.target.value)}
                            />
                        </label>

                        <label className="text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">Depósito</span>
                            <select
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                                value={depEst}
                                onChange={(e) =>
                                    setDepEst(e.target.value === 'all' ? 'all' : Number(e.target.value))
                                }
                            >
                                <option value="all">Todos</option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">Categoria</span>
                            <select
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                                value={catEst}
                                onChange={(e) =>
                                    setCatEst(e.target.value === 'all' ? 'all' : Number(e.target.value))
                                }
                            >
                                <option value="all">Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs">
                            <span className="mb-1 block text-[11px] text-slate-600">Fabricante</span>
                            <select
                                className="w-full rounded-lg border px-2 py-1 text-xs"
                                value={fabEst}
                                onChange={(e) =>
                                    setFabEst(e.target.value === 'all' ? 'all' : Number(e.target.value))
                                }
                            >
                                <option value="all">Todos</option>
                                {fabricantes.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="rounded-lg border">
                        {loading ? (
                            <div className="p-4 text-center text-xs text-slate-500">Carregando…</div>
                        ) : !estoque.length ? (
                            <div className="p-4 text-center text-xs text-slate-500">
                                Nenhum item encontrado
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {estoque.map(({ s, p, d }: any) => (
                                    <li key={s.id} className="flex items-center justify-between px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold text-slate-900">
                                                {p.descricao}
                                            </p>
                                            <p className="truncate text-[11px] text-slate-500">
                                                CB:{p.codigo} • Depósito: {d.nome} • {p.categoria_nome || '—'} •{' '}
                                                {p.fabricante_nome || '—'}
                                            </p>
                                            <p className="text-[11px] text-slate-500">
                                                {money(Number(p.preco_venda || 0))}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-xs font-semibold">{s.quantidade}</p>
                                            <p className="text-[10px] text-slate-500">
                                                mín {p.est_minimo ?? 0}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            )}

            {/* AVANÇADO */}
            {tab === 'AVANCADO' && (
                <section className="rounded-xl bg-white p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold">Importar itens (CSV)</h2>
                    <p className="mb-2 text-[11px] text-slate-500">
                        Espera colunas: CODIGO, DESCRICAO, CATEGORIA, FABRICANTE, DEPOSITO, EST_MINIMO,
                        ESTOQUE, PRECO_VENDA… (igual à sua planilha).
                    </p>
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        className="mb-3 text-xs"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const fd = new FormData();
                            fd.append('action', 'import_csv');
                            fd.append('arquivo', file);
                            fetch(API, {
                                method: 'POST',
                                body: fd,
                                credentials: 'include',
                            })
                                .then((r) => r.json())
                                .then((j) => {
                                    if (!j.ok) {
                                        alert(j.msg || 'Erro ao importar');
                                        return;
                                    }
                                    alert(j.msg || 'Importado com sucesso');
                                    loadInit();
                                })
                                .catch(() => alert('Erro ao enviar CSV'));
                        }}
                    />

                    <hr className="my-3" />

                    <p className="mb-1 text-xs font-semibold">Depósitos cadastrados</p>
                    <ul className="space-y-1 text-[11px] text-slate-600">
                        {depositos.map((d) => (
                            <li key={d.id}>
                                #{d.id} – {d.nome}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
