/*
 * Orçamento → Novo registro (13/10/2026). Usado pela tela Atendimentos (app/acompanhamento/page.tsx) quando abre
 * /acompanhamento?orcamento=<id>: monta os campos do registro e os campos da OS a partir do orçamento salvo.
 * O agente confere, completa o que falta (velório, sepultamento, documentos...) e salva; a OS sai com o preço do dia.
 */

import { lerOrcamento } from "./api";
import type { Orcamento } from "./tipos";

export { marcarOrcamentoConvertido } from "./api";

/** Mesmo texto de LOCAL_MEMORIAL (app/acompanhamento/components/constants.ts). */
const LOCAL_MEMORIAL = "Memorial Senhor do Bonfim";

const sn = (v: unknown) => (String(v ?? "").trim().toLowerCase() === "sim" ? "Sim" : "Não");
const num = (v: unknown) => Number(v) || 0;
const txt = (v: unknown) => String(v ?? "").trim();

/** Campos do rascunho que não são itens Sim/Não "extras" (assistência, kit lanche...). */
const CONHECIDOS = new Set([
    "convenio_id", "pacote_id", "urna_produto_id", "roupa_propria", "roupa_produto_id", "veu", "veu_produto_id", "cordao", "cordao_produto_id",
    "invol", "invol_produto_id", "coroas", "ornamentacao", "ornamentacao_tipo", "tanato", "tanato_produto_id", "reconstituicao_facial",
    "translado", "translado_km", "translado_origem", "translado_destino", "velorio_memorial", "realiza_velorio", "sala_velorio",
]);

export type CamposDoOrcamento = {
    orcamento: Orcamento;
    /** Campos do registro (wizardData). */
    registro: Record<string, unknown>;
    /** Campos da OS (OsCampos): tanatopraxia e translado. */
    os: Record<string, string>;
};

export async function camposDoOrcamento(id: number): Promise<CamposDoOrcamento> {
    const o = await lerOrcamento(id);
    if (o.situacao === "CONVERTIDO") throw new Error(`O orçamento ${o.numero} já virou o atendimento #${o.atendimento_id}.`);
    if (o.situacao === "CANCELADO") throw new Error(`O orçamento ${o.numero} foi cancelado.`);
    const r = o.rascunho || {};

    const registro: Record<string, unknown> = {
        falecido: o.falecido,
        nome_responsavel: o.contato,
        contato: o.telefone,
        convenio: "Particular",
    };

    if (num(r.urna_produto_id) > 0) {
        Object.assign(registro, { urna: txt(r.urna_nome), urna_produto_id: num(r.urna_produto_id), urna_deposito_nome: txt(r.urna_local) || "MEMORIAL" });
    }
    if (num(r.roupa_propria) === 1) {
        Object.assign(registro, { roupa: "Roupa própria", roupa_propria: 1, roupa_produto_id: 0 });
    } else if (num(r.roupa_produto_id) > 0) {
        Object.assign(registro, { roupa: txt(r.roupa_nome), roupa_produto_id: num(r.roupa_produto_id), roupa_deposito_nome: txt(r.roupa_local) });
    }
    for (const k of ["veu", "cordao", "invol"] as const) {
        if (sn(r[k]) !== "Sim") continue;
        registro[k] = "Sim";
        if (num(r[`${k}_produto_id`]) > 0) {
            Object.assign(registro, {
                [`${k}_item`]: txt(r[`${k}_nome`]),
                [`${k}_produto_id`]: num(r[`${k}_produto_id`]),
                [`${k}_deposito_nome`]: txt(r[`${k}_local`]),
            });
        }
    }
    if (sn(r.tanato) === "Sim") registro.tanato = "Sim";
    if (sn(r.ornamentacao) === "Sim") Object.assign(registro, { ornamentacao: "Sim", ornamentacao_tipo: txt(r.ornamentacao_tipo) });
    // Itens Sim/Não do servidor (ex.: assistência, kit lanche): mesmo nome de campo do registro
    Object.keys(r).forEach((k) => {
        if (!CONHECIDOS.has(k) && !k.endsWith("_nome") && !k.endsWith("_local") && sn(r[k]) === "Sim" && /^(sim|não|nao)$/i.test(txt(r[k]))) registro[k] = "Sim";
    });

    const coroas = Array.isArray(r.coroas) ? r.coroas.filter((c: any) => num(c?.produto_id) > 0) : [];
    if (coroas.length) {
        registro.coroa_flores = "Sim";
        registro.coroas_itens = coroas.map((c: any, i: number) => ({
            ordem: i + 1,
            tipo_coroa: c.tipo === "artificial" ? "artificial" : "natural",
            produto_id: num(c.produto_id),
            modelo_coroa: txt(c.nome),
            deposito_nome: c.tipo === "artificial" ? txt(c.local) || "MEMORIAL" : "",
            frase: "",
        }));
    }

    if (txt(r.sala_velorio)) {
        Object.assign(registro, { realiza_velorio: "Sim", local_cerimonia: LOCAL_MEMORIAL, local_velorio: LOCAL_MEMORIAL, sala_velorio: txt(r.sala_velorio) });
    }

    const os: Record<string, string> = {};
    if (sn(r.tanato) === "Sim") {
        if (num(r.tanato_produto_id) > 0) os.tanato_produto_id = String(num(r.tanato_produto_id));
        os.reconstituicao_facial = sn(r.reconstituicao_facial);
    }
    if (sn(r.translado) === "Sim" && num(r.translado_km) > 0) {
        Object.assign(os, {
            translado: "Sim",
            translado_km: String(r.translado_km).replace(".", ","),
            translado_origem: txt(r.translado_origem),
            translado_destino: txt(r.translado_destino),
        });
    }

    return { orcamento: o, registro, os };
}
