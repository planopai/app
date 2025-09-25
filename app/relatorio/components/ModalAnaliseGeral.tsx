"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";
import {
    ALL_ITEM_LABELS,
    ALL_ITEM_TIPO,
    ARR_KEYS,
    ARR_LABELS,
    normSimNao,             // p/ ler "sim/nao"
    extrairEstadoArrumacao, // p/ contar itens de arrumação a partir de arrumacao_json
} from "./MateriaisArrumacao";
import { listarAnalitico } from "./Api";
import type { RegistroAnalise } from "./TiposHistorico";

/* =========================
   Tipos
   ========================= */
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

    // Os props abaixo ficam opcionais agora; o modal calcula sozinho.
    selectedItem?: string;
    setSelectedItem?: (v?: string) => void;

    // legados (não usados mais para cálculo)
    rows?: any[];
    registrosComEventoNoPeriodo?: number;
    listaTanatoPeriodo?: Evento[];

    totalAssistencias?: number;
    convenios?: { particular?: number; prefeitura?: number; associado?: number };

    loading?: boolean;
    onRecarregar?: () => void;
}

/* =========================
   Helpers visuais
   ========================= */
const fmt0 = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

function norm(s: string) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

const ICONES_TIPO: Record<string, string> = {
    "Assistência": "🕯️",
    "Conservação do Corpo": "🧪",
    "Arrumação": "🧴",
    "Material": "📦",
    "Tanatopraxia": "⚗️",
    "Convênio": "🤝",
    "Principal": "⭐",
};

function ItemCard({
    titulo,
    valor,
    tipo,
    subtexto,
    destaque = "blue",
}: {
    titulo: string;
    valor: number;
    tipo?: string;
    subtexto?: string;
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
                {subtexto && <div className="mt-1 text-xs text-gray-500">{subtexto}</div>}
            </div>
        </div>
    );
}

