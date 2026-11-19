"use client";

/**
 * Peças comuns da tela Contratos (/contratos, chave contratos) — módulo Contratos, fase 2 — 19/11/2026.
 * Back-end: ct_contratos.php. Estilos, janela e chamadas vêm do financeiro (contas-pagar/components/fin.tsx).
 * Combo: lista com busca (escreve e vai filtrando, sem acento; só vale o item escolhido). Telefone, CPF e data com máscara e conferência.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, CAMPO, mensagemErro } from "../../contas-pagar/components/fin";

export const URL_CT = "https://api.planoassistencialintegrado.com.br/ct_contratos.php";
/** Propostas de Adesão (Administrativo) e Vendas (Comercial) — ambiente de vendas, 19/11/2026. */
export const URL_PROP = "https://api.planoassistencialintegrado.com.br/ct_propostas.php";
export const URL_VD = "https://api.planoassistencialintegrado.com.br/ct_vendas.php";

/* ============================== tipos ============================== */

export type ItemPreco = { tipo: "titular" | "extra"; idade_ini: number | null; idade_fim: number | null; valor_adesao: number; valor_mensal: number; percentual_mensal: number | null; qtd_sem_custo: number; qtd_max: number | null };
export type PlanoBase = {
    id: number;
    nome: string;
    situacao: "vende" | "fora_venda";
    tipo_preco: "simples" | "faixas" | "contrato";
    pronto: boolean;
    itens: ItemPreco[];
    beneficiarios: Record<string, any>;
    aditivos: { id: number; nome: string; condicao: string | null }[];
};
export type Cidade = { id: number; nome: string; uf: string; ibge: number | null };
export type Bairro = { id: number; cidade_id: number; nome: string; pedido: boolean };
export type Base = {
    hoje: string;
    planos: PlanoBase[];
    cidades: Cidade[];
    bairros: Bairro[];
    colaboradores: { id: number; nome: string }[];
    listas: {
        situacoes: Record<string, string>;
        religioes: string[];
        estado_civil: string[];
        parentescos: string[];
        pet_especies: string[];
        origens: Record<string, string>;
        formas: Record<string, string>;
        dias: number[];
    };
    colunas: Record<string, string[]>;
    eu_id: number;
    pode: { gestao: boolean; bairros: boolean };
    bairros_pedidos: number;
};
export type Linha = {
    id: number;
    numero: string;
    situacao: "pre" | "ativo" | "suspenso" | "juridico" | "cancelado";
    situacao_nome: string;
    vencidas: number | null;
    data_contrato: string;
    data_ativacao: string | null;
    data_carencia: string | null;
    aniversario: string | null;
    tempo_meses: number | null;
    origem: string | null;
    titular: string;
    cpf: string | null;
    nascimento: string | null;
    idade: number | null;
    sexo: string | null;
    telefone: string | null;
    telefone2: string | null;
    email: string | null;
    cidade: string | null;
    bairro: string | null;
    endereco: string | null;
    forma_cobranca: string;
    dia_pagamento: number;
    cobrador: string | null;
    mensalidade: number;
    valor_plano: number;
    valor_adesao: number;
    bon_pendentes: number;
    bon_ativas: number;
    mes_reajuste: number | null;
    plano: string;
    plano_id: number;
    faixa_flex: string | null;
    dependentes: number;
    extras: number;
    pets: number;
    aditivos: string | null;
    vendedor: string | null;
    indicador: string | null;
    titular_falecido: boolean;
    cancelamento: string | null;
    tipo_venda: string;
    responsavel: string | null;
};
export type TitularDados = {
    cpf: string;
    nome: string;
    nascimento: string | null;
    sexo: string | null;
    estado_civil: string | null;
    religiao: string | null;
    telefone1: string | null;
    telefone2: string | null;
    email: string | null;
    aceite_whatsapp: boolean;
    cep: string | null;
    cidade_id: number | null;
    bairro_id: number | null;
    rua: string | null;
    numero: string | null;
    complemento: string | null;
};
export type Beneficiario = {
    id: number;
    tipo: "titular" | "dependente" | "agregado" | "pet";
    nome: string;
    cpf: string | null;
    nascimento: string | null;
    idade: number | null;
    sexo: string | null;
    parentesco: string | null;
    pet_especie: string | null;
    pet_porte: string | null;
    sucessor: boolean;
    pago: boolean;
    valor_mensal: number;
    incluido_em: string;
    carencia_desde: string | null;
    carencia_ate: string | null;
    situacao: "ativo" | "excluido" | "falecido";
    excluido_em: string | null;
    falecido_em: string | null;
    atendimento_id: number | null;
};
export type Venda = {
    id: number;
    tipo: "contrato_novo" | "aditivo" | "troca_plano" | "inclusao" | "transferencia" | "reativacao";
    data: string;
    aditivo: string | null;
    aditivo_id: number | null;
    plano: string | null;
    plano_anterior: string | null;
    beneficiario: string | null;
    valor_adesao: number;
    valor_mensal: number;
    vendedor: string | null;
    situacao: "ativa" | "encerrada" | "cancelada";
    encerrada_em: string | null;
    observacao: string | null;
};
export type Bonificacao = {
    id: number;
    alvo: "mensalidade" | "aditivo" | "beneficiario";
    beneficiario: string | null;
    aditivo: string | null;
    modo: "total" | "percentual" | "valor";
    valor: number;
    desde: string;
    ate: string | null;
    motivo: string;
    situacao: "pendente" | "aprovada" | "recusada" | "encerrada";
    pedido_por: string | null;
    pedido_em: string;
    decidido_por: string | null;
    decidido_em: string | null;
    decisao_obs: string | null;
};
export type Ficha = {
    contrato: Linha & {
        titular_pessoa_id: number;
        titular_dados: TitularDados;
        primeira_mensalidade: string | null;
        flex_idade: number | null;
        flex_beneficiario_id: number | null;
    };
    beneficiarios: Beneficiario[];
    vendas: Venda[];
    bonificacoes: Bonificacao[];
    historico: { criado_em: string; acao: string; descricao: string; usuario: string | null }[];
};

