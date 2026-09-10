import type { MateriaisMap } from "./Api";
import { traduzirFase } from "./ConstantesFases";
import { RESUMO_SECTIONS } from "./ConstantesResumo";
import { formataSeDataIso } from "./UtilDatas";
import {
    normalizarChaveVisual,
    overrideCampoNome,
    substituirRotuloVisual,
    titleCaseFromSnake,
} from "./UtilTexto";

export type CampoRelatorio = {
    chave: string;
    label: string;
    valor: string;
};

export type SecaoRelatorio = {
    id: string;
    titulo: string;
    campos: CampoRelatorio[];
};

export type MaterialRelatorio = {
    categoria: string;
    nome: string;
    qtd: number;
};

export type DetalhesLogFormatados = {
    campos: CampoRelatorio[];
    materiais: MaterialRelatorio[];
    arrumacao: string[];
    insumos: MaterialRelatorio[];
    coroas: string[];
    tecnicos: CampoRelatorio[];
    textoLivre: string[];
};


const ROTULOS_DERIVADOS: Record<string, string> = {
    materiais: "Materiais de Assistência",
    insumos_tanatopraxia: "Insumos Tanatopraxia",
    coroas_detalhes: "Coroas de Flores",
    conservacao_itens: "Conservação do Corpo",
};

const CHAVES_DERIVADAS_POR_SECAO: Record<string, string[]> = {
    servicos: ["conservacao_itens"],
    itens: ["insumos_tanatopraxia", "coroas_detalhes"],
};

const CAMPOS_TECNICOS_EXATOS = new Set([
    "id",
    "sepultamento_id",
    "atendimento_id",
    "operation_id",
    "origem",
    "acao",
    "sem_alteracoes",
    "status",
    "status_novo",
    "created_at",
    "updated_at",
    "atualizado_em",
    "materiais_json",
    "arrumacao_json",
    "coroas_itens",
    "foto_falecido",
    "foto_falecido_url",
    "foto_url",
    "foto_principal",
    "foto_principal_url",
    "assinatura_responsavel",
    "assinatura_requerente",
    "responsavel_velorio_id",
    "responsavel_sepultamento_id",
    "roupa_propria",
]);

const CHAVES_ESTRUTURAIS = new Set([
    "id",
    "acao",
    "sem_alteracoes",
    "status",
    "status_novo",
    "created_at",
    "updated_at",
    "atualizado_em",
    "materiais_json",
    "arrumacao_json",
    "coroas_itens",
]);

function safeJsonParse(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;

    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

function asBoolLocal(v: any): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v !== "string") return false;
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "sim" || s === "on";
}

