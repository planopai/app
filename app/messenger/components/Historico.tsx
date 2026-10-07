"use client";

/**
 * Histórico de atendimentos de clientes (WhatsApp) — componente usado em dois lugares:
 *  - rota /messenger-historico (página "messenger-historico", Gestão: vê todos);
 *  - botão Histórico da tela do Messenger (todos: quem não é da Gestão vê só os atendimentos em que participou).
 * O filtro é feito pelo servidor (messenger.php?action=historico_clientes). Somente leitura.
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import type { Mensagem } from "@/components/messenger/tipos";
import { Icone } from "./Lista";

type Item = {
    id: number; conversa_id: number; cliente: { nome: string | null; telefone: string }; responsavel: { id: number; nome: string } | null;
    aberto_em: string; encerrado_em: string; encerrado_por: string | null; mensagens: number;
};
type Detalhe = {
    atendimento: { id: number; status: string; aberto_em: string; encerrado_em: string | null; cliente: { nome: string | null; telefone: string } };
    mensagens: Mensagem[];
    transferencias: { de: string | null; para: string | null; observacao: string | null; em: string }[];
};

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inicioMes = () => hoje().slice(0, 8) + "01";

export default function HistoricoClientes({ embutido = false, onVoltar }: { embutido?: boolean; onVoltar?: () => void }) {
    const [gestao, setGestao] = useState<boolean | null>(null);
    const [q, setQ] = useState("");
    const [de, setDe] = useState(inicioMes());
    const [ate, setAte] = useState(hoje());
    const [lista, setLista] = useState<Item[]>([]);
    const [temMais, setTemMais] = useState(false);
    const [sel, setSel] = useState<Detalhe | null>(null);
    const [erro, setErro] = useState("");
    const [carregando, setCarregando] = useState(false);

    const buscar = useCallback(async (mais = false) => {
        setCarregando(true);
        try {
            const d = await msgGet<{ atendimentos: Item[]; tem_mais: boolean; gestao?: boolean }>("historico_clientes", { q, de, ate, antes_id: mais && lista.length ? lista[lista.length - 1].id : "" });
            setLista(mais ? [...lista, ...d.atendimentos] : d.atendimentos);
            setTemMais(d.tem_mais);
            setGestao(!!d.gestao);
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setCarregando(false);
        }
    }, [q, de, ate, lista]);

    useEffect(() => {
        buscar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const abrir = async (id: number) => {
        try {
            setSel(await msgGet<Detalhe>("historico_mensagens", { atendimento_id: id }));
        } catch (e: any) {
            setErro(e.message);
        }
    };

    return (
        <div className={`${embutido ? "h-full overflow-y-auto" : "min-h-screen"} bg-[#F4F6F9] p-4 text-[#313C55] md:p-8`}>
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div className="flex items-center gap-4">
                    <div className="hidden h-14 w-14 flex-none items-center justify-center rounded-[18px] bg-[#313C55] text-white md:flex"><Icone nome="clock" className="h-[26px] w-[26px]" /></div>
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-extrabold md:text-[32px]">Histórico de atendimentos</h1>
                        <p className="mt-1 text-[15px] text-[#5B6478]">Atendimentos de clientes do WhatsApp já encerrados.{gestao === null ? "" : gestao ? " Você vê todos (Gestão)." : " Você vê os atendimentos em que participou."}</p>
                    </div>
                    {onVoltar ? (
                        <button type="button" onClick={onVoltar} className="flex h-11 items-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold">Voltar ao Messenger</button>
                    ) : (
                        <a href="/messenger" className="hidden h-11 items-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold md:flex">Voltar ao Messenger</a>
                    )}
                </div>
                <form className="flex flex-wrap items-end gap-2.5" onSubmit={(e) => { e.preventDefault(); setSel(null); buscar(); }}>
                    <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2.5 rounded-xl bg-white px-3.5 text-[#5B6478]">
                        <Icone nome="search" />
                        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar no histórico" className="min-w-0 flex-1 bg-transparent text-sm text-[#313C55] outline-none" />
                    </label>
                    <label className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478]">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="mt-1 block h-11 rounded-xl border border-[#E1E5EC] bg-white px-3 text-sm font-bold text-[#313C55]" /></label>
                    <label className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478]">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-1 block h-11 rounded-xl border border-[#E1E5EC] bg-white px-3 text-sm font-bold text-[#313C55]" /></label>
                    <button type="submit" className="h-11 rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white">Buscar</button>
                </form>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318]">{erro}</div>}
                <div className="grid min-h-[600px] overflow-hidden rounded-2xl border border-[#E1E5EC] bg-white md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className={`${sel ? "hidden md:flex" : "flex"} flex-col border-r border-[#E1E5EC]`}>
                        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_60px] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] md:grid">
                            <span>Cliente</span><span>Responsável</span><span>Encerrado</span><span className="text-right">Msgs</span>
                        </div>
                        {lista.map((a) => (
                            <button key={a.id} type="button" onClick={() => abrir(a.id)} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[#E3E8F0] px-4 py-3 text-left text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_60px] ${sel?.atendimento.id === a.id ? "bg-[#E6F7FE]" : "hover:bg-[#EEF2F7]"}`}>
                                <span className="min-w-0"><span className="block truncate font-extrabold">{a.cliente.nome || a.cliente.telefone}</span><span className="block text-[12.5px] text-[#5B6478]">{a.cliente.telefone}</span></span>
                                <span className="hidden truncate md:block">{a.responsavel?.nome || "—"}</span>
                                <span className="text-[13px]">{dataHora(a.encerrado_em)}</span>
                                <span className="hidden text-right font-extrabold md:block">{a.mensagens}</span>
                            </button>
                        ))}
                        {!lista.length && !carregando && <p className="p-4 text-sm text-[#6B7488]">Nenhum atendimento encerrado no período.</p>}
                        {temMais && <button type="button" onClick={() => buscar(true)} className="m-3 h-10 rounded-xl border border-[#C9D1DE] text-sm font-bold">Carregar mais</button>}
                    </div>
                    <div className={`${sel ? "flex" : "hidden md:flex"} min-h-0 flex-col bg-[#F6F8FB]`}>
                        {sel ? (
                            <>
                                <div className="flex items-center gap-3 border-b border-[#E3E8F0] bg-white px-3 py-3">
                                    <button type="button" onClick={() => setSel(null)} className="flex h-11 w-11 items-center justify-center md:hidden" aria-label="Voltar à lista"><Icone nome="back" /></button>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[17px] font-extrabold">{sel.atendimento.cliente.nome || sel.atendimento.cliente.telefone}</div>
                                        <div className="text-[13px] font-semibold text-[#5B6478]">{sel.atendimento.cliente.telefone} · aberto {dataHora(sel.atendimento.aberto_em)} · encerrado {dataHora(sel.atendimento.encerrado_em)}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-[#FCF3CC] px-4 py-2 text-[13px] font-extrabold" role="status"><Icone nome="lock" className="h-4 w-4" />Somente leitura{gestao ? " · acesso da Gestão" : " · atendimento em que você participou"}</div>
                                {sel.transferencias.length > 0 && (
                                    <div className="flex flex-col gap-1.5 border-b border-[#E3E8F0] bg-white px-4 py-3 text-[13.5px]">
                                        <div className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478]">Transferências</div>
                                        {sel.transferencias.map((t, i) => (
                                            <div key={i} className="flex gap-2"><span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#00AEEC]" /><span><b>{dataHora(t.em)}</b> de {t.de || "—"} para {t.para || "—"}{t.observacao ? `: ${t.observacao}` : ""}</span></div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
                                    {sel.mensagens.map((m) => m.autor_tipo === "sistema" ? (
                                        <div key={m.id} className="self-center rounded-xl border border-[#E3E8F0] bg-white px-3 py-1 text-[12.5px] font-bold text-[#5B6478]">{m.texto}</div>
                                    ) : (
                                        <div key={m.id} className={`max-w-[84%] rounded-[18px] border px-3.5 py-2.5 text-[15px] ${m.autor_tipo === "contato" ? "self-start border-[#E3E8F0] bg-white" : "self-end border-[#313C55] bg-[#313C55] text-white"}`}>
                                            <div className={`mb-0.5 text-[12.5px] font-extrabold ${m.autor_tipo === "contato" ? "text-[#0A7FB0]" : "text-[#C9D1DE]"}`}>{m.autor_nome}</div>
                                            {m.apagada ? <i>Mensagem apagada</i> : (
                                                <>
                                                    {m.anexos.length > 0 && (
                                                        <button type="button" className="text-sm font-extrabold underline" onClick={async () => { try { window.open((await msgGet<{ url: string }>("anexo_url", { anexo_id: m.anexos[0].id })).url, "_blank", "noopener"); } catch (e: any) { setErro(e.message); } }}>
                                                            Abrir {m.tipo === "imagem" ? "foto" : m.tipo === "audio" ? "áudio" : m.anexos[0].nome_original || "documento"}
                                                        </button>
                                                    )}
                                                    {m.texto && <div className="whitespace-pre-wrap break-words">{m.texto}</div>}
                                                </>
                                            )}
                                            <div className="mt-1 text-right text-[11.5px] font-bold opacity-70">{dataHora(m.criado_em)}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-1 items-center justify-center p-8 text-[15px] font-bold text-[#5B6478]">Escolha um atendimento</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
