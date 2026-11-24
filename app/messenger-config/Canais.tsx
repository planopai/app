"use client";

/**
 * Configurações do Messenger › Canais — 24/11/2026 (WhatsApp Web, fase 2A). Back-end: aurora_23.php.
 * Números do WhatsApp Web (conector no PC do velório): adicionar, ler o QR Code, ver a situação, "Quem usa"
 * (setores do Messenger + pessoas avulsas; a Gestão vê tudo), refazer a ligação, desconectar, excluir e o diagnóstico.
 * Só a Gestão usa (o back-end confere). O número oficial da Meta não aparece aqui e não muda.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiJson } from "@/components/messenger/api";

const URL_CANAIS = `${API_BASE}/aurora_23.php`;

type Numero = {
    id: number;
    nome: string;
    telefone: string | null;
    perfil_nome: string | null;
    estado: string;
    estado_em: string | null;
    setores?: string[];
    pessoas?: string[];
};
type Diag = { configurado: boolean; certificado: boolean; conector: boolean | null; versao: string | null; erro: string | null };
type Acesso = { setores: number[]; pessoas: number[]; opcoes_setores: { id: number; nome: string; membros: number }[]; opcoes_pessoas: { id: number; nome: string }[] };
type Evento = { id: number; evento: string; corpo: string; criado_em: string };

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const btnPri = "inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "inline-flex h-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] disabled:opacity-40 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPerigo = "inline-flex h-11 items-center justify-center rounded-xl border border-[#F1B5AE] bg-white px-4 text-sm font-bold text-[#B42318] disabled:opacity-40 dark:border-[#FF9C92]/40 dark:bg-[#232B3F] dark:text-[#FF9C92]";
const campo = "h-11 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3.5 text-[16px] text-[#1F2638] outline-none focus:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334] dark:text-white";
const fraco = "text-[13px] text-[#5B6478] dark:text-[#AEB9CF]";

const ESTADOS: Record<string, [string, string]> = {
    open: ["conectado", "bg-[#E3F4E8] text-[#1E7A3C] dark:bg-[#2E9D5B]/20 dark:text-[#7FE0A5]"],
    connecting: ["aguardando QR Code", "bg-[#FFF4D6] text-[#8A6100] dark:bg-[#F2C94C]/15 dark:text-[#F2C94C]"],
    novo: ["novo", "bg-[#FFF4D6] text-[#8A6100] dark:bg-[#F2C94C]/15 dark:text-[#F2C94C]"],
    close: ["desconectado", "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"],
    sem_conector: ["conector fora do ar", "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"],
};

function Situacao({ estado }: { estado: string }) {
    const [txt, cor] = ESTADOS[estado] || [estado || "?", "bg-[#EEF1F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"];
    return <span className={`inline-flex h-7 items-center rounded-full px-3 text-[12.5px] font-bold ${cor}`}>{txt}</span>;
}

function telefone(t?: string | null) {
    let s = String(t || "");
    if (s.length >= 12 && s.startsWith("55")) s = s.slice(2);
    return s.length >= 10 ? `(${s.slice(0, 2)}) ${s.slice(2, -4)}-${s.slice(-4)}` : s;
}

async function chamar(acao: string, params: Record<string, string | number> = {}, corpo?: Record<string, unknown>) {
    const q = new URLSearchParams({ action: acao, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), _: String(Date.now()) });
    return apiJson(`${URL_CANAIS}?${q.toString()}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : undefined);
}

function Janela({ titulo, fechar, children, largura = "max-w-[560px]" }: { titulo: string; fechar: () => void; children: React.ReactNode; largura?: string }) {
    return (
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" style={{ background: "rgba(49,60,85,0.45)" }} onClick={fechar}>
            <div className={`flex max-h-[92vh] w-full ${largura} flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl dark:bg-[#232B3F]`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
                <div className="flex items-center gap-3 border-b border-[#E1E5EC] px-4 py-3 dark:border-white/10">
                    <h3 className="m-0 flex-1 text-[17px] font-extrabold">{titulo}</h3>
                    <button type="button" onClick={fechar} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl hover:bg-[#F0F2F5] dark:hover:bg-white/10" aria-label="Fechar">✕</button>
                </div>
                <div className="overflow-y-auto p-4">{children}</div>
            </div>
        </div>
    );
}

/** QR Code: pede um novo a cada 25 s e confere a situação a cada 3 s; fecha sozinho quando conectar. */
function JanelaQr({ numero, fechar, conectou }: { numero: Numero; fechar: () => void; conectou: () => void }) {
    const [qr, setQr] = useState<string | null>(null);
    const [info, setInfo] = useState("Pedindo o código…");
    const ok = useRef(false);
    useEffect(() => {
        const pedir = () =>
            chamar("qr", { id: numero.id })
                .then((j: any) => {
                    if (j.dados.estado === "open") return fim();
                    if (j.dados.qr) {
                        setQr(j.dados.qr);
                        setInfo("O código muda a cada 30 segundos, mais ou menos; esta janela atualiza sozinha.");
                    }
                })
                .catch((e: any) => setInfo(e?.message || "Não foi possível pedir o código."));
        const fim = () => {
            if (ok.current) return;
            ok.current = true;
            conectou();
        };
        pedir();
        const t1 = setInterval(pedir, 25000);
        const t2 = setInterval(() => chamar("estado", { id: numero.id }).then((j: any) => j.dados.estado === "open" && fim()).catch(() => {}), 3000);
        return () => {
            clearInterval(t1);
            clearInterval(t2);
        };
    }, [numero.id, conectou]);
    return (
        <Janela titulo={`Conectar · ${numero.nome}`} fechar={fechar}>
            <ol className="m-0 mb-3 list-decimal pl-5 text-[14.5px] leading-6">
                <li>No celular do chip deste número, abra o <b>WhatsApp</b>.</li>
                <li>Toque em <b>⋮</b> (ou Configurações) › <b>Aparelhos conectados</b> › <b>Conectar aparelho</b>.</li>
                <li>Aponte a câmera para o código abaixo.</li>
            </ol>
            <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                {qr ? <img src={qr} alt="QR Code para conectar o WhatsApp" className="w-[260px] max-w-full rounded-lg bg-white p-2" /> : <span className={fraco}>Aguarde…</span>}
            </div>
            <p className={`${fraco} mt-2`}>{info}</p>
        </Janela>
    );
}

