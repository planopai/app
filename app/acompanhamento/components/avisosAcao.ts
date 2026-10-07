import { Registro } from "./types";

/* =====================================================================================
   Avisos do "Registrar ação" (mockup Atendimentos.dc.html):
   1) "Faltam N dados para iniciar a ornamentação"  → antes do Início da Ornamentação (fase05)
   2) "Baixa automática no estoque"                 → antes do Corpo Pronto (fase12)
   Funções puras: só leem o registro, não chamam servidor.
   ===================================================================================== */

const txt = (v: unknown) => String(v ?? "").trim();
const ehSim = (v: unknown) => txt(v).toLowerCase() === "sim";
const marcado = (v: unknown) => v === true || v === 1 || v === "1" || ehSim(v);

export type DadoFaltando = { chave: string; rotulo: string };

/**
 * Dados que precisam estar preenchidos para INICIAR a ornamentação (4 itens do mockup):
 * Religião · Telefone do responsável · Convênio · Urna (modelo e local de saída).
 * A urna só conta como faltando quando foi escolhida mas está incompleta (sem produto do estoque ou sem local):
 * um atendimento sem urna ("Não") não deve travar a ornamentação.
 */
export function dadosFaltandoParaOrnamentacao(r: Registro | null | undefined): DadoFaltando[] {
    if (!r) return [];
    const a: any = r;
    const faltando: DadoFaltando[] = [];
    if (!txt(a.religiao)) faltando.push({ chave: "religiao", rotulo: "Religião" });
    if (!txt(a.contato)) faltando.push({ chave: "contato", rotulo: "Telefone do responsável" });
    if (!txt(a.convenio)) faltando.push({ chave: "convenio", rotulo: "Convênio" });
    if (txt(a.urna)) {
        const semProduto = (Number(a.urna_produto_id ?? 0) || 0) <= 0;
        const semLocal = !txt(a.urna_deposito_nome);
        if (semProduto || semLocal) faltando.push({ chave: "urna", rotulo: "Urna: modelo e local de saída" });
    }
    return faltando;
}

export type ItemBaixa = { nome: string; qtd: string; semBaixa?: boolean; /** Local (depósito) de onde o item sai, para conferir antes de confirmar. */ local?: string };

/** Nome do depósito como a equipe lê: MEMORIAL → Memorial, ARMARIO SANDRO → Armário Sandro. */
export function nomeDeposito(v: unknown): string {
    const s = txt(v).toUpperCase().replace(/\s+/g, " ");
    if (!s) return "";
    const conhecidos: Record<string, string> = {
        MEMORIAL: "Memorial",
        FUNERARIA: "Funerária",
        "FUNERÁRIA": "Funerária",
        "ARMARIO SANDRO": "Armário Sandro",
        "ARMÁRIO SANDRO": "Armário Sandro",
        "ARMARIO ILDO": "Armário Ildo",
        "ARMÁRIO ILDO": "Armário Ildo",
        CLINICA: "Clínica",
        "CLÍNICA": "Clínica",
        ALMOXARIFADO: "Almoxarifado",
    };
    if (conhecidos[s]) return conhecidos[s];
    return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

/** Insumos da conservação gravados em arrumacao_json (itens com produto, quantidade e depósito). */
function insumosDaConservacao(a: any): { nome: string; qtd: number }[] | null {
    let data: any = null;
    const raw = a?.arrumacao_json;
    if (raw && typeof raw === "object") data = raw;
    else if (typeof raw === "string" && raw.trim()) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }
    }
    const lista: any[] = Array.isArray(data?.itens) ? data.itens : Array.isArray(data?.items) ? data.items : [];
    if (!lista.length) return null;
    const out: { nome: string; qtd: number }[] = [];
    for (const it of lista) {
        if (it?.checked === false) continue;
        const qtd = Number(it?.qtd ?? it?.quantidade ?? 0) || 0;
        if (qtd <= 0 || (Number(it?.produto_id ?? 0) || 0) <= 0) continue;
        out.push({ nome: txt(it?.nome) || "Insumo", qtd });
    }
    return out.length ? out : null;
}

