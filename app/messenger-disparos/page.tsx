"use client";

/**
 * Campanhas e Lembretes (24/11/2026) — rota /messenger-disparos
 * Aba Modelos: Automáticos (régua: vencimento, atraso, boas-vindas) e Campanhas (público por filtros ou lista), cada um
 * aberto numa janela com o texto (emojis, macros, negrito), a prévia no celular e a aprovação na Meta.
 * Aba Histórico: cada mensagem da fila (em aprovação, aguardando, enviada, entregue, lida, respondeu, abriu o botão,
 * pago, não enviada com o motivo), com ações em lote e o detalhe numa janela.
 * Servidor: aurora_22.php (cron de 15 em 15 minutos). Mudar, aprovar e disparar é só da Gestão.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_22.php`;

type Meta = "aprovado" | "analise" | "rejeitado" | "rascunho";
type Modelo = {
    id: string; kind: "auto" | "camp"; nome: string; modelo: string; modo: string; gat: string; quando: string; aprov: "auto" | "aprov";
    dias_semana: number[]; hora: string; ate: string; sit: string[]; atraso: string; grupo: string; botao: string; cat: "UTILITY" | "MARKETING";
    texto: string; meta: Meta; meta_motivo: string; meta_categoria: string; meta_em: string; versao: number;
    novo: { texto: string; botao: string } | null;
    pendente: { modelo: string; texto: string; botao: string; enviado_em: string; status: Meta; motivo: string; categoria: string } | null;
    pub: "filtro" | "lista"; lista: string; agendado_em: string; camp_estado: string; agendada_qtd?: number; teste_contratos: string;
    atualizado_em?: string; atualizado_por?: string;
    numeros: { enviados: number; abriram: number; pagos: number; nao_enviados: number; ultimo: string | null; fila?: number } | null;
};
type Macro = { chave: string; nome: string; exemplo: string };
type Painel = {
    campanhas: Modelo[]; macros: Macro[]; situacoes: string[]; gestao: boolean; meta_ok: boolean; tabelas_ok: boolean;
    precos: { UTILITY: number; MARKETING: number }; link_app: string; cron: string;
};
type Envio = {
    id: number; campanha: string; origem: string; contrato: string | null; titular: string | null; telefone: string | null;
    situacao: string; motivo: string | null; texto: string | null; programado_em: string | null; enviado_em: string | null;
    conversa_id: number | null; linha: [string | null, string][];
};
type NP = { telefone: string; contrato: string | null; motivo: string | null; criado_em: string };

const MODOS: Record<string, [string, string]> = {
    ligada: ["Ligada", "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]"],
    teste: ["Em teste", "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]"],
    desligada: ["Desligada", "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"],
};
const OK = "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]";
const AMARELO = "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]";
const CINZA = "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]";
const VERMELHO = "bg-[#FDECEA] text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]";
const AZUL = "bg-[#E9EFF6] text-[#1E3A5C] dark:bg-[#3D6A99]/25 dark:text-white";
const METAS: Record<Meta, [string, string]> = {
    aprovado: ["Aprovado na Meta", OK], analise: ["Em análise na Meta", AMARELO], rejeitado: ["Rejeitado pela Meta", VERMELHO], rascunho: ["Ainda não enviado à Meta", CINZA],
};
const SITS: Record<string, [string, string]> = {
    aprov: ["Em aprovação", AMARELO], aguard: ["Aguardando envio", CINZA], enviada: ["Enviada", AZUL], entregue: ["Entregue", OK], lida: ["Lida", OK],
    respondeu: ["Respondeu", OK], abriu: ["Abriu o botão", OK], pago: ["Pago", OK], falhou: ["Erro ao enviar", VERMELHO], pulado: ["Não enviada", AMARELO],
    cancelado: ["Cancelada", CINZA], np: ["Não perturbe", CINZA],
};
const GRUPOS: [string, string, (s: string) => boolean][] = [
    ["", "Todas", () => true],
    ["fila", "Na fila", (s) => s === "aprov" || s === "aguard"],
    ["env", "Enviadas", (s) => ["enviada", "entregue", "lida", "respondeu", "abriu", "pago"].includes(s)],
    ["lida", "Lidas", (s) => ["lida", "respondeu", "abriu", "pago"].includes(s)],
    ["pago", "Pagaram", (s) => s === "pago"],
    ["nao", "Não enviadas", (s) => ["falhou", "pulado", "np", "cancelado"].includes(s)],
];
const GATILHOS: Record<string, [string, [string, string][]]> = {
    venc: ["Vencimento da mensalidade", [["-3", "3 dias antes do vencimento"], ["-2", "2 dias antes do vencimento"], ["-1", "1 dia antes do vencimento"], ["0", "No dia do vencimento"], ["1", "1 dia depois do vencimento"], ["2", "2 dias depois do vencimento"]]],
    atraso: ["Mensalidades em atraso", [["5", "5 dias após o vencimento"], ["10", "10 dias após o vencimento"], ["15", "15 dias após o vencimento"], ["20", "20 dias após o vencimento"], ["30", "30 dias após o vencimento"]]],
    novo: ["Contrato novo (boas-vindas)", [["0", "No dia em que aparece o contrato"]]],
};
const BOTOES: Record<string, string> = { pix: "Pagar com Pix", app: "Acessar meu contrato (app do associado)", falar: "Falar com o Plano PAI", "": "Sem botão" };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const EMOJIS = ["😊", "🙂", "👋", "🙏", "💛", "💙", "🌻", "✨", "✅", "📅", "⏰", "📌", "💳", "💰", "📲", "💬", "🎉", "🎂", "🤝", "❤️", "👍", "☀️", "🕊️", "📞"];
const ORIGENS: Record<string, string> = { auto: "Automático", campanha: "Campanha", teste: "Envio de teste" };
const PALAVRAS_MKT = /(desconto|promo|oferta|aproveite|parceir|você sabia|novidade|conheça|indique|sorteio|grátis)/i;

const BTN = "inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-extrabold leading-none disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[#C9D1DE] bg-white dark:border-white/15 dark:bg-transparent`;
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const ROTULO = "mb-1 block text-[13.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]";
const MUDO = "text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]";
const CHIP = "inline-flex min-h-[36px] items-center rounded-full border border-dashed border-[#C9D1DE] bg-[#F1F4F8] px-3 text-[13px] font-bold dark:border-white/15 dark:bg-[#1C2334]";

const hojeIso = () => new Date().toLocaleDateString("sv-SE");
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const hora = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
const dataBr = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("pt-BR") : "");
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fone = (t: string | null) => {
    const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : t || "";
};

async function aGet<T = any>(acao: string, params: Record<string, any> = {}): Promise<T> {
    const u = new URL(API);
    u.searchParams.set("action", acao);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    const j = await apiJson(u.toString());
    return j.dados as T;
}
async function aPost(acao: string, corpo: Record<string, any> = {}) {
    return apiJson(`${API}?action=${encodeURIComponent(acao)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}

/** Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~) como elementos React. */
function Whats({ texto }: { texto: string }) {
    const partes: React.ReactNode[] = [];
    const re = /\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
    let ult = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(texto))) {
        if (m.index > ult) partes.push(texto.slice(ult, m.index));
        if (m[1]) partes.push(<b key={i++}>{m[1]}</b>);
        else if (m[2]) partes.push(<i key={i++}>{m[2]}</i>);
        else partes.push(<s key={i++}>{m[3]}</s>);
        ult = re.lastIndex;
    }
    if (ult < texto.length) partes.push(texto.slice(ult));
    return <>{partes}</>;
}

