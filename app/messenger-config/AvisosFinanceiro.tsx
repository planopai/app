"use client";

/**
 * Configurações do Messenger › Avisos do financeiro — 17/11/2026. Back-end: aurora_18.php.
 * Liga e desliga cada aviso. Cada aviso vai pela notificação do app (abre a tela de origem) e a Aurora interna conta os avisos
 * do dia quando a pessoa abre a conversa ou pergunta. Quem recebe sai da chave da tela, em Permissões.
 */
import React, { useEffect, useRef, useState } from "react";
import { API_BASE, apiJson } from "@/components/messenger/api";

const URL_AVISOS = `${API_BASE}/aurora_18.php`;

type Cfg = Record<string, boolean>;
type Ultima = { fim?: string; msg?: string; erros?: string[] } | null;

const DETALHE: Record<string, string> = {
    pagar: "Para quem tem Contas a Pagar · todo dia às 8h (na sexta, as que vencem até segunda).",
    saldo: "Para quem tem a Tesouraria (Gestão) e a Gestão · uma vez por dia, enquanto o saldo previsto em 30 dias estiver abaixo do mínimo.",
    prov: "Para quem tem a Provisão · quando uma natureza de despesa passa de 100% no mês (uma vez por natureza).",
    caixa: "Para o dono do caixa e quem tem a Tesouraria (Gestão) · quando o caixa diário fecha sozinho às 18:30.",
    nf: "Para quem tem Contas a Receber · dia 1 de cada mês, com as OS da Prefeitura do mês anterior ainda sem NF.",
};

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const btnPri = "inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "inline-flex h-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] disabled:opacity-40 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const campoTexto = "mt-1 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3.5 text-[16px] text-[#1F2638] outline-none focus:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] dark:text-white";

