"use client";

import React, { useCallback, useEffect, useState } from "react";
import ItensOSAjuste from "../components/ItensOSAjuste";
import OSDoAtendimento, { JanelaOSPorId } from "../components/OSDoAtendimento";
import {
    BarraFiltrosOS, CartoesOS, EstiloTemaOS, Ic, Icone, JanelaFiltrosOS, ListaCompactaOS, PAGAMENTOS_OS, ResumoOS, SITUACOES_OS, TIPOS_OS,
    baixarPdfDaOS, dataBROS, metaFinanceiraOS, prepararPdfDaOS, filtroInicial, itensExportar, paramsDoFiltro, situacaoDaOS, type FiltroOS, type TabelaExport,
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
const inputCls = "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#3D6A99] dark:focus:border-[#3D6A99]";

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
        // Aberta em outra janela (Editar registro): fecha a janela. Aberta na mesma aba (botão da OS no Quadro): volta.
        const fechar = () => {
            if (window.opener) window.close();
            else if (window.history.length > 1) window.history.back();
            else window.location.href = "/quadro-acompanhamento";
        };
        // Aberta pelo atalho (Quadro, Atendimentos): por cima da tela, para os botões de baixo não ficarem atrás da barra do celular.
        return <OSDoAtendimento sobreposto atendimentoId={atendimentoDaUrl} onFechar={fechar} onMudou={avisarJanelaDeOrigem} />;
    }
    const emAberto = lista.filter((l) => l.status === "ABERTA").length;
    const assinadas = lista.filter((l) => l.status === "FECHADA");
    const mostrar = { tipo: TIPOS_OS, situacao: SITUACOES_OS, pagamento: PAGAMENTOS_OS };
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
        <main data-os-tela className="min-h-screen bg-[#F4F6F9] px-4 py-3 text-[#313C55] dark:bg-[#161C2A] dark:text-white sm:p-6">
            <EstiloTemaOS />
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
                        meta: metaFinanceiraOS(l),
                        destaque: l.status === "ABERTA",
                    }))}
                    onAbrir={(id) => setAberta(Number(id))}
                    onMais={(id) => {
                        prepararPdfDaOS(id);
                        setResumo(lista.find((l) => l.os_id === id));
                    }}
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

            {/* A OS abre na mesma janela da OS do atendimento: Concluir venda → Colher assinatura (09/10/2026). */}
            {aberta && (
                <JanelaOSPorId
                    osId={aberta}
                    numero={lista.find((l) => l.os_id === aberta)?.numero_os || ""}
                    onFechar={() => { setAberta(null); void carregar(); }}
                    onMudou={() => void carregar()}
                />
            )}
        </main>
    );
}
