"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconRefresh, IconX } from "@tabler/icons-react";
import ItensTabela from "@/components/requisicoes/ItensTabela";

/**
 * Alias para IDs numéricos vindos da API.
 *
 * Facilita a leitura dos tipos, porque deixa claro quando um campo representa
 * uma chave de identificação no banco, em vez de ser apenas um número comum.
 */
type ID = number;

/**
 * Status conhecidos pelo fluxo de requisições.
 *
 * Esses valores controlam labels, cores e regras de ação da tela.
 */
type StatusId = "PENDENTE" | "EM_SEPARACAO" | "EM_TRANSITO" | "ENTREGUE" | "CANCELADA" | "RECUSADA";

/**
 * Representa o usuário logado retornado pela API.
 *
 * Nesta página, é usado para exibir o operador atual no cabeçalho.
 */
type Me = {
    id: ID;
    nome: string;
    usuario: string;
};

/**
 * Representa um depósito disponível para origem de envio.
 *
 * A tela usa essa lista no modal de envio para o operador escolher de qual
 * depósito o material será separado.
 */
type Deposito = {
    id: ID;
    nome: string;
};

/**
 * Representa o saldo de um produto dentro de um depósito.
 *
 * `quantidade` é o valor principal usado para validar se há estoque suficiente
 * antes do envio. `minimo` e `maximo` existem no tipo porque podem vir da API,
 * embora esta tela não use esses campos diretamente.
 */
type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo?: number | string;
    maximo?: number | string;
};

/**
 * Representa uma requisição na fila/listagem principal.
 *
 * Esse tipo contém os dados resumidos necessários para renderizar cada card
 * operacional, como status, solicitante, destino, origem, resumo dos itens,
 * datas importantes e motivos de recusa ou cancelamento.
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
    deposito_origem_id?: ID | null;
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
 * Representa um item individual dentro de uma requisição.
 *
 * O campo `produto_nome_snapshot` preserva o nome do produto no momento da
 * requisição, evitando que alterações futuras no cadastro mudem o histórico.
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
 * Representa a requisição detalhada.
 *
 * Estende a linha resumida da listagem e adiciona os itens da requisição e os
 * nomes dos usuários responsáveis por cada etapa.
 */
type ReqDetail = ReqListRow & {
    items?: ReqItem[];
    solicitante_usuario?: string | null;
    separado_por_nome?: string | null;
    enviado_por_nome?: string | null;
    recebido_por_nome?: string | null;
    recusado_por_nome?: string | null;
    cancelado_por_nome?: string | null;
};

/**
 * Resposta da API para inicialização da tela.
 *
 * Essa chamada traz dados do usuário logado, depósitos disponíveis e saldos
 * atuais, necessários para operar a fila.
 */
type InitResp = {
    ok: boolean;
    me?: Me;
    depositos?: Deposito[];
    saldos?: Saldo[];
    msg?: string;
    need_login?: 1;
};

/**
 * Resposta da API para a listagem de requisições em andamento.
 */
type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

/**
 * Resposta da API para o detalhamento de uma requisição específica.
 */
type DetailResp = {
    ok: boolean;
    row?: ReqDetail;
    msg?: string;
    need_login?: 1;
};

/**
 * Resposta padrão para ações que alteram o estado da requisição.
 *
 * Usada em iniciar separação, enviar material e recusar.
 */
type ActionResp = {
    ok: boolean;
    msg?: string;
    row?: ReqDetail;
    need_login?: 1;
};

/**
 * Domínio base da API.
 *
 * Separar o endpoint em constante facilita manutenção caso o domínio mude no
 * futuro.
 */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

/**
 * Endpoint usado por esta página.
 *
 * As operações são diferenciadas pelo parâmetro `action`, enviado via GET ou
 * POST para o mesmo arquivo PHP.
 */
const API_BASE = `${ENDPOINT}/requisicoes.php`;

/**
 * Status que compõem a fila operacional.
 *
 * A tela mostra somente requisições em andamento.
 * ENTREGUE, RECUSADA e CANCELADA não aparecem aqui.
 */
const STATUS_FILA = "PENDENTE,EM_SEPARACAO,EM_TRANSITO";

/**
 * Labels amigáveis para cada status conhecido.
 *
 * Esses textos são exibidos nos badges e ajudam a evitar que o usuário veja os
 * códigos técnicos da API.
 */
const STATUS_LABEL: Record<StatusId, string> = {
    PENDENTE: "Pendente",
    EM_SEPARACAO: "Em separação",
    EM_TRANSITO: "Em trânsito",
    ENTREGUE: "Entregue",
    CANCELADA: "Cancelada",
    RECUSADA: "Recusada",
};

/**
 * Classes visuais dos badges por status.
 *
 * Centralizar essas classes evita duplicação e mantém a aparência dos status
 * consistente em toda a tela.
 */
const STATUS_BADGE_CLASS: Record<StatusId, string> = {
    PENDENTE: "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
    EM_SEPARACAO: "border-[#3D6A99] bg-[#3D6A99] text-white",
    EM_TRANSITO: "border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]",
    ENTREGUE: "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white",
    CANCELADA: "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]",
    RECUSADA: "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
};

/**
 * Normaliza qualquer valor recebido para um StatusId conhecido.
 *
 * A API pode retornar string, null, undefined ou valores inesperados. Esta
 * função protege o restante da interface garantindo que sempre haverá um status
 * válido para labels, cores e regras de ação.
 */
function toStatus(v: unknown): StatusId {
    const s = String(v || "").toUpperCase();

    if (
        s === "PENDENTE" ||
        s === "EM_SEPARACAO" ||
        s === "EM_TRANSITO" ||
        s === "ENTREGUE" ||
        s === "CANCELADA" ||
        s === "RECUSADA"
    ) {
        return s;
    }

    return "PENDENTE";
}

