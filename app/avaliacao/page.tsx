"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = "https://api.planoassistencialintegrado.com.br/visita.php";

type TipoFiltro = "todos" | "visita" | "pos_atendimento";

type ResumoDashboard = {
    atendimentos_total: number;
    atendimentos_com_velorio: number;
    atendimentos_com_sepultamento: number;

    visitas_concluidas: number;
    visitas_pendentes: number;
    visitas_em_andamento: number;
    visitas_nao_aplicaveis: number;

    pos_concluidos: number;
    pos_pendentes: number;
    pos_em_andamento: number;

    cobertura_visita_pct: number | null;
    cobertura_pos_pct: number | null;

    media_visita: number | null;
    media_pos: number | null;

    notas_baixas: number;
    sem_responsavel: number;
};

type PerguntaComparativo = {
    pergunta_codigo: string;
    pergunta_titulo: string;
    ordem: number;

    visita_media: number | null;
    visita_quantidade: number;

    pos_media: number | null;
    pos_quantidade: number;

    diferenca_pos_menos_visita: number | null;
};

type DistribuicaoNota = {
    nota: "1" | "2" | "3" | "4" | "5";
    visita: number;
    pos_atendimento: number;
};

type AvaliadorOpcao = {
    id: number;
    nome: string;
};

type ColaboradorRanking = {
    usuario_id: number | null;
    nome: string;
    cargo?: string | null;

    quantidade_notas: number;
    quantidade_visita: number;
    quantidade_pos: number;

    media_visita: number | null;
    media_pos: number | null;

    por_pergunta?: Array<{
        pergunta_codigo: string;
        pergunta_titulo: string;
        quantidade: number;
        media: number | null;
    }>;
};

type AlertaItem = {
    atendimento_id: number;
    falecido: string;
    tipo_avaliacao: "visita" | "pos_atendimento";
    pergunta_codigo: string;
    pergunta_titulo: string;
    nota: number;
    responsavel_nome?: string | null;
    avaliador_nome?: string | null;
    criado_em?: string | null;
};

type DivergenciaItem = {
    atendimento_id: number;
    falecido: string;
    pergunta_codigo: string;
    pergunta_titulo: string;
    visita_nota: number | null;
    pos_nota: number | null;
    diferenca: number | null;
    responsavel_nome?: string | null;
};

type EvolucaoItem = {
    periodo: string;
    visita_media: number | null;
    pos_media: number | null;
    visitas: number;
    pos: number;
};

type DashboardPayload = {
    sucesso?: boolean;
    periodo?: {
        de?: string;
        ate?: string;
    };
    resumo?: Partial<ResumoDashboard>;
    perguntas?: PerguntaComparativo[];
    distribuicao_notas?: DistribuicaoNota[];
    colaboradores?: ColaboradorRanking[];
    alertas?: AlertaItem[];
    divergencias?: DivergenciaItem[];
    evolucao?: EvolucaoItem[];
    avaliadores?: AvaliadorOpcao[];
};

const PERGUNTAS_LABELS: Record<string, string> = {
    primeiro_atendimento: "Primeiro atendimento",
    remocao: "Remoção",
    preparacao: "Preparação",
    apresentacao_corpo: "Apresentação do corpo",
    cerimonia_horario: "Cerimônia no horário",
    montagem_ambiente: "Montagem do ambiente",
    sepultamento: "Sepultamento",
};

function inicioMesAtual() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
}

function hojeIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function clampNota(v: number | null | undefined) {
    if (v == null || !Number.isFinite(Number(v))) return null;
    return Math.max(0, Math.min(5, Number(v)));
}

function formatarNota(v: number | null | undefined) {
    const n = clampNota(v);
    return n == null ? "—" : n.toFixed(2).replace(".", ",");
}

function formatarPct(v: number | null | undefined) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return `${Number(v).toFixed(1).replace(".", ",")}%`;
}

function formatarDataHora(v?: string | null) {
    if (!v) return "—";

    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(d);
}

