"use client";

import React, { useCallback, useEffect, useState } from "react";
import ItensTabela from "@/components/requisicoes/ItensTabela";

/**
 * Tipo utilitário para representar IDs numéricos vindos da API.
 *
 * Usar um alias deixa o código mais legível, porque evita repetir `number`
 * em todo lugar e deixa claro quando determinado campo representa uma chave
 * de identificação no banco.
 */
type ID = number;

/**
 * Representa o usuário logado retornado pela API no carregamento inicial.
 *
 * Esse objeto é usado apenas para exibir informações básicas do usuário no topo
 * da tela, como nome, usuário ou ID.
 */
type Me = {
    id: ID;
    nome: string;
    usuario: string;
};

/**
 * Lista fechada dos status conhecidos pela aplicação.
 *
 * A API pode retornar outros valores como string, mas esses são os status
 * esperados pelo front-end para aplicar labels, cores e regras de ação.
 */
type StatusId =
    | "PENDENTE"
    | "EM_SEPARACAO"
    | "EM_TRANSITO"
    | "ENTREGUE"
    | "CANCELADA"
    | "RECUSADA";

/**
 * Representa uma opção de status exibida em filtros, badges e labels.
 *
 * `id` é o valor técnico usado pela API.
 * `nome` é o texto amigável exibido ao usuário.
 */
type StatusOption = {
    id: StatusId;
    nome: string;
};

/**
 * Formato esperado da resposta da API para inicialização da página.
 *
 * Essa chamada busca informações do usuário logado e a lista de status
 * disponíveis. Caso a sessão esteja inválida, a API pode retornar `need_login`.
 */
type InitResp = {
    ok: boolean;
    me?: Me;
    status?: StatusOption[];
    msg?: string;
    need_login?: 1;
};

/**
 * Representa uma requisição na listagem principal.
 *
 * Esse tipo contém os dados resumidos necessários para renderizar cada card
 * de solicitação, como código, status, destino, origem, resumo dos itens,
 * datas principais e possíveis motivos de recusa ou cancelamento.
 */
type ReqListRow = {
    id: ID;
    codigo?: string | null;
    status: StatusId | string;
    status_label?: string | null;
    solicitante_usuario_id?: ID;
    solicitante_nome?: string | null;
    unidade_destino_id?: ID | null;
    unidade_destino_nome?: string | null;
    unidade_destino_texto?: string | null;
    destino_tipo?: "DEPOSITO" | "CONSUMO" | string;
    id_atendimento?: string | null;
    justificativa?: string | null;
    deposito_origem_nome?: string | null;
    total_itens?: number | string;
    total_quantidade?: number | string;
    itens_resumo?: string | null;
    atrasada_24h?: 0 | 1 | number | string;
    criado_em: string;
    separado_em?: string | null;
    enviado_em?: string | null;
    recebido_em?: string | null;
    motivo_recusa?: string | null;
    motivo_cancelamento?: string | null;
};

/**
 * Representa um item individual de uma requisição.
 *
 * A API retorna snapshots do produto, como nome e código de barras, para manter
 * o histórico fiel ao momento da solicitação, mesmo que o cadastro do produto
 * seja alterado depois.
 */
type ReqItem = {
    id: ID;
    requisicao_id: ID;
    produto_id: ID;
    produto_nome_snapshot: string;
    produto_nome_atual?: string | null;
    codigo_barras_snapshot?: string | null;
    quantidade_solicitada: number | string;
    quantidade_enviada?: number | string | null;
    quantidade_recebida?: number | string | null;
    observacao?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
};

/**
 * Representa um evento da linha do tempo da requisição.
 *
 * Cada evento registra uma mudança ou ação importante, como criação,
 * separação, envio, recebimento, cancelamento ou recusa.
 */
type ReqEvento = {
    id: ID;
    requisicao_id: ID;
    usuario_id: ID;
    usuario_nome?: string | null;
    evento: string;
    status_de?: string | null;
    status_para?: string | null;
    observacao?: string | null;
    criado_em: string;
};

