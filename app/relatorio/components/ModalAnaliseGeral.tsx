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
    const hasDe = !!aDe, hasAte = !!aAte;
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
   Helpers de log (INÍCIO DE CONSERVAÇÃO)
   ========================= */
const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const titleCase = (s: string) =>
    s
        .split(/\s+/)
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join(" ");

/**
 * Match mais tolerante para “Início de Conservação”
 * (evita perder logs por pequenas variações)
 */
function isInicioConservacaoStrict(log: any): boolean {
    const acao = norm(String(log?.acao || ""));
    const novo = norm(String(log?.status_novo || log?.status || ""));
    const titulo = norm(String(log?.titulo || ""));

    const texto = `${acao} ${novo} ${titulo}`;

    const matchConservacao =
        /inicio\s*(de\s*)?conservacao/.test(texto) ||
        /iniciou\s*conservacao/.test(texto) ||
        /conservacao\s*iniciada/.test(texto) ||
        /fase\s*0*3\b/.test(texto);

    // mantém “ideia” do antigo: normalmente vem por mudança de status,
    // mas não exige mais exatamente "atualizou status"
    const matchMudancaStatus =
        acao.includes("status") || acao.includes("situacao") || acao.includes("fase") || acao.includes("alterou") || acao.includes("mudou");

    return matchConservacao && (matchMudancaStatus || titulo.includes("inicio") || novo.includes("inicio"));
}

/** tenta extrair o nome do usuário do log */
function agenteDoLog(log: any): string {
    const pick = (o: any) =>
        o?.usuario || o?.user || o?.operador || o?.agente || o?.nome || o?.name || "";

    const direct = pick(log);
    if (direct) return String(direct).trim();

    try {
        const det =
            typeof log?.detalhes === "string" ? JSON.parse(log.detalhes) : log?.detalhes;
        const poss = pick(det) || det?.usuario_nome || det?.user_name;
        if (poss) return String(poss).trim();
    } catch { }

    return "";
}

function logDateValue(log: any): number {
    const s = String(log?.datahora || log?.data || log?.created_at || "");
    const d = parseDateFlex(s);
    return d ? d.getTime() : Number.NaN;
}

/**
 * FIX PRINCIPAL:
 * - Antes: pegava o "mais antigo" mesmo que não tivesse agente
 * - Agora: prefere um log com agente preenchido
 * - Se nenhum tiver agente, cai no mais antigo mesmo assim
 */
function findInicioConservacaoLog(logs: any[]): any | null {
    let bestAny: any | null = null;
    let bestWithAgent: any | null = null;

    for (const log of logs || []) {
        if (!isInicioConservacaoStrict(log)) continue;

        const t = logDateValue(log);
        const agent = agenteDoLog(log).trim();

        // bestAny
        if (!bestAny) bestAny = log;
        else {
            const tb = logDateValue(bestAny);
            if (!Number.isNaN(t) && (Number.isNaN(tb) || t < tb)) bestAny = log;
        }

        // bestWithAgent
        if (agent) {
            if (!bestWithAgent) bestWithAgent = log;
            else {
                const tb = logDateValue(bestWithAgent);
                if (!Number.isNaN(t) && (Number.isNaN(tb) || t < tb)) bestWithAgent = log;
            }
        }
    }

    return bestWithAgent || bestAny;
}

/* =========================
   Resolve qual ID usar para buscar logs
   (mesma lógica do antigo)
   ========================= */