export function AbaAvisosFinanceiro({ avisar }: { avisar: (m: string) => void }) {
    const [cfg, setCfg] = useState<Cfg | null>(null);
    const [tipos, setTipos] = useState<Record<string, string>>({});
    const [ultima, setUltima] = useState<Ultima>(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        apiJson(`${URL_AVISOS}?action=config&_=${Date.now()}`)
            .then((j: any) => {
                setCfg(j.dados.cfg);
                setTipos(j.dados.tipos || {});
                setUltima(j.dados.ultima || null);
            })
            .catch((e: any) => setErro(e?.message || "Não foi possível carregar."));
    }, []);

    const post = async (acao: string, corpo: Record<string, unknown> = {}) => {
        setOcupado(true);
        setErro("");
        try {
            const j: any = await apiJson(`${URL_AVISOS}?action=${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            avisar(String(j.msg || "Feito."));
            if (acao === "rodar") setUltima(j.dados || null);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setOcupado(false);
        }
    };

    return (
        <section className={`${cartao} flex flex-col gap-4`}>
            <div>
                <h2 className="m-0 text-lg font-extrabold">Avisos do financeiro</h2>
                <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                    Cada aviso chega pela notificação do app e abre a tela de origem. A Aurora conta os avisos do dia quando a pessoa abre a conversa ou pergunta. Quem recebe sai da chave da tela, em Permissões. Nada vai para cliente.
                </p>
            </div>
            {erro ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erro}</div> : null}
            {!cfg && !erro ? <p className="text-[14px] text-[#5B6478]">Carregando…</p> : null}
            {cfg ? (
                <>
                    <div className="flex flex-col divide-y divide-[#E1E5EC] dark:divide-white/10">
                        {Object.keys(tipos).map((k) => (
                            <label key={k} className="flex min-h-[52px] cursor-pointer items-start gap-3 py-3">
                                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#313C55]" checked={!!cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} />
                                <span className="min-w-0">
                                    <b className="block text-[15px]">{tipos[k]}</b>
                                    <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{DETALHE[k] || ""}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnPri} disabled={ocupado} onClick={() => void post("config_salvar", { cfg })}>
                            Salvar
                        </button>
                        <button type="button" className={btnSec} disabled={ocupado} onClick={() => void post("rodar")}>
                            Rodar agora
                        </button>
                    </div>
                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                        {ultima?.fim ? `Última verificação: ${new Date(ultima.fim).toLocaleString("pt-BR")} · ${ultima.msg || ""}` : "Ainda não rodou. Confira o cron (a cada 15 minutos)."}
                        {ultima?.erros?.length ? ` Erros: ${ultima.erros.join(" | ")}` : ""}
                    </p>
                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">"Rodar agora" envia de verdade os avisos que estiverem pendentes (o de NF entra mesmo fora do dia 1).</p>
                </>
            ) : null}
        </section>
    );
}

/* =====================================================================
 * Configurações do Messenger › Avisos de coroa — 23/11/2026. Back-end: aurora_19.php.
 * Avisos ao cliente que comprou a coroa: pedido recebido (só pedido do site), coroa pronta (com a foto) e coroa entregue.
 * Textos editáveis com a formatação do WhatsApp (*negrito*, _itálico_, ~tachado~), emoji e as variáveis
 * {nome}, {pedido}, {falecido} e {local}, com a prévia do jeito que o cliente vê. Quem não tem conversa aberta recebe
 * pelo modelo aprovado na Meta (liga aqui depois da aprovação).
 * ===================================================================== */
const URL_COROA = `${API_BASE}/aurora_19.php`;

type EventoCoroa = "recebido" | "pronta" | "entregue";
type CfgCoroa = {
    ativo: boolean;
    foto_pronta: boolean;
    textos: Record<EventoCoroa, string>;
    modelos: { ativo: boolean; idioma: string } & Record<EventoCoroa, string>;
};

const EVENTOS_COROA: [EventoCoroa, string, string][] = [
    ["recebido", "Pedido recebido", "Todo pedido da fila de coroas com telefone (site depois do pagamento, venda direta e Prefeitura). A coroa do atendimento (da família) e o pedido que a Aurora lançou na conversa não recebem."],
    ["pronta", "Coroa pronta", "Quando a equipe marca Coroa Pronta (com a foto, se ligada abaixo)."],
    ["entregue", "Coroa entregue", "Quando a equipe marca Coroa Entregue."],
];
const VARIAVEIS_COROA: [string, string, string][] = [
    ["{nome}", "Nome", "Maria de Jesus"],
    ["{pedido}", "Nº do pedido", "1263"],
    ["{falecido}", "Falecido", "Antonio da Silva"],
    ["{local}", "Local", "Memorial Senhor do Bonfim – Sala 02"],
];
const EMOJIS_COROA = ["🌺", "💐", "🕊️", "🙏", "🤍", "✅"];
// ordem das variáveis no modelo da Meta: {{1}} nome · {{2}} pedido · {{3}} falecido · {{4}} local
const PARA_META: Record<string, string> = { "{nome}": "{{1}}", "{pedido}": "{{2}}", "{falecido}": "{{3}}", "{local}": "{{4}}" };

function escaparHtml(t: string) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Formatação do WhatsApp para a prévia. */
function formatarWhats(t: string) {
    return escaparHtml(t)
        .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
        .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>")
        .replace(/~([^~\n]+)~/g, "<s>$1</s>")
        .replace(/```([^`]+)```/g, '<code class="font-mono">$1</code>');
}
function comExemplo(t: string) {
    return VARIAVEIS_COROA.reduce((acc, [v, , ex]) => acc.split(v).join(ex), t);
}

export function AbaAvisosCoroa({ avisar }: { avisar: (m: string) => void }) {
    const [cfg, setCfg] = useState<CfgCoroa | null>(null);
    const [padrao, setPadrao] = useState<CfgCoroa | null>(null);
    const [ultima, setUltima] = useState<{ fim?: string; msg?: string } | null>(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const caixas = useRef<Partial<Record<EventoCoroa, HTMLTextAreaElement | null>>>({});

    useEffect(() => {
        apiJson(`${URL_COROA}?action=config&_=${Date.now()}`)
            .then((j: any) => {
                setCfg(j.dados.cfg);
                setPadrao(j.dados.padrao);
                setUltima(j.dados.ultima || null);
            })
            .catch((e: any) => setErro(e?.message || "Não foi possível carregar."));
    }, []);

    const post = async (acao: string, corpo: Record<string, unknown> = {}) => {
        setOcupado(true);
        setErro("");
        try {
            const j: any = await apiJson(`${URL_COROA}?action=${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            avisar(String(j.msg || "Feito."));
            if (acao === "config_salvar" && j.dados?.cfg) setCfg(j.dados.cfg);
            if (acao === "rodar") setUltima(j.dados || null);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setOcupado(false);
        }
    };

    const mudarTexto = (ev: EventoCoroa, texto: string) => setCfg((c) => (c ? { ...c, textos: { ...c.textos, [ev]: texto } } : c));

    /** Envolve a seleção com a marca (negrito, itálico, tachado) ou insere o texto (emoji, variável) onde está o cursor. */
    const aplicar = (ev: EventoCoroa, antes: string, depois = "") => {
        const el = caixas.current[ev];
        if (!el || !cfg) return;
        const t = cfg.textos[ev];
        const i = el.selectionStart ?? t.length;
        const f = el.selectionEnd ?? t.length;
        const novo = t.slice(0, i) + antes + t.slice(i, f) + depois + t.slice(f);
        mudarTexto(ev, novo);
        requestAnimationFrame(() => {
            el.focus();
            const pos = depois ? f + antes.length : i + antes.length;
            el.setSelectionRange(depois && i === f ? i + antes.length : pos, depois && i === f ? i + antes.length : pos);
        });
    };

    const copiarMeta = async (ev: EventoCoroa) => {
        if (!cfg) return;
        const t = Object.entries(PARA_META).reduce((acc, [a, b]) => acc.split(a).join(b), cfg.textos[ev]);
        try {
            await navigator.clipboard.writeText(t);
            avisar("Texto copiado no formato da Meta ({{1}}, {{2}}…).");
        } catch {
            setErro("Não foi possível copiar. Selecione o texto e copie.");
        }
    };

    const botaoFmt = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[#C9D1DE] bg-white px-2 text-[15px] text-[#313C55] dark:border-white/25 dark:bg-[#1C2334] dark:text-white";

    return (
        <section className={`${cartao} flex flex-col gap-5`}>
            <div>
                <h2 className="m-0 text-lg font-extrabold">Avisos de coroa ao cliente</h2>
                <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                    Mensagens para quem está na fila de coroas com telefone salvo (menos a coroa do atendimento, da família). Com conversa aberta (WhatsApp nas últimas 24 h, ou chat do site, Facebook e Instagram), vai como mensagem comum; sem conversa aberta, vai pelo modelo aprovado na Meta, se estiver ligado abaixo. Use *negrito*, _itálico_ e ~tachado~ como no WhatsApp.
                </p>
            </div>
            {erro ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erro}</div> : null}
            {!cfg && !erro ? <p className="text-[14px] text-[#5B6478]">Carregando…</p> : null}
            {cfg ? (
                <>
                    <div className="flex flex-col gap-2">
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                            <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />
                            <b className="text-[15px]">Enviar os avisos de coroa</b>
                        </label>
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                            <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={cfg.foto_pronta} onChange={(e) => setCfg({ ...cfg, foto_pronta: e.target.checked })} />
                            <span className="text-[15px]">Mandar a foto da Coroa Pronta junto com o aviso (o texto vai como legenda da foto)</span>
                        </label>
                    </div>

                    {EVENTOS_COROA.map(([ev, titulo, detalhe]) => (
                        <div key={ev} className="grid gap-4 border-t border-[#E1E5EC] pt-5 md:grid-cols-[1fr_340px] dark:border-white/10">
                            <div className="flex min-w-0 flex-col gap-2">
                                <div>
                                    <b className="block text-[16px]">{titulo}</b>
                                    <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{detalhe}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button type="button" className={`${botaoFmt} font-extrabold`} title="Negrito" onClick={() => aplicar(ev, "*", "*")}>B</button>
                                    <button type="button" className={`${botaoFmt} italic`} title="Itálico" onClick={() => aplicar(ev, "_", "_")}>I</button>
                                    <button type="button" className={`${botaoFmt} line-through`} title="Tachado" onClick={() => aplicar(ev, "~", "~")}>S</button>
                                    <span className="mx-1 h-6 w-px bg-[#E1E5EC] dark:bg-white/15" />
                                    {EMOJIS_COROA.map((e) => (
                                        <button key={e} type="button" className={botaoFmt} title="Inserir emoji" onClick={() => aplicar(ev, e)}>{e}</button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {VARIAVEIS_COROA.filter(([v]) => ev !== "recebido" || v !== "{local}").map(([v, nome]) => (
                                        <button key={v} type="button" className="h-8 rounded-full bg-[#EEF5D6] px-3 text-[13px] font-bold text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-white" onClick={() => aplicar(ev, v)}>
                                            + {nome}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    ref={(el) => { caixas.current[ev] = el; }}
                                    className={`${campoTexto} min-h-[190px] py-3 leading-relaxed`}
                                    value={cfg.textos[ev]}
                                    maxLength={1000}
                                    onChange={(e) => mudarTexto(ev, e.target.value)}
                                />
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className={btnSec} onClick={() => void copiarMeta(ev)}>Copiar para a Meta</button>
                                    {padrao ? (
                                        <button type="button" className={btnSec} onClick={() => mudarTexto(ev, padrao.textos[ev])}>Voltar ao texto padrão</button>
                                    ) : null}
                                </div>
                            </div>
                            <div>
                                <span className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Como o cliente vê</span>
                                <div className="mt-1 rounded-2xl bg-[#EFE7DD] p-3 dark:bg-[#0B141A]">
                                    <div className="max-w-[300px] rounded-xl rounded-tl-none bg-white p-1.5 text-[14.5px] text-[#111B21] shadow-sm dark:bg-[#202C33] dark:text-[#E9EDEF]">
                                        {ev !== "recebido" && cfg.foto_pronta && ev === "pronta" ? (
                                            <div className="mb-1.5 flex h-[150px] items-center justify-center rounded-lg bg-[#D9DEE5] text-[13px] text-[#5B6478] dark:bg-white/10 dark:text-[#AEB9CF]">Foto da coroa pronta</div>
                                        ) : null}
                                        <div className="whitespace-pre-wrap break-words px-1.5 pb-1" dangerouslySetInnerHTML={{ __html: formatarWhats(comExemplo(cfg.textos[ev])) }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="flex flex-col gap-3 border-t border-[#E1E5EC] pt-5 dark:border-white/10">
                        <div>
                            <b className="block text-[16px]">Modelos da Meta (cliente sem conversa aberta)</b>
                            <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                Ligue só depois que a Meta aprovar os três modelos. Variáveis no modelo, nesta ordem: {"{{1}}"} nome · {"{{2}}"} nº do pedido · {"{{3}}"} falecido · {"{{4}}"} local (o pedido recebido usa só as três primeiras). O modelo da coroa pronta tem cabeçalho de imagem. Se você mudar o texto aqui, atualize também na Meta (botão "Copiar para a Meta").
                            </span>
                        </div>
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                            <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={cfg.modelos.ativo} onChange={(e) => setCfg({ ...cfg, modelos: { ...cfg.modelos, ativo: e.target.checked } })} />
                            <b className="text-[15px]">Usar os modelos aprovados quando não houver conversa aberta</b>
                        </label>
                        <div className="grid gap-3 md:grid-cols-4">
                            {EVENTOS_COROA.map(([ev, titulo]) => (
                                <label key={ev} className="flex flex-col">
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{titulo}</span>
                                    <input className={`${campoTexto} h-11`} value={cfg.modelos[ev]} onChange={(e) => setCfg({ ...cfg, modelos: { ...cfg.modelos, [ev]: e.target.value.trim() } })} />
                                </label>
                            ))}
                            <label className="flex flex-col">
                                <span className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Idioma</span>
                                <input className={`${campoTexto} h-11`} value={cfg.modelos.idioma} onChange={(e) => setCfg({ ...cfg, modelos: { ...cfg.modelos, idioma: e.target.value.trim() } })} />
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnPri} disabled={ocupado} onClick={() => void post("config_salvar", { cfg })}>Salvar</button>
                        <button type="button" className={btnSec} disabled={ocupado} onClick={() => void post("rodar")}>Rodar agora</button>
                    </div>
                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                        {ultima?.fim ? `Última verificação: ${new Date(ultima.fim).toLocaleString("pt-BR")} · ${ultima.msg || ""}` : "Ainda não rodou. Confira o cron (a cada 5 minutos)."}
                    </p>
                </>
            ) : null}
        </section>
    );
}
