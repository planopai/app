"use client";

/**
 * Messenger · Monitoramento (15/10/2026) — rota /messenger-monitor
 * Painel da Gestão (mesma permissão do Histórico de clientes: "messenger-historico"), no estilo do monitoramento do Mango:
 * fila e atendimentos agora, setores, atendentes e números do período. Atualiza sozinho a cada 30 s.
 * Servidor: messenger.php?action=painel
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import { Icone, SeloCor } from "../messenger/components/Lista";

type Painel = {
    agora: string;
    periodo: { de: string; ate: string };
    indicadores: {
        fila: number; no_menu: number; maior_espera_s: number; em_atendimento: number; atendentes_online: number; atendentes_total: number;
        abertos_periodo: number; encerrados_periodo: number; espera_media_s: number | null; duracao_media_s: number | null; nota_media: number | null; avaliacoes: number;
    };
    setores: { id: number; nome: string; cor: string; aberto: boolean; situacao: string; fila: number; em_atendimento: number; periodo: number }[];
    sem_setor: { fila: number; em_atendimento: number; periodo: number };
    fila: { conversa_id: number; nome: string; telefone: string; setor: { nome: string; cor: string } | null; no_menu: boolean; espera_s: number }[];
    atendentes: { id: number; nome: string; online: boolean; em_andamento: number; encerrados: number; primeira_resposta_media_s: number | null; nota_media: number | null; avaliacoes: number }[];
    por_dia: { dia: string; total: number }[];
    por_etiqueta: { id: number; nome: string; cor: string; total: number }[];
    notas: { nota: number; total: number }[];
    mensagens?: { recebidas: number; enviadas: number; equipe: number; automaticas: number; modelos: number; falhas: number };
    custos?: { categorias: { categoria: string; entregues: number; cobradas: number; preco: number; total: number }[]; total: number; sem_informacao: number; projecao_mes: number | null };
    por_usuario?: { id: number; nome: string; enviadas: number; recebidas: number; modelos: number; custo: number }[];
};
const NOME_CATEGORIA: Record<string, [string, string]> = {
    service: ["Serviço", "respostas dentro da janela de 24 h"],
    utility: ["Utilidade", "modelos: lembretes, boletos, avisos"],
    marketing: ["Marketing", "modelos: campanhas e ofertas"],
    authentication: ["Autenticação", "códigos de verificação"],
};
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 1 ? 4 : 2 });
const numero = (v: number) => v.toLocaleString("pt-BR");

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]";
const titulo = "m-0 text-[17px] font-extrabold";
const rotuloTabela = "px-3 py-2 text-left text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";

function duracao(s: number | null | undefined): string {
    if (s === null || s === undefined) return "—";
    if (s < 60) return "menos de 1 min";
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
}
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function Indicador({ rotulo, valor, detalhe, alerta, cor }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean; cor: string }) {
    return (
        <div className={`${cartao} relative overflow-hidden`}>
            <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-15" style={{ background: cor }} aria-hidden="true" />
            <div className="text-[13.5px] font-extrabold text-[#4A5468] dark:text-[#C9D1DE]">{rotulo}</div>
            <div className={`mt-1 text-[30px] font-extrabold leading-tight ${alerta ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`} style={alerta ? undefined : { color: cor }}>{valor}</div>
            {detalhe && <div className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{detalhe}</div>}
        </div>
    );
}

function Barras({ itens, cor }: { itens: { rotulo: string; valor: number; cor?: string }[]; cor: string }) {
    const max = Math.max(1, ...itens.map((i) => i.valor));
    return (
        <div className="flex flex-col gap-2">
            {itens.map((i) => (
                <div key={i.rotulo} className="flex items-center gap-2 text-[14px]">
                    <span className="w-36 flex-none truncate font-bold" title={i.rotulo}>{i.rotulo}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded-md bg-[#F0F2F5] dark:bg-[#1C2334]">
                        <span className="block h-full rounded-md" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor || cor, minWidth: i.valor ? 6 : 0 }} />
                    </span>
                    <span className="w-8 flex-none text-right font-extrabold">{i.valor}</span>
                </div>
            ))}
            {!itens.length && <p className="text-[14px] text-[#6B7488] dark:text-[#AEB9CF]">Sem dados no período.</p>}
        </div>
    );
}

export default function MonitoramentoPage() {
    const [dados, setDados] = useState<Painel | null>(null);
    const [erro, setErro] = useState("");
    const [periodo, setPeriodo] = useState<"hoje" | "7" | "30" | "mes">("hoje");
    const [atualizando, setAtualizando] = useState(false);

    const carregar = useCallback(async () => {
        setAtualizando(true);
        try {
            const de = periodo === "hoje" ? hojeISO() : periodo === "mes" ? `${hojeISO().slice(0, 8)}01` : diasAtras(Number(periodo) - 1);
            setDados(await msgGet<Painel>("painel", { de, ate: hojeISO() }));
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setAtualizando(false);
        }
    }, [periodo]);
    useEffect(() => {
        carregar();
        const t = setInterval(() => document.visibilityState === "visible" && carregar(), 30000);
        return () => clearInterval(t);
    }, [carregar]);

    const i = dados?.indicadores;
    const nomePeriodo = periodo === "hoje" ? "hoje" : periodo === "mes" ? "neste mês" : `últimos ${periodo} dias`;

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-8 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[30px]">Monitoramento do atendimento</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Clientes do WhatsApp agora e no período. Atualiza sozinho a cada 30 segundos.</p>
                    </div>
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Período">
                        {([["hoje", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["mes", "Este mês"]] as const).map(([id, nome]) => (
                            <button key={id} type="button" role="tab" aria-selected={periodo === id} onClick={() => setPeriodo(id)} className={`h-10 rounded-full px-4 text-[15px] ${periodo === id ? "bg-[#E3EFC0] font-extrabold text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-white" : "bg-white font-bold text-[#4A5468] dark:bg-[#232B3F] dark:text-[#AEB9CF]"}`}>{nome}</button>
                        ))}
                    </div>
                    <button type="button" onClick={carregar} disabled={atualizando} className="flex h-10 items-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold disabled:opacity-60 dark:border-white/25 dark:bg-[#232B3F]">{atualizando ? "Atualizando…" : "Atualizar agora"}</button>
                </div>

                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                {!dados && !erro && <p className="text-[15px]">Carregando o painel…</p>}

                {dados && i && (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <Indicador rotulo="Na fila agora" valor={String(i.fila)} detalhe={i.no_menu ? `${i.no_menu} no menu automático` : "aguardando um atendente"} cor="#C9A21E" />
                            <Indicador rotulo="Maior espera" valor={i.fila ? duracao(i.maior_espera_s) : "—"} detalhe="cliente mais antigo da fila" alerta={i.maior_espera_s > 900} cor="#D9731A" />
                            <Indicador rotulo="Em atendimento" valor={String(i.em_atendimento)} detalhe="conversas com um atendente" cor="#3D6A99" />
                            <Indicador rotulo="Atendentes online" valor={`${i.atendentes_online}/${i.atendentes_total}`} detalhe="com o app aberto agora" cor="#4C9A2A" />
                            <Indicador rotulo={`Atendimentos ${nomePeriodo}`} valor={String(i.abertos_periodo)} detalhe={`${i.encerrados_periodo} encerrados`} cor="#313C55" />
                            <Indicador rotulo="Nota média" valor={i.nota_media !== null ? `★ ${String(i.nota_media).replace(".", ",")}` : "—"} detalhe={i.avaliacoes ? `${i.avaliacoes} avaliações` : "sem avaliações"} cor="#6B4FA0" />
                        </div>

                        {dados.mensagens && dados.custos && (
                            <>
                                <section aria-label="Mensagens no WhatsApp" className={`${cartao} flex flex-wrap items-center gap-5`}>
                                    <div className="min-w-[220px] flex-1"><h2 className={titulo}>Mensagens no WhatsApp · {nomePeriodo}</h2><p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">A Meta cobra por mensagem entregue; as primeiras 1.000 de serviço de cada mês são grátis.</p></div>
                                    {[["recebidas", dados.mensagens.recebidas, "#3D6A99"], [`enviadas (${numero(dados.mensagens.equipe)} equipe · ${numero(dados.mensagens.automaticas)} automáticas)`, dados.mensagens.enviadas, "#313C55"], ["modelos enviados", dados.mensagens.modelos, "#D9731A"], ["falharam", dados.mensagens.falhas, "#B42318"]].map(([r, v, c]) => (
                                        <div key={String(r)} className="min-w-[110px] text-center"><div className="text-[26px] font-extrabold" style={{ color: String(c) }}>{numero(Number(v))}</div><div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{r}</div></div>
                                    ))}
                                </section>
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <section aria-label="Custos da Meta" className={cartao}>
                                        <div className="mb-2 flex flex-wrap items-baseline gap-2"><h2 className={`${titulo} flex-1`}>Custos da Meta · {nomePeriodo}</h2><span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">pelo aviso de entrega de cada mensagem</span></div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-[14.5px]">
                                                <thead><tr className="border-b border-[#EEF0F3] dark:border-white/10"><th className={rotuloTabela}>Categoria</th><th className={`${rotuloTabela} text-right`}>Entregues</th><th className={`${rotuloTabela} text-right`}>Cobradas</th><th className={`${rotuloTabela} text-right`}>Preço</th><th className={`${rotuloTabela} text-right`}>Total</th></tr></thead>
                                                <tbody>
                                                    {dados.custos.categorias.map((c) => (
                                                        <tr key={c.categoria} className="border-b border-[#EEF0F3] dark:border-white/10">
                                                            <td className="px-3 py-2"><b>{NOME_CATEGORIA[c.categoria]?.[0] || c.categoria}</b><div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{NOME_CATEGORIA[c.categoria]?.[1]}</div></td>
                                                            <td className="px-3 py-2 text-right">{numero(c.entregues)}</td>
                                                            <td className="px-3 py-2 text-right font-bold">{numero(c.cobradas)}</td>
                                                            <td className="px-3 py-2 text-right">{reais(c.preco)}</td>
                                                            <td className="px-3 py-2 text-right font-extrabold">{reais(c.total)}</td>
                                                        </tr>
                                                    ))}
                                                    <tr><td className="px-3 py-2 font-extrabold" colSpan={4}>Total</td><td className="px-3 py-2 text-right text-[18px] font-extrabold">{reais(dados.custos.total)}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                                            {dados.custos.projecao_mes !== null && <span className="rounded-lg bg-[#FBF0C9] px-2.5 py-1 dark:bg-[#F2CB3F]/15">Projeção para o mês: <b>{reais(dados.custos.projecao_mes)}</b></span>}
                                            {dados.custos.sem_informacao > 0 && <span className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 dark:bg-white/10">{numero(dados.custos.sem_informacao)} entregues sem informação de custo (anteriores a esta versão)</span>}
                                            <span className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 dark:bg-white/10">Preços em Configurações › Geral</span>
                                        </div>
                                    </section>
                                    <section aria-label="Mensagens por usuário" className={cartao}>
                                        <h2 className={`${titulo} mb-2`}>Mensagens por usuário · {nomePeriodo}</h2>
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-[14.5px]">
                                                <thead><tr className="border-b border-[#EEF0F3] dark:border-white/10"><th className={rotuloTabela}>Quem enviou</th><th className={`${rotuloTabela} text-right`}>Enviadas</th><th className={`${rotuloTabela} text-right`} title="Mensagens dos clientes nos atendimentos de cada um">Recebidas</th><th className={`${rotuloTabela} text-right`}>Modelos</th><th className={`${rotuloTabela} text-right`}>Custo</th></tr></thead>
                                                <tbody>
                                                    {(dados.por_usuario || []).sort((a, b) => b.enviadas - a.enviadas).map((u) => (
                                                        <tr key={u.id} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/10">
                                                            <td className="px-3 py-2 font-extrabold">{u.nome}</td>
                                                            <td className="px-3 py-2 text-right">{numero(u.enviadas)}</td>
                                                            <td className="px-3 py-2 text-right">{u.id ? numero(u.recebidas) : "—"}</td>
                                                            <td className="px-3 py-2 text-right">{numero(u.modelos)}</td>
                                                            <td className="px-3 py-2 text-right font-extrabold">{reais(u.custo)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {!(dados.por_usuario || []).length && <p className="px-3 py-4 text-center text-[14.5px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma mensagem no período.</p>}
                                        </div>
                                    </section>
                                </div>
                            </>
                        )}

                        <section aria-label="Setores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {dados.setores.map((s) => (
                                <div key={s.id} className={cartao}>
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full" style={{ background: s.cor }} aria-hidden="true" />
                                        <span className="flex-1 truncate text-[16px] font-extrabold">{s.nome}</span>
                                        <span className={`rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${s.aberto ? "bg-[#EEF5D6] text-[#2F4207] dark:bg-[#B3CE52]/20 dark:text-[#DCEBAA]" : "bg-[#F0F2F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"}`}>{s.aberto ? "Aberto" : "Fechado"}</span>
                                    </div>
                                    <div className="mt-1 truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{s.situacao}</div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div><div className="text-[22px] font-extrabold">{s.fila}</div><div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">na fila</div></div>
                                        <div><div className="text-[22px] font-extrabold">{s.em_atendimento}</div><div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">atendendo</div></div>
                                        <div><div className="text-[22px] font-extrabold">{s.periodo}</div><div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">{periodo === "hoje" ? "hoje" : "no período"}</div></div>
                                    </div>
                                </div>
                            ))}
                            {(dados.sem_setor.fila > 0 || dados.sem_setor.em_atendimento > 0) && (
                                <div className={cartao}>
                                    <div className="text-[16px] font-extrabold">Sem setor</div>
                                    <div className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Clientes que ainda não caíram num setor</div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                                        <div><div className="text-[22px] font-extrabold">{dados.sem_setor.fila}</div><div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">na fila</div></div>
                                        <div><div className="text-[22px] font-extrabold">{dados.sem_setor.em_atendimento}</div><div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">atendendo</div></div>
                                    </div>
                                </div>
                            )}
                        </section>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <section aria-label="Fila de espera" className={cartao}>
                                <div className="mb-2 flex items-center gap-2"><h2 className={`${titulo} flex-1`}>Fila de espera</h2><span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{dados.fila.length} cliente(s)</span></div>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-[14.5px]">
                                        <thead><tr className="border-b border-[#EEF0F3] dark:border-white/10"><th className={rotuloTabela}>Cliente</th><th className={rotuloTabela}>Setor</th><th className={rotuloTabela}>Esperando</th></tr></thead>
                                        <tbody>
                                            {dados.fila.map((f) => (
                                                <tr key={f.conversa_id} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/10">
                                                    <td className="px-3 py-2"><a href={`/messenger?conversa=${f.conversa_id}`} className="font-extrabold text-[#313C55] underline-offset-2 hover:underline dark:text-white">{f.nome}</a><div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{f.telefone}</div></td>
                                                    <td className="px-3 py-2">{f.no_menu ? <span className="rounded-lg bg-[#F0F2F5] px-2 py-0.5 text-[12.5px] font-extrabold dark:bg-white/10">No menu automático</span> : f.setor ? <SeloCor nome={f.setor.nome} cor={f.setor.cor} ponto pequeno /> : <span className="text-[13px] text-[#6B7488]">Sem setor</span>}</td>
                                                    <td className={`whitespace-nowrap px-3 py-2 font-extrabold ${f.espera_s > 900 ? "text-[#B42318] dark:text-[#FF9C92]" : ""}`}>{duracao(f.espera_s)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!dados.fila.length && <p className="px-3 py-4 text-center text-[14.5px] text-[#6B7488] dark:text-[#AEB9CF]">Nenhum cliente esperando agora.</p>}
                                </div>
                            </section>

                            <section aria-label="Atendentes" className={cartao}>
                                <div className="mb-2 flex items-center gap-2"><h2 className={`${titulo} flex-1`}>Atendentes</h2><span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{nomePeriodo}</span></div>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-[14.5px]">
                                        <thead><tr className="border-b border-[#EEF0F3] dark:border-white/10"><th className={rotuloTabela}>Atendente</th><th className={rotuloTabela}>Agora</th><th className={rotuloTabela}>Encerrados</th><th className={rotuloTabela} title="Do momento em que assumiu até a primeira resposta">1ª resposta</th><th className={rotuloTabela}>Nota</th></tr></thead>
                                        <tbody>
                                            {[...dados.atendentes].sort((a, b) => Number(b.online) - Number(a.online) || b.em_andamento - a.em_andamento || a.nome.localeCompare(b.nome)).map((a) => (
                                                <tr key={a.id} className="border-b border-[#EEF0F3] last:border-0 dark:border-white/10">
                                                    <td className="px-3 py-2"><span className="flex items-center gap-2 font-extrabold"><span className={`h-2.5 w-2.5 flex-none rounded-full ${a.online ? "bg-[#4C9A2A]" : "bg-[#C9D1DE] dark:bg-white/25"}`} aria-label={a.online ? "online" : "offline"} />{a.nome}</span></td>
                                                    <td className="px-3 py-2 font-bold">{a.em_andamento}</td>
                                                    <td className="px-3 py-2 font-bold">{a.encerrados}</td>
                                                    <td className="whitespace-nowrap px-3 py-2">{duracao(a.primeira_resposta_media_s)}</td>
                                                    <td className="whitespace-nowrap px-3 py-2">{a.nota_media !== null ? `★ ${String(a.nota_media).replace(".", ",")} (${a.avaliacoes})` : "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                            <section aria-label="Atendimentos por dia" className={cartao}>
                                <h2 className={`${titulo} mb-3`}>Atendimentos por dia</h2>
                                <div className="flex h-40 items-end gap-1" role="img" aria-label={`Atendimentos por dia: ${dados.por_dia.map((d) => `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)} ${d.total}`).join(", ")}`}>
                                    {dados.por_dia.map((d) => {
                                        const max = Math.max(1, ...dados.por_dia.map((x) => x.total));
                                        return (
                                            <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${d.total}`}>
                                                <span className="text-[11px] font-extrabold">{d.total || ""}</span>
                                                <span className="w-full rounded-t-md bg-[#3D6A99]" style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total ? 4 : 1 }} />
                                                {dados.por_dia.length <= 10 && <span className="text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[13.5px]">
                                    <div><b>Espera média:</b> {duracao(i.espera_media_s)}</div>
                                    <div><b>Duração média:</b> {duracao(i.duracao_media_s)}</div>
                                </div>
                            </section>
                            <section aria-label="Por etiqueta" className={cartao}>
                                <h2 className={`${titulo} mb-3`}>Por etiqueta</h2>
                                <Barras cor="#3D6A99" itens={dados.por_etiqueta.map((e) => ({ rotulo: e.nome, valor: e.total, cor: e.cor }))} />
                            </section>
                            <section aria-label="Avaliações" className={cartao}>
                                <h2 className={`${titulo} mb-3`}>Avaliações dos clientes</h2>
                                <Barras cor="#C9A21E" itens={[...dados.notas].reverse().map((n) => ({ rotulo: `${"★".repeat(n.nota)}`, valor: n.total }))} />
                            </section>
                        </div>
                        <p className="text-center text-[12.5px] text-[#6B7488] dark:text-[#AEB9CF]">Atualizado às {new Date(dados.agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · <a href="/messenger" className="font-bold">Voltar ao Messenger</a> <Icone nome="msg" className="inline h-3.5 w-3.5" /></p>
                    </>
                )}
            </div>
        </div>
    );
}
