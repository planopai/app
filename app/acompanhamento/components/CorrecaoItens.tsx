"use client";

/**
 * app/acompanhamento/components/CorrecaoItens.tsx (18/11/2026)
 *
 * Correções › Corrigir itens. A tela de itens do atendimento (Wizard, aba Itens) abre em "modo correção":
 * - cada item mostra o ANTES (o que está lançado) acima do campo, que é o DEPOIS (a correção);
 * - ao salvar, abre a revisão: lista do que mudou, o que volta para o estoque e o que sai (prévia do
 *   correcoes.php, sem gravar nada) e o motivo (obrigatório, vai para o histórico e para o estoque).
 *
 * Quem grava é o mesmo Editar registro de sempre (informativo.php): o estoque é acertado só no que mudou
 * (estq_corrigir_baixa_atendimento). A OS é recalculada logo depois, como em toda edição.
 */

import { useEffect, useState } from "react";

import { correcoesJson } from "@/components/correcoes/api";

import Modal from "./Modal";

type Dic = Record<string, any>;

export type CorrecaoAntes = {
    /** O registro como estava ao abrir a correção. */
    registro: Dic;
    /** Campos da OS (Prefeitura, terceirizado, translado) como estavam; null enquanto não carregou. */
    os: Dic | null;
};

export type MudancaCorrecao = { rotulo: string; antes: string; depois: string };

/* -------------------------------------------------------------------------- */
/* Textos do "Antes"                                                          */
/* -------------------------------------------------------------------------- */

const txt = (v: unknown) => String(v ?? "").trim();
const simNao = (v: unknown) => {
    const t = txt(v).toLowerCase();
    if (["sim", "s", "1", "true"].includes(t)) return "Sim";
    if (["não", "nao", "n", "0", "false"].includes(t)) return "Não";
    return txt(v);
};
const comLocal = (item: string, local: string) => (item ? (local ? `${item} · ${local}` : item) : "");

/** Item de estoque com Sim/Não (véu, cordão, invol). */
function itemSimNao(r: Dic, campo: string, item: string, dep: string): string {
    const sn = simNao(r[campo]);
    if (sn !== "Sim") return sn || "Não informado";
    return comLocal(txt(r[item]) || "Sim", txt(r[dep])) || "Sim";
}

function prefeitura(os: Dic | null, campo: string): string {
    if (!os) return "";
    const v = simNao(os[campo]);
    return v ? `Prefeitura autorizou: ${v}` : "";
}
function terceirizado(os: Dic | null, campo: string): string {
    if (!os) return "";
    return simNao(os[campo]) === "Sim" ? "Feito por terceirizado" : "";
}
const juntar = (...p: string[]) => p.filter(Boolean).join(" · ");

/** Texto do "Antes" de cada item, pelo id do passo principal no Wizard. null = o passo não tem caixa. */
export function textoAntes(stepId: string, a: CorrecaoAntes): string | null {
    const r = a.registro || {};
    const os = a.os;
    switch (stepId) {
        case "urna":
            return comLocal(txt(r.urna), txt(r.urna_deposito_nome)) || "Sem urna";
        case "roupa":
            return comLocal(txt(r.roupa), txt(r.roupa_deposito_nome)) || "Sem roupa";
        case "veu":
            return itemSimNao(r, "veu", "veu_item", "veu_deposito_nome");
        case "cordao":
            return itemSimNao(r, "cordao", "cordao_item", "cordao_deposito_nome");
        case "invol":
            return itemSimNao(r, "invol", "invol_item", "invol_deposito_nome");
        case "tanato": {
            const sn = simNao(r.tanato) || "Não informado";
            return sn === "Sim" ? juntar("Sim", prefeitura(os, "tanato_autorizado_prefeitura"), terceirizado(os, "tanato_terceirizado")) : sn;
        }
        case "ornamentacao": {
            const sn = simNao(r.ornamentacao) || "Não informado";
            return sn === "Sim" ? juntar("Sim", txt(r.ornamentacao_tipo)) : sn;
        }
        case "kit_lanche":
            return simNao(r.kit_lanche) || "Não informado";
        case "coroa_flores": {
            const sn = simNao(r.coroa_flores) || "Não informado";
            if (sn !== "Sim") return sn;
            return juntar(comLocal(txt(r.coroa_modelo) || txt(r.coroa_tipo) || "Sim", txt(r.coroa_deposito_nome)), prefeitura(os, "coroa_autorizada_prefeitura"));
        }
        default:
            return null;
    }
}

