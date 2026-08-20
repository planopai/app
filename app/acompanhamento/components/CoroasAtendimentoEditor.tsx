"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import type { CoroaAtendimentoItem, CoroaDepositoNome, CoroaTipoItem } from "./types";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const ESTOQUE_API = `${ENDPOINT}/materiais_gerais.php`;

const DEPOSITOS_ARTIFICIAIS: Array<{ value: CoroaDepositoNome; label: string }> = [
    { value: "MEMORIAL", label: "MEMORIAL" },
    { value: "FUNERARIA", label: "FUNERÁRIA" },
];

const FRASES_SUGERIDAS = [
    "A saudade e o pesar dos seus colegas da (nome da empresa).",
    "A Ti, Senhor, elevo e entrego a minha alma.",
    "Aquele que crê no Salvador jamais morrerá.",
    "Com amor de seus pais e irmãos.",
    "Com pesar da família (nome da família).",
    "Com pesar do(a) (nome da empresa, nome da família, nome dos amigos).",
    "Com pesar dos amigos (nome da empresa, nome da família).",
    "Com pesar dos colegas (nome da empresa).",
    "Condolências de toda a equipe da (nome da empresa).",
    "Condolências do(a) (nome da empresa, família ou amigos).",
    "Condolências dos amigos (nome da empresa, nome da família).",
    "Condolências dos colegas (nome da empresa).",
    "Condolências dos funcionários da (nome da empresa).",
    "Descanse à sombra do Altíssimo.",
    "Estaremos lembrando de ti sempre com muito amor.",
    "Eterna saudade de seus familiares e sentidos pêsames dos colegas e amigos.",
    "Homenagem da direção e funcionários da (nome da empresa).",
    "Homenagem de seus amigos...",
    "Homenagem do(a) (nome da empresa, nome da família, nome dos amigos).",
    "Homenagem dos amigos e companheiros da (nome da empresa).",
    "Homenagem dos colegas (nome do colega ou empresa).",
    "Homenagem dos diretores e funcionários da (nome da empresa).",
    "Homenagem dos diretores, funcionários e amigos da (nome da empresa).",
    "Jesus, meu Rei, na Tua mão segurarei.",
    "Não deixei nenhum bem material, mas deixei o bem maior: o exemplo de vida.",
    "Ninguém morre enquanto permanecer vivo no coração de alguém.",
    "Nossa eterna gratidão e saudade de (nome dos parentes).",
    "Nunca esqueceremos os seus exemplos...",
    "O amor não conhece a barreira da separação, te amaremos sempre.",
    "O Senhor é a minha luz e a minha eterna salvação.",
    "O Senhor é meu pastor e nada me faltará.",
    "Pêsames do(a) (nome da empresa, nome da família, nome dos amigos).",
    "Pêsames dos colegas da (nome da empresa).",
    "Pêsames dos amigos da (nome da empresa, nome da família).",
    "Que Deus o tenha...",
    "Que Deus o(a) tenha em paz.",
    "Saudade de seu(sua) esposo(a), filhos(as), genros, noras e netos.",
    "Saudades de seus amigos (nome) e familiares.",
    "Saudades de seus familiares e amigos.",
    "Sentimentos da família.",
    "Sentimentos de...",
    "Sentimentos do(a) (nome da empresa, nome da família, nome dos amigos).",
    "Sentimentos dos amigos (nome da empresa, nome da família).",
    "Sentimentos dos colegas (nome da empresa).",
    "Sentiremos sua falta.",
    "Será eterno(a) em nossos corações.",
    "Sua passagem foi breve, sua obra eterna.",
    "Um anjo do Senhor me tocou e eu adormeci em paz...",
    "Você é mais uma estrela a brilhar em paz...",
    "Você foi um exemplo de vida...",
];

type ProdutoRow = {
    id: number;
    nome: string;
    codigo_barras?: string | null;
    foto_url?: string | null;
    valor?: string | number | null;
    categoria_nome?: string | null;
    deposito_nome?: string | null;
    saldo_total?: string | number | null;
    fotos?: Array<{
        arquivo?: string | null;
        foto_url?: string | null;
        ordem?: number;
        is_principal?: number;
    }>;
};