function formatCpf(value: string) {
    const d = String(value || "").replace(/\D+/g, "");
    if (d.length !== 11) return value;
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function normalizarMaterialKey(k: string) {
    return String(k || "").trim().toLowerCase().replace(/\s+/g, "");
}

function labelFromKey(key: string) {
    const m = String(key).match(/^(item|subitem)\s*:\s*(.+)$/i);
    if (m) {
        const tipo = m[1].toLowerCase() === "subitem" ? "Subitem" : "Item";
        return `${tipo} ${String(m[2]).trim()}`;
    }

    return overrideCampoNome(
        key,
        titleCaseFromSnake(String(key).replace(/:/g, "_")),
    );
}

function resolveMaterialLabel(
    key: string,
    v: any,
    materiaisMap?: MateriaisMap,
): { categoria: string; nome: string } {
    const nomeInformado =
        (typeof v?.nome === "string" && v.nome.trim()) ||
        (typeof v?.rotulo === "string" && v.rotulo.trim()) ||
        (typeof v?.label === "string" && v.label.trim()) ||
        "";

    const fromMap = materiaisMap?.[normalizarMaterialKey(key)];

    return {
        categoria:
            (typeof v?.categoria_nome === "string" && v.categoria_nome.trim()) ||
            (typeof v?.categoria === "string" && v.categoria.trim()) ||
            fromMap?.categoria ||
            "Material",
        nome: nomeInformado || fromMap?.nome || labelFromKey(key),
    };
}

export function campoEhTecnico(key: string) {
    const raw = String(key || "").trim();
    const k = normalizarChaveVisual(key);

    if (!k) return true;
    if (raw.startsWith("_")) return true;
    if (CAMPOS_TECNICOS_EXATOS.has(k)) return true;
    if (k.endsWith("_produto_id")) return true;
    if (k.endsWith("_codigo_barras")) return true;
    if (k.endsWith("_deposito_nome")) return true;
    if (k.endsWith("_device_id")) return true;
    if (k.endsWith("_usuario_id")) return true;
    if (k.includes("operation_id")) return true;
    if (k.includes("sync_") || k.includes("offline_")) return true;
    if (k.startsWith("homenagem_") || k.startsWith("legado_luz_")) return true;
    if (k === "codigo_homenagem") return true;
    if (k.endsWith("_url") || k.endsWith("_slug")) return true;

    return false;
}

export function campoEhEstrutural(key: string) {
    return CHAVES_ESTRUTURAIS.has(normalizarChaveVisual(key));
}

export function formatarValorRelatorio(key: string, value: any): string {
    if (value == null) return "";
    if (Array.isArray(value) || typeof value === "object") return "";

    let texto = String(value).trim();
    if (!texto) return "";
    if (texto === "[object Object]") return "";

    const k = normalizarChaveVisual(key);

    if (texto.toLowerCase().startsWith("fase")) {
        texto = traduzirFase(texto) || texto;
    }

    if (k.includes("cpf")) {
        texto = formatCpf(texto);
    } else if (
        k.includes("data") ||
        k.includes("nascimento") ||
        k.includes("falecimento")
    ) {
        texto = formataSeDataIso(texto);
    }

    return substituirRotuloVisual(texto);
}

export function campoRelatorioDe(key: string, value: any): CampoRelatorio | null {
    const valor = formatarValorRelatorio(key, value);
    if (!valor) return null;

    const chave = normalizarChaveVisual(key);

    return {
        chave,
        label:
            ROTULOS_DERIVADOS[chave] ??
            overrideCampoNome(key, titleCaseFromSnake(chave)),
        valor,
    };
}

function textoSimNaoEhNao(value: any): boolean {
    const s = String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return s === "nao" || s === "n" || s === "0" || s === "false";
}

function textoMateriais(items: MaterialRelatorio[]): string {
    return items
        .map((item) => {
            const categoria =
                item.categoria && item.categoria !== "Material"
                    ? `${item.categoria}: `
                    : "";
            return `${categoria}${item.nome} (${item.qtd})`;
        })
        .join(" • ");
}

function prepararOrigemResumo(
    resumo?: Record<string, any>,
    materiaisMap?: MateriaisMap,
): Record<string, any> {
    const origem: Record<string, any> = { ...(resumo || {}) };

    // Materiais de assistência
    const materiais = extrairMateriais(origem.materiais_json, materiaisMap);
    if (materiais.length) {
        origem.materiais = textoMateriais(materiais);
    }

    // Conservação / Insumos Tanatopraxia
    const arr = extrairArrumacao(origem.arrumacao_json ?? origem.arrumacao);
    if (arr.arrumacao.length) {
        origem.conservacao_itens = arr.arrumacao.join(", ");
    }
    if (arr.insumos.length) {
        origem.insumos_tanatopraxia = textoMateriais(arr.insumos);
    }

    // Coroas
    const coroas = extrairCoroas(origem.coroas_itens);
    if (coroas.length) {
        origem.coroas_detalhes = coroas.join(" • ");

        // Quando temos a lista estruturada, não repete os campos legados
        // de um único modelo/tipo.
        delete origem.coroa_tipo;
        delete origem.coroa_modelo;
    }

    // Campos dependentes só fazem sentido quando o serviço/item está ativo.
    if (textoSimNaoEhNao(origem.veu)) {
        delete origem.veu_item;
    }

    if (textoSimNaoEhNao(origem.cordao)) {
        delete origem.cordao_item;
    }

    if (textoSimNaoEhNao(origem.invol)) {
        delete origem.invol_item;
    }

    if (textoSimNaoEhNao(origem.coroa_flores)) {
        delete origem.coroa_tipo;
        delete origem.coroa_modelo;
        delete origem.coroas_detalhes;
    }

    return origem;
}

export function organizarResumoRelatorio(
    resumo?: Record<string, any>,
    materiaisMap?: MateriaisMap,
) {
    const origem = prepararOrigemResumo(resumo, materiaisMap);
    const usados = new Set<string>();
    const secoes: SecaoRelatorio[] = [];

    for (const config of RESUMO_SECTIONS) {
        const campos: CampoRelatorio[] = [];
        const chaves = [
            ...config.chaves,
            ...(CHAVES_DERIVADAS_POR_SECAO[config.id] || []),
        ];

        for (const key of chaves) {
            const valor = origem[key];
            const campo = campoRelatorioDe(key, valor);
            if (!campo) continue;

            usados.add(normalizarChaveVisual(key));
            campos.push(campo);
        }

        if (campos.length) {
            secoes.push({ id: config.id, titulo: config.titulo, campos });
        }
    }

    const extras: CampoRelatorio[] = [];
    const tecnicos: CampoRelatorio[] = [];

    for (const [key, value] of Object.entries(origem)) {
        const k = normalizarChaveVisual(key);
        if (!k || usados.has(k)) continue;

        if (campoEhTecnico(key)) {
            const campo = campoRelatorioDe(key, value);
            if (campo) tecnicos.push(campo);
            continue;
        }

        if (campoEhEstrutural(key)) continue;

        const campo = campoRelatorioDe(key, value);
        if (campo) extras.push(campo);
    }

    if (extras.length) {
        secoes.push({
            id: "outras",
            titulo: "Outras informações",
            campos: extras,
        });
    }

    return { secoes, tecnicos };
}

function extrairMateriais(
    raw: any,
    materiaisMap?: MateriaisMap,
): MaterialRelatorio[] {
    const obj = safeJsonParse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];

    const out: MaterialRelatorio[] = [];

    for (const [key, vv] of Object.entries(obj)) {
        const v: any = vv || {};
        const qtdNum = Number(v?.qtd ?? v?.quantidade ?? 0);
        const qtd = Number.isFinite(qtdNum) ? Math.max(0, Math.floor(qtdNum)) : 0;
        const checked = asBoolLocal(v?.checked) || qtd > 0;
        if (!checked || qtd <= 0) continue;

        const { categoria, nome } = resolveMaterialLabel(key, v, materiaisMap);
        out.push({ categoria, nome, qtd });
    }

    return out.sort((a, b) =>
        `${a.categoria} ${a.nome}`.localeCompare(`${b.categoria} ${b.nome}`, "pt-BR", {
            sensitivity: "base",
        }),
    );
}