/** Quem usa: setores (regra principal) + pessoas avulsas. A Gestão vê tudo sem precisar estar aqui. */
function JanelaAcesso({ numero, fechar, salvo, avisar }: { numero: Numero; fechar: () => void; salvo: () => void; avisar: (m: string, erro?: boolean) => void }) {
    const [a, setA] = useState<Acesso | null>(null);
    const [busca, setBusca] = useState("");
    const [salvando, setSalvando] = useState(false);
    useEffect(() => {
        chamar("acesso", { id: numero.id })
            .then((j: any) => setA(j.dados))
            .catch((e: any) => {
                avisar(e?.message || "Não foi possível carregar.", true);
                fechar();
            });
    }, [numero.id, avisar, fechar]);
    const alternar = (lista: "setores" | "pessoas", id: number) => {
        if (!a) return;
        const atual = a[lista];
        setA({ ...a, [lista]: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] });
    };
    const salvar = async () => {
        if (!a) return;
        setSalvando(true);
        try {
            const j: any = await chamar("acesso_salvar", {}, { id: numero.id, setores: a.setores, pessoas: a.pessoas });
            avisar(String(j.msg || "Salvo."));
            salvo();
        } catch (e: any) {
            avisar(e?.message || "Não foi possível salvar.", true);
        } finally {
            setSalvando(false);
        }
    };
    const termo = busca.trim().toLowerCase();
    const pessoas = (a?.opcoes_pessoas || []).filter((p) => !termo || p.nome.toLowerCase().includes(termo));
    return (
        <Janela titulo={`Quem usa · ${numero.nome}`} fechar={fechar}>
            {!a ? (
                <p className={fraco}>Carregando…</p>
            ) : (
                <div className="flex flex-col gap-4">
                    <p className={fraco}>Quem estiver nos setores marcados (ou na lista de pessoas) vê e responde as conversas deste número, e recebe o aviso se ele cair. A Gestão vê tudo.</p>
                    <div>
                        <b className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Setores</b>
                        {a.opcoes_setores.length === 0 ? <p className={fraco}>Nenhum setor ativo. Cadastre na aba Setores.</p> : null}
                        <div className="flex flex-col">
                            {a.opcoes_setores.map((s) => (
                                <label key={s.id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                                    <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={a.setores.includes(s.id)} onChange={() => alternar("setores", s.id)} />
                                    <span className="flex-1 text-[15px]">{s.nome}</span>
                                    <span className={fraco}>{Number(s.membros)} pessoa(s)</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <b className="mb-1 block text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Pessoas avulsas (exceções)</b>
                        <input className={campo} placeholder="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
                        <div className="mt-1 flex max-h-[240px] flex-col overflow-y-auto">
                            {pessoas.map((p) => (
                                <label key={p.id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                                    <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={a.pessoas.includes(p.id)} onChange={() => alternar("pessoas", p.id)} />
                                    <span className="text-[15px]">{p.nome}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" className={btnSec} onClick={fechar}>Cancelar</button>
                        <button type="button" className={btnPri} disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
                    </div>
                </div>
            )}
        </Janela>
    );
}

function JanelaEventos({ numero, fechar }: { numero: Numero; fechar: () => void }) {
    const [lista, setLista] = useState<Evento[] | null>(null);
    const [erro, setErro] = useState("");
    useEffect(() => {
        chamar("eventos", { id: numero.id })
            .then((j: any) => setLista(j.dados))
            .catch((e: any) => setErro(e?.message || "Não foi possível carregar."));
    }, [numero.id]);
    return (
        <Janela titulo={`Diagnóstico · ${numero.nome}`} fechar={fechar} largura="max-w-[820px]">
            <p className={`${fraco} mb-3`}>Últimos avisos que o conector mandou para o app (os mais novos primeiro). Serve para investigar problemas.</p>
            {erro ? <p className="text-[14px] font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
            {lista && lista.length === 0 ? <p className={fraco}>Nenhum evento ainda.</p> : null}
            <div className="flex flex-col gap-2">
                {(lista || []).map((ev) => (
                    <details key={ev.id} className="rounded-xl border border-[#E1E5EC] px-3 py-2 dark:border-white/10">
                        <summary className="cursor-pointer text-[14px]"><b>{ev.evento}</b> <span className={fraco}>· {ev.criado_em}</span></summary>
                        <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[#F6F8FB] p-2 text-[12px] dark:bg-[#1C2334]">{(() => { try { return JSON.stringify(JSON.parse(ev.corpo), null, 2); } catch { return ev.corpo; } })()}</pre>
                    </details>
                ))}
            </div>
        </Janela>
    );
}

export function AbaCanais({ avisar }: { avisar: (m: string, erro?: boolean) => void }) {
    const [diag, setDiag] = useState<Diag | null>(null);
    const [numeros, setNumeros] = useState<Numero[] | null>(null);
    const [erro, setErro] = useState("");
    const [novoNome, setNovoNome] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [qrDe, setQrDe] = useState<Numero | null>(null);
    const [acessoDe, setAcessoDe] = useState<Numero | null>(null);
    const [eventosDe, setEventosDe] = useState<Numero | null>(null);

    const carregar = useCallback(() => {
        chamar("numeros")
            .then((j: any) => {
                setNumeros(j.dados || []);
                setErro("");
            })
            .catch((e: any) => setErro(e?.message || "Não foi possível carregar."));
    }, []);

    useEffect(() => {
        chamar("diagnostico").then((j: any) => setDiag(j.dados)).catch(() => setDiag(null));
        carregar();
        const t = setInterval(() => !document.hidden && carregar(), 30000);
        return () => clearInterval(t);
    }, [carregar]);

    const acao = async (nome: string, n: Numero, pergunta?: string) => {
        if (pergunta && !window.confirm(pergunta)) return;
        setOcupado(true);
        try {
            const j: any = await chamar(nome, {}, { id: n.id });
            avisar(String(j.msg || "Feito."));
            carregar();
        } catch (e: any) {
            avisar(e?.message || "Não foi possível concluir.", true);
        } finally {
            setOcupado(false);
        }
    };

    const criar = async () => {
        const nome = novoNome.trim();
        if (!nome) return avisar("Dê um nome ao número (ex.: Fornecedores).", true);
        setOcupado(true);
        try {
            const j: any = await chamar("numero_criar", {}, { nome });
            setNovoNome("");
            avisar(String(j.msg || "Número criado."));
            const novo: Numero = { id: Number(j.dados.id), nome, telefone: null, perfil_nome: null, estado: "connecting", estado_em: null };
            carregar();
            setQrDe(novo);
        } catch (e: any) {
            avisar(e?.message || "Não foi possível criar.", true);
        } finally {
            setOcupado(false);
        }
    };

    const fecharQr = useCallback(() => setQrDe(null), []);
    const conectou = useCallback(() => {
        setQrDe(null);
        avisar("Número conectado!");
        carregar();
    }, [avisar, carregar]);
    const fecharAcesso = useCallback(() => setAcessoDe(null), []);

    const selo = !diag
        ? ["verificando o conector…", "bg-[#EEF1F5] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]"]
        : !diag.configurado
          ? ["falta configurar o conector no servidor (wa2_url / wa2_chave)", "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"]
          : !diag.conector
            ? [`conector fora do ar${diag.erro ? `: ${diag.erro}` : ""}`, "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"]
            : [`conector no ar · v${diag.versao}${diag.certificado ? "" : " · sem o wa2-cert.pem"}`, "bg-[#E3F4E8] text-[#1E7A3C] dark:bg-[#2E9D5B]/20 dark:text-[#7FE0A5]"];

    return (
        <section className={`${cartao} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-lg font-extrabold">Canais · WhatsApp Web</h2>
                    <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                        Números extras, conectados por QR Code, para falar com fornecedores, prestadores, parceiros e órgãos públicos. Sem Aurora, sem fila e sem janela de 24 h. O número oficial dos clientes (Meta) não muda.
                    </p>
                </div>
                <span className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[12.5px] font-bold ${selo[1]}`}>{selo[0]}</span>
            </div>

            {erro ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erro}</div> : null}
            {!numeros && !erro ? <p className={fraco}>Carregando…</p> : null}
            {numeros && numeros.length === 0 ? <p className={fraco}>Nenhum número ainda. Adicione o primeiro abaixo.</p> : null}

            {numeros && numeros.length > 0 ? (
                <div className="flex flex-col divide-y divide-[#E1E5EC] dark:divide-white/10">
                    {numeros.map((n) => {
                        const quem = [...(n.setores || []), ...(n.pessoas || [])];
                        return (
                            <div key={n.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <b className="text-[16px]">{n.nome}</b>
                                        <Situacao estado={n.estado} />
                                    </div>
                                    <div className={`${fraco} mt-1`}>
                                        {n.telefone ? telefone(n.telefone) : "sem número ainda (leia o QR Code)"}
                                        {n.perfil_nome ? ` · ${n.perfil_nome}` : ""}
                                    </div>
                                    <div className={`${fraco} mt-0.5`}>Quem usa: {quem.length ? quem.join(", ") : <b className="text-[#8A6100] dark:text-[#F2C94C]">ninguém definido (só a Gestão)</b>}</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {n.estado !== "open" ? (
                                        <button type="button" className={btnPri} disabled={ocupado} onClick={() => setQrDe(n)}>Ler QR Code</button>
                                    ) : null}
                                    <button type="button" className={btnSec} disabled={ocupado} onClick={() => setAcessoDe(n)}>Quem usa</button>
                                    <button type="button" className={btnSec} disabled={ocupado} onClick={() => acao("webhook_refazer", n)}>Refazer ligação</button>
                                    <button type="button" className={btnSec} disabled={ocupado} onClick={() => setEventosDe(n)}>Diagnóstico</button>
                                    {n.estado === "open" ? (
                                        <button type="button" className={btnSec} disabled={ocupado} onClick={() => acao("numero_desconectar", n, `Desconectar o número ${n.nome}? Para voltar, será preciso ler um QR Code novo.`)}>Desconectar</button>
                                    ) : null}
                                    <button type="button" className={btnPerigo} disabled={ocupado} onClick={() => acao("numero_excluir", n, `Excluir o número ${n.nome}? Ele sai do conector; as mensagens já recebidas ficam guardadas.`)}>Excluir</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-[#E1E5EC] pt-4 dark:border-white/10">
                <b className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Adicionar número</b>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input className={campo} placeholder="Nome (ex.: Fornecedores, Órgãos públicos)" maxLength={80} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
                    <button type="button" className={btnPri} disabled={ocupado} onClick={criar}>Adicionar e ler o QR Code</button>
                </div>
                <p className={fraco}>Use um chip só para isso. Não use para disparos em massa: o WhatsApp pode bloquear o número. Se um número cair, quem usa e a Gestão recebem um aviso.</p>
            </div>

            {qrDe ? <JanelaQr numero={qrDe} fechar={fecharQr} conectou={conectou} /> : null}
            {acessoDe ? <JanelaAcesso numero={acessoDe} fechar={fecharAcesso} salvo={() => { setAcessoDe(null); carregar(); }} avisar={avisar} /> : null}
            {eventosDe ? <JanelaEventos numero={eventosDe} fechar={() => setEventosDe(null)} /> : null}
        </section>
    );
}