function getIdParaLog(r: RegistroAnalise): string {
    const anyR = r as any;
    return String(
        anyR.sepultamento_id ||
        anyR.sepultamentoId ||
        anyR.id_sepultamento ||
        anyR.atendimento_id ||
        anyR.atendimentoId ||
        anyR.id ||
        ""
    ).trim();
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

    // filtro por período
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

    /* ========= Resolve responsável de TANATO *via logs* ========= */
    const respCacheRef = React.useRef<Record<string, string>>({});
    const inFlightRef = React.useRef<Set<string>>(new Set());
    const [respPorId, setRespPorId] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        const idsAlvo = Array.from(
            new Set(
                (dadosPeriodo || [])
                    .filter((r) => normSimNao(String((r as any).tanato || "")) === "sim")
                    .map((r) => getIdParaLog(r))
                    .filter(
                        (id) =>
                            id &&
                            respCacheRef.current[id] === undefined &&
                            !inFlightRef.current.has(id)
                    )
            )
        );

        if (idsAlvo.length === 0) return;

        let cancel = false;

        async function run(maxConc = 4) {
            let i = 0;
            const out: Record<string, string> = {};

            for (const id of idsAlvo) inFlightRef.current.add(id);

            async function worker() {
                while (i < idsAlvo.length && !cancel) {
                    const id = idsAlvo[i++];
                    try {
                        const logs = await listarLogPorId(id);
                        const inicio = findInicioConservacaoLog(logs || []);
                        out[id] = inicio ? agenteDoLog(inicio).trim() : "";
                    } catch {
                        out[id] = "";
                    } finally {
                        inFlightRef.current.delete(id);
                    }
                }
            }

            await Promise.all(
                Array.from({ length: Math.min(maxConc, idsAlvo.length) }, worker)
            );

            if (cancel) return;

            Object.assign(respCacheRef.current, out);
            setRespPorId((prev) => ({ ...prev, ...out }));
        }

        run();

        return () => {
            cancel = true;
        };
    }, [dadosPeriodo]);

    /* =========================
       Agregações (igual ao antigo)
       ========================= */
    const {
        tanatoCount,
        agentesOrdenados,
        tanatoSemResponsavel,
        assistTotal,
        ornNatural,
        ornArtificial,
        qtdArrumacaoFixas,
        convPref,
        convPart,
        convAssoc,
    } = React.useMemo(() => {
        const byKey: Record<string, number> = {};
        const displayByKey: Record<string, string> = {};

        let semResp = 0;
        let assist = 0;
        let ornNat = 0;
        let ornArt = 0;

        const arr: Record<string, number> = Object.fromEntries(
            ARR_KEYS.map((k) => [k, 0])
        ) as Record<string, number>;

        let cPref = 0, cPart = 0, cAssoc = 0;

        for (const r of dadosPeriodo) {
            // TANATO igual ao antigo: só conta se achou agente no log
            if (normSimNao(String((r as any).tanato || "")) === "sim") {
                const id = getIdParaLog(r);
                const nome = (respPorId[id] || "").trim();

                if (nome) {
                    const key = norm(nome);
                    byKey[key] = (byKey[key] || 0) + 1;
                    if (!displayByKey[key]) displayByKey[key] = titleCase(nome);
                } else {
                    // importante: isso mostra exatamente “os que estão faltando”
                    semResp++;
                }
            }

            // ASSISTÊNCIAS
            if (normSimNao(String((r as any).assistencia || "")) === "sim") assist++;

            // ORNAMENTAÇÃO
            const ornTxt = String(
                (r as any).ornamentacao_tipo ||
                (r as any).ornamentacao ||
                (r as any).ornamentacao_tipo_nome ||
                ""
            ).toLowerCase();
            if (ornTxt.includes("natural")) ornNat++;
            else if (ornTxt.includes("artificial")) ornArt++;

            // ARRUMAÇÃO
            const estadosArr = extrairEstadoArrumacao(r);
            for (const k of ARR_KEYS) if (estadosArr[k]) arr[k] = (arr[k] || 0) + 1;

            // CONVÊNIOS
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
            .map(([k, count]) => ({ display: displayByKey[k] || k, count }))
            .sort((a, b) => b.count - a.count);

        const tanatoCount = agentesOrdenados.reduce((s, a) => s + a.count, 0);

        return {
            tanatoCount,
            agentesOrdenados,
            tanatoSemResponsavel: semResp,
            assistTotal: assist,
            ornNatural: ornNat,
            ornArtificial: ornArt,
            qtdArrumacaoFixas: arr,
            convPref: cPref,
            convPart: cPart,
            convAssoc: cAssoc,
        };
    }, [dadosPeriodo, respPorId]);

    const ornTotal = (ornNatural || 0) + (ornArtificial || 0);

    const subTanato = React.useMemo(() => {
        const parts: string[] = [];
        if (agentesOrdenados.length) {
            parts.push(...agentesOrdenados.map((a) => `${a.display}: ${fmt0(a.count)}`));
        }
        if (tanatoSemResponsavel) {
            parts.push(`Sem responsável: ${fmt0(tanatoSemResponsavel)}`);
        }
        return parts.length ? parts.join(" · ") : undefined;
    }, [agentesOrdenados, tanatoSemResponsavel]);

    if (!aberto) return null;

    return (
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
    );
}
