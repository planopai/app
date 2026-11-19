"use client";

/**
 * Campos do titular (Novo contrato e "Alterar dados do titular") — Contratos fase 2, 19/11/2026.
 * CPF confere os dígitos e procura no cadastro único; telefones só com número válido; data com máscara;
 * cidade e bairro por lista com busca (CEP preenche; bairro que falta: "Pedir bairro novo").
 */
import React, { useState } from "react";
import { api, CAMPO, mensagemErro, ROTULO } from "../../contas-pagar/components/fin";
import {
    type Base,
    buscarCep,
    CampoCpf,
    CampoData,
    CampoTel,
    Combo,
    cpfMascara,
    cpfValido,
    dataValidar,
    isoParaBR,
    semAcento,
    soDigitos,
    telMascara,
    telValidar,
    type TitularDados,
    URL_CT,
} from "./ct";

export type TitularForm = {
    cpf: string;
    nome: string;
    nascimento: string; // dd/mm/aaaa
    sexo: string | null;
    estado_civil: string | null;
    religiao: string | null;
    telefone1: string;
    telefone2: string;
    email: string;
    aceite_whatsapp: boolean;
    cep: string;
    cidade_id: number | null;
    bairro_id: number | null;
    rua: string;
    numero: string;
    complemento: string;
};

export const titularVazio = (): TitularForm => ({
    cpf: "",
    nome: "",
    nascimento: "",
    sexo: null,
    estado_civil: null,
    religiao: null,
    telefone1: "",
    telefone2: "",
    email: "",
    aceite_whatsapp: true,
    cep: "",
    cidade_id: null,
    bairro_id: null,
    rua: "",
    numero: "",
    complemento: "",
});

export function titularDeDados(d: Partial<TitularDados> & { cpf?: string }): Partial<TitularForm> {
    return {
        ...(d.cpf ? { cpf: cpfMascara(d.cpf) } : {}),
        nome: d.nome ?? "",
        nascimento: isoParaBR(d.nascimento),
        sexo: d.sexo ?? null,
        estado_civil: d.estado_civil ?? null,
        religiao: d.religiao ?? null,
        telefone1: telMascara(d.telefone1 ?? ""),
        telefone2: telMascara(d.telefone2 ?? ""),
        email: d.email ?? "",
        aceite_whatsapp: !!d.aceite_whatsapp,
        cep: d.cep ?? "",
        cidade_id: d.cidade_id ?? null,
        bairro_id: d.bairro_id ?? null,
        rua: d.rua ?? "",
        numero: d.numero ?? "",
        complemento: d.complemento ?? "",
    };
}

/** O que falta ou está errado (vazio = pode seguir). */
export function titularProblemas(t: TitularForm, hoje: string): string[] {
    const p: string[] = [];
    if (!cpfValido(soDigitos(t.cpf))) p.push("CPF válido");
    if (!t.nome.trim()) p.push("nome completo");
    if (!dataValidar(t.nascimento, hoje)[0]) p.push("data de nascimento");
    if (telValidar(t.telefone1)[0] !== true) p.push("telefone principal válido");
    if (telValidar(t.telefone2)[0] === false) p.push("segundo telefone válido (ou deixe em branco)");
    if (t.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.trim())) p.push("e-mail válido");
    return p;
}

export function titularParaEnvio(t: TitularForm, hoje: string) {
    return {
        cpf: soDigitos(t.cpf),
        nome: t.nome.trim(),
        nascimento: dataValidar(t.nascimento, hoje)[0],
        sexo: t.sexo,
        estado_civil: t.estado_civil,
        religiao: t.religiao,
        telefone1: t.telefone1,
        telefone2: t.telefone2,
        email: t.email.trim() || null,
        aceite_whatsapp: t.aceite_whatsapp,
        cep: soDigitos(t.cep) || null,
        cidade_id: t.cidade_id,
        bairro_id: t.bairro_id,
        rua: t.rua.trim() || null,
        numero: t.numero.trim() || null,
        complemento: t.complemento.trim() || null,
    };
}

