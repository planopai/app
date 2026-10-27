"use client";

/**
 * Associados — detalhe do contrato em abas (27/10/2026).
 * Resumo · Beneficiários · Mensalidades · Acesso ao app.
 * Mesmos dados do contract_detail de antes; as mensalidades vêm de "contas_receber", que já vinha e não era mostrado.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
    IconAlertTriangle,
    IconCalendarDue,
    IconCheck,
    IconCopy,
    IconLock,
    IconMail,
    IconPaw,
    IconPhone,
    IconRefresh,
    IconUser,
    IconUsers,
} from "@tabler/icons-react";
import {
    type BeneficiarioApi,
    type Contract,
    type ContractDetail,
    type Mensalidade,
    beneficiarioHasAccess,
    brl,
    extractBeneficiariosList,
    fmtCpf,
    fmtDateBR,
    fmtDateTimeBR,
    formataFone,
    getBeneficiarioCpf,
    getBeneficiarioTipo,
    haQuanto,
    idade,
    lerMensalidades,
    mergeBeneficiariosLists,
    onlyDigits,
    parseDataLocal,
    pickDependentesFromList,
    pickTitularFromList,
    resumoMensalidades,
    sexoLabel,
    tipoLabel,
} from "./logica";
import { BotaoWhats, BTN_PRI, BTN_SEC, copiar, nomeBonito, SeloAcesso, SeloSituacao, SUAVE } from "./ui";

type Aba = "resumo" | "beneficiarios" | "mensalidades" | "acesso";

const CAIXA = "rounded-2xl border border-[#E3E8F0] bg-white p-4 dark:border-white/[0.1] dark:bg-[#1C2334]";
const TITULO_CAIXA = "mb-3 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-b border-[#EEF1F6] py-2 last:border-b-0 dark:border-white/[0.06]">
            <span className={`shrink-0 text-[13px] ${SUAVE}`}>{rotulo}</span>
            <span className="min-w-0 text-right text-[14px] font-semibold">{children}</span>
        </div>
    );
}

function textoTag(t: any): string {
    if (t == null) return "";
    if (typeof t === "string" || typeof t === "number") return String(t);
    return String(t.nome ?? t.Nome ?? t.descricao ?? t.Descricao ?? t.tag ?? t.Tag ?? "");
}

export function useBeneficiarios(detail: ContractDetail | null) {
    // Mesma regra da tela anterior: junta a lista normalizada com a bruta e marca o acesso pelo access_map.
    return useMemo(() => {
        const merged = mergeBeneficiariosLists(extractBeneficiariosList(detail?.beneficiarios), extractBeneficiariosList(detail?.beneficiario));
        const accessMap = detail?.access_map ?? {};
        return merged.map((item) => {
            const cpf = getBeneficiarioCpf(item);
            const auth = cpf.length === 11 ? accessMap[cpf] ?? null : null;
            return auth ? { ...item, local_auth: auth, has_access: true } : item;
        });
    }, [detail?.beneficiarios, detail?.beneficiario, detail?.access_map]);
}

export function Detalhe({
    contrato,
    detail,
    carregando,
    onRecarregar,
    onAcessoTitular,
    onAcessoBeneficiario,
}: {
    contrato: Contract;
    detail: ContractDetail | null;
    carregando: boolean;
    onRecarregar: () => void;
    onAcessoTitular: () => void;
    onAcessoBeneficiario: (b: BeneficiarioApi) => void;
}) {
    const [aba, setAba] = useState<Aba>("resumo");
    useEffect(() => setAba("resumo"), [contrato.id]);

    const beneficiarios = useBeneficiarios(detail);
    const titular = useMemo(() => pickTitularFromList(beneficiarios), [beneficiarios]);
    const outros = useMemo(() => pickDependentesFromList(beneficiarios), [beneficiarios]);
    const mensalidades = useMemo(() => lerMensalidades(detail?.contas_receber), [detail?.contas_receber]);
    const resumo = useMemo(() => resumoMensalidades(mensalidades), [mensalidades]);
    const tags = useMemo(() => (Array.isArray((detail as any)?.contrato_tags) ? ((detail as any).contrato_tags as any[]).map(textoTag).filter(Boolean) : []), [detail]);

    const cpfTitular = onlyDigits(contrato.cpf_cnpj || "");
    const acessoTitular = detail?.local_auth ?? (cpfTitular ? detail?.access_map?.[cpfTitular] ?? null : null);
    const semDetalhe = !detail && carregando;

    const abas: { k: Aba; r: string; n?: number; alerta?: boolean }[] = [
        { k: "resumo", r: "Resumo" },
        { k: "beneficiarios", r: "Beneficiários", n: outros.length + (titular ? 1 : 0) || undefined },
        { k: "mensalidades", r: "Mensalidades", n: resumo.vencidas.length || undefined, alerta: resumo.vencidas.length > 0 },
        { k: "acesso", r: "Acesso ao app" },
    ];

    const foneCel = formataFone(contrato.celularTitular);
    const foneFixo = formataFone(contrato.foneTitular);

    return (
        <div>
            {/* Abas */}
            <div className="sticky top-0 z-10 border-b border-[#E3E8F0] bg-white px-3 pt-2 dark:border-white/[0.08] dark:bg-[#232B3F] sm:px-5">
                <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
                    {abas.map((a) => (
                        <button
                            key={a.k}
                            type="button"
                            role="tab"
                            aria-selected={aba === a.k}
                            onClick={() => setAba(a.k)}
                            className={[
                                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 text-[14px] font-extrabold transition",
                                aba === a.k
                                    ? "border-[#F2CB3F] text-[#313C55] dark:text-white"
                                    : "border-transparent text-[#5B6478] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:text-white",
                            ].join(" ")}
                        >
                            {a.r}
                            {a.n ? (
                                <span
                                    className={[
                                        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-extrabold",
                                        a.alerta ? "bg-[#B42318] text-white dark:bg-[#FF9C92] dark:text-[#3A1F1D]" : "bg-[#E9EFF6] text-[#313C55] dark:bg-white/[0.1] dark:text-white",
                                    ].join(" ")}
                                >
                                    {a.n}
                                </span>
                            ) : null}
                        </button>
                    ))}
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={onRecarregar}
                        disabled={carregando}
                        aria-label="Atualizar os dados do contrato"
                        title="Atualizar"
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] disabled:opacity-50 dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                    >
                        <IconRefresh size={18} className={carregando ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
                {semDetalhe ? (
                    <div className="space-y-3" aria-hidden="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-14 animate-pulse rounded-2xl bg-[#F1F4F8] dark:bg-white/[0.05]" />
                        ))}
                    </div>
                ) : null}

                {/* ================= RESUMO ================= */}
                {!semDetalhe && aba === "resumo" ? (
                    <>
                        {resumo.vencidas.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setAba("mensalidades")}
                                className="flex w-full items-center gap-3 rounded-2xl border border-[#F3B8B2] bg-[#FDECEA] p-4 text-left text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]"
                            >
                                <IconAlertTriangle size={22} className="shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-extrabold">
                                        {resumo.vencidas.length} {resumo.vencidas.length === 1 ? "mensalidade vencida" : "mensalidades vencidas"} · {brl(resumo.totalVencido)}
                                    </span>
                                    <span className="block text-[13px]">
                                        A mais antiga venceu em {resumo.vencidas[0].vencimento?.toLocaleDateString("pt-BR")} ({resumo.vencidas[0].diasAtraso} dias de atraso). Ver mensalidades
                                    </span>
                                </span>
                            </button>
                        ) : mensalidades.length > 0 ? (
                            <div className="flex items-center gap-3 rounded-2xl border border-[#7BA11A]/40 bg-[#EEF5D6] p-4 text-[#3F5A0A] dark:border-[#B3CE52]/30 dark:bg-[#B3CE52]/10 dark:text-[#CFE38A]">
                                <IconCheck size={22} className="shrink-0" />
                                <span className="text-[14px] font-bold">
                                    Mensalidades em dia.
                                    {resumo.proxima?.vencimento ? ` Próximo vencimento ${resumo.proxima.vencimento.toLocaleDateString("pt-BR")}.` : ""}
                                </span>
                            </div>
                        ) : null}

                        <div className="grid gap-4 lg:grid-cols-2">
                            <section className={CAIXA}>
                                <h3 className={TITULO_CAIXA}>Contrato</h3>
                                <Linha rotulo="Número">{contrato.contrato_numero || contrato.contrato || "—"}</Linha>
                                <Linha rotulo="Situação">
                                    <SeloSituacao situacao={contrato.situacao} />
                                </Linha>
                                <Linha rotulo="Plano">{contrato.plano || "—"}</Linha>
                                {contrato.cobertura ? <Linha rotulo="Cobertura">{contrato.cobertura}</Linha> : null}
                                <Linha rotulo="Cidade">{contrato.cidade ? nomeBonito(contrato.cidade) : "—"}</Linha>
                                <Linha rotulo="Último pagamento">
                                    {contrato.dataultimopagamento ? `${fmtDateBR(contrato.dataultimopagamento)} · ${haQuanto(contrato.dataultimopagamento)}` : "—"}
                                </Linha>
                                {tags.length ? (
                                    <div className="flex flex-wrap gap-1.5 pt-3">
                                        {tags.map((t) => (
                                            <span key={t} className="rounded-lg bg-[#E9EFF6] px-2 py-0.5 text-[12px] font-bold text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-[#DDE3EE]">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </section>

                            <section className={CAIXA}>
                                <h3 className={TITULO_CAIXA}>Titular</h3>
                                <Linha rotulo="Nome">{nomeBonito(titular?.Nome ?? contrato.nome)}</Linha>
                                <Linha rotulo="CPF">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="tabular-nums">{fmtCpf(contrato.cpf_cnpj)}</span>
                                        {cpfTitular ? (
                                            <button
                                                type="button"
                                                onClick={() => void copiar(cpfTitular, "CPF copiado (só números).")}
                                                aria-label="Copiar CPF"
                                                title="Copiar CPF (só números)"
                                                className="grid size-9 place-items-center rounded-lg text-[#5B6478] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                                            >
                                                <IconCopy size={16} />
                                            </button>
                                        ) : null}
                                    </span>
                                </Linha>
                                {titular?.DataNascimento ? (
                                    <Linha rotulo="Nascimento">
                                        {fmtDateBR(titular.DataNascimento)}
                                        {idade(titular.DataNascimento) != null ? ` · ${idade(titular.DataNascimento)} anos` : ""}
                                    </Linha>
                                ) : null}
                                {titular?.Sexo ? <Linha rotulo="Sexo">{sexoLabel(titular.Sexo)}</Linha> : null}
                                {[foneCel, foneFixo]
                                    .filter((f, i, a) => f.texto !== "—" && a.findIndex((x) => x.texto === f.texto) === i)
                                    .map((f, i) => (
                                        <div key={f.texto} className="flex items-center justify-between gap-3 border-b border-[#EEF1F6] py-1.5 last:border-b-0 dark:border-white/[0.06]">
                                            <span className={`text-[13px] ${SUAVE}`}>{i === 0 ? "Telefone" : "Outro telefone"}</span>
                                            <span className="flex items-center gap-2">
                                                <a href={`tel:${onlyDigits(f.texto)}`} className="text-[14px] font-semibold tabular-nums underline-offset-4 hover:underline">
                                                    {f.texto}
                                                </a>
                                                <BotaoWhats numero={f.whats} nome={nomeBonito(contrato.nome)} pequeno />
                                            </span>
                                        </div>
                                    ))}
                                <Linha rotulo="App do associado">
                                    <SeloAcesso tem={!!acessoTitular} />
                                </Linha>
                            </section>
                        </div>
                    </>
                ) : null}

                {/* ================= BENEFICIÁRIOS ================= */}
                {!semDetalhe && aba === "beneficiarios" ? (
                    <>
                        {titular || outros.length ? (
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {[...(titular ? [titular] : []), ...outros].map((b, i) => {
                                    const tipo = getBeneficiarioTipo(b) || (b === titular ? "T" : "");
                                    const cpf = getBeneficiarioCpf(b);
                                    const nasc = b.DataNascimento ?? b.dataNascimento;
                                    const anos = idade(nasc);
                                    const fone = formataFone(b.Telefone ?? b.telefone ?? b.celular);
                                    const Ico = tipo === "P" ? IconPaw : tipo === "T" ? IconUser : IconUsers;
                                    return (
                                        <li key={`${tipo}-${cpf || i}-${b.Nome ?? b.nome ?? ""}`} className={CAIXA}>
                                            <div className="flex items-start gap-3">
                                                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                                    <Ico size={20} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className={`text-[12px] font-extrabold uppercase tracking-wide ${SUAVE}`}>
                                                        {tipoLabel(tipo)}
                                                        {b.GrauParentesco || b.grauParentesco ? ` · ${b.GrauParentesco ?? b.grauParentesco}` : ""}
                                                    </div>
                                                    <div className="truncate text-[15px] font-extrabold">{nomeBonito(b.Nome ?? b.nome)}</div>
                                                    <div className={`mt-0.5 text-[13px] ${SUAVE}`}>
                                                        {[
                                                            nasc ? `${fmtDateBR(nasc)}${anos != null ? ` · ${anos} anos` : ""}` : "",
                                                            b.Sexo || b.sexo ? sexoLabel(b.Sexo ?? b.sexo) : "",
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ") || "—"}
                                                    </div>
                                                    {tipo !== "P" ? (
                                                        <div className={`text-[13px] tabular-nums ${SUAVE}`}>
                                                            CPF {cpf.length === 11 ? fmtCpf(cpf) : <span className="text-[#8A6A00] dark:text-[#F2CB3F]">não informado pela Unypax</span>}
                                                        </div>
                                                    ) : null}
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        {tipo === "P" ? (
                                                            <span className={`text-[12px] ${SUAVE}`}>Pet: sem acesso ao app</span>
                                                        ) : (
                                                            <SeloAcesso tem={tipo === "T" ? !!acessoTitular : beneficiarioHasAccess(b)} />
                                                        )}
                                                    </div>
                                                </div>
                                                {fone.whats ? <BotaoWhats numero={fone.whats} nome={nomeBonito(b.Nome ?? b.nome)} pequeno /> : null}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className={`rounded-2xl bg-[#F6F8FB] p-4 text-[14px] dark:bg-[#1C2334] ${SUAVE}`}>Nenhum beneficiário retornado pela Unypax.</p>
                        )}
                        {detail?.beneficiario_error ? (
                            <p className="rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-3.5 py-2.5 text-[13px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                                {detail.beneficiario_error}
                            </p>
                        ) : null}
                    </>
                ) : null}

                {/* ================= MENSALIDADES ================= */}
                {!semDetalhe && aba === "mensalidades" ? <AbaMensalidades lista={mensalidades} carregado={!!detail} /> : null}

                {/* ================= ACESSO AO APP ================= */}
                {!semDetalhe && aba === "acesso" ? (
                    <>
                        <p className={`text-[14px] ${SUAVE}`}>
                            Quem tem acesso entra no app do associado com o CPF e a senha. O titular, os dependentes e os agregados podem ter acesso; pets, não.
                        </p>
                        <ul className="space-y-3">
                            <PessoaAcesso
                                tipo="Titular"
                                nome={nomeBonito(titular?.Nome ?? contrato.nome)}
                                cpf={cpfTitular}
                                auth={acessoTitular}
                                podeCriar={cpfTitular.length === 11}
                                onAcao={onAcessoTitular}
                            />
                            {outros
                                .filter((b) => getBeneficiarioTipo(b) !== "P")
                                .map((b, i) => {
                                    const cpf = getBeneficiarioCpf(b);
                                    return (
                                        <PessoaAcesso
                                            key={`${cpf || i}-${b.Nome ?? b.nome ?? ""}`}
                                            tipo={tipoLabel(getBeneficiarioTipo(b))}
                                            nome={nomeBonito(b.Nome ?? b.nome)}
                                            cpf={cpf}
                                            auth={b.local_auth ?? null}
                                            temAcesso={beneficiarioHasAccess(b)}
                                            podeCriar={cpf.length === 11}
                                            motivo={cpf.length !== 11 ? "A Unypax não informou o CPF desta pessoa." : undefined}
                                            onAcao={() => onAcessoBeneficiario(b)}
                                        />
                                    );
                                })}
                        </ul>
                    </>
                ) : null}
            </div>
        </div>
    );
}

/* ---------------- Mensalidades ---------------- */

function AbaMensalidades({ lista, carregado }: { lista: Mensalidade[]; carregado: boolean }) {
    const r = useMemo(() => resumoMensalidades(lista), [lista]);
    const [verPagas, setVerPagas] = useState(6);

    if (carregado && lista.length === 0) {
        return (
            <p className={`rounded-2xl bg-[#F6F8FB] p-4 text-[14px] dark:bg-[#1C2334] ${SUAVE}`}>
                A Unypax não devolveu mensalidades para este contrato.
            </p>
        );
    }

    return (
        <>
            <div className="grid grid-cols-3 gap-3">
                <Numero rotulo="Vencidas" valor={String(r.vencidas.length)} sub={r.vencidas.length ? brl(r.totalVencido) : "nenhuma"} alerta={r.vencidas.length > 0} />
                <Numero rotulo="A vencer" valor={String(r.abertas.length)} sub={r.proxima?.vencimento ? `próx. ${r.proxima.vencimento.toLocaleDateString("pt-BR")}` : "—"} />
                <Numero rotulo="Pagas" valor={String(r.pagas.length)} sub="no histórico consultado" />
            </div>

            {r.vencidas.length ? (
                <section>
                    <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#B42318] dark:text-[#FF9C92]">Vencidas</h3>
                    <ListaMensalidades itens={r.vencidas} />
                </section>
            ) : null}
            {r.abertas.length ? (
                <section>
                    <h3 className={TITULO_CAIXA}>A vencer</h3>
                    <ListaMensalidades itens={r.abertas} />
                </section>
            ) : null}
            {r.pagas.length ? (
                <section>
                    <h3 className={TITULO_CAIXA}>Pagas</h3>
                    <ListaMensalidades itens={r.pagas.slice(0, verPagas)} />
                    {r.pagas.length > verPagas ? (
                        <button type="button" onClick={() => setVerPagas((n) => n + 12)} className={`${BTN_SEC} mt-2 w-full`}>
                            Ver mais pagas ({r.pagas.length - verPagas})
                        </button>
                    ) : null}
                </section>
            ) : null}
            <p className={`text-[12px] ${SUAVE}`}>
                Dados da Unypax no momento em que o contrato foi aberto. Para gerar link de pagamento ou Pix, use o Messenger (painel do cliente).
            </p>
        </>
    );
}

function Numero({ rotulo, valor, sub, alerta }: { rotulo: string; valor: string; sub?: string; alerta?: boolean }) {
    return (
        <div
            className={[
                "rounded-2xl border p-3",
                alerta
                    ? "border-[#F3B8B2] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]"
                    : "border-[#E3E8F0] bg-white dark:border-white/[0.1] dark:bg-[#1C2334]",
            ].join(" ")}
        >
            <div className={`text-[11px] font-extrabold uppercase tracking-[0.06em] ${alerta ? "" : SUAVE}`}>{rotulo}</div>
            <div className="mt-0.5 text-[22px] font-extrabold leading-tight">{valor}</div>
            {sub ? <div className={`truncate text-[12px] ${alerta ? "" : SUAVE}`}>{sub}</div> : null}
        </div>
    );
}

function ListaMensalidades({ itens }: { itens: Mensalidade[] }) {
    return (
        <ul className="divide-y divide-[#EEF1F6] overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:divide-white/[0.06] dark:border-white/[0.1] dark:bg-[#1C2334]">
            {itens.map((m) => {
                const cor =
                    m.situacao === "vencida"
                        ? "text-[#B42318] dark:text-[#FF9C92]"
                        : m.situacao === "paga"
                          ? "text-[#4D6B0E] dark:text-[#CFE38A]"
                          : m.situacao === "cancelada"
                            ? "text-[#7A8396] line-through"
                            : "text-[#313C55] dark:text-white";
                const legenda =
                    m.situacao === "vencida"
                        ? `${m.diasAtraso} ${m.diasAtraso === 1 ? "dia" : "dias"} de atraso`
                        : m.situacao === "paga"
                          ? m.pagamento
                              ? `Paga em ${m.pagamento.toLocaleDateString("pt-BR")}`
                              : "Paga"
                          : m.situacao === "cancelada"
                            ? "Cancelada"
                            : "Em aberto";
                return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                        <IconCalendarDue size={18} className={`shrink-0 ${cor}`} />
                        <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-bold">
                                Vence {m.vencimento ? m.vencimento.toLocaleDateString("pt-BR") : "—"}
                                {m.parcela && m.parcela !== "Mensalidade" ? <span className={`ml-1.5 font-semibold ${SUAVE}`}>· {m.parcela}</span> : null}
                            </div>
                            <div className={`text-[12px] font-semibold ${cor}`}>{legenda}</div>
                        </div>
                        <div className={`text-right text-[14px] font-extrabold tabular-nums ${cor}`}>
                            {m.valor != null ? brl(m.valor) : "—"}
                            {m.situacao === "paga" && m.valorPago != null && m.valor != null && Math.abs(m.valorPago - m.valor) > 0.009 ? (
                                <div className={`text-[11px] font-semibold ${SUAVE}`}>pago {brl(m.valorPago)}</div>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/* ---------------- Acesso ao app ---------------- */

function PessoaAcesso({
    tipo,
    nome,
    cpf,
    auth,
    temAcesso,
    podeCriar,
    motivo,
    onAcao,
}: {
    tipo: string;
    nome: string;
    cpf: string;
    auth: any;
    temAcesso?: boolean;
    podeCriar: boolean;
    motivo?: string;
    onAcao: () => void;
}) {
    const tem = temAcesso ?? !!auth;
    const bloqueio = auth?.bloqueado_ate ? parseDataLocal(auth.bloqueado_ate) : null;
    const bloqueadoAgora = !!bloqueio && bloqueio.getTime() > Date.now();
    return (
        <li className={CAIXA}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-extrabold uppercase tracking-wide ${SUAVE}`}>{tipo}</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold">{nome}</span>
                        <SeloAcesso tem={tem} />
                        {bloqueadoAgora ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-[#FDECEA] px-2 py-0.5 text-[12px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                                <IconLock size={13} />
                                Bloqueado até {fmtDateTimeBR(auth.bloqueado_ate)}
                            </span>
                        ) : null}
                    </div>
                    <div className={`text-[13px] tabular-nums ${SUAVE}`}>CPF {cpf.length === 11 ? fmtCpf(cpf) : "não informado"}</div>
                    {auth ? (
                        <div className="mt-2 grid gap-1 text-[13px]">
                            <span className="flex items-center gap-1.5">
                                <IconMail size={15} className="shrink-0 text-[#7A8396]" />
                                <span className="truncate">{auth.email || "—"}</span>
                                {auth.email_verificado ? <span className="font-bold text-[#4D6B0E] dark:text-[#CFE38A]">· confirmado</span> : null}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <IconPhone size={15} className="shrink-0 text-[#7A8396]" />
                                <span className="tabular-nums">{formataFone(auth.telefone).texto}</span>
                                {auth.telefone_verificado ? <span className="font-bold text-[#4D6B0E] dark:text-[#CFE38A]">· confirmado</span> : null}
                            </span>
                            <span className={SUAVE}>
                                Último login: {auth.ultimo_login ? `${fmtDateTimeBR(auth.ultimo_login)} (${haQuanto(auth.ultimo_login)})` : "ainda não entrou"}
                                {Number(auth.tentativas) > 0 ? ` · ${auth.tentativas} tentativa(s) com senha errada` : ""}
                            </span>
                        </div>
                    ) : null}
                    {motivo ? <div className="mt-1 text-[13px] text-[#8A6A00] dark:text-[#F2CB3F]">{motivo}</div> : null}
                </div>
                <button type="button" onClick={onAcao} disabled={!podeCriar} className={`${tem ? BTN_SEC : BTN_PRI} w-full sm:w-auto`}>
                    <IconLock size={17} />
                    {tem ? "Atualizar acesso" : "Criar acesso"}
                </button>
            </div>
        </li>
    );
}