/* ============================== dados ============================== */

export function useBase(url: string = URL_CT) {
    const [base, setBase] = useState<Base | null>(null);
    const [erro, setErro] = useState("");
    const recarregar = useCallback(async () => {
        try {
            const j = await api(url, "base");
            setBase(j.dados);
            setErro("");
        } catch (e: any) {
            const m = mensagemErro(e, "Não foi possível carregar os dados.");
            if (m) setErro(m);
        }
    }, [url]);
    useEffect(() => {
        void recarregar();
    }, [recarregar]);
    return { base, erro, recarregar };
}

export type Gravar = (acao: string, corpo: Record<string, unknown>) => Promise<any | null>;

/** Grava no ct_contratos.php, avisa e chama depois(). Devolve a resposta, ou null se deu erro (o aviso mostra a mensagem). */
export function useGravar(avisar: (m: string) => void, depois: () => unknown): Gravar {
    return useCallback(
        async (acao, corpo) => {
            try {
                const j = await api(URL_CT, acao, corpo);
                avisar(j.msg);
                await depois();
                return j;
            } catch (e: any) {
                const m = mensagemErro(e, "Não foi possível salvar.");
                if (m) avisar(m);
                return null;
            }
        },
        [avisar, depois],
    );
}

/* ============================== textos ============================== */

export const SIT_SELO: Record<Linha["situacao"], string> = {
    pre: "bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]",
    ativo: "bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]",
    suspenso: "bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]",
    juridico: "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]",
    cancelado: "bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]",
};
export const PORTES: Record<string, string> = { pequeno: "Pequeno", medio: "Médio", grande: "Grande" };
export const TIPO_VENDA: Record<string, string> = { nova: "Nova", reativacao: "Reativação (ex-associado)", transferencia: "Transferência" };
export const TIPO_VENDA_REG: Record<Venda["tipo"], string> = {
    contrato_novo: "Contrato novo",
    aditivo: "Aditivo",
    troca_plano: "Troca de plano",
    inclusao: "Beneficiário pago",
    transferencia: "Transferência",
    reativacao: "Reativação",
};
export const brl = (v?: number | null) => (v === null || v === undefined ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const mesBRCurto = (ym?: string | null) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "");