function Celular({ texto, botao, horaTxt, titulo = "Plano PAI" }: { texto: string; botao: string; horaTxt: string; titulo?: string }) {
    return (
        <div className="rounded-[22px] border-[8px] border-[#313C55] bg-[#EFEAE2] p-3 dark:border-[#0E1320] dark:bg-[#0B141A]">
            <div className="mb-3 flex items-center gap-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#F2CB3F] text-[12px] font-extrabold text-[#161C2A]">PAI</span>
                <span>{titulo}</span>
            </div>
            <div className="whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] bg-white px-3 pb-1.5 pt-2 text-[15px] leading-[1.4] text-[#111B21] shadow-sm dark:bg-[#202C33] dark:text-[#E9EDEF]">
                <Whats texto={texto || " "} />
                <span className="mt-1 block text-right text-[11px] opacity-60">{horaTxt}</span>
            </div>
            {botao && <div className="mt-1 rounded-xl bg-white p-2 text-center text-[15px] font-bold text-[#027EB5] shadow-sm dark:bg-[#202C33] dark:text-[#53BDEB]">↗ {BOTOES[botao]?.replace(" (app do associado)", "")}</div>}
        </div>
    );
}

function Etiqueta({ par }: { par: [string, string] | undefined }) {
    if (!par) return null;
    return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold ${par[1]}`}>{par[0]}</span>;
}

function Janela({ aberta, fechar, titulo, sub, direita, largura = "max-w-[1080px]", children }: {
    aberta: boolean; fechar: () => void; titulo: string; sub?: string; direita?: React.ReactNode; largura?: string; children: React.ReactNode;
}) {
    useEffect(() => {
        if (!aberta) return;
        const k = (e: KeyboardEvent) => e.key === "Escape" && fechar();
        window.addEventListener("keydown", k);
        const antes = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", k);
            document.body.style.overflow = antes;
        };
    }, [aberta, fechar]);
    if (!aberta) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[#0A0E16]/60 p-2 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && fechar()} role="dialog" aria-modal="true">
            <div className={`w-full ${largura} rounded-[20px] border border-[#E1E5EC] bg-white p-4 shadow-2xl sm:p-6 dark:border-white/12 dark:bg-[#232B3F]`}>
                <div className="mb-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <h2 className="m-0 text-[21px] font-extrabold leading-tight">{titulo}</h2>
                        {sub && <p className={`m-0 ${MUDO}`}>{sub}</p>}
                    </div>
                    {direita}
                    <button type="button" aria-label="Fechar" onClick={fechar} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F1F4F8] text-[22px] dark:bg-[#1C2334]">×</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function Alternar({ ligado, onClick, children }: { ligado: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={ligado}
            className={`min-h-[36px] rounded-full border px-3 text-[13px] font-bold ${ligado ? "border-transparent " + OK : "border-[#C9D1DE] bg-[#F1F4F8] text-[#5B6478] dark:border-white/15 dark:bg-[#1C2334] dark:text-[#AEB9CF]"}`}>
            {children}
        </button>
    );
}

const vazio = (kind: "auto" | "camp"): Modelo => ({
    id: "", kind, nome: "", modelo: "", modo: "desligada", gat: kind === "auto" ? "venc" : "", quando: kind === "auto" ? "-1" : "0", aprov: "auto",
    dias_semana: [1, 1, 1, 1, 1, 1, 0], hora: "09:00", ate: "18:00", sit: ["Ativo", "Inadimplente", "Pré-cancelado"], atraso: "", grupo: "",
    botao: kind === "auto" ? "pix" : "falar", cat: "UTILITY", texto: "Olá, {nome}! 👋\n", meta: "rascunho", meta_motivo: "", meta_categoria: "", meta_em: "",
    versao: 1, novo: null, pendente: null, pub: "filtro", lista: "", agendado_em: "", camp_estado: "rascunho", teste_contratos: "", numeros: null,
});