function depositoDosInsumos(a: any): string {
    const raw = a?.arrumacao_json;
    try {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        return nomeDeposito(data?.deposito_nome ?? data?.deposito ?? "");
    } catch {
        return "";
    }
}

/** Itens que o Corpo Pronto baixa do estoque, conforme o cadastro (o servidor confere o saldo antes de dar baixa). */
export function itensBaixaCorpoPronto(r: Registro | null | undefined): ItemBaixa[] {
    if (!r) return [];
    const a: any = r;
    const itens: ItemBaixa[] = [];

    if (txt(a.urna)) itens.push({ nome: `Urna · ${txt(a.urna)}`, qtd: "× 1", local: nomeDeposito(a.urna_deposito_nome) });

    if (txt(a.roupa)) {
        const propria = marcado(a.roupa_propria) || /pr[óo]pria/i.test(txt(a.roupa));
        itens.push(
            propria
                ? { nome: "Roupa (própria da família)", qtd: "sem baixa", semBaixa: true }
                : { nome: `Roupa · ${txt(a.roupa)}`, qtd: "× 1", local: nomeDeposito(a.roupa_deposito_nome) },
        );
    }
    if (ehSim(a.veu)) itens.push({ nome: txt(a.veu_item) ? `Véu · ${txt(a.veu_item)}` : "Véu", qtd: "× 1", local: nomeDeposito(a.veu_deposito_nome) });
    if (ehSim(a.cordao)) itens.push({ nome: txt(a.cordao_item) ? `Cordão · ${txt(a.cordao_item)}` : "Cordão São Francisco", qtd: "× 1", local: nomeDeposito(a.cordao_deposito_nome) });
    if (ehSim(a.kit_lanche)) itens.push({ nome: "Kit lanche", qtd: "× 1" });

    // Coroas: só as artificiais saem do estoque (as naturais são feitas sob pedido). Uma linha por local.
    const coroas: any[] = Array.isArray(a.coroas_itens) ? a.coroas_itens : [];
    const porLocal = new Map<string, number>();
    for (const c of coroas) {
        if (!/artificial/i.test(txt(c?.tipo_coroa))) continue;
        const local = nomeDeposito(c?.deposito_nome);
        porLocal.set(local, (porLocal.get(local) || 0) + 1);
    }
    porLocal.forEach((qtd, local) => itens.push({ nome: "Coroa de flores artificial", qtd: `× ${qtd}`, local }));

    if (ehSim(a.invol)) itens.push({ nome: txt(a.invol_item) ? `Invólucro · ${txt(a.invol_item)}` : "Invólucro", qtd: "× 1", local: nomeDeposito(a.invol_deposito_nome) });

    // Insumos da conservação (tanatopraxia): os produtos lançados na conservação, com quantidade e depósito.
    if (ehSim(a.tanato)) {
        const insumos = insumosDaConservacao(a);
        if (insumos) {
            const local = depositoDosInsumos(a);
            for (const i of insumos) itens.push({ nome: `Insumo · ${i.nome}`, qtd: `× ${i.qtd}`, local });
        } else {
            // Registro antigo sem a lista de produtos: mostra o checklist marcado.
            const arr: any = a.arrumacao && typeof a.arrumacao === "object" ? a.arrumacao : null;
            if (arr) {
                const nomes: Record<string, string> = {
                    luvas: "Luvas", palha: "Palha", tamponamento: "Tamponamento", maquiagem: "Maquiagem", algodao: "Algodão",
                    cordao: "Cordão", barba: "Barba", ta32: "TA-32", fluido_cavitario: "Fluído cavitário", formol: "Formol", mascara: "Máscara",
                };
                for (const [k, nome] of Object.entries(nomes)) if (arr[k]) itens.push({ nome: `Insumo · ${nome}`, qtd: "conforme a conservação" });
            }
        }
    }
    return itens;
}
