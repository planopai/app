"use client";

/**
 * OS do atendimento: as folhas das OS (convênio e diferença da família), lado a lado em abas, com
 *  - alteração de valor e desconto pelo ícone de cada item da folha e pelo botão "Desconto geral";
 *  - confirmação dos valores e assinatura (com pagamento no ato e nota promissória do saldo) ali mesmo.
 *
 * Usada de dois jeitos:
 *  - sobreposta ao "Editar registro" (botão "Ver OS e colher assinatura" da coluna lateral);
 *  - na página /os/minhas?atendimento=<id> (links antigos).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ItensOSAjuste from "./ItensOSAjuste";
import { baixarPdfDaOS, prepararPdfDaOS } from "./ListaOS";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const ORIGEM_API = new URL(API_BASE).origin;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const texto = await res.text();
    let json: any = null;
    try {
        json = texto ? JSON.parse(texto) : null;
    } catch {
        json = null;
    }
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    // Resposta que não é JSON (aviso do PHP antes do JSON, por exemplo): mostra o começo do texto em vez de sumir com a OS.
    if (json === null) throw new Error(`Resposta inválida do servidor: ${texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "vazia"}`);
    return json;
}
function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}
function osPost(acao: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && body.set(k, String(v)));
    return apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls =
    "w-full min-w-0 rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-base sm:text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#3D6A99] dark:focus:border-[#3D6A99]";
const FORMAS = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "TRANSFERENCIA", "CHEQUE", "BOLETO", "OUTRO"];
const BTN_PRI = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_SEC = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10";

function Tag({ children, bg = "#EEF1F5" }: { children: React.ReactNode; bg?: string }) {
    return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]" style={{ background: bg }}>{children}</span>;
}
/** Situação (09/10/2026): Aberta (creme) → Concluída (azul aço) → Assinada (verde). */
export function situacaoOS(l: any) {
    if (l.status === "CONVERTIDA") return <Tag>CONVERTIDA</Tag>;
    if (l.status === "FECHADA") return l.assinada_em ? <Tag bg="#E6F0C9">ASSINADA</Tag> : <Tag bg="#DCE5F0">CONCLUÍDA</Tag>;
    if (l.status === "AGUARDANDO_ASSINATURA") return <Tag bg="#FBEFC4">AGUARDANDO ASSINATURA</Tag>;
    if (l.status === "CANCELADA") return <Tag>CANCELADA</Tag>;
    return <Tag bg="#FFF8E1">ABERTA</Tag>;
}

/** Etiqueta "A RECEBER R$ x" (amarelo) da OS concluída com saldo. */
function TagAReceber({ valor }: { valor: number }) {
    return valor > 0.004 ? <Tag bg="#FCF3CC">A RECEBER {brl(valor)}</Tag> : <Tag bg="#E6F0C9">QUITADA</Tag>;
}

function IconeAjuste() {
    return (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    );
}

/* ---------------------------------------------------------------- Folha (iframe) ---------------------------------------------------------------- */

/** Largura da folha no servidor (720 px de papel + margens): a folha é montada nessa largura e reduzida para caber na tela. */
const LARGURA_FOLHA = 752;

