"use client";

/**
 * Janela de beneficiário (Novo contrato e inclusão na ficha) — Contratos fase 2, 19/11/2026.
 * Pessoa: nome, parentesco (lista), nascimento, CPF opcional, sexo, extra pago; pet: nome, espécie e porte.
 * O sucessor é marcado na lista de beneficiários (planos novos: já vem no contrato).
 */
import React, { useState } from "react";
import { BTN_PRI, BTN_SEC, CAMPO, Janela, ROTULO } from "../../contas-pagar/components/fin";
import { type Base, CampoCpf, CampoData, Combo, cpfValido, dataValidar, PORTES, soDigitos } from "./ct";

export type BenefForm = {
    chave: string;
    tipo: "dependente" | "agregado" | "pet";
    nome: string;
    cpf: string;
    nascimento: string; // dd/mm/aaaa
    sexo: string | null;
    parentesco: string | null;
    pet_especie: string | null;
    pet_porte: string | null;
    pago: boolean;
    sucessor: boolean;
};

export const benefVazio = (pet = false): BenefForm => ({
    chave: Math.random().toString(36).slice(2),
    tipo: pet ? "pet" : "dependente",
    nome: "",
    cpf: "",
    nascimento: "",
    sexo: null,
    parentesco: null,
    pet_especie: null,
    pet_porte: null,
    pago: false,
    sucessor: false,
});

export function benefParaEnvio(b: BenefForm, hoje: string) {
    return {
        tipo: b.tipo,
        nome: b.nome.trim(),
        cpf: soDigitos(b.cpf) || null,
        nascimento: dataValidar(b.nascimento, hoje, b.tipo !== "pet")[0],
        sexo: b.sexo,
        parentesco: b.tipo === "pet" ? null : b.parentesco,
        pet_especie: b.pet_especie,
        pet_porte: b.pet_porte,
        pago: b.pago,
        sucessor: b.sucessor,
    };
}

export function JanelaBenef({
    inicial,
    base,
    temExtra,
    nascimentoObrig,
    onFechar,
    onSalvar,
    salvando,
    titulo,
}: {
    inicial: BenefForm;
    base: Base;
    temExtra: boolean;
    nascimentoObrig: boolean;
    onFechar: () => void;
    onSalvar: (b: BenefForm) => void;
    salvando?: boolean;
    titulo: string;
}) {
    const [b, setB] = useState<BenefForm>(inicial);
    const set = (p: Partial<BenefForm>) => setB((x) => ({ ...x, ...p }));
    const pet = b.tipo === "pet";
    const faltam: string[] = [];
    if (!b.nome.trim()) faltam.push("nome");
    if (pet) {
        if (!b.pet_especie) faltam.push("espécie");
        if (!b.pet_porte) faltam.push("porte");
    } else {
        if (!b.parentesco) faltam.push("parentesco");
        if (nascimentoObrig && !dataValidar(b.nascimento, base.hoje)[0]) faltam.push("data de nascimento");
        if (b.nascimento && dataValidar(b.nascimento, base.hoje)[2] === false) faltam.push("data de nascimento válida");
        if (soDigitos(b.cpf) && !cpfValido(soDigitos(b.cpf))) faltam.push("CPF válido (ou deixe em branco)");
    }
    return (
        <Janela
            titulo={titulo}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!!faltam.length || salvando} onClick={() => onSalvar(b)}>
                        {salvando ? "Salvando…" : "Salvar"}
                    </button>
                </>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                    <span className={ROTULO}>{pet ? "Nome do pet" : "Nome completo"}</span>
                    <input className={CAMPO} value={b.nome} onChange={(e) => set({ nome: e.target.value })} />
                </label>
                {pet ? (
                    <>
                        <div>
                            <span className={ROTULO}>Espécie</span>
                            <Combo rotulo="Espécie" opcoes={base.listas.pet_especies.map((e) => ({ v: e, t: e }))} valor={b.pet_especie} onChange={(v) => set({ pet_especie: v })} />
                        </div>
                        <div>
                            <span className={ROTULO}>Porte</span>
                            <Combo rotulo="Porte" opcoes={Object.entries(PORTES).map(([v, t]) => ({ v, t }))} valor={b.pet_porte} onChange={(v) => set({ pet_porte: v })} />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <span className={ROTULO}>Parentesco</span>
                            <Combo rotulo="Parentesco" opcoes={base.listas.parentescos.map((e) => ({ v: e, t: e }))} valor={b.parentesco} onChange={(v) => set({ parentesco: v })} />
                        </div>
                        <CampoData valor={b.nascimento} onChange={(v) => set({ nascimento: v })} hoje={base.hoje} rotulo="Data de nascimento" rotuloCls={ROTULO} />
                        <CampoCpf valor={b.cpf} onChange={(v) => set({ cpf: v })} rotulo="CPF (opcional)" rotuloCls={ROTULO} dica="Ajuda a achar o beneficiário no atendimento funerário." />
                        <div>
                            <span className={ROTULO}>Sexo</span>
                            <Combo rotulo="Sexo" opcoes={[{ v: "F", t: "Feminino" }, { v: "M", t: "Masculino" }]} valor={b.sexo} onChange={(v) => set({ sexo: v })} />
                        </div>
                        {temExtra ? (
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12] sm:col-span-2">
                                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#313C55]" checked={b.pago} onChange={(e) => set({ pago: e.target.checked })} />
                                <span>
                                    <b className="block text-[15px]">Extra pago</b>
                                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Beneficiário além dos que o plano cobre; o valor vem da tabela de preço (os primeiros sem custo, quando o plano tem).</span>
                                </span>
                            </label>
                        ) : null}
                    </>
                )}
            </div>
            {faltam.length ? <p className="text-[13px] font-bold text-[#7A5D00] dark:text-[#F2CB3F]">Falta: {faltam.join(", ")}.</p> : null}
        </Janela>
    );
}
