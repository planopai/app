"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

/**
 * QUADRO TV — versão standalone
 *
 * Esta página é totalmente standalone e não depende de arquivos locais auxiliares.
 * Foi feita para ser usada diretamente em:
 *   app/quadrotv/page.tsx
 *
 * Exibe:
 * - atendimentos funerários visíveis no quadro;
 * - pedidos de Coroas de Flores em confecção;
 * - atualização automática;
 * - mantém os últimos dados em caso de falha de rede;
 * - reduz automaticamente fonte/espaçamento apenas quando o conteúdo
 *   começaria a ultrapassar a altura da TV.
 */

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const ATENDIMENTOS_API = `${API_BASE}/informativo.php?listar=1`;
const COROAS_API =
    `${API_BASE}/coroas.php?listar=1&grupo=confeccao&page=1&per_page=100`;

const REFRESH_MS = 10_000;
const FETCH_TIMEOUT_MS = 8_000;

/* =========================================================
   TIPOS
   ========================================================= */

type Id = string | number;

type Atendimento = {
    id?: Id | null;
    status?: string | null;
    falecido?: string | null;
    nome_falecido?: string | null;
    falecido_nome?: string | null;
    nome_do_falecido?: string | null;

    agente?: string | null;
    agente_nome?: string | null;
    nome_agente?: string | null;
    atendente?: string | null;
    usuario?: string | null;
    criado_por?: string | null;

    assistencia?: string | null;
    tanato?: string | null;
    ornamentacao?: string | null;
    tipo_atendimento?: string | null;

    [key: string]: unknown;
};

type CoroaItem = {
    id?: number | null;
    modelo_coroa?: string | null;
};

type CoroaPedido = {
    id: number;
    solicitante?: string | null;
    falecido?: string | null;
    status?: string | null;
    origem?: string | null;
    quantidade_coroas?: number | null;
    modelo_coroa?: string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
    itens?: CoroaItem[] | null;
};

type CoroasResponse = {
    sucesso?: boolean;
    dados?: CoroaPedido[];
    msg?: string;
    erro?: boolean | string;
};

type Density = "normal" | "compact" | "dense" | "ultra";

type NetworkState = {
    ok: boolean;
    message: string | null;
    updatedAt: Date | null;
};

/* =========================================================
   HELPERS — ATENDIMENTOS
   ========================================================= */

function texto(v: unknown): string {
    return String(v ?? "").trim();
}

