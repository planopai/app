"use client";

/**
 * Monitor de disparos (26/10/2026) — rota /messenger-disparos
 * Campanhas de mensagens pelo WhatsApp (modelos aprovados na Meta) e o histórico do que saiu, dia a dia.
 *  - Campanhas: ligada (todos), teste (só os contratos da lista), desligada ou arquivada. Cada campanha usa um "tipo"
 *    (motor) do servidor; hoje existe o "mensalidade" (lembrete amigável antes/depois do vencimento, botão "Pagar com Pix").
 *    Tipos novos entram no aurora_03.php (a03Tipos) e aparecem aqui sozinhos.
 *  - Histórico: por dia, quantos foram, abriram o botão, pagaram e falharam; o log de cada execução com erros e pulados.
 *  - O disparo automático roda pelo cron da HostGator (php aurora_03.php disparos) uma vez por dia.
 * Servidor: aurora_03.php (arquivo novo). Acesso: página "messenger"; criar, mudar e disparar é só da Gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

const API = `${API_BASE}/aurora_03.php`;

type Modo = "desligada" | "teste" | "ligada" | "arquivada";
type Numeros = { enviados: number; falhas: number; pagos: number; abriram: number; ultimo: string | null } | null;
type Campanha = {
    id: string; nome: string; tipo: string; dias: number; modelo: string; idioma: string; modo: Modo;
    teste_contratos: string; texto: string; quando: string; numeros: Numeros; atualizado_em?: string; atualizado_por?: string;
};
type Tipo = { nome: string; descricao: string; variaveis: string[]; botao: string };
type Painel = { campanhas: Campanha[]; tipos: Record<string, Tipo>; gestao: boolean; meta_ok: boolean; cron: string };
type Detalhe = { contrato: string; titular: string; valor: number; vencimento: string; situacao: string; msg: string; telefone: string };
type Resultado = {
    id: string; nome: string; modo: string; quando: string; msg?: string; erro?: string; vencimento?: string;
    encontradas?: number; contratos?: number; enviados?: number; falhas?: number; pulados?: number; repetidos?: number; previa?: number;
    detalhes?: Detalhe[];
};
type Execucao = { inicio: string; fim?: string; origem: string; campanhas: Resultado[] };
type ResumoCamp = { enviados?: number; falhas?: number; pagos?: number; abriram?: number; testes?: number };
type Dia = { data: string; execucoes: number; erros: number; campanhas: Record<string, ResumoCamp> };
type Envio = {
    id: number; campanha: string; teste: boolean; contrato: string; valor: number; situacao: "E" | "X" | "PG"; enviado_em: string | null;
    abriu_em: string | null; pago_em: string | null; conversa_id: number; nome: string | null; telefone: string | null; erro: string | null;
};
type DiaDetalhe = { data: string; execucoes: Execucao[]; envios: Envio[] };
type Form = { id: string; nome: string; tipo: string; dias: number; modelo: string; idioma: string; modo: Modo; teste_contratos: string; texto: string };

const MODOS: Record<Modo, [string, string]> = {
    ligada: ["Ligada", "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]"],
    teste: ["Em teste", "bg-[#FBF0C9] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]"],
    desligada: ["Desligada", "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"],
    arquivada: ["Arquivada", "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"],
};
const SIT_ENVIO: Record<string, [string, string]> = {
    E: ["Enviado", "bg-[#E9EFF6] text-[#1E3A5C] dark:bg-[#3D6A99]/25 dark:text-white"],
    PG: ["Pago", "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#D5E79A]"],
    X: ["Falhou", "bg-[#FDECEA] text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]"],
};
const SIT_DET: Record<string, string> = { E: "Enviado", X: "Falhou", pulado: "Pulado", repetido: "Já enviado", previa: "Vai receber" };
const FILTROS_ENVIO: [string, string][] = [["todos", "Todos"], ["X", "Falhas"], ["abriu", "Abriram o botão"], ["PG", "Pagos"], ["teste", "Testes"]];

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const hora = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
const dataBr = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const diaSemana = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
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
    return apiJson(`${API}?action=${encodeURIComponent(acao)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
}

const BTN = "inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-extrabold leading-none disabled:opacity-50";
const BTN_SEC = `${BTN} border border-[#C9D1DE] bg-white dark:border-white/15 dark:bg-transparent`;
const BTN_PRI = `${BTN} bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]`;
const CAMPO = "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const CARTAO = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const ROTULO = "mb-1 block text-[13.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF]";

function Numero({ n, rotulo, cor = "" }: { n: number | undefined; rotulo: string; cor?: string }) {
    return (
        <div className="min-w-[72px] flex-1 rounded-xl bg-[#F4F6F9] px-3 py-2 dark:bg-[#1C2334]">
            <b className={`block text-[20px] leading-tight ${cor}`}>{n ?? 0}</b>
            <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</span>
        </div>
    );
}

function TabelaDetalhes({ linhas }: { linhas: Detalhe[] }) {
    if (!linhas.length) return null;
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead className="text-[#5B6478] dark:text-[#AEB9CF]">
                    <tr><th className="py-1 pr-2">Contrato</th><th className="py-1 pr-2">Titular</th><th className="py-1 pr-2">Valor</th><th className="py-1 pr-2">Vence</th><th className="py-1 pr-2">Situação</th><th className="py-1">Motivo</th></tr>
                </thead>
                <tbody>
                    {linhas.map((d, i) => (
                        <tr key={i} className="border-t border-[#EEF0F3] dark:border-white/10">
                            <td className="py-1.5 pr-2 font-bold">{d.contrato}</td>
                            <td className="py-1.5 pr-2">{d.titular || "—"}</td>
                            <td className="py-1.5 pr-2">{brl(d.valor)}</td>
                            <td className="py-1.5 pr-2">{dataBr(d.vencimento)}</td>
                            <td className="py-1.5 pr-2 font-bold">{SIT_DET[d.situacao] || d.situacao}</td>
                            <td className="py-1.5">{d.msg}{d.telefone ? ` · ${fone(d.telefone)}` : ""}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ResumoResultado({ r }: { r: Resultado }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
                <b>{r.nome}</b>
                <span className="text-[#5B6478] dark:text-[#AEB9CF]">{r.quando}{r.vencimento ? ` · vencimento ${dataBr(r.vencimento)}` : ""}</span>
            </div>
            {r.erro && <div className="rounded-xl bg-[#FDECEA] px-3 py-2 text-[13.5px] font-bold text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]">Erro: {r.erro}</div>}
            {r.msg && <div className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{r.msg}</div>}
            {r.contratos !== undefined && (
                <div className="flex flex-wrap gap-2">
                    <Numero n={r.encontradas} rotulo="mensalidades" />
                    <Numero n={r.contratos} rotulo="contratos" />
                    {r.previa ? <Numero n={r.previa} rotulo="vão receber" /> : null}
                    {r.enviados ? <Numero n={r.enviados} rotulo="enviados" cor="text-[#2F6B12] dark:text-[#D5E79A]" /> : null}
                    {r.falhas ? <Numero n={r.falhas} rotulo="falhas" cor="text-[#B42318] dark:text-[#FF9C92]" /> : null}
                    <Numero n={r.pulados} rotulo="pulados" />
                    <Numero n={r.repetidos} rotulo="já enviados" />
                </div>
            )}
            {r.detalhes && r.detalhes.length > 0 && <TabelaDetalhes linhas={r.detalhes} />}
        </div>
    );
}

export default function DisparosPage() {
    const [painel, setPainel] = useState<Painel | null>(null);
    const [dias, setDias] = useState<Dia[] | null>(null);
    const [diaSel, setDiaSel] = useState("");
    const [diaDet, setDiaDet] = useState<DiaDetalhe | null>(null);
    const [filtroEnvio, setFiltroEnvio] = useState("todos");
    const [verArquivadas, setVerArquivadas] = useState(false);
    const [form, setForm] = useState<Form | null>(null);
    const [previa, setPrevia] = useState<Resultado | null>(null);
    const [teste, setTeste] = useState<{ id: string; nome: string; contrato: string; telefone: string } | null>(null);
    const [ocupado, setOcupado] = useState("");
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");

    const carregar = useCallback(async () => {
        try {
            const [p, d] = await Promise.all([aGet<Painel>("painel"), aGet<Dia[]>("dias")]);
            setPainel(p);
            setDias(d);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar o monitor.");
        }
    }, []);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const abrirDia = useCallback(async (data: string) => {
        setDiaSel(data);
        setDiaDet(null);
        setFiltroEnvio("todos");
        try {
            setDiaDet(await aGet<DiaDetalhe>("dia", { data }));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir o dia.");
        }
    }, []);

    const nomeCampanha = (id: string) => painel?.campanhas.find((c) => c.id === id)?.nome || id;

    async function executar(rotulo: string, fn: () => Promise<any>) {
        setOcupado(rotulo);
        setErro("");
        setAviso("");
        try {
            const j = await fn();
            if (j?.msg) setAviso(j.msg);
            return j;
        } catch (e: any) {
            setErro(e?.message || "Falha na operação.");
            return null;
        } finally {
            setOcupado("");
        }
    }

    async function verPrevia(c: Campanha) {
        setPrevia(null);
        setForm(null);
        setTeste(null);
        await executar(`previa-${c.id}`, async () => {
            setPrevia(await aGet<Resultado>("previa", { id: c.id }));
            return null;
        });
    }

    async function rodar(c: Campanha) {
        const quem = c.modo === "teste" ? "só os contratos da lista de teste" : "todos os contratos que se encaixam hoje";
        if (!window.confirm(`Rodar agora "${c.nome}"? Vai enviar para ${quem}. Quem já recebeu não recebe de novo.`)) return;
        const j = await executar(`rodar-${c.id}`, () => aPost("rodar", { id: c.id }));
        if (j) {
            await carregar();
            await abrirDia(new Date().toLocaleDateString("sv-SE"));
        }
    }

    async function arquivar(c: Campanha, desarquivar = false) {
        if (!desarquivar && !window.confirm(`Arquivar "${c.nome}"? Ela para de disparar; o histórico continua aqui.`)) return;
        const j = await executar(`arq-${c.id}`, () => aPost("campanha_arquivar", { id: c.id, desarquivar }));
        if (j) await carregar();
    }

    async function salvar() {
        if (!form) return;
        const j = await executar("salvar", () => aPost("campanha_salvar", form));
        if (j) {
            setForm(null);
            await carregar();
        }
    }

    async function enviarTeste() {
        if (!teste) return;
        const j = await executar("teste", () => aPost("teste_envio", { id: teste.id, contrato: teste.contrato, telefone: teste.telefone }));
        if (j) {
            setTeste(null);
            await carregar();
            await abrirDia(new Date().toLocaleDateString("sv-SE"));
        }
    }

    function novaCampanha() {
        const tipo = Object.keys(painel?.tipos || {})[0] || "mensalidade";
        setPrevia(null);
        setTeste(null);
        setForm({ id: "", nome: "", tipo, dias: -1, modelo: "", idioma: "pt_BR", modo: "desligada", teste_contratos: "", texto: "" });
    }

    function editar(c: Campanha) {
        setPrevia(null);
        setTeste(null);
        setForm({ id: c.id, nome: c.nome, tipo: c.tipo, dias: c.dias, modelo: c.modelo, idioma: c.idioma || "pt_BR", modo: c.modo === "arquivada" ? "desligada" : c.modo, teste_contratos: c.teste_contratos || "", texto: c.texto || "" });
    }

    const gestao = !!painel?.gestao;
    const campanhas = (painel?.campanhas || []).filter((c) => verArquivadas || c.modo !== "arquivada");
    const arquivadas = (painel?.campanhas || []).filter((c) => c.modo === "arquivada").length;
    const tipoForm = form ? painel?.tipos[form.tipo] : undefined;
    const envios = (diaDet?.envios || []).filter((e) =>
        filtroEnvio === "todos" ? true : filtroEnvio === "abriu" ? !!e.abriu_em : filtroEnvio === "teste" ? e.teste : e.situacao === filtroEnvio,
    );

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] [contain:inline-size] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div>
                    <h1 className="m-0 text-2xl font-extrabold md:text-[28px]">Monitor de disparos</h1>
                    <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Campanhas de mensagens pelo WhatsApp e o histórico do que saiu, dia a dia: quem recebeu, quem abriu o botão, quem pagou e o que deu erro.</p>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207]">{aviso}</div>}
                {painel && !painel.meta_ok && <div className="rounded-xl border border-[#F2CB3F] bg-[#FBF0C9] px-4 py-2 text-sm font-bold text-[#5C4600]">O WhatsApp (Meta) não está configurado no servidor: nenhuma campanha consegue enviar.</div>}

                {/* Campanhas */}
                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="m-0 mr-auto text-[19px] font-extrabold">Campanhas</h2>
                        {arquivadas > 0 && (
                            <button type="button" className={BTN_SEC} onClick={() => setVerArquivadas(!verArquivadas)} aria-pressed={verArquivadas}>
                                {verArquivadas ? "Esconder arquivadas" : `Ver arquivadas · ${arquivadas}`}
                            </button>
                        )}
                        {gestao && <button type="button" className={BTN_PRI} onClick={novaCampanha}>Nova campanha</button>}
                    </div>
                    {!painel && !erro && <p className={CARTAO}>Carregando…</p>}
                    {painel && !campanhas.length && <p className={CARTAO}>Nenhuma campanha.</p>}
                    <div className="grid gap-3 md:grid-cols-2">
                        {campanhas.map((c) => {
                            const n = c.numeros;
                            return (
                                <article key={c.id} className={`${CARTAO} flex flex-col gap-3 ${c.modo === "arquivada" ? "opacity-70" : ""}`}>
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="m-0 text-[17px] font-extrabold">{c.nome}</h3>
                                            <p className="m-0 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                {painel?.tipos[c.tipo]?.nome || c.tipo} · {c.quando} · modelo <code className="font-bold">{c.modelo}</code>
                                            </p>
                                        </div>
                                        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[13px] font-extrabold ${MODOS[c.modo]?.[1] || ""}`}>{MODOS[c.modo]?.[0] || c.modo}</span>
                                    </div>
                                    {c.modo === "teste" && <p className="m-0 text-[13.5px]">Só recebem os contratos: <b>{c.teste_contratos || "nenhum na lista"}</b></p>}
                                    <div>
                                        <span className={ROTULO}>Últimos 30 dias{n?.ultimo ? ` · último envio ${dt(n.ultimo)}` : ""}</span>
                                        <div className="flex flex-wrap gap-2">
                                            <Numero n={n?.enviados} rotulo="enviados" />
                                            <Numero n={n?.abriram} rotulo="abriram o botão" />
                                            <Numero n={n?.pagos} rotulo="pagos" cor="text-[#2F6B12] dark:text-[#D5E79A]" />
                                            <Numero n={n?.falhas} rotulo="falhas" cor={n?.falhas ? "text-[#B42318] dark:text-[#FF9C92]" : ""} />
                                        </div>
                                    </div>
                                    <details className="text-[13.5px]">
                                        <summary className="cursor-pointer font-bold">Texto do modelo</summary>
                                        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#F4F6F9] p-3 dark:bg-[#1C2334]">{c.texto}</p>
                                    </details>
                                    <div className="flex flex-wrap gap-2">
                                        {c.modo !== "arquivada" && (
                                            <button type="button" className={BTN_SEC} disabled={!!ocupado} onClick={() => verPrevia(c)}>
                                                {ocupado === `previa-${c.id}` ? "Consultando…" : "Prévia de hoje"}
                                            </button>
                                        )}
                                        {gestao && c.modo !== "arquivada" && <button type="button" className={BTN_SEC} onClick={() => editar(c)}>Editar</button>}
                                        {gestao && c.modo !== "arquivada" && (
                                            <button type="button" className={BTN_SEC} onClick={() => { setForm(null); setPrevia(null); setTeste({ id: c.id, nome: c.nome, contrato: "", telefone: "" }); }}>Envio de teste</button>
                                        )}
                                        {gestao && (c.modo === "ligada" || c.modo === "teste") && (
                                            <button type="button" className={BTN_PRI} disabled={!!ocupado} onClick={() => rodar(c)}>
                                                {ocupado === `rodar-${c.id}` ? "Enviando…" : "Rodar agora"}
                                            </button>
                                        )}
                                        {gestao && (
                                            <button type="button" className={`${BTN} text-[#5B6478] dark:text-[#AEB9CF]`} disabled={!!ocupado} onClick={() => arquivar(c, c.modo === "arquivada")}>
                                                {c.modo === "arquivada" ? "Desarquivar" : "Arquivar"}
                                            </button>
                                        )}
                                    </div>
                                    {c.atualizado_por && <p className="m-0 text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">Alterada por {c.atualizado_por} em {dt(c.atualizado_em)}</p>}
                                </article>
                            );
                        })}
                    </div>
                </section>

                {/* Editor de campanha */}
                {form && (
                    <section className={`${CARTAO} flex flex-col gap-3`}>
                        <h2 className="m-0 text-[19px] font-extrabold">{form.id ? "Editar campanha" : "Nova campanha"}</h2>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label><span className={ROTULO}>Nome</span>
                                <input className={CAMPO} value={form.nome} maxLength={80} onChange={(ev) => setForm({ ...form, nome: ev.target.value })} placeholder="Ex.: Mensalidade vence em 3 dias" />
                            </label>
                            <label><span className={ROTULO}>Tipo</span>
                                <select className={CAMPO} value={form.tipo} disabled={!!form.id} onChange={(ev) => setForm({ ...form, tipo: ev.target.value })}>
                                    {Object.entries(painel?.tipos || {}).map(([k, t]) => <option key={k} value={k}>{t.nome}</option>)}
                                </select>
                            </label>
                            <div>
                                <span className={ROTULO}>Quando dispara</span>
                                <div className="flex gap-2">
                                    <input className={`${CAMPO} w-24`} type="number" min={0} max={60} value={Math.abs(form.dias)}
                                        onChange={(ev) => { const v = Math.max(0, Math.min(60, parseInt(ev.target.value || "0", 10))); setForm({ ...form, dias: form.dias < 0 ? -v : v }); }} />
                                    <select className={CAMPO} value={form.dias < 0 ? "antes" : "depois"}
                                        onChange={(ev) => setForm({ ...form, dias: ev.target.value === "antes" ? -Math.abs(form.dias) : Math.abs(form.dias) })}>
                                        <option value="antes">dia(s) antes do vencimento</option>
                                        <option value="depois">dia(s) depois do vencimento</option>
                                    </select>
                                </div>
                                <span className="text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">0 = no dia do vencimento. Só vai para quem ainda está com a mensalidade em aberto.</span>
                            </div>
                            <label><span className={ROTULO}>Nome do modelo aprovado na Meta</span>
                                <input className={CAMPO} value={form.modelo} onChange={(ev) => setForm({ ...form, modelo: ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="lembrete_vence_amanha" />
                            </label>
                        </div>
                        <label><span className={ROTULO}>Texto do modelo (igual ao aprovado na Meta)</span>
                            <textarea className={`${CAMPO} h-36 py-2`} value={form.texto} maxLength={1024} onChange={(ev) => setForm({ ...form, texto: ev.target.value })} />
                        </label>
                        {tipoForm && (
                            <div className="rounded-xl bg-[#F4F6F9] p-3 text-[13.5px] dark:bg-[#1C2334]">
                                <p className="m-0">{tipoForm.descricao}</p>
                                <p className="m-0 mt-1"><b>Variáveis:</b> {tipoForm.variaveis.join(" · ")}</p>
                                <p className="m-0 mt-1 break-all"><b>Botão:</b> {tipoForm.botao}</p>
                            </div>
                        )}
                        <div>
                            <span className={ROTULO}>Situação</span>
                            <div className="flex flex-wrap gap-2">
                                {(["desligada", "teste", "ligada"] as Modo[]).map((m) => (
                                    <button key={m} type="button" aria-pressed={form.modo === m} onClick={() => setForm({ ...form, modo: m })}
                                        className={`h-11 rounded-full px-4 text-[14.5px] ${form.modo === m ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]" : "bg-[#F1F4F8] font-bold dark:bg-[#1C2334]"}`}>
                                        {m === "desligada" ? "Desligada" : m === "teste" ? "Teste (só a lista)" : "Ligada (todos)"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {form.modo === "teste" && (
                            <label><span className={ROTULO}>Contratos que recebem no teste (separe por vírgula)</span>
                                <input className={CAMPO} value={form.teste_contratos} onChange={(ev) => setForm({ ...form, teste_contratos: ev.target.value })} placeholder="12345, 67890" />
                            </label>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={BTN_PRI} disabled={ocupado === "salvar"} onClick={salvar}>{ocupado === "salvar" ? "Salvando…" : "Salvar"}</button>
                            <button type="button" className={BTN_SEC} onClick={() => setForm(null)}>Cancelar</button>
                        </div>
                    </section>
                )}

                {/* Envio de teste */}
                {teste && (
                    <section className={`${CARTAO} flex flex-col gap-3`}>
                        <h2 className="m-0 text-[19px] font-extrabold">Envio de teste · {teste.nome}</h2>
                        <p className="m-0 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Usa os dados de um contrato (a mensalidade em aberto mais antiga) e manda para o celular informado, mesmo fora da data. Não conta nos números da campanha.</p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label><span className={ROTULO}>Contrato</span>
                                <input className={CAMPO} inputMode="numeric" value={teste.contrato} onChange={(ev) => setTeste({ ...teste, contrato: ev.target.value })} />
                            </label>
                            <label><span className={ROTULO}>Celular que recebe (com DDD)</span>
                                <input className={CAMPO} inputMode="tel" value={teste.telefone} onChange={(ev) => setTeste({ ...teste, telefone: ev.target.value })} placeholder="(77) 99999-9999" />
                            </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={BTN_PRI} disabled={ocupado === "teste"} onClick={enviarTeste}>{ocupado === "teste" ? "Enviando…" : "Enviar teste"}</button>
                            <button type="button" className={BTN_SEC} onClick={() => setTeste(null)}>Cancelar</button>
                        </div>
                    </section>
                )}

                {/* Prévia */}
                {previa && (
                    <section className={`${CARTAO} flex flex-col gap-3`}>
                        <div className="flex items-center gap-2">
                            <h2 className="m-0 mr-auto text-[19px] font-extrabold">Prévia de hoje</h2>
                            <button type="button" className={BTN_SEC} onClick={() => setPrevia(null)}>Fechar</button>
                        </div>
                        <p className="m-0 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nada foi enviado. Mostra quem receberia se a campanha rodasse agora{previa.modo === "teste" ? " (no modo de teste, só os contratos da lista)" : ""}.</p>
                        <ResumoResultado r={previa} />
                    </section>
                )}

                {/* Histórico */}
                <section className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                    <div className={`${CARTAO} flex flex-col gap-1 p-2 ${diaSel ? "hidden lg:flex" : ""}`}>
                        <h2 className="m-0 px-2 pt-2 text-[19px] font-extrabold">Histórico por dia</h2>
                        <p className="m-0 px-2 pb-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Últimos 30 dias.</p>
                        {!dias && !erro && <p className="p-2">Carregando…</p>}
                        {dias && !dias.length && <p className="p-2 text-[#6B7488]">Nenhum disparo ainda.</p>}
                        {(dias || []).map((d) => {
                            const t = Object.values(d.campanhas).reduce<{ enviados: number; falhas: number; pagos: number; abriram: number }>((a, c) => ({
                                enviados: a.enviados + (c.enviados || 0), falhas: a.falhas + (c.falhas || 0), pagos: a.pagos + (c.pagos || 0), abriram: a.abriram + (c.abriram || 0),
                            }), { enviados: 0, falhas: 0, pagos: 0, abriram: 0 });
                            return (
                                <button key={d.data} type="button" onClick={() => abrirDia(d.data)}
                                    className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/5 ${diaSel === d.data ? "bg-[#F0F2F5] dark:bg-white/10" : ""}`}>
                                    <span className="flex items-center gap-2">
                                        <b className="flex-1 text-[15.5px]">{dataBr(d.data)} <span className="font-normal capitalize text-[#6B7488] dark:text-[#AEB9CF]">{diaSemana(d.data)}</span></b>
                                        {(d.erros > 0 || t.falhas > 0) && <span className="rounded-lg bg-[#FDECEA] px-2 py-0.5 text-[12.5px] font-extrabold text-[#B42318] dark:bg-[#B42318]/25 dark:text-[#FF9C92]">{d.erros + t.falhas} erro{d.erros + t.falhas > 1 ? "s" : ""}</span>}
                                    </span>
                                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                        {t.enviados} enviados · {t.abriram} abriram · {t.pagos} pagos{d.execucoes ? ` · ${d.execucoes} execuç${d.execucoes > 1 ? "ões" : "ão"}` : ""}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className={`${CARTAO} flex flex-col gap-4 ${diaSel ? "" : "hidden lg:flex"}`}>
                        {!diaSel && <p className="m-0 text-[#6B7488]">Escolha um dia para ver as execuções, os envios e os erros.</p>}
                        {diaSel && (
                            <div className="flex items-center gap-2">
                                <button type="button" className={`${BTN_SEC} lg:hidden`} onClick={() => setDiaSel("")} aria-label="Voltar">←</button>
                                <h2 className="m-0 mr-auto text-[19px] font-extrabold">{dataBr(diaSel)}</h2>
                                <button type="button" className={BTN_SEC} onClick={() => abrirDia(diaSel)}>Atualizar</button>
                            </div>
                        )}
                        {diaSel && !diaDet && <p className="m-0">Carregando…</p>}
                        {diaDet && (
                            <>
                                <div className="flex flex-col gap-2">
                                    <h3 className="m-0 text-[16px] font-extrabold">Execuções</h3>
                                    {!diaDet.execucoes.length && <p className="m-0 text-[14px] text-[#6B7488]">Nenhuma execução registrada neste dia.</p>}
                                    {diaDet.execucoes.slice().reverse().map((ex, i) => (
                                        <details key={i} className="rounded-xl border border-[#EEF0F3] p-3 dark:border-white/10" open={i === 0}>
                                            <summary className="cursor-pointer text-[14px] font-bold">
                                                {hora(ex.inicio)} · {ex.origem === "cron" ? "automática (cron)" : ex.origem}
                                                {ex.campanhas.some((c) => c.erro || c.falhas) ? <span className="ml-2 text-[#B42318] dark:text-[#FF9C92]">com erros</span> : null}
                                            </summary>
                                            <div className="mt-3 flex flex-col gap-4">
                                                {!ex.campanhas.length && <p className="m-0 text-[14px]">Nenhuma campanha ativa.</p>}
                                                {ex.campanhas.map((c, k) => <ResumoResultado key={k} r={c} />)}
                                            </div>
                                        </details>
                                    ))}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <h3 className="m-0 text-[16px] font-extrabold">Envios · {diaDet.envios.length}</h3>
                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                        {FILTROS_ENVIO.map(([k, nome]) => (
                                            <button key={k} type="button" aria-pressed={filtroEnvio === k} onClick={() => setFiltroEnvio(k)}
                                                className={`h-10 shrink-0 rounded-full px-4 text-[14px] ${filtroEnvio === k ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]" : "bg-[#F1F4F8] font-bold dark:bg-[#1C2334]"}`}>
                                                {nome}
                                            </button>
                                        ))}
                                    </div>
                                    {!envios.length && <p className="m-0 text-[14px] text-[#6B7488]">Nada aqui.</p>}
                                    {envios.map((e) => (
                                        <div key={e.id} className="flex flex-col gap-1 rounded-xl border border-[#EEF0F3] px-3 py-2.5 dark:border-white/10">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <b className="min-w-0 flex-1 truncate text-[15px]">{e.nome || fone(e.telefone) || "Sem nome"}</b>
                                                <b className="text-[14.5px]">{brl(e.valor)}</b>
                                            </span>
                                            <span className="flex flex-wrap items-center gap-2 text-[13px]">
                                                <span className={`rounded-lg px-2 py-0.5 font-extrabold ${SIT_ENVIO[e.situacao]?.[1] || ""}`}>{SIT_ENVIO[e.situacao]?.[0] || e.situacao}</span>
                                                {e.teste && <span className="rounded-lg border border-[#C9D1DE] px-2 py-0.5 font-bold">Teste</span>}
                                                <span className="rounded-lg bg-[#313C55] px-2 py-0.5 font-extrabold text-white">Contrato {e.contrato}</span>
                                                <span className="text-[#5B6478] dark:text-[#AEB9CF]">{nomeCampanha(e.campanha)} · {hora(e.enviado_em)} · {fone(e.telefone)}</span>
                                            </span>
                                            <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                {e.abriu_em ? `Abriu o botão ${dt(e.abriu_em)}` : "Não abriu o botão"}{e.pago_em ? ` · pago ${dt(e.pago_em)}` : ""}
                                            </span>
                                            {e.erro && <span className="text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">Erro da Meta: {e.erro}</span>}
                                            {e.conversa_id > 0 && <a className="text-[13.5px] font-bold text-[#3D6A99] underline dark:text-[#9CC0E6]" href={`/messenger?conversa=${e.conversa_id}`}>Abrir conversa</a>}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {/* Agendamento */}
                {painel && gestao && (
                    <details className={`${CARTAO} text-[14px]`}>
                        <summary className="cursor-pointer font-extrabold">Agendamento automático</summary>
                        <p className="mt-2">O servidor roda as campanhas ligadas e em teste uma vez por dia, pelo cron da HostGator:</p>
                        <code className="block break-all rounded-xl bg-[#F4F6F9] p-3 dark:bg-[#1C2334]">{painel.cron}</code>
                        <p className="mt-2 text-[#5B6478] dark:text-[#AEB9CF]">Quem já recebeu a mensagem de uma campanha não recebe de novo pela mesma mensalidade. Contratos cancelados, suspensos ou sem celular ficam como pulados no log.</p>
                    </details>
                )}
            </div>
        </div>
    );
}
