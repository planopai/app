"use client";

/**
 * Propostas de adesão (19/10/2026) — rota /messenger-propostas
 * Vendas fechadas pela Aurora/consultor no WhatsApp: o cliente preenche a ficha (adesao.php, fora do WhatsApp) e o
 * Administrativo lança na Unymos pela ficha abaixo (mesma ordem da tela de cadastro), depois marca "Cadastrada" com o contrato.
 * Acesso: página "associados" (quem cadastra associados) ou Gestão. Servidor: messenger.php (propostas, proposta, proposta_decidir).
 */
import React, { useCallback, useEffect, useState } from "react";
import { msgGet, msgPost } from "@/components/messenger/api";

type Linha = { id: number; conversa_id: number | null; nome: string | null; telefone: string | null; plano: string; status: string; contrato: string | null; origem: string | null; mensalidade: number; adesao: number; criado_em: string; ficha_em: string | null; vencida: boolean };
type Detalhe = Linha & { resumo: any; ficha: any; decidido_em: string | null; decidido_por: string | null };

const STATUS: Record<string, [string, string]> = {
    ficha_preenchida: ["Ficha preenchida · lançar", "bg-[#FBF0C9] text-[#5C4600]"],
    aguardando_ficha: ["Aguardando a ficha", "bg-[#E9EFF6] text-[#1E3A5C]"],
    cadastrada: ["Cadastrada na Unymos", "bg-[#EEF5D6] text-[#2F4207]"],
    desistiu: ["Desistiu", "bg-[#F0F2F5] text-[#4A5468]"],
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dataBr = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || "");

function Campo({ rotulo, valor }: { rotulo: string; valor?: string | number | null }) {
    const v = valor === null || valor === undefined ? "" : String(valor);
    return (
        <div className="min-w-0">
            <div className="text-[12px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</div>
            <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{v || "—"}</span>
                {v && <button type="button" className="rounded-md border border-[#E1E5EC] px-1.5 text-[11.5px] font-extrabold print:hidden dark:border-white/15" onClick={() => navigator.clipboard?.writeText(v)} title="Copiar">copiar</button>}
            </div>
        </div>
    );
}

