"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    CONVENIO_API,
    LOGIN_URL,
    apiJson,
} from "./components/api";
import CoroaEditor from "./components/CoroaEditor";
import EstoquePicker from "./components/EstoquePicker";
import SecaoOS from "./components/SecaoOS";
import SimNaoSelect from "./components/SimNaoSelect";
import {
    DEP_CORDAO,
    DEP_INVOL,
    DEP_ROUPA,
    DEP_URNA,
    DEP_VEU,
    convenioNovo,
    normalizeRegras,
    type BooleanRegra,
    type Convenio,
    type RegrasConvenio,
    type SimNao,
} from "./components/tipos";

const inputCls =
    "w-full rounded-lg border border-[#E1E5EC] bg-white px-3 py-2 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC] disabled:bg-[#F4F6F9]";
const labelCls =
    "mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488]";

function normalizarConvenio(raw: any): Convenio {
    return {
        id: Number(raw?.id || 0),
        nome: String(raw?.nome || ""),
        slug: String(raw?.slug || ""),
        ativo: raw?.ativo !== false,
        ordem: Number(raw?.ordem || 0),
        observacao: String(raw?.observacao || ""),
        regras: normalizeRegras(raw?.regras || {}),
        versao: Number(raw?.versao || 0),
        criado_em: raw?.criado_em ? String(raw.criado_em) : "",
        atualizado_em: raw?.atualizado_em ? String(raw.atualizado_em) : "",
    };
}

async function convenioGet(action: "list" | "get" | "me", params: Record<string, any> = {}) {
    const u = new URL(CONVENIO_API);
    u.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    });
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}