function FolhaOS({ osId, numero, versao, onAjuste }: { osId: number; numero: string; versao: number; onAjuste: (alvo: string) => void }) {
    const ref = useRef<HTMLIFrameElement>(null);
    const caixa = useRef<HTMLDivElement>(null);
    const [altura, setAltura] = useState(1100);
    /* Folha enquadrada (08/10/2026): no celular a folha inteira cabe na largura da tela, como uma página (sem rolar para o lado). */
    const [escala, setEscala] = useState(1);
    useEffect(() => {
        const el = caixa.current;
        if (!el) return;
        const medir = () => setEscala(Math.min(1, el.clientWidth / LARGURA_FOLHA));
        medir();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
        ro?.observe(el);
        window.addEventListener("resize", medir);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", medir);
        };
    }, []);
    useEffect(() => {
        const ouvir = (e: MessageEvent) => {
            if (e.origin !== ORIGEM_API || e.source !== ref.current?.contentWindow) return;
            const d = e.data || {};
            if (d.pai === "os-altura" && Number(d.altura) > 200) setAltura(Number(d.altura) + 24);
            if (d.pai === "os-ajuste" && typeof d.alvo === "string") onAjuste(d.alvo);
        };
        window.addEventListener("message", ouvir);
        return () => window.removeEventListener("message", ouvir);
    }, [onAjuste]);
    return (
        <div ref={caixa} className="w-full overflow-hidden rounded-xl border border-[#E1E5EC] bg-white dark:border-white/[0.12]" style={{ height: Math.ceil(altura * escala) }}>
            <iframe
                ref={ref}
                title={`Folha da OS ${numero}`}
                src={`${OS_API}?documento_os=1&os_id=${osId}&formato=visualizar&ajuste=1&_=${versao}`}
                style={{ width: escala < 1 ? LARGURA_FOLHA : "100%", height: altura, transform: escala < 1 ? `scale(${escala})` : undefined, transformOrigin: "0 0" }}
                className="block border-0 bg-white"
            />
        </div>
    );
}

/* ---------------------------------------------------------------- Uma OS: folha + ações ---------------------------------------------------------------- */

type Responsavel = { nome: string; cpf: string };