function mediaPonderada(
    visita: number | null,
    pos: number | null,
    pesoVisita: number,
    pesoPos: number,
) {
    const v = clampNota(visita);
    const p = clampNota(pos);

    if (v == null && p == null) return null;
    if (v != null && p == null) return v;
    if (v == null && p != null) return p;

    const total = pesoVisita + pesoPos;
    if (total <= 0) return null;

    return ((v as number) * pesoVisita + (p as number) * pesoPos) / total;
}

function classNota(n: number | null | undefined) {
    const v = clampNota(n);

    if (v == null) return "bg-slate-100 text-slate-500 border-slate-200";
    if (v < 2.5) return "bg-red-50 text-red-700 border-red-200";
    if (v < 3.5) return "bg-amber-50 text-amber-700 border-amber-200";
    if (v < 4.2) return "bg-blue-50 text-blue-700 border-blue-200";

    return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function Card({
    titulo,
    valor,
    subtitulo,
    destaque,
}: {
    titulo: string;
    valor: React.ReactNode;
    subtitulo?: string;
    destaque?: "normal" | "bom" | "atencao" | "ruim";
}) {
    const borda =
        destaque === "bom"
            ? "border-emerald-200"
            : destaque === "atencao"
                ? "border-amber-200"
                : destaque === "ruim"
                    ? "border-red-200"
                    : "border-slate-200";

    return (
        <div className={`rounded-2xl border ${borda} bg-white p-4 shadow-sm`}>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {titulo}
            </div>

            <div className="mt-2 text-2xl font-semibold text-slate-950">
                {valor}
            </div>

            {subtitulo ? (
                <div className="mt-1 text-xs text-slate-500">{subtitulo}</div>
            ) : null}
        </div>
    );
}

function BarraNota({
    valor,
    label,
}: {
    valor: number | null;
    label: string;
}) {
    const pct = valor == null ? 0 : Math.max(0, Math.min(100, (valor / 5) * 100));

    return (
        <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600">{label}</span>
                <strong className="text-slate-900">{formatarNota(valor)}</strong>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-slate-800 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function Secao({
    titulo,
    descricao,
    children,
    right,
}: {
    titulo: string;
    descricao?: string;
    children: React.ReactNode;
    right?: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">{titulo}</h2>
                    {descricao ? (
                        <p className="mt-1 text-sm text-slate-500">{descricao}</p>
                    ) : null}
                </div>

                {right}
            </div>

            <div className="p-5">{children}</div>
        </section>
    );
}

function emptyResumo(): ResumoDashboard {
    return {
        atendimentos_total: 0,
        atendimentos_com_velorio: 0,
        atendimentos_com_sepultamento: 0,

        visitas_concluidas: 0,
        visitas_pendentes: 0,
        visitas_em_andamento: 0,
        visitas_nao_aplicaveis: 0,

        pos_concluidos: 0,
        pos_pendentes: 0,
        pos_em_andamento: 0,

        cobertura_visita_pct: null,
        cobertura_pos_pct: null,

        media_visita: null,
        media_pos: null,

        notas_baixas: 0,
        sem_responsavel: 0,
    };
}

export default function Page() {
    const [dataDe, setDataDe] = useState(inicioMesAtual);
    const [dataAte, setDataAte] = useState(hojeIso);

    const [tipo, setTipo] = useState<TipoFiltro>("todos");
    const [avaliadorId, setAvaliadorId] = useState("");

    const [pesoVisita, setPesoVisita] = useState(50);
    const pesoPos = 100 - pesoVisita;

    const [dados, setDados] = useState<DashboardPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");

        try {
            const params = new URLSearchParams({
                action: "dashboard",
                data_de: dataDe,
                data_ate: dataAte,
                tipo,
            });

            if (avaliadorId) {
                params.set("avaliador_id", avaliadorId);
            }

            const res = await fetch(`${API_URL}?${params.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const json = (await res.json().catch(() => null)) as
                | DashboardPayload
                | null;

            if (!res.ok || !json) {
                throw new Error(
                    (json as any)?.msg ||
                    `Falha ao carregar dashboard (${res.status}).`,
                );
            }

            setDados(json);
        } catch (e: any) {
            setErro(
                e?.message ||
                "Não foi possível carregar a dashboard de avaliações.",
            );
            setDados(null);
        } finally {
            setLoading(false);
        }
    }, [dataDe, dataAte, tipo, avaliadorId]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const resumo = useMemo<ResumoDashboard>(
        () => ({
            ...emptyResumo(),
            ...(dados?.resumo ?? {}),
        }),
        [dados],
    );

    const colaboradores = useMemo(() => {
        const arr = [...(dados?.colaboradores ?? [])];

        return arr
            .map((item) => ({
                ...item,
                media_consolidada: mediaPonderada(
                    item.media_visita,
                    item.media_pos,
                    pesoVisita,
                    pesoPos,
                ),
            }))
            .sort((a, b) => {
                const ma = a.media_consolidada ?? -1;
                const mb = b.media_consolidada ?? -1;

                if (mb !== ma) return mb - ma;
                return b.quantidade_notas - a.quantidade_notas;
            });
    }, [dados, pesoVisita, pesoPos]);

    const comparativos = dados?.perguntas ?? [];
    const distribuicao = dados?.distribuicao_notas ?? [];
    const alertas = dados?.alertas ?? [];
    const divergencias = dados?.divergencias ?? [];
    const evolucao = dados?.evolucao ?? [];

    const totalNotasDistribuicao = useMemo(
        () =>
            distribuicao.reduce(
                (acc, item) => acc + Number(item.visita || 0) + Number(item.pos_atendimento || 0),
                0,
            ),
        [distribuicao],
    );

    const pesoLabel = `${pesoVisita}% Visita / ${pesoPos}% Pós`;

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                            Dashboard de Avaliações
                        </h1>

                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Visão consolidada de Visita, Pós-Atendimento, notas por etapa,
                            cobertura das avaliações e desempenho dos colaboradores.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => void carregar()}
                        disabled={loading}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                        {loading ? "Atualizando..." : "Atualizar"}
                    </button>
                </header>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                                Data inicial
                            </span>
                            <input
                                type="date"
                                value={dataDe}
                                onChange={(e) => setDataDe(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                                Data final
                            </span>
                            <input
                                type="date"
                                value={dataAte}
                                onChange={(e) => setDataAte(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                                Tipo de avaliação
                            </span>
                            <select
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value as TipoFiltro)}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            >
                                <option value="todos">Visita + Pós</option>
                                <option value="visita">Somente Visita</option>
                                <option value="pos_atendimento">
                                    Somente Pós-Atendimento
                                </option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                                Avaliador
                            </span>
                            <select
                                value={avaliadorId}
                                onChange={(e) => setAvaliadorId(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                            >
                                <option value="">Todos</option>

                                {(dados?.avaliadores ?? []).map((item) => (
                                    <option key={item.id} value={String(item.id)}>
                                        {item.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-slate-600">
                                Peso consolidado
                            </span>

                            <div className="mt-1 rounded-xl border border-slate-300 px-3 py-2">
                                <div className="mb-1 flex items-center justify-between text-xs">
                                    <span>Visita</span>
                                    <strong>{pesoLabel}</strong>
                                </div>

                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={pesoVisita}
                                    onChange={(e) =>
                                        setPesoVisita(Number(e.target.value))
                                    }
                                    className="w-full"
                                />
                            </div>
                        </label>
                    </div>
                </section>

                {erro ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <strong>Não foi possível carregar os indicadores.</strong>
                        <div className="mt-1">{erro}</div>
                        <div className="mt-2 text-xs">
                            Esta página utiliza{" "}
                            <code>visita.php?action=dashboard</code>. O endpoint precisa
                            estar disponível no backend.
                        </div>
                    </div>
                ) : null}

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                    <Card
                        titulo="Atendimentos"
                        valor={resumo.atendimentos_total}
                        subtitulo={`${resumo.atendimentos_com_velorio} com velório`}
                    />

                    <Card
                        titulo="Visitas concluídas"
                        valor={resumo.visitas_concluidas}
                        subtitulo={`${resumo.visitas_pendentes} pendentes`}
                    />

                    <Card
                        titulo="Pós concluídos"
                        valor={resumo.pos_concluidos}
                        subtitulo={`${resumo.pos_pendentes} pendentes`}
                    />

                    <Card
                        titulo="Cobertura Visita"
                        valor={formatarPct(resumo.cobertura_visita_pct)}
                        destaque={
                            (resumo.cobertura_visita_pct ?? 100) < 80
                                ? "atencao"
                                : "bom"
                        }
                    />

                    <Card
                        titulo="Cobertura Pós"
                        valor={formatarPct(resumo.cobertura_pos_pct)}
                        destaque={
                            (resumo.cobertura_pos_pct ?? 100) < 80
                                ? "atencao"
                                : "bom"
                        }
                    />

                    <Card
                        titulo="Sem responsável"
                        valor={resumo.sem_responsavel}
                        subtitulo="notas sem autoria identificada"
                        destaque={resumo.sem_responsavel > 0 ? "atencao" : "bom"}
                    />

                    <Card
                        titulo="Média Visita"
                        valor={formatarNota(resumo.media_visita)}
                    />

                    <Card
                        titulo="Média Pós"
                        valor={formatarNota(resumo.media_pos)}
                    />

                    <Card
                        titulo="Notas 1 ou 2"
                        valor={resumo.notas_baixas}
                        destaque={resumo.notas_baixas > 0 ? "ruim" : "bom"}
                    />

                    <Card
                        titulo="Visitas em andamento"
                        valor={resumo.visitas_em_andamento}
                    />

                    <Card
                        titulo="Pós em andamento"
                        valor={resumo.pos_em_andamento}
                    />

                    <Card
                        titulo="Com sepultamento"
                        valor={resumo.atendimentos_com_sepultamento}
                    />
                </section>

                <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                    <Secao
                        titulo="Visita × Pós-Atendimento por etapa"
                        descricao="Compara a percepção durante a cerimônia com a avaliação posterior."
                    >
                        {comparativos.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">
                                Nenhuma nota disponível no período.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {comparativos.map((item) => {
                                    const titulo =
                                        item.pergunta_titulo ||
                                        PERGUNTAS_LABELS[item.pergunta_codigo] ||
                                        item.pergunta_codigo;

                                    const diff =
                                        item.diferenca_pos_menos_visita ??
                                        (item.visita_media != null &&
                                            item.pos_media != null
                                            ? item.pos_media - item.visita_media
                                            : null);

                                    return (
                                        <div
                                            key={item.pergunta_codigo}
                                            className="rounded-xl border border-slate-200 p-4"
                                        >
                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-medium text-slate-900">
                                                        {titulo}
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        {item.visita_quantidade} notas de
                                                        Visita · {item.pos_quantidade} notas
                                                        de Pós
                                                    </div>
                                                </div>

                                                <div
                                                    className={[
                                                        "rounded-full border px-2.5 py-1 text-xs font-semibold",
                                                        diff == null
                                                            ? "border-slate-200 bg-slate-50 text-slate-500"
                                                            : diff < -0.5
                                                                ? "border-red-200 bg-red-50 text-red-700"
                                                                : diff > 0.5
                                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                    : "border-slate-200 bg-slate-50 text-slate-700",
                                                    ].join(" ")}
                                                >
                                                    Δ{" "}
                                                    {diff == null
                                                        ? "—"
                                                        : `${diff > 0 ? "+" : ""}${diff
                                                            .toFixed(2)
                                                            .replace(".", ",")}`}
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <BarraNota
                                                    label="Visita"
                                                    valor={item.visita_media}
                                                />
                                                <BarraNota
                                                    label="Pós-Atendimento"
                                                    valor={item.pos_media}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Secao>

                    <Secao
                        titulo="Distribuição das notas"
                        descricao="“Não sei” não entra nas médias nem nesta distribuição numérica."
                    >
                        {distribuicao.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">
                                Sem distribuição disponível.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {distribuicao.map((item) => {
                                    const total =
                                        Number(item.visita || 0) +
                                        Number(item.pos_atendimento || 0);

                                    const pct =
                                        totalNotasDistribuicao > 0
                                            ? (total / totalNotasDistribuicao) *
                                            100
                                            : 0;

                                    return (
                                        <div key={item.nota}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <span className="font-medium text-slate-800">
                                                    Nota {item.nota}
                                                </span>
                                                <span className="text-slate-500">
                                                    {total}
                                                </span>
                                            </div>

                                            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full bg-slate-800"
                                                    style={{
                                                        width: `${Math.max(
                                                            0,
                                                            Math.min(100, pct),
                                                        )}%`,
                                                    }}
                                                />
                                            </div>

                                            <div className="mt-1 flex gap-4 text-xs text-slate-500">
                                                <span>
                                                    Visita: {item.visita}
                                                </span>
                                                <span>
                                                    Pós: {item.pos_atendimento}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Secao>
                </div>

                <Secao
                    titulo="Desempenho por colaborador"
                    descricao={`Nota consolidada usando ${pesoLabel}. Quando existe apenas uma origem, usa-se a média disponível.`}
                >
                    {colaboradores.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">
                            Nenhuma nota atribuída a colaboradores no período.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="px-3 py-3">Colaborador</th>
                                        <th className="px-3 py-3 text-center">
                                            Notas
                                        </th>
                                        <th className="px-3 py-3 text-center">
                                            Visita
                                        </th>
                                        <th className="px-3 py-3 text-center">
                                            Pós
                                        </th>
                                        <th className="px-3 py-3 text-center">
                                            Consolidada
                                        </th>
                                        <th className="px-3 py-3">Amostra</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {colaboradores.map((item) => (
                                        <tr
                                            key={`${item.usuario_id ?? "sem-id"}-${item.nome}`}
                                            className="border-b border-slate-100 last:border-b-0"
                                        >
                                            <td className="px-3 py-3">
                                                <div className="font-medium text-slate-900">
                                                    {item.nome || "Não identificado"}
                                                </div>
                                                {item.cargo ? (
                                                    <div className="text-xs text-slate-500">
                                                        {item.cargo}
                                                    </div>
                                                ) : null}
                                            </td>

                                            <td className="px-3 py-3 text-center">
                                                {item.quantidade_notas}
                                            </td>

                                            <td className="px-3 py-3 text-center">
                                                <span
                                                    className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1 font-semibold ${classNota(
                                                        item.media_visita,
                                                    )}`}
                                                >
                                                    {formatarNota(
                                                        item.media_visita,
                                                    )}
                                                </span>
                                            </td>

                                            <td className="px-3 py-3 text-center">
                                                <span
                                                    className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1 font-semibold ${classNota(
                                                        item.media_pos,
                                                    )}`}
                                                >
                                                    {formatarNota(item.media_pos)}
                                                </span>
                                            </td>

                                            <td className="px-3 py-3 text-center">
                                                <span
                                                    className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1 font-semibold ${classNota(
                                                        item.media_consolidada,
                                                    )}`}
                                                >
                                                    {formatarNota(
                                                        item.media_consolidada,
                                                    )}
                                                </span>
                                            </td>

                                            <td className="px-3 py-3 text-xs text-slate-500">
                                                {item.quantidade_visita} Visita ·{" "}
                                                {item.quantidade_pos} Pós
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Secao>

                <div className="grid gap-5 xl:grid-cols-2">
                    <Secao
                        titulo="Maiores divergências"
                        descricao="Atendimentos em que Visita e Pós apresentaram maior diferença para a mesma etapa."
                    >
                        {divergencias.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">
                                Nenhuma divergência disponível.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {divergencias.slice(0, 12).map((item) => (
                                    <div
                                        key={`${item.atendimento_id}-${item.pergunta_codigo}`}
                                        className="rounded-xl border border-slate-200 p-3"
                                    >
                                        <div className="flex flex-wrap justify-between gap-2">
                                            <div>
                                                <div className="font-medium text-slate-900">
                                                    {item.falecido}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {item.pergunta_titulo ||
                                                        PERGUNTAS_LABELS[
                                                        item.pergunta_codigo
                                                        ] ||
                                                        item.pergunta_codigo}
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="text-sm font-semibold text-slate-900">
                                                    Δ{" "}
                                                    {item.diferenca == null
                                                        ? "—"
                                                        : `${item.diferenca > 0 ? "+" : ""}${item.diferenca
                                                            .toFixed(2)
                                                            .replace(".", ",")}`}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Visita{" "}
                                                    {formatarNota(item.visita_nota)} ·
                                                    Pós {formatarNota(item.pos_nota)}
                                                </div>
                                            </div>
                                        </div>

                                        {item.responsavel_nome ? (
                                            <div className="mt-2 text-xs text-slate-500">
                                                Responsável:{" "}
                                                <strong>
                                                    {item.responsavel_nome}
                                                </strong>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Secao>

                    <Secao
                        titulo="Notas de atenção"
                        descricao="Ocorrências com nota 1 ou 2 para acompanhamento."
                    >
                        {alertas.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-500">
                                Nenhuma nota baixa no período.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {alertas.slice(0, 15).map((item, index) => (
                                    <div
                                        key={`${item.atendimento_id}-${item.pergunta_codigo}-${index}`}
                                        className="rounded-xl border border-red-100 bg-red-50/40 p-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-medium text-slate-900">
                                                    {item.falecido}
                                                </div>
                                                <div className="mt-0.5 text-xs text-slate-500">
                                                    {item.tipo_avaliacao === "visita"
                                                        ? "Visita"
                                                        : "Pós-Atendimento"}{" "}
                                                    ·{" "}
                                                    {item.pergunta_titulo ||
                                                        PERGUNTAS_LABELS[
                                                        item.pergunta_codigo
                                                        ] ||
                                                        item.pergunta_codigo}
                                                </div>
                                            </div>

                                            <span className="rounded-lg border border-red-200 bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-700">
                                                {item.nota}
                                            </span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                            {item.responsavel_nome ? (
                                                <span>
                                                    Responsável:{" "}
                                                    <strong>
                                                        {item.responsavel_nome}
                                                    </strong>
                                                </span>
                                            ) : (
                                                <span className="text-amber-700">
                                                    Responsável não identificado
                                                </span>
                                            )}

                                            {item.avaliador_nome ? (
                                                <span>
                                                    Avaliador:{" "}
                                                    {item.avaliador_nome}
                                                </span>
                                            ) : null}

                                            {item.criado_em ? (
                                                <span>
                                                    {formatarDataHora(
                                                        item.criado_em,
                                                    )}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Secao>
                </div>

                <Secao
                    titulo="Evolução das médias"
                    descricao="Acompanhamento temporal de Visita e Pós-Atendimento."
                >
                    {evolucao.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">
                            Nenhuma série temporal disponível.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="flex min-w-[720px] items-end gap-4">
                                {evolucao.map((item) => {
                                    const v = clampNota(item.visita_media);
                                    const p = clampNota(item.pos_media);

                                    return (
                                        <div
                                            key={item.periodo}
                                            className="min-w-[90px] flex-1"
                                        >
                                            <div className="flex h-44 items-end justify-center gap-2 rounded-xl bg-slate-50 p-3">
                                                <div
                                                    title={`Visita: ${formatarNota(
                                                        v,
                                                    )}`}
                                                    className="w-5 rounded-t bg-slate-900"
                                                    style={{
                                                        height: `${v == null
                                                                ? 0
                                                                : (v / 5) * 100
                                                            }%`,
                                                    }}
                                                />
                                                <div
                                                    title={`Pós: ${formatarNota(
                                                        p,
                                                    )}`}
                                                    className="w-5 rounded-t bg-slate-400"
                                                    style={{
                                                        height: `${p == null
                                                                ? 0
                                                                : (p / 5) * 100
                                                            }%`,
                                                    }}
                                                />
                                            </div>

                                            <div className="mt-2 text-center text-xs font-medium text-slate-700">
                                                {item.periodo}
                                            </div>
                                            <div className="mt-0.5 text-center text-[11px] text-slate-500">
                                                V {item.visitas} · P {item.pos}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex items-center gap-5 text-xs text-slate-500">
                                <span className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded bg-slate-900" />
                                    Visita
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded bg-slate-400" />
                                    Pós-Atendimento
                                </span>
                            </div>
                        </div>
                    )}
                </Secao>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
                    <strong className="text-slate-700">Regra de cálculo:</strong>{" "}
                    respostas “Não sei” e perguntas não aplicáveis não entram nas médias.
                    A nota consolidada por colaborador nesta página usa o peso configurado
                    no filtro acima e sempre exibe a quantidade de notas que compõe a
                    amostra.
                </div>
            </div>
        </main>
    );
}
