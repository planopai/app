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
    "Convênio": "🤝",
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
   Parsers de Data (precisos)
   ========================= */

/** dd/mm/aaaa[ , HH:MM:SS] → Date (local) */
function parseBrDate(s: string): Date | null {
    const m = s
        .trim()
        .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}

/** ISO → Date (LOCAL se não houver timezone) */
function parseIsoDate(s: string): Date | null {
    const t = s.trim().replace(" ", "T");

    // Apenas data: aaaa-mm-dd → construir como LOCAL 00:00
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }

    // Data + hora sem timezone: construir como LOCAL
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
        const [, yyyy, mm, dd, hh, mi, ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return isNaN(d.getTime()) ? null : d;
    }

    // Demais formatos (com Z ou offset) → delega para Date (já trata timezone)
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

/** Tenta BR, depois ISO. Se falhar, null. */
function parseDateFlex(s?: string | null): Date | null {
    if (!s) return null;
    return parseBrDate(s) || parseIsoDate(s) || null;
}

/** Melhor data do registro (ordem de preferência). */
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

/** Intervalo inclusivo [start,end]. Se informar uma data só, usa "aquele dia". */
function makeRange(
    aDe?: string,
    aAte?: string
): { start: Date | null; end: Date | null } {
    const hasDe = !!aDe;
    const hasAte = !!aAte;

    // se só um foi informado, usa o mesmo dia para ambos
    const deStr = hasDe ? aDe! : hasAte ? aAte! : "";
    const ateStr = hasAte ? aAte! : hasDe ? aDe! : "";

    const start = deStr ? new Date(`${deStr}T00:00:00`) : null;
    const end = ateStr ? new Date(`${ateStr}T23:59:59`) : null;

    // se invertido, corrige
    if (start && end && end < start) {
        // troca e garante fim do dia
        return {
            start: end,
            end: new Date(start.getTime() + 23 * 3600 * 1000 + 59 * 60000 + 59 * 1000),
        };
    }
    return { start, end };
}

/* =========================
   Helpers de Tanatopraxia
   ========================= */

/** Normaliza string simples (lowercase, sem acento) */
function normStr(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/** IDs (opcional) caso o backend salve por id de usuário */
const SANDRO_IDS = new Set<string | number>([
    // ex.: 12, "12"
]);
const JOSEILDO_IDS = new Set<string | number>([
    // ex.: 34, "34"
]);

/** Extrai o nome do campo `usuario` podendo ser string ou objeto */
function pegarNomeDeUsuarioCampo(usuario: any): string {
    if (!usuario) return "";
    if (typeof usuario === "string") return usuario;
    if (typeof usuario === "object") {
        // formatos comuns: { nome }, { name }, { usuario }, { login }, { displayName }
        return (
            usuario.nome ||
            usuario.name ||
            usuario.usuario ||
            usuario.login ||
            usuario.displayName ||
            ""
        );
    }
    return String(usuario || "");
}

/** Busca o responsável pela Tanatopraxia (Sandro/Joseildo) priorizando o campo `usuario` */
function extrairResponsavelTanato(r: RegistroAnalise): "sandro" | "joseildo" | null {
    // 1) Prioriza o campo 'usuario' informado na sua base
    const usuarioBruto =
        (r as any).usuario ??
        (r as any).usuario_nome ??
        (r as any).user ??
        (r as any).operador;
    const usuarioNome = normStr(pegarNomeDeUsuarioCampo(usuarioBruto));

    if (usuarioNome) {
        if (usuarioNome.includes("sandro")) return "sandro";
        // aceita "joséildo" com acento ou sem
        if (usuarioNome.includes("joseildo") || usuarioNome.includes("jose il")) return "joseildo";
    }

    // 2) Se vier id separado, tenta por id:
    const usuarioId =
        (r as any).usuario_id ??
        (r as any).user_id ??
        (r as any).operador_id ??
        (r as any).id_usuario;

    if (usuarioId != null) {
        if (SANDRO_IDS.has(usuarioId)) return "sandro";
        if (JOSEILDO_IDS.has(usuarioId)) return "joseildo";
        const uidStr = String(usuarioId);
        if (SANDRO_IDS.has(uidStr)) return "sandro";
        if (JOSEILDO_IDS.has(uidStr)) return "joseildo";
    }

    // 3) Campos alternativos (fallbacks)
    const candidatos = [
        (r as any).tanato_responsavel,
        (r as any).responsavel_tanato,
        (r as any).conservacao_responsavel,
        (r as any).responsavel_conservacao,
        (r as any).usuario_inicio_conservacao,
        (r as any).usuario_inicio_tanato,
        (r as any).tanato_usuario_inicio,
        (r as any).iniciado_por,
        (r as any).usuario_responsavel,
    ];

    for (const c of candidatos) {
        const v = normStr(String(c || ""));
        if (!v) continue;
        if (v.includes("sandro")) return "sandro";
        if (v.includes("joseildo") || v.includes("jose il")) return "joseildo";
    }
    return null;
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

    // Filtro por período com parser robusto
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

    // Agregações
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
        let tSandro = 0;
        let tJoseildo = 0;
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
                if (resp === "sandro") tSandro++;
                else if (resp === "joseildo") tJoseildo++;
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
            else if (convTxt.includes("associado") || convTxt.includes("associação"))
                cAssoc++;
            else if (convTxt.includes("particular")) cPart++;
        }

        return {
            tanatoCount: tanato,
            tanatoSandro: tSandro,
            tanatoJoseildo: tJoseildo,
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
    const subTanato = `Sandro: ${fmt0(tanatoSandro || 0)} · Joseildo: ${fmt0(tanatoJoseildo || 0)}`;

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