function OSComAcoes({ osId, numero, responsavel, onMudou, familia = null }: { osId: number; numero: string; responsavel: Responsavel; onMudou: () => void; familia?: OSResumida | null }) {
    const [os, setOs] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [assinar, setAssinar] = useState(false);
    const [concluir, setConcluir] = useState(false);
    const [versao, setVersao] = useState(0);
    const [pedido, setPedido] = useState<{ alvo: string; n: number } | null>(null);
    const [gerandoPdf, setGerandoPdf] = useState(false);
    // Folha preparada ao abrir (e a cada mudança): no toque em PDF só falta gerar o arquivo — o iPhone exige o Compartilhar logo após o toque.
    useEffect(() => {
        prepararPdfDaOS(osId);
    }, [osId, versao]);

    const carregar = useCallback(async () => {
        try {
            const r = await osGet("listar", { os_id: osId });
            if (!r?.dados?.os) throw new Error("O servidor não devolveu os dados desta OS.");
            setOs(r.dados.os);
            setErro("");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir a OS.");
        }
    }, [osId]);
    useEffect(() => {
        setOs(null);
        setMsg("");
        void carregar();
    }, [carregar]);
    const atualizar = () => {
        setVersao((v) => v + 1);
        void carregar();
        onMudou();
    };
    const onAjuste = useCallback((alvo: string) => setPedido((p) => ({ alvo, n: (p?.n ?? 0) + 1 })), []);

    const aberta = os?.status === "ABERTA";
    const particular = os?.natureza === "PARTICULAR";
    /* Conclusão da venda (09/10/2026): Aberta → Concluir venda (pagamentos) → Colher assinatura (NP do saldo). */
    const concluida = os?.status === "FECHADA" && !os?.assinada_em;
    const assinada = os?.status === "FECHADA" && !!os?.assinada_em;
    const saldo = particular && os ? Math.max(0, (Number(os.valor_total) || 0) - (Number(os.recebido) || 0)) : 0;
    const prefeitura = !!os && !particular && String(os.convenio || "").startsWith("PREFEITURA");
    const associadoSemContrato = !!os && !particular && String(os.convenio || "").startsWith("ASSOCIADO") && !os.contrato_numero;

    const info = !os
        ? ""
        : assinada
            ? "OS assinada. Para alterar, o Financeiro reabre a OS."
            : concluida
                ? particular
                    ? saldo > 0
                        ? `Venda concluída. Falta receber ${brl(saldo)}: colha a assinatura do responsável para a nota promissória do saldo.`
                        : "Venda concluída e quitada. A assinatura é opcional."
                    : "Venda concluída. Colha a assinatura do responsável como ciência dos serviços."
                : !aberta
                    ? "Esta OS não está aberta para alteração."
                    : particular
                        ? "Ajuste os valores pelo $ de cada item ou pelo Desconto geral. Concluir fecha a venda: os valores travam e a OS vai para o financeiro."
                        : prefeitura
                            ? "OS da Prefeitura: sem valores. Concluir fecha a OS; depois o responsável assina como ciência."
                            : associadoSemContrato
                                ? "Concluir fecha a OS. Antes da assinatura, informe o contrato do titular no atendimento."
                                : "OS de convênio: concluir fecha a OS; depois o responsável assina como ciência.";

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F4F6F9] p-3 dark:bg-[#161C2A] sm:p-4">
                {erro ? <div role="alert" className="mb-3 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">OS {numero}: {erro}</div> : null}
                {msg ? <div className="mb-3 rounded-xl border border-[#7BA11A]/50 bg-[#EEF5D6] p-3 text-sm font-semibold text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white">{msg}</div> : null}
                <FolhaOS osId={osId} numero={numero} versao={versao} onAjuste={onAjuste} />
                {particular && aberta ? <ItensOSAjuste osId={osId} editavel semTabela pedido={pedido} versao={versao} onMudou={() => atualizar()} /> : null}
            </div>

            {/* Ações da OS: alteração de valores, confirmação e assinatura */}
            <div className="shrink-0 border-t border-[#E3E8F0] bg-white px-3 py-3 dark:border-white/[0.12] dark:bg-[#232B3F] sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1 text-sm leading-snug text-[#313C55] dark:text-white">
                        {os ? (
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                <b>OS {os.numero_os}</b>
                                {situacaoOS(os)}
                                {particular && (concluida || assinada) ? <TagAReceber valor={saldo} /> : null}
                                {particular ? <span className="font-extrabold">Total {brl(os.valor_total)}</span> : null}
                            </div>
                        ) : null}
                        <span className="text-[#5B6478] dark:text-[#AEB9CF]">{info}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                        <a className={BTN_SEC} target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=impressao`}>Imprimir</a>
                        {/* PDF para mandar ao cliente: compartilhar no celular, baixar no computador (fica no histórico da OS) */}
                        <button
                            type="button"
                            className={BTN_SEC}
                            disabled={gerandoPdf}
                            onClick={async () => {
                                setGerandoPdf(true);
                                try {
                                    const m = await baixarPdfDaOS(osId, numero);
                                    if (m) setMsg(m);
                                } finally {
                                    setGerandoPdf(false);
                                }
                            }}
                        >
                            {gerandoPdf ? "Gerando…" : "PDF"}
                        </button>
                        {aberta && particular ? (
                            <button type="button" className={BTN_SEC} onClick={() => setPedido((p) => ({ alvo: "geral", n: (p?.n ?? 0) + 1 }))}>
                                <IconeAjuste /> Desconto geral
                            </button>
                        ) : null}
                        {aberta ? (
                            <button type="button" className={BTN_PRI} disabled={!os} onClick={() => setConcluir(true)}>
                                <IconeCheck /> Concluir venda
                            </button>
                        ) : null}
                        {concluida ? (
                            <button type="button" className={BTN_PRI} disabled={associadoSemContrato} onClick={() => setAssinar(true)}>
                                {particular && saldo > 0 ? "Colher assinatura (nota promissória)" : "Colher assinatura"}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {concluir && os ? (
                <ConcluirVendaModal
                    os={os}
                    familia={particular || !familia ? null : { id: familia.id, numero: familia.numero_os, total: familia.valor_total }}
                    onFechar={() => setConcluir(false)}
                    onConcluido={(m) => {
                        setConcluir(false);
                        setMsg(m);
                        atualizar();
                    }}
                />
            ) : null}
            {assinar && os ? (
                <AssinaturaModal
                    os={os}
                    saldo={saldo}
                    responsavel={responsavel}
                    onFechar={() => setAssinar(false)}
                    onAssinado={() => {
                        setAssinar(false);
                        setMsg("OS assinada.");
                        atualizar();
                    }}
                />
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------- Painel com as abas das OS ---------------------------------------------------------------- */

type OSResumida = { id: number; numero_os: string; natureza: string; convenio: string; status: string; valor_total: number };

function rotuloAba(o: OSResumida) {
    if (o.natureza === "PARTICULAR") return String(o.convenio || "").startsWith("PARTICULAR") ? "Família" : "Diferença da família";
    return String(o.convenio || "").startsWith("PREFEITURA") ? "Prefeitura" : "Convênio";
}

export default function OSDoAtendimento({
    atendimentoId,
    onFechar,
    onMudou,
    sobreposto = false,
}: {
    atendimentoId: number | string;
    onFechar: () => void;
    /** Chamado a cada ajuste, confirmação ou assinatura (a tela de trás recarrega o resumo). */
    onMudou?: () => void;
    /** true: abre por cima da tela atual (Editar registro). false: ocupa a página (/os/minhas?atendimento=). */
    sobreposto?: boolean;
}) {
    const [lista, setLista] = useState<OSResumida[] | null>(null);
    const [resp, setResp] = useState<Responsavel>({ nome: "", cpf: "" });
    const [erro, setErro] = useState("");
    const [aba, setAba] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        osGet("os_do_atendimento", { atendimento_id: atendimentoId })
            .then((r) => {
                if (!vivo) return;
                const d = r?.dados || {};
                const l = [d.os_convenio, d.os_particular].filter(Boolean).map((o: any) => ({
                    id: Number(o.id), numero_os: String(o.numero_os ?? ""), natureza: String(o.natureza ?? ""), convenio: String(o.convenio ?? ""), status: String(o.status ?? ""), valor_total: Number(o.valor_total) || 0,
                }));
                setLista(l);
                setResp({ nome: String(d.responsavel?.nome ?? ""), cpf: String(d.responsavel?.cpf ?? "") });
                // Abre na OS que ainda pede ação da família (a da diferença), senão na primeira.
                const prox = l.find((o) => o.natureza === "PARTICULAR" && o.status === "ABERTA") ?? l.find((o) => o.status === "ABERTA") ?? l[0];
                setAba(prox ? prox.id : null);
            })
            .catch((e) => vivo && setErro(e?.message || "Não foi possível carregar as OS do atendimento."));
        return () => {
            vivo = false;
        };
    }, [atendimentoId]);

    // Esc fecha só esta janela (não o "Editar registro" de trás). Com uma janela interna aberta (valor, desconto, assinatura), Esc não faz nada.
    useEffect(() => {
        if (!sobreposto) return;
        const esc = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            if (!document.querySelector("[data-os-janela-interna]")) onFechar();
        };
        window.addEventListener("keydown", esc, true);
        return () => window.removeEventListener("keydown", esc, true);
    }, [sobreposto, onFechar]);

    const atual = lista?.find((o) => o.id === aba) ?? null;

    const painel = (
        <div
            role="dialog"
            aria-modal={sobreposto ? "true" : undefined}
            aria-label="OS do atendimento"
            className={
                sobreposto
                    ? "flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white sm:h-[94dvh] sm:max-w-[960px] sm:rounded-3xl"
                    : "flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white"
            }
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.12] sm:px-5">
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-extrabold leading-tight sm:text-xl">
                        OS do atendimento <span className="text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">· Nº {atendimentoId}</span>
                    </h2>
                </div>
                {lista && lista.length ? (
                    <div role="tablist" aria-label="OS do atendimento" className={`order-last grid w-full gap-1 rounded-2xl bg-[#EEF2F7] p-1 dark:bg-[#1C2334] sm:order-none sm:flex sm:w-auto sm:flex-wrap ${lista.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {lista.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                role="tab"
                                aria-selected={o.id === aba}
                                onClick={() => setAba(o.id)}
                                className={`rounded-xl px-3 py-1.5 text-left text-sm font-extrabold leading-tight ${o.id === aba ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "text-[#5B6478] hover:bg-white dark:text-[#AEB9CF] dark:hover:bg-white/10"}`}
                            >
                                <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">{rotuloAba(o)}</span>
                                {o.numero_os}
                            </button>
                        ))}
                    </div>
                ) : null}
                <button type="button" onClick={onFechar} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {erro ? <div role="alert" className="m-4 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div> : null}
            {lista && lista.length === 0 ? <div className="m-4 rounded-xl border border-[#E3E8F0] p-6 text-center text-sm dark:border-white/[0.12]">Este atendimento ainda não tem OS. Salve o registro para gerar.</div> : null}
            {!lista && !erro ? <div className="m-4 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Carregando as OS…</div> : null}

            {atual ? <OSComAcoes key={atual.id} osId={atual.id} numero={atual.numero_os} responsavel={resp} onMudou={() => onMudou?.()} familia={(lista || []).find((o) => o.natureza === "PARTICULAR" && o.status === "ABERTA") ?? null} /> : null}
        </div>
    );

    if (!sobreposto) return painel;
    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/55 sm:items-center sm:p-4" onClick={onFechar}>
            {painel}
        </div>,
        document.body,
    );
}