function extrairArrumacao(raw: any) {
    const obj = safeJsonParse(raw);
    const arrumacao: string[] = [];
    const insumos: MaterialRelatorio[] = [];

    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return { arrumacao, insumos };
    }

    const ignorar = new Set([
        "deposito_nome",
        "deposito",
        "local",
        "itens",
        "items",
    ]);

    for (const [key, value] of Object.entries(obj)) {
        const k = normalizarChaveVisual(key);
        if (ignorar.has(k)) continue;
        if (asBoolLocal(value)) {
            arrumacao.push(overrideCampoNome(key, titleCaseFromSnake(k)));
        }
    }

    const itensRaw = (obj as any).itens ?? (obj as any).items;
    const lista = Array.isArray(itensRaw)
        ? itensRaw
        : itensRaw && typeof itensRaw === "object"
            ? Object.values(itensRaw)
            : [];

    for (const item of lista as any[]) {
        if (!item || typeof item !== "object") continue;
        if (item.checked === false || item.checked === 0 || item.checked === "0") continue;

        const qtd = Math.max(0, Math.floor(Number(item.qtd ?? item.quantidade ?? 0) || 0));
        if (qtd <= 0) continue;

        const pid = Number(item.produto_id ?? item.id ?? 0) || 0;
        const nome = String(item.nome ?? "").trim() || (pid ? `Produto ${pid}` : "Insumo");
        insumos.push({ categoria: "Insumos Tanatopraxia", nome, qtd });
    }

    return { arrumacao, insumos };
}