/* ============================== máscaras e conferências ============================== */

export const soDigitos = (s: string) => s.replace(/\D/g, "");
export const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function cpfValido(d: string): boolean {
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const t of [9, 10]) {
        let s = 0;
        for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i);
        if (((s * 10) % 11) % 10 !== +d[t]) return false;
    }
    return true;
}
export const cpfMascara = (s: string) =>
    soDigitos(s)
        .slice(0, 11)
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");

const DDDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99];
/** [ok, mensagem]; ok = null quando vazio. */
export function telValidar(v: string): [boolean | null, string] {
    const d = soDigitos(v).replace(/^0+/, "");
    if (!d) return [null, ""];
    if (d.length < 10) return [false, "Digite o DDD e o número completo."];
    if (!DDDS.includes(+d.slice(0, 2))) return [false, `DDD ${d.slice(0, 2)} não existe.`];
    const n = d.slice(2);
    if (/^(\d)\1+$/.test(n)) return [false, "Número de preenchimento: peça o telefone real."];
    if (d.length === 11) return n[0] === "9" && n[1] !== "0" ? [true, "Celular válido."] : [false, "Celular tem 9 dígitos e começa com 9."];
    if (d.length === 10) return /[2-5]/.test(n[0]) ? [true, "Fixo válido."] : [false, n[0] === "9" ? "Celular: falta um dígito (são 9 depois do DDD)." : "Fixo começa com 2, 3, 4 ou 5."];
    return [false, "Número longo demais."];
}
export function telMascara(v: string): string {
    const d = soDigitos(v).replace(/^0+/, "").slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    const n = d.slice(2);
    const corte = d.length === 11 ? 5 : 4;
    return `(${d.slice(0, 2)}) ${n.length > corte ? n.slice(0, corte) + "-" + n.slice(corte) : n}`;
}
/** Data dd/mm/aaaa enquanto digita. */
export function dataMascara(v: string): string {
    const d = soDigitos(v).slice(0, 8);
    return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
/** dd/mm/aaaa → [iso | null, mensagem]. */
export function dataValidar(v: string, hoje: string, nascimento = true): [string | null, string, boolean | null] {
    const d = soDigitos(v);
    if (!d) return [null, "", null];
    if (d.length < 8) return [null, "Só os números: as barras entram sozinhas.", null];
    const [dia, mes, ano] = [+d.slice(0, 2), +d.slice(2, 4), +d.slice(4, 8)];
    const dt = new Date(ano, mes - 1, dia);
    if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) return [null, "Essa data não existe.", false];
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (iso > hoje) return [null, "A data está no futuro.", false];
    if (!nascimento) return [iso, "", true];
    const [hy, hm, hd] = hoje.split("-").map(Number);
    let idade = hy - ano;
    if (hm < mes || (hm === mes && hd < dia)) idade--;
    if (idade > 120) return [null, `Confira o ano: daria ${idade} anos.`, false];
    return [iso, idade === 1 ? "1 ano" : `${idade} anos`, true];
}
export const isoParaBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/* ============================== campos ============================== */

const MSG = (ok: boolean | null) => (ok === null ? "text-[#5B6478] dark:text-[#AEB9CF]" : ok ? "font-extrabold text-[#3F5A0A] dark:text-[#CFE38A]" : "font-extrabold text-[#B42318] dark:text-[#FF9C92]");

export function CampoTel({ valor, onChange, dica, rotulo, rotuloCls }: { valor: string; onChange: (v: string) => void; dica: string; rotulo: string; rotuloCls: string }) {
    const id = useId();
    const [ok, msg] = telValidar(valor);
    return (
        <label className="block min-w-0" htmlFor={id}>
            <span className={rotuloCls}>{rotulo}</span>
            <input id={id} className={CAMPO} inputMode="numeric" placeholder="(77) 9 0000-0000" value={valor} aria-invalid={ok === false} onChange={(e) => onChange(telMascara(e.target.value))} />
            <span className={`mt-1 block text-[12.5px] ${MSG(ok)}`}>{ok === null ? dica : msg}</span>
        </label>
    );
}

