"use client";

import React, { useCallback, useEffect, useState } from "react";
import ItensOSAjuste from "../components/ItensOSAjuste";
import OSDoAtendimento, { AssinaturaModal } from "../components/OSDoAtendimento";
import {
    BarraFiltrosOS, CartoesOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, filtroInicial, itensExportar, paramsDoFiltro, situacaoDaOS, type FiltroOS, type TabelaExport,
} from "../components/ListaOS";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
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
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC]";

function Tag({ children, bg = "#EEF1F5" }: { children: React.ReactNode; bg?: string }) {
    return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]" style={{ background: bg }}>{children}</span>;
}
function situacao(l: any) {
    if (l.status === "CONVERTIDA") return <Tag>CONVERTIDA</Tag>;
    if (l.status === "FECHADA") return <Tag bg="#E6F0C9">ASSINADA</Tag>;
    if (l.status === "AGUARDANDO_ASSINATURA") return <Tag bg="#FBEFC4">AGUARDANDO ASSINATURA</Tag>;
    return <Tag bg="#FFF8E1">RASCUNHO</Tag>;
}

/* ====================================================================== */

export default function MinhasOSPage() {
    /* Padrão de 08/10/2026: filtros no botão Filtros (seleção múltipla), cartões numa linha e lista que cabe na tela. */
    const [filtro, setFiltro] = useState<FiltroOS>(() => filtroInicial());
    const [janelaFiltros, setJanelaFiltros] = useState(false);
    const [dados, setDados] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [loading, setLoading] = useState(true);
    const [aberta, setAberta] = useState<number | null>(null);
    const [resumo, setResumo] = useState<any>(null);
    /* Janela "Ver OS" do Editar registro: /os/minhas?atendimento=<id> mostra só as OS daquele atendimento. */
    const [atendimentoDaUrl, setAtendimentoDaUrl] = useState<string | null>(null);
    useEffect(() => {
        const a = new URLSearchParams(window.location.search).get("atendimento");
        if (a && /^\d+$/.test(a)) setAtendimentoDaUrl(a);
    }, []);

    const carregar = useCallback(async () => {
        if (new URLSearchParams(window.location.search).get("atendimento")) return;   // janela do atendimento não carrega a lista
        setLoading(true);
        setErro("");
        try {
            setDados((await osGet("minhas_os", paramsDoFiltro(filtro))).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar suas OS.");
        } finally {
            setLoading(false);
        }
    }, [filtro]);
    useEffect(() => { void carregar(); }, [carregar]);

    const lista: any[] = dados?.os || [];
    if (atendimentoDaUrl) {
        const avisarJanelaDeOrigem = () => {
            try { window.opener?.postMessage({ pai: "os-atualizada", atendimento_id: atendimentoDaUrl }, window.location.origin); } catch { /* janela fechada */ }
        };
        return <OSDoAtendimento atendimentoId={atendimentoDaUrl} onFechar={() => window.close()} onMudou={avisarJanelaDeOrigem} />;
    }
    const emAberto = lista.filter((l) => l.status === "ABERTA").length;
    const assinadas = lista.filter((l) => l.status === "FECHADA");
    const mostrar = { tipo: TIPOS_OS, situacao: SITUACOES_OS };
    const totalLista = lista.reduce((a, l) => a + (l.status === "CONVERTIDA" ? 0 : Number(l.valor_total) || 0), 0);
    const acompanhamento = (l: any) =>
        l.status === "ABERTA" ? "Confirmar valores e colher assinatura" : l.saldo ? `Saldo ${brl(l.saldo)} (financeiro)` : l.nota_promissoria ? `NP ${brl(l.nota_promissoria.valor)}` : "—";
    const tabela = (): TabelaExport => ({
        titulo: "Minhas OS",
        subtitulo: `${dataBROS(filtro.data_inicio)} a ${dataBROS(filtro.data_fim)} · ${lista.length} OS`,
        cabecalho: ["OS", "Situação", "Tipo", "Falecido", "Aberta em", "Total", "Acompanhamento"],
        linhas: lista.map((l) => [l.numero_os, situacaoDaOS(l).texto, l.tipo_rotulo, l.falecido || "—", dataBROS(l.criado_em), brl(l.valor_total), acompanhamento(l)]),
        rodape: `Total da lista: ${brl(totalLista)}`,
        arquivo: `minhas-os-${filtro.data_inicio}-a-${filtro.data_fim}`,
    });

    return (
        <main className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <BarraFiltrosOS filtro={filtro} mostrar={mostrar} onAbrirFiltros={() => setJanelaFiltros(true)} onMudar={setFiltro} exportar={itensExportar(tabela)} />

                <CartoesOS
                    itens={[
                        { rotulo: "Em aberto", valor: String(emAberto), sub: "a finalizar", cor: "#F2CB3F" },
                        { rotulo: "Assinadas", valor: String(assinadas.length), sub: brl(assinadas.reduce((a, l) => a + (Number(l.valor_total) || 0), 0)), cor: "#B3CE52" },
                        { rotulo: "Convertidas", valor: String(lista.filter((l) => l.status === "CONVERTIDA").length), sub: "Prt → Prf", cor: "#C9CFD9" },
                    ]}
                />

                {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {aviso && <div className="rounded-lg border border-[#E3E8F0] bg-white p-3 text-sm font-semibold dark:border-white/[0.12] dark:bg-[#232B3F]">{aviso}</div>}

                <ListaCompactaOS
                    titulo={`${lista.length} OS`}
                    total={lista.length ? brl(totalLista) : undefined}
                    carregando={loading}
                    vazio="Nenhuma OS no período."
                    linhas={lista.map((l) => ({
                        chave: l.os_id,
                        numero: l.numero_os,
                        situacao: situacaoDaOS(l),
                        valor: brl(l.valor_total),
                        nome: l.falecido || "—",
                        meta: [l.tipo_rotulo, dataBROS(l.criado_em)].filter(Boolean).join(" · "),
                        destaque: l.status === "ABERTA",
                    }))}
                    onAbrir={(id) => setAberta(Number(id))}
                    onMais={(id) => setResumo(lista.find((l) => l.os_id === id))}
                />
            </div>

            {janelaFiltros && (
                <JanelaFiltrosOS valor={filtro} mostrar={mostrar} onFechar={() => setJanelaFiltros(false)} onAplicar={(f) => (setFiltro(f), setJanelaFiltros(false))} />
            )}

            {resumo && (
                <ResumoOS
                    numero={resumo.numero_os}
                    situacao={situacaoDaOS(resumo)}
                    subtitulo={resumo.tipo_rotulo}
                    onFechar={() => setResumo(null)}
                    campos={[
                        ["Falecido", resumo.falecido || "—"],
                        ["Responsável", resumo.responsavel || "—"],
                        ["Aberta em", dataBROS(resumo.criado_em)],
                        ["Total", brl(resumo.valor_total), true],
                        ["Acompanhamento", acompanhamento(resumo)],
                    ]}
                    acoes={[
                        { rotulo: "PDF", icone: <Icone d={Ic.pdf} tam={18} />, onClick: () => void baixarPdfDaOS(resumo.os_id, resumo.numero_os).then((m) => m && setAviso(m)) },
                        { rotulo: "Imprimir", icone: <Icone d={Ic.imprimir} tam={18} />, onClick: () => window.open(`${OS_API}?documento_os=1&os_id=${resumo.os_id}&formato=impressao`, "_blank") },
                        { rotulo: resumo.status === "ABERTA" ? "Continuar" : "Abrir OS", icone: <Icone d={Ic.abrir} tam={18} />, primaria: true, onClick: () => (setAberta(Number(resumo.os_id)), setResumo(null)) },
                    ]}
                />
            )}

            {aberta && <OSAgente osId={aberta} onFechar={() => { setAberta(null); void carregar(); }} />}
        </main>
    );
}


/* ====================================================================== */
/* OS do agente: itens (valor e desconto), confirmação e assinatura com pagamento no ato */

function OSAgente({ osId, onFechar }: { osId: number; onFechar: () => void }) {
    const [d, setD] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [assinar, setAssinar] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setD((await osGet("listar", { os_id: osId })).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir a OS.");
        }
    }, [osId]);
    useEffect(() => { void carregar(); }, [carregar]);

    const run = async (fn: () => Promise<any>) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await fn();
            setMsg(r?.msg || "Salvo.");
            await carregar();
            return true;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
            return false;
        } finally {
            setSalvando(false);
        }
    };

    const os = d?.os;
    const aberta = os?.status === "ABERTA";
    const particular = os?.natureza === "PARTICULAR";
    const confirmada = !!os?.confirmada_em;


    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(49,60,85,0.45)]" onClick={onFechar}>
            <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#F4F6F9] dark:bg-[#161C2A] p-6" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Minhas OS</div>
                        <h2 className="text-2xl font-extrabold">OS {os?.numero_os || "…"}</h2>
                    </div>
                    <div className="flex gap-2">
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=visualizar`}>Ver folha</a>
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=impressao`}>Imprimir</a>
                        <button type="button" className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" onClick={onFechar}>Fechar</button>
                    </div>
                </div>

                {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

                <div className="mb-4 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                    {/* Qtd · Valor · Desconto · Final; ajuste pelo ícone (valor só aumenta, desconto em R$) e desconto geral (% ou R$). */}
                    <ItensOSAjuste osId={osId} editavel={aberta && particular} onMudou={() => void carregar()} />
                    {!particular && <div className="mt-3 flex justify-end text-xl font-extrabold">Total: {brl(os?.valor_total)}</div>}
                </div>

                {aberta && particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">{confirmada ? <><b>Valores confirmados.</b> Qualquer alteração desfaz a confirmação.</> : "Confira os itens com a família e confirme os valores antes de assinar."}</div>
                        <div className="flex gap-2">
                            {!confirmada && <button type="button" disabled={salvando} onClick={() => void run(() => osPost("confirmar_os", { os_id: osId }))} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55] disabled:opacity-50">Confirmar valores</button>}
                            {confirmada && <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>}
                        </div>
                    </div>
                )}
                {aberta && !particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">OS de convênio: o responsável assina como ciência{os?.convenio?.startsWith("ASSOCIADO") && !os?.contrato_numero ? " — informe o contrato do titular no atendimento antes." : "."}</div>
                        <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>
                    </div>
                )}

                {assinar && os && <AssinaturaModal os={os} particular={particular} onFechar={() => setAssinar(false)} onAssinado={() => { setAssinar(false); setMsg("OS assinada."); void carregar(); }} />}
            </div>
        </div>
    );
}
