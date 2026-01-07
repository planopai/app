"use client";
import React from "react";
import {
    ARR_KEYS,
    ARR_LABELS,
    normSimNao,
    extrairEstadoArrumacao,
} from "./MateriaisArrumacao";
import { listarAnalitico, listarLogPorId } from "./Api";
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
    subtexto?: React.ReactNode;
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
   Parser de datas (BR/ISO)
   ========================= */
function parseBrDate(s: string): Date | null {
    const m = s
        .trim()
        .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}

function parseIsoDate(s: string): Date | null {
    const t = s.trim().replace(" ", "T");

    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }

    m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
        const [, yyyy, mm, dd, hh, mi, ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function parseDateFlex(s?: string | null): Date | null {
    if (!s) return null;
    return parseBrDate(s) || parseIsoDate(s) || null;
}

function getRegistroDate(r: RegistroAnalise): Date | null {
    const candidatos = [
        (r as any).data,
        (r as any).data_inicio_velorio,
        (r as any).data_fim_velorio,
        (r as any).datahora,
        (r as any).ultima_datahora,
        (r as any).created_at,
    ];
    for (const c of candidatos) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

function makeRange(aDe?: string, aAte?: string) {
    const hasDe = !!aDe,
        hasAte = !!aAte;
    const deStr = hasDe ? aDe! : hasAte ? aAte! : "";
    const ateStr = hasAte ? aAte! : hasDe ? aDe! : "";
    const start = deStr ? new Date(`${deStr}T00:00:00`) : null;
    const end = ateStr ? new Date(`${ateStr}T23:59:59`) : null;

    if (start && end && end < start) {
        return {
            start: end,
            end: new Date(start.getTime() + 23 * 3600 * 1000 + 59 * 60000 + 59 * 1000),
        };
    }
    return { start, end };
}

/* =========================
   Helpers TANATO (somente início puro)
   ========================= */
const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const titleCase = (s: string) =>
    s
        .split(/\s+/)
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join(" ");

function logTs(log: any): number {
    const s = String(log?.datahora || log?.data || log?.created_at || "");
    const d = parseDateFlex(s);
    return d ? d.getTime() : Number.NaN;
}

function fmtDateHora(ts: number) {
    if (!Number.isFinite(ts)) return "";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(ts));
}

function agenteDoLog(log: any): string {
    const pick = (o: any) =>
        o?.usuario ||
        o?.usuario_nome ||
        o?.usuarioNome ||
        o?.nome_usuario ||
        o?.user ||
        o?.user_name ||
        o?.username ||
        o?.operador ||
        o?.agente ||
        o?.nome ||
        o?.name ||
        "";

    const direct = pick(log);
    if (direct) return String(direct).trim();

    try {
        const det =
            typeof log?.detalhes === "string" ? JSON.parse(log.detalhes) : log?.detalhes;
        const poss = pick(det) || det?.usuario_nome || det?.user_name || det?.nome_usuario;
        if (poss) return String(poss).trim();
    } catch { }
    return "";
}

function isDetalhesVazio(log: any): boolean {
    const d = log?.detalhes;

    if (d === null || d === undefined) return true;

    if (typeof d === "string") {
        const s = d.trim();
        if (!s) return true;
        if (s === "null") return true;
        if (s === "{}") return true;

        try {
            const obj = JSON.parse(s);
            if (obj === null) return true;
            if (typeof obj === "object" && obj && Object.keys(obj).length === 0) return true;
            return false;
        } catch {
            return false;
        }
    }

    if (typeof d === "object") {
        return Object.keys(d || {}).length === 0;
    }

    return false;
}

function isInicioConservacaoPuro(log: any): boolean {
    const acao = norm(String(log?.acao || ""));
    const statusAnterior = norm(String(log?.status_anterior || ""));
    const statusNovo = norm(String(log?.status_novo || log?.status || ""));
    const titulo = norm(String(log?.titulo || ""));
    const texto = `${acao} ${statusNovo} ${titulo}`;

    // 1) excluir "editou"
    if (acao.includes("edit")) return false;

    // 2) tem que ser mudança de status
    const matchMudancaStatus =
        acao.includes("atualizou status") ||
        acao.includes("atualizou situacao") ||
        acao.includes("alterou status") ||
        acao.includes("mudou status") ||
        acao.includes("status");

    if (!matchMudancaStatus) return false;

    // 3) exigir fase02 -> fase03 quando houver campos
    const temFases = !!(log?.status_anterior || log?.status_novo);
    if (temFases) {
        if (!(statusAnterior === "fase02" && statusNovo === "fase03")) return false;
    } else {
        const matchConservacao =
            /inicio\s*(de\s*)?conservacao/.test(texto) ||
            /iniciou\s*conservacao/.test(texto) ||
            /conservacao\s*iniciada/.test(texto) ||
            /fase\s*0*3\b/.test(texto);
        if (!matchConservacao) return false;
    }

    // 4) detalhes vazio
    if (!isDetalhesVazio(log)) return false;

    return true;
}

type AgenteFix = "Sandro" | "Joseildo";
function agentePermitido(log: any): AgenteFix | "" {
    const a = norm(agenteDoLog(log));
    if (a === "sandro") return "Sandro";
    if (a === "joseildo") return "Joseildo";
    return "";
}

function findPrimeiroInicioPuroNoPeriodo(
    logs: any[],
    start: Date | null,
    end: Date | null
): any | null {
    let best: any | null = null;

    for (const log of logs || []) {
        if (!isInicioConservacaoPuro(log)) continue;

        const ag = agentePermitido(log);
        if (!ag) continue;

        const t = logTs(log);
        if (Number.isNaN(t)) continue;
        if (start && t < start.getTime()) continue;
        if (end && t > end.getTime()) continue;

        if (!best) best = log;
        else if (t < logTs(best)) best = log;
    }

    return best;
}

/* =========================
   IDs / entidade (dedupe por sepultamento)
   ========================= */
function getIdsParaTentar(r: RegistroAnalise): string[] {
    const anyR = r as any;
    const candidates = [
        anyR.sepultamento_id,
        anyR.sepultamentoId,
        anyR.id_sepultamento,
        anyR.atendimento_id,
        anyR.atendimentoId,
        anyR.id,
    ]
        .map((x: any) => String(x || "").trim())
        .filter(Boolean);

    return Array.from(new Set(candidates));
}

function getEntityKey(r: RegistroAnalise): string {
    const anyR = r as any;
    const primary = String(anyR.sepultamento_id || anyR.sepultamentoId || anyR.id_sepultamento || "").trim();
    if (primary) return primary;

    const ids = getIdsParaTentar(r);
    return ids[0] || "";
}

/* =========================
   Falecido (para o modal)
   ========================= */
function getFalecidoNome(r: RegistroAnalise): string {
    const anyR = r as any;
    const nome =
        anyR.falecido ||
        anyR.falecido_nome ||
        anyR.nome_falecido ||
        anyR.falecidoNome ||
        anyR.nomeFalecido ||
        anyR.nome ||
        anyR.falecido_nome_completo ||
        "";
    return String(nome || "").trim();
}

/* =========================
   Modal de lista (Tanato)
   ========================= */
type TanatoItem = {
    entityKey: string;
    falecido: string;
    ts: number;
};

function ModalListaTanato({
    aberto,
    onFechar,
    agente,
    itens,
}: {
    aberto: boolean;
    onFechar: () => void;
    agente: string;
    itens: TanatoItem[];
}) {
    if (!aberto) return null;

    const itensOrdenados = [...(itens || [])].sort((a, b) => a.ts - b.ts);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
            <div className="bg-white w-[96%] md:w-[80%] lg:w-[60%] rounded-2xl shadow-2xl max-h-[90%] overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b p-4 bg-white/90 backdrop-blur">
                    <div>
                        <div className="text-base font-bold">Tanatopraxia — {agente}</div>
                        <div className="text-xs text-gray-500">{fmt0(itensOrdenados.length)} falecido(s)</div>
                    </div>
                    <button
                        onClick={onFechar}
                        className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                        Fechar
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[78vh]">
                    {itensOrdenados.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Nenhum registro para este agente no período.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {itensOrdenados.map((it) => (
                                <div
                                    key={it.entityKey}
                                    className="rounded-xl border border-gray-200 bg-white p-3"
                                >
                                    <div className="text-sm font-semibold text-gray-900">
                                        {it.falecido || "(Sem nome do falecido)"}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-3">
                                        <span>Data/hora: {fmtDateHora(it.ts) || "—"}</span>
                                        <span>Entidade: {it.entityKey}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
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

    const [tanatoModal, setTanatoModal] = React.useState<{
        aberto: boolean;
        agente: string;
        itens: TanatoItem[];
    }>({ aberto: false, agente: "", itens: [] });

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

    // filtro por período (para os demais cards)
    const dadosPeriodo = React.useMemo(() => {
        const { start, end } = makeRange(aDe, aAte);
        return (dados || []).filter((r) => {
            const d = getRegistroDate(r);
            if (!d) return false;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    }, [dados, aDe, aAte]);

    const registrosComEventoNoPeriodo = dadosPeriodo.length;

    const rangeTanato = React.useMemo(() => makeRange(aDe, aAte), [aDe, aAte]);

    type CacheEntry = { logs: any[]; fetched: boolean };

    const cacheRef = React.useRef<Record<string, CacheEntry>>({});
    const inFlightRef = React.useRef<Set<string>>(new Set());
    const [cacheVersion, setCacheVersion] = React.useState(0);

    const tanatoEntities = React.useMemo(() => {
        const entityMap = new Map<string, Set<string>>();

        for (const r of dados || []) {
            if (normSimNao(String((r as any).tanato || "")) !== "sim") continue;

            const key = getEntityKey(r);
            if (!key) continue;

            const ids = getIdsParaTentar(r);
            if (!ids.length) continue;

            if (!entityMap.has(key)) entityMap.set(key, new Set());
            const set = entityMap.get(key)!;
            for (const id of ids) set.add(id);
        }

        const list = Array.from(entityMap.entries()).map(([key, idSet]) => ({
            key,
            idsToTry: Array.from(idSet),
        }));

        const keySet = new Set(list.map((x) => x.key));

        return { list, keySet };
    }, [dados]);

    // Mapa entidade -> nome do falecido (para o modal)
    const falecidoByEntity = React.useMemo(() => {
        const m: Record<string, string> = {};
        for (const r of dados || []) {
            const k = getEntityKey(r);
            if (!k) continue;
            if (m[k]) continue;
            const nome = getFalecidoNome(r);
            if (nome) m[k] = nome;
        }
        return m;
    }, [dados]);

    React.useEffect(() => {
        if (!aberto) return;

        if (tanatoEntities.list.length > 800) return;

        const targets = tanatoEntities.list.filter(
            (e) => !cacheRef.current[e.key]?.fetched && !inFlightRef.current.has(e.key)
        );

        if (!targets.length) return;

        let cancel = false;

        async function run(maxConc = 4) {
            let i = 0;

            for (const t of targets) inFlightRef.current.add(t.key);

            async function worker() {
                while (i < targets.length && !cancel) {
                    const item = targets[i++];
                    try {
                        let logs: any[] = [];

                        for (const id of item.idsToTry) {
                            try {
                                const res = await listarLogPorId(id);
                                if (Array.isArray(res) && res.length) {
                                    logs = res;
                                    break;
                                }
                            } catch { }
                        }

                        cacheRef.current[item.key] = { logs, fetched: true };
                    } finally {
                        inFlightRef.current.delete(item.key);
                    }
                }
            }

            await Promise.all(
                Array.from({ length: Math.min(maxConc, targets.length) }, worker)
            );

            if (!cancel) setCacheVersion((v) => v + 1);
        }

        run();

        return () => {
            cancel = true;
        };
    }, [aberto, tanatoEntities]);

    const {
        tanatoCount,
        agentesOrdenados,
        tanatoItensPorAgente,
        assistTotal,
        ornNatural,
        ornArtificial,
        qtdArrumacaoFixas,
        convPref,
        convPart,
        convAssoc,
    } = React.useMemo(() => {
        const { start, end } = rangeTanato;

        const byKey: Record<string, number> = {};
        const displayByKey: Record<string, string> = {};
        const itensPorAgente: Record<string, TanatoItem[]> = {
            sandro: [],
            joseildo: [],
        };

        let assist = 0;
        let ornNat = 0;
        let ornArt = 0;

        const arr: Record<string, number> = Object.fromEntries(
            ARR_KEYS.map((k) => [k, 0])
        ) as Record<string, number>;

        let cPref = 0,
            cPart = 0,
            cAssoc = 0;

        // ===== TANATO (somente início PURO + somente Sandro/Joseildo) =====
        for (const [entityKey, entry] of Object.entries(cacheRef.current)) {
            if (!entry?.fetched) continue;
            if (!tanatoEntities.keySet.has(entityKey)) continue;

            const inicio = findPrimeiroInicioPuroNoPeriodo(entry.logs || [], start, end);
            if (!inicio) continue;

            const agente = agentePermitido(inicio);
            if (!agente) continue;

            const agenteK = norm(agente); // "sandro" | "joseildo"
            byKey[agenteK] = (byKey[agenteK] || 0) + 1;
            displayByKey[agenteK] = agente;

            // itens para auditoria no modal
            const ts = logTs(inicio);
            const falecido = falecidoByEntity[entityKey] || "";
            itensPorAgente[agenteK] = itensPorAgente[agenteK] || [];
            itensPorAgente[agenteK].push({ entityKey, falecido, ts });
        }

        // dedupe por entityKey dentro do agente (segurança extra)
        for (const k of Object.keys(itensPorAgente)) {
            const seen = new Set<string>();
            itensPorAgente[k] = (itensPorAgente[k] || []).filter((it) => {
                if (seen.has(it.entityKey)) return false;
                seen.add(it.entityKey);
                return true;
            });
        }

        // ===== RESTO (analítico filtrado por dadosPeriodo) =====
        for (const r of dadosPeriodo) {
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

        const agentesOrdenados = Object.entries(byKey)
            .map(([k, count]) => ({ key: k, display: displayByKey[k] || titleCase(k), count }))
            .sort((a, b) => b.count - a.count);

        const tanatoCount = agentesOrdenados.reduce((s, a) => s + a.count, 0);

        return {
            tanatoCount,
            agentesOrdenados,
            tanatoItensPorAgente: itensPorAgente,
            assistTotal: assist,
            ornNatural: ornNat,
            ornArtificial: ornArt,
            qtdArrumacaoFixas: arr,
            convPref: cPref,
            convPart: cPart,
            convAssoc: cAssoc,
        };
    }, [dadosPeriodo, rangeTanato, cacheVersion, tanatoEntities, falecidoByEntity]);

    const ornTotal = (ornNatural || 0) + (ornArtificial || 0);

    const subTanato = React.useMemo(() => {
        if (!agentesOrdenados.length) return undefined;

        return (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
                {agentesOrdenados.map((a, idx) => (
                    <React.Fragment key={a.key}>
                        <button
                            type="button"
                            className="underline decoration-dotted hover:opacity-80"
                            onClick={() => {
                                const itens = tanatoItensPorAgente?.[a.key] || [];
                                setTanatoModal({ aberto: true, agente: a.display, itens });
                            }}
                            title="Clique para ver a lista de falecidos"
                        >
                            {a.display}: {fmt0(a.count)}
                        </button>
                        {idx < agentesOrdenados.length - 1 ? <span>·</span> : null}
                    </React.Fragment>
                ))}
            </div>
        );
    }, [agentesOrdenados, tanatoItensPorAgente]);

    if (!aberto) return null;

    return (
        <>
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
                        <div className="text-sm text-gray-500 self-center">
                            Se informar apenas uma data, usamos <b>só aquele dia</b>.
                        </div>
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
                                            subtexto={subTanato}
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
                                            subtexto={`Natural: ${fmt0(ornNatural || 0)} · Artificial: ${fmt0(
                                                ornArtificial || 0
                                            )}`}
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

            {/* Modal de auditoria do Tanato */}
            <ModalListaTanato
                aberto={tanatoModal.aberto}
                agente={tanatoModal.agente}
                itens={tanatoModal.itens}
                onFechar={() => setTanatoModal({ aberto: false, agente: "", itens: [] })}
            />
        </>
    );
}