export function CampoData({ valor, onChange, hoje, rotulo, rotuloCls, nascimento = true, dica }: { valor: string; onChange: (v: string) => void; hoje: string; rotulo: string; rotuloCls: string; nascimento?: boolean; dica?: string }) {
    const id = useId();
    const [, msg, ok] = dataValidar(valor, hoje, nascimento);
    return (
        <label className="block min-w-0" htmlFor={id}>
            <span className={rotuloCls}>{rotulo}</span>
            <input id={id} className={CAMPO} inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={valor} aria-invalid={ok === false} onChange={(e) => onChange(dataMascara(e.target.value))} />
            <span className={`mt-1 block text-[12.5px] ${MSG(ok)}`}>{msg || dica || "Só os números: as barras entram sozinhas."}</span>
        </label>
    );
}

export function CampoCpf({ valor, onChange, rotulo, rotuloCls, dica }: { valor: string; onChange: (v: string) => void; rotulo: string; rotuloCls: string; dica?: string }) {
    const id = useId();
    const d = soDigitos(valor);
    const ok = d.length < 11 ? null : cpfValido(d);
    return (
        <label className="block min-w-0" htmlFor={id}>
            <span className={rotuloCls}>{rotulo}</span>
            <input id={id} className={CAMPO} inputMode="numeric" placeholder="000.000.000-00" value={valor} aria-invalid={ok === false} onChange={(e) => onChange(cpfMascara(e.target.value))} />
            <span className={`mt-1 block text-[12.5px] ${MSG(ok)}`}>{ok === null ? dica || "Só números; o sistema confere os dígitos." : ok ? "CPF válido." : "CPF inválido: confira os números."}</span>
        </label>
    );
}

/* ============================== Combo: lista com busca ============================== */

export type Opcao<T extends string | number = string | number> = { v: T; t: string; s?: string };

/**
 * Lista com busca: escreve parte do nome (sem precisar de acento) e a lista vai filtrando; setas e Enter escolhem.
 * Só vale o item da lista: ao sair do campo sem escolher, volta o que estava. Opcional: "novo" (ex.: "+ Pedir bairro novo").
 */