/* ---------------------------------------------------------------- Assinatura ---------------------------------------------------------------- */

export function AssinaturaModal({
    os,
    saldo = 0,
    responsavel,
    onFechar,
    onAssinado,
}: {
    os: any;
    /** Saldo da OS da família (total − tudo o que já entrou): vira a nota promissória à vista. O pagamento é lançado na conclusão. */
    saldo?: number;
    responsavel?: Responsavel;
    onFechar: () => void;
    onAssinado: () => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const desenhando = useRef(false);
    const [temTraco, setTemTraco] = useState(false);
    const [f, setF] = useState({ nome: responsavel?.nome ?? "", cpf: responsavel?.cpf ?? "" });
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const particular = os?.natureza === "PARTICULAR";

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        return [((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height];
    };
    const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const ctx = canvas.current!.getContext("2d")!;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#313C55";
        const [x, y] = pos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        desenhando.current = true;
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!desenhando.current) return;
        const ctx = canvas.current!.getContext("2d")!;
        const [x, y] = pos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        setTemTraco(true);
    };
    const limpar = () => {
        canvas.current!.getContext("2d")!.clearRect(0, 0, 600, 180);
        setTemTraco(false);
    };

    const enviar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        try {
            // A imagem vai junto com a assinatura e o servidor grava em uploads/assinaturas/ (08/10/2026).
            const imagem = canvas.current!.toDataURL("image/png");
            await osPost("assinar", {
                os_id: os.id,
                nome_responsavel: f.nome.trim(),
                cpf_responsavel: f.cpf,
                assinatura_base64: imagem,
                // uma assinatura para as OS concluídas do mesmo atendimento (convênio e família) — 08/10/2026
                assinar_juntas: 1,
            });
            onAssinado();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível assinar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <ModalSimples titulo="Assinatura da OS" sub={`OS ${os.numero_os} · uma assinatura vale para as OS concluídas deste atendimento${particular ? " e para a nota promissória do saldo" : ""}`} onFechar={onFechar}>
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            <div className="mb-3 grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Nome do responsável" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
                <input className={inputCls} placeholder="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
            </div>
            {particular && (
                <div className={`mb-3 rounded-xl p-3 text-sm ${saldo > 0 ? "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white" : "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/15 dark:text-white"}`}>
                    {saldo > 0 ? <>A assinatura emite a <b>nota promissória à vista de {brl(saldo)}</b> (o saldo que falta receber).</> : <>OS quitada: <b>sem nota promissória</b>.</>}
                </div>
            )}
            <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">
                <span>Assine no quadro</span>
                <button type="button" onClick={limpar} className="normal-case text-[#3D6A99] dark:text-[#A9C3E0]">Limpar</button>
            </div>
            <canvas
                ref={canvas}
                width={600}
                height={180}
                className="mb-3 w-full touch-none rounded-lg border border-dashed border-[#C9CFD9] bg-white dark:border-white/30 dark:bg-[#232B3F]"
                onPointerDown={inicio}
                onPointerMove={move}
                onPointerUp={() => (desenhando.current = false)}
                onPointerLeave={() => (desenhando.current = false)}
            />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onFechar} className="rounded-lg border border-[#E1E5EC] px-4 py-2 text-sm font-bold dark:border-white/[0.12]">Cancelar</button>
                <button type="button" disabled={salvando || !temTraco || !f.nome.trim()} onClick={() => void enviar()} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55]">
                    {salvando ? "Assinando…" : "Assinar"}
                </button>
            </div>
        </ModalSimples>
    );
}