function extrairCoroas(raw: any): string[] {
    const value = safeJsonParse(raw) ?? raw;
    if (!Array.isArray(value)) return [];

    return value
        .map((item: any, index: number) => {
            if (item == null) return "";
            if (typeof item !== "object") return String(item).trim();

            const tipo = String(item.tipo_coroa ?? item.tipo ?? "").trim();
            const modelo = String(item.modelo_coroa ?? item.modelo ?? item.nome ?? "").trim();
            const frase = String(item.frase ?? item.observacao ?? "").trim();
            const partes = [tipo, modelo, frase].filter(Boolean);

            return partes.length ? `${index + 1}. ${partes.join(" | ")}` : `Coroa ${index + 1}`;
        })
        .filter(Boolean);
}

function pushUnicoCampo(lista: CampoRelatorio[], campo: CampoRelatorio | null) {
    if (!campo) return;
    const existe = lista.some(
        (x) => x.chave === campo.chave && x.valor === campo.valor,
    );
    if (!existe) lista.push(campo);
}

export function extrairDetalhesLogHumanos(
    raw: any,
    materiaisMap?: MateriaisMap,
): DetalhesLogFormatados {
    const out: DetalhesLogFormatados = {
        campos: [],
        materiais: [],
        arrumacao: [],
        insumos: [],
        coroas: [],
        tecnicos: [],
        textoLivre: [],
    };

    if (raw == null || raw === "") return out;

    const obj = safeJsonParse(raw);

    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        const texto = String(raw).trim();
        if (texto && texto !== "[object Object]") {
            out.textoLivre.push(substituirRotuloVisual(texto));
        }
        return out;
    }

    if (Object.prototype.hasOwnProperty.call(obj, "materiais_json")) {
        out.materiais.push(
            ...extrairMateriais((obj as any).materiais_json, materiaisMap),
        );
    }

    for (const [key, value] of Object.entries(obj)) {
        const k = normalizarChaveVisual(key);

        if (k === "materiais_json" || k === "id" || k === "acao" || k === "sem_alteracoes") {
            continue;
        }

        if (k === "arrumacao_json" || k === "arrumacao") {
            const arr = extrairArrumacao(value);
            out.arrumacao.push(...arr.arrumacao);
            out.insumos.push(...arr.insumos);
            continue;
        }

        if (k === "coroas_itens") {
            out.coroas.push(...extrairCoroas(value));
            continue;
        }

        const matQtd = key.match(/^materiais_(.+?)_qtd$/i);
        if (matQtd) {
            const qtd = Math.max(0, Math.floor(Number(value) || 0));
            if (qtd > 0) {
                out.materiais.push({
                    categoria: "Material",
                    nome: overrideCampoNome(matQtd[1], titleCaseFromSnake(matQtd[1])),
                    qtd,
                });
            }
            continue;
        }

        if (campoEhTecnico(key)) {
            const campo = campoRelatorioDe(key, value);
            if (campo) pushUnicoCampo(out.tecnicos, campo);
            continue;
        }

        if (Array.isArray(value)) {
            const primitivos = value.filter(
                (v) => v == null || typeof v !== "object",
            );
            if (primitivos.length === value.length && primitivos.length > 0) {
                pushUnicoCampo(
                    out.campos,
                    campoRelatorioDe(key, primitivos.filter(Boolean).join(", ")),
                );
            }
            continue;
        }

        if (value && typeof value === "object") {
            continue;
        }

        pushUnicoCampo(out.campos, campoRelatorioDe(key, value));
    }

    out.arrumacao = Array.from(new Set(out.arrumacao));
    out.coroas = Array.from(new Set(out.coroas));

    return out;
}

export function contarDetalhesHumanos(detalhes: DetalhesLogFormatados) {
    return (
        detalhes.campos.length +
        detalhes.materiais.length +
        detalhes.arrumacao.length +
        detalhes.insumos.length +
        detalhes.coroas.length +
        detalhes.textoLivre.length
    );
}