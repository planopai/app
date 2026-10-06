"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

/* =========================================================
   VISUAL (mockups MinhasSolicitacoes / Celular / CelularH, 06/10/2026)
   ========================================================= */

/** Rótulo de campo do mockup: maiúsculas, 12px, extra-negrito. */
const LABEL_CLS = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

/** Rótulo pequeno de informação (.kv do mockup). */
const KV_CLS = "text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

/** Campo do mockup: 48px, sem borda visível, fundo "field". */
const FIELD_CLS =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

/**
 * Componente base para cartões visuais da página (.box do mockup).
 */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]", className].join(" ")}>{children}</section>;
}

/**
 * Componente wrapper para campos de formulário.
 *
 * Renderiza o label padronizado acima do campo recebido em `children`.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className={LABEL_CLS}>{label}</span>
            {children}
        </label>
    );
}

/**
 * Select padronizado (filtro de status no computador).
 */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={[FIELD_CLS, props.className || ""].join(" ")} />;
}

/**
 * Campo de busca com lupa, como no mockup.
 */
function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <span className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:px-3.5">
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input
                type="search"
                {...props}
                className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA] lg:text-[15px]"
            />
        </span>
    );
}

/**
 * Botão reutilizável da página.
 *
 * `solid` = ação principal; `ghost` = botão neutro do mockup (fundo do cartão, borda line2).
 */
function Button({
    children,
    variant = "ghost",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
    const base =
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-[18px] text-[15px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-11 lg:text-[14px]";

    const style =
        variant === "solid"
            ? "border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border"
            : "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";

    return (
        <button {...props} className={[base, style, className].join(" ")}>
            {children}
        </button>
    );
}

/** Ícone de atualizar (botão Atualizar discreto, 44–48px). */
function IconRefresh({ spinning = false }: { spinning?: boolean }) {
    return (
        <svg viewBox="0 0 24 24" className={["size-5", spinning ? "animate-spin" : ""].join(" ")} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
        </svg>
    );
}

/**
 * Pequeno marcador visual em formato de cápsula (.sp do mockup: 26px).
 */
function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={["inline-flex h-[26px] items-center whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-extrabold", className].join(" ")}>{children}</span>;
}

/**
 * Badge colorido de status (cores de 06/10/2026).
 */
function StatusBadge({ status, options }: { status: string; options: StatusOption[] }) {
    const cls =
        status === "PENDENTE"
            ? "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white"
            : status === "EM_SEPARACAO"
                ? "border-[#3D6A99] bg-[#3D6A99] text-white"
                : status === "EM_TRANSITO"
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]"
                    : status === "ENTREGUE"
                        ? "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white"
                        : status === "RECUSADA"
                            ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                            : "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]";

    return <Pill className={cls}>{statusLabel(status, options)}</Pill>;
}

/** Alerta de atraso: amarelo sempre com texto #313C55. */
function LatePill() {
    return <Pill className="border-[#F2CB3F] bg-[#F2CB3F] px-2.5 text-[#313C55]">+24h</Pill>;
}

/**
 * Janelas abertas direto no <body> (06/10/2026). A página rola dentro de um contêiner e, no iPhone,
 * a barra de baixo (z-40) ficava por cima. Só chama createPortal depois de montar no cliente.
 */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/**
 * Janela reutilizável.
 *
 * Computador (lg): diálogo centralizado com cabeçalho, corpo que rola e rodapé fixo
 * (botões à direita). Celular: folha que sobe de baixo, com os botões lado a lado no rodapé.
 * Esc fecha. O scroll do body fica bloqueado enquanto está aberta.
 */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    footer,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    footer: React.ReactNode;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <NoCorpo>
            <div role="dialog" data-pai-overlay aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6">
                <div className="flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:max-w-[720px] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-start gap-2 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:gap-3 lg:px-6 lg:py-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{title}</h2>
                            {subtitle ? <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1 lg:text-sm">{subtitle}</p> : null}
                        </div>

                        <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]" aria-label="Fechar">
                            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-3.5 lg:gap-4 lg:px-6 lg:py-5">{children}</div>

                    <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                        {footer}
                    </div>
                </div>
            </div>
        </NoCorpo>
    );
}

/**
 * Estado vazio padronizado.
 */