/**
 * Representa os detalhes completos de uma requisição.
 *
 * Estende os dados da listagem e adiciona campos mais completos, como nomes
 * dos usuários responsáveis pelas etapas, itens e eventos da linha do tempo.
 */
type ReqDetalhe = ReqListRow & {
    solicitante_usuario?: string | null;
    separado_por_nome?: string | null;
    enviado_por_nome?: string | null;
    recebido_por_nome?: string | null;
    cancelado_por_nome?: string | null;
    recusado_por_nome?: string | null;
    deposito_origem_nome?: string | null;
    items?: ReqItem[];
    eventos?: ReqEvento[];
};

/**
 * Resposta da API para a listagem de solicitações do usuário logado.
 */
type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

/**
 * Resposta da API para abertura dos detalhes de uma requisição específica.
 */
type DetailResp = {
    ok: boolean;
    row?: ReqDetalhe;
    msg?: string;
    need_login?: 1;
};

/**
 * URL base do servidor da API.
 *
 * Mantida separada para facilitar manutenção caso o domínio mude no futuro.
 */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

/**
 * Endpoint específico usado por esta página.
 *
 * Todas as ações desta tela são enviadas para o mesmo arquivo PHP, mudando
 * apenas o parâmetro `action` em GET ou POST.
 */
const API_BASE = `${ENDPOINT}/requisicoes.php`;

/**
 * Lista local de status usada como fallback.
 *
 * Caso a API não retorne a lista de status no `init`, a página continua
 * funcionando com estes valores padrão.
 */
const STATUS_FALLBACK: StatusOption[] = [
    { id: "PENDENTE", nome: "Pendente" },
    { id: "EM_SEPARACAO", nome: "Em separação" },
    { id: "EM_TRANSITO", nome: "Em trânsito" },
    { id: "ENTREGUE", nome: "Entregue" },
    { id: "CANCELADA", nome: "Cancelada" },
    { id: "RECUSADA", nome: "Recusada" },
];

/**
 * Converte qualquer valor recebido da API para número seguro.
 *
 * A função aceita números reais, strings no formato brasileiro e valores vazios.
 * Isso evita quebrar a tela quando a API retorna quantidades como `"1,5"`,
 * `"1.000,25"`, `null`, `undefined` ou strings vazias.
 */
function parseNum(v: unknown) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;

    const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
    const n = Number(s);

    return Number.isFinite(n) ? n : 0;
}

/**
 * Formata quantidades para o padrão brasileiro.
 *
 * Usa até três casas decimais, porque itens de estoque podem eventualmente
 * trabalhar com frações, mas evita exibir casas desnecessárias quando o número
 * é inteiro.
 */
function fmtQtd(v: unknown) {
    const n = parseNum(v);

    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    }).format(n);
}

/**
 * Formata uma data/hora para exibição ao usuário.
 *
 * A API pode retornar datas com espaço entre data e hora, como
 * `"2025-01-01 10:30:00"`. O JavaScript interpreta melhor quando há `T`,
 * então a função normaliza esse formato antes de criar o objeto Date.
 *
 * Se a data estiver vazia, retorna `-`.
 * Se a data for inválida, retorna o valor original para não ocultar informação.
 */
function fmtDateTime(value?: string | null) {
    if (!value) return "-";

    try {
        const normalized = value.includes("T") ? value : value.replace(" ", "T");
        const d = new Date(normalized);

        if (Number.isNaN(d.getTime())) return value;

        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(d);
    } catch {
        return value;
    }
}

/**
 * Resolve o nome amigável de um status.
 *
 * Primeiro tenta usar a lista retornada pela API, pois ela pode estar mais
 * atualizada. Se não encontrar, usa o fallback local. Se ainda assim não achar,
 * exibe o próprio código técnico.
 */
function statusLabel(status: string, options: StatusOption[]) {
    return options.find((s) => s.id === status)?.nome || STATUS_FALLBACK.find((s) => s.id === status)?.nome || status;
}

