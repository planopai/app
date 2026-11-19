"use client";

/**
 * Regras (/contratos-regras, chave contratos-regras) · módulo Contratos — 18/11/2026. Back-end: pl_planos.php.
 * Fase 1 (prévia aprovada em 18/11/2026): regras por tipo (carência, cobrança, situação, cancelamento, reajuste,
 * beneficiários e negociação), com versão "vale a partir de", histórico, "Usada em" e "Vincular a planos".
 * Mudar uma regra aprovada cria versão nova. Regra em configuração é corrigida no lugar.
 * Peças comuns em app/contratos-planos/components/pl.tsx.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconListCheck, IconPencil, IconPlus } from "@tabler/icons-react";
import { TopoPagina } from "@/components/shell/ModuloHub";
import { BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CAMPO, CARTAO, dataBR, ERRO, hojeISO, Janela, NOTA, ROTULO, SUB, useAviso } from "../contas-pagar/components/fin";
import {
    type Dados,
    type Gravar,
    type Regra,
    EditarParametros,
    limparParametros,
    SeloPlano,
    SeloRegra,
    SeloTipo,
    useDados,
    useGravar,
    VerParametros,
    versaoAtual,
} from "../contratos-planos/components/pl";

export default function Page() {
    const { dados, erro, recarregar } = useDados();
    const { avisar, aviso } = useAviso();
    const gravar = useGravar(avisar, recarregar);
    const [sel, setSel] = useState<number | null>(null);
    const [verFicha, setVerFicha] = useState(false);
    const [nova, setNova] = useState(false);
    const [abrirEditor, setAbrirEditor] = useState(false);

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const r = Number(q.get("regra") || 0);
        if (r) {
            setSel(r);
            setVerFicha(true);
        }
        if (q.get("editar")) setAbrirEditor(true);
    }, []);
    useEffect(() => {
        if (dados && (sel === null || !dados.regras.some((r) => r.id === sel)) && dados.regras.length) setSel(dados.regras[0].id);
    }, [dados, sel]);

    const regra = dados?.regras.find((r) => r.id === sel) ?? null;

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconListCheck}
                    titulo="Regras"
                    acoes={
                        dados?.pode_regras ? (
                            <button type="button" className={BTN_PRI} onClick={() => setNova(true)}>
                                <IconPlus size={18} /> Nova regra
                            </button>
                        ) : null
                    }
                />
                <div className={SUB}>Contratos › Configurações › Regras</div>
                {erro ? <div className={ERRO}>{erro}</div> : null}
                {!dados && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
                {dados ? (
                    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                        <nav className={`${CARTAO} h-fit overflow-hidden ${verFicha ? "hidden lg:block" : ""}`} aria-label="Regras">
                            {dados.tipos.map((t) => {
                                const lista = dados.regras.filter((r) => r.tipo === t.k).sort((a, b) => Number(a.situacao === "inativa") - Number(b.situacao === "inativa"));
                                return (
                                    <div key={t.k}>
                                        <div className="px-4 pb-1 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                            {t.nome}
                                            {t.obrigatoria ? "" : " · opcional"}
                                        </div>
                                        {lista.map((r) => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                aria-current={r.id === sel}
                                                onClick={() => {
                                                    setSel(r.id);
                                                    setVerFicha(true);
                                                }}
                                                className={`flex min-h-[56px] w-full flex-col items-start gap-1 border-t border-[#EEF2F7] px-4 py-2.5 text-left dark:border-white/[0.06] ${
                                                    r.id === sel ? "bg-[#E9EFF6] shadow-[inset_3px_0_0_#F2CB3F] dark:bg-[#3D6A99]/20" : ""
                                                } ${r.situacao === "inativa" ? "opacity-60" : ""}`}
                                            >
                                                <b className="break-words text-[15px]">{r.nome}</b>
                                                <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                    <SeloRegra s={r.situacao} />
                                                    {r.usada_em.length ? `${r.usada_em.length} plano(s)` : "Sem plano"}
                                                </span>
                                            </button>
                                        ))}
                                        {!lista.length ? <div className="border-t border-[#EEF2F7] px-4 py-2.5 text-[13.5px] text-[#5B6478] dark:border-white/[0.06]">Nenhuma regra.</div> : null}
                                    </div>
                                );
                            })}
                        </nav>
                        <section className={`${CARTAO} flex min-w-0 flex-col gap-4 p-4 md:p-5 ${verFicha ? "" : "hidden lg:flex"}`}>
                            {regra ? (
                                <Ficha
                                    key={regra.id}
                                    r={regra}
                                    dados={dados}
                                    gravar={gravar}
                                    abrirEditor={abrirEditor}
                                    onEditorAberto={() => setAbrirEditor(false)}
                                    onVoltar={() => setVerFicha(false)}
                                />
                            ) : (
                                <div className="py-8 text-center text-[#5B6478]">Escolha uma regra na lista.</div>
                            )}
                        </section>
                    </div>
                ) : null}
            </div>
            {nova && dados ? (
                <NovaRegra
                    dados={dados}
                    onFechar={() => setNova(false)}
                    gravar={gravar}
                    onCriada={(id) => {
                        setSel(id);
                        setVerFicha(true);
                        setAbrirEditor(true);
                    }}
                />
            ) : null}
            {aviso}
        </div>
    );
}

function Ficha({ r, dados, gravar, abrirEditor, onEditorAberto, onVoltar }: { r: Regra; dados: Dados; gravar: Gravar; abrirEditor: boolean; onEditorAberto: () => void; onVoltar: () => void }) {
    const pode = dados.pode_regras;
    const v = versaoAtual(r);
    const tipo = dados.tipos.find((t) => t.k === r.tipo);
    const usadas = dados.planos.filter((p) => r.usada_em.includes(p.id));
    const corrigeNoLugar = r.situacao === "configuracao";
    const futura = r.versoes.find((x) => x.vale_desde > dados.hoje);
    const [editar, setEditar] = useState(false);
    const [vincular, setVincular] = useState(false);
    const [renomear, setRenomear] = useState(false);
    const [aberta, setAberta] = useState<number | null>(null);

    useEffect(() => {
        if (abrirEditor && pode) {
            setEditar(true);
            onEditorAberto();
        }
    }, [abrirEditor, pode, onEditorAberto]);

    return (
        <>
            <button type="button" className="-ml-1 flex min-h-11 items-center gap-1 self-start text-[14px] font-extrabold lg:hidden" onClick={onVoltar}>
                <IconChevronLeft size={18} /> Regras
            </button>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <SeloTipo nome={tipo?.nome ?? r.tipo} />
                    <SeloRegra s={r.situacao} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-[22px] font-extrabold leading-tight">{r.nome}</h2>
                    {pode ? (
                        <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]" aria-label="Renomear" onClick={() => setRenomear(true)}>
                            <IconPencil size={18} />
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-[14px] dark:bg-[#1C2334]">
                <b>{v ? `Versão ${v.versao}` : "Sem versão"}</b>
                {v ? <span>· vale a partir de {dataBR(v.vale_desde)}</span> : null}
                {futura && futura.versao !== v?.versao ? <span className="font-bold text-[#7A5D00] dark:text-[#F2CB3F]">· versão {futura.versao} entra em {dataBR(futura.vale_desde)}</span> : null}
                <span className="flex-1" />
                {pode ? (
                    <button type="button" className={BTN_PEQ} onClick={() => setEditar(true)}>
                        <IconPencil size={16} /> {corrigeNoLugar ? "Preencher campos" : "Nova versão"}
                    </button>
                ) : null}
            </div>

            <VerParametros tipo={r.tipo} par={v?.parametros ?? {}} />

            {pode ? (
                <div className="flex flex-wrap gap-2">
                    {r.situacao !== "aprovada" ? (
                        <button type="button" className={BTN_PEQ_PRI} onClick={() => void gravar("situacao_regra", { id: r.id, situacao: "aprovada" })}>
                            Aprovar
                        </button>
                    ) : (
                        <button type="button" className={BTN_PEQ} onClick={() => void gravar("situacao_regra", { id: r.id, situacao: "configuracao" })}>
                            Voltar para configuração
                        </button>
                    )}
                    {r.situacao !== "inativa" ? (
                        <button type="button" className={BTN_PEQ} onClick={() => void gravar("situacao_regra", { id: r.id, situacao: "inativa" })}>
                            Inativar
                        </button>
                    ) : null}
                </div>
            ) : null}

            <h3 className="mt-1 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Usada em</h3>
            <div className="flex flex-wrap items-center gap-2">
                {usadas.length ? (
                    usadas.map((p) => (
                        <Link key={p.id} href="/contratos-planos" className="inline-flex min-h-10 items-center rounded-full bg-[#E9EFF6] px-3.5 text-[14px] font-extrabold dark:bg-[#3D6A99]/30">
                            {p.nome}
                        </Link>
                    ))
                ) : (
                    <span className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nenhum plano</span>
                )}
                <span className="flex-1" />
                {pode && r.situacao !== "inativa" ? (
                    <button type="button" className={BTN_PEQ_PRI} onClick={() => setVincular(true)}>
                        Vincular a planos
                    </button>
                ) : null}
            </div>

            <h3 className="mt-1 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Histórico</h3>
            <div className="flex flex-col divide-y divide-[#EEF2F7] rounded-xl border border-[#E3E8F0] dark:divide-white/[0.06] dark:border-white/[0.1]">
                {r.versoes.map((x) => (
                    <div key={x.versao} className="px-3 py-2.5">
                        <button type="button" className="flex min-h-11 w-full flex-wrap items-center gap-x-2 text-left text-[14px]" onClick={() => setAberta(aberta === x.versao ? null : x.versao)} aria-expanded={aberta === x.versao}>
                            <b>v{x.versao}</b>
                            <span>· vale a partir de {dataBR(x.vale_desde)}</span>
                            {x.motivo ? <span className="text-[#5B6478] dark:text-[#AEB9CF]">· {x.motivo}</span> : null}
                            {x.usuario ? <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">· {x.usuario}</span> : null}
                        </button>
                        {aberta === x.versao ? (
                            <div className="pb-1 pt-2">
                                <VerParametros tipo={r.tipo} par={x.parametros} />
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
            <div className={NOTA}>
                Mudar uma regra aprovada cria uma nova versão com a data em que passa a valer. A carência fica com a versão da adesão de cada contrato; cobrança, situação e reajuste seguem a versão em vigor.
            </div>

            {editar ? <EditarVersao r={r} corrigeNoLugar={corrigeNoLugar} onFechar={() => setEditar(false)} gravar={gravar} hoje={dados.hoje} /> : null}
            {vincular ? <Vincular r={r} dados={dados} onFechar={() => setVincular(false)} gravar={gravar} /> : null}
            {renomear ? <Renomear r={r} onFechar={() => setRenomear(false)} gravar={gravar} /> : null}
        </>
    );
}

function EditarVersao({ r, corrigeNoLugar, onFechar, gravar, hoje }: { r: Regra; corrigeNoLugar: boolean; onFechar: () => void; gravar: Gravar; hoje: string }) {
    const atual = r.versoes[0] ?? null; // parte da versão mais nova
    const [par, setPar] = useState<Record<string, any>>({ ...(atual?.parametros ?? {}) });
    const [desde, setDesde] = useState(corrigeNoLugar ? (atual?.vale_desde ?? hoje) : hoje > (atual?.vale_desde ?? "") ? hoje : (atual?.vale_desde ?? hoje));
    const [motivo, setMotivo] = useState("");
    const [ocupado, setOcupado] = useState(false);
    return (
        <Janela
            titulo={corrigeNoLugar ? `Campos de ${r.nome}` : `Nova versão de ${r.nome}`}
            sub={corrigeNoLugar ? "Regra em configuração: a correção fica na mesma versão." : `Cria a versão ${(atual?.versao ?? 0) + 1}. As anteriores ficam no histórico.`}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("versao", { regra_id: r.id, vale_desde: desde, parametros: limparParametros(r.tipo, par), motivo });
                            setOcupado(false);
                            if (j) onFechar();
                        }}
                    >
                        {ocupado ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                    <label className={ROTULO}>Vale a partir de</label>
                    <input type="date" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Motivo{corrigeNoLugar ? " (opcional)" : ""}</label>
                    <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: termos novos aprovados pelo jurídico" />
                </div>
            </div>
            <EditarParametros tipo={r.tipo} par={par} setPar={setPar} />
        </Janela>
    );
}

function Vincular({ r, dados, onFechar, gravar }: { r: Regra; dados: Dados; onFechar: () => void; gravar: Gravar }) {
    const [marc, setMarc] = useState<number[]>(r.usada_em);
    const [ocupado, setOcupado] = useState(false);
    const nomeTipo = dados.tipos.find((t) => t.k === r.tipo)?.nome ?? r.tipo;
    return (
        <Janela
            titulo={`Vincular "${r.nome}"`}
            sub={`Marque os planos que usam esta regra de ${nomeTipo.toLowerCase()}. Cada plano tem uma regra por tipo: marcar troca a que ele tem hoje.`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("vincular", { regra_id: r.id, plano_ids: marc });
                            setOcupado(false);
                            if (j) onFechar();
                        }}
                    >
                        {ocupado ? "Salvando…" : "Salvar vínculos"}
                    </button>
                </>
            }
        >
            <div className="flex flex-col divide-y divide-[#EEF2F7] dark:divide-white/[0.06]">
                {dados.planos.map((p) => {
                    const hoje = p.vagas[r.tipo];
                    const outra = hoje && hoje !== r.id ? dados.regras.find((x) => x.id === hoje)?.nome : null;
                    const on = marc.includes(p.id);
                    return (
                        <label key={p.id} className="flex min-h-[52px] cursor-pointer items-start gap-3 py-3">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-5 w-5 shrink-0 accent-[#313C55]"
                                checked={on}
                                onChange={(e) => setMarc((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
                            />
                            <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2">
                                    <b className="text-[15px]">{p.nome}</b>
                                    <SeloPlano p={p} />
                                </span>
                                <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{hoje === r.id ? "Usa esta regra" : outra ? `Hoje: ${outra}` : "Sem regra deste tipo"}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </Janela>
    );
}

function Renomear({ r, onFechar, gravar }: { r: Regra; onFechar: () => void; gravar: Gravar }) {
    const [nome, setNome] = useState(r.nome);
    const [ocupado, setOcupado] = useState(false);
    return (
        <Janela
            titulo="Renomear regra"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("regra", { id: r.id, nome });
                            setOcupado(false);
                            if (j) onFechar();
                        }}
                    >
                        {ocupado ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div>
                <label className={ROTULO}>Nome</label>
                <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
        </Janela>
    );
}

function NovaRegra({ dados, onFechar, gravar, onCriada }: { dados: Dados; onFechar: () => void; gravar: Gravar; onCriada: (id: number) => void }) {
    const [tipo, setTipo] = useState(dados.tipos[0]?.k ?? "carencia");
    const [nome, setNome] = useState("");
    const [desde, setDesde] = useState(hojeISO());
    const [ocupado, setOcupado] = useState(false);
    return (
        <Janela
            titulo="Nova regra"
            sub="A regra nasce em configuração. Depois de criar, preencha os campos do tipo e aprove."
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const j = await gravar("regra", { tipo, nome, vale_desde: desde, parametros: {} });
                            setOcupado(false);
                            if (j?.dados?.id) {
                                onFechar();
                                onCriada(j.dados.id);
                            }
                        }}
                    >
                        {ocupado ? "Criando…" : "Criar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                    <label className={ROTULO}>Tipo</label>
                    <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                        {dados.tipos.map((t) => (
                            <option key={t.k} value={t.k}>
                                {t.nome}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={ROTULO}>Vale a partir de</label>
                    <input type="date" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <label className={ROTULO}>Nome</label>
                    <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carência dos planos antigos" />
                </div>
            </div>
        </Janela>
    );
}
