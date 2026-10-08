/**
 * Motor da organização do menu (08/10/2026).
 *
 * Três camadas, nesta ordem:
 *  1. Padrão do sistema: MODULOS e FIXOS do modulos.tsx (o código).
 *  2. Organização da Gestão (tela /organizar-menu, salva no menu_modulos.php): módulos, seções, em que módulo cada tela fica e os fixos.
 *  3. Preferências do usuário (Personalizar menu): ordem e o que ele escondeu. Só muda a visão DELE.
 *
 * Nada aqui libera ou bloqueia tela: quem decide é a permissão (slugs de cada tela), como antes.
 * Tela nova no código, que a organização salva ainda não conhece, entra sozinha no módulo padrão dela.
 */
import { IconFolder } from "@tabler/icons-react";
import { FIXOS, MODULOS, type ItemModulo, type Modulo } from "./modulos";
import { iconePorNome, nomeDoIcone } from "./icones";

export type ItemConfig = { id: string; secao?: string };
export type ModuloConfig = { id: string; titulo: string; desc: string; icone: string; itens: ItemConfig[] };
export type TelaRetrato = { titulo: string; rota: string; paginas: string[]; alternativas?: { pagina: string; rota: string }[] };

/** Organização salva pela Gestão. `padrao: true` = usar o padrão do código (o retrato das telas continua valendo para os atalhos). */
export type ConfigMenu = {
    v?: number;
    padrao?: boolean;
    modulos: ModuloConfig[];
    fixos: string[];
    /** Módulos do padrão que a Gestão excluiu (para não voltarem sozinhos). */
    removidos?: string[];
    /** Retrato das telas, usado pelo barra_atalhos.php para conferir a permissão dos atalhos. */
    telas?: Record<string, TelaRetrato>;
};

/** Preferências de um usuário. */
export type PrefsMenu = {
    v?: number;
    ordem_modulos?: string[];
    ordem_itens?: Record<string, string[]>;
    ocultos_modulos?: string[];
    ocultos_itens?: string[];
    /** Ícone escolhido para cada atalho (id do atalho → nome do ícone). */
    icones?: Record<string, string>;
};

export type TelaCatalogo = { item: ItemModulo; moduloPadrao: string | null };

let catalogoCache: Map<string, TelaCatalogo> | null = null;

/** Todas as telas que o código conhece, por id (as dos módulos e os fixos). */
export function catalogoTelas(): Map<string, TelaCatalogo> {
    if (catalogoCache) return catalogoCache;
    const cat = new Map<string, TelaCatalogo>();
    for (const m of MODULOS) for (const i of m.itens) if (!cat.has(i.id)) cat.set(i.id, { item: i, moduloPadrao: m.id });
    for (const f of FIXOS) if (!cat.has(f.id)) cat.set(f.id, { item: f, moduloPadrao: null });
    catalogoCache = cat;
    return cat;
}

/** Mantém juntas as telas da mesma seção, na ordem em que cada seção aparece pela primeira vez. Telas sem seção ficam no começo. */
export function agruparPorSecao<T extends { secao?: string }>(itens: T[]): T[] {
    const ordem: string[] = [];
    for (const i of itens) {
        const s = i.secao || "";
        if (!ordem.includes(s)) ordem.push(s);
    }
    if (ordem.includes("")) {
        ordem.splice(ordem.indexOf(""), 1);
        ordem.unshift("");
    }
    return ordem.flatMap((s) => itens.filter((i) => (i.secao || "") === s));
}

/** Seções do módulo, na ordem em que aparecem. */
export function secoesDe(itens: { secao?: string }[]): string[] {
    const out: string[] = [];
    for (const i of itens) if (i.secao && !out.includes(i.secao)) out.push(i.secao);
    return out;
}

function hubDe(id: string, base?: Modulo): Modulo["hub"] {
    return base ? base.hub : { href: `/modulo/${id}`, slug: "" };
}