/**
 * Define o texto de destino exibido nos cards e no modal de detalhes.
 *
 * A ordem de prioridade é:
 * 1. Nome da unidade de destino;
 * 2. Texto livre de destino;
 * 3. ID da unidade de destino;
 * 4. Texto padrão de não informado.
 */
function destinoLabel(row: ReqListRow | ReqDetalhe) {
    if (row.unidade_destino_nome) return row.unidade_destino_nome;
    if (row.unidade_destino_texto) return row.unidade_destino_texto;
    if (row.unidade_destino_id) return `Depósito #${row.unidade_destino_id}`;

    return "Não informado";
}

/**
 * Retorna o código exibido para a requisição.
 *
 * Se a API já retornar um código oficial, ele é usado. Caso contrário, cria um
 * código visual baseado no ID, com seis dígitos preenchidos com zero à esquerda.
 */
function reqCode(row: ReqListRow | ReqDetalhe) {
    return row.codigo || `REQ-${String(row.id).padStart(6, "0")}`;
}

/**
 * Lê a resposta HTTP e garante que ela seja JSON.
 *
 * Essa função protege a aplicação contra respostas inesperadas, como uma página
 * HTML de erro, aviso de PHP ou texto puro. Quando o conteúdo não é JSON, ela
 * lança um erro com um trecho da resposta para facilitar diagnóstico.
 */
