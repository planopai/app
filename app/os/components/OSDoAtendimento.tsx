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
import { baixarPdfDaOS } from "./ListaOS";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const ORIGEM_API = new URL(API_BASE).origin;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";
/**
 * AJUSTAR: endpoint de upload de assinatura que o app já usa na Despedida (fase08).
 * Recebe POST multipart com o campo "arquivo" (PNG) e deve devolver o caminho salvo, ex.: { url: "/uploads/assinaturas/xxx.png" }.
 */
const UPLOAD_ASSINATURA_API = `${API_BASE}/upload_assinatura.php`;

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
    "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC]";
const FORMAS = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "TRANSFERENCIA", "CHEQUE", "BOLETO", "OUTRO"];
const BTN_PRI = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_SEC = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10";

function Tag({ children, bg = "#EEF1F5" }: { children: React.ReactNode; bg?: string }) {
    return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]" style={{ background: bg }}>{children}</span>;
}
export function situacaoOS(l: any) {
    if (l.status === "CONVERTIDA") return <Tag>CONVERTIDA</Tag>;
    if (l.status === "FECHADA") return <Tag bg="#E6F0C9">ASSINADA</Tag>;
    if (l.status === "AGUARDANDO_ASSINATURA") return <Tag bg="#FBEFC4">AGUARDANDO ASSINATURA</Tag>;
    return <Tag bg="#FFF8E1">RASCUNHO</Tag>;
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

function OSComAcoes({ osId, numero, responsavel, onMudou }: { osId: number; numero: string; responsavel: Responsavel; onMudou: () => void }) {
    const [os, setOs] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [assinar, setAssinar] = useState(false);
    const [versao, setVersao] = useState(0);
    const [pedido, setPedido] = useState<{ alvo: string; n: number } | null>(null);
    const [gerandoPdf, setGerandoPdf] = useState(false);

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
    const confirmada = !!os?.confirmada_em;
    const prefeitura = !!os && !particular && String(os.convenio || "").startsWith("PREFEITURA");
    const associadoSemContrato = !!os && !particular && String(os.convenio || "").startsWith("ASSOCIADO") && !os.contrato_numero;

    const confirmar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await osPost("confirmar_os", { os_id: osId });
            setMsg(r?.msg || "Valores confirmados.");
            atualizar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível confirmar.");
        } finally {
            setSalvando(false);
        }
    };

    const info = !os
        ? ""
        : !aberta
            ? os.status === "FECHADA"
                ? "OS assinada. Para alterar, o Financeiro reabre a OS."
                : "Esta OS não está aberta para alteração."
            : particular
                ? confirmada
                    ? "Valores confirmados. Colha a assinatura do responsável (o pagamento no ato e a nota promissória do saldo são informados na assinatura). Qualquer ajuste desfaz a confirmação."
                    : "Altere valor e desconto pelo ícone ao lado de cada item da folha e pelo Desconto geral. Depois confirme os valores para liberar a assinatura."
                : prefeitura
                    ? "OS da Prefeitura: sem valores. O responsável assina como ciência dos serviços."
                    : associadoSemContrato
                        ? "Informe o contrato do titular no atendimento antes de colher a assinatura."
                        : "OS de convênio: o responsável assina como ciência.";

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
                        {aberta && particular && !confirmada ? (
                            <button type="button" className={BTN_PRI} disabled={salvando || !os} onClick={() => void confirmar()}>
                                {salvando ? "Confirmando…" : "Confirmar valores"}
                            </button>
                        ) : null}
                        {aberta && (!particular || confirmada) ? (
                            <button type="button" className={BTN_PRI} disabled={associadoSemContrato} onClick={() => setAssinar(true)}>
                                Colher assinatura
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {assinar && os ? (
                <AssinaturaModal
                    os={os}
                    particular={particular}
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

type OSResumida = { id: number; numero_os: string; natureza: string; convenio: string; status: string };

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
                    id: Number(o.id), numero_os: String(o.numero_os ?? ""), natureza: String(o.natureza ?? ""), convenio: String(o.convenio ?? ""), status: String(o.status ?? ""),
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

            {atual ? <OSComAcoes key={atual.id} osId={atual.id} numero={atual.numero_os} responsavel={resp} onMudou={() => onMudou?.()} /> : null}
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
    particular,
    responsavel,
    onFechar,
    onAssinado,
}: {
    os: any;
    particular: boolean;
    responsavel?: Responsavel;
    onFechar: () => void;
    onAssinado: () => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const desenhando = useRef(false);
    const [temTraco, setTemTraco] = useState(false);
    const [f, setF] = useState({ nome: responsavel?.nome ?? "", cpf: responsavel?.cpf ?? "", pago: "", forma: "PIX" });
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    const total = Number(os.valor_total) || 0;
    const saldo = Math.max(0, total - num(f.pago));

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
            const blob: Blob = await new Promise((ok) => canvas.current!.toBlob((b) => ok(b!), "image/png"));
            const fd = new FormData();
            fd.append("arquivo", blob, `assinatura_os_${os.id}.png`);
            const up = await apiJson(UPLOAD_ASSINATURA_API, { method: "POST", body: fd });
            const caminho = up?.url || up?.dados?.url || up?.caminho;
            if (!caminho) throw new Error("O upload da assinatura não devolveu o caminho do arquivo.");
            await osPost("assinar", {
                os_id: os.id,
                nome_responsavel: f.nome.trim(),
                cpf_responsavel: f.cpf,
                arquivo_assinatura: caminho,
                ...(particular && num(f.pago) > 0 ? { pagamento_valor: num(f.pago), pagamento_forma: f.forma, pagamento_data: hoje() } : {}),
            });
            onAssinado();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível assinar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <ModalSimples titulo="Assinatura da OS" sub={`OS ${os.numero_os} · uma assinatura vale para a OS${particular ? ", o pagamento e a nota promissória do saldo" : ""}`} onFechar={onFechar}>
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            <div className="mb-3 grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Nome do responsável" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
                <input className={inputCls} placeholder="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
            </div>
            {particular && (
                <div className="mb-3 rounded-xl border border-[#E1E5EC] p-3 dark:border-white/[0.12]">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">Pagamento no ato (opcional)</div>
                    <div className="grid grid-cols-2 gap-2">
                        <input inputMode="decimal" className={inputCls} placeholder="0,00" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })} />
                        <select className={inputCls} value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value })}>
                            {FORMAS.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
                        </select>
                    </div>
                    <div className="mt-2 text-sm">Total {brl(total)} · {saldo > 0 ? <>nota promissória à vista de <b>{brl(saldo)}</b></> : <b>quitada no ato, sem nota promissória</b>}</div>
                </div>
            )}
            <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">
                <span>Assine no quadro</span>
                <button type="button" onClick={limpar} className="normal-case text-[#00AEEC] dark:text-[#66CFF5]">Limpar</button>
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

export function ModalSimples({ titulo, sub, children, onFechar }: { titulo: string; sub?: string; children: React.ReactNode; onFechar: () => void }) {
    return (
        <div data-os-janela-interna className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(49,60,85,0.45)] p-4" onClick={onFechar}>
            <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white" onClick={(e) => e.stopPropagation()}>
                <div className="text-xl font-extrabold">{titulo}</div>
                {sub && <div className="mb-4 text-sm text-[#6B7488] dark:text-[#AEB9CF]">{sub}</div>}
                {children}
            </div>
        </div>
    );
}