function EmptyState({ title, text, className = "" }: { title: string; text: string; className?: string }) {
    return (
        <div className={["rounded-2xl border border-[#E3E8F0] bg-white p-6 text-center dark:border-white/[0.12] dark:bg-[#232B3F]", className].join(" ")}>
            <p className="font-extrabold text-[#313C55] dark:text-white lg:text-base">{title}</p>
            <p className="mt-1 text-[13px] leading-5 text-[#5B6478] dark:text-[#AEB9CF] lg:text-sm">{text}</p>
        </div>
    );
}

/** "1 item" / "N itens" (o total continua vindo de total_itens, como antes). */
function itensLabel(row: ReqListRow) {
    const n = Number(row.total_itens || 0) || 1;
    return n === 1 ? "1 item" : `${n} itens`;
}

/**
 * Card individual do histórico de solicitações.
 *
 * Computador: cartão com botão "Ver", Destino/Origem e justificativa.
 * Celular (em pé e deitado): o cartão inteiro é tocável e mostra um resumo compacto.
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

    const motivos = (
        <>
            {status === "RECUSADA" && row.motivo_recusa ? (
                <div className="mt-2 rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-[13px] font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mt-0 lg:px-3.5 lg:py-2.5 lg:text-[13.5px]">{row.motivo_recusa}</div>
            ) : null}

            {status === "CANCELADA" && row.motivo_cancelamento ? (
                <div className="mt-2 rounded-xl border border-[#C9D1DE] bg-[#EEF2F7] px-3 py-2 text-[13px] text-[#313C55] dark:border-white/[0.26] dark:bg-white/[0.08] dark:text-[#D6DCE8] lg:mt-0 lg:px-3.5 lg:py-2.5 lg:text-[13.5px]">{row.motivo_cancelamento}</div>
            ) : null}
        </>
    );

    return (
        <>
            {/* CELULAR: cartão inteiro tocável */}
            <button
                type="button"
                onClick={() => onOpen(row.id)}
                aria-label={`Ver detalhes de ${reqCode(row)}`}
                className="block w-full rounded-2xl border border-[#E3E8F0] bg-white px-3.5 py-3 text-left text-[#313C55] active:bg-[#EEF2F7] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white dark:active:bg-white/[0.08] lg:hidden"
            >
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-extrabold">{reqCode(row)}</span>
                    <StatusBadge status={status} options={statusOptions} />
                    {atrasada ? <LatePill /> : null}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Aberta em {fmtDateTime(row.criado_em)}</span>
                <span className="mt-2 block">
                    <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" />
                </span>
                <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                    {itensLabel(row)}, total {fmtQtd(row.total_quantidade || 0)} · Destino: {destinoLabel(row)}
                </span>
                {motivos}
            </button>

            {/* COMPUTADOR */}
            <article className="hidden flex-col gap-3 rounded-2xl border border-[#E3E8F0] bg-white px-5 py-[18px] text-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white lg:flex">
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[17px] font-extrabold">{reqCode(row)}</h3>
                            <StatusBadge status={status} options={statusOptions} />
                            {atrasada ? <LatePill /> : null}
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Aberta em {fmtDateTime(row.criado_em)}</p>
                    </div>

                    <Button type="button" onClick={() => onOpen(row.id)} className="shrink-0">
                        Ver
                    </Button>
                </div>

                <div>
                    <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" />
                    <p className="mt-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                        {itensLabel(row)}, total solicitado: <b className="text-[#313C55] dark:text-white">{fmtQtd(row.total_quantidade || 0)}</b>
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className={KV_CLS}>Destino</div>
                        <div className="text-sm font-extrabold">{destinoLabel(row)}</div>
                    </div>

                    {row.deposito_origem_nome ? (
                        <div>
                            <div className={KV_CLS}>Origem</div>
                            <div className="text-sm font-extrabold">{row.deposito_origem_nome}</div>
                        </div>
                    ) : null}
                </div>

                {row.justificativa ? <p className="line-clamp-2 text-[13.5px] leading-5 text-[#5B6478] dark:text-[#AEB9CF]">{row.justificativa}</p> : null}

                {motivos}
            </article>
        </>
    );
}