async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada da API. ${txt ? txt.slice(0, 180) : ""}`.trim());
    }

    return (await r.json()) as T;
}

/**
 * Helper para chamadas GET ao endpoint de requisições.
 *
 * Recebe um objeto com parâmetros de query string, remove valores vazios ou
 * indefinidos e monta a URL final. Também envia `credentials: "include"` para
 * permitir que cookies de sessão sejam enviados junto da requisição.
 */
async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE);

    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined || v === "") return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return await safeJson<T>(r);
}

/**
 * Componente base para cartões visuais da página.
 *
 * Centraliza o estilo comum de borda, fundo, sombra e arredondamento. Isso evita
 * repetir classes Tailwind em todos os blocos e facilita mudanças futuras no
 * visual dos cards.
 */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-sm", className].join(" ")}>{children}</section>;
}

/**
 * Componente wrapper para campos de formulário.
 *
 * Renderiza o label padronizado acima do campo recebido em `children`.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[#313C55] dark:text-[#D6DCE8]">{label}</span>
            {children}
        </label>
    );
}

/**
 * Input de texto padronizado.
 *
 * Aceita todas as props normais de um `<input>` e acrescenta classes visuais
 * comuns. A prop `className` continua disponível para customizações pontuais.
 */
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                "w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-[16px] text-[#313C55] dark:text-white shadow-sm outline-none",
                "placeholder:text-[#7A8396] focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30 disabled:bg-[#EEF2F7] disabled:text-[#7A8396]",
                props.className || "",
            ].join(" ")}
        />
    );
}

/**
 * Select padronizado.
 *
 * Usado principalmente no filtro de status. Mantém consistência visual com os
 * demais campos de formulário da página.
 */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-[16px] text-[#313C55] dark:text-white shadow-sm outline-none",
                "focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30 disabled:bg-[#EEF2F7] disabled:text-[#7A8396]",
                props.className || "",
            ].join(" ")}
        />
    );
}

/**
 * Botão reutilizável da página.
 *
 * A prop `variant` controla o estilo visual:
 * `solid` para ação principal,
 * `soft` para ação secundária destacada,
 * `ghost` para ação neutra,
 * `danger` para ação destrutiva ou sensível, como cancelamento.
 */
function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "soft" | "ghost" | "danger" }) {
    const base =
        "inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-[15px] font-bold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const style =
        variant === "solid"
            ? "border border-[#313C55] dark:border-[#F2CB3F] bg-[#313C55] dark:bg-[#F2CB3F] text-white hover:bg-[#232B40] dark:hover:bg-[#E4BC30] dark:text-[#313C55]"
            : variant === "soft"
                ? "border border-[#E3E8F0] dark:border-white/[0.12] bg-[#EEF2F7] dark:bg-white/10 text-[#313C55] dark:text-white hover:bg-[#E3E8F0] dark:hover:bg-white/15"
                : variant === "danger"
                    ? "border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 text-[#B42318] dark:text-[#FF9C92] hover:bg-[#FBDAD6] dark:hover:bg-[#FF9C92]/25"
                    : "border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-[#D6DCE8] hover:bg-[#EEF2F7] dark:hover:bg-white/10";

    return (
        <button {...props} className={[base, style, className].join(" ")}>
            {children}
        </button>
    );
}

/**
 * Pequeno marcador visual em formato de cápsula.
 *
 * Serve como base para status, alerta de atraso e indicação de tipo da
 * solicitação.
 */
function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", className].join(" ")}>{children}</span>;
}

/**
 * Badge colorido de status.
 *
 * Traduz o status técnico para texto amigável e aplica cores diferentes para
 * facilitar identificação visual rápida na listagem e nos detalhes.
 */
function StatusBadge({ status, options }: { status: string; options: StatusOption[] }) {
    const cls =
        status === "PENDENTE"
            ? "border border-[#8FD6F4] bg-[#E6F7FE] text-[#313C55] dark:border-[#00AEEC]/50 dark:bg-[#00AEEC]/20 dark:text-white"
            : status === "EM_SEPARACAO"
                ? "border border-[#00AEEC] bg-[#00AEEC] text-[#0F1626]"
                : status === "EM_TRANSITO"
                    ? "border border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]"
                    : status === "ENTREGUE"
                        ? "border border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white"
                        : status === "RECUSADA"
                            ? "border border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                            : "border border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]";

    return <Pill className={cls}>{statusLabel(status, options)}</Pill>;
}

/**
 * Modal genérico reutilizável.
 *
 * Responsabilidades principais:
 * 1. Renderizar uma camada escura sobre a tela.
 * 2. Exibir título, subtítulo opcional, botão de fechar e conteúdo.
 * 3. Bloquear o scroll do body enquanto o modal estiver aberto.
 *
 * O bloqueio de scroll melhora a experiência em mobile, evitando que o fundo
 * role enquanto o usuário interage com o modal.
 */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex min-h-[100dvh] items-end justify-center bg-[#313C55]/45 p-3 sm:items-center sm:p-4">
            <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-[#E3E8F0] dark:border-white/[0.12] p-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-[#313C55] dark:text-white">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm leading-5 text-[#5B6478] dark:text-[#AEB9CF]">{subtitle}</p> : null}
                    </div>

                    <button type="button" onClick={onClose} className="rounded-2xl px-3 py-2 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] hover:bg-[#EEF2F7] dark:hover:bg-white/10" aria-label="Fechar">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>
    );
}

/**
 * Estado vazio padronizado.
 *
 * Usado quando não há requisições na listagem, quando a API não retorna itens
 * no detalhe ou quando não há eventos de linha do tempo.
 */
function EmptyState({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-[#C9D1DE] dark:border-white/25 bg-[#F6F8FB] dark:bg-[#1C2334] p-5 text-center">
            <p className="text-sm font-bold text-[#313C55] dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-5 text-[#5B6478] dark:text-[#AEB9CF]">{text}</p>
        </div>
    );
}

/**
 * Card individual do histórico de solicitações.
 *
 * Esta tela é somente consulta. Alterações de estado, cancelamento e confirmação
 * de recebimento ficam na página /requisicao.
 */
function RequestCard({
    row,
    statusOptions,
    onOpen,
}: {
    row: ReqListRow;
    statusOptions: StatusOption[];
    onOpen: (id: ID) => void;
}) {
    const status = String(row.status);
    const atrasada = Number(row.atrasada_24h || 0) === 1;

    return (
        <Card className="overflow-hidden">
            <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[#313C55] dark:text-white">{reqCode(row)}</h3>
                            <StatusBadge status={status} options={statusOptions} />
                            {atrasada ? <Pill className="border border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55]">+24h</Pill> : null}
                        </div>
                        <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Aberta em {fmtDateTime(row.criado_em)}</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpen(row.id)}
                        className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-xs font-bold text-[#313C55] dark:text-[#D6DCE8] shadow-sm hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                    >
                        Ver
                    </button>
                </div>

                <div>
                    <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" />
                    <p className="mt-2 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                        {Number(row.total_itens || 0) || 1} item(ns), total solicitado: <b className="text-[#313C55] dark:text-white">{fmtQtd(row.total_quantidade || 0)}</b>
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm text-[#313C55] dark:text-[#D6DCE8] sm:grid-cols-2">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Destino</span>
                        <div className="font-bold text-[#313C55] dark:text-white">{destinoLabel(row)}</div>
                    </div>

                    {row.deposito_origem_nome ? (
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Origem</span>
                            <div className="font-bold text-[#313C55] dark:text-white">{row.deposito_origem_nome}</div>
                        </div>
                    ) : null}
                </div>

                {row.justificativa ? <p className="line-clamp-2 text-sm leading-5 text-[#5B6478] dark:text-[#AEB9CF]">{row.justificativa}</p> : null}

                {status === "RECUSADA" && row.motivo_recusa ? (
                    <div className="rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">{row.motivo_recusa}</div>
                ) : null}

                {status === "CANCELADA" && row.motivo_cancelamento ? (
                    <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-3 text-sm text-[#313C55] dark:text-[#D6DCE8]">{row.motivo_cancelamento}</div>
                ) : null}
            </div>
        </Card>
    );
}

/**
 * Modal de detalhes da requisição.
 *
 * Mostra uma visão completa da solicitação selecionada, incluindo:
 * dados gerais, justificativa, motivos de recusa ou cancelamento, itens e linha
 * do tempo.
 *
 * O componente recebe `row` como `null` enquanto os dados ainda estão sendo
 * carregados, exibindo uma mensagem de carregamento nesse período.
 */
function DetailModal({
    open,
    row,
    statusOptions,
    onClose,
}: {
    open: boolean;
    row: ReqDetalhe | null;
    statusOptions: StatusOption[];
    onClose: () => void;
}) {
    return (
        <Modal open={open} title={row ? reqCode(row) : "Detalhes"} subtitle={row ? destinoLabel(row) : undefined} onClose={onClose}>
            {!row ? (
                <div className="p-4 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando...</div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge status={String(row.status)} options={statusOptions} />
                        <Pill className="bg-[#EEF2F7] dark:bg-white/10 text-[#313C55] dark:text-[#D6DCE8]">{row.destino_tipo === "DEPOSITO" ? "Transferência" : "Saída"}</Pill>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-4 text-sm sm:grid-cols-2">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Solicitante</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{row.solicitante_nome || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Criada em</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{fmtDateTime(row.criado_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Separada em</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{fmtDateTime(row.separado_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Enviada em</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{fmtDateTime(row.enviado_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Recebida em</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{fmtDateTime(row.recebido_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Origem</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{row.deposito_origem_nome || "-"}</div>
                        </div>
                    </div>

                    {row.justificativa ? (
                        <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Justificativa</div>
                            <p className="mt-1 text-sm font-semibold leading-5 text-[#313C55] dark:text-white">{row.justificativa}</p>
                        </div>
                    ) : null}

                    {row.motivo_recusa ? (
                        <div className="rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-[#B42318] dark:text-[#FF9C92]">Motivo da recusa</div>
                            <p className="mt-1 text-sm font-semibold leading-5 text-[#B42318] dark:text-[#FF9C92]">{row.motivo_recusa}</p>
                        </div>
                    ) : null}

                    {row.motivo_cancelamento ? (
                        <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-[#7A8396] dark:text-[#8893AA]">Motivo do cancelamento</div>
                            <p className="mt-1 text-sm font-semibold leading-5 text-[#313C55] dark:text-[#D6DCE8]">{row.motivo_cancelamento}</p>
                        </div>
                    ) : null}

                    <div>
                        <h3 className="mb-2 text-sm font-bold text-[#313C55] dark:text-white">Itens</h3>
                        <div className="space-y-2">
                            {row.items?.length ? (
                                row.items.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-3">
                                        <div className="text-sm font-bold text-[#313C55] dark:text-white">{item.produto_nome_snapshot}</div>
                                        <div className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Código: {item.codigo_barras_snapshot || "sem código"}</div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                            <div className="rounded-2xl bg-[#F6F8FB] dark:bg-[#1C2334] p-2">
                                                <div className="text-[#5B6478] dark:text-[#AEB9CF]">Solicitada</div>
                                                <div className="font-bold text-[#313C55] dark:text-white">{fmtQtd(item.quantidade_solicitada)}</div>
                                            </div>
                                            <div className="rounded-2xl bg-[#F6F8FB] dark:bg-[#1C2334] p-2">
                                                <div className="text-[#5B6478] dark:text-[#AEB9CF]">Enviada</div>
                                                <div className="font-bold text-[#313C55] dark:text-white">{item.quantidade_enviada == null ? "-" : fmtQtd(item.quantidade_enviada)}</div>
                                            </div>
                                            <div className="rounded-2xl bg-[#F6F8FB] dark:bg-[#1C2334] p-2">
                                                <div className="text-[#5B6478] dark:text-[#AEB9CF]">Recebida</div>
                                                <div className="font-bold text-[#313C55] dark:text-white">{item.quantidade_recebida == null ? "-" : fmtQtd(item.quantidade_recebida)}</div>
                                            </div>
                                        </div>
                                        {item.observacao ? <p className="mt-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">{item.observacao}</p> : null}
                                    </div>
                                ))
                            ) : (
                                <EmptyState title="Sem itens" text="Os itens não foram retornados pela API." />
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-2 text-sm font-bold text-[#313C55] dark:text-white">Linha do tempo</h3>
                        <div className="space-y-2">
                            {row.eventos?.length ? (
                                row.eventos.map((ev) => (
                                    <div key={ev.id} className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-bold text-[#313C55] dark:text-white">{ev.evento.replace(/_/g, " ")}</div>
                                                <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">{ev.usuario_nome || `Usuário #${ev.usuario_id}`}</div>
                                            </div>
                                            <div className="shrink-0 text-right text-xs text-[#5B6478] dark:text-[#AEB9CF]">{fmtDateTime(ev.criado_em)}</div>
                                        </div>
                                        {ev.observacao ? <p className="mt-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">{ev.observacao}</p> : null}
                                    </div>
                                ))
                            ) : (
                                <EmptyState title="Sem eventos" text="A linha do tempo ainda não foi registrada." />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/**
 * Página de histórico das solicitações do usuário logado.
 *
 * Esta página não altera o fluxo da requisição. Ela apenas lista, filtra e abre
 * os detalhes. Cancelamento e confirmação de recebimento ficam em /requisicao.
 */
export default function MinhasSolicitacoesPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [statusOptions, setStatusOptions] = useState<StatusOption[]>(STATUS_FALLBACK);

    const [loadingInit, setLoadingInit] = useState(true);
    const [loadingRows, setLoadingRows] = useState(false);
    const [err, setErr] = useState("");

    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [filtroStatus, setFiltroStatus] = useState<string>("");
    const [filtroQ, setFiltroQ] = useState("");

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detail, setDetail] = useState<ReqDetalhe | null>(null);

    const loadInit = useCallback(async () => {
        setLoadingInit(true);
        setErr("");

        try {
            const data = await apiGet<InitResp>({ action: "init" });

            if (!data.ok) throw new Error(data.msg || "Falha ao carregar dados iniciais.");

            setMe(data.me || null);
            setStatusOptions(data.status?.length ? data.status : STATUS_FALLBACK);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível carregar a página.");
        } finally {
            setLoadingInit(false);
        }
    }, []);

    const loadMinhas = useCallback(async () => {
        setLoadingRows(true);
        setErr("");

        try {
            const data = await apiGet<ListResp>({
                action: "minhas",
                status: filtroStatus || undefined,
                q: filtroQ.trim() || undefined,
                limit: 120,
            });

            if (!data.ok) throw new Error(data.msg || "Falha ao carregar seu histórico.");

            setRows(data.rows || []);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível carregar seu histórico.");
        } finally {
            setLoadingRows(false);
        }
    }, [filtroQ, filtroStatus]);

    useEffect(() => {
        void loadInit();
        void loadMinhas();

        // Os filtros são aplicados manualmente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function openDetail(id: ID) {
        setDetailOpen(true);
        setDetailLoading(true);
        setDetail(null);
        setErr("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar_minha", id });

            if (!data.ok || !data.row) {
                throw new Error(data.msg || "Não foi possível abrir a requisição.");
            }

            setDetail(data.row);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível abrir a requisição.");
            setDetailOpen(false);
        } finally {
            setDetailLoading(false);
        }
    }

    function clearFilters() {
        setFiltroStatus("");
        setFiltroQ("");
    }

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] dark:bg-[#161C2A] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:text-white">
            <div className="mx-auto w-full max-w-5xl px-5 py-5">
                <header className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-sm">
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" className="text-[#313C55] dark:text-white">
                                <path d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" />
                                <path d="M8.5 9h7M8.5 13h7M8.5 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </div>

                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-bold tracking-tight text-[#313C55] dark:text-white">Minhas Solicitações</h1>
                            <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Histórico das suas requisições.</p>
                        </div>
                    </div>

                    {me?.nome ? (
                        <div className="hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-right text-xs shadow-sm sm:block">
                            <div className="text-[#5B6478] dark:text-[#AEB9CF]">Usuário</div>
                            <div className="font-bold text-[#313C55] dark:text-white">{me.nome}</div>
                        </div>
                    ) : null}
                </header>

                {loadingInit ? <Card className="mb-4 p-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando dados...</Card> : null}

                {err ? (
                    <div className="mb-4 rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-4 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92]">
                        {err}
                    </div>
                ) : null}

                <div className="space-y-4">
                    <Card className="p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto_auto] sm:items-end">
                            <Field label="Status">
                                <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                                    <option value="">Todos</option>
                                    {statusOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Busca">
                                <TextInput
                                    value={filtroQ}
                                    onChange={(e) => setFiltroQ(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void loadMinhas();
                                    }}
                                    placeholder="Produto, código ou destino"
                                />
                            </Field>

                            <Button type="button" variant="soft" onClick={loadMinhas} disabled={loadingRows} className="w-full sm:w-auto">
                                {loadingRows ? "Atualizando..." : "Atualizar"}
                            </Button>

                            <Button type="button" variant="ghost" onClick={clearFilters} disabled={loadingRows} className="w-full sm:w-auto">
                                Limpar
                            </Button>
                        </div>
                    </Card>

                    {loadingRows ? (
                        <Card className="p-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando seu histórico...</Card>
                    ) : rows.length === 0 ? (
                        <EmptyState title="Nenhuma requisição" text="Não há registros para mostrar." />
                    ) : (
                        <div className="grid grid-cols-1 items-start gap-3 sm:landscape:grid-cols-2 lg:grid-cols-2">
                            {rows.map((row) => (
                                <RequestCard
                                    key={row.id}
                                    row={row}
                                    statusOptions={statusOptions}
                                    onOpen={openDetail}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <DetailModal
                open={detailOpen}
                row={detailLoading ? null : detail}
                statusOptions={statusOptions}
                onClose={() => setDetailOpen(false)}
            />
        </main>
    );
}