export default function PropostasPage() {
    const [lista, setLista] = useState<Linha[] | null>(null);
    const [filtro, setFiltro] = useState("");
    const [sel, setSel] = useState<Detalhe | null>(null);
    const [erro, setErro] = useState("");
    const [aviso, setAviso] = useState("");
    const [contrato, setContrato] = useState("");
    const carregar = useCallback(async () => {
        try {
            setLista(await msgGet<Linha[]>("propostas", filtro ? { status: filtro } : {}));
            setErro("");
        } catch (e: any) {
            setErro(e.message);
        }
    }, [filtro]);
    useEffect(() => {
        carregar();
    }, [carregar]);
    const abrir = async (id: number) => {
        try {
            setSel(await msgGet<Detalhe>("proposta", { id }));
            setContrato("");
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const decidir = async (decisao: "cadastrada" | "desistiu") => {
        if (!sel) return;
        if (decisao === "desistiu" && !window.confirm("Marcar esta proposta como desistência?")) return;
        try {
            const r = await msgPost("proposta_decidir", { id: sel.id, decisao, contrato });
            setAviso(r.msg);
            await abrir(sel.id);
            carregar();
        } catch (e: any) {
            setErro(e.message);
        }
    };
    const f = sel?.ficha;
    const t = f?.titular || {};
    const e = f?.endereco || {};
    const calc = sel?.resumo?.calculo;
    return (
        <div className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-8 print:bg-white print:p-0 dark:bg-[#1C2334] dark:text-white">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
                <div className="print:hidden">
                    <h1 className="m-0 text-2xl font-extrabold md:text-[30px]">Propostas de adesão</h1>
                    <p className="mt-1 text-[15px] text-[#5B6478] dark:text-[#AEB9CF]">Vendas fechadas pelo WhatsApp. Com a ficha preenchida, lance na Unymos (os campos estão na mesma ordem da tela de cadastro) e marque como cadastrada.</p>
                </div>
                {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] print:hidden">{erro}</div>}
                {aviso && <div className="rounded-xl border border-[#B3CE52] bg-[#EEF5D6] px-4 py-2 text-sm font-bold text-[#2F4207] print:hidden">{aviso}</div>}
                <div className="flex flex-wrap gap-2 print:hidden">
                    {[["", "Todas"], ["ficha_preenchida", "Para lançar"], ["aguardando_ficha", "Aguardando ficha"], ["cadastrada", "Cadastradas"], ["desistiu", "Desistências"]].map(([k, n]) => (
                        <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k} className={`h-10 rounded-full px-4 text-[14.5px] ${filtro === k ? "bg-[#E3EFC0] font-extrabold text-[#2F4207]" : "bg-white font-bold dark:bg-[#232B3F]"}`}>{n}</button>
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <section className="rounded-2xl border border-[#E1E5EC] bg-white p-2 print:hidden dark:border-white/12 dark:bg-[#232B3F]">
                        {!lista && <p className="p-4">Carregando…</p>}
                        {lista && !lista.length && <p className="p-4 text-[#6B7488]">Nenhuma proposta.</p>}
                        {(lista || []).map((p) => (
                            <button key={p.id} type="button" onClick={() => abrir(p.id)} className={`flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-[#F0F2F5] dark:hover:bg-white/5 ${sel?.id === p.id ? "bg-[#F0F2F5] dark:bg-white/10" : ""}`}>
                                <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-[15.5px]">{p.nome || p.telefone || "Sem nome"}</b><span className="rounded-full bg-[#313C55] px-2 py-0.5 text-[11.5px] font-extrabold text-white">{p.plano}</span></span>
                                <span className="flex flex-wrap items-center gap-2 text-[13px]"><span className={`rounded-lg px-2 py-0.5 font-extrabold ${STATUS[p.status]?.[1] || ""}`}>{p.vencida ? "Link vencido" : STATUS[p.status]?.[0] || p.status}</span>{p.mensalidade > 0 && <span>{brl(p.mensalidade)}/mês</span>}<span className="text-[#6B7488]">{dt(p.ficha_em || p.criado_em)}</span></span>
                            </button>
                        ))}
                    </section>
                    <section className="rounded-2xl border border-[#E1E5EC] bg-white p-5 print:border-0 print:p-0 dark:border-white/12 dark:bg-[#232B3F]">
                        {!sel && <p className="text-[#6B7488]">Escolha uma proposta.</p>}
                        {sel && (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="m-0 flex-1 text-xl font-extrabold">Adesão · plano {sel.plano}</h2>
                                    <span className={`rounded-lg px-2 py-0.5 text-[13px] font-extrabold ${STATUS[sel.status]?.[1] || ""}`}>{STATUS[sel.status]?.[0]}</span>
                                    <button type="button" onClick={() => window.print()} className="h-10 rounded-xl border border-[#C9D1DE] px-3 text-sm font-bold print:hidden">Imprimir ficha</button>
                                    {sel.conversa_id && <a href={`/messenger?conversa=${sel.conversa_id}`} className="h-10 rounded-xl border border-[#C9D1DE] px-3 text-sm font-bold leading-10 print:hidden">Abrir conversa</a>}
                                </div>
                                {calc && <div className="rounded-xl bg-[#F6F8FB] p-3 text-[14.5px] dark:bg-white/5">Adesão <b>{brl(calc.adesao)}</b> · Mensalidade <b>{brl(calc.mensalidade)}</b>{(calc.composicao || []).length > 1 ? ` (${calc.composicao.map((l: any) => `${l.item} ${brl(l.valor)}`).join(" + ")})` : ""}{f?.vencimento ? ` · vencimento todo dia ${f.vencimento}` : ""}{sel.origem ? ` · origem: ${sel.origem}` : ""}</div>}
                                {!f && <p className="text-[15px]">O cliente ainda não preencheu a ficha. {sel.resumo?.venda?.nomes?.length ? `Pessoas citadas na conversa: ${sel.resumo.venda.nomes.join(", ")}.` : ""}</p>}
                                {f && (
                                    <>
                                        <div><div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-[#3D6A99]">Titular</div>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <Campo rotulo="Nome" valor={t.nome} /><Campo rotulo="CPF" valor={t.cpf} /><Campo rotulo="RG / órgão" valor={[t.rg, t.orgao].filter(Boolean).join(" ")} />
                                                <Campo rotulo="Sexo" valor={t.sexo === "F" ? "Feminino" : t.sexo === "M" ? "Masculino" : t.sexo} /><Campo rotulo="Data de nascimento" valor={dataBr(t.nascimento)} /><Campo rotulo="Estado civil" valor={t.estado_civil} />
                                                <Campo rotulo="Naturalidade" valor={t.naturalidade} /><Campo rotulo="Nacionalidade" valor={t.nacionalidade} /><Campo rotulo="Profissão" valor={t.profissao} />
                                                <Campo rotulo="E-mail" valor={t.email} /><Campo rotulo="Nome do pai" valor={t.pai} /><Campo rotulo="Nome da mãe" valor={t.mae} />
                                            </div></div>
                                        <div><div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-[#3D6A99]">Endereço residencial</div>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <Campo rotulo="CEP" valor={e.cep} /><Campo rotulo="Endereço" valor={e.rua} /><Campo rotulo="Nº" valor={e.numero} />
                                                <Campo rotulo="Complemento" valor={e.complemento} /><Campo rotulo="Cidade" valor={[e.cidade, e.uf].filter(Boolean).join(" - ")} /><Campo rotulo="Bairro" valor={e.bairro} />
                                                <Campo rotulo="Ponto de referência" valor={e.referencia} /><Campo rotulo="Celular / WhatsApp" valor={f.celular} /><Campo rotulo="Telefone" valor={f.telefone} />
                                            </div></div>
                                        <div><div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-[#3D6A99]">Endereço de cobrança</div>
                                            {f.cobranca?.igual ? <p className="text-[15px]">O mesmo do residencial.</p> : (
                                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Campo rotulo="CEP" valor={f.cobranca?.cep} /><Campo rotulo="Endereço" valor={f.cobranca?.rua} /><Campo rotulo="Nº" valor={f.cobranca?.numero} /><Campo rotulo="Bairro" valor={f.cobranca?.bairro} /><Campo rotulo="Cidade" valor={[f.cobranca?.cidade, f.cobranca?.uf].filter(Boolean).join(" - ")} /><Campo rotulo="Complemento" valor={f.cobranca?.complemento} /></div>
                                            )}</div>
                                        <div><div className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-[#3D6A99]">Dependentes · {(f.beneficiarios || []).length}</div>
                                            {(f.beneficiarios || []).map((b: any, i: number) => (
                                                <div key={i} className="mb-2 grid gap-3 rounded-xl border border-[#EEF0F3] p-3 sm:grid-cols-2 lg:grid-cols-5 dark:border-white/10">
                                                    <Campo rotulo="Nome" valor={b.nome} /><Campo rotulo="Parentesco" valor={b.parentesco} /><Campo rotulo="Nascimento" valor={dataBr(b.nascimento)} /><Campo rotulo="Sexo" valor={b.sexo} /><Campo rotulo="CPF" valor={b.cpf} />
                                                </div>
                                            ))}
                                            {!(f.beneficiarios || []).length && <p className="text-[15px]">Nenhum dependente informado.</p>}</div>
                                        <p className="text-[12.5px] text-[#5B6478]">Aceite LGPD em {dt(f.aceite_em)}{sel.status === "cadastrada" ? " · CPF e RG mascarados depois do cadastro" : ""}.</p>
                                    </>
                                )}
                                {(sel.status === "ficha_preenchida" || sel.status === "aguardando_ficha") && (
                                    <div className="flex flex-wrap items-end gap-2 border-t border-[#EEF0F3] pt-4 print:hidden dark:border-white/10">
                                        <label className="block min-w-[220px] flex-1"><span className="text-[12.5px] font-extrabold uppercase text-[#5B6478]">Número do contrato na Unymos</span><input className="mt-1 h-11 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[15px] dark:border-white/15 dark:bg-[#1C2334]" value={contrato} onChange={(ev) => setContrato(ev.target.value)} placeholder="Ex.: 000123" /></label>
                                        <button type="button" disabled={!f || !contrato.trim()} onClick={() => decidir("cadastrada")} className="h-11 rounded-xl bg-[#4C9A2A] px-4 text-[14.5px] font-extrabold text-white disabled:opacity-50">Marcar como cadastrada</button>
                                        <button type="button" onClick={() => decidir("desistiu")} className="h-11 rounded-xl border border-[#C9D1DE] px-4 text-[14.5px] font-extrabold text-[#B42318]">Desistiu</button>
                                    </div>
                                )}
                                {sel.status === "cadastrada" && <p className="text-[15px] font-bold text-[#2F4207]">Contrato {sel.contrato} · cadastrado por {sel.decidido_por || "—"} em {dt(sel.decidido_em)}. Cobre a adesão pelo painel do cliente na conversa.</p>}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
