"use client";

// Novos planos: adesões feitas pelo site (planos-novos.php). Página `novos-planos`, módulo Plano.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const API = "https://api.planoassistencialintegrado.com.br/planos-novos.php";
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

async function apiPost(corpo: Record<string, unknown>) {
    return apiJson(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
}

type Status = "aguardando_pagamento" | "pago" | "contrato_criado" | "cancelado";

type Linha = {
    id: number;
    codigo: string;
    plano: string;
    status: Status;
    titular_nome: string;
    titular_cpf: string;
    titular_celular: string;
    cidade: string | null;
    uf: string | null;
    qtd_dependentes: number;
    qtd_agregados: number;
    valor_adesao: number;
    valor_mensalidade: number;
    valor_pago: number | null;
    pago_em: string | null;
    wc_pedido_id: number | null;
    numero_contrato: string | null;
    criado_em: string;
};

type Pessoa = {
    nome: string;
    cpf: string;
    nascimento: string;
    idade: number;
    parentesco: string;
    parentesco_rotulo: string;
    religiao: string;
    tipo: "dependente" | "agregado";
    paga: boolean;
};

type Evento = { em: string; tipo: string; por: string; [k: string]: unknown };

type Cadastro = Linha & {
    titular_nascimento: string;
    titular_religiao: string;
    titular_email: string | null;
    endereco: { cep: string | null; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
    dependentes: Pessoa[];
    qtd_agregados_pagos: number;
    valor_agregados: number;
    sucessor_nome: string | null;
    sucessor_cpf: string | null;
    aceite: { em: string; ip: string; versao: string; religiao: boolean };
    pagamento_metodo: string | null;
    carencia: { inicio: string; natural_ate: string; acidental_ate: string } | null;
    contrato_por: string | null;
    contrato_em: string | null;
    origem: string | null;
    observacao: string | null;
    eventos: Evento[];
};

const STATUS: Record<Status, { rotulo: string; classe: string; cor: string }> = {
    aguardando_pagamento: {
        rotulo: "Aguardando pagamento",
        classe: "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
        cor: "#3D6A99",
    },
    pago: {
        rotulo: "Pago · criar contrato",
        classe: "border-[#E4BC30] bg-[#FCF3CC] text-[#313C55] dark:border-[#F2CB3F]/60 dark:bg-[#F2CB3F]/16 dark:text-white",
        cor: "#F2CB3F",
    },
    contrato_criado: {
        rotulo: "Contrato criado",
        classe: "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/18 dark:text-white",
        cor: "#B3CE52",
    },
    cancelado: {
        rotulo: "Cancelado",
        classe: "border-[#C9D1DE] bg-[#F1F4F8] text-[#5B6478] dark:border-white/20 dark:bg-white/8 dark:text-[#AEB9CF]",
        cor: "#7A8396",
    },
};

const EVENTO_ROTULO: Record<string, string> = {
    cadastro: "Cadastro feito no site",
    pedido: "Pedido criado no WooCommerce",
    pago: "Pagamento confirmado",
    alerta: "Alerta",
    notificacao: "Notificação enviada",
    notificacao_falhou: "Notificação não enviada",
    cancelado: "Pedido cancelado/estornado",
    substituido: "Substituído por um cadastro novo",
    contrato: "Contrato informado",
    situacao: "Situação alterada",
    observacao: "Observação atualizada",
};

const brl = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (s?: string | null, hora = false) => {
    if (!s) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}${hora && m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
};
const cpfFmt = (c?: string | null) => (c && c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c || "—");
const telFmt = (t?: string | null) => {
    const d = (t || "").replace(/\D/g, "");
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return t || "—";
};
const waLink = (t?: string | null, nome?: string) => {
    const d = (t || "").replace(/\D/g, "");
    const msg = `Olá, ${(nome || "").split(" ")[0]}! Aqui é do Plano PAI, sobre a sua adesão pelo site.`;
    return d ? `https://wa.me/55${d}?text=${encodeURIComponent(msg)}` : "";
};

function Selo({ status }: { status: Status }) {
    const s = STATUS[status];
    return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${s.classe}`}>{s.rotulo}</span>;
}

const ROTULO = "text-[12px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[16px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white";
const BTN =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#313C55] px-4 text-sm font-bold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN2 =
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#C9D1DE] bg-[#FFFFFF] px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/26 dark:bg-transparent dark:text-white dark:hover:bg-white/8";

export default function NovosPlanosPage() {
    const [rows, setRows] = useState<Linha[]>([]);
    const [resumo, setResumo] = useState<Record<Status, number>>({ aguardando_pagamento: 0, pago: 0, contrato_criado: 0, cancelado: 0 });
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [status, setStatus] = useState<Status | "">("");
    const [plano, setPlano] = useState("");
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const [abertoId, setAbertoId] = useState<number | null>(null);
    const porPagina = 30;

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro("");
        try {
            const q = new URLSearchParams({ acao: "listar", pagina: String(pagina), por_pagina: String(porPagina), _: String(Date.now()) });
            if (status) q.set("status", status);
            if (plano) q.set("plano", plano);
            if (buscaAplicada) q.set("busca", buscaAplicada);
            const j = await apiJson(`${API}?${q}`);
            setRows(j.rows || []);
            setTotal(j.total || 0);
            setResumo(j.resumo);
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao carregar.");
        } finally {
            setCarregando(false);
        }
    }, [pagina, status, plano, buscaAplicada]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    useEffect(() => {
        const id = Number(new URLSearchParams(window.location.search).get("id") || 0);
        if (id > 0) setAbertoId(id);
    }, []);

    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const filtrarStatus = (s: Status | "") => {
        setStatus(s);
        setPagina(1);
    };

    return (
        <div className="min-h-full bg-[#F6F8FB] px-4 py-6 text-[#313C55] lg:px-8 dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto max-w-7xl space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-[28px] font-extrabold leading-tight">Novos planos</h1>
                        <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Adesões feitas pelo site. Depois do pagamento, crie o contrato no UnyPax e informe o número aqui.</p>
                    </div>
                    <button className={BTN2} onClick={carregar} disabled={carregando}>
                        Atualizar
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {(Object.keys(STATUS) as Status[]).map((s) => (
                        <button
                            key={s}
                            onClick={() => filtrarStatus(status === s ? "" : s)}
                            className={`rounded-2xl border bg-[#FFFFFF] p-4 text-left transition dark:bg-[#232B3F] ${
                                status === s ? "border-[#313C55] ring-2 ring-[#313C55]/15 dark:border-white/60" : "border-[#E3E8F0] dark:border-white/12"
                            }`}
                            style={{ borderTop: `4px solid ${STATUS[s].cor}` }}
                        >
                            <div className={ROTULO}>{STATUS[s].rotulo}</div>
                            <div className="mt-1 text-3xl font-extrabold">{resumo[s] ?? 0}</div>
                        </button>
                    ))}
                </div>

                <form
                    className="flex flex-col gap-3 rounded-2xl border border-[#E3E8F0] bg-[#FFFFFF] p-4 sm:flex-row dark:border-white/12 dark:bg-[#232B3F]"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setPagina(1);
                        setBuscaAplicada(busca.trim());
                    }}
                >
                    <input className={CAMPO} placeholder="Nome, CPF, código, pedido ou contrato" value={busca} onChange={(e) => setBusca(e.target.value)} />
                    <select className={`${CAMPO} sm:max-w-[180px]`} value={plano} onChange={(e) => { setPlano(e.target.value); setPagina(1); }}>
                        <option value="">Todos os planos</option>
                        {["LIGHT", "FLEX", "PLUS", "MAX"].map((p) => (
                            <option key={p}>{p}</option>
                        ))}
                    </select>
                    <button className={BTN} type="submit">Buscar</button>
                    {(status || plano || buscaAplicada) && (
                        <button type="button" className={BTN2} onClick={() => { setStatus(""); setPlano(""); setBusca(""); setBuscaAplicada(""); setPagina(1); }}>
                            Limpar
                        </button>
                    )}
                </form>

                {erro && <div className="rounded-xl border border-[#F5C2BE] bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#B42318]/20 dark:text-[#FF9C92]">{erro}</div>}

                <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] bg-[#FFFFFF] dark:border-white/12 dark:bg-[#232B3F]">
                    {/* Computador */}
                    <table className="hidden w-full text-sm lg:table">
                        <thead className="bg-[#F6F8FB] text-left dark:bg-[#1C2334]">
                            <tr>
                                {["Data", "Titular", "Plano", "Pessoas", "Mensalidade", "Adesão", "Situação", "Contrato"].map((h) => (
                                    <th key={h} className={`px-4 py-3 ${ROTULO}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} onClick={() => setAbertoId(r.id)} className="cursor-pointer border-t border-[#E3E8F0] hover:bg-[#EEF2F7] dark:border-white/12 dark:hover:bg-white/8">
                                    <td className="px-4 py-3 whitespace-nowrap">{dataBR(r.criado_em, true)}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold">{r.titular_nome}</div>
                                        <div className="text-xs text-[#7A8396]">{r.titular_cpf} · {r.cidade}{r.uf ? `-${r.uf}` : ""}</div>
                                    </td>
                                    <td className="px-4 py-3 font-extrabold">{r.plano}</td>
                                    <td className="px-4 py-3">{1 + r.qtd_dependentes + r.qtd_agregados}{r.qtd_agregados ? <span className="text-xs text-[#7A8396]"> ({r.qtd_agregados} agreg.)</span> : null}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{brl(r.valor_mensalidade)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{r.valor_pago != null ? brl(r.valor_pago) : brl(r.valor_adesao)}</td>
                                    <td className="px-4 py-3"><Selo status={r.status} /></td>
                                    <td className="px-4 py-3 font-bold">{r.numero_contrato || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Celular */}
                    <ul className="divide-y divide-[#E3E8F0] lg:hidden dark:divide-white/12">
                        {rows.map((r) => (
                            <li key={r.id}>
                                <button onClick={() => setAbertoId(r.id)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/8">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold">{r.titular_nome}</span>
                                        <span className="font-extrabold">{r.plano}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A8396]">
                                        <Selo status={r.status} />
                                        <span>{dataBR(r.criado_em, true)}</span>
                                        <span>· {brl(r.valor_mensalidade)}/mês</span>
                                        {r.numero_contrato && <span>· Contrato {r.numero_contrato}</span>}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {!carregando && rows.length === 0 && <p className="p-6 text-center text-sm text-[#7A8396]">Nenhuma adesão encontrada.</p>}
                    {carregando && <p className="p-6 text-center text-sm text-[#7A8396]">Carregando…</p>}
                </div>

                {paginas > 1 && (
                    <div className="flex items-center justify-center gap-3">
                        <button className={BTN2} disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                        <span className="text-sm">{pagina} de {paginas}</span>
                        <button className={BTN2} disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
                    </div>
                )}
            </div>

            {abertoId !== null && (
                <Detalhe
                    id={abertoId}
                    onFechar={() => {
                        setAbertoId(null);
                        const u = new URL(window.location.href);
                        if (u.searchParams.has("id")) { u.searchParams.delete("id"); window.history.replaceState(null, "", u.toString()); }
                    }}
                    onMudou={carregar}
                />
            )}
        </div>
    );
}

function Linha2({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E3E8F0] py-2 text-sm last:border-0 dark:border-white/12">
            <span className={ROTULO}>{rotulo}</span>
            <span className="min-w-0 break-words">{children}</span>
        </div>
    );
}

function Detalhe({ id, onFechar, onMudou }: { id: number; onFechar: () => void; onMudou: () => void }) {
    const [montado, setMontado] = useState(false);
    const [c, setC] = useState<Cadastro | null>(null);
    const [erro, setErro] = useState("");
    const [ok, setOk] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [contrato, setContrato] = useState("");
    const [obs, setObs] = useState("");
    const [novaSituacao, setNovaSituacao] = useState<Status | "">("");
    const [motivo, setMotivo] = useState("");

    useEffect(() => setMontado(true), []);
    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);

    const carregar = useCallback(async () => {
        try {
            const j = await apiJson(`${API}?acao=detalhar&id=${id}&_=${Date.now()}`);
            setC(j.cadastro);
            setContrato(j.cadastro.numero_contrato || "");
            setObs(j.cadastro.observacao || "");
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao abrir.");
        }
    }, [id]);
    useEffect(() => { carregar(); }, [carregar]);

    const acao = async (corpo: Record<string, unknown>, msg: string) => {
        setSalvando(true); setErro(""); setOk("");
        try {
            const j = await apiPost({ ...corpo, id });
            setC(j.cadastro);
            setOk(msg);
            setNovaSituacao(""); setMotivo("");
            onMudou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : "Falha ao salvar.");
        } finally {
            setSalvando(false);
        }
    };

    const pessoas = useMemo(() => c?.dependentes || [], [c]);
    if (!montado) return null;

    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(49,60,85,0.45)] lg:items-center lg:p-6" onClick={onFechar}>
            <div
                className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#FFFFFF] text-[#313C55] lg:max-w-4xl lg:rounded-3xl dark:bg-[#232B3F] dark:text-white"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start justify-between gap-3 border-b border-[#E3E8F0] px-5 py-4 dark:border-white/12">
                    <div>
                        <div className={ROTULO}>Adesão {c?.codigo}</div>
                        <h2 className="text-xl font-extrabold">{c ? `${c.titular_nome} · Plano ${c.plano}` : "Carregando…"}</h2>
                        {c && <div className="mt-1"><Selo status={c.status} /></div>}
                    </div>
                    <button className="size-11 rounded-xl text-2xl hover:bg-[#EEF2F7] dark:hover:bg-white/8" onClick={onFechar} aria-label="Fechar">×</button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                    {erro && <div className="rounded-xl bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:bg-[#B42318]/20 dark:text-[#FF9C92]">{erro}</div>}
                    {ok && <div className="rounded-xl bg-[#EEF5D6] p-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/18 dark:text-white">{ok}</div>}
                    {c && (
                        <>
                            {c.status === "pago" && (
                                <div className="rounded-2xl border border-[#E4BC30] bg-[#FCF3CC] p-4 dark:border-[#F2CB3F]/60 dark:bg-[#F2CB3F]/16">
                                    <div className="font-extrabold">Pagamento confirmado. Crie o contrato no UnyPax e informe o número:</div>
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <input className={CAMPO} value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="Número do contrato" />
                                        <button className={BTN} disabled={salvando || !contrato.trim()} onClick={() => acao({ acao: "contrato", numero_contrato: contrato.trim() }, "Contrato informado.")}>
                                            Salvar contrato
                                        </button>
                                    </div>
                                </div>
                            )}

                            <section className="grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className={`${ROTULO} mb-2`}>Plano e valores</h3>
                                    <Linha2 rotulo="Plano">{c.plano}</Linha2>
                                    <Linha2 rotulo="Mensalidade">{brl(c.valor_mensalidade)}{c.valor_agregados > 0 ? ` (inclui ${brl(c.valor_agregados)} de ${c.qtd_agregados_pagos} agregado${c.qtd_agregados_pagos > 1 ? "s" : ""})` : ""}</Linha2>
                                    <Linha2 rotulo="Adesão">{brl(c.valor_adesao)}{c.valor_pago != null ? ` · pago ${brl(c.valor_pago)}` : ""}</Linha2>
                                    <Linha2 rotulo="Pagamento">{c.pago_em ? `${dataBR(c.pago_em, true)} · ${c.pagamento_metodo || ""}` : "Não confirmado"}{c.wc_pedido_id ? ` · pedido #${c.wc_pedido_id}` : ""}</Linha2>
                                    <Linha2 rotulo="Carência">
                                        {c.carencia ? <>Desde {dataBR(c.carencia.inicio, true)}<br />Natural até {dataBR(c.carencia.natural_ate)} · acidente até {dataBR(c.carencia.acidental_ate, true)}</> : "Começa no pagamento"}
                                    </Linha2>
                                    <Linha2 rotulo="Contrato">{c.numero_contrato ? `${c.numero_contrato} · ${c.contrato_por || ""} em ${dataBR(c.contrato_em, true)}` : "—"}</Linha2>
                                </div>
                                <div>
                                    <h3 className={`${ROTULO} mb-2`}>Titular</h3>
                                    <Linha2 rotulo="Nome">{c.titular_nome}</Linha2>
                                    <Linha2 rotulo="CPF">{cpfFmt(c.titular_cpf)}</Linha2>
                                    <Linha2 rotulo="Nascimento">{dataBR(c.titular_nascimento)}</Linha2>
                                    <Linha2 rotulo="Religião">{c.titular_religiao}</Linha2>
                                    <Linha2 rotulo="Celular">
                                        {telFmt(c.titular_celular)}{" "}
                                        {waLink(c.titular_celular, c.titular_nome) && <a className="font-bold underline" href={waLink(c.titular_celular, c.titular_nome)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                                    </Linha2>
                                    <Linha2 rotulo="E-mail">{c.titular_email || "—"}</Linha2>
                                    <Linha2 rotulo="Endereço">
                                        {c.endereco.logradouro}, {c.endereco.numero}{c.endereco.complemento ? ` · ${c.endereco.complemento}` : ""} · {c.endereco.bairro} · {c.endereco.cidade}-{c.endereco.uf}{c.endereco.cep ? ` · CEP ${c.endereco.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}` : ""}
                                    </Linha2>
                                    <Linha2 rotulo="Sucessor">{c.sucessor_nome ? `${c.sucessor_nome}${c.sucessor_cpf ? ` · ${cpfFmt(c.sucessor_cpf)}` : ""}` : "Não indicado"}</Linha2>
                                </div>
                            </section>

                            <section>
                                <h3 className={`${ROTULO} mb-2`}>Família ({pessoas.length})</h3>
                                {pessoas.length === 0 ? (
                                    <p className="text-sm text-[#7A8396]">Só o titular.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-[#E3E8F0] dark:border-white/12">
                                        <table className="w-full min-w-[640px] text-sm">
                                            <thead className="bg-[#F6F8FB] text-left dark:bg-[#1C2334]">
                                                <tr>{["Nome", "Parentesco", "Nascimento", "CPF", "Religião", "Entra como"].map((h) => <th key={h} className={`px-3 py-2 ${ROTULO}`}>{h}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {pessoas.map((p, i) => (
                                                    <tr key={i} className="border-t border-[#E3E8F0] dark:border-white/12">
                                                        <td className="px-3 py-2">{p.nome || <span className="text-[#7A8396]">não informado</span>}</td>
                                                        <td className="px-3 py-2">{p.parentesco_rotulo}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">{dataBR(p.nascimento)} · {p.idade} anos</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">{p.cpf ? cpfFmt(p.cpf) : "—"}</td>
                                                        <td className="px-3 py-2">{p.religiao || "—"}</td>
                                                        <td className="px-3 py-2 font-bold">{c.plano === "FLEX" ? "Incluído" : p.tipo === "dependente" ? "Dependente" : p.paga ? "Agregado (pago)" : "Agregado (sem custo)"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            <section className="grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className={`${ROTULO} mb-2`}>Observação da equipe</h3>
                                    <textarea className={`${CAMPO} h-28 py-2`} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />
                                    <button className={`${BTN2} mt-2`} disabled={salvando} onClick={() => acao({ acao: "observacao", texto: obs }, "Observação salva.")}>Salvar observação</button>
                                </div>
                                <div>
                                    <h3 className={`${ROTULO} mb-2`}>Mudar situação</h3>
                                    <div className="space-y-2">
                                        <select className={CAMPO} value={novaSituacao} onChange={(e) => setNovaSituacao(e.target.value as Status | "")}>
                                            <option value="">Escolha</option>
                                            {(["aguardando_pagamento", "pago", "cancelado"] as Status[]).filter((s) => s !== c.status).map((s) => (
                                                <option key={s} value={s}>{STATUS[s].rotulo}</option>
                                            ))}
                                        </select>
                                        <input className={CAMPO} placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
                                        <button className={BTN2} disabled={salvando || !novaSituacao || !motivo.trim()} onClick={() => acao({ acao: "situacao", status: novaSituacao, motivo: motivo.trim() }, "Situação alterada.")}>
                                            Aplicar
                                        </button>
                                        <p className="text-xs text-[#7A8396]">Use só para corrigir: pagamento feito fora do site, desistência ou estorno.</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className={`${ROTULO} mb-2`}>Histórico</h3>
                                <ol className="space-y-1.5 text-sm">
                                    {[...c.eventos].reverse().map((e, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="w-32 shrink-0 text-[#7A8396]">{dataBR(e.em, true)}</span>
                                            <span>
                                                <strong>{EVENTO_ROTULO[e.tipo] || e.tipo}</strong>
                                                {e.por ? ` · ${e.por}` : ""}
                                                {typeof e.motivo === "string" && e.motivo ? ` · ${e.motivo}` : ""}
                                                {typeof e.msg === "string" ? ` · ${e.msg}` : ""}
                                                {typeof e.numero === "string" ? ` · ${e.numero}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                                <p className="mt-3 text-xs text-[#7A8396]">
                                    Aceite online em {dataBR(c.aceite.em, true)} (versão {c.aceite.versao}){c.aceite.religiao ? " · autorizou o uso da religião" : ""}.{c.origem ? ` Origem: ${c.origem}` : ""}
                                </p>
                            </section>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/12 dark:bg-[#1C2334]">
                    <button className={BTN2} onClick={onFechar}>Voltar</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