function novoItem(ordem: number): CoroaAtendimentoItem {
    return {
        ordem,
        tipo_coroa: "",
        produto_id: 0,
        modelo_coroa: "",
        codigo_barras: "",
        deposito_nome: "",
        frase: "",
        valor: null,
        foto_produto_url: "",
    };
}

function normalizarFoto(url?: string | null): string {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^blob:/i.test(raw)) return raw;
    if (raw.startsWith("/")) return `${ENDPOINT}${raw}`;
    return `${ENDPOINT}/uploads/produtos/${raw.replace(/^\/+/, "")}`;
}

function fotoPrincipal(row?: ProdutoRow | null): string {
    if (!row) return "";
    const fotos = Array.isArray(row.fotos) ? [...row.fotos] : [];
    if (fotos.length) {
        fotos.sort((a, b) => {
            const pa = Number(a.is_principal || 0) === 1 ? 0 : 1;
            const pb = Number(b.is_principal || 0) === 1 ? 0 : 1;
            return pa !== pb ? pa - pb : Number(a.ordem || 0) - Number(b.ordem || 0);
        });
        return normalizarFoto(fotos[0]?.foto_url || fotos[0]?.arquivo || "");
    }
    return normalizarFoto(row.foto_url);
}

function dinheiroBRL(v?: number | string | null): string {
    const n = Number(v ?? 0);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);
}

function tipoLabel(tipo: CoroaTipoItem): string {
    if (tipo === "natural") return "Natural";
    if (tipo === "artificial") return "Artificial";
    return "";
}