export default function CampanhasLembretesPage() {
    const [painel, setPainel] = useState<Painel | null>(null);
    const [aba, setAba] = useState<"modelos" | "historico">("modelos");
    const [kind, setKind] = useState<"auto" | "camp">("auto");
    const [form, setForm] = useState<Modelo | null>(null);
    const [original, setOriginal] = useState<Modelo | null>(null);
    const [exemplo, setExemplo] = useState(0);
    const [emoji, setEmoji] = useState(false);
    const [publico, setPublico] = useState<{ n: number; custo: number } | null>(null);
    const [previa, setPrevia] = useState<{ hoje_envia: boolean; lista: any[] } | null>(null);
    const [teste, setTeste] = useState<{ contrato: string; telefone: string } | null>(null);
    const [ocupado, setOcupado] = useState("");
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    // histórico
    const [de, setDe] = useState(hojeIso());
    const [ate, setAte] = useState(hojeIso());
    const [fCamp, setFCamp] = useState("");
    const [fOrig, setFOrig] = useState("");
    const [busca, setBusca] = useState("");
    const [grupo, setGrupo] = useState("");
    const [envios, setEnvios] = useState<Envio[] | null>(null);
    const [marcados, setMarcados] = useState<number[]>([]);
    const [detalhe, setDetalhe] = useState<Envio | null>(null);
    // configurações
    const [config, setConfig] = useState(false);
    const [linkApp, setLinkApp] = useState("");
    const [np, setNp] = useState<NP[] | null>(null);
    const [npNovo, setNpNovo] = useState({ telefone: "", contrato: "", motivo: "" });
    const texto = useRef<HTMLTextAreaElement>(null);

    const gestao = !!painel?.gestao;
    const nomeModelo = useCallback((id: string) => painel?.campanhas.find((c) => c.id === id)?.nome || id, [painel]);

    const carregar = useCallback(async () => {
        try {
            const p = await aGet<Painel>("painel");
            setPainel(p);
            setLinkApp(p.link_app || "");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar a tela.");
        }
    }, []);
    const carregarHist = useCallback(async () => {
        setEnvios(null);
        setMarcados([]);
        try {
            setEnvios(await aGet<Envio[]>("historico", { de, ate, campanha: fCamp, origem: fOrig, q: busca.trim() }));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o histórico.");
            setEnvios([]);
        }
    }, [de, ate, fCamp, fOrig, busca]);

    useEffect(() => {
        carregar();
        if (typeof window !== "undefined" && window.location.hash === "#historico") setAba("historico");
    }, [carregar]);
    useEffect(() => {
        if (aba !== "historico") return;
        const t = setTimeout(carregarHist, 300);
        return () => clearTimeout(t);
    }, [aba, carregarHist]);

    async function executar(rotulo: string, fn: () => Promise<any>) {
        setOcupado(rotulo);
        setErro("");
        setAviso("");
        try {
            const j = await fn();
            if (j?.msg) setAviso(j.msg);
            return j ?? true;
        } catch (e: any) {
            setErro(e?.message || "Falha na operação.");
            return null;
        } finally {
            setOcupado("");
        }
    }

    // -------- modelo (janela)
    function abrirModelo(m: Modelo) {
        const edit = { ...m, texto: m.novo?.texto ?? m.texto, botao: m.novo?.botao ?? m.botao };
        setForm(edit);
        setOriginal(m);
        setPublico(null);
        setPrevia(null);
        setTeste(null);
        setEmoji(false);
        setErro("");
        setAviso("");
    }
    const fecharModelo = useCallback(() => {
        setForm(null);
        setOriginal(null);
    }, []);
    const mudar = (p: Partial<Modelo>) => setForm((f) => (f ? { ...f, ...p } : f));

    function inserir(txt: string, envolver = "") {
        const t = texto.current;
        if (!t || !form) return;
        const a = t.selectionStart, b = t.selectionEnd, v = form.texto;
        let novo: string, ini: number, fim: number;
        if (envolver) {
            const sel = v.slice(a, b) || "texto";
            novo = v.slice(0, a) + envolver + sel + envolver + v.slice(b);
            ini = a + 1;
            fim = ini + sel.length;
        } else {
            novo = v.slice(0, a) + txt + v.slice(b);
            ini = fim = a + txt.length;
        }
        mudar({ texto: novo.slice(0, 1024) });
        requestAnimationFrame(() => {
            t.focus();
            t.setSelectionRange(ini, fim);
        });
    }

    const exemplos = useMemo(() => {
        const base: Record<string, string> = {};
        painel?.macros.forEach((m) => (base[m.chave] = m.exemplo));
        return [
            base,
            { ...base, nome: "João Ribeiro", valor: "R$ 84,00", parcelas: "2", dias_atraso: "31", vencimento: "25/10/2026", contrato: "10863", plano: "Plano PLUS" },
            { ...base, nome: "Ana Paula Lima", valor: "R$ 45,00", contrato: "12322", plano: "Plano MAX", dia_vencimento: "10", dependentes: "2" },
        ];
    }, [painel]);
    const preencher = (t: string, ex: Record<string, string>) => t.replace(/\{([a-z_]+)\}/g, (m, k) => ex[k] ?? m);
    const paraMeta = (t: string) => {
        let i = 0;
        const usadas: string[] = [];
        const out = t.replace(/\{([a-z_]+)\}/g, (m, k) => {
            if (!painel?.macros.some((x) => x.chave === k)) return m;
            usadas.push(k);
            return `{{${++i}}}`;
        });
        return out + "\n\n" + (usadas.length ? usadas.map((k, n) => `{{${n + 1}}} = ${painel?.macros.find((x) => x.chave === k)?.nome || k}`).join("\n") : "Sem variáveis.");
    };

    async function salvar() {
        if (!form) return;
        const j = await executar("salvar", () => aPost("campanha_salvar", { ...form }));
        if (j) {
            await carregar();
            if (j.dados?.id && !form.id) mudar({ id: j.dados.id });
        }
    }
    async function enviarMeta() {
        if (!form?.id) return setErro("Salve o modelo antes de enviar para a Meta.");
        const ok = await executar("salvar", () => aPost("campanha_salvar", { ...form }));
        if (!ok) return;
        const j = await executar("meta", () => aPost("meta_enviar", { id: form.id }));
        if (j) await recarregarForm(form.id);
    }
    async function statusMeta() {
        if (!form?.id) return;
        const j = await executar("meta", () => aPost("meta_status", { id: form.id }));
        if (j) await recarregarForm(form.id);
    }
    async function recarregarForm(id: string) {
        const p = await aGet<Painel>("painel");
        setPainel(p);
        const m = p.campanhas.find((c) => c.id === id);
        if (m) abrirModelo(m);
    }
    async function verPublico() {
        if (!form) return;
        await executar("publico", async () => {
            const j = await aPost("publico", { ...form });
            setPublico(j.dados);
            return null;
        });
    }
    async function verPrevia() {
        if (!form?.id) return setErro("Salve o modelo antes de ver a prévia.");
        await executar("previa", async () => {
            setPrevia(await aGet("previa", { id: form.id }));
            return null;
        });
    }
    async function agendar() {
        if (!form?.id) return;
        if (!window.confirm(`Agendar "${form.nome}" para ${form.agendado_em ? dt(form.agendado_em) : "agora"}? Quem está na lista Não perturbe fica de fora.`)) return;
        const ok = await executar("salvar", () => aPost("campanha_salvar", { ...form }));
        if (!ok) return;
        const j = await executar("agendar", () => aPost("campanha_agendar", { id: form.id }));
        if (j) await recarregarForm(form.id);
    }
    async function rodar() {
        if (!form?.id) return;
        if (!window.confirm(`Montar a fila de hoje de "${form.nome}" e enviar agora o que já está liberado? Quem já recebeu não recebe de novo.`)) return;
        const j = await executar("rodar", () => aPost("rodar", { id: form.id }));
        if (j) await carregar();
    }
    async function arquivar() {
        if (!form?.id || !window.confirm(`Arquivar "${form.nome}"? Os envios na fila são cancelados; o histórico continua.`)) return;
        const j = await executar("arquivar", () => aPost("campanha_arquivar", { id: form.id }));
        if (j) {
            fecharModelo();
            await carregar();
        }
    }
    async function enviarTeste() {
        if (!form?.id || !teste) return;
        await executar("teste", () => aPost("teste_envio", { id: form.id, contrato: teste.contrato, telefone: teste.telefone }));
    }

    // -------- histórico
    const filtrados = useMemo(() => {
        const f = GRUPOS.find((g) => g[0] === grupo)?.[2] || (() => true);
        return (envios || []).filter((e) => f(e.situacao));
    }, [envios, grupo]);
    const selecionavel = (e: Envio) => ["aprov", "aguard", "falhou", "pulado"].includes(e.situacao);
    async function emLote(acao: "aprovar" | "cancelar" | "reenviar", ids = marcados) {
        if (!ids.length) return;
        const nomes = { aprovar: "Aprovar", cancelar: "Cancelar", reenviar: "Enviar de novo" };
        if (!window.confirm(`${nomes[acao]} ${ids.length} envio(s)?`)) return;
        const j = await executar(`lote-${acao}`, () => aPost("envios_acao", { ids, acao }));
        if (j) {
            setDetalhe(null);
            await carregarHist();
        }
    }
    async function incluirNp(tel: string, contrato = "", motivo = "") {
        const j = await executar("np", () => aPost("np_incluir", { telefone: tel, contrato, motivo }));
        if (j && np) setNp(await aGet<NP[]>("nao_perturbe"));
        return j;
    }

    // -------- configurações
    async function abrirConfig() {
        setConfig(true);
        if (painel?.tabelas_ok) {
            try {
                setNp(await aGet<NP[]>("nao_perturbe"));
            } catch {
                setNp([]);
            }
        }
    }

    const lista = (painel?.campanhas || []).filter((c) => c.kind === kind);
    const mudouTexto = !!form && !!original && original.meta === "aprovado" && (form.texto !== original.texto || form.botao !== original.botao);
    const palavrasMkt = !!form && form.cat === "UTILITY" && PALAVRAS_MKT.test(form.texto);
    const metaAtual = form?.meta || "rascunho";

    return (
        <div className="mx-auto w-full max-w-[1280px] px-3 pb-16 pt-4 sm:px-6">
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                    <h1 className="m-0 text-[28px] font-extrabold leading-tight sm:text-[34px]">Campanhas e Lembretes</h1>
                    <p className={`m-0 mt-1 max-w-[70ch] ${MUDO} text-[15px]`}>
                        Mensagens automáticas da régua (vencimentos, atrasos, boas-vindas) e campanhas da equipe, com o histórico de tudo o que saiu, foi lido, abriu o botão, foi pago ou não foi enviado.
                    </p>
                </div>
                <button type="button" className={BTN_SEC} onClick={abrirConfig}>Configurações</button>
            </div>

            {painel && !painel.tabelas_ok && (
                <div className={`mt-4 rounded-xl px-4 py-3 text-[14.5px] font-bold ${VERMELHO}`}>
                    Faltam as tabelas chat_disparos_envios e chat_disparos_nao_perturbe no banco. Enquanto isso, nada entra na fila.
                </div>
            )}
            {painel && !painel.meta_ok && <div className={`mt-4 rounded-xl px-4 py-3 text-[14.5px] font-bold ${AMARELO}`}>WhatsApp (Meta) não configurado no servidor.</div>}
            {erro && <div className={`mt-4 rounded-xl px-4 py-3 text-[14.5px] font-bold ${VERMELHO}`}>{erro}</div>}
            {aviso && !form && !detalhe && <div className={`mt-4 rounded-xl px-4 py-3 text-[14.5px] font-bold ${OK}`}>{aviso}</div>}

            <div className="mt-5 flex flex-wrap gap-1 border-b border-[#E1E5EC] dark:border-white/12" role="tablist">
                {([["modelos", "Modelos", painel?.campanhas.length], ["historico", "Histórico", null]] as const).map(([id, rot, n]) => (
                    <button key={id} type="button" role="tab" aria-selected={aba === id}
                        onClick={() => { setAba(id); window.history.replaceState(null, "", `#${id}`); }}
                        className={`min-h-[44px] rounded-t-xl border-b-[3px] px-4 text-[16px] font-extrabold ${aba === id ? "border-[#F2CB3F]" : "border-transparent text-[#5B6478] dark:text-[#AEB9CF]"}`}>
                        {rot}{n != null && <span className="ml-2 rounded-full bg-[#F1F4F8] px-2 text-[12px] dark:bg-[#1C2334]">{n}</span>}
                    </button>
                ))}
            </div>

            {/* ---------------- MODELOS ---------------- */}
            {aba === "modelos" && (
                <section className="mt-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]">
                            {([["auto", "Automáticos (régua)"], ["camp", "Campanhas (manuais)"]] as const).map(([k, r]) => (
                                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                                    className={`min-h-[40px] rounded-lg px-4 text-[15px] font-extrabold ${kind === k ? "bg-white shadow dark:bg-[#232B3F]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{r}</button>
                            ))}
                        </div>
                        <span className="flex-1" />
                        {gestao && <button type="button" className={BTN_PRI} onClick={() => abrirModelo(vazio(kind))}>{kind === "auto" ? "Novo automático" : "Nova campanha"}</button>}
                    </div>
                    <p className={`m-0 mb-3 ${MUDO}`}>
                        {kind === "auto"
                            ? "Saem sozinhos todo dia, pelas regras de cada um. A fila do dia é montada de madrugada e sai no horário do modelo."
                            : "Montadas pela equipe para um público escolhido por filtros ou por uma lista. A Gestão aprova e agenda o envio."}
                    </p>
                    <div className={`${CARTAO} overflow-x-auto p-2`}>
                        {!painel ? <p className={`p-4 ${MUDO}`}>Carregando…</p> : lista.length === 0 ? <p className={`p-4 ${MUDO}`}>Nenhum modelo aqui ainda.</p> : (
                            <table className="w-full min-w-[820px] text-left text-[14.5px]">
                                <thead className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    {kind === "auto" ? (
                                        <tr><th className="p-2">Modelo</th><th className="p-2">Quando</th><th className="p-2">Envio</th><th className="p-2">Situação</th><th className="p-2">Meta</th><th className="p-2">Último envio</th><th className="p-2 text-right">Enviados</th><th className="p-2 text-right">Pagos</th><th className="p-2 text-right">Não enviados</th></tr>
                                    ) : (
                                        <tr><th className="p-2">Campanha</th><th className="p-2">Público</th><th className="p-2">Agendada para</th><th className="p-2">Categoria</th><th className="p-2">Situação</th><th className="p-2">Meta</th><th className="p-2 text-right">Enviados</th><th className="p-2 text-right">Na fila</th></tr>
                                    )}
                                </thead>
                                <tbody>
                                    {lista.map((c) => (
                                        <tr key={c.id} tabIndex={0} onClick={() => abrirModelo(c)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), abrirModelo(c))}
                                            className="cursor-pointer border-t border-[#EEF0F3] hover:bg-[#F7F9FB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB3F] dark:border-white/10 dark:hover:bg-white/5">
                                            <td className="p-2"><b>{c.nome}</b><div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{c.modelo}{c.pendente ? ` · nova versão em análise` : c.novo ? " · texto novo não enviado" : ""}</div></td>
                                            {kind === "auto" ? (
                                                <>
                                                    <td className="p-2">{GATILHOS[c.gat]?.[1].find((q) => q[0] === c.quando)?.[1] || GATILHOS[c.gat]?.[0]}</td>
                                                    <td className="p-2"><Etiqueta par={c.aprov === "aprov" ? ["Com aprovação", AMARELO] : ["Automático", CINZA]} /></td>
                                                    <td className="p-2"><Etiqueta par={MODOS[c.modo]} /></td>
                                                    <td className="p-2"><Etiqueta par={METAS[c.meta]} /></td>
                                                    <td className="whitespace-nowrap p-2">{dt(c.numeros?.ultimo)}</td>
                                                    <td className="p-2 text-right">{c.numeros?.enviados ?? 0}</td>
                                                    <td className="p-2 text-right">{c.numeros?.pagos ?? 0}</td>
                                                    <td className="p-2 text-right">{c.numeros?.nao_enviados ?? 0}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="p-2">{c.pub === "lista" ? "Lista colada" : `${c.sit.join(", ")}${c.grupo ? ` · ${c.grupo}` : ""}`}</td>
                                                    <td className="whitespace-nowrap p-2">{c.agendado_em ? dt(c.agendado_em) : "—"}</td>
                                                    <td className="p-2"><Etiqueta par={c.cat === "MARKETING" ? ["Marketing", AMARELO] : ["Utilidade", CINZA]} /></td>
                                                    <td className="p-2"><Etiqueta par={c.camp_estado === "agendada" ? [`Agendada (${c.agendada_qtd ?? 0})`, OK] : ["Rascunho", CINZA]} /></td>
                                                    <td className="p-2"><Etiqueta par={METAS[c.meta]} /></td>
                                                    <td className="p-2 text-right">{c.numeros?.enviados ?? 0}</td>
                                                    <td className="p-2 text-right">{c.numeros?.fila ?? 0}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {/* ---------------- HISTÓRICO ---------------- */}
            {aba === "historico" && (
                <section className="mt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <label><span className={ROTULO}>De</span><input type="date" className={CAMPO} value={de} onChange={(e) => setDe(e.target.value)} /></label>
                        <label><span className={ROTULO}>Até</span><input type="date" className={CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} /></label>
                        <label><span className={ROTULO}>Modelo</span>
                            <select className={CAMPO} value={fCamp} onChange={(e) => setFCamp(e.target.value)}>
                                <option value="">Todos</option>
                                {painel?.campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </label>
                        <label><span className={ROTULO}>Origem</span>
                            <select className={CAMPO} value={fOrig} onChange={(e) => setFOrig(e.target.value)}>
                                <option value="">Todas</option>
                                {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </label>
                        <label><span className={ROTULO}>Contrato, nome ou telefone</span><input className={CAMPO} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para filtrar" /></label>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        {GRUPOS.map(([k, r, f]) => (
                            <button key={k} type="button" aria-pressed={grupo === k} onClick={() => setGrupo(k)}
                                className={`rounded-2xl border bg-white p-3 text-left dark:bg-[#232B3F] ${grupo === k ? "border-[#F2CB3F] ring-1 ring-[#F2CB3F]" : "border-[#E1E5EC] dark:border-white/12"}`}>
                                <b className="block text-[22px] leading-tight">{(envios || []).filter((e) => f(e.situacao)).length}</b>
                                <span className={MUDO}>{r}</span>
                            </button>
                        ))}
                    </div>
                    {gestao && marcados.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <b>{marcados.length} selecionado(s)</b>
                            <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={() => emLote("aprovar")}>Aprovar envio</button>
                            <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={() => emLote("reenviar")}>{ocupado === "lote-reenviar" ? "Enviando…" : "Enviar novamente"}</button>
                            <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={() => emLote("cancelar")}>Cancelar envio</button>
                        </div>
                    )}
                    <div className={`${CARTAO} mt-3 overflow-x-auto p-2`}>
                        {envios === null ? <p className={`p-4 ${MUDO}`}>Carregando…</p> : filtrados.length === 0 ? <p className={`p-4 ${MUDO}`}>Nenhuma mensagem com esses filtros.</p> : (
                            <table className="w-full min-w-[820px] text-left text-[14.5px]">
                                <thead className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    <tr><th className="w-10 p-2" /><th className="p-2">Hora</th><th className="p-2">Contrato</th><th className="p-2">Titular</th><th className="p-2">Modelo</th><th className="p-2">Situação</th><th className="p-2">Motivo</th></tr>
                                </thead>
                                <tbody>
                                    {filtrados.map((e, i) => {
                                        const dia = dataBr(e.programado_em);
                                        const novoDia = i === 0 || dataBr(filtrados[i - 1].programado_em) !== dia;
                                        return (
                                            <React.Fragment key={e.id}>
                                                {novoDia && <tr><td colSpan={7} className="px-2 pb-1 pt-4 font-extrabold">{dia}</td></tr>}
                                                <tr tabIndex={0} onClick={() => setDetalhe(e)} onKeyDown={(k) => (k.key === "Enter") && setDetalhe(e)}
                                                    className="cursor-pointer border-t border-[#EEF0F3] hover:bg-[#F7F9FB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB3F] dark:border-white/10 dark:hover:bg-white/5">
                                                    <td className="p-2" onClick={(k) => k.stopPropagation()}>
                                                        {gestao && selecionavel(e) && (
                                                            <input type="checkbox" className="h-5 w-5" aria-label="Selecionar" checked={marcados.includes(e.id)}
                                                                onChange={(k) => setMarcados((m) => (k.target.checked ? [...m, e.id] : m.filter((x) => x !== e.id)))} />
                                                        )}
                                                    </td>
                                                    <td className="whitespace-nowrap p-2">{hora(e.enviado_em || e.programado_em)}</td>
                                                    <td className="p-2">{e.contrato || "—"}</td>
                                                    <td className="p-2">{e.titular || fone(e.telefone) || "—"}</td>
                                                    <td className="p-2">{nomeModelo(e.campanha)}{e.origem !== "auto" ? <span className={`ml-1 ${MUDO}`}>· {ORIGENS[e.origem] || e.origem}</span> : null}</td>
                                                    <td className="p-2"><Etiqueta par={SITS[e.situacao]} /></td>
                                                    <td className={`p-2 ${MUDO}`}>{e.motivo || ""}</td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {/* ---------------- JANELA DO MODELO ---------------- */}
            <Janela aberta={!!form} fechar={fecharModelo} titulo={form?.nome || (form?.kind === "camp" ? "Nova campanha" : "Novo automático")}
                sub={original?.atualizado_por ? `Alterado por ${original.atualizado_por} em ${dt(original.atualizado_em)}` : undefined}
                direita={form && form.kind === "auto" ? <Etiqueta par={MODOS[form.modo]} /> : undefined}>
                {form && (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
                        <div className="min-w-0">
                            {erro && <div className={`mb-3 rounded-xl px-3 py-2 text-[14px] font-bold ${VERMELHO}`}>{erro}</div>}
                            {aviso && <div className={`mb-3 rounded-xl px-3 py-2 text-[14px] font-bold ${OK}`}>{aviso}</div>}
                            <fieldset disabled={!gestao} className="m-0 min-w-0 border-0 p-0">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label><span className={ROTULO}>Nome na tela</span><input className={CAMPO} value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} /></label>
                                    <label><span className={ROTULO}>Nome do modelo na Meta</span>
                                        <input className={CAMPO} value={form.modelo} disabled={form.meta === "aprovado"} onChange={(e) => mudar({ modelo: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="ex.: lembrete_vence_hoje" />
                                    </label>
                                    {form.kind === "auto" && (
                                        <label><span className={ROTULO}>Situação</span>
                                            <select className={CAMPO} value={form.modo} onChange={(e) => mudar({ modo: e.target.value })}>
                                                <option value="ligada">Ligada</option><option value="teste">Em teste (só contratos de teste)</option><option value="desligada">Desligada</option>
                                            </select>
                                        </label>
                                    )}
                                    <label><span className={ROTULO}>Botão</span>
                                        <select className={CAMPO} value={form.botao} onChange={(e) => mudar({ botao: e.target.value })}>
                                            {Object.entries(BOTOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </label>
                                    {form.kind === "auto" && form.modo === "teste" && (
                                        <label className="sm:col-span-2"><span className={ROTULO}>Contratos de teste (só estes recebem)</span>
                                            <input className={CAMPO} value={form.teste_contratos} onChange={(e) => mudar({ teste_contratos: e.target.value })} placeholder="04197, 12322" />
                                        </label>
                                    )}
                                </div>

                                {form.kind === "auto" ? (
                                    <div className="mt-5 border-t border-[#E1E5EC] pt-3 dark:border-white/12">
                                        <h3 className="m-0 text-[16px] font-extrabold">Quando enviar</h3>
                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <label><span className={ROTULO}>Gatilho</span>
                                                <select className={CAMPO} value={form.gat} onChange={(e) => mudar({ gat: e.target.value, quando: GATILHOS[e.target.value][1][0][0] })}>
                                                    {Object.entries(GATILHOS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                                                </select>
                                            </label>
                                            <label><span className={ROTULO}>Dia</span>
                                                <select className={CAMPO} value={form.quando} onChange={(e) => mudar({ quando: e.target.value })}>
                                                    {(GATILHOS[form.gat]?.[1] || []).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                                                </select>
                                            </label>
                                            <label><span className={ROTULO}>Envio</span>
                                                <select className={CAMPO} value={form.aprov} onChange={(e) => mudar({ aprov: e.target.value as any })}>
                                                    <option value="auto">Automático</option><option value="aprov">Com aprovação no Histórico</option>
                                                </select>
                                            </label>
                                        </div>
                                        <span className={`${ROTULO} mt-3`}>Dias da semana</span>
                                        <div className="flex flex-wrap gap-2">
                                            {DIAS.map((d, i) => (
                                                <Alternar key={d} ligado={!!form.dias_semana[i]} onClick={() => mudar({ dias_semana: form.dias_semana.map((v, j) => (j === i ? (v ? 0 : 1) : v)) })}>{d}</Alternar>
                                            ))}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-3">
                                            <label><span className={ROTULO}>Sai a partir de</span><input type="time" className={CAMPO} value={form.hora} onChange={(e) => mudar({ hora: e.target.value })} /></label>
                                            <label><span className={ROTULO}>Até</span><input type="time" className={CAMPO} value={form.ate} onChange={(e) => mudar({ ate: e.target.value })} /></label>
                                        </div>
                                        {form.gat === "novo" && <p className={`mt-2 ${MUDO}`}>Os contratos novos aparecem pela cópia diária da Unymos (cron da madrugada). No primeiro dia ligado, o sistema só marca de onde começar.</p>}
                                    </div>
                                ) : (
                                    <div className="mt-5 border-t border-[#E1E5EC] pt-3 dark:border-white/12">
                                        <h3 className="m-0 text-[16px] font-extrabold">Público e envio</h3>
                                        <div className="mt-2 inline-flex flex-wrap gap-1 rounded-xl bg-[#F1F4F8] p-1 dark:bg-[#1C2334]">
                                            {([["filtro", "Por filtros"], ["lista", "Lista de contratos ou telefones"]] as const).map(([k, r]) => (
                                                <button key={k} type="button" aria-pressed={form.pub === k} onClick={() => { mudar({ pub: k }); setPublico(null); }}
                                                    className={`min-h-[40px] rounded-lg px-3 text-[14px] font-extrabold ${form.pub === k ? "bg-white shadow dark:bg-[#232B3F]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{r}</button>
                                            ))}
                                        </div>
                                        {form.pub === "lista" && (
                                            <label className="mt-2 block"><span className={ROTULO}>Um contrato ou telefone por linha</span>
                                                <textarea className={`${CAMPO} h-auto min-h-[110px] py-2`} value={form.lista} onChange={(e) => { mudar({ lista: e.target.value }); setPublico(null); }} placeholder={"04197\n(77) 99982-6083"} />
                                            </label>
                                        )}
                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <label><span className={ROTULO}>Enviar em</span><input type="datetime-local" className={CAMPO} value={form.agendado_em} onChange={(e) => mudar({ agendado_em: e.target.value })} /></label>
                                            <label><span className={ROTULO}>Categoria na Meta</span>
                                                <select className={CAMPO} value={form.cat} disabled={form.meta === "aprovado"} onChange={(e) => { mudar({ cat: e.target.value as any }); setPublico(null); }}>
                                                    <option value="UTILITY">Utilidade</option><option value="MARKETING">Marketing</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {!(form.kind === "camp" && form.pub === "lista") && (
                                    <div className="mt-5 border-t border-[#E1E5EC] pt-3 dark:border-white/12">
                                        <h3 className="m-0 text-[16px] font-extrabold">Regras do público</h3>
                                        <span className={`${ROTULO} mt-2`}>Situação do contrato</span>
                                        <div className="flex flex-wrap gap-2">
                                            {(painel?.situacoes || []).map((s) => (
                                                <Alternar key={s} ligado={form.sit.includes(s)} onClick={() => { mudar({ sit: form.sit.includes(s) ? form.sit.filter((x) => x !== s) : [...form.sit, s] }); setPublico(null); }}>{s}</Alternar>
                                            ))}
                                        </div>
                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {form.gat === "atraso" && (
                                                <label><span className={ROTULO}>Parcelas em atraso</span>
                                                    <select className={CAMPO} value={form.atraso} onChange={(e) => mudar({ atraso: e.target.value })}>
                                                        <option value="">Qualquer</option><option value="1">1</option><option value="2">2</option><option value="1-2">1 a 2</option><option value="3+">3 ou mais</option>
                                                    </select>
                                                </label>
                                            )}
                                            <label><span className={ROTULO}>Plano</span>
                                                <select className={CAMPO} value={form.grupo} onChange={(e) => { mudar({ grupo: e.target.value }); setPublico(null); }}>
                                                    <option value="">Todos</option>{["LIGHT", "FLEX", "PLUS", "MAX"].map((g) => <option key={g} value={g}>{g}</option>)}<option value="Outros">Planos antigos</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                )}
                                {form.kind === "camp" && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F4F6F9] p-3 text-[14px] dark:bg-[#1C2334]">
                                        <button type="button" className={BTN_SEC} disabled={ocupado === "publico"} onClick={verPublico}>{ocupado === "publico" ? "Contando…" : "Ver público"}</button>
                                        {publico && <span><b className="text-[20px]">{publico.n}</b> {form.pub === "lista" ? "linhas na lista" : "contratos"} · custo estimado <b>{brl(publico.custo)}</b> ({form.cat === "MARKETING" ? "Marketing" : "Utilidade"}) · ficam de fora quem está em Não perturbe e quem não tem celular</span>}
                                    </div>
                                )}

                                <span className={`${ROTULO} mt-5`}>Texto da mensagem</span>
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                    <button type="button" className={CHIP} title="Negrito" onClick={() => inserir("", "*")}>B</button>
                                    <button type="button" className={CHIP} title="Itálico" onClick={() => inserir("", "_")}><i>I</i></button>
                                    <button type="button" className={CHIP} title="Riscado" onClick={() => inserir("", "~")}><s>S</s></button>
                                    <button type="button" className={CHIP} aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>Emoji 😊</button>
                                </div>
                                {emoji && (
                                    <div className="mb-2 grid grid-cols-8 gap-1 rounded-xl border border-[#E1E5EC] p-2 dark:border-white/12">
                                        {EMOJIS.map((e) => <button key={e} type="button" className="min-h-[40px] rounded-lg text-[22px] hover:bg-[#F1F4F8] dark:hover:bg-[#1C2334]" onClick={() => inserir(e)}>{e}</button>)}
                                    </div>
                                )}
                                <div className="mb-2 flex flex-wrap gap-1.5">
                                    {painel?.macros.map((m) => <button key={m.chave} type="button" className={CHIP} title={m.nome} onClick={() => inserir(`{${m.chave}}`)}>{`{${m.chave}}`}</button>)}
                                </div>
                                <textarea ref={texto} className={`${CAMPO} h-auto min-h-[170px] py-2 leading-relaxed`} value={form.texto} maxLength={1024} onChange={(e) => mudar({ texto: e.target.value })} />
                                <p className={`m-0 mt-1 ${MUDO}`}>{form.texto.length} de 1.024 caracteres · *negrito*, _itálico_ e ~riscado~ seguem a formatação do WhatsApp</p>
                                {palavrasMkt && <div className={`mt-2 rounded-xl px-3 py-2 text-[14px] font-bold ${AMARELO}`}>Este texto tem palavras de divulgação. A Meta costuma classificar como Marketing, que custa mais. Para ficar em Utilidade, fale só do contrato, da mensalidade ou do acesso do cliente.</div>}
                                {form.cat === "MARKETING" && <div className={`mt-2 rounded-xl px-3 py-2 text-[14px] font-bold ${AMARELO}`}>Categoria Marketing: custa mais por mensagem e a Meta limita quantas o cliente recebe.</div>}
                            </fieldset>

                            <div className="mt-4 rounded-2xl border border-[#E1E5EC] p-3 dark:border-white/12">
                                <div className="flex flex-wrap items-center gap-2"><b>Aprovação na Meta</b><span className="flex-1" /><Etiqueta par={METAS[metaAtual]} /></div>
                                <p className={`m-0 mt-1 ${MUDO}`}>
                                    {form.meta === "aprovado" ? `Em uso: ${original?.modelo}${form.meta_categoria ? ` · ${form.meta_categoria.toLowerCase()}` : ""}${form.meta_em ? ` · desde ${dt(form.meta_em)}` : ""}`
                                        : form.meta === "analise" ? `Enviado à Meta${form.meta_em ? ` em ${dt(form.meta_em)}` : ""}. A análise costuma levar de alguns minutos a 24 horas.`
                                        : form.meta === "rejeitado" ? `Rejeitado. ${form.meta_motivo || "Ajuste o texto e envie de novo."}`
                                        : "Ainda não enviado. Ao enviar, o sistema cadastra o modelo na Meta (pt_BR) com os exemplos das variáveis."}
                                </p>
                                {form.meta_categoria && form.meta_categoria.toUpperCase() !== form.cat && <p className={`m-0 mt-1 rounded-lg px-2 py-1 text-[13.5px] font-bold ${AMARELO}`}>A Meta classificou como {form.meta_categoria.toLowerCase()}.</p>}
                                {original?.pendente && (
                                    <p className={`m-0 mt-2 rounded-lg px-2 py-1 text-[13.5px] font-bold ${original.pendente.status === "rejeitado" ? VERMELHO : AMARELO}`}>
                                        Nova versão {original.pendente.modelo}: {original.pendente.status === "rejeitado" ? `rejeitada. ${original.pendente.motivo}` : "em análise. Continua saindo a versão aprovada até a Meta aprovar a nova."}
                                    </p>
                                )}
                                {mudouTexto && !original?.pendente && <p className={`m-0 mt-2 rounded-lg px-2 py-1 text-[13.5px] font-bold ${AMARELO}`}>O texto mudou. Ao enviar, o sistema cria uma nova versão na Meta. Até a aprovação, continua saindo a versão atual.</p>}
                                {gestao && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <button type="button" className={BTN_PRI} disabled={!!ocupado || (form.meta === "aprovado" && !mudouTexto) || form.meta === "analise"} onClick={enviarMeta}>
                                            {ocupado === "meta" ? "Enviando…" : form.meta === "aprovado" ? "Enviar nova versão para aprovação" : form.meta === "rejeitado" ? "Enviar de novo para aprovação" : "Enviar para aprovação na Meta"}
                                        </button>
                                        {form.id && form.meta !== "rascunho" && <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={statusMeta}>Atualizar situação</button>}
                                    </div>
                                )}
                                <details className="mt-2 text-[14px]">
                                    <summary className="cursor-pointer font-bold">Ver o texto como vai para a Meta</summary>
                                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[#F4F6F9] p-3 font-sans text-[14px] dark:bg-[#1C2334]">{paraMeta(form.texto)}</pre>
                                    <button type="button" className={`${BTN_SEC} mt-2`} onClick={async () => { try { await navigator.clipboard.writeText(paraMeta(form.texto)); setAviso("Texto copiado."); } catch { setErro("Selecione o texto e copie."); } }}>Copiar texto</button>
                                </details>
                            </div>

                            {gestao && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={salvar}>{ocupado === "salvar" ? "Salvando…" : "Salvar"}</button>
                                    {form.id && <button type="button" className={BTN_SEC} onClick={() => setTeste(teste ? null : { contrato: "", telefone: "" })}>Envio de teste</button>}
                                    {form.id && form.kind === "auto" && <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={verPrevia}>{ocupado === "previa" ? "Consultando…" : "Prévia de hoje"}</button>}
                                    {form.id && form.kind === "auto" && form.modo !== "desligada" && <button type="button" className={BTN_SEC} disabled={!!ocupado || form.meta !== "aprovado"} onClick={rodar}>{ocupado === "rodar" ? "Rodando…" : "Rodar agora"}</button>}
                                    {form.id && form.kind === "camp" && <button type="button" className={BTN_SEC} disabled={!!ocupado || form.meta !== "aprovado"} onClick={agendar}>{ocupado === "agendar" ? "Agendando…" : "Aprovar e agendar"}</button>}
                                    <span className="flex-1" />
                                    {form.id && <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={arquivar}>Arquivar</button>}
                                </div>
                            )}
                            {teste && (
                                <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-[#F4F6F9] p-3 sm:grid-cols-[1fr_1fr_auto] dark:bg-[#1C2334]">
                                    <label><span className={ROTULO}>Contrato (para os dados)</span><input className={CAMPO} value={teste.contrato} onChange={(e) => setTeste({ ...teste, contrato: e.target.value })} /></label>
                                    <label><span className={ROTULO}>Celular que recebe o teste</span><input className={CAMPO} inputMode="tel" value={teste.telefone} onChange={(e) => setTeste({ ...teste, telefone: e.target.value })} placeholder="(77) 9…" /></label>
                                    <button type="button" className={`${BTN_PRI} self-end`} disabled={ocupado === "teste" || form.meta !== "aprovado"} onClick={enviarTeste}>{ocupado === "teste" ? "Enviando…" : "Enviar teste"}</button>
                                </div>
                            )}
                            {previa && (
                                <div className="mt-3 rounded-xl bg-[#F4F6F9] p-3 text-[14px] dark:bg-[#1C2334]">
                                    <b>{previa.lista.filter((x) => x.situacao === "entra").length} entram hoje</b> · {previa.lista.filter((x) => x.situacao !== "entra").length} fora das regras{!previa.hoje_envia && " · hoje não é dia de envio deste modelo"}
                                    <div className="mt-2 max-h-[260px] overflow-auto">
                                        <table className="w-full text-left text-[13.5px]">
                                            <tbody>
                                                {previa.lista.map((x, i) => (
                                                    <tr key={i} className="border-t border-[#E1E5EC] dark:border-white/10">
                                                        <td className="py-1 pr-2 font-bold">{x.contrato || "—"}</td><td className="py-1 pr-2">{x.titular}</td>
                                                        <td className="py-1 pr-2">{x.valor ? brl(x.valor) : ""}</td><td className="py-1">{x.motivo || "Entra"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="min-w-0">
                            <label><span className={ROTULO}>Ver como fica para</span>
                                <select className={CAMPO} value={exemplo} onChange={(e) => setExemplo(Number(e.target.value))}>
                                    {exemplos.map((e, i) => <option key={i} value={i}>{e.nome} · contrato {e.contrato}</option>)}
                                </select>
                            </label>
                            <div className="mt-2 lg:sticky lg:top-2">
                                <Celular texto={preencher(form.texto, exemplos[exemplo] || {})} botao={form.botao} horaTxt={form.hora || "09:00"} />
                                <p className={`m-0 mt-2 ${MUDO}`}>Nomes e valores de exemplo.</p>
                            </div>
                        </div>
                    </div>
                )}
            </Janela>

            {/* ---------------- JANELA DO ENVIO ---------------- */}
            <Janela aberta={!!detalhe} fechar={() => setDetalhe(null)} largura="max-w-[560px]" titulo={detalhe?.titular || fone(detalhe?.telefone || null) || "Envio"}
                sub={detalhe ? `Contrato ${detalhe.contrato || "—"} · ${fone(detalhe.telefone)} · ${nomeModelo(detalhe.campanha)} · ${ORIGENS[detalhe.origem] || detalhe.origem}` : undefined}
                direita={detalhe ? <Etiqueta par={SITS[detalhe.situacao]} /> : undefined}>
                {detalhe && (() => {
                    const m = painel?.campanhas.find((c) => c.id === detalhe.campanha);
                    const saiu = ["enviada", "entregue", "lida", "respondeu", "abriu", "pago"].includes(detalhe.situacao);
                    const naFila = ["aprov", "aguard"].includes(detalhe.situacao);
                    const textoMsg = detalhe.texto || (m ? m.texto : "");
                    return (
                        <div>
                            {detalhe.motivo && <div className={`mb-3 rounded-xl px-3 py-2 text-[14px] font-bold ${detalhe.situacao === "falhou" ? VERMELHO : AMARELO}`}>{detalhe.motivo}</div>}
                            <Celular texto={textoMsg} botao={m?.botao || ""} horaTxt={hora(detalhe.enviado_em || detalhe.programado_em)}
                                titulo={saiu ? "Mensagem como o cliente recebeu" : naFila ? "Mensagem que vai sair (com as macros)" : "Mensagem que seria enviada (não saiu)"} />
                            <b className="mt-4 block">Caminho da mensagem</b>
                            <ul className="m-0 mt-2 list-none p-0">
                                {detalhe.linha.map(([t, d], i) => (
                                    <li key={i} className={`grid grid-cols-[64px_1fr] gap-2 border-l-2 py-1.5 pl-3 text-[14px] ${/Não|Cancelad|não entregou/.test(d) ? "border-[#B42318]" : /Pago|Abriu|Respondeu/.test(d) ? "border-[#5E8C1E]" : "border-[#E1E5EC] dark:border-white/15"}`}>
                                        <b className="tabular-nums">{t ? hora(t) : ""}</b><span>{d}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {detalhe.conversa_id ? <a className={BTN_SEC} href={`/messenger?conversa=${detalhe.conversa_id}`}>Abrir conversa no Messenger</a> : null}
                                {gestao && detalhe.situacao === "aprov" && <button type="button" className={BTN_PRI} onClick={() => emLote("aprovar", [detalhe.id])}>Aprovar envio</button>}
                                {gestao && naFila && <button type="button" className={BTN_SEC} onClick={() => emLote("cancelar", [detalhe.id])}>Cancelar envio</button>}
                                {gestao && ["falhou", "pulado"].includes(detalhe.situacao) && <button type="button" className={BTN_PRI} onClick={() => emLote("reenviar", [detalhe.id])}>Enviar novamente</button>}
                                {detalhe.telefone && detalhe.situacao !== "np" && (
                                    <button type="button" className={BTN_SEC} onClick={async () => { if (window.confirm("Incluir este telefone na lista Não perturbe? Ele deixa de receber campanhas e lembretes.")) { await incluirNp(detalhe.telefone!, detalhe.contrato || ""); } }}>Não perturbe</button>
                                )}
                            </div>
                            {aviso && <div className={`mt-3 rounded-xl px-3 py-2 text-[14px] font-bold ${OK}`}>{aviso}</div>}
                        </div>
                    );
                })()}
            </Janela>

            {/* ---------------- CONFIGURAÇÕES ---------------- */}
            <Janela aberta={config} fechar={() => setConfig(false)} largura="max-w-[720px]" titulo="Configurações">
                <div className="flex flex-col gap-5">
                    <div>
                        <span className={ROTULO}>Link do app do associado (botão "Acessar meu contrato")</span>
                        <div className="flex flex-wrap gap-2">
                            <input className={`${CAMPO} min-w-0 flex-1`} value={linkApp} onChange={(e) => setLinkApp(e.target.value)} placeholder="https://…" disabled={!gestao} />
                            {gestao && <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={async () => { const j = await executar("cfg", () => aPost("config_salvar", { link_app: linkApp.trim() })); if (j) await carregar(); }}>Salvar</button>}
                        </div>
                    </div>
                    <div>
                        <b className="text-[16px]">Não perturbe</b>
                        <p className={`m-0 ${MUDO}`}>Telefones que pediram para não receber. Ficam de fora de todos os automáticos e campanhas.</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                            <input className={CAMPO} inputMode="tel" placeholder="Telefone com DDD" value={npNovo.telefone} onChange={(e) => setNpNovo({ ...npNovo, telefone: e.target.value })} />
                            <input className={CAMPO} placeholder="Contrato (opcional)" value={npNovo.contrato} onChange={(e) => setNpNovo({ ...npNovo, contrato: e.target.value })} />
                            <input className={CAMPO} placeholder="Motivo" value={npNovo.motivo} onChange={(e) => setNpNovo({ ...npNovo, motivo: e.target.value })} />
                            <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={async () => { const j = await incluirNp(npNovo.telefone, npNovo.contrato, npNovo.motivo); if (j) { setNpNovo({ telefone: "", contrato: "", motivo: "" }); setNp(await aGet<NP[]>("nao_perturbe")); } }}>Incluir</button>
                        </div>
                        <div className="mt-2 max-h-[280px] overflow-auto">
                            {np === null ? <p className={MUDO}>{painel?.tabelas_ok ? "Carregando…" : "Faltam as tabelas no banco."}</p> : np.length === 0 ? <p className={MUDO}>Ninguém na lista.</p> : (
                                <table className="w-full text-left text-[14px]">
                                    <tbody>
                                        {np.map((x) => (
                                            <tr key={x.telefone} className="border-t border-[#EEF0F3] dark:border-white/10">
                                                <td className="py-1.5 pr-2 font-bold">{fone(x.telefone)}</td><td className="py-1.5 pr-2">{x.contrato || ""}</td>
                                                <td className={`py-1.5 pr-2 ${MUDO}`}>{x.motivo}</td><td className="py-1.5 pr-2">{dataBr(x.criado_em)}</td>
                                                <td className="py-1.5 text-right">{gestao && <button type="button" className="font-bold text-[#B42318] underline dark:text-[#FF9C92]" onClick={async () => { const j = await executar("np", () => aPost("np_remover", { telefone: x.telefone })); if (j) setNp(await aGet<NP[]>("nao_perturbe")); }}>Retirar</button>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    <div>
                        <b className="text-[16px]">Agendamento automático</b>
                        <p className={`m-0 ${MUDO}`}>O servidor monta a fila do dia e envia de 15 em 15 minutos, pelo cron da HostGator (use o PHP da versão do site):</p>
                        <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-xl bg-[#F4F6F9] p-3 text-[13px] dark:bg-[#1C2334]">{painel?.cron}</code>
                    </div>
                    {aviso && <div className={`rounded-xl px-3 py-2 text-[14px] font-bold ${OK}`}>{aviso}</div>}
                    {erro && <div className={`rounded-xl px-3 py-2 text-[14px] font-bold ${VERMELHO}`}>{erro}</div>}
                </div>
            </Janela>
        </div>
    );
}