const DESTAQUES: Array<"blue" | "yellow" | "sky" | "teal" | "indigo" | "rose"> = [
    "blue", "yellow", "sky", "teal", "indigo", "rose",
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
    loading: loadingProp,
    onRecarregar,
}: Props) {
    const [busy, setBusy] = React.useState(false);
    const [dados, setDados] = React.useState<RegistroAnalise[]>([]);
    const [erro, setErro] = React.useState<string | null>(null);

    // Busca do analítico direto no modal
    const carregar = React.useCallback(async () => {
        try {
            setErro(null);
            setBusy(true);
            const lista = await listarAnalitico();
            setDados(Array.isArray(lista) ? lista : []);
        } catch (e) {
            setErro("Falha ao carregar dados do analítico.");
            setDados([]);
        } finally {
            setBusy(false);
        }
    }, []);

    React.useEffect(() => {
        if (aberto) carregar();
    }, [aberto, carregar]);

    // Permite recarregar pelo botão externo (se existir)
    const handleRecarregar = React.useCallback(() => {
        if (onRecarregar) onRecarregar();
        carregar();
    }, [onRecarregar, carregar]);

    // Normaliza data do registro para filtragem
    function pegaDataRegistro(r: RegistroAnalise): string {
        return (
            (r.data as string) ||
            (r.data_inicio_velorio as string) ||
            (r.data_fim_velorio as string) ||
            ""
        );
    }

    // Filtro por período
    const dadosPeriodo = React.useMemo(() => {
        if (!aDe && !aAte) return dados;
        const de = aDe ? new Date(aDe + "T00:00:00") : null;
        const ate = aAte ? new Date(aAte + "T23:59:59") : null;
        return (dados || []).filter((r) => {
            const s = pegaDataRegistro(r);
            if (!s) return false;
            const d = new Date(s);
            if (isNaN(d.getTime())) return false;
            if (de && d < de) return false;
            if (ate && d > ate) return false;
            return true;
        });
    }, [dados, aDe, aAte]);

    const registrosComEventoNoPeriodo = dadosPeriodo.length;

    // Cálculos
    const {
        tanatoCount,
        assistTotal,
        ornNatural,
        ornArtificial,
        qtdArrumacaoFixas,
        convPref,
        convPart,
        convAssoc,
    } = React.useMemo(() => {
        let tanato = 0;
        let assist = 0;

        let ornNat = 0;
        let ornArt = 0;

        // 12 itens fixos
        const arr: Record<string, number> = Object.fromEntries(
            ARR_KEYS.map((k) => [k, 0])
        ) as Record<string, number>;

        // convênios
        let cPref = 0, cPart = 0, cAssoc = 0;

        for (const r of dadosPeriodo) {
            // Tanato
            if (normSimNao(String(r.tanato || "")) === "sim") tanato++;

            // Assistência (total)
            if (normSimNao(String(r.assistencia || "")) === "sim") assist++;

            // Ornamentação — tenta achar info textual
            const ornTxt = String(
                (r as any).ornamentacao_tipo ||
                (r as any).ornamentacao ||
                (r as any).ornamentacao_tipo_nome ||
                ""
            ).toLowerCase();

            if (ornTxt) {
                if (ornTxt.includes("natural")) ornNat++;
                else if (ornTxt.includes("artificial")) ornArt++;
            }

            // Arrumação — booleans em arrumacao_json
            const estadosArr = extrairEstadoArrumacao(r);
            for (const k of ARR_KEYS) {
                if (estadosArr[k]) arr[k] = (arr[k] || 0) + 1;
            }

            // Convênio — tenta heurísticas de campo
            const convTxt = String(
                (r as any).convenio ||
                (r as any).tipo_convenio ||
                (r as any).plano ||
                (r as any).contrato ||
                ""
            ).toLowerCase();

            if (convTxt.includes("prefeitura")) cPref++;
            else if (convTxt.includes("associado") || convTxt.includes("associação")) cAssoc++;
            else if (convTxt.includes("particular")) cPart++;
            // (se vier vazio, ignora)
        }

        return {
            tanatoCount: tanato,
            assistTotal: assist,
            ornNatural: ornNat,
            ornArtificial: ornArt,
            qtdArrumacaoFixas: arr,
            convPref: cPref,
            convPart: cPart,
            convAssoc: cAssoc,
        };
    }, [dadosPeriodo]);

    const ornTotal = (ornNatural || 0) + (ornArtificial || 0);

    return !aberto ? null : (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[96%] md:w-[92%] lg:w-[84%] rounded-2xl shadow-2xl max-h-[95%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/90 p-4 backdrop-blur">
                    <div>
                        <h2 className="text-lg font-bold leading-tight">Análise Geral</h2>
                        <p className="text-xs text-gray-500">
                            Período: {aDe || "—"} a {aAte || "—"} • {fmt0(registrosComEventoNoPeriodo)} registro(s)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRecarregar}
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
                </div>

                {/* Corpo */}
                <div className="p-4 pt-0">
                    {busy ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Carregando análise…
                        </div>
                    ) : erro ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-red-600">
                            {erro}
                        </div>
                    ) : dadosPeriodo.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Nenhum dado para o período/filtro selecionado.
                        </div>
                    ) : (
                        <>
                            {/* ITENS PRINCIPAIS */}
                            <div className="rounded-2xl border overflow-hidden mb-6">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">Itens principais</div>
                                </div>
                                <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <ItemCard
                                        titulo="Tanatopraxia"
                                        valor={tanatoCount}
                                        tipo="Principal"
                                        destaque="indigo"
                                    />
                                    <ItemCard
                                        titulo="Assistências"
                                        valor={assistTotal}
                                        tipo="Principal"
                                        destaque="teal"
                                    />
                                    <ItemCard
                                        titulo="Ornamentações"
                                        valor={ornTotal}
                                        subtexto={`Natural: ${fmt0(ornNatural || 0)} · Artificial: ${fmt0(ornArtificial || 0)}`}
                                        tipo="Principal"
                                        destaque="rose"
                                    />
                                </div>
                            </div>

                            {/* CONVÊNIOS */}
                            <div className="rounded-2xl border overflow-hidden mb-6">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">Atendimentos por convênio</div>
                                </div>
                                <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <ItemCard titulo="Prefeitura" valor={convPref} tipo="Convênio" destaque="indigo" />
                                    <ItemCard titulo="Particular" valor={convPart} tipo="Convênio" destaque="teal" />
                                    <ItemCard titulo="Associado" valor={convAssoc} tipo="Convênio" destaque="rose" />
                                </div>
                            </div>

                            {/* 12 ITENS DE ARRUMAÇÃO */}
                            {!somenteTanato && (
                                <div className="rounded-2xl border overflow-hidden mb-6">
                                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                        <div className="text-sm font-semibold">Itens consumidos (Arrumação)</div>
                                        <div className="text-xs text-gray-500">Mostrando os 12 itens</div>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