/** "Antes" do translado (fica junto do bloco do translado da OS). */
export function textoAntesTranslado(a: CorrecaoAntes): string {
    const os = a.os;
    if (!os) return "Carregando…";
    const sn = simNao(os.translado) || "Não informado";
    if (sn !== "Sim") return sn;
    const trajeto = [txt(os.translado_origem), txt(os.translado_destino)].filter(Boolean).join(" → ");
    return juntar("Sim", trajeto, txt(os.translado_km) ? `${txt(os.translado_km)} km` : "", prefeitura(os, "translado_autorizado_prefeitura"), terceirizado(os, "translado_terceirizado"));
}

/** Caixa "Antes (lançado)" mostrada acima do campo do item, que passa a ser o "Depois". */
export function CaixaAntes({ texto }: { texto: string }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-dashed border-[#C9D1DE] bg-[#F1F4F8] px-3 py-2 text-[13px] text-[#5B6478] dark:border-white/20 dark:bg-[#1C2334] dark:text-[#AEB9CF] sm:col-span-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.1em]">Antes (lançado)</span>
            <span className="font-bold text-[#313C55] dark:text-white">{texto}</span>
        </div>
    );
}

/** Faixa do topo da aba Itens no modo correção. */
export function AvisoModoCorrecao() {
    return (
        <div
            role="note"
            className="mt-4 flex items-start gap-3 rounded-[14px] border-[1.5px] border-[#3D6A99] bg-[#EEF3F9] px-3.5 py-3 text-[13px] leading-snug text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white"
        >
            <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
            </svg>
            <div>
                <b>Correção dos itens.</b> Em cada item, a caixa cinza mostra o que está lançado (Antes). O campo abaixo é a correção (Depois): troque só o que estiver errado. Ao salvar, você revisa as mudanças e informa o motivo. O estoque é acertado só no que mudar.
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Lista do que mudou                                                         */
/* -------------------------------------------------------------------------- */

const CAMPOS_REGISTRO: Array<[string, string[]]> = [
    ["Urna", ["urna", "urna_deposito_nome"]],
    ["Roupa", ["roupa", "roupa_deposito_nome"]],
    ["Véu", ["veu", "veu_item", "veu_deposito_nome"]],
    ["Cordão", ["cordao", "cordao_item", "cordao_deposito_nome"]],
    ["Invol", ["invol", "invol_item", "invol_deposito_nome"]],
    ["Tanatopraxia", ["tanato"]],
    ["Ornamentação", ["ornamentacao", "ornamentacao_tipo"]],
    ["Kit lanche", ["kit_lanche"]],
    ["Coroa de flores", ["coroa_flores", "coroa_tipo", "coroa_modelo", "coroa_deposito_nome"]],
];

const CAMPOS_OS: Array<[string, string]> = [
    ["Prefeitura autorizou o pacote", "pacote_autorizado_prefeitura"],
    ["Prefeitura autorizou a tanatopraxia", "tanato_autorizado_prefeitura"],
    ["Tanatopraxia terceirizada", "tanato_terceirizado"],
    ["Translado", "translado"],
    ["Translado: partida", "translado_origem"],
    ["Translado: destino", "translado_destino"],
    ["Translado: km", "translado_km"],
    ["Prefeitura autorizou o translado", "translado_autorizado_prefeitura"],
    ["Translado terceirizado", "translado_terceirizado"],
    ["Prefeitura autorizou a coroa", "coroa_autorizada_prefeitura"],
];

const norm = (v: unknown) =>
    String(v ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ");

const textoGrupo = (r: Dic, campos: string[]) =>
    campos
        .map((c) => (c === campos[0] && /^(veu|cordao|invol|tanato|ornamentacao|kit_lanche|coroa_flores)$/.test(c) ? simNao(r[c]) : txt(r[c])))
        .filter(Boolean)
        .join(" · ");

export function listarMudancasCorrecao(antes: CorrecaoAntes, depois: Dic, osDepois: Dic): MudancaCorrecao[] {
    const out: MudancaCorrecao[] = [];
    const r = antes.registro || {};
    for (const [rotulo, campos] of CAMPOS_REGISTRO) {
        // Campo que não veio no salvamento continua como estava.
        const d: Dic = { ...r };
        for (const c of campos) if (c in depois) d[c] = depois[c];
        const mudou = campos.some((c) => norm(r[c]) !== norm(d[c]));
        if (mudou) out.push({ rotulo, antes: textoGrupo(r, campos) || "—", depois: textoGrupo(d, campos) || "—" });
    }
    if (antes.os) {
        for (const [rotulo, campo] of CAMPOS_OS) {
            const a = txt(antes.os[campo]);
            const b = txt(osDepois?.[campo]);
            if (norm(a) !== norm(b)) out.push({ rotulo, antes: simNao(a) || "—", depois: simNao(b) || "—" });
        }
    }
    return out;
}

/* -------------------------------------------------------------------------- */
/* Revisão antes de salvar                                                    */
/* -------------------------------------------------------------------------- */

type Previa = {
    sem_baixa: boolean;
    voltam: Array<{ produto: string; local: string; qtd: number }>;
    saem: Array<{ produto: string; local: string; qtd: number; disponivel: number }>;
    faltantes: Array<{ produto_nome: string; deposito_nome: string; disponivel: number; necessario: number }>;
    mudou: boolean;
};

const BTN_PRINCIPAL =
    "h-12 flex-1 rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-60 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_SECUNDARIO =
    "h-12 flex-1 rounded-xl border-[1.5px] border-[#313C55] px-4 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-60 dark:border-white/40 dark:text-white dark:hover:bg-white/10";

export type PedidoRevisao = {
    id: string;
    falecido: string;
    mudancas: MudancaCorrecao[];
    /** O que vai para o informativo.php (usado só para a prévia do estoque). */
    registro: Dic;
};

export function RevisarCorrecaoItens({
    pedido,
    onConfirmar,
    onCancelar,
}: {
    pedido: PedidoRevisao | null;
    onConfirmar: (motivo: string) => void;
    onCancelar: () => void;
}) {
    const [previa, setPrevia] = useState<Previa | null>(null);
    const [erroPrevia, setErroPrevia] = useState("");
    const [carregando, setCarregando] = useState(false);
    const [motivo, setMotivo] = useState("");

    useEffect(() => {
        if (!pedido) return;
        let vivo = true;
        setPrevia(null);
        setErroPrevia("");
        setMotivo("");
        setCarregando(true);
        correcoesJson(null, { acao: "previa_corrigir_itens", id: Number(pedido.id), registro: pedido.registro })
            .then((r) => vivo && setPrevia(r.dados as Previa))
            .catch((e: any) => vivo && setErroPrevia(e?.message || "Não foi possível montar a prévia do estoque."))
            .finally(() => vivo && setCarregando(false));
        return () => {
            vivo = false;
        };
    }, [pedido]);

    if (!pedido) return null;

    const motivoOk = motivo.trim().length >= 5;
    const faltando = (previa?.faltantes?.length ?? 0) > 0;
    const nada = pedido.mudancas.length === 0;

    return (
        <Modal
            open
            onClose={onCancelar}
            ariaLabel="Revisar correção dos itens"
            maxWidth={560}
            zIndex={90}
            closeOnBackdrop={false}
            eyebrow="Revisar a correção"
            title={pedido.falecido || `Atendimento #${pedido.id}`}
            footer={
                <div className="flex gap-2">
                    <button type="button" className={BTN_SECUNDARIO} onClick={onCancelar}>
                        Voltar e ajustar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRINCIPAL}
                        disabled={!motivoOk || faltando || carregando}
                        onClick={() => onConfirmar(motivo.trim())}
                    >
                        Confirmar correção
                    </button>
                </div>
            }
        >
            <div className="flex flex-col gap-4 text-[#313C55] dark:text-white">
                <section>
                    <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">O que muda</h3>
                    {nada ? (
                        <p className="rounded-xl bg-[#F1F4F8] px-3 py-2.5 text-sm dark:bg-[#1C2334]">
                            Nenhum item mudou. Se você corrigiu outro dado, ele será salvo normalmente.
                        </p>
                    ) : (
                        <ul className="divide-y divide-[#E3E8F0] overflow-hidden rounded-xl border border-[#E3E8F0] dark:divide-white/10 dark:border-white/10">
                            {pedido.mudancas.map((m) => (
                                <li key={m.rotulo} className="px-3 py-2.5">
                                    <div className="text-sm font-extrabold">{m.rotulo}</div>
                                    <div className="mt-1 grid grid-cols-1 gap-1 text-[13px] sm:grid-cols-2">
                                        <div className="rounded-lg bg-[#F1F4F8] px-2 py-1 dark:bg-[#1C2334]">
                                            <span className="font-bold text-[#5B6478] dark:text-[#AEB9CF]">Antes: </span>
                                            <span className="line-through decoration-[#5B6478]/60">{m.antes}</span>
                                        </div>
                                        <div className="rounded-lg bg-[#EEF5D6] px-2 py-1 dark:bg-[#B3CE52]/20">
                                            <span className="font-bold text-[#5B6478] dark:text-[#AEB9CF]">Depois: </span>
                                            <b>{m.depois}</b>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Estoque</h3>
                    {carregando ? (
                        <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Conferindo o estoque…</p>
                    ) : erroPrevia ? (
                        <p className="rounded-xl border border-[#F1C7C0] bg-[#FDF2F0] px-3 py-2.5 text-sm dark:border-[#6A2C24] dark:bg-[#2C1714]">
                            {erroPrevia} O servidor confere de novo ao salvar.
                        </p>
                    ) : previa?.sem_baixa ? (
                        <p className="text-sm">Ainda não houve baixa no estoque (Corpo Pronto). Nada a acertar agora.</p>
                    ) : previa && !previa.mudou ? (
                        <p className="text-sm">O estoque não muda.</p>
                    ) : previa ? (
                        <div className="flex flex-col gap-2 text-sm">
                            {previa.voltam.length > 0 && (
                                <div>
                                    <div className="font-bold">Volta para o estoque</div>
                                    <ul className="mt-1 list-disc pl-5">
                                        {previa.voltam.map((v, i) => (
                                            <li key={`v${i}`}>
                                                {v.qtd}× {v.produto} → {v.local}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {previa.saem.length > 0 && (
                                <div>
                                    <div className="font-bold">Sai do estoque</div>
                                    <ul className="mt-1 list-disc pl-5">
                                        {previa.saem.map((s, i) => (
                                            <li key={`s${i}`} className={s.disponivel < s.qtd ? "font-bold text-[#B23A2B] dark:text-[#F0A397]" : ""}>
                                                {s.qtd}× {s.produto} ← {s.local} (disponível {s.disponivel})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {faltando && (
                                <p className="rounded-xl border border-[#F1C7C0] bg-[#FDF2F0] px-3 py-2.5 dark:border-[#6A2C24] dark:bg-[#2C1714]">
                                    Falta saldo no depósito escolhido. Volte e escolha outro depósito, ou dê entrada no estoque antes de corrigir.
                                </p>
                            )}
                        </div>
                    ) : null}
                </section>

                <section>
                    <label htmlFor="motivo-correcao-itens" className="mb-1.5 block text-[13px] font-bold">
                        Motivo da correção
                    </label>
                    <textarea
                        id="motivo-correcao-itens"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        maxLength={250}
                        placeholder="Ex.: urna lançada errada no Corpo Pronto; a usada foi a…"
                        className="min-h-24 w-full rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3.5 py-3 text-[15px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:border-white/25 dark:bg-[#232B3F] dark:text-white"
                    />
                    <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Pelo menos 5 letras. Fica no histórico do atendimento e no movimento do estoque.</p>
                </section>
            </div>
        </Modal>
    );
}