/**
 * Retorna o texto amigável de um status.
 *
 * Usa `toStatus` antes de consultar o mapa, então também funciona quando a API
 * envia status em formatos inesperados.
 */
function statusLabel(v: unknown) {
    return STATUS_LABEL[toStatus(v)] || String(v || "");
}

/**
 * Retorna as classes Tailwind correspondentes ao status.
 *
 * Essa função é usada pelo componente Badge para aplicar a cor correta.
 */
function statusClass(v: unknown) {
    return STATUS_BADGE_CLASS[toStatus(v)] || STATUS_BADGE_CLASS.PENDENTE;
}

/**
 * Converte valores numéricos vindos da API ou do formulário para number.
 *
 * A função aceita números em string com vírgula decimal, como `"10,5"`.
 * Quando o valor não pode ser convertido, retorna 0 para evitar erro na tela.
 */
function asNumber(v: unknown) {
    const n = Number(String(v ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Formata um número para o padrão brasileiro.
 *
 * Usado para exibir quantidades solicitadas e saldos disponíveis no modal de
 * envio. Por padrão, permite até três casas decimais.
 */
function numberBR(v: unknown, decimals = 3) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(asNumber(v));
}

/**
 * Converte valores decimais para o formato esperado pela API.
 *
 * O usuário ou a própria API podem trabalhar com valores brasileiros, como
 * `"1.234,56"`. Para envio ao backend, a função remove separadores de milhar e
 * troca vírgula decimal por ponto.
 */
function decimalToApi(v: string | number | null | undefined) {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";

    const raw = String(v ?? "0").trim();
    if (!raw) return "0";

    if (raw.includes(",")) {
        return raw.replace(/\./g, "").replace(",", ".");
    }

    return raw.replace(/[^0-9.\-]/g, "");
}

/**
 * Formata data e hora para exibição em português do Brasil.
 *
 * A API pode retornar datas no formato `"YYYY-MM-DD HH:mm:ss"`. O JavaScript
 * interpreta melhor datas com `T`, então a função normaliza o valor antes de
 * criar o objeto Date.
 *
 * Se a data estiver vazia, retorna `-`. Se for inválida, retorna o valor
 * original para não esconder informação útil para diagnóstico.
 */
function fmtDateTime(value?: string | null) {
    if (!value) return "-";

    try {
        const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
        const d = new Date(normalized);

        if (Number.isNaN(d.getTime())) return String(value);

        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(d);
    } catch {
        return String(value);
    }
}

/**
 * Resolve o texto do destino da requisição.
 *
 * Prioriza o nome cadastrado da unidade. Caso não exista, usa o texto livre
 * retornado pela API. Se nenhum dos dois vier preenchido, exibe `-`.
 */
function destinationText(row?: ReqListRow | ReqDetail | null) {
    if (!row) return "-";
    return row.unidade_destino_nome || row.unidade_destino_texto || "-";
}

/**
 * Retorna o ID do depósito de destino quando a requisição realmente tem
 * destino do tipo DEPOSITO.
 *
 * Essa função centraliza a regra que impede uma transferência de sair e chegar
 * ao mesmo depósito. Destinos do tipo CONSUMO não participam dessa comparação.
 */
function destinationDepositId(row?: ReqListRow | ReqDetail | null) {
    if (!row) return 0;

    const tipo = String(row.destino_tipo || "").trim().toUpperCase();
    if (tipo !== "DEPOSITO") return 0;

    const id = Number(row.unidade_destino_id || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
}


/**
 * Verifica se um depósito consegue atender integralmente uma requisição.
 *
 * As quantidades são somadas por produto antes da comparação. Isso evita um
 * falso positivo quando o mesmo produto aparece em mais de uma linha da
 * requisição.
 */
function depositoAtendeRequisicao(depositoId: number, req: ReqDetail | null | undefined, saldoMap: Map<string, number>) {
    if (depositoId <= 0 || !req?.items?.length) return false;

    const necessarioPorProduto = new Map<number, number>();

    for (const item of req.items) {
        const produtoId = Number(item.produto_id);
        const qtd = asNumber(item.quantidade_solicitada);

        if (produtoId <= 0 || qtd <= 0) return false;

        necessarioPorProduto.set(produtoId, (necessarioPorProduto.get(produtoId) || 0) + qtd);
    }

    for (const [produtoId, necessario] of necessarioPorProduto) {
        const disponivel = saldoMap.get(`${produtoId}:${depositoId}`) || 0;
        if (necessario - 0.0001 > disponivel) return false;
    }

    return true;
}

/**
 * Retorna o código exibido da requisição.
 *
 * Se a API enviar `codigo`, ele é usado. Caso contrário, cria um código visual
 * simples a partir do ID.
 */
function reqCode(row?: ReqListRow | ReqDetail | null) {
    if (!row) return "REQ";
    return row.codigo || `REQ-${row.id}`;
}

/**
 * Converte diferentes representações de verdadeiro para boolean.
 *
 * A API pode retornar 1, "1", true ou "true". Essa função padroniza a leitura,
 * usada principalmente para identificar requisições atrasadas há mais de 24h.
 */
function isTruthy(v: unknown) {
    return v === 1 || v === "1" || v === true || String(v).toLowerCase() === "true";
}

/**
 * Lê a resposta HTTP garantindo que ela seja JSON.
 *
 * Se a API retornar HTML, texto puro ou um erro de servidor fora do formato
 * esperado, a função lança uma mensagem com o início da resposta para facilitar
 * manutenção e diagnóstico.
 */
async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada. ${txt ? txt.slice(0, 180) : ""}`.trim());
    }

    return (await r.json()) as T;
}

/**
 * Helper para requisições GET.
 *
 * Monta a URL com query string a partir de um objeto, ignorando parâmetros
 * vazios ou indefinidos. Também envia cookies de sessão com `credentials:
 * "include"`, permitindo que a API identifique o usuário logado.
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

    return safeJson<T>(r);
}

/**
 * Helper para requisições POST.
 *
 * Envia o corpo como JSON e inclui os cookies da sessão. É usado nas ações que
 * alteram o estado da requisição.
 */
async function apiPost<T>(body: Record<string, unknown>) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return safeJson<T>(r);
}

/* =========================================================
   Peças visuais (mockup Requisições, 06/10/2026)
   Celular: botões e campos de 48px; computador (lg): botões de 44px.
   ========================================================= */

const BTN_BASE =
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] font-bold outline-none transition disabled:cursor-not-allowed disabled:opacity-45 lg:h-11 lg:border";
/** Tamanho normal e o compacto do botão principal do card (texto longo "Aguardando recebimento"). */
const BTN_TAM = "px-[18px] text-[15px] lg:text-sm";
const BTN_TAM_COMPACTO = "px-2 text-center text-sm leading-tight";

/**
 * Card base da página.
 *
 * Centraliza borda, fundo e arredondamento. Assim, qualquer mudança
 * visual nos cards pode ser feita em um único lugar.
 */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]", className].join(" ")}>{children}</section>;
}

/**
 * Botão reutilizável da página.
 *
 * `variant` define o estilo:
 * `solid` para ação principal,
 * `ghost` para ação secundária,
 * `danger` para ação destrutiva ou sensível, como recusar uma requisição.
 */
function Button({
    children,
    variant = "solid",
    compacto = false,
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "danger"; compacto?: boolean }) {
    const cls =
        variant === "danger"
            ? "border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
            : variant === "ghost"
                ? "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]"
                : "border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";

    return (
        <button {...props} className={[BTN_BASE, compacto ? BTN_TAM_COMPACTO : BTN_TAM, cls, className].join(" ")}>
            {children}
        </button>
    );
}

/**
 * Wrapper para campos de formulário.
 *
 * Renderiza um rótulo padronizado (maiúsculas, como no mockup) acima do campo.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">{label}</span>
            {children}
        </label>
    );
}

const CAMPO =
    "block w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-70 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

/**
 * Select padronizado (48px, sem borda, fundo de campo).
 */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={[CAMPO, "h-12", props.className || ""].join(" ")} />;
}

/**
 * Textarea padronizado. Usado para observação e motivo de recusa.
 */
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={[CAMPO, "resize-y py-3", props.className || ""].join(" ")} />;
}

/**
 * Badge visual para status.
 */
function Badge({ status }: { status: unknown }) {
    return (
        <span className={["inline-flex h-[26px] items-center whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-extrabold", statusClass(status)].join(" ")}>
            {statusLabel(status)}
        </span>
    );
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
 * (botões à direita, Voltar → ação). Celular: folha que sobe de baixo, com os botões
 * lado a lado no rodapé. Esc fecha.
 */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    footer,
    children,
    maxWidth = "lg:max-w-[520px]",
}: {
    open: boolean;
    title: string;
    subtitle?: React.ReactNode;
    onClose: () => void;
    footer: React.ReactNode;
    children: React.ReactNode;
    maxWidth?: string;
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
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6" role="dialog" data-pai-overlay aria-modal="true" aria-label={title}>
                <div className={["flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]", maxWidth].join(" ")}>
                    <div className="flex items-start gap-2 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:gap-3 lg:px-6 lg:py-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{title}</h2>
                            {subtitle ? <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1 lg:text-sm">{subtitle}</p> : null}
                        </div>
                        <button className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]" type="button" onClick={onClose} aria-label="Fechar">
                            <IconX size={20} stroke={1.8} />
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
 * Linha de item dentro das janelas de separação e envio.
 */
function ItemLinhaJanela({ nome, invalid = false, children }: { nome: string; invalid?: boolean; children: React.ReactNode }) {
    return (
        <div
            className={[
                "rounded-[14px] border px-3.5 py-2.5 lg:px-4 lg:py-3",
                invalid
                    ? "border-[#B42318] bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15"
                    : "border-[#E3E8F0] bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#1C2334]",
            ].join(" ")}
        >
            <p className="text-sm font-extrabold text-[#313C55] dark:text-white lg:text-base">{nome}</p>
            <p className="mt-0.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] [&_b]:text-[#313C55] dark:[&_b]:text-white">{children}</p>
        </div>
    );
}

/**
 * Estado vazio da fila.
 *
 * Aparece quando não há nenhuma requisição em andamento. Requisições entregues,
 * recusadas ou canceladas saem automaticamente desta tela, então não aparecem
 * como histórico aqui.
 */
function EmptyState() {
    return (
        <Card className="p-5 text-center lg:p-8">
            <h3 className="text-[15px] font-extrabold text-[#313C55] dark:text-white lg:text-base">Nenhuma requisição em andamento</h3>
            <p className="mt-1.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:text-sm">Quando uma requisição for concluída, recusada ou cancelada, ela sai automaticamente desta tela.</p>
        </Card>
    );
}

/**
 * Página principal de operação de requisições.
 *
 * Esta tela é voltada ao operador responsável pelo fluxo operacional:
 * iniciar separação, enviar materiais e recusar requisições quando necessário.
 * O recebimento é confirmado exclusivamente pelo solicitante.
 */
export default function OperarRequisicoesPage() {
    /**
     * Dados estruturais carregados no início.
     *
     * `me` identifica o operador logado.
     * `depositos` alimenta o select de depósito de origem no envio.
     * `saldos` permite validar se há quantidade suficiente antes do envio.
     * `rows` contém a fila de requisições em andamento.
     */
    const [me, setMe] = useState<Me | null>(null);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [rows, setRows] = useState<ReqListRow[]>([]);

    /**
     * Estados gerais de interface.
     *
     * `loading` controla o carregamento inicial ou atualização geral.
     * `busy` bloqueia ações concorrentes enquanto uma operação está em andamento.
     * `error` exibe mensagens de erro.
     * `okMsg` exibe mensagens de sucesso.
     */
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [okMsg, setOkMsg] = useState("");

    /**
     * Estados do modal de início da separação.
     *
     * A origem passa a ser definida antes da mudança para EM_SEPARACAO.
     * A lista mostra somente depósitos capazes de atender todos os itens.
     */
    const [separationOpen, setSeparationOpen] = useState(false);
    const [separationReq, setSeparationReq] = useState<ReqDetail | null>(null);
    const [separationDepositoId, setSeparationDepositoId] = useState<number>(0);
    const [separationObs, setSeparationObs] = useState("");

    /**
     * Estados do modal de envio.
     *
     * `sendReq` guarda a requisição detalhada, já com itens.
     * `sendDepositoId` guarda o depósito escolhido como origem.
     * `sendObs` guarda uma observação opcional para o envio.
     */
    const [sendOpen, setSendOpen] = useState(false);
    const [sendReq, setSendReq] = useState<ReqDetail | null>(null);
    const [sendDepositoId, setSendDepositoId] = useState<number>(0);
    const [sendObs, setSendObs] = useState("");

    /**
     * Estados do modal de recusa.
     *
     * `rejectReq` guarda a requisição que será recusada.
     * `rejectReason` guarda o motivo obrigatório informado pelo operador.
     */
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReq, setRejectReq] = useState<ReqListRow | null>(null);
    const [rejectReason, setRejectReason] = useState("");

    /**
     * Mapa de saldos por produto e depósito.
     *
     * A chave segue o formato `produto_id:deposito_id`. Isso permite consultar
     * rapidamente o saldo disponível de cada item no depósito selecionado, sem
     * precisar varrer o array de saldos a cada validação.
     */
    const saldoMap = useMemo(() => {
        const map = new Map<string, number>();

        for (const s of saldos) {
            map.set(`${Number(s.produto_id)}:${Number(s.deposito_id)}`, asNumber(s.quantidade));
        }

        return map;
    }, [saldos]);

    /**
     * Destino e depósitos elegíveis para iniciar a separação.
     *
     * Um depósito só aparece se não for o próprio destino e se tiver saldo
     * suficiente para atender integralmente todos os itens solicitados.
     */
    const separationDestinationDepositoId = useMemo(() => destinationDepositId(separationReq), [separationReq]);

    const separationDepositosDisponiveis = useMemo(() => {
        if (!separationReq?.items?.length) return [];

        return depositos.filter((d) => {
            const depositoId = Number(d.id);
            if (separationDestinationDepositoId > 0 && depositoId === separationDestinationDepositoId) return false;
            return depositoAtendeRequisicao(depositoId, separationReq, saldoMap);
        });
    }, [depositos, saldoMap, separationDestinationDepositoId, separationReq]);

    const separationValidation = useMemo(() => {
        if (!separationReq) return { ok: false, msg: "Requisição não carregada." };
        if (!separationReq.items?.length) return { ok: false, msg: "Requisição sem itens." };
        if (!separationDepositosDisponiveis.length) {
            return { ok: false, msg: "Nenhum estoque possui saldo suficiente para atender todos os itens desta requisição." };
        }
        if (!separationDepositoId) return { ok: false, msg: "Selecione o estoque de origem." };

        const permitido = separationDepositosDisponiveis.some((d) => Number(d.id) === Number(separationDepositoId));
        if (!permitido) return { ok: false, msg: "O estoque selecionado não consegue atender integralmente esta requisição." };

        return { ok: true, msg: "Estoque com saldo suficiente para iniciar a separação." };
    }, [separationDepositoId, separationDepositosDisponiveis, separationReq]);

    /**
     * Depósito de destino da requisição aberta no modal de envio.
     */
    const sendDestinationDepositoId = useMemo(() => destinationDepositId(sendReq), [sendReq]);

    /**
     * Na nova regra, a origem já vem registrada desde o início da separação.
     * Para registros antigos sem origem, o fallback mostra somente depósitos que
     * conseguem atender integralmente a requisição.
     */
    const sendDepositosPermitidos = useMemo(() => {
        if (!sendReq?.items?.length) return [];

        const origemRegistrada = Number(sendReq.deposito_origem_id || 0);
        const base = depositos.filter((d) => {
            const depositoId = Number(d.id);
            return !(sendDestinationDepositoId > 0 && depositoId === sendDestinationDepositoId);
        });

        if (origemRegistrada > 0) {
            return base.filter((d) => Number(d.id) === origemRegistrada);
        }

        return base.filter((d) => depositoAtendeRequisicao(Number(d.id), sendReq, saldoMap));
    }, [depositos, saldoMap, sendDestinationDepositoId, sendReq]);

    /**
     * Carrega dados iniciais da tela.
     *
     * Busca operador logado, lista de depósitos e saldos atuais. Esses dados são
     * necessários antes de enviar uma requisição, pois o envio depende de origem
     * e disponibilidade de estoque.
     */
    const loadInit = useCallback(async () => {
        const data = await apiGet<InitResp>({ action: "init" });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar a tela.");

        setMe(data.me || null);
        setDepositos(data.depositos || []);
        setSaldos(data.saldos || []);
    }, []);

    /**
     * Carrega a fila de requisições em andamento.
     *
     * Usa `STATUS_FILA` para limitar a listagem aos status operacionais:
     * pendente, em separação e em trânsito.
     */
    const loadRows = useCallback(async () => {
        const data = await apiGet<ListResp>({
            action: "fila",
            status: STATUS_FILA,
            limit: 200,
        });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar as requisições.");

        setRows(data.rows || []);
    }, []);

    /**
     * Atualiza todos os dados da tela.
     *
     * Recarrega tanto os dados estruturais quanto a fila. É usado no primeiro
     * carregamento e no botão Atualizar.
     */
    const refreshAll = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            await loadInit();
            await loadRows();
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, [loadInit, loadRows]);

    /**
     * Executa o carregamento inicial quando a página é montada.
     */
    useEffect(() => {
        void refreshAll();
    }, [refreshAll]);

    /**
     * Recarrega dados após uma ação bem sucedida.
     *
     * É usado depois de iniciar separação, enviar ou recusar. Recarregar
     * os dados garante que a fila, os saldos e os status fiquem sincronizados com
     * o backend.
     */
    async function refreshAfterAction(msg?: string) {
        await loadInit();
        await loadRows();

        if (msg) setOkMsg(msg);
    }

    /**
     * Prepara o início da separação.
     *
     * Busca os itens antes de abrir o modal, porque a elegibilidade do estoque
     * depende dos produtos e das quantidades solicitadas.
     */
    async function prepareSeparation(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id: row.id });

            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar os itens da requisição.");
            if (!data.row.items?.length) throw new Error("A requisição não possui itens para separar.");

            const destinoId = destinationDepositId(data.row);
            const candidatos = depositos.filter((d) => {
                const depositoId = Number(d.id);
                if (destinoId > 0 && depositoId === destinoId) return false;
                return depositoAtendeRequisicao(depositoId, data.row, saldoMap);
            });

            setSeparationReq(data.row);
            setSeparationDepositoId(candidatos.length === 1 ? Number(candidatos[0].id) : 0);
            setSeparationObs("");
            setSeparationOpen(true);
        } catch (e: any) {
            setError(e?.message || "Erro ao preparar a separação.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Confirma o início da separação já vinculando o estoque de origem.
     *
     * O backend repete a validação de saldo, portanto uma alteração concorrente
     * no estoque entre a abertura do modal e a confirmação não passa em silêncio.
     */
    async function confirmStartSeparation() {
        if (!separationReq || !separationValidation.ok || busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({
                action: "iniciar_separacao",
                id: separationReq.id,
                deposito_origem_id: separationDepositoId,
                observacao: separationObs.trim(),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível iniciar a separação.");

            setSeparationOpen(false);
            setSeparationReq(null);
            setSeparationDepositoId(0);
            setSeparationObs("");

            await refreshAfterAction(data.msg || "Separação iniciada. Origem registrada.");
        } catch (e: any) {
            setError(e?.message || "Erro ao iniciar separação.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Prepara o modal de envio de material.
     *
     * Antes de enviar, a tela precisa buscar os detalhes da requisição para obter
     * os itens. Depois disso, define o depósito de origem padrão quando possível
     * e abre o modal.
     */
    async function prepareSend(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id: row.id });

            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar os itens da requisição.");

            const destinoId = destinationDepositId(data.row);
            const origemAtual = Number(data.row.deposito_origem_id || 0);
            const base = depositos.filter((d) => !(destinoId > 0 && Number(d.id) === destinoId));
            const depositosPermitidos = origemAtual > 0
                ? base.filter((d) => Number(d.id) === origemAtual)
                : base.filter((d) => depositoAtendeRequisicao(Number(d.id), data.row, saldoMap));

            const origemAtualPermitida =
                origemAtual > 0 &&
                depositosPermitidos.some((d) => Number(d.id) === origemAtual);

            const origemInicial = origemAtualPermitida
                ? origemAtual
                : depositosPermitidos.length === 1
                    ? Number(depositosPermitidos[0].id)
                    : 0;

            setSendReq(data.row);
            setSendDepositoId(origemInicial);
            setSendObs("");
            setSendOpen(true);
        } catch (e: any) {
            setError(e?.message || "Erro ao preparar envio.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Validação do envio de material.
     *
     * Verifica se:
     * 1. A requisição detalhada foi carregada.
     * 2. Existem itens na requisição.
     * 3. Existe pelo menos um depósito permitido como origem.
     * 4. Um depósito de origem foi selecionado.
     * 5. A origem não é o mesmo depósito do destino.
     * 6. Todas as quantidades solicitadas são válidas.
     * 7. O depósito selecionado possui saldo suficiente para cada item.
     *
     * O uso de `useMemo` evita recalcular a validação inteira em todo render,
     * recalculando somente quando mudam a requisição, o depósito ou os saldos.
     */
    const sendValidation = useMemo(() => {
        if (!sendReq) return { ok: false, msg: "Requisição não carregada." };
        if (!sendReq.items?.length) return { ok: false, msg: "Requisição sem itens." };
        if (!sendDepositosPermitidos.length) {
            return { ok: false, msg: "Não há estoque elegível para esta requisição." };
        }
        if (!sendDepositoId) return { ok: false, msg: "Selecione o depósito de origem." };

        const destinoId = destinationDepositId(sendReq);

        if (destinoId > 0 && Number(sendDepositoId) === destinoId) {
            return { ok: false, msg: "O depósito de origem não pode ser o mesmo depósito de destino." };
        }

        const origemPermitida = sendDepositosPermitidos.some((d) => Number(d.id) === Number(sendDepositoId));
        if (!origemPermitida) {
            return { ok: false, msg: "Depósito de origem inválido para esta requisição." };
        }

        const necessarioPorProduto = new Map<number, { quantidade: number; nome: string }>();

        for (const item of sendReq.items) {
            const produtoId = Number(item.produto_id);
            const qtd = asNumber(item.quantidade_solicitada);
            const nome = item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`;

            if (produtoId <= 0 || qtd <= 0) return { ok: false, msg: `Quantidade inválida para ${nome}.` };

            const atual = necessarioPorProduto.get(produtoId);
            necessarioPorProduto.set(produtoId, {
                quantidade: (atual?.quantidade || 0) + qtd,
                nome: atual?.nome || nome,
            });
        }

        for (const [produtoId, requisito] of necessarioPorProduto) {
            const disponivel = saldoMap.get(`${produtoId}:${sendDepositoId}`) || 0;
            if (requisito.quantidade - 0.0001 > disponivel) {
                return { ok: false, msg: `Saldo insuficiente para ${requisito.nome}.` };
            }
        }

        return { ok: true, msg: "Saldo suficiente para todos os itens. Pode enviar." };
    }, [saldoMap, sendDepositoId, sendDepositosPermitidos, sendReq]);

    /**
     * Confirma o envio do material.
     *
     * Envia para a API o depósito de origem, observação opcional e a lista de
     * itens com quantidade enviada. Nesta versão, a quantidade enviada é igual à
     * quantidade solicitada.
     */
    async function confirmSend() {
        if (!sendReq || !sendValidation.ok || busy) return;

        const destinoId = destinationDepositId(sendReq);
        if (destinoId > 0 && Number(sendDepositoId) === destinoId) {
            setError("O depósito de origem não pode ser o mesmo depósito de destino.");
            return;
        }

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({
                action: "enviar_material",
                id: sendReq.id,
                deposito_origem_id: sendDepositoId,
                observacao: sendObs.trim(),
                itens: (sendReq.items || []).map((it) => ({
                    id: it.id,
                    quantidade_enviada: decimalToApi(it.quantidade_solicitada),
                })),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível enviar o material.");

            setSendOpen(false);
            setSendReq(null);
            setSendObs("");

            await refreshAfterAction(data.msg || "Material enviado. Aguardando confirmação do solicitante.");
        } catch (e: any) {
            setError(e?.message || "Erro ao enviar material.");
        } finally {
            setBusy(false);
        }
    }


    /**
     * Abre o modal de recusa.
     *
     * Limpa mensagens anteriores e zera o motivo para evitar reaproveitar texto
     * digitado em outra requisição.
     */
    function openReject(row: ReqListRow) {
        setRejectReq(row);
        setRejectReason("");
        setRejectOpen(true);
        setError("");
        setOkMsg("");
    }

    /**
     * Confirma a recusa da requisição.
     *
     * O motivo é obrigatório. Após sucesso, fecha o modal, limpa os estados e
     * recarrega os dados para remover ou atualizar a requisição na fila.
     */
    async function confirmReject() {
        if (!rejectReq || busy) return;

        if (!rejectReason.trim()) {
            setError("Informe o motivo da recusa.");
            return;
        }

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({
                action: "recusar",
                id: rejectReq.id,
                motivo: rejectReason.trim(),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível recusar a requisição.");

            setRejectOpen(false);
            setRejectReq(null);
            setRejectReason("");

            await refreshAfterAction(data.msg || "Requisição recusada.");
        } catch (e: any) {
            setError(e?.message || "Erro ao recusar requisição.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Decide qual ação operacional executar conforme o status atual.
     *
     * PENDENTE inicia separação.
     * EM_SEPARACAO abre o fluxo de envio.
     * EM_TRANSITO fica aguardando a confirmação do solicitante.
     */
    async function handleMainAction(row: ReqListRow) {
        const status = toStatus(row.status);

        if (status === "PENDENTE") {
            await prepareSeparation(row);
            return;
        }

        if (status === "EM_SEPARACAO") {
            await prepareSend(row);
        }
    }

    const closeSeparation = useCallback(() => setSeparationOpen(false), []);
    const closeSend = useCallback(() => setSendOpen(false), []);
    const closeReject = useCallback(() => setRejectOpen(false), []);

    /** Origem já registrada na separação: no envio ela aparece como campo só de leitura (mockup). */
    const sendOrigemTravada = Number(sendReq?.deposito_origem_id || 0) > 0;
    const sendOrigemNome =
        sendDepositosPermitidos.find((d) => Number(d.id) === Number(sendDepositoId))?.nome || sendReq?.deposito_origem_nome || "-";

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 pb-5 pt-4 lg:gap-4 lg:px-10 lg:pb-12 lg:pt-8">
                <header className="flex items-start gap-3 lg:mb-2 lg:gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-extrabold leading-tight text-[#313C55] dark:text-white lg:text-[28px]">Requisições</h1>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Separe e envie os materiais. Requisições em trânsito aguardam confirmação do solicitante.</p>
                        {me?.nome ? <p className="mt-1 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Operador: {me.nome}</p> : null}
                    </div>

                    {/* Celular: o mockup não tem o botão; mantido discreto (ícone 44px) para não perder a função. */}
                    <button
                        type="button"
                        onClick={refreshAll}
                        disabled={loading || busy}
                        aria-label="Atualizar"
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:text-white dark:hover:bg-white/[0.08] lg:hidden"
                    >
                        <IconRefresh size={20} stroke={1.8} />
                    </button>

                    <Button type="button" variant="ghost" onClick={refreshAll} disabled={loading || busy} className="max-lg:hidden">
                        <IconRefresh size={20} stroke={1.8} />
                        Atualizar
                    </Button>
                </header>

                {error ? <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{error}</div> : null}
                {okMsg ? <div role="status" className="rounded-[14px] border border-[#B3CE52] bg-[#EEF5D6] px-4 py-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white">{okMsg}</div> : null}

                {loading ? (
                    <Card className="p-5 text-center text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:p-8">Carregando...</Card>
                ) : rows.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-1 items-start gap-3 max-lg:landscape:grid-cols-2 lg:gap-4">
                        {rows.map((row) => (
                            <RequestCard
                                key={row.id}
                                row={row}
                                busy={busy}
                                onMain={() => handleMainAction(row)}
                                onReject={() => openReject(row)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <Modal
                open={separationOpen}
                title={separationReq ? `Iniciar separação ${reqCode(separationReq)}` : "Iniciar separação"}
                subtitle={
                    <>
                        <span className="lg:hidden">Escolha o estoque de origem. Só aparecem estoques com saldo suficiente para toda a requisição.</span>
                        <span className="hidden lg:inline">Selecione de qual estoque os itens serão separados. São exibidos somente estoques com saldo suficiente para atender integralmente a requisição.</span>
                    </>
                }
                onClose={closeSeparation}
                maxWidth="lg:max-w-[640px]"
                footer={
                    <>
                        <Button type="button" variant="ghost" onClick={closeSeparation}>
                            Voltar
                        </Button>
                        <Button type="button" onClick={confirmStartSeparation} disabled={busy || !separationValidation.ok}>
                            Iniciar separação
                        </Button>
                    </>
                }
            >
                <div>
                    <Field label="Estoque de origem">
                        <Select
                            value={separationDepositoId || ""}
                            onChange={(e) => setSeparationDepositoId(Number(e.target.value || 0))}
                            disabled={busy || separationDepositosDisponiveis.length === 0}
                        >
                            <option value="">Selecione...</option>
                            {separationDepositosDisponiveis.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    {separationDestinationDepositoId > 0 ? (
                        <p className="mt-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Destino: <b className="text-[#313C55] dark:text-white">{destinationText(separationReq)}</b>.{" "}
                            <span className="lg:hidden">O destino não pode ser a origem.</span>
                            <span className="hidden lg:inline">O estoque de destino não pode ser usado como origem.</span>
                        </p>
                    ) : null}
                </div>

                {separationDepositosDisponiveis.length === 0 ? (
                    <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        Nenhum estoque possui saldo suficiente para atender todos os itens desta requisição.
                    </div>
                ) : null}

                <div className="flex flex-col gap-2">
                    {(separationReq?.items || []).map((item) => {
                        const disponivel = separationDepositoId ? saldoMap.get(`${Number(item.produto_id)}:${separationDepositoId}`) || 0 : 0;

                        return (
                            <ItemLinhaJanela key={item.id} nome={item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`}>
                                Solicitado: <b>{numberBR(item.quantidade_solicitada)}</b>
                                {separationDepositoId ? <> | Disponível: <b>{numberBR(disponivel)}</b></> : null}
                            </ItemLinhaJanela>
                        );
                    })}
                </div>

                <Field label="Observação, opcional">
                    <TextArea rows={3} value={separationObs} onChange={(e) => setSeparationObs(e.target.value)} className="max-lg:h-[74px]" />
                </Field>

                {/* Validação mantida; só aparece quando há problema com o estoque escolhido (o mockup não tem este quadro). */}
                {!separationValidation.ok && separationDepositoId > 0 && separationDepositosDisponiveis.length > 0 ? (
                    <div className="rounded-[14px] border border-[#E3E8F0] bg-[#FCF3CC] px-3.5 py-2.5 text-[13.5px] font-bold text-[#313C55] dark:border-white/[0.12] dark:bg-[#F2CB3F]/[0.16] dark:text-white lg:px-4 lg:py-3 lg:text-sm">
                        {separationValidation.msg}
                    </div>
                ) : null}
            </Modal>

            <Modal
                open={sendOpen}
                title={sendReq ? `Enviar ${reqCode(sendReq)}` : "Enviar requisição"}
                onClose={closeSend}
                maxWidth="lg:max-w-[640px]"
                footer={
                    <>
                        <Button type="button" variant="ghost" onClick={closeSend}>
                            Voltar
                        </Button>
                        <Button type="button" onClick={confirmSend} disabled={busy || !sendValidation.ok}>
                            Enviar
                        </Button>
                    </>
                }
            >
                <div>
                    {sendOrigemTravada ? (
                        <>
                            <p className="mb-2 text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">Depósito de origem</p>
                            <div className={[CAMPO, "flex h-12 items-center font-bold opacity-70"].join(" ")} aria-readonly="true">
                                {sendOrigemNome}
                            </div>
                        </>
                    ) : (
                        <Field label="Depósito de origem">
                            <Select
                                value={sendDepositoId || ""}
                                onChange={(e) => setSendDepositoId(Number(e.target.value || 0))}
                                disabled={busy || sendDepositosPermitidos.length === 0}
                            >
                                <option value="">Selecione...</option>
                                {sendDepositosPermitidos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}

                    {/* Celular: um texto só, como no mockup. */}
                    {sendOrigemTravada || sendDestinationDepositoId > 0 ? (
                        <p className="mt-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:hidden">
                            {sendOrigemTravada ? "Origem definida no início da separação e bloqueada nesta etapa. " : null}
                            {sendDestinationDepositoId > 0 ? (
                                <>
                                    Destino: <b className="text-[#313C55] dark:text-white">{destinationText(sendReq)}</b>.
                                </>
                            ) : null}
                        </p>
                    ) : null}

                    {sendOrigemTravada ? (
                        <p className="mt-1.5 hidden text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:block">
                            Origem definida no início da separação e bloqueada para alteração nesta etapa.
                        </p>
                    ) : null}

                    {sendDestinationDepositoId > 0 ? (
                        <p className={["hidden text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:block", sendOrigemTravada ? "mt-0.5" : "mt-1.5"].join(" ")}>
                            Destino: <b className="text-[#313C55] dark:text-white">{destinationText(sendReq)}</b>. O estoque de destino não pode ser selecionado como origem.
                        </p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-2">
                    {(sendReq?.items || []).map((item) => {
                        const qtd = asNumber(item.quantidade_solicitada);
                        const disponivel = sendDepositoId ? saldoMap.get(`${Number(item.produto_id)}:${sendDepositoId}`) || 0 : 0;
                        const invalid = sendDepositoId > 0 && qtd - 0.0001 > disponivel;

                        return (
                            <ItemLinhaJanela key={item.id} invalid={invalid} nome={item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`}>
                                Solicitado: <b>{numberBR(item.quantidade_solicitada)}</b> | Disponível: <b>{numberBR(disponivel)}</b>
                            </ItemLinhaJanela>
                        );
                    })}
                </div>

                <Field label="Observação, opcional">
                    <TextArea rows={3} value={sendObs} onChange={(e) => setSendObs(e.target.value)} className="max-lg:h-[74px]" />
                </Field>

                <div
                    className={[
                        "rounded-[14px] border border-[#E3E8F0] px-3.5 py-2.5 text-[13.5px] font-bold text-[#313C55] dark:border-white/[0.12] dark:text-white lg:px-4 lg:py-3 lg:text-sm",
                        sendValidation.ok ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/[0.18]" : "bg-[#FCF3CC] dark:bg-[#F2CB3F]/[0.16]",
                    ].join(" ")}
                >
                    {sendValidation.msg}
                </div>
            </Modal>

            <Modal
                open={rejectOpen}
                title={rejectReq ? `Recusar ${reqCode(rejectReq)}` : "Recusar requisição"}
                onClose={closeReject}
                footer={
                    <>
                        <Button type="button" variant="ghost" onClick={closeReject}>
                            Voltar
                        </Button>
                        <Button type="button" variant="danger" onClick={confirmReject} disabled={busy || !rejectReason.trim()}>
                            Confirmar recusa
                        </Button>
                    </>
                }
            >
                <Field label="Motivo da recusa obrigatório">
                    <TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Digite o motivo da recusa..." />
                </Field>
            </Modal>
        </main>
    );
}

/**
 * Card operacional de uma requisição.
 *
 * Mostra os principais dados da requisição e oferece duas ações:
 * ação principal do fluxo e recusa. A ação principal muda conforme o status:
 * PENDENTE abre a escolha de origem para "Iniciar", EM_SEPARACAO vira "Enviar" e EM_TRANSITO fica
 * aguardando a confirmação do solicitante.
 *
 * Computador (lg): dados à esquerda e botões numa coluna de 272px à direita.
 * Celular: tudo empilhado, botões embaixo (1,4fr / 1fr).
 */
function RequestCard({ row, busy, onMain, onReject }: { row: ReqListRow; busy: boolean; onMain: () => void; onReject: () => void }) {
    const status = toStatus(row.status);

    /**
     * Requisições só podem ser recusadas enquanto ainda não foram enviadas.
     */
    const canReject = status === "PENDENTE" || status === "EM_SEPARACAO";

    /**
     * Texto do botão principal, calculado a partir do status atual.
     */
    const mainLabel = status === "PENDENTE" ? "Iniciar" : status === "EM_SEPARACAO" ? "Enviar" : status === "EM_TRANSITO" ? "Aguardando recebimento" : "Finalizada";

    /**
     * Texto auxiliar que orienta o operador sobre o próximo passo do fluxo.
     */
    const nextText = status === "PENDENTE" ? "Próximo passo: escolher a origem e iniciar a separação" : status === "EM_SEPARACAO" ? "Origem definida. Próximo passo: enviar" : status === "EM_TRANSITO" ? "Aguardando o solicitante confirmar o recebimento" : "";

    const late = isTruthy(row.atrasada_24h);

    return (
        <Card className={late ? "border-[#F2CB3F] dark:border-[#F2CB3F]" : ""}>
            <div className="p-3.5 lg:flex lg:items-start lg:gap-6 lg:px-6 lg:py-5">
                <div className="min-w-0 lg:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-extrabold text-[#313C55] dark:text-white lg:text-lg">{reqCode(row)}</h2>
                        <Badge status={row.status} />
                        {late ? <span className="inline-flex h-[26px] items-center rounded-full border-[1.5px] border-[#F2CB3F] bg-[#F2CB3F] px-2.5 text-[12.5px] font-extrabold text-[#313C55]">+24h</span> : null}
                    </div>

                    <ItensTabela resumo={row.itens_resumo} className="mt-2.5 lg:mt-3" />

                    <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-1 lg:text-[13.5px] [&_b]:text-[#313C55] dark:[&_b]:text-white">
                        <p>
                            Solicitante: <b>{row.solicitante_nome || "-"}</b>
                        </p>
                        <p>
                            Destino: <b>{destinationText(row)}</b>
                        </p>
                        <p>
                            Aberta em: <b>{fmtDateTime(row.criado_em)}</b>
                        </p>
                        <p>
                            Atendimento: <b>{row.id_atendimento || "-"}</b>
                        </p>
                        {row.deposito_origem_nome ? (
                            <p>
                                Origem: <b>{row.deposito_origem_nome}</b>
                            </p>
                        ) : null}
                        {row.enviado_em ? (
                            <p>
                                Enviada em: <b>{fmtDateTime(row.enviado_em)}</b>
                            </p>
                        ) : null}
                    </div>

                    {nextText ? <p className="mt-2 text-[12.5px] font-extrabold text-[#5B6478] dark:text-[#AEB9CF] lg:mt-2.5 lg:text-[13px]">{nextText}</p> : null}
                </div>

                <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2 lg:mt-0 lg:w-[272px] lg:flex-none lg:grid-cols-2">
                    <Button
                        type="button"
                        onClick={onMain}
                        disabled={busy || status === "EM_TRANSITO" || status === "ENTREGUE" || status === "RECUSADA" || status === "CANCELADA"}
                        title={status === "EM_TRANSITO" ? "Somente o solicitante pode confirmar o recebimento." : undefined}
                        compacto
                    >
                        {mainLabel}
                    </Button>
                    <Button type="button" variant="danger" onClick={onReject} disabled={busy || !canReject} title={!canReject ? "Só é possível recusar pendente ou em separação." : undefined}>
                        Recusar
                    </Button>
                </div>
            </div>
        </Card>
    );
}
