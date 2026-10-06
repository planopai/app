"use client";

/**
 * Itens da OS com ajuste de valor e desconto (regras de 05/10/2026).
 * Usado no "Editar registro" (Visualização da OS), em Minhas OS e no Financeiro.
 *
 *  - Colunas: Item · Qtd · Valor · Desconto · Final · ícone de ajuste. O acréscimo NÃO aparece: o Valor já vem com ele.
 *  - Ajuste do item: valor unitário (só aumenta; no translado, valor do km — a quantidade de km não muda) e desconto em R$.
 *  - Desconto geral: % ou R$, calculado depois dos descontos dos itens. Por %, mostra a base.
 *  - Limite: todos os descontos juntos até 8% do valor com acréscimos. Gestão e Financeiro podem passar (o servidor decide).
 * Os dados vêm de os_principal.php?itens_os=1 (o servidor também confere o limite).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

export type ItemOSTela = {
    id: number;
    produto_nome: string;
    categoria: string;
    tipo_item: string;
    quantidade: number;
    unidade: "un" | "km";
    valor_unitario: number;
    valor: number;
    desconto: number;
    valor_final: number;
    valor_tabela_unitario: number;
    translado_origem?: string | null;
    translado_destino?: string | null;
    frase_faixa?: string | null;
    referencia_apenas: boolean;
};

export type ResumoDescontoOS = {
    bruto: number;
    desconto_itens: number;
    subtotal: number;
    desconto_global_tipo: "PERCENTUAL" | "VALOR" | null;
    desconto_global_percentual: number;
    desconto_global: number;
    reducao: number;
    percentual: number;
    limite_percentual: number;
    limite_valor: number;
    disponivel: number;
};

type Dados = { itens: ItemOSTela[]; resumo: ResumoDescontoOS; pode_passar_limite: boolean; colunas_desconto: boolean };

async function osApi(acao: string, params: Record<string, string | number> = {}, post = false) {
    const qs = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => qs.set(k, String(v)));
    const res = post
        ? await fetch(OS_API, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: qs })
        : await fetch(`${OS_API}?${qs.toString()}&_=${Date.now()}`, { credentials: "include", cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        if (typeof window !== "undefined") window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro || json?.sucesso === false) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}

export async function carregarItensOS(osId: number | string): Promise<Dados> {
    return (await osApi("itens_os", { os_id: osId })).dados as Dados;
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => {
    const t = String(s ?? "").trim().replace(/[^\d,.-]/g, "");
    if (!t) return 0;
    const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : 0;
};
const dec = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
const pctTxt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const qtdTxt = (it: ItemOSTela) => (it.unidade === "km" ? `${String(it.quantidade).replace(".", ",")} km` : String(it.quantidade));

const BTN_SEC =
    "inline-flex h-11 items-center justify-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-4 text-sm font-extrabold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/10";
const BTN_PRI =
    "inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#00AEEC] dark:text-[#313C55]";
const CAMPO =
    "w-full rounded-xl border border-[#E3E8F0] bg-white px-3 py-2.5 text-[16px] text-[#313C55] outline-none focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30 dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-white sm:text-sm";
const ROTULO = "mb-1.5 mt-3 block text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";

function IconeAjuste() {
    return (
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M19 5 5 19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    );
}

function Janela({ titulo, children, onFechar }: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);
    return (
        <div data-os-janela-interna className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(49,60,85,0.45)] p-0 sm:items-center sm:p-4" onClick={onFechar}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                className="max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-t-[20px] bg-white p-5 text-[#313C55] sm:rounded-[20px] dark:bg-[#232B3F] dark:text-white"
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

export default function ItensOSAjuste({
    osId,
    editavel,
    versao = 0,
    onMudou,
    mostrarTitulo = false,
    semTabela = false,
    pedido = null,
}: {
    osId: number | string;
    /** OS Particular ABERTA: mostra o ícone de ajuste e o desconto geral. */
    editavel: boolean;
    versao?: number;
    /** Chamado depois de cada ajuste gravado (para a tela recarregar totais). */
    onMudou?: (d: Dados) => void;
    mostrarTitulo?: boolean;
    /** Só as janelas de ajuste (a tabela é a própria folha da OS, com os ícones; ver "Ver OS"). */
    semTabela?: boolean;
    /** Pedido vindo da folha: "item:<id>" ou "geral". n muda a cada clique (abre de novo o mesmo item). */
    pedido?: { alvo: string; n: number } | null;
}) {
    const [d, setD] = useState<Dados | null>(null);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [item, setItem] = useState<ItemOSTela | null>(null);
    const [unit, setUnit] = useState("");
    const [desc, setDesc] = useState("");
    const [geral, setGeral] = useState(false);
    const [gModo, setGModo] = useState<"%" | "R$">("%");
    const [gVal, setGVal] = useState("");
    const [erroJanela, setErroJanela] = useState("");

    const carregar = useCallback(async () => {
        try {
            const r = await carregarItensOS(osId);
            setD(r);
            setErro("");
            return r;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os itens da OS.");
            return null;
        }
    }, [osId]);

    useEffect(() => {
        void carregar();
    }, [carregar, versao]);

    const res = d?.resumo;
    const cobraveis = useMemo(() => (d?.itens ?? []).filter((i) => !i.referencia_apenas), [d]);
    const limTxt = d?.pode_passar_limite
        ? "Gestão / Financeiro: pode passar de 8%."
        : res
            ? `Limite da OS: todos os descontos juntos até ${pctTxt(res.limite_percentual)}% (${brl(res.limite_valor)} hoje; ${brl(res.reducao)} já usados).`
            : "";

    const abrirItem = (it: ItemOSTela) => {
        setItem(it);
        setUnit(dec(it.valor_unitario));
        setDesc(it.desconto > 0 ? dec(it.desconto) : "");
        setErroJanela("");
    };
    const abrirGeral = () => {
        if (!res) return;
        setGModo(res.desconto_global_tipo === "VALOR" ? "R$" : "%");
        setGVal(res.desconto_global_tipo === "VALOR" ? dec(res.desconto_global) : res.desconto_global_tipo === "PERCENTUAL" ? pctTxt(res.desconto_global_percentual) : "");
        setErroJanela("");
        setGeral(true);
    };

    // Clique no ícone da folha (janela "Ver OS") abre a janela certa
    useEffect(() => {
        if (!pedido || !d) return;
        if (pedido.alvo === "geral") {
            abrirGeral();
            return;
        }
        const id = Number(String(pedido.alvo).replace("item:", ""));
        const it = d.itens.find((x) => x.id === id && !x.referencia_apenas);
        if (it) abrirItem(it);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pedido?.n, d]);

    const gravar = async (fn: () => Promise<void>, fechar: () => void) => {
        if (salvando) return;
        setSalvando(true);
        setErroJanela("");
        try {
            await fn();
            const r = await carregar();
            fechar();
            if (r) onMudou?.(r);
        } catch (e: any) {
            setErroJanela(e?.message || "Não foi possível aplicar.");
            await carregar();
        } finally {
            setSalvando(false);
        }
    };

    // prévia da janela do item
    const pItem = (() => {
        if (!item) return null;
        const u = Math.max(num(unit), item.valor_tabela_unitario);
        const valor = Math.round(u * item.quantidade * 100) / 100;
        const dd = Math.min(num(desc), valor);
        return { u, valor, d: dd, final: valor - dd };
    })();
    const aplicarItem = () =>
        item &&
        pItem &&
        gravar(
            async () => {
                if (num(unit) < item.valor_tabela_unitario - 0.004) {
                    throw new Error(`O valor ${item.unidade === "km" ? "do km" : "unitário"} não pode ficar abaixo de ${brl(item.valor_tabela_unitario)}. Para reduzir, use o desconto em R$.`);
                }
                if (Math.abs(pItem.u - item.valor_unitario) > 0.004) {
                    await osApi("editar_valor_item", item.unidade === "km" ? { os_item_id: item.id, valor_km: pItem.u } : { os_item_id: item.id, valor: pItem.u }, true);
                }
                if (Math.abs(pItem.d - item.desconto) > 0.004) {
                    await osApi("aplicar_desconto", { os_item_id: item.id, valor_desconto: pItem.d }, true);
                }
            },
            () => setItem(null),
        );

    const baseGeral = res ? res.subtotal : 0;
    const pGeral = (() => {
        const v = num(gVal);
        const dg = gModo === "%" ? Math.round(baseGeral * v) / 100 : Math.min(v, baseGeral);
        return { dg, total: baseGeral - dg };
    })();
    const aplicarGeral = () =>
        gravar(
            () => osApi("aplicar_desconto_global", gModo === "%" ? { os_id: osId, percentual: num(gVal) } : { os_id: osId, valor_desconto: num(gVal) }, true).then(() => undefined),
            () => setGeral(false),
        );

    if (erro) return <p className="rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</p>;
    if (!d || !res) return semTabela ? null : <p className="py-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando os itens…</p>;

    return (
        <div>
            {semTabela ? null : (
            <>
            {mostrarTitulo ? <h4 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Itens</h4> : null}
            {!d.colunas_desconto && editavel ? (
                <p className="mb-2 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-xs font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                    Faltam as colunas do desconto no banco: rode o alteracoes_atendimento_sugeridas.sql para ajustar valores.
                </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]">
                <table className="w-full min-w-[520px] text-sm">
                    <thead>
                        <tr className="border-b border-[#E3E8F0] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                            <th className="px-3 py-2">Item</th>
                            <th className="px-2 py-2 text-right">Qtd</th>
                            <th className="px-2 py-2 text-right">Valor</th>
                            <th className="px-2 py-2 text-right">Desconto</th>
                            <th className="px-2 py-2 text-right">Final</th>
                            {editavel ? <th className="w-10 px-2 py-2" aria-label="Ajuste" /> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {d.itens.map((it) => (
                            <tr key={it.id} className="border-b border-[#E3E8F0] last:border-0 dark:border-white/[0.12]">
                                <td className="px-3 py-2 align-top">
                                    <b>{it.produto_nome}</b>
                                    <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                        {it.categoria}
                                        {it.tipo_item === "DIFERENCA" ? " · diferença" : ""}
                                        {it.tipo_item === "ADICIONAL" ? " · adicional" : ""}
                                    </div>
                                    {it.unidade === "km" && (it.translado_origem || it.translado_destino) ? (
                                        <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                            {it.translado_origem} → {it.translado_destino}
                                        </div>
                                    ) : null}
                                    {it.frase_faixa ? <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Faixa: “{it.frase_faixa}”</div> : null}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2 text-right align-top">{qtdTxt(it)}</td>
                                <td className="whitespace-nowrap px-2 py-2 text-right align-top">{it.referencia_apenas ? "—" : brl(it.valor)}</td>
                                <td className="whitespace-nowrap px-2 py-2 text-right align-top">{it.referencia_apenas ? "—" : it.desconto > 0 ? `− ${brl(it.desconto)}` : "—"}</td>
                                <td className="whitespace-nowrap px-2 py-2 text-right align-top font-extrabold">{it.referencia_apenas ? "contrato" : brl(it.valor_final)}</td>
                                {editavel ? (
                                    <td className="px-2 py-1.5 text-right align-top">
                                        {!it.referencia_apenas ? (
                                            <button
                                                type="button"
                                                onClick={() => abrirItem(it)}
                                                aria-label={`Valor e desconto: ${it.produto_nome}`}
                                                title="Valor / desconto"
                                                className="inline-flex size-9 items-center justify-center rounded-lg border-[1.5px] border-[#C9D1DE] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10"
                                            >
                                                <IconeAjuste />
                                            </button>
                                        ) : null}
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                        {d.itens.length === 0 ? (
                            <tr>
                                <td colSpan={editavel ? 6 : 5} className="px-3 py-3 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                    Nenhum item lançado nesta OS.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>

            {cobraveis.length ? (
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                        {res.reducao > 0 ? `${pctTxt(res.percentual)}% de desconto no total · ` : ""}
                        {editavel ? limTxt : ""}
                    </div>
                    <div className="text-right text-sm">
                        <div>
                            Subtotal: <b>{brl(res.bruto)}</b>
                        </div>
                        {res.desconto_itens > 0 ? (
                            <div>
                                Descontos nos itens: <b>− {brl(res.desconto_itens)}</b>
                            </div>
                        ) : null}
                        <div className="flex items-center justify-end gap-2">
                            <span>
                                Desconto geral: <b>{res.desconto_global > 0 ? `− ${brl(res.desconto_global)}` : brl(0)}</b>
                                {res.desconto_global > 0 && res.desconto_global_tipo === "PERCENTUAL" ? (
                                    <span className="text-xs text-[#5B6478] dark:text-[#AEB9CF]"> ({pctTxt(res.desconto_global_percentual)}% sobre {brl(res.subtotal)})</span>
                                ) : null}
                            </span>
                            {editavel ? (
                                <button
                                    type="button"
                                    onClick={abrirGeral}
                                    aria-label="Desconto geral"
                                    title="Desconto geral"
                                    className="inline-flex size-8 items-center justify-center rounded-lg border-[1.5px] border-[#C9D1DE] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10"
                                >
                                    <IconeAjuste />
                                </button>
                            ) : null}
                        </div>
                        <div className="mt-1 text-lg font-extrabold">Total: {brl(res.subtotal - res.desconto_global)}</div>
                    </div>
                </div>
            ) : null}

            </>
            )}

            {item && pItem ? (
                <Janela titulo="Valor e desconto do item" onFechar={() => !salvando && setItem(null)}>
                    <h3 className="text-lg font-extrabold">{item.produto_nome}</h3>
                    <div className="mt-0.5 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        Quantidade: {qtdTxt(item)}
                        {item.unidade === "km" ? ` · ${item.translado_origem ?? ""} → ${item.translado_destino ?? ""}` : ""}
                    </div>
                    <label htmlFor="ajuste-unit" className={ROTULO}>
                        {item.unidade === "km" ? "Valor por km (só aumenta)" : "Valor unitário (só aumenta)"}
                    </label>
                    <input id="ajuste-unit" inputMode="decimal" className={CAMPO} value={unit} onChange={(e) => setUnit(e.target.value)} />
                    <label htmlFor="ajuste-desc" className={ROTULO}>
                        Desconto (R$)
                    </label>
                    <input id="ajuste-desc" inputMode="decimal" placeholder="0,00" className={CAMPO} value={desc} onChange={(e) => setDesc(e.target.value)} />
                    <div className="mt-3 rounded-xl bg-[#F6F8FB] px-3 py-2 text-sm font-bold dark:bg-[#1C2334]">
                        Valor {brl(pItem.valor)} · Desconto {pItem.d ? `− ${brl(pItem.d)}` : brl(0)} · Final {brl(pItem.final)}
                    </div>
                    <div className="mt-2 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{limTxt}</div>
                    {erroJanela ? (
                        <div role="alert" className="mt-2 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            {erroJanela}
                        </div>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => setItem(null)}>
                            Cancelar
                        </button>
                        <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void aplicarItem()}>
                            {salvando ? "Aplicando…" : "Aplicar"}
                        </button>
                    </div>
                </Janela>
            ) : null}

            {geral ? (
                <Janela titulo="Desconto geral" onFechar={() => !salvando && setGeral(false)}>
                    <h3 className="text-lg font-extrabold">Desconto geral</h3>
                    <div className="mt-0.5 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        Valor bruto {brl(res.bruto)} · descontos nos itens {res.desconto_itens ? `− ${brl(res.desconto_itens)}` : brl(0)} · base do desconto geral {brl(baseGeral)}
                    </div>
                    <div className="mt-3 flex gap-2">
                        <div role="group" aria-label="Tipo do desconto" className="inline-flex overflow-hidden rounded-xl border-[1.5px] border-[#C9D1DE] dark:border-white/25">
                            {(["%", "R$"] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    aria-pressed={gModo === m}
                                    onClick={() => setGModo(m)}
                                    className={`h-11 min-w-[52px] px-3 text-sm font-extrabold ${gModo === m ? "bg-[#313C55] text-white dark:bg-[#00AEEC] dark:text-[#313C55]" : "bg-white text-[#313C55] dark:bg-transparent dark:text-white"}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        <input inputMode="decimal" aria-label="Valor do desconto geral" placeholder="0" className={CAMPO} value={gVal} onChange={(e) => setGVal(e.target.value)} />
                    </div>
                    <div className="mt-3 rounded-xl bg-[#F6F8FB] px-3 py-2 text-sm font-bold dark:bg-[#1C2334]">
                        Desconto geral {pGeral.dg ? `− ${brl(pGeral.dg)}` : brl(0)} · Total {brl(pGeral.total)}
                    </div>
                    <div className="mt-2 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{limTxt}</div>
                    {erroJanela ? (
                        <div role="alert" className="mt-2 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            {erroJanela}
                        </div>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => setGeral(false)}>
                            Cancelar
                        </button>
                        <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void aplicarGeral()}>
                            {salvando ? "Aplicando…" : "Aplicar"}
                        </button>
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
