"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";
import {
    ALL_ITEM_LABELS,
    ALL_ITEM_TIPO,
    ARR_KEYS,
    ARR_LABELS,
} from "./MateriaisArrumacao";

/* =========================
   Tipos
   ========================= */
type Row = { key: string; item: string; tipo: string; quantidade: number };
type Evento = { nome: string; data: string; itemKey?: string };

interface Props {
    aberto: boolean;
    onFechar: () => void;

    aDe: string;
    aAte: string;
    setADe: (v: string) => void;
    setAAte: (v: string) => void;

    somenteTanato: boolean;
    setSomenteTanato: (v: boolean) => void;

    selectedItem?: string;
    setSelectedItem: (v?: string) => void;

    rows: Row[];
    registrosComEventoNoPeriodo: number;
    listaTanatoPeriodo: Evento[];

    totalAssistencias?: number;
    convenios?: { particular?: number; prefeitura?: number; associado?: number };

    loading: boolean;
    onRecarregar: () => void;
}

/* =========================
   Helpers
   ========================= */
const fmt0 = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

function safeFormatDate(value?: string | null): string {
    if (!value) return "-";
    try {
        return formataDataDia(value);
    } catch {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString();
    }
}

function norm(s: string) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** resolve rótulo/tipo a partir da chave (quando rows trazem `item` como key) */
function resolveFromKey(itemKey: string): { label?: string; tipo?: string } {
    const key = norm(itemKey);
    const label = (ALL_ITEM_LABELS as any)[key] as string | undefined;
    const tipo = (ALL_ITEM_TIPO as any)[key] as
        | "Material"
        | "Arrumação"
        | "Assistência"
        | "Tanatopraxia"
        | undefined;
    return { label, tipo };
}

/* =========================
   Ícones simples por tipo
   ========================= */
const ICONES_TIPO: Record<string, string> = {
    "Assistência": "🕯️",
    "Conservação do Corpo": "🧪",
    "Arrumação": "🧴",
    "Material": "📦",
    "Tanatopraxia": "⚗️",
};

/* =========================
   Card do item (estilo cards do print)
   ========================= */
function ItemCard({
    titulo,
    valor,
    tipo,
    destaque = "blue",
}: {
    titulo: string;
    valor: number;
    tipo?: string;
    destaque?: "blue" | "yellow" | "sky" | "teal" | "indigo" | "rose";
}) {
    const leftBar = {
        blue: "border-l-blue-500",
        yellow: "border-l-yellow-400",
        sky: "border-l-sky-500",
        teal: "border-l-teal-500",
        indigo: "border-l-indigo-500",
        rose: "border-l-rose-500",
    }[destaque];

    const chipColor = {
        blue: "bg-blue-50 text-blue-700",
        yellow: "bg-yellow-50 text-yellow-700",
        sky: "bg-sky-50 text-sky-700",
        teal: "bg-teal-50 text-teal-700",
        indigo: "bg-indigo-50 text-indigo-700",
        rose: "bg-rose-50 text-rose-700",
    }[destaque];

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className={`border-l-4 ${leftBar} p-4`}>
                <div className="flex items-start justify-between">
                    <div className="text-3xl font-extrabold leading-none">{fmt0(valor)}</div>
                    {tipo && (
                        <span className={`ml-2 rounded-md px-2 py-1 text-[11px] font-semibold ${chipColor}`}>
                            {ICONES_TIPO[tipo] ? `${ICONES_TIPO[tipo]} ` : ""}
                            {tipo}
                        </span>
                    )}
                </div>
                <div className="mt-1 text-sm text-gray-600">{titulo}</div>
            </div>
        </div>
    );
}

/* Paleta para variar os cards */
const DESTAQUES: Array<"blue" | "yellow" | "sky" | "teal" | "indigo" | "rose"> = [
    "blue",
    "yellow",
    "sky",
    "teal",
    "indigo",
    "rose",
];

/* =========================
   Componente
   ========================= */