/* ---------------------------------------------------------------- Concluir venda (09/10/2026) ---------------------------------------------------------------- */

function IconeCheck() {
    return (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
        </svg>
    );
}

const ROTULO_FORMA: Record<string, string> = {
    PIX: "PIX", CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito", DINHEIRO: "Dinheiro",
    TRANSFERENCIA: "Transferência", BOLETO: "Boleto", CHEQUE: "Cheque", OUTRO: "Outro",
};
/** Dinheiro não tem comprovante (decisão de 09/10/2026); as demais formas exigem a foto ou o PDF. */
const SEM_COMPROVANTE = ["DINHEIRO"];
const COMPROVANTE_MAX = 15 * 1024 * 1024;

type LinhaPagamento = { forma: string; valor: string; parcelas: number; arquivo: File | null };

/**
 * Concluir venda: fecha a OS (valores travados, vai para o financeiro). Pagamento do momento opcional, em uma ou mais formas,
 * com parcelas no cartão de crédito e o comprovante de cada forma (menos dinheiro). Vale também para a outra OS do atendimento.
 */
export function ConcluirVendaModal({
    os,
    familia = null,
    onFechar,
    onConcluido,
}: {
    os: any;
    /** Concluindo pela aba do convênio: os pagamentos vão para a OS da família (aberta) deste atendimento. */
    familia?: { id: number; numero: string; total: number } | null;
    onFechar: () => void;
    onConcluido: (msg: string) => void;
}) {
    const particular = os?.natureza === "PARTICULAR";
    const recebePagamento = particular || !!familia;
    const total = familia ? Number(familia.total) || 0 : Math.max(0, (Number(os?.valor_total) || 0) - (Number(os?.recebido) || 0));
    const [linhas, setLinhas] = useState<LinhaPagamento[]>([]);
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    const pago = linhas.reduce((a, l) => a + num(l.valor), 0);
    const saldo = Math.max(0, Math.round((total - pago) * 100) / 100);
    const mudar = (i: number, d: Partial<LinhaPagamento>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...d } : l)));
    const problema = (() => {
        for (const [i, l] of linhas.entries()) {
            if (!(num(l.valor) > 0)) return `Pagamento ${i + 1}: informe o valor.`;
            if (!SEM_COMPROVANTE.includes(l.forma) && !l.arquivo) return `Pagamento ${i + 1} (${ROTULO_FORMA[l.forma]}): anexe a foto do comprovante.`;
        }
        if (pago > total + 0.009) return `Os pagamentos somam ${brl(pago)}, mais que o total (${brl(total)}).`;
        return "";
    })();

    const escolherArquivo = (i: number, file: File | null) => {
        if (!file) return mudar(i, { arquivo: null });
        if (!/^image\//.test(file.type) && file.type !== "application/pdf") {
            setErro("O comprovante deve ser uma foto ou PDF.");
            return;
        }
        if (file.size > COMPROVANTE_MAX) {
            setErro("O comprovante deve ter no máximo 15 MB.");
            return;
        }
        setErro("");
        mudar(i, { arquivo: file });
    };

    const enviar = async () => {
        if (salvando || problema) return;
        setSalvando(true);
        setErro("");
        try {
            const fd = new FormData();
            fd.append("concluir", "1");
            fd.append("os_id", String(os.id));
            fd.append("concluir_juntas", "1");
            fd.append("pagamentos", JSON.stringify(linhas.map((l) => ({ forma: l.forma, valor: num(l.valor), parcelas: l.forma === "CARTAO_CREDITO" ? l.parcelas : null }))));
            linhas.forEach((l, i) => l.arquivo && fd.append(`comprovante_${i}`, l.arquivo, l.arquivo.name || `comprovante_${i}.jpg`));
            const r = await apiJson(OS_API, { method: "POST", body: fd });
            onConcluido(r?.msg || "Venda concluída.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir a venda.");
        } finally {
            setSalvando(false);
        }
    };

    const rotulo = "text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]";
    return (
        <ModalSimples titulo="Concluir venda" sub={`OS ${os.numero_os} · vale também para a outra OS aberta deste atendimento`} onFechar={onFechar}>
            {erro && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            {recebePagamento ? (
                <>
                    <div className="mb-3 flex items-center justify-between border-b border-[#E1E5EC] pb-2 dark:border-white/[0.12]">
                        <span className="text-[#6B7488] dark:text-[#AEB9CF]">Total{familia ? ` · OS ${familia.numero}` : ""}</span>
                        <b className="text-lg">{brl(total)}</b>
                    </div>
                    <div className={`${rotulo} mb-2`}>Pagamento agora (opcional)</div>
                    <div className="flex flex-col gap-3">
                        {linhas.map((l, i) => (
                            <div key={i} className="rounded-xl border border-[#E1E5EC] p-2.5 dark:border-white/[0.12]">
                                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                                    <input inputMode="decimal" aria-label={`Valor do pagamento ${i + 1}`} className={inputCls} placeholder="0,00" value={l.valor} onChange={(e) => mudar(i, { valor: e.target.value })} />
                                    <select aria-label={`Forma do pagamento ${i + 1}`} className={inputCls} value={l.forma} onChange={(e) => mudar(i, { forma: e.target.value, parcelas: 1 })}>
                                        {FORMAS.map((x) => <option key={x} value={x}>{ROTULO_FORMA[x] || x}</option>)}
                                    </select>
                                    <button type="button" aria-label={`Tirar o pagamento ${i + 1}`} onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))} className="flex h-10 items-center justify-center rounded-lg text-[#6B7488] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/10">✕</button>
                                </div>
                                {l.forma === "CARTAO_CREDITO" ? (
                                    <label className="mt-2 flex flex-wrap items-center justify-end gap-2 text-sm text-[#6B7488] dark:text-[#AEB9CF]">
                                        Parcelas no cartão
                                        <select className={`${inputCls} w-auto max-w-full`} value={l.parcelas} onChange={(e) => mudar(i, { parcelas: Number(e.target.value) })}>
                                            {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => (
                                                <option key={n} value={n}>{n === 1 ? "1x (à vista)" : `${n}x de ${brl(num(l.valor) / n)}`}</option>
                                            ))}
                                        </select>
                                    </label>
                                ) : null}
                                {SEM_COMPROVANTE.includes(l.forma) ? (
                                    <div className="mt-2 text-xs text-[#6B7488] dark:text-[#AEB9CF]">Dinheiro: sem comprovante (o Financeiro confere pelo caixa).</div>
                                ) : (
                                    <label className={`mt-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-dashed px-3 text-sm font-bold ${l.arquivo ? "border-[#7BA11A] text-[#313C55] dark:text-white" : "border-[#C9D1DE] text-[#313C55] dark:border-white/25 dark:text-white"}`}>
                                        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => escolherArquivo(i, e.target.files?.[0] ?? null)} />
                                        {l.arquivo ? <>✓ <span className="truncate">{l.arquivo.name}</span><span className="ml-auto text-xs font-semibold text-[#6B7488] dark:text-[#AEB9CF]">trocar</span></> : <>📎 Foto do comprovante (obrigatória)</>}
                                    </label>
                                )}
                            </div>
                        ))}
                        <button type="button" onClick={() => setLinhas((ls) => [...ls, { forma: "PIX", valor: ls.length ? "" : total ? String(total.toFixed(2)).replace(".", ",") : "", parcelas: 1, arquivo: null }])}
                            className="h-10 rounded-xl border-[1.5px] border-dashed border-[#C9D1DE] text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10">
                            + {linhas.length ? "Outra forma de pagamento" : "Lançar pagamento"}
                        </button>
                    </div>
                    <div className="mt-3 flex justify-between text-sm"><span className="text-[#6B7488] dark:text-[#AEB9CF]">Pago agora</span><b>{brl(pago)}</b></div>
                    <div className={`mt-2 rounded-xl p-3 text-sm ${saldo > 0 ? "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white" : "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/15 dark:text-white"}`}>
                        {saldo > 0 ? <>Fica <b>a receber {brl(saldo)}</b>. A nota promissória desse saldo sai na <b>assinatura</b> do responsável, agora ou depois.</> : <>Pagamento cobre o total: a OS sai <b>quitada</b> e não precisa de assinatura.</>}
                    </div>
                </>
            ) : (
                <div className="mb-2 rounded-xl bg-[#E9EFF6] p-3 text-sm text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">OS de convênio: concluir fecha a OS. Sem pagamento.</div>
            )}
            <div className="mt-3 text-xs text-[#6B7488] dark:text-[#AEB9CF]">Depois de concluída, os valores ficam travados. Para alterar, o Financeiro reabre a OS.</div>
            {problema && linhas.length ? <div className="mt-2 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92]">{problema}</div> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={onFechar} className={BTN_SEC}>Cancelar</button>
                <button type="button" disabled={salvando || !!problema} onClick={() => void enviar()} className={BTN_PRI}>
                    {salvando ? "Concluindo…" : "Concluir venda"}
                </button>
            </div>
        </ModalSimples>
    );
}