export default function CoroasAtendimentoEditor({
    value,
    onChange,
    disabled,
    hasError,
}: {
    value?: CoroaAtendimentoItem[];
    onChange: (items: CoroaAtendimentoItem[]) => void;
    disabled?: boolean;
    hasError?: boolean;
}) {
    const items = useMemo(() => {
        const arr = Array.isArray(value) ? value : [];
        if (!arr.length) return [novoItem(1)];
        return arr.map((item, index) => ({ ...novoItem(index + 1), ...item, ordem: index + 1 }));
    }, [value]);

    const [modalItem, setModalItem] = useState<number | null>(null);
    const [busca, setBusca] = useState("");
    const [rows, setRows] = useState<ProdutoRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [quantidadeInput, setQuantidadeInput] = useState(() => String(items.length));

    useEffect(() => {
        setQuantidadeInput(String(items.length));
    }, [items.length]);

    const itemModal = modalItem == null ? null : items[modalItem] || null;

    const patchItem = (index: number, patch: Partial<CoroaAtendimentoItem>) => {
        onChange(items.map((item, i) => (i === index ? { ...item, ...patch, ordem: i + 1 } : { ...item, ordem: i + 1 })));
    };

    const setQuantidade = (qtd: number) => {
        const quantidade = Math.max(1, Math.min(20, Math.floor(qtd)));
        const next = items.slice(0, quantidade).map((item, index) => ({ ...item, ordem: index + 1 }));
        while (next.length < quantidade) next.push(novoItem(next.length + 1));
        onChange(next);
    };

    const alterarQuantidadeDigitada = (raw: string) => {
        // Permite apagar o conteúdo primeiro e digitar o novo número depois.
        // O array de coroas só é alterado quando houver um valor válido entre 1 e 20.
        if (!/^\d*$/.test(raw)) return;

        setQuantidadeInput(raw);

        if (raw === "") return;

        const qtd = Number(raw);
        if (Number.isInteger(qtd) && qtd >= 1 && qtd <= 20) {
            setQuantidade(qtd);
        }
    };

    const normalizarQuantidadeAoSair = () => {
        const qtd = Number(quantidadeInput);

        if (!Number.isInteger(qtd) || qtd < 1 || qtd > 20) {
            setQuantidadeInput(String(items.length));
            return;
        }

        setQuantidadeInput(String(qtd));

        if (qtd !== items.length) {
            setQuantidade(qtd);
        }
    };

    const abrirModelos = (index: number) => {
        const item = items[index];
        if (!item?.tipo_coroa) return;
        if (item.tipo_coroa === "artificial" && !item.deposito_nome) return;
        setModalItem(index);
        setBusca("");
        setRows([]);
        setErro("");
    };

    useEffect(() => {
        if (modalItem == null || !itemModal?.tipo_coroa) return;
        const ac = new AbortController();
        const t = window.setTimeout(async () => {
            setLoading(true);
            setErro("");
            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", "coroas_buscar");
                url.searchParams.set("tipo", itemModal.tipo_coroa);
                if (itemModal.tipo_coroa === "artificial") {
                    url.searchParams.set("deposito", String(itemModal.deposito_nome || ""));
                }
                url.searchParams.set("q", busca.trim());
                url.searchParams.set("limit", "100");
                const res = await fetch(url.toString(), {
                    credentials: "include",
                    cache: "no-store",
                    signal: ac.signal,
                });
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) throw new Error(json?.msg || "Não foi possível carregar as coroas.");
                setRows(Array.isArray(json.rows) ? json.rows : []);
            } catch (e: any) {
                if (e?.name !== "AbortError") {
                    setRows([]);
                    setErro(e?.message || "Erro ao consultar modelos de coroa.");
                }
            } finally {
                setLoading(false);
            }
        }, 180);
        return () => {
            window.clearTimeout(t);
            ac.abort();
        };
    }, [modalItem, itemModal?.tipo_coroa, itemModal?.deposito_nome, busca]);

    const selecionarProduto = (row: ProdutoRow) => {
        if (modalItem == null) return;
        const current = items[modalItem];
        const foto = fotoPrincipal(row);
        patchItem(modalItem, {
            produto_id: Number(row.id || 0) || 0,
            modelo_coroa: String(row.nome || "").trim(),
            codigo_barras: String(row.codigo_barras || "").trim(),
            deposito_nome: current.tipo_coroa === "artificial" ? (current.deposito_nome || "") : "",
            valor: Number(row.valor ?? 0),
            foto_produto_url: foto,
        });
        setModalItem(null);
        setBusca("");
    };

    return (
        <div data-wizard-error={hasError ? "1" : "0"} className={`mt-3 rounded-xl border p-3 ${hasError ? "border-red-500" : ""}`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold">Coroas deste atendimento</div>
                </div>
                <label className="text-xs font-medium">
                    Quantidade
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quantidadeInput}
                        disabled={disabled}
                        onChange={(e) => alterarQuantidadeDigitada(e.target.value)}
                        onBlur={normalizarQuantidadeAoSair}
                        aria-label="Quantidade de coroas"
                        className="ml-2 w-20 rounded-md border bg-background px-2 py-1.5 text-base"
                    />
                </label>
            </div>

            <div className="mt-4 space-y-4">
                {items.map((item, index) => {
                    const foto = normalizarFoto(item.foto_produto_url);
                    return (
                        <div key={index} className="rounded-xl border bg-muted/10 p-3">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="font-semibold">Coroa {index + 1}</div>
                                <span className="text-xs text-muted-foreground">{index + 1} de {items.length}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium">Tipo *</label>
                                    <select
                                        value={item.tipo_coroa}
                                        disabled={disabled}
                                        onChange={(e) => {
                                            const tipo = e.target.value as CoroaTipoItem;
                                            patchItem(index, {
                                                tipo_coroa: tipo,
                                                deposito_nome: "",
                                                produto_id: 0,
                                                modelo_coroa: "",
                                                codigo_barras: "",
                                                valor: null,
                                                foto_produto_url: "",
                                            });
                                        }}
                                        className="w-full rounded-md border bg-background px-3 py-2 text-base"
                                    >
                                        <option value="">Selecione</option>
                                        <option value="natural">Natural</option>
                                        <option value="artificial">Artificial</option>
                                    </select>
                                </div>

                                {item.tipo_coroa === "artificial" && (
                                    <div>
                                        <label className="mb-1 block text-xs font-medium">Depósito *</label>
                                        <select
                                            value={item.deposito_nome || ""}
                                            disabled={disabled}
                                            onChange={(e) => patchItem(index, {
                                                deposito_nome: e.target.value as CoroaDepositoNome,
                                                produto_id: 0,
                                                modelo_coroa: "",
                                                codigo_barras: "",
                                                valor: null,
                                                foto_produto_url: "",
                                            })}
                                            className="w-full rounded-md border bg-background px-3 py-2 text-base"
                                        >
                                            <option value="">Selecione</option>
                                            {DEPOSITOS_ARTIFICIAIS.map((dep) => <option key={dep.value} value={dep.value}>{dep.label}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="mt-3">
                                <label className="mb-1 block text-xs font-medium">Modelo *</label>
                                {item.modelo_coroa ? (
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => abrirModelos(index)}
                                        className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left disabled:opacity-60"
                                    >
                                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted/30">
                                            {foto ? <img src={foto} alt={item.modelo_coroa} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Sem foto</div>}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{item.modelo_coroa}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">{tipoLabel(item.tipo_coroa)}{item.deposito_nome ? ` • ${item.deposito_nome === "FUNERARIA" ? "FUNERÁRIA" : item.deposito_nome}` : ""}</div>
                                            <div className="mt-1 font-semibold">{dinheiroBRL(item.valor)}</div>
                                        </div>
                                        <span className="text-xs text-blue-600">Alterar</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={disabled || !item.tipo_coroa || (item.tipo_coroa === "artificial" && !item.deposito_nome)}
                                        onClick={() => abrirModelos(index)}
                                        className="w-full rounded-md border border-dashed px-3 py-3 text-sm disabled:opacity-50"
                                    >
                                        {!item.tipo_coroa
                                            ? "Selecione primeiro o tipo"
                                            : item.tipo_coroa === "artificial" && !item.deposito_nome
                                                ? "Selecione primeiro o depósito"
                                                : `Escolher modelo ${tipoLabel(item.tipo_coroa)}`}
                                    </button>
                                )}
                            </div>

                            <div className="mt-3">
                                <label className="mb-1 block text-xs font-medium">Sugestão de frase</label>
                                <select
                                    disabled={disabled}
                                    value=""
                                    onChange={(e) => e.target.value && patchItem(index, { frase: e.target.value })}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-base"
                                >
                                    <option value="">Selecione uma sugestão ou escreva abaixo</option>
                                    {FRASES_SUGERIDAS.map((frase, i) => <option key={i} value={frase}>{i + 1} — {frase}</option>)}
                                </select>
                                <label className="mb-1 mt-2 block text-xs font-medium">Frase *</label>
                                <textarea
                                    value={item.frase || ""}
                                    disabled={disabled}
                                    onChange={(e) => patchItem(index, { frase: e.target.value })}
                                    placeholder={`Frase da Coroa ${index + 1}`}
                                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-base"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal open={modalItem != null} onClose={() => setModalItem(null)} ariaLabel="Selecionar modelo de coroa" maxWidth={980}>
                <h3 className="text-lg font-semibold">Selecionar Coroa {itemModal ? tipoLabel(itemModal.tipo_coroa) : ""}</h3>
                {itemModal?.tipo_coroa === "artificial" && <p className="mt-1 text-xs text-muted-foreground">Depósito: <b>{itemModal.deposito_nome === "FUNERARIA" ? "FUNERÁRIA" : itemModal.deposito_nome}</b>. Somente modelos com saldo neste depósito são exibidos.</p>}
                <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Pesquisar modelo pelo nome ou código..."
                    className="mt-4 w-full rounded-xl border bg-background px-3 py-2 text-base"
                />

                <div className="mt-3 max-h-[65vh] overflow-auto rounded-xl border">
                    {loading ? <div className="p-6 text-center text-sm text-muted-foreground">Carregando modelos...</div> : erro ? <div className="p-4 text-sm text-red-600">{erro}</div> : rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Nenhum modelo disponível.</div> : (
                        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
                            {rows.map((row) => {
                                const foto = fotoPrincipal(row);
                                return (
                                    <button key={`${row.id}|${row.deposito_nome || ""}`} type="button" onClick={() => selecionarProduto(row)} className="flex gap-3 rounded-2xl border bg-background p-3 text-left hover:bg-muted/30">
                                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted/30">
                                            {foto ? <img src={foto} alt={row.nome} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Sem foto</div>}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="line-clamp-2 font-semibold">{row.nome}</div>
                                            {row.codigo_barras ? <div className="mt-1 text-xs text-muted-foreground">CB: {row.codigo_barras}</div> : null}
                                            <div className="mt-1 font-semibold">{dinheiroBRL(row.valor)}</div>
                                            {itemModal?.tipo_coroa === "artificial" ? <div className="mt-1 text-xs text-muted-foreground">Estoque: <b>{Number(row.saldo_total || 0)}</b></div> : <div className="mt-1 text-xs text-muted-foreground">Natural • sem baixa de estoque</div>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}