/** Junta o padrão do código com a organização salva pela Gestão. Sem organização (ou com padrao: true), devolve o padrão. */
export function montarMenu(config: ConfigMenu | null | undefined): { modulos: Modulo[]; fixos: ItemModulo[] } {
    if (!config || config.padrao || !Array.isArray(config.modulos) || !config.modulos.length) {
        return { modulos: MODULOS, fixos: FIXOS };
    }
    const cat = catalogoTelas();
    const padrao = new Map(MODULOS.map((m) => [m.id, m]));
    const usados = new Set<string>();
    const res: Modulo[] = [];

    for (const mc of config.modulos) {
        if (!mc || !mc.id || res.some((r) => r.id === mc.id)) continue;
        const base = padrao.get(mc.id);
        const itens: ItemModulo[] = [];
        for (const ic of mc.itens || []) {
            const t = cat.get(ic?.id);
            if (!t || usados.has(ic.id)) continue;
            usados.add(ic.id);
            itens.push({ ...t.item, secao: ic.secao || undefined });
        }
        res.push({
            id: mc.id,
            titulo: mc.titulo || base?.titulo || mc.id,
            desc: mc.desc ?? base?.desc ?? "",
            icone: iconePorNome(mc.icone) || base?.icone || IconFolder,
            hub: hubDe(mc.id, base),
            paraTodos: base?.paraTodos,
            selo: base?.selo,
            itens,
        });
    }

    // Módulo novo no código (que a organização ainda não conhece) entra no fim, a menos que a Gestão o tenha excluído.
    const removidos = new Set(config.removidos || []);
    for (const m of MODULOS) if (!res.some((r) => r.id === m.id) && !removidos.has(m.id)) res.push({ ...m, itens: [] });

    // Tela sem lugar (nova no código): vai para o módulo padrão dela; se ele foi excluído, para o último módulo.
    for (const m of MODULOS) {
        for (const it of m.itens) {
            if (usados.has(it.id)) continue;
            usados.add(it.id);
            const destino = res.find((r) => r.id === m.id) || res[res.length - 1];
            if (destino) destino.itens.push({ ...it });
        }
    }
    for (const r of res) r.itens = agruparPorSecao(r.itens);

    const fixosIds = Array.isArray(config.fixos) ? config.fixos : FIXOS.map((f) => f.id);
    const fixos = fixosIds
        .map((id) => FIXOS.find((f) => f.id === id) || cat.get(id)?.item)
        .filter((f): f is ItemModulo => !!f);

    return { modulos: res, fixos };
}

/** Aplica a visão pessoal: ordem dos módulos, ordem das telas (dentro da seção) e o que o usuário escondeu. */
export function aplicarPreferencias(modulos: Modulo[], prefs: PrefsMenu | null | undefined): Modulo[] {
    if (!prefs) return modulos;
    const ocultosM = new Set(prefs.ocultos_modulos || []);
    const ocultosI = new Set(prefs.ocultos_itens || []);
    const pos = (lista: string[] | undefined, id: string, reserva: number) => {
        const i = (lista || []).indexOf(id);
        return i < 0 ? 10000 + reserva : i;
    };
    return modulos
        .map((m, i) => ({ m, i }))
        .sort((a, b) => pos(prefs.ordem_modulos, a.m.id, a.i) - pos(prefs.ordem_modulos, b.m.id, b.i))
        .map(({ m }) => m)
        .filter((m) => !ocultosM.has(m.id))
        .map((m) => {
            const secoes = ["", ...secoesDe(m.itens)];
            const ordem = prefs.ordem_itens?.[m.id];
            const itens = m.itens
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => !ocultosI.has(it.id))
                .sort(
                    (a, b) =>
                        secoes.indexOf(a.it.secao || "") - secoes.indexOf(b.it.secao || "") ||
                        pos(ordem, a.it.id, a.i) - pos(ordem, b.it.id, b.i),
                )
                .map(({ it }) => it);
            return { ...m, itens };
        });
}

/** Retrato de todas as telas do código (vai junto com a organização, para a barra de atalhos). */
export function retratoTelas(): Record<string, TelaRetrato> {
    const out: Record<string, TelaRetrato> = {};
    catalogoTelas().forEach(({ item }, id) => {
        const t: TelaRetrato = { titulo: item.titulo, rota: item.href, paginas: item.slugs };
        if (item.alternativas?.length) t.alternativas = item.alternativas.map((a) => ({ pagina: a.slug, rota: a.href }));
        out[id] = t;
    });
    return out;
}

/** O retrato salvo está desatualizado (tela nova no código, ou nunca salvo)? */
export function retratoDesatualizado(config: ConfigMenu | null | undefined): boolean {
    const salvo = config?.telas || {};
    return Array.from(catalogoTelas().keys()).some((id) => !salvo[id]);
}

/** Converte o menu (como a tela Organizar menu edita) no formato que é salvo. */
export function paraConfig(modulos: Modulo[], fixos: ItemModulo[], removidos: string[] = []): ConfigMenu {
    return {
        v: 1,
        modulos: modulos.map((m) => ({
            id: m.id,
            titulo: m.titulo,
            desc: m.desc,
            icone: nomeDoIcone(m.icone) || "folder",
            itens: m.itens.map((i) => (i.secao ? { id: i.id, secao: i.secao } : { id: i.id })),
        })),
        fixos: fixos.map((f) => f.id),
        removidos,
        telas: retratoTelas(),
    };
}

/** Id para um módulo novo, a partir do nome (sem acento, minúsculo, com hífen), sem repetir os existentes. */
export function idParaModulo(nome: string, existentes: string[]): string {
    const base =
        nome
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 30) || "modulo";
    let id = base;
    for (let n = 2; existentes.includes(id); n++) id = `${base}-${n}`;
    return id;
}