/** A OS sozinha (pelo id), por cima da tela — usada pelo pedido de coroa (venda direta) e pela Minhas OS. */
export function JanelaOSPorId({ osId, numero, onFechar, onMudou }: { osId: number; numero: string; onFechar: () => void; onMudou?: () => void }) {
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);
    return (
        <div data-pai-overlay className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgba(10,14,24,0.55)] sm:items-center sm:p-4" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label={`OS ${numero}`} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white sm:h-[94dvh] sm:max-w-[960px] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-center gap-2 border-b border-[#E3E8F0] py-2 pl-4 pr-2 dark:border-white/[0.12]">
                    <h2 className="flex-1 truncate text-lg font-extrabold">OS {numero}</h2>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex size-11 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10">✕</button>
                </div>
                <OSComAcoes osId={osId} numero={numero} responsavel={{ nome: "", cpf: "" }} onMudou={() => onMudou?.()} />
            </div>
        </div>
    );
}

export function ModalSimples({ titulo, sub, children, onFechar }: { titulo: string; sub?: string; children: React.ReactNode; onFechar: () => void }) {
    return (
        <div data-os-janela-interna className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(49,60,85,0.45)] p-4" onClick={onFechar}>
            <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-4 text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white sm:p-6" onClick={(e) => e.stopPropagation()}>
                <div className="text-xl font-extrabold">{titulo}</div>
                {sub && <div className="mb-4 text-sm text-[#6B7488] dark:text-[#AEB9CF]">{sub}</div>}
                {children}
            </div>
        </div>
    );
}