async function convenioPost(body: Record<string, any>) {
    return apiJson(CONVENIO_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function Botao({
    children,
    primario,
    perigo,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    primario?: boolean;
    perigo?: boolean;
}) {
    const cls = perigo
        ? "bg-[#C0392B] text-white"
        : primario
            ? "bg-[#313C55] text-white"
            : "border border-[#E1E5EC] bg-white text-[#313C55]";

    return (
        <button
            type="button"
            {...props}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${props.className || ""}`}
        >
            {children}
        </button>
    );
}

function CardRegra({
    titulo,
    descricao,
    value,
    onChange,
    disabled,
    tipo,
}: {
    titulo: string;
    descricao?: string;
    value: BooleanRegra;
    onChange: (v: BooleanRegra) => void;
    disabled?: boolean;
    tipo?: boolean;
}) {
    return (
        <section className="rounded-xl border border-[#E1E5EC] bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
                <div>
                    <h3 className="font-semibold text-[#313C55]">{titulo}</h3>
                    {descricao && <p className="text-xs text-[#6B7488]">{descricao}</p>}
                </div>
                <SimNaoSelect
                    value={value.valor}
                    disabled={disabled}
                    onChange={(valor: SimNao) =>
                        onChange({
                            ...value,
                            valor,
                            ...(valor !== "Sim" && tipo ? { tipo: "" } : {}),
                        })
                    }
                />
            </div>

            {tipo && value.valor === "Sim" && (
                <div className="mt-4 border-t pt-4">
                    <label className="block text-sm">
                        <span className={labelCls}>Tipo</span>
                        <select
                            className={inputCls}
                            value={value.tipo || ""}
                            disabled={disabled}
                            onChange={(e) =>
                                onChange({
                                    ...value,
                                    tipo: e.target.value as "" | "Natural" | "Artificial",
                                })
                            }
                        >
                            <option value="">Selecione...</option>
                            <option value="Natural">Natural</option>
                            <option value="Artificial">Artificial</option>
                        </select>
                    </label>
                </div>
            )}
        </section>
    );
}

export default function ConveniosPage() {
    const [lista, setLista] = useState<Convenio[]>([]);
    const [selecionadoId, setSelecionadoId] = useState<number>(0);
    const [form, setForm] = useState<Convenio>(convenioNovo());
    const [busca, setBusca] = useState("");
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [confirmarExclusao, setConfirmarExclusao] = useState(false);

    const carregarLista = useCallback(async (manterId?: number) => {
        setLoading(true);
        setErro("");
        try {
            const r = await convenioGet("list", { include_inactive: 1 });
            const rows = Array.isArray(r?.rows) ? r.rows.map(normalizarConvenio) : [];
            setLista(rows);

            const alvo = manterId || selecionadoId;
            if (alvo && rows.some((x: Convenio) => x.id === alvo)) {
                setSelecionadoId(alvo);
            } else if (rows.length > 0 && !selecionadoId) {
                setSelecionadoId(rows[0].id);
            }
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os convênios.");
        } finally {
            setLoading(false);
        }
    }, [selecionadoId]);

    const carregarConvenio = useCallback(async (id: number) => {
        if (!id) {
            setForm(convenioNovo());
            return;
        }

        setErro("");
        try {
            const r = await convenioGet("get", { id });
            setForm(normalizarConvenio(r?.data));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o convênio.");
        }
    }, []);

    useEffect(() => {
        void convenioGet("me").catch((e: any) => {
            if (e?.status === 401) window.location.href = LOGIN_URL;
        });
        void carregarLista();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selecionadoId > 0) void carregarConvenio(selecionadoId);
    }, [selecionadoId, carregarConvenio]);

    const filtrados = useMemo(() => {
        const q = busca.trim().toLocaleLowerCase("pt-BR");
        if (!q) return lista;
        return lista.filter(
            (c) =>
                c.nome.toLocaleLowerCase("pt-BR").includes(q) ||
                c.slug.toLocaleLowerCase("pt-BR").includes(q),
        );
    }, [lista, busca]);

    const atualizarRegras = (fn: (r: RegrasConvenio) => RegrasConvenio) => {
        setForm((atual) => ({ ...atual, regras: fn(atual.regras) }));
        setMsg("");
    };

    const novo = () => {
        setSelecionadoId(0);
        setForm(convenioNovo());
        setErro("");
        setMsg("");
        setConfirmarExclusao(false);
    };

    const salvar = async () => {
        if (salvando) return;
        if (!form.nome.trim()) {
            setErro("Informe o nome do convênio.");
            return;
        }

        setSalvando(true);
        setErro("");
        setMsg("");

        try {
            const r = await convenioPost({
                action: "save",
                id: form.id,
                nome: form.nome.trim(),
                ativo: form.ativo,
                ordem: form.ordem,
                observacao: form.observacao,
                versao: form.versao,
                regras: form.regras,
            });

            const salvo = normalizarConvenio(r?.data);
            setForm(salvo);
            setSelecionadoId(salvo.id);
            setMsg(r?.msg || "Convênio salvo com sucesso.");
            await carregarLista(salvo.id);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar o convênio.");
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async () => {
        if (!form.id || salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await convenioPost({
                action: "set_active",
                id: form.id,
                ativo: !form.ativo,
                versao: form.versao,
            });
            setMsg(r?.msg || (!form.ativo ? "Convênio ativado." : "Convênio desativado."));
            await carregarLista(form.id);
            await carregarConvenio(form.id);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível alterar o status.");
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async () => {
        if (!form.id || salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await convenioPost({
                action: "delete",
                id: form.id,
                versao: form.versao,
                confirmacao: "EXCLUIR",
            });
            setMsg(r?.msg || "Convênio excluído.");
            setConfirmarExclusao(false);
            setSelecionadoId(0);
            setForm(convenioNovo());
            await carregarLista();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível excluir o convênio.");
        } finally {
            setSalvando(false);
        }
    };

    const disabled = salvando;

    return (
        <main className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-6">
            <div className="mx-auto max-w-[1500px]">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-sm text-[#6B7488]">
                            Cadastro, cobertura e regras usadas nas Ordens de Serviço
                        </div>
                        <h1 className="text-2xl font-extrabold">Convênios</h1>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <a
                            href="/os/financeiro"
                            className="rounded-lg border border-[#E1E5EC] bg-white px-4 py-2 text-sm font-bold"
                        >
                            Voltar ao financeiro
                        </a>
                        <Botao primario onClick={novo}>
                            Novo convênio
                        </Botao>
                    </div>
                </div>

                {erro && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {erro}
                    </div>
                )}

                {msg && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        {msg}
                    </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="rounded-xl border border-[#E1E5EC] bg-white p-4 xl:sticky xl:top-4 xl:self-start">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <div className="font-extrabold">Convênios cadastrados</div>
                                <div className="text-xs text-[#6B7488]">
                                    {lista.length} registro(s)
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void carregarLista()}
                                className="text-xs font-bold text-[#00AEEC]"
                            >
                                Recarregar
                            </button>
                        </div>

                        <input
                            className={inputCls}
                            placeholder="Buscar convênio..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                        />

                        <div className="mt-3 max-h-[70vh] overflow-y-auto">
                            {loading && (
                                <div className="p-3 text-sm text-[#6B7488]">
                                    Carregando...
                                </div>
                            )}

                            {!loading && filtrados.length === 0 && (
                                <div className="p-3 text-sm text-[#6B7488]">
                                    Nenhum convênio encontrado.
                                </div>
                            )}

                            {!loading &&
                                filtrados.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                            setSelecionadoId(c.id);
                                            setErro("");
                                            setMsg("");
                                            setConfirmarExclusao(false);
                                        }}
                                        className={`mb-2 w-full rounded-lg border px-3 py-3 text-left transition ${form.id === c.id
                                                ? "border-[#00AEEC] bg-[#EAF8FD]"
                                                : "border-[#E1E5EC] bg-white hover:bg-[#F8FAFC]"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-bold">{c.nome}</span>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${c.ativo
                                                        ? "bg-[#E6F0C9] text-[#313C55]"
                                                        : "bg-[#EEF1F5] text-[#6B7488]"
                                                    }`}
                                            >
                                                {c.ativo ? "ATIVO" : "INATIVO"}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-xs text-[#6B7488]">
                                            {c.slug || "sem slug"} · ordem {c.ordem}
                                        </div>
                                    </button>
                                ))}
                        </div>
                    </aside>

                    <div className="min-w-0 space-y-4">
                        <section className="rounded-xl border border-[#E1E5EC] bg-white p-5">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-extrabold">
                                        {form.id ? form.nome || "Editar convênio" : "Novo convênio"}
                                    </h2>
                                    <p className="text-xs text-[#6B7488]">
                                        O cadastro e as regras abaixo são gravados em convenio.php.
                                    </p>
                                </div>

                                {form.id > 0 && (
                                    <div className="flex gap-2">
                                        <Botao disabled={disabled} onClick={() => void alternarAtivo()}>
                                            {form.ativo ? "Desativar" : "Ativar"}
                                        </Botao>
                                        <Botao
                                            perigo
                                            disabled={disabled}
                                            onClick={() => setConfirmarExclusao(true)}
                                        >
                                            Excluir
                                        </Botao>
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_180px]">
                                <label>
                                    <span className={labelCls}>Nome do convênio</span>
                                    <input
                                        className={inputCls}
                                        value={form.nome}
                                        disabled={disabled}
                                        maxLength={150}
                                        onChange={(e) =>
                                            setForm({ ...form, nome: e.target.value })
                                        }
                                    />
                                </label>

                                <label>
                                    <span className={labelCls}>Ordem</span>
                                    <input
                                        type="number"
                                        className={inputCls}
                                        value={form.ordem}
                                        disabled={disabled}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                ordem: Number(e.target.value) || 0,
                                            })
                                        }
                                    />
                                </label>

                                <label>
                                    <span className={labelCls}>Status</span>
                                    <select
                                        className={inputCls}
                                        value={form.ativo ? "1" : "0"}
                                        disabled={disabled}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                ativo: e.target.value === "1",
                                            })
                                        }
                                    >
                                        <option value="1">Ativo</option>
                                        <option value="0">Inativo</option>
                                    </select>
                                </label>
                            </div>

                            <label className="mt-3 block">
                                <span className={labelCls}>Observação</span>
                                <textarea
                                    className={inputCls}
                                    rows={3}
                                    maxLength={1000}
                                    value={form.observacao}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        setForm({ ...form, observacao: e.target.value })
                                    }
                                />
                            </label>

                            {form.id > 0 && (
                                <div className="mt-3 text-xs text-[#6B7488]">
                                    Slug: <b>{form.slug}</b> · versão {form.versao}
                                </div>
                            )}
                        </section>

                        <section>
                            <div className="mb-2">
                                <h2 className="text-lg font-extrabold">Itens e coberturas</h2>
                                <p className="text-xs text-[#6B7488]">
                                    Marque o que o convênio oferece e, quando houver produto físico,
                                    escolha o modelo padrão no estoque.
                                </p>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <EstoquePicker
                                    label="Urna"
                                    action="urnas_buscar"
                                    value={form.regras.urna}
                                    depositos={DEP_URNA}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({ ...r, urna: v }))
                                    }
                                />

                                <EstoquePicker
                                    label="Roupa"
                                    action="roupas_buscar"
                                    value={form.regras.roupa}
                                    depositos={DEP_ROUPA}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({ ...r, roupa: v }))
                                    }
                                />

                                <EstoquePicker
                                    label="Invólucro"
                                    action="invols_buscar"
                                    value={form.regras.invol}
                                    depositos={DEP_INVOL}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({ ...r, invol: v }))
                                    }
                                />

                                <EstoquePicker
                                    label="Véu"
                                    action="veus_buscar"
                                    value={form.regras.veu}
                                    depositos={DEP_VEU}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({ ...r, veu: v }))
                                    }
                                />

                                <EstoquePicker
                                    label="Cordão"
                                    action="cordoes_buscar"
                                    value={form.regras.cordao}
                                    depositos={DEP_CORDAO}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({ ...r, cordao: v }))
                                    }
                                />

                                <CoroaEditor
                                    value={form.regras.coroa_flores}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            coroa_flores: v,
                                        }))
                                    }
                                />
                            </div>
                        </section>

                        <section>
                            <div className="mb-2">
                                <h2 className="text-lg font-extrabold">Serviços e condições</h2>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <CardRegra
                                    titulo="Kit lanche"
                                    value={form.regras.kit_lanche}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            kit_lanche: v,
                                        }))
                                    }
                                />

                                <CardRegra
                                    titulo="Assistência"
                                    value={form.regras.assistencia}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            assistencia: v,
                                        }))
                                    }
                                />

                                <CardRegra
                                    titulo="Tanatopraxia"
                                    value={form.regras.tanato}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            tanato: v,
                                        }))
                                    }
                                />

                                <CardRegra
                                    titulo="Ornamentação"
                                    descricao="Quando oferecida, defina se é natural ou artificial."
                                    value={form.regras.ornamentacao}
                                    disabled={disabled}
                                    tipo
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            ornamentacao: v,
                                        }))
                                    }
                                />

                                <CardRegra
                                    titulo="Realiza velório"
                                    value={form.regras.realiza_velorio}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            realiza_velorio: v,
                                        }))
                                    }
                                />

                                <CardRegra
                                    titulo="Realiza sepultamento"
                                    value={form.regras.realiza_sepultamento}
                                    disabled={disabled}
                                    onChange={(v) =>
                                        atualizarRegras((r) => ({
                                            ...r,
                                            realiza_sepultamento: v,
                                        }))
                                    }
                                />
                            </div>
                        </section>

                        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[#E1E5EC] bg-white p-4">
                            <span className="mr-auto text-xs text-[#6B7488]">
                                Salve o cadastro e as regras antes de configurar valores da OS.
                            </span>
                            <Botao
                                onClick={() => {
                                    if (form.id) void carregarConvenio(form.id);
                                    else setForm(convenioNovo());
                                }}
                                disabled={disabled}
                            >
                                Descartar alterações
                            </Botao>
                            <Botao
                                primario
                                onClick={() => void salvar()}
                                disabled={disabled || !form.nome.trim()}
                            >
                                {salvando ? "Salvando..." : "Salvar convênio"}
                            </Botao>
                        </div>

                        <SecaoOS convenio={form} disabled={disabled} />
                    </div>
                </div>
            </div>

            {confirmarExclusao && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(49,60,85,0.50)] p-4"
                    onClick={() => setConfirmarExclusao(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-extrabold">Excluir convênio</h2>
                        <p className="mt-2 text-sm text-[#6B7488]">
                            Excluir <b className="text-[#313C55]">{form.nome}</b>? Se houver
                            vínculos no banco, a API recusará a exclusão.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <Botao onClick={() => setConfirmarExclusao(false)}>
                                Cancelar
                            </Botao>
                            <Botao perigo disabled={salvando} onClick={() => void excluir()}>
                                {salvando ? "Excluindo..." : "Confirmar exclusão"}
                            </Botao>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