export function Combo<T extends string | number>({
    opcoes,
    valor,
    onChange,
    rotulo,
    placeholder = "Digite para buscar",
    novo,
    onNovo,
    classe = CAMPO,
    vazio,
    desativado,
    onTexto,
}: {
    opcoes: Opcao<T>[];
    valor: T | null;
    onChange: (v: T | null) => void;
    rotulo: string;
    placeholder?: string;
    novo?: string;
    onNovo?: (texto: string) => void;
    classe?: string;
    vazio?: string; // texto de "sem escolha" (ex.: "Todas as cidades"): aparece como primeira opção e limpa
    desativado?: boolean;
    onTexto?: (texto: string) => void; // busca no servidor (ex.: "Indicado por"): avisa o que foi digitado
}) {
    const idLista = useId();
    const atual = opcoes.find((o) => o.v === valor) ?? null;
    const textoAtual = atual ? atual.t : vazio && valor === null ? vazio : "";
    const [texto, setTexto] = useState(textoAtual);
    const [aberto, setAberto] = useState(false);
    const [filtrar, setFiltrar] = useState(false);
    const [marcado, setMarcado] = useState(0);
    const caixa = useRef<HTMLDivElement>(null);
    const lista = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (!aberto) setTexto(textoAtual);
    }, [textoAtual, aberto]);

    const achados = useMemo(() => {
        const partes = filtrar ? semAcento(texto.trim()).split(/\s+/).filter(Boolean) : [];
        const base: (Opcao<T> | { v: null; t: string; s?: string })[] = vazio ? [{ v: null, t: vazio }, ...opcoes] : opcoes;
        return base.filter((o) => partes.every((p) => semAcento(o.t + " " + (o.s || "")).includes(p))).slice(0, 80);
    }, [opcoes, texto, filtrar, vazio]);

    const fechar = () => {
        setAberto(false);
        setFiltrar(false);
        setTexto(textoAtual);
    };
    const escolher = (o: { v: T | null; t: string }) => {
        onChange(o.v);
        setTexto(o.t);
        setAberto(false);
        setFiltrar(false);
    };
    useEffect(() => {
        if (!aberto) return;
        const f = (e: MouseEvent) => {
            if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
        };
        document.addEventListener("mousedown", f);
        return () => document.removeEventListener("mousedown", f);
    });
    useEffect(() => {
        lista.current?.querySelector<HTMLElement>(`[data-i="${marcado}"]`)?.scrollIntoView({ block: "nearest" });
    }, [marcado]);

    const marcarTexto = (t: string) => {
        const p = filtrar ? semAcento(texto.trim()).split(/\s+/).filter(Boolean)[0] : "";
        if (!p) return t;
        const i = semAcento(t).indexOf(p);
        if (i < 0) return t;
        return (
            <>
                {t.slice(0, i)}
                <b className="underline">{t.slice(i, i + p.length)}</b>
                {t.slice(i + p.length)}
            </>
        );
    };

    return (
        <div ref={caixa} className="relative min-w-0">
            <input
                type="text"
                role="combobox"
                aria-label={rotulo}
                aria-expanded={aberto}
                aria-controls={idLista}
                aria-autocomplete="list"
                autoComplete="off"
                disabled={desativado}
                placeholder={placeholder}
                className={`${classe} pr-9`}
                value={texto}
                onFocus={(e) => {
                    e.currentTarget.select();
                    setAberto(true);
                    setFiltrar(false);
                    setMarcado(0);
                }}
                onChange={(e) => {
                    setTexto(e.target.value);
                    onTexto?.(e.target.value);
                    setAberto(true);
                    setFiltrar(true);
                    setMarcado(0);
                }}
                onKeyDown={(e) => {
                    const n = achados.length + (novo ? 1 : 0);
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (!aberto) setAberto(true);
                        else setMarcado((m) => (m + 1) % Math.max(n, 1));
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMarcado((m) => (m - 1 + Math.max(n, 1)) % Math.max(n, 1));
                    } else if (e.key === "Enter") {
                        if (!aberto) return;
                        e.preventDefault();
                        if (marcado < achados.length) escolher(achados[marcado] as { v: T | null; t: string });
                        else if (novo && onNovo) {
                            onNovo(filtrar ? texto.trim() : "");
                            fechar();
                        }
                    } else if (e.key === "Escape") {
                        fechar();
                    } else if (e.key === "Tab") {
                        fechar();
                    }
                }}
            />
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#7A8396]">▼</span>
            {aberto ? (
                <ul ref={lista} id={idLista} role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-[75] max-h-72 overflow-y-auto rounded-xl border border-[#E3E8F0] bg-white p-1 shadow-xl dark:border-white/[0.12] dark:bg-[#232B3F]">
                    {achados.length ? (
                        achados.map((o, i) => (
                            <li
                                key={String(o.v)}
                                data-i={i}
                                role="option"
                                aria-selected={i === marcado}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    escolher(o as { v: T | null; t: string });
                                }}
                                onMouseEnter={() => setMarcado(i)}
                                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px] ${i === marcado ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : ""}`}
                            >
                                <span className="min-w-0 break-words">{marcarTexto(o.t)}</span>
                                {o.s ? <small className="ml-auto shrink-0 pl-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{o.s}</small> : null}
                            </li>
                        ))
                    ) : (
                        <li className="flex min-h-11 items-center px-3 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nada encontrado</li>
                    )}
                    {novo ? (
                        <li
                            data-i={achados.length}
                            role="option"
                            aria-selected={marcado === achados.length}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onNovo?.(filtrar ? texto.trim() : "");
                                fechar();
                            }}
                            className={`flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-[14.5px] font-extrabold text-[#3D6A99] dark:text-[#8FB0D6] ${marcado === achados.length ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : ""}`}
                        >
                            {novo}
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </div>
    );
}

/* ============================== CEP (ViaCEP) ============================== */

export async function buscarCep(cep: string): Promise<{ rua: string; bairro: string; cidade: string; uf: string; ibge: string } | null> {
    const d = soDigitos(cep);
    if (d.length !== 8) return null;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
        const j = await r.json();
        if (!j || j.erro) return null;
        return { rua: j.logradouro || "", bairro: j.bairro || "", cidade: j.localidade || "", uf: j.uf || "", ibge: j.ibge || "" };
    } catch {
        return null;
    }
}
