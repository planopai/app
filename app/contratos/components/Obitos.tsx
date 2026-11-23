"use client";

/**
 * Falecimentos a confirmar — falecimento ligado ao atendimento (23/11/2026). Back-end: ct_contratos.php (obitos,
 * obito_confirmar, obito_descartar); as sugestões nascem no os_principal.php, quando a OS de associado é montada.
 * O atendimento não tem CPF do falecido: a sugestão vem do nome e do nascimento, e Contratos confirma ou descarta.
 * Usado na lista de Contratos (todos) e na ficha do contrato (só os dele).
 */
import React, { useState } from "react";
import { BTN_PEQ, BTN_PEQ_PRI, BTN_PRI, BTN_SEC, CARTAO, Janela, NOTA, ROTULO, SUB } from "../../contas-pagar/components/fin";
import { CampoData, Combo, dataValidar, type Gravar, isoParaBR } from "./ct";

export type Obito = {
    id: number;
    atendimento_id: number;
    numero_os: string | null;
    contrato_id: number;
    numero: string;
    titular: string;
    falecido: string | null;
    nascimento: string | null;
    data_falecimento: string | null;
    sugerido_id: number | null;
    criado_em: string;
    beneficiarios: { id: number; tipo: "titular" | "dependente" | "agregado"; nome: string; nascimento: string | null; parentesco: string | null }[];
};

const TIPO: Record<string, string> = { titular: "Titular", dependente: "Dependente", agregado: "Agregado" };

export function AvisoObitos({ obitos, hoje, gravar, onAbrirContrato }: { obitos: Obito[]; hoje: string; gravar: Gravar; onAbrirContrato?: (id: number) => void }) {
    const [aberto, setAberto] = useState<Obito | null>(null);
    if (!obitos.length) return null;
    return (
        <div className={`${CARTAO} flex flex-col gap-3 border-[#F2CB3F] p-4 dark:border-[#F2CB3F]/50`}>
            <div>
                <h3 className="text-[16px] font-extrabold">Falecimentos a confirmar ({obitos.length})</h3>
                <p className={SUB}>Atendimentos funerários do PAI ligados a este{onAbrirContrato ? "s" : ""} contrato{onAbrirContrato ? "s" : ""}. Confira quem faleceu para tirar a pessoa do contrato.</p>
            </div>
            <ul className="flex flex-col gap-2">
                {obitos.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 dark:bg-[#1C2334]">
                        <div className="min-w-0 flex-1 text-[14.5px]">
                            <b className="break-words">{o.falecido || "Falecido sem nome no atendimento"}</b>
                            <div className={SUB}>
                                {onAbrirContrato ? `Contrato ${o.numero} (${o.titular}) · ` : ""}Atendimento nº {o.atendimento_id}
                                {o.numero_os ? ` · OS ${o.numero_os}` : ""}
                                {o.data_falecimento ? ` · falecimento em ${isoParaBR(o.data_falecimento)}` : ""}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {onAbrirContrato ? (
                                <button type="button" className={BTN_PEQ} onClick={() => onAbrirContrato(o.contrato_id)}>
                                    Abrir contrato
                                </button>
                            ) : null}
                            <button type="button" className={BTN_PEQ_PRI} onClick={() => setAberto(o)}>
                                Conferir
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            {aberto ? <JanelaObito o={aberto} hoje={hoje} gravar={gravar} onFechar={() => setAberto(null)} /> : null}
        </div>
    );
}

function JanelaObito({ o, hoje, gravar, onFechar }: { o: Obito; hoje: string; gravar: Gravar; onFechar: () => void }) {
    const sugerido = o.beneficiarios.some((b) => b.id === o.sugerido_id) ? o.sugerido_id : null;
    const [bid, setBid] = useState<number | null>(sugerido);
    const [data, setData] = useState(isoParaBR(o.data_falecimento));
    const [salvando, setSalvando] = useState(false);
    const iso = dataValidar(data, hoje, false)[0];
    const escolhido = o.beneficiarios.find((b) => b.id === bid);
    const enviar = async (acao: "obito_confirmar" | "obito_descartar") => {
        setSalvando(true);
        try {
            const r = await gravar(acao, acao === "obito_confirmar" ? { id: o.id, beneficiario_id: bid, data: iso } : { id: o.id });
            if (r) onFechar();
        } finally {
            setSalvando(false);
        }
    };
    return (
        <Janela
            titulo={`Conferir falecimento: ${o.falecido || "atendimento nº " + o.atendimento_id}`}
            sub={`Contrato ${o.numero} · ${o.titular}`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => void enviar("obito_descartar")}>
                        Não é deste contrato
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!bid || !iso || salvando} onClick={() => void enviar("obito_confirmar")}>
                        {salvando ? "Salvando…" : "Confirmar falecimento"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <span className={ROTULO}>No atendimento</span>
                    <div className="min-h-11 rounded-xl bg-[#F1F4F8] px-3 py-2.5 text-[15px] font-bold break-words dark:bg-[#1C2334]">
                        {o.falecido || "—"}
                        <div className={SUB}>Nascimento: {isoParaBR(o.nascimento) || "não informado"}</div>
                    </div>
                </div>
                <div>
                    <span className={ROTULO}>Atendimento</span>
                    <div className="min-h-11 rounded-xl bg-[#F1F4F8] px-3 py-2.5 text-[15px] font-bold dark:bg-[#1C2334]">
                        <a className="underline" href={`/acompanhamento?editar=${o.atendimento_id}`} target="_blank" rel="noreferrer">
                            Nº {o.atendimento_id}
                        </a>
                        {o.numero_os ? <div className={SUB}>OS {o.numero_os}</div> : null}
                    </div>
                </div>
            </div>
            <div>
                <span className={ROTULO}>Quem faleceu</span>
                {o.beneficiarios.length ? (
                    <Combo
                        rotulo="Quem faleceu"
                        opcoes={o.beneficiarios.map((b) => ({ v: b.id, t: b.nome, s: [TIPO[b.tipo], b.parentesco, b.nascimento ? `nasc. ${isoParaBR(b.nascimento)}` : null].filter(Boolean).join(" · ") }))}
                        valor={bid}
                        onChange={setBid}
                    />
                ) : (
                    <p className={SUB}>Nenhum beneficiário ativo neste contrato.</p>
                )}
                <p className={`${SUB} mt-1`}>{sugerido ? "Sugestão pelo nome e nascimento do atendimento. Confira antes de confirmar." : "Nenhum beneficiário com o mesmo nome: escolha quem faleceu ou use \"Não é deste contrato\"."}</p>
            </div>
            <CampoData valor={data} onChange={setData} hoje={hoje} rotulo="Data do falecimento" rotuloCls={ROTULO} nascimento={false} />
            <div className={NOTA}>
                {escolhido?.tipo === "titular"
                    ? "Titular falecido: a pessoa sai do contrato e o sucessor tem 30 dias para aceitar o contrato (cláusula 7.1)."
                    : "A pessoa sai do contrato (extras e bonificações dela são encerrados) e o falecimento fica no histórico com o número do atendimento."}
            </div>
        </Janela>
    );
}
