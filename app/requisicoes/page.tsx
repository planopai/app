"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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
    PENDENTE: "border-amber-200 bg-amber-50 text-amber-800",
    EM_SEPARACAO: "border-sky-200 bg-sky-50 text-sky-800",
    EM_TRANSITO: "border-violet-200 bg-violet-50 text-violet-800",
    ENTREGUE: "border-emerald-200 bg-emerald-50 text-emerald-800",
    CANCELADA: "border-slate-200 bg-slate-100 text-slate-700",
    RECUSADA: "border-rose-200 bg-rose-50 text-rose-800",
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

/**
 * Componente base para blocos em formato de cartão.
 *
 * Centraliza borda, fundo, sombra e arredondamento. Assim, qualquer mudança
 * visual nos cards pode ser feita em um único lugar.
 */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
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
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "danger" }) {
    const base =
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-[15px] font-bold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const cls =
        variant === "danger"
            ? "border border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
            : variant === "ghost"
                ? "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                : "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

/**
 * Wrapper para campos de formulário.
 *
 * Renderiza um label padronizado acima do campo recebido em `children`.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
            {children}
        </label>
    );
}

/**
 * Select padronizado.
 *
 * Usado no modal de envio para escolher o depósito de origem. Aceita todas as
 * props nativas de um `<select>`.
 */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

/**
 * Textarea padronizado.
 *
 * Usado para observação de envio e motivo de recusa. Aceita todas as props
 * nativas de um `<textarea>`.
 */
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

/**
 * Badge visual para status.
 *
 * Usa as funções `statusLabel` e `statusClass` para transformar o status técnico
 * em texto amigável e cor correspondente.
 */
function Badge({ status }: { status: unknown }) {
    return <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", statusClass(status)].join(" ")}>{statusLabel(status)}</span>;
}

/**
 * Modal reutilizável.
 *
 * Responsabilidades:
 * 1. Criar a camada escura sobre a tela.
 * 2. Exibir título, botão de fechar e conteúdo.
 * 3. Bloquear o scroll do body enquanto estiver aberto.
 * 4. Permitir ajuste de largura máxima via `maxWidth`.
 */
function Modal({
    open,
    title,
    onClose,
    children,
    maxWidth = "max-w-xl",
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    maxWidth?: string;
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
        <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-start justify-center bg-slate-950/55 p-3 pt-5 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <div className={["flex max-h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl", maxWidth].join(" ")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <h2 className="truncate text-lg font-black text-slate-900">{title}</h2>
                    <button className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Fechar">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
            </div>
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
        <Card className="p-6 text-center">
            <h3 className="font-black text-slate-900">Nenhuma requisição em andamento</h3>
            <p className="mt-1 text-sm text-slate-600">Quando uma requisição for concluída, recusada ou cancelada, ela sai automaticamente desta tela.</p>
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
     * Inicia a separação de uma requisição pendente.
     *
     * Essa ação muda a requisição de PENDENTE para EM_SEPARACAO. Após sucesso,
     * a tela é atualizada e orienta o operador para o próximo passo.
     */
    async function startSeparation(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({ action: "iniciar_separacao", id: row.id });

            if (!data.ok) throw new Error(data.msg || "Não foi possível iniciar a separação.");

            await refreshAfterAction(data.msg || "Separação iniciada. Próximo passo: enviar.");
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

            setSendReq(data.row);
            setSendDepositoId(Number(data.row.deposito_origem_id || (depositos.length === 1 ? depositos[0].id : 0)));
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
     * 3. Um depósito de origem foi selecionado.
     * 4. Todas as quantidades solicitadas são válidas.
     * 5. O depósito selecionado possui saldo suficiente para cada item.
     *
     * O uso de `useMemo` evita recalcular a validação inteira em todo render,
     * recalculando somente quando mudam a requisição, o depósito ou os saldos.
     */
    const sendValidation = useMemo(() => {
        if (!sendReq) return { ok: false, msg: "Requisição não carregada." };
        if (!sendReq.items?.length) return { ok: false, msg: "Requisição sem itens." };
        if (!sendDepositoId) return { ok: false, msg: "Selecione o depósito de origem." };

        for (const item of sendReq.items) {
            const qtd = asNumber(item.quantidade_solicitada);
            const disponivel = saldoMap.get(`${Number(item.produto_id)}:${sendDepositoId}`) || 0;
            const nome = item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`;

            if (qtd <= 0) return { ok: false, msg: `Quantidade inválida para ${nome}.` };
            if (qtd - 0.0001 > disponivel) return { ok: false, msg: `Saldo insuficiente para ${nome}.` };
        }

        return { ok: true, msg: "Pronto para enviar." };
    }, [saldoMap, sendDepositoId, sendReq]);

    /**
     * Confirma o envio do material.
     *
     * Envia para a API o depósito de origem, observação opcional e a lista de
     * itens com quantidade enviada. Nesta versão, a quantidade enviada é igual à
     * quantidade solicitada.
     */
    async function confirmSend() {
        if (!sendReq || !sendValidation.ok || busy) return;

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
            await startSeparation(row);
            return;
        }

        if (status === "EM_SEPARACAO") {
            await prepareSend(row);
        }
    }

    return (
        <main className="min-h-[100dvh] bg-gray-50 px-3 py-4 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl space-y-4">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-950">Requisições</h1>
                        <p className="mt-1 text-sm text-slate-600">Separe e envie os materiais. Requisições em trânsito aguardam confirmação do solicitante.</p>
                        {me ? <p className="mt-1 text-xs text-slate-500">Operador: {me.nome || me.usuario}</p> : null}
                    </div>

                    <Button type="button" variant="ghost" onClick={refreshAll} disabled={loading || busy}>
                        Atualizar
                    </Button>
                </header>

                {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div> : null}
                {okMsg ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{okMsg}</div> : null}

                {loading ? (
                    <Card className="p-6 text-center text-sm font-bold text-slate-600">Carregando...</Card>
                ) : rows.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-3">
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

            <Modal open={sendOpen} title={sendReq ? `Enviar ${reqCode(sendReq)}` : "Enviar requisição"} onClose={() => setSendOpen(false)} maxWidth="max-w-2xl">
                <div className="space-y-4">
                    <Field label="Depósito de origem">
                        <Select value={sendDepositoId || ""} onChange={(e) => setSendDepositoId(Number(e.target.value || 0))}>
                            <option value="">Selecione...</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="space-y-2">
                        {(sendReq?.items || []).map((item) => {
                            const qtd = asNumber(item.quantidade_solicitada);
                            const disponivel = sendDepositoId ? saldoMap.get(`${Number(item.produto_id)}:${sendDepositoId}`) || 0 : 0;
                            const invalid = sendDepositoId > 0 && qtd - 0.0001 > disponivel;

                            return (
                                <div key={item.id} className={["rounded-2xl border p-3", invalid ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"].join(" ")}>
                                    <p className="font-bold text-slate-900">{item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`}</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        Solicitado: <b>{numberBR(item.quantidade_solicitada)}</b> | Disponível: <b>{numberBR(disponivel)}</b>
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <Field label="Observação, opcional">
                        <TextArea rows={3} value={sendObs} onChange={(e) => setSendObs(e.target.value)} />
                    </Field>

                    <div className={["rounded-2xl border p-3 text-sm font-bold", sendValidation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"].join(" ")}>
                        {sendValidation.msg}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" onClick={confirmSend} disabled={busy || !sendValidation.ok}>
                            Enviar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
                            Voltar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal open={rejectOpen} title={rejectReq ? `Recusar ${reqCode(rejectReq)}` : "Recusar requisição"} onClose={() => setRejectOpen(false)}>
                <div className="space-y-4">
                    <Field label="Motivo da recusa obrigatório">
                        <TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Digite o motivo da recusa..." />
                    </Field>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" variant="danger" onClick={confirmReject} disabled={busy || !rejectReason.trim()}>
                            Confirmar recusa
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
                            Voltar
                        </Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}

/**
 * Card operacional de uma requisição.
 *
 * Mostra os principais dados da requisição e oferece duas ações:
 * ação principal do fluxo e recusa. A ação principal muda conforme o status:
 * PENDENTE vira "Iniciar", EM_SEPARACAO vira "Enviar" e EM_TRANSITO fica
 * aguardando a confirmação do solicitante.
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
    const nextText = status === "PENDENTE" ? "Próximo passo: enviar" : status === "EM_SEPARACAO" ? "Após o envio, o solicitante confirma o recebimento" : status === "EM_TRANSITO" ? "Aguardando confirmação do solicitante" : "";

    return (
        <Card className={isTruthy(row.atrasada_24h) ? "border-rose-200" : ""}>
            <div className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black text-slate-950">{reqCode(row)}</h2>
                            <Badge status={row.status} />
                            {isTruthy(row.atrasada_24h) ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">+24h</span> : null}
                        </div>

                        <p className="mt-2 text-sm font-semibold text-slate-900">{row.itens_resumo || "Itens não informados"}</p>

                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
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

                        {nextText ? <p className="mt-2 text-xs font-bold text-slate-500">{nextText}</p> : null}
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                        <Button type="button" onClick={onMain} disabled={busy || status === "EM_TRANSITO" || status === "ENTREGUE" || status === "RECUSADA" || status === "CANCELADA"} title={status === "EM_TRANSITO" ? "Somente o solicitante pode confirmar o recebimento." : undefined}>
                            {mainLabel}
                        </Button>
                        <Button type="button" variant="danger" onClick={onReject} disabled={busy || !canReject} title={!canReject ? "Só é possível recusar pendente ou em separação." : undefined}>
                            Recusar
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}