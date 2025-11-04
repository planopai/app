"use client";
import React from "react";
import {
    ARR_KEYS,
    ARR_LABELS,
    normSimNao,
    extrairEstadoArrumacao,
} from "./MateriaisArrumacao";
import { listarAnalitico } from "./Api";
import type { RegistroAnalise } from "./TiposHistorico";

/* =========================
   Helpers visuais
   ========================= */
const fmt0 = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

const ICONES_TIPO: Record<string, string> = {
    Assistência: "🕯️",
    "Conservação do Corpo": "🧪",
    Arrumação: "🧴",
    Material: "📦",
    Tanatopraxia: "⚗️",
    Convênio: "🤝",
    Principal: "⭐",
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
    "blue",
    "yellow",
    "sky",
    "teal",
    "indigo",
    "rose",
];

/* =========================
   Datas — parsers robustos
   ========================= */
function parseBrDate(s?: string | null): Date | null {
    if (!s) return null;
    const m = s
        .trim()
        .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}
function parseIsoLocal(s?: string | null): Date | null {
    if (!s) return null;
    const t = s.trim().replace(" ", "T");
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0);
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}
function parseDateFlex(s?: string | null) {
    return parseBrDate(s) || parseIsoLocal(s) || null;
}

/** Data canônica para FILTRAGEM do período — prioriza início de conservação/tanato */
function getRegistroDateAnalitico(r: RegistroAnalise): Date | null {
    const cand = [
        // variações comuns em backends
        (r as any).data_inicio_conservacao,
        (r as any).tanato_data_inicio,
        (r as any).inicio_conservacao,
        (r as any).data_tanato,
        // genéricas
        (r as any).data,
        (r as any).data_inicio_velorio,
        (r as any).data_fim_velorio,
        (r as any).datahora,
        (r as any).ultima_datahora,
        (r as any).created_at,
    ];
    for (const c of cand) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

/** Constrói intervalo inclusivo [start,end]. Se informar só uma data, usa aquele dia. */
function makeRange(aDe?: string, aAte?: string) {
    const hasDe = !!aDe;
    const hasAte = !!aAte;
    const deStr = hasDe ? aDe! : hasAte ? aAte! : "";
    const ateStr = hasAte ? aAte! : hasDe ? aDe! : "";
    const start = deStr ? new Date(`${deStr}T00:00:00`) : null;
    const end = ateStr ? new Date(`${ateStr}T23:59:59`) : null;
    if (start && end && end < start) return { start: end, end: start };
    return { start, end };
}

/* =========================
   Responsável Tanato
   ========================= */
function normStr(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function pickNome(obj: any): string {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj === "object") {
        return obj.nome || obj.name || obj.displayName || obj.usuario || obj.login || obj.agente || "";
    }
    return String(obj);
}
function isInicioConservacao(log: any): boolean {
    const a = normStr(String(log?.acao || ""));
    const s = normStr(String(log?.status_novo || log?.status || ""));
    if (a.includes("iniciou") && a.includes("conserva")) return true;
    if (a.includes("atualizou") && a.includes("status")) {
        if (/fase\s*0*1\b/.test(s)) return true; // fase01/fase1
    }
    try {
        const det = typeof log?.detalhes === "string" ? JSON.parse(log.detalhes) : log?.detalhes;
        const detStr = normStr(JSON.stringify(det || ""));
        if (detStr.includes("inicio") && detStr.includes("conserva")) return true;
    } catch { }
    return false;
}
function extrairResponsavelTanato(r: RegistroAnalise): "sandro" | "joseildo" | null {
    const direto =
        (r as any).agente ??
        (r as any).agente_nome ??
        (r as any).agente_responsavel ??
        (r as any).responsavel_agente ??
        (r as any).agente_inicio_conservacao ??
        (r as any).agente_inicio_tanato;
    const nomeDireto = normStr(pickNome(direto));
    if (nomeDireto.includes("sandro")) return "sandro";
    if (nomeDireto.includes("joseildo") || nomeDireto.includes("jose il")) return "joseildo";

    const logs: any[] =
        (Array.isArray((r as any).logs) && (r as any).logs) ||
        (Array.isArray((r as any).historico) && (r as any).historico) ||
        (Array.isArray((r as any).historicos) && (r as any).historicos) ||
        (Array.isArray((r as any).log) && (r as any).log) ||
        (Array.isArray((r as any).logVisiveis) && (r as any).logVisiveis) ||
        [];

    for (const l of logs) {
        if (!isInicioConservacao(l)) continue;
        const nome = normStr(pickNome(l?.usuario ?? l?.agente ?? l?.operador));
        if (nome.includes("sandro")) return "sandro";
        if (nome.includes("joseildo") || nome.includes("jose il")) return "joseildo";
    }

    const textos = [
        (r as any).tanato_responsavel,
        (r as any).responsavel_tanato,
        (r as any).conservacao_responsavel,
        (r as any).responsavel_conservacao,
        (r as any).iniciado_por,
        (r as any).usuario_responsavel,
    ];
    for (const c of textos) {
        const v = normStr(String(c || ""));
        if (!v) continue;
        if (v.includes("sandro")) return "sandro";
        if (v.includes("joseildo") || v.includes("jose il")) return "joseildo";
    }
    return null;
}

/* =========================
   DEDUP + consolidação
   ========================= */
/** escolhe a “melhor” data para ORDENAR ao consolidar dups */
function bestSortDate(r: RegistroAnalise): number {
    const d =
        parseDateFlex(String((r as any).ultima_datahora || "")) ||
        parseDateFlex(String((r as any).created_at || "")) ||
        getRegistroDateAnalitico(r);
    return d ? d.getTime() : 0;
}

/** Deduplica por sepultamento_id: para cada id, mantém o registro com data “mais nova” */
function dedupPorSepultamento(dados: RegistroAnalise[]): RegistroAnalise[] {
    const map = new Map<string, RegistroAnalise>();
    for (const r of dados || []) {
        const id = String((r.sepultamento_id ?? r.id ?? "") || "");
        if (!id) continue;
        const prev = map.get(id);
        if (!prev || bestSortDate(r) >= bestSortDate(prev)) map.set(id, r);
    }
    return Array.from(map.values());
}

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
    onRecarregar,
}: {
    aberto: boolean;
    onFechar: () => void;
    aDe: string;
    aAte: string;
    setADe: (v: string) => void;
    setAAte: (v: string) => void;
    somenteTanato: boolean;
    setSomenteTanato: (v: boolean) => void;
    onRecarregar?: () => void;
}) {
    const [busy, setBusy] = React.useState(false);
    const [dados, setDados] = React.useState<RegistroAnalise[]>([]);
    const [erro, setErro] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        try {
            setErro(null);
            setBusy(true);
            const lista = await listarAnalitico();
            setDados(Array.isArray(lista) ? lista : []);
        } catch {
            setErro("Falha ao carregar dados do analítico.");
            setDados([]);
        } finally {
            setBusy(false);
        }
    }, []);

    React.useEffect(() => {
        if (aberto) carregar();
    }, [aberto, carregar]);

    const handleRecarregar = React.useCallback(() => {
        onRecarregar?.();
        carregar();
    }, [onRecarregar, carregar]);

    /** 1) DEDUP por sepultamento_id (sempre) */
    const dedup = React.useMemo(() => dedupPorSepultamento(dados), [dados]);

    /** 2) Filtra por período usando a **data canônica** (prioriza início de conservação) */
    const dadosPeriodo = React.useMemo(() => {
        const { start, end } = makeRange(aDe, aAte);
        return (dedup || []).filter((r) => {
            const d = getRegistroDateAnalitico(r);
            if (!d) return false;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    }, [dedup, aDe, aAte]);

    /** 3) Agregações sobre a lista filtrada e deduplicada */
    const {
        tanatoCount,
        tanatoSandro,
        tanatoJoseildo,
        assistTotal,
        ornNatural,
        ornArtificial,
        qtdArrumacaoFixas,
        convPref,
        convPart,
        convAssoc,
    } = React.useMemo(() => {
        let tanato = 0;
        let tS = 0;
        let tJ = 0;
        let assist = 0;
        let ornNat = 0;
        let ornArt = 0;

        const arr: Record<string, number> = Object.fromEntries(
            ARR_KEYS.map((k) => [k, 0])
        ) as Record<string, number>;

        let cPref = 0,
            cPart = 0,
            cAssoc = 0;

        for (const r of dadosPeriodo) {
            const fezTanato = normSimNao(String((r as any).tanato || "")) === "sim";
            if (fezTanato) {
                tanato++;
                const resp = extrairResponsavelTanato(r);
                if (resp === "sandro") tS++;
                else if (resp === "joseildo") tJ++;
            }

            if (normSimNao(String((r as any).assistencia || "")) === "sim") assist++;

            const ornTxt = String(
                (r as any).ornamentacao_tipo ||
                (r as any).ornamentacao ||
                (r as any).ornamentacao_tipo_nome ||
                ""
            ).toLowerCase();
            if (ornTxt.includes("natural")) ornNat++;
            else if (ornTxt.includes("artificial")) ornArt++;

            const estadosArr = extrairEstadoArrumacao(r);
            for (const k of ARR_KEYS) if (estadosArr[k]) arr[k] = (arr[k] || 0) + 1;

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
        }

        return {
            tanatoCount: tanato,
            tanatoSandro: tS,
            tanatoJoseildo: tJ,
            assistTotal: assist,
            ornNatural: ornNat,
            ornArtificial: ornArt,
            qtdArrumacaoFixas: arr,
            convPref: cPref,
            convPart: cPart,
            convAssoc: cAssoc,
        };
    }, [dadosPeriodo]);

    const subTanato = `Sandro: ${fmt0(tanatoSandro)} · Joseildo: ${fmt0(tanatoJoseildo)}`;
    const ornTotal = (ornNatural || 0) + (ornArtificial || 0);

    if (!aberto) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[96%] md:w-[92%] lg:w-[84%] rounded-2xl shadow-2xl max-h-[95%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/90 p-4 backdrop-blur">
                    <div>
                        <h2 className="text-lg font-bold leading-tight">Análise Geral</h2>
                        <p className="text-xs text-gray-500">
                            Período: {aDe || "—"} a {aAte || "—"} • Registros únicos no período: {fmt0(dadosPeriodo.length)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                            Tanato: {fmt0(tanatoCount)} • Responsáveis atribuídos: {fmt0(tanatoSandro + tanatoJoseildo)} ({subTanato})
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleRecarregar} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
                            Recarregar
                        </button>
                        <button onClick={onFechar} className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                            Fechar
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data inicial</span>
                        <input type="date" value={aDe || ""} onChange={(e) => setADe(e.target.value)} className="rounded-md border px-3 py-2" />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data final</span>
                        <input type="date" value={aAte || ""} onChange={(e) => setAAte(e.target.value)} className="rounded-md border px-3 py-2" />
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={!!somenteTanato} onChange={(e) => setSomenteTanato(e.target.checked)} />
                        <span className="text-sm">Ocultar cards de itens</span>
                    </label>
                    <div className="text-sm text-gray-500 self-center">
                        Se informar apenas uma data, usamos <b>só aquele dia</b>.
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-4 pt-0">
                    {busy ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">Carregando análise…</div>
                    ) : erro ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-red-600">{erro}</div>
                    ) : dadosPeriodo.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">Nenhum dado para o período/filtro selecionado.</div>
                    ) : (
                        <>
                            {/* ITENS PRINCIPAIS */}
                            <div className="rounded-2xl border overflow-hidden mb-6">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">Itens principais</div>
                                </div>
                                <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <ItemCard titulo="Tanatopraxia" valor={tanatoCount} subtexto={subTanato} tipo="Principal" destaque="indigo" />
                                    <ItemCard titulo="Assistências" valor={assistTotal} tipo="Principal" destaque="teal" />
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

                            {/* ARRUMAÇÃO */}
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