export default function ModalAnaliseGeral({
    aberto,
    onFechar,
    aDe,
    aAte,
    setADe,
    setAAte,
    somenteTanato,
    setSomenteTanato,
    selectedItem,
    setSelectedItem,
    rows = [],
    registrosComEventoNoPeriodo = 0,
    listaTanatoPeriodo = [],
    totalAssistencias = 0,
    convenios = {},
    loading,
    onRecarregar,
}: Props) {
    if (!aberto) return null;

    React.useEffect(() => {
        setSelectedItem(undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aDe, aAte, somenteTanato]);

    const {
        totalItensUsados,
        tanatoCount,
        totalAssistCalc,
        qtdArrumacaoFixas, // NOVO: mapa com as 12 chaves fixas (Luvas, Palha, ...)
    } = React.useMemo(() => {
        let tanatos = 0;
        let assistSims = 0;

        // Somatório de consumo real total (arrumação + assistência que conta)
        let totalItens = 0;

        // Quantidades para os 12 itens fixos (sempre mostram card)
        const qtdArr: Record<string, number> = Object.fromEntries(
            ARR_KEYS.map((k) => [k, 0])
        ) as Record<string, number>;

        // Helper para mapear label -> chave do ARR_KEYS
        const labelToArrKey = (label: string): string | undefined => {
            const lnorm = norm(label);
            for (const k of ARR_KEYS) {
                if (norm(ARR_LABELS[k]) === lnorm) return k;
            }
            return undefined;
        };

        for (const r of rows || []) {
            const itemKeyOrLabel = String(r.item || "");
            const itemKeyN = norm(itemKeyOrLabel);
            const res = resolveFromKey(itemKeyOrLabel);
            const resByKeyN = resolveFromKey(itemKeyN);
            const tipoCanon = res.tipo || resByKeyN.tipo || (r.tipo ? String(r.tipo) : "");
            const label = res.label || resByKeyN.label || itemKeyOrLabel;

            const qtd = Number(r.quantidade || 0);

            // marcadores
            if (itemKeyN === "tanato_sim") {
                tanatos += qtd || 0;
                continue;
            }
            if (itemKeyN === "assistencia_sim") {
                assistSims += qtd || 0;
                continue;
            }

            // Assistência: só conta consumo real (velas / kit_lanche) para total
            if (tipoCanon === "Assistência" || itemKeyN.startsWith("assistencia")) {
                if (itemKeyN === "velas" || itemKeyN === "kit_lanche") {
                    totalItens += qtd || 0;
                }
                continue;
            }

            // Arrumação / Conservação => 1 por checado (ou qtd)
            if (tipoCanon === "Arrumação") {
                const val = qtd > 0 ? qtd : 1;
                totalItens += val;

                // jogar para uma das 12 chaves fixas:
                // - se a key já é uma das ARR_KEYS, usa direto
                // - caso contrário, tenta por label
                let kHit: string | undefined = undefined;
                if (ARR_KEYS.includes(itemKeyN as any)) kHit = itemKeyN;
                else kHit = labelToArrKey(label);

                if (kHit) qtdArr[kHit] = (qtdArr[kHit] || 0) + val;
                continue;
            }
        }

        return {
            totalItensUsados: totalItens,
            tanatoCount: tanatos,
            totalAssistCalc: assistSims,
            qtdArrumacaoFixas: qtdArr,
        };
    }, [rows]);

    const totalAssistFinal = totalAssistencias || totalAssistCalc || 0;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[96%] md:w-[92%] lg:w-[84%] rounded-2xl shadow-2xl max-h-[95%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/90 p-4 backdrop-blur">
                    <div>
                        <h2 className="text-lg font-bold leading-tight">Análise Geral</h2>
                        <p className="text-xs text-gray-500">
                            Período: {aDe || "—"} a {aAte || "—"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRecarregar}
                            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                            Recarregar
                        </button>
                        <button
                            onClick={onFechar}
                            className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data inicial</span>
                        <input
                            type="date"
                            value={aDe || ""}
                            onChange={(e) => setADe(e.target.value)}
                            className="rounded-md border px-3 py-2"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data final</span>
                        <input
                            type="date"
                            value={aAte || ""}
                            onChange={(e) => setAAte(e.target.value)}
                            className="rounded-md border px-3 py-2"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={!!somenteTanato}
                            onChange={(e) => setSomenteTanato(e.target.checked)}
                        />
                        <span className="text-sm">Ocultar cards de itens</span>
                    </label>
                    <div className="text-sm text-gray-500 self-center">
                        {registrosComEventoNoPeriodo} registro(s) no período
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-4 pt-0">
                    {loading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Carregando análise…
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Nenhum dado para o período/filtro selecionado.
                        </div>
                    ) : (
                        <>
                            {/* KPIs */}
                            <div className="grid gap-4 lg:grid-cols-3 mb-6">
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Itens usados no período</div>
                                    <div className="mt-1 text-3xl font-bold">{fmt0(totalItensUsados)}</div>
                                    <div className="text-xs text-gray-500">Somatório de consumo real</div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Tanatopraxias realizadas</div>
                                    <div className="mt-1 text-3xl font-bold">{fmt0(tanatoCount)}</div>
                                    <div className="text-xs text-gray-500">Contagem de “Sim”</div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Assistências realizadas</div>
                                    <div className="mt-1 text-3xl font-bold">{fmt0(totalAssistFinal)}</div>
                                    <div className="text-xs text-gray-500">Total no período</div>
                                </div>
                            </div>

                            {/* CARDS FIXOS: 12 ITENS DE ARRUMAÇÃO */}
                            {!somenteTanato && (
                                <div className="rounded-2xl border overflow-hidden mb-6">
                                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                        <div className="text-sm font-semibold">Itens consumidos (Arrumação)</div>
                                        <div className="text-xs text-gray-500">Sempre mostra os 12 itens</div>
                                    </div>

                                    <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {ARR_KEYS.map((k, idx) => (
                                            <ItemCard
                                                key={k}
                                                titulo={ARR_LABELS[k]}
                                                valor={qtdArrumacaoFixas[k] || 0}
                                                tipo="Conservação do Corpo"
                                                destaque={DESTAQUES[idx % DESTAQUES.length]}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* LISTA TANATO — REMOVIDA A LISTAGEM DE NOMES, CONFORME PEDIDO */}
                            {/* Mantemos apenas o cabeçalho compacto com a contagem (se quiser esconder tudo, remova este bloco). */}
                            <div className="rounded-2xl border overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 text-sm font-semibold">
                                    Tanatopraxias no período — {fmt0(tanatoCount)}
                                </div>
                                <div className="p-4 text-xs text-gray-500">
                                    Listagem de nomes oculta.
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