/**
 * Janela de detalhes da requisição.
 *
 * Mostra dados gerais, justificativa, motivos de recusa ou cancelamento, itens e linha
 * do tempo. Recebe `row` como `null` enquanto os dados ainda estão sendo carregados.
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
    const info = (label: string, value: React.ReactNode) => (
        <div className="min-w-0">
            <div className={KV_CLS}>{label}</div>
            <div className="break-words font-extrabold">{value}</div>
        </div>
    );

    return (
        <Modal
            open={open}
            title={row ? reqCode(row) : "Detalhes"}
            subtitle={row ? destinoLabel(row) : undefined}
            onClose={onClose}
            footer={
                <Button type="button" onClick={onClose}>
                    Fechar
                </Button>
            }
        >
            {!row ? (
                <div className="p-4 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando...</div>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge status={String(row.status)} options={statusOptions} />
                        <Pill className="border-[#C9D1DE] bg-[#EEF2F7] text-[#313C55] dark:border-white/[0.26] dark:bg-white/[0.08] dark:text-white">{row.destino_tipo === "DEPOSITO" ? "Transferência" : "Saída"}</Pill>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3.5 text-sm dark:border-white/[0.12] dark:bg-[#1C2334]">
                        {info("Solicitante", row.solicitante_nome || "-")}
                        {info("Criada em", fmtDateTime(row.criado_em))}
                        {info("Separada em", fmtDateTime(row.separado_em))}
                        {info("Enviada em", fmtDateTime(row.enviado_em))}
                        {info("Recebida em", fmtDateTime(row.recebido_em))}
                        {info("Origem", row.deposito_origem_nome || "-")}
                    </div>

                    {row.justificativa ? (
                        <div>
                            <div className={[KV_CLS, "mb-1"].join(" ")}>Justificativa</div>
                            <div className="text-sm">{row.justificativa}</div>
                        </div>
                    ) : null}

                    {row.motivo_recusa ? (
                        <div className="rounded-[14px] border border-[#E3E8F0] bg-[#FDECEA] px-4 py-3 dark:border-white/[0.12] dark:bg-[#FF9C92]/15">
                            <div className={KV_CLS}>Motivo da recusa</div>
                            <div className="mt-0.5 text-sm">{row.motivo_recusa}</div>
                        </div>
                    ) : null}

                    {row.motivo_cancelamento ? (
                        <div className="rounded-[14px] border border-[#E3E8F0] bg-[#EEF2F7] px-4 py-3 dark:border-white/[0.12] dark:bg-white/[0.08]">
                            <div className={KV_CLS}>Motivo do cancelamento</div>
                            <div className="mt-0.5 text-sm">{row.motivo_cancelamento}</div>
                        </div>
                    ) : null}

                    <div>
                        <h3 className="mb-2 text-[15px] font-extrabold">Itens</h3>
                        <div className="flex flex-col gap-2">
                            {row.items?.length ? (
                                row.items.map((item) => {
                                    const extras = [
                                        item.quantidade_enviada == null ? "" : `Enviada ${fmtQtd(item.quantidade_enviada)}`,
                                        item.quantidade_recebida == null ? "" : `Recebida ${fmtQtd(item.quantidade_recebida)}`,
                                    ].filter(Boolean);

                                    return (
                                        <div key={item.id} className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.12]">
                                            <div className="flex items-center gap-3">
                                                <span className="min-w-0 flex-1 break-words text-sm font-bold">{item.produto_nome_snapshot}</span>
                                                <span className="shrink-0 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                    Qtd <b className="text-[15px] text-[#313C55] dark:text-white">{fmtQtd(item.quantidade_solicitada)}</b>
                                                </span>
                                            </div>
                                            {extras.length ? <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{extras.join(" · ")}</div> : null}
                                            {item.observacao ? <p className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{item.observacao}</p> : null}
                                        </div>
                                    );
                                })
                            ) : (
                                <EmptyState title="Sem itens" text="Os itens não foram retornados pela API." className="!border-dashed !p-5" />
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-2 text-[15px] font-extrabold">Linha do tempo</h3>
                        <div className="flex flex-col gap-2">
                            {row.eventos?.length ? (
                                row.eventos.map((ev) => (
                                    <div key={ev.id} className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.12]">
                                        <div className="flex gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-extrabold">{ev.evento.replace(/_/g, " ")}</div>
                                                <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{ev.usuario_nome || `Usuário #${ev.usuario_id}`}</div>
                                            </div>
                                            <div className="shrink-0 text-right text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{fmtDateTime(ev.criado_em)}</div>
                                        </div>
                                        {ev.observacao ? <p className="mt-1.5 text-[13px]">{ev.observacao}</p> : null}
                                    </div>
                                ))
                            ) : (
                                <EmptyState title="Sem eventos" text="A linha do tempo ainda não foi registrada." className="!border-dashed !p-5" />
                            )}
                        </div>
                    </div>
                </>
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

    /**
     * Pedido de recarga depois de mudar o filtro de status ou limpar os filtros.
     * A carga roda no efeito abaixo, já com os filtros novos (mesma função loadMinhas).
     */
    const [recarga, setRecarga] = useState(0);

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

    useEffect(() => {
        if (recarga === 0) return;
        void loadMinhas();

        // Só reage ao pedido de recarga (status/Limpar); a busca continua manual.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recarga]);

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

    const closeDetail = useCallback(() => setDetailOpen(false), []);

    /** Status do select (computador) e dos chips (celular): o MESMO filtro. */
    function changeStatus(value: string) {
        setFiltroStatus(value);
        setRecarga((n) => n + 1);
    }

    function clearFilters() {
        setFiltroStatus("");
        setFiltroQ("");
        setRecarga((n) => n + 1);
    }

    const chips = [{ id: "", nome: "Todas" }, ...statusOptions];

    const searchProps = {
        value: filtroQ,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFiltroQ(e.target.value),
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") void loadMinhas();
        },
        placeholder: "Produto, código ou destino",
        "aria-label": "Busca",
    };

    const refreshButton = (
        <Button type="button" onClick={loadMinhas} disabled={loadingRows} aria-label="Atualizar" title="Atualizar" className="!min-h-12 !w-12 shrink-0 !px-0">
            <IconRefresh spinning={loadingRows} />
        </Button>
    );

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-[1120px] lg:px-10 lg:pt-8">
                <header className="px-4 pb-3 pt-4 lg:mb-6 lg:p-0">
                    <h1 className="text-[22px] font-extrabold leading-tight text-[#313C55] dark:text-white lg:text-[28px]">Minhas Solicitações</h1>
                    <p className="mt-1 hidden text-sm text-[#5B6478] dark:text-[#AEB9CF] lg:block">
                        Histórico das suas requisições. Para cancelar ou confirmar recebimento, use Requisição de Material.
                    </p>
                </header>

                {/* FILTROS · CELULAR (em pé e deitado): busca + chips de status roláveis */}
                <div className="border-y border-[#E3E8F0] bg-white px-4 py-3 dark:border-white/[0.12] dark:bg-[#232B3F] lg:hidden">
                    <div className="flex gap-2">
                        <SearchInput {...searchProps} />
                        {refreshButton}
                    </div>

                    <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Status">
                        {chips.map((c) => {
                            const on = c.id === filtroStatus;
                            return (
                                <button
                                    key={c.id || "todas"}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => changeStatus(c.id)}
                                    className={[
                                        "h-11 shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-sm font-bold",
                                        on
                                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                            : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white",
                                    ].join(" ")}
                                >
                                    {c.nome}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* FILTROS · COMPUTADOR */}
                <Card className="mb-5 hidden px-5 py-4 lg:block">
                    <div className="grid grid-cols-[200px_minmax(0,1fr)_auto_auto] items-end gap-4">
                        <Field label="Status">
                            <Select value={filtroStatus} onChange={(e) => changeStatus(e.target.value)}>
                                <option value="">Todos</option>
                                {statusOptions.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <label className="block">
                            <span className={LABEL_CLS}>Busca</span>
                            <SearchInput {...searchProps} />
                        </label>

                        {refreshButton}

                        <Button type="button" onClick={clearFilters} disabled={loadingRows} className="lg:!min-h-12">
                            Limpar
                        </Button>
                    </div>
                </Card>

                <div className="px-4 pb-5 pt-3 lg:p-0">
                    {loadingInit ? <Card className="mb-3 p-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando dados...</Card> : null}

                    {err ? (
                        <div role="alert" className="mb-3 rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mb-4">
                            {err}
                        </div>
                    ) : null}

                    {loadingRows ? (
                        <Card className="p-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando seu histórico...</Card>
                    ) : rows.length === 0 ? (
                        <EmptyState title="Nenhuma requisição" text="Não há registros para mostrar." className="lg:p-8" />
                    ) : (
                        <div className="grid grid-cols-1 items-start gap-2.5 max-lg:landscape:grid-cols-2 lg:grid-cols-2 lg:gap-4">
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
                onClose={closeDetail}
            />
        </main>
    );
}