function semAcento(v: unknown): string {
    return texto(v)
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isNao(v: unknown): boolean {
    const s = semAcento(v);
    return s === "nao" || s === "n" || s === "0" || s === "false";
}

function isSim(v: unknown): boolean {
    const s = semAcento(v);
    return s === "sim" || s === "s" || s === "1" || s === "true";
}

function normalizeStatus(v: unknown): string {
    const raw = semAcento(v);
    if (!raw) return "";

    if (raw.startsWith("fase")) {
        const numero = raw.replace(/\D+/g, "");
        return numero ? `fase${numero.padStart(2, "0")}` : raw;
    }

    const map: Record<string, string> = {
        removendo: "fase01",
        "corpo na clinica": "fase02",
        "aguardando procedimento": "fase02",
        preparando: "fase03",
        "aguardando ornamentacao": "fase04",
        ornamentando: "fase05",
        "corpo pronto": "fase06",
        transportando: "fase07",
        velando: "fase08",
        sepultando: "fase09",
        "sepultamento concluido": "fase10",
        "material recolhido": "fase11",
        concluido: "fase11",
    };

    return map[raw] || raw;
}

function statusLabel(status: unknown): string {
    const s = normalizeStatus(status);

    const labels: Record<string, string> = {
        fase00: "Falecido",
        fase01: "Removendo",
        fase02: "Corpo na Clínica",
        fase03: "Preparando",
        fase04: "Aguardando Ornamentação",
        fase05: "Ornamentando",
        fase06: "Corpo Pronto",
        fase07: "Transportando",
        fase08: "Velando",
        fase09: "Sepultando",
        fase10: "Sepultamento Concluído",
        fase11: "Material Recolhido",
        falecido: "Falecido",
        concluido: "Concluído",
    };

    if (labels[s]) return labels[s];

    const original = texto(status);
    if (!original) return "—";

    return original
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: unknown): string {
    const s = normalizeStatus(status);

    const classes: Record<string, string> = {
        fase00: "bg-slate-300 text-slate-900",
        fase01: "bg-blue-100 text-blue-800",
        fase02: "bg-green-100 text-green-800",
        fase03: "bg-yellow-100 text-yellow-900",
        fase04: "bg-amber-100 text-amber-900",
        fase05: "bg-purple-100 text-purple-800",
        fase06: "bg-indigo-100 text-indigo-800",
        fase07: "bg-cyan-100 text-cyan-800",
        fase08: "bg-pink-100 text-pink-800",
        fase09: "bg-teal-100 text-teal-800",
        fase10: "bg-slate-200 text-slate-900",
        fase11: "bg-slate-300 text-slate-900",
        falecido: "bg-red-600 text-white",
        concluido: "bg-emerald-600 text-white",
    };

    return classes[s] || "bg-muted text-foreground";
}

function isTerceiro(r: Atendimento): boolean {
    if (semAcento(r.tipo_atendimento) === "terceiro") return true;

    // Mesma heurística do quadro operacional existente.
    return isNao(r.assistencia) && isNao(r.tanato) && isNao(r.ornamentacao);
}

function atendimentoVisivel(r: Atendimento): boolean {
    const status = normalizeStatus(r.status);

    // Regras do quadro:
    // - fase11 nunca aparece;
    // - terceiro sai na fase10;
    // - funerário sem assistência sai na fase10;
    // - funerário com assistência permanece na fase10 e sai na fase11.
    if (status === "fase11") return false;

    if (isTerceiro(r)) {
        return status !== "fase10";
    }

    if (!isSim(r.assistencia)) {
        return status !== "fase10";
    }

    return true;
}

function nomeFalecido(r: Atendimento): string {
    return (
        texto(r.falecido) ||
        texto(r.nome_falecido) ||
        texto(r.falecido_nome) ||
        texto(r.nome_do_falecido) ||
        "—"
    );
}

function nomeAgente(r: Atendimento): string {
    // Mantém compatibilidade com possíveis nomes de coluna do PHP.
    const candidatos: unknown[] = [
        r.agente,
        r.agente_nome,
        r.nome_agente,
        r.atendente,
        r.usuario,
        r.criado_por,
        r["agente_funeral"],
        r["agente_responsavel"],
        r["responsavel_atendimento"],
    ];

    for (const candidato of candidatos) {
        const nome = texto(candidato);
        if (nome) return nome;
    }

    return "—";
}

/* =========================================================
   HELPERS — COROAS
   ========================================================= */

function coroaStatusLabel(status: unknown): string {
    const s = semAcento(status);

    if (s === "novo") return "Novo Pedido";
    if (s === "coroa") return "Confeccionando Coroa";
    if (s === "faixa") return "Confeccionando Faixa";

    return texto(status) || "Em Confecção";
}

function coroaStatusClass(status: unknown): string {
    const s = semAcento(status);

    if (s === "novo") {
        return "border-slate-200 bg-slate-100 text-slate-800";
    }

    if (s === "coroa") {
        return "border-blue-200 bg-blue-100 text-blue-800";
    }

    if (s === "faixa") {
        return "border-violet-200 bg-violet-100 text-violet-800";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
}

function coroaQuantidade(order: CoroaPedido): number {
    const qtd = Number(order.quantidade_coroas ?? 0);

    if (Number.isFinite(qtd) && qtd > 0) {
        return Math.floor(qtd);
    }

    if (Array.isArray(order.itens) && order.itens.length > 0) {
        return order.itens.length;
    }

    return 1;
}

function coroaModelos(order: CoroaPedido): string {
    if (Array.isArray(order.itens)) {
        const modelos = order.itens
            .map((item) => texto(item?.modelo_coroa))
            .filter(Boolean);

        if (modelos.length === 1) return modelos[0];
        if (modelos.length > 1) return `${modelos[0]} +${modelos.length - 1}`;
    }

    return texto(order.modelo_coroa) || "—";
}

function coroaOrigemLabel(origem: unknown): string {
    const s = semAcento(origem).replace(/\s+/g, "_");

    if (s === "ordem_servico") return "Ordem de Serviço";
    if (s === "venda_direta") return "Venda Direta";

    if (
        s === "venda_direta_colaborador" ||
        s === "venda_direta_escritorio" ||
        s === "venda_direta_memorial"
    ) {
        return "Venda Direta";
    }

    if (
        s === "loja-online" ||
        s === "loja_online" ||
        s === "loja-online"
    ) {
        return "Loja-Online";
    }

    return texto(origem) || "—";
}

/* =========================================================
   FETCH ROBUSTO
   ========================================================= */

async function fetchJson<T>(
    url: string,
    options?: {
        credentials?: RequestCredentials;
        retries?: number;
    },
): Promise<T> {
    const retries = Math.max(0, options?.retries ?? 1);
    let ultimoErro: unknown = null;

    for (let tentativa = 0; tentativa <= retries; tentativa += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(
            () => controller.abort(),
            FETCH_TIMEOUT_MS,
        );

        try {
            const response = await fetch(url, {
                method: "GET",
                credentials: options?.credentials ?? "include",
                cache: "no-cache",
                headers: {
                    Accept: "application/json",
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return (await response.json()) as T;
        } catch (error: unknown) {
            ultimoErro = error;

            const abortado =
                error instanceof DOMException && error.name === "AbortError";

            // Uma segunda tentativa curta ajuda em oscilações ocasionais
            // sem gerar várias chamadas em paralelo.
            if (tentativa < retries) {
                await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, abortado ? 250 : 450);
                });
            }
        } finally {
            window.clearTimeout(timeout);
        }
    }

    if (ultimoErro instanceof Error) {
        throw ultimoErro;
    }

    throw new Error("Falha ao consultar o servidor.");
}

/* =========================================================
   COMPONENTE: ATENDIMENTOS
   ========================================================= */

function QuadroAtendimentos({
    registros,
}: {
    registros: Atendimento[];
}) {
    return (
        <section className="atendimentos-quadro overflow-hidden rounded-xl border bg-background">
            <div className="quadro-section-header flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                    <h2 className="quadro-title text-base font-semibold">
                        Atendimentos
                    </h2>

                    <span className="quadro-count inline-flex min-w-6 items-center justify-center rounded-full border bg-background px-2 py-0.5 text-xs font-semibold">
                        {registros.length}
                    </span>
                </div>
            </div>

            <div className="overflow-hidden">
                <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="status-col w-[28%] px-3 py-2 text-left font-semibold">
                                Status
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">
                                Falecido(a)
                            </th>
                            <th className="agente-col w-[26%] px-3 py-2 text-left font-semibold">
                                Agente
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {registros.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={3}
                                    className="px-3 py-6 text-center text-muted-foreground"
                                >
                                    Nenhum atendimento no quadro.
                                </td>
                            </tr>
                        ) : (
                            registros.map((registro, index) => (
                                <tr
                                    key={String(registro.id ?? `atendimento-${index}`)}
                                    className="border-t"
                                >
                                    <td className="px-3 py-2">
                                        <span
                                            className={`status-badge inline-flex max-w-full rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                                                registro.status,
                                            )}`}
                                        >
                                            <span className="truncate">
                                                {statusLabel(registro.status)}
                                            </span>
                                        </span>
                                    </td>

                                    <td className="min-w-0 px-3 py-2">
                                        <div className="truncate font-medium">
                                            {nomeFalecido(registro)}
                                        </div>
                                    </td>

                                    <td className="min-w-0 px-3 py-2">
                                        <div className="truncate">
                                            {nomeAgente(registro)}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/* =========================================================
   COMPONENTE: COROAS
   ========================================================= */

function QuadroCoroas({
    pedidos,
}: {
    pedidos: CoroaPedido[];
}) {
    return (
        <section className="coroas-quadro mt-6 overflow-hidden rounded-xl border bg-background">
            <div className="quadro-section-header flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="quadro-title truncate text-base font-semibold">
                        Coroas de Flores em Confecção
                    </h2>

                    <span className="quadro-count inline-flex min-w-6 shrink-0 items-center justify-center rounded-full border bg-background px-2 py-0.5 text-xs font-semibold">
                        {pedidos.length}
                    </span>
                </div>
            </div>

            <div className="overflow-hidden">
                <table className="w-full table-fixed text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="coroa-status-col w-[24%] px-3 py-2 text-left font-semibold">
                                Status
                            </th>
                            <th className="w-[24%] px-3 py-2 text-left font-semibold">
                                Solicitante
                            </th>
                            <th className="w-[23%] px-3 py-2 text-left font-semibold">
                                Falecido(a)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold">
                                Coroa(s)
                            </th>
                            <th className="coroa-origem-col w-[16%] px-3 py-2 text-left font-semibold">
                                Origem
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {pedidos.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-3 py-6 text-center text-muted-foreground"
                                >
                                    Nenhuma coroa em confecção no momento.
                                </td>
                            </tr>
                        ) : (
                            pedidos.map((pedido) => {
                                const qtd = coroaQuantidade(pedido);

                                return (
                                    <tr key={pedido.id} className="border-t">
                                        <td className="px-3 py-2">
                                            <span
                                                className={`status-badge inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-medium ${coroaStatusClass(
                                                    pedido.status,
                                                )}`}
                                            >
                                                <span className="truncate">
                                                    {coroaStatusLabel(pedido.status)}
                                                </span>
                                            </span>
                                        </td>

                                        <td className="min-w-0 px-3 py-2">
                                            <div className="truncate font-medium">
                                                {texto(pedido.solicitante) || "—"}
                                            </div>
                                        </td>

                                        <td className="min-w-0 px-3 py-2">
                                            <div className="truncate">
                                                {texto(pedido.falecido) || "—"}
                                            </div>
                                        </td>

                                        <td className="min-w-0 px-3 py-2">
                                            <div className="truncate font-medium">
                                                {qtd} {qtd === 1 ? "coroa" : "coroas"}
                                            </div>
                                            <div className="secondary-line mt-0.5 truncate text-xs text-muted-foreground">
                                                {coroaModelos(pedido)}
                                            </div>
                                        </td>

                                        <td className="min-w-0 px-3 py-2">
                                            <div className="truncate">
                                                {coroaOrigemLabel(pedido.origem)}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/* =========================================================
   PÁGINA
   ========================================================= */

export default function QuadroTvPage() {
    const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
    const [coroas, setCoroas] = useState<CoroaPedido[]>([]);

    const [network, setNetwork] = useState<NetworkState>({
        ok: true,
        message: null,
        updatedAt: null,
    });

    const [density, setDensity] = useState<Density>("normal");

    const dashboardRef = useRef<HTMLDivElement | null>(null);
    const refreshInFlightRef = useRef(false);
    const mountedRef = useRef(true);

    const atendimentosVisiveis = useMemo(() => {
        return atendimentos.filter(atendimentoVisivel);
    }, [atendimentos]);

    const carregarTudo = useCallback(async () => {
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;

        try {
            const [atendimentosResult, coroasResult] = await Promise.allSettled([
                fetchJson<unknown[]>(ATENDIMENTOS_API, {
                    credentials: "include",
                    retries: 1,
                }),
                fetchJson<CoroasResponse>(COROAS_API, {
                    credentials: "include",
                    retries: 1,
                }),
            ]);

            if (!mountedRef.current) return;

            let algumSucesso = false;
            const erros: string[] = [];

            if (atendimentosResult.status === "fulfilled") {
                const lista = Array.isArray(atendimentosResult.value)
                    ? atendimentosResult.value
                    : [];

                const normalizados: Atendimento[] = lista
                    .filter(
                        (item): item is Record<string, unknown> =>
                            typeof item === "object" && item !== null,
                    )
                    .map((item) => ({
                        ...item,
                        id:
                            item.id === null || item.id === undefined
                                ? undefined
                                : String(item.id),
                        status: texto(item.status),
                        falecido: texto(item.falecido),
                        assistencia: texto(item.assistencia),
                        tanato: texto(item.tanato),
                        ornamentacao: texto(item.ornamentacao),
                        tipo_atendimento: texto(item.tipo_atendimento),
                    }));

                setAtendimentos(normalizados);
                algumSucesso = true;
            } else {
                erros.push("atendimentos");
            }

            if (coroasResult.status === "fulfilled") {
                const json = coroasResult.value;

                if (json?.sucesso && Array.isArray(json.dados)) {
                    // O PHP grupo=confeccao já retorna produção.
                    // Mantemos um filtro adicional para que finalizada/entregue
                    // nunca permaneçam na tela caso o backend retorne algo inesperado.
                    const emConfeccao = json.dados.filter((pedido) => {
                        const status = semAcento(pedido.status);

                        return (
                            ["novo", "coroa", "faixa"].includes(status) &&
                            status !== "finalizada" &&
                            status !== "entregue"
                        );
                    });

                    setCoroas(emConfeccao);
                    algumSucesso = true;
                } else {
                    erros.push("coroas");
                }
            } else {
                erros.push("coroas");
            }

            setNetwork((anterior) => ({
                ok: erros.length === 0,
                message:
                    erros.length === 0
                        ? null
                        : `Falha temporária ao atualizar: ${erros.join(" e ")}.`,
                updatedAt: algumSucesso ? new Date() : anterior.updatedAt,
            }));
        } finally {
            refreshInFlightRef.current = false;
        }
    }, []);

    /* -------------------------
       Atualização automática
       ------------------------- */

    useEffect(() => {
        mountedRef.current = true;
        void carregarTudo();

        const intervalId = window.setInterval(() => {
            if (!document.hidden) {
                void carregarTudo();
            }
        }, REFRESH_MS);

        const onVisibilityChange = () => {
            if (!document.hidden) {
                void carregarTudo();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            mountedRef.current = false;
            window.clearInterval(intervalId);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
    }, [carregarTudo]);

    /* -------------------------
       Auto-fit para TV
       ------------------------- */

    const recalcularDensidade = useCallback(() => {
        const el = dashboardRef.current;
        if (!el || typeof window === "undefined") return;

        const niveis: Density[] = [
            "normal",
            "compact",
            "dense",
            "ultra",
        ];

        const rect = el.getBoundingClientRect();
        const alturaDisponivel = Math.max(
            180,
            window.innerHeight - rect.top - 18,
        );

        let escolhido: Density = "ultra";

        for (const nivel of niveis) {
            el.dataset.density = nivel;

            // scrollHeight considera toda a tabela, mesmo com overflow hidden.
            if (el.scrollHeight <= alturaDisponivel + 2) {
                escolhido = nivel;
                break;
            }
        }

        el.dataset.density = escolhido;

        setDensity((atual) =>
            atual === escolhido ? atual : escolhido,
        );
    }, []);

    useLayoutEffect(() => {
        let frame = 0;

        const executar = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(
                recalcularDensidade,
            );
        };

        executar();

        const observer =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(executar)
                : null;

        if (dashboardRef.current) {
            observer?.observe(dashboardRef.current);
        }

        window.addEventListener("resize", executar);

        return () => {
            window.cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener("resize", executar);
        };
    }, [
        recalcularDensidade,
        atendimentosVisiveis.length,
        coroas.length,
    ]);

    const ultimaAtualizacao = network.updatedAt
        ? network.updatedAt.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
        : "—";

    return (
        <main className="h-[100dvh] overflow-hidden bg-background p-6 text-foreground">
            <style jsx global>{`
        /*
         * O modo NORMAL não possui override:
         * portanto mantém exatamente text-sm / px-3 / py-2.
         *
         * Só reduz quando o conteúdo não cabe na TV.
         */

        [data-density="compact"] {
          font-size: 13px;
        }

        [data-density="compact"] table {
          font-size: 13px !important;
        }

        [data-density="compact"] th,
        [data-density="compact"] td {
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }

        [data-density="compact"] .status-badge {
          font-size: 11px !important;
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }

        [data-density="compact"] .quadro-section-header {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }

        [data-density="compact"] .coroas-quadro {
          margin-top: 18px !important;
        }

        [data-density="dense"] {
          font-size: 12px;
        }

        [data-density="dense"] table {
          font-size: 12px !important;
        }

        [data-density="dense"] th,
        [data-density="dense"] td {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }

        [data-density="dense"] .status-badge {
          font-size: 10px !important;
          padding-top: 2px !important;
          padding-bottom: 2px !important;
        }

        [data-density="dense"] .secondary-line {
          font-size: 10px !important;
          margin-top: 0 !important;
        }

        [data-density="dense"] .quadro-section-header {
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }

        [data-density="dense"] .quadro-title {
          font-size: 13px !important;
        }

        [data-density="dense"] .coroas-quadro {
          margin-top: 12px !important;
        }

        [data-density="ultra"] {
          font-size: 10px;
        }

        [data-density="ultra"] table {
          font-size: 10px !important;
        }

        [data-density="ultra"] th,
        [data-density="ultra"] td {
          padding-top: 2px !important;
          padding-bottom: 2px !important;
        }

        [data-density="ultra"] .status-badge {
          font-size: 9px !important;
          padding: 1px 5px !important;
        }

        [data-density="ultra"] .secondary-line {
          font-size: 9px !important;
          margin-top: 0 !important;
        }

        [data-density="ultra"] .quadro-section-header {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }

        [data-density="ultra"] .quadro-title {
          font-size: 12px !important;
        }

        [data-density="ultra"] .quadro-count {
          font-size: 9px !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }

        [data-density="ultra"] .coroas-quadro {
          margin-top: 8px !important;
        }

        @media (max-width: 900px) {
          .agente-col {
            width: 22% !important;
          }

          .status-col {
            width: 32% !important;
          }

          .coroa-origem-col {
            width: 15% !important;
          }

          .coroa-status-col {
            width: 25% !important;
          }
        }
      `}</style>

            <header className="mb-6 flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Quadro Operacional
                    </h1>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                        {atendimentosVisiveis.length} atendimento
                        {atendimentosVisiveis.length === 1 ? "" : "s"}
                    </span>

                    <span>•</span>

                    <span>
                        {coroas.length} coroa
                        {coroas.length === 1 ? "" : "s"}
                    </span>

                    <span>•</span>

                    <span>{ultimaAtualizacao}</span>

                    {!network.ok ? (
                        <span
                            className="h-2.5 w-2.5 rounded-full bg-amber-500"
                            title={network.message || "Falha de atualização"}
                        />
                    ) : (
                        <span
                            className="h-2.5 w-2.5 rounded-full bg-emerald-500"
                            title="Atualização normal"
                        />
                    )}
                </div>
            </header>

            <div
                ref={dashboardRef}
                data-density={density}
                className="overflow-hidden"
            >
                <QuadroAtendimentos
                    registros={atendimentosVisiveis}
                />

                <QuadroCoroas pedidos={coroas} />
            </div>
        </main>
    );
}