export function CamposTitular({
    t,
    set,
    base,
    recarregarBase,
    avisar,
    cpfFixo,
    aoAcharCpf,
}: {
    t: TitularForm;
    set: (p: Partial<TitularForm>) => void;
    base: Base;
    recarregarBase: () => Promise<unknown>;
    avisar: (m: string) => void;
    cpfFixo?: boolean;
    aoAcharCpf?: (contratos: { id: number; numero: string; situacao: string; plano: string }[]) => void;
}) {
    const [buscandoCep, setBuscandoCep] = useState(false);
    const [cpfInfo, setCpfInfo] = useState("");

    const procurarCpf = async (v: string) => {
        const d = soDigitos(v);
        if (!cpfValido(d)) {
            setCpfInfo("");
            return;
        }
        try {
            const j = await api(URL_CT, "cpf", undefined, `&cpf=${d}`);
            if (j.dados) {
                set(titularDeDados(j.dados));
                const n = j.dados.contratos?.length || 0;
                setCpfInfo(n ? `Já é titular de ${n} contrato(s): ${j.dados.contratos.map((c: any) => c.numero + " (" + c.plano + ")").join(", ")}.` : "Pessoa já está no cadastro único: dados preenchidos.");
                aoAcharCpf?.(j.dados.contratos || []);
            } else setCpfInfo("CPF novo: entra no cadastro único ao salvar.");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível procurar o CPF.");
            if (m) setCpfInfo(m);
        }
    };

    const porCep = async () => {
        setBuscandoCep(true);
        const r = await buscarCep(t.cep);
        setBuscandoCep(false);
        if (!r) return avisar("CEP não encontrado. Preencha cidade e bairro pela lista.");
        let cidade = base.cidades.find((c) => (r.ibge && String(c.ibge) === r.ibge) || (semAcento(c.nome) === semAcento(r.cidade) && c.uf === r.uf));
        if (!cidade && r.cidade) {
            try {
                const j = await api(URL_CT, "cidade", { nome: r.cidade, uf: r.uf, ibge: r.ibge });
                await recarregarBase();
                cidade = j.dados;
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível incluir a cidade.");
                if (m) avisar(m);
            }
        }
        const bairro = cidade && r.bairro ? base.bairros.find((b) => b.cidade_id === cidade!.id && semAcento(b.nome) === semAcento(r.bairro)) : undefined;
        set({ rua: r.rua || t.rua, cidade_id: cidade?.id ?? t.cidade_id, bairro_id: bairro?.id ?? null });
        if (r.bairro && !bairro) avisar(`O bairro "${r.bairro}" não está na lista: escolha um ou peça a inclusão.`);
    };

    const pedirBairro = async (nome: string) => {
        if (!t.cidade_id) return avisar("Escolha a cidade antes.");
        const n = nome.trim();
        if (!n) return avisar("Escreva o nome do bairro no campo e toque em \"Pedir bairro novo\".");
        try {
            const j = await api(URL_CT, "bairro", { cidade_id: t.cidade_id, nome: n });
            avisar(j.msg);
            await recarregarBase();
            if (j.dados?.id) set({ bairro_id: j.dados.id });
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível pedir o bairro.");
            if (m) avisar(m);
        }
    };

    const L = base.listas;
    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cpfFixo ? (
                    <div>
                        <span className={ROTULO}>CPF</span>
                        <div className={`${CAMPO} flex items-center opacity-70`}>{t.cpf}</div>
                    </div>
                ) : (
                    <div>
                        <CampoCpf
                            valor={t.cpf}
                            rotulo="CPF"
                            rotuloCls={ROTULO}
                            dica={cpfInfo || "Só números; o sistema confere os dígitos e procura no cadastro único."}
                            onChange={(v) => {
                                set({ cpf: v });
                                if (soDigitos(v).length === 11) void procurarCpf(v);
                                else setCpfInfo("");
                            }}
                        />
                    </div>
                )}
                <label className="block sm:col-span-1 lg:col-span-2">
                    <span className={ROTULO}>Nome completo</span>
                    <input className={CAMPO} value={t.nome} onChange={(e) => set({ nome: e.target.value })} />
                </label>
                <CampoData valor={t.nascimento} onChange={(v) => set({ nascimento: v })} hoje={base.hoje} rotulo="Data de nascimento" rotuloCls={ROTULO} />
                <CampoTel valor={t.telefone1} onChange={(v) => set({ telefone1: v })} rotulo="Telefone principal" rotuloCls={ROTULO} dica="Celular ou fixo, com DDD. É por ele que o WhatsApp acha o contrato." />
                <CampoTel valor={t.telefone2} onChange={(v) => set({ telefone2: v })} rotulo="Segundo telefone (recado)" rotuloCls={ROTULO} dica="Opcional. Mesma regra: celular ou fixo com DDD." />
                <label className="block">
                    <span className={ROTULO}>E-mail</span>
                    <input className={CAMPO} type="email" inputMode="email" value={t.email} onChange={(e) => set({ email: e.target.value })} />
                </label>
                <div>
                    <span className={ROTULO}>Religião</span>
                    <Combo rotulo="Religião" opcoes={L.religioes.map((r) => ({ v: r, t: r }))} valor={t.religiao} onChange={(v) => set({ religiao: v })} />
                    <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Usada no atendimento funerário.</span>
                </div>
                <div>
                    <span className={ROTULO}>Sexo</span>
                    <Combo rotulo="Sexo" opcoes={[{ v: "F", t: "Feminino" }, { v: "M", t: "Masculino" }]} valor={t.sexo} onChange={(v) => set({ sexo: v })} />
                </div>
                <div>
                    <span className={ROTULO}>Estado civil</span>
                    <Combo rotulo="Estado civil" opcoes={L.estado_civil.map((r) => ({ v: r, t: r }))} valor={t.estado_civil} onChange={(v) => set({ estado_civil: v })} />
                </div>
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#313C55]" checked={t.aceite_whatsapp} onChange={(e) => set({ aceite_whatsapp: e.target.checked })} />
                <span>
                    <b className="block text-[15px]">Aceita receber mensagens do PAI no WhatsApp</b>
                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Avisos de cobrança, carteirinha e relacionamento. Fica gravado com data e quem registrou (LGPD); pode ser retirado a qualquer momento.</span>
                </span>
            </label>
            <div>
                <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">Endereço</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block">
                        <span className={ROTULO}>CEP</span>
                        <div className="flex gap-2">
                            <input
                                className={CAMPO}
                                inputMode="numeric"
                                placeholder="00000-000"
                                value={t.cep.replace(/^(\d{5})(\d)/, "$1-$2")}
                                onChange={(e) => set({ cep: soDigitos(e.target.value).slice(0, 8) })}
                                onBlur={() => {
                                    if (soDigitos(t.cep).length === 8) void porCep();
                                }}
                            />
                        </div>
                        <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{buscandoCep ? "Procurando o CEP…" : "Preenche rua, cidade e bairro pelo CEP."}</span>
                    </label>
                    <div>
                        <span className={ROTULO}>Cidade</span>
                        <Combo rotulo="Cidade" opcoes={base.cidades.map((c) => ({ v: c.id, t: `${c.nome} – ${c.uf}` }))} valor={t.cidade_id} onChange={(v) => set({ cidade_id: v, bairro_id: null })} />
                        <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Digite parte do nome e escolha na lista. Cidade nova entra pelo CEP.</span>
                    </div>
                    <div>
                        <span className={ROTULO}>Bairro</span>
                        <Combo
                            rotulo="Bairro"
                            desativado={!t.cidade_id}
                            placeholder={t.cidade_id ? "Digite para buscar" : "Escolha a cidade antes"}
                            opcoes={base.bairros.filter((b) => b.cidade_id === t.cidade_id).map((b) => ({ v: b.id, t: b.nome, s: b.pedido ? "aguarda conferência" : undefined }))}
                            valor={t.bairro_id}
                            onChange={(v) => set({ bairro_id: v })}
                            novo="+ Pedir bairro novo"
                            onNovo={(txt) => void pedirBairro(txt)}
                        />
                        <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Bairro que não está na lista: escreva o nome e toque em &quot;Pedir bairro novo&quot;.</span>
                    </div>
                    <label className="block sm:col-span-2 lg:col-span-1">
                        <span className={ROTULO}>Rua</span>
                        <input className={CAMPO} value={t.rua} onChange={(e) => set({ rua: e.target.value })} />
                    </label>
                    <label className="block">
                        <span className={ROTULO}>Número</span>
                        <input className={CAMPO} value={t.numero} onChange={(e) => set({ numero: e.target.value })} />
                    </label>
                    <label className="block">
                        <span className={ROTULO}>Complemento</span>
                        <input className={CAMPO} value={t.complemento} onChange={(e) => set({ complemento: e.target.value })} />
                    </label>
                </div>
            </div>
        </div>
    );
}
