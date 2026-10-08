"use client";

/**
 * useMenu(): o menu já organizado, para o menu lateral, a tela Início, as páginas de entrada, o cabeçalho e a pesquisa.
 *
 *     const menu = useMenu();
 *     menu.modulos          // organização da Gestão (padrão do código se nada foi salvo)
 *     menu.modulosPessoais  // a mesma, com a ordem e o que ESTE usuário escondeu (menu lateral e Início)
 *     menu.fixos            // itens fixos (Acesso rápido do Início)
 *
 * Busca uma vez no menu_modulos.php e guarda na memória (e no aparelho, para abrir rápido e sem internet).
 * Se o servidor não responder ou as tabelas não existirem, vale o padrão do código: o app nunca fica sem menu.
 * Depois de salvar, as telas de organização chamam recarregarMenu() (ou disparam EVENTO_MENU) e tudo se atualiza.
 */
import { useEffect, useReducer } from "react";
import { API_BASE, apiJson } from "@/components/messenger/api";
import { aplicarPreferencias, montarMenu, type ConfigMenu, type PrefsMenu } from "./menuOrganizado";
import type { ItemModulo, Modulo } from "./modulos";

export const MENU_API = `${API_BASE}/menu_modulos.php`;
export const EVENTO_MENU = "pai:menu-atualizado";

export type OrganizacaoSalva = { id: number; config: ConfigMenu | null; salvo_por: string; salvo_em: string };
export type RespostaMenu = {
    organizacao: OrganizacaoSalva | null;
    preferencias: PrefsMenu | null;
    pode_organizar: boolean;
    /** false = as tabelas do menu ainda não foram criadas no banco */
    tabelas?: boolean;
};

export type MenuPronto = {
    /** true depois da primeira resposta do servidor (ou da falha dele) */
    carregado: boolean;
    modulos: Modulo[];
    modulosPessoais: Modulo[];
    fixos: ItemModulo[];
    organizacao: OrganizacaoSalva | null;
    preferencias: PrefsMenu | null;
    podeOrganizar: boolean;
    tabelasProntas: boolean;
    recarregar: () => Promise<void>;
};

/* ===== API ===== */

export async function menuGet<T = any>(acao: string): Promise<T> {
    const j = await apiJson(`${MENU_API}?action=${encodeURIComponent(acao)}&_=${Date.now()}`);
    return j.dados as T;
}

export async function menuPost<T = any>(acao: string, corpo: Record<string, any> = {}): Promise<{ dados: T; msg: string }> {
    const j = await apiJson(`${MENU_API}?action=${encodeURIComponent(acao)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
    return { dados: j.dados as T, msg: String(j.msg || "") };
}

/* ===== Estado compartilhado (uma busca para o app inteiro) ===== */

let dados: RespostaMenu | null = null;
let carregado = false;
let buscando: Promise<void> | null = null;
let ouvindoEvento = false;
const ouvintes = new Set<() => void>();

function chaveCache(): string {
    let uid = "";
    try {
        uid = decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith("pai_uid="))?.split("=")[1] || "");
    } catch {}
    return `pai_menu_v1:${uid || "anon"}`;
}
function lerCache(): RespostaMenu | null {
    try {
        const r = window.localStorage.getItem(chaveCache());
        return r ? (JSON.parse(r) as RespostaMenu) : null;
    } catch {
        return null;
    }
}
function gravarCache(d: RespostaMenu) {
    try {
        window.localStorage.setItem(chaveCache(), JSON.stringify(d));
    } catch {}
}
function avisar() {
    ouvintes.forEach((f) => f());
}

/** Busca de novo no servidor e atualiza todas as telas abertas. */
export function recarregarMenu(): Promise<void> {
    if (buscando) return buscando;
    buscando = apiJson(`${MENU_API}?action=menu&_=${Date.now()}`, undefined, false)
        .then((j: any) => {
            dados = (j?.dados as RespostaMenu) ?? null;
            if (dados) gravarCache(dados);
        })
        .catch(() => {
            /* sem servidor: fica o que já havia (cache) ou o padrão do código */
        })
        .finally(() => {
            carregado = true;
            buscando = null;
            avisar();
        });
    return buscando;
}

/* Cálculo feito uma vez por resposta (não uma vez por componente). */
let calculadoDe: RespostaMenu | null | undefined;
let calculado: { modulos: Modulo[]; fixos: ItemModulo[]; modulosPessoais: Modulo[] } | null = null;
function calcular() {
    if (calculado && calculadoDe === dados) return calculado;
    const base = montarMenu(dados?.organizacao?.config ?? null);
    calculado = { ...base, modulosPessoais: aplicarPreferencias(base.modulos, dados?.preferencias ?? null) };
    calculadoDe = dados;
    return calculado;
}

export function useMenu(): MenuPronto {
    const [, atualizar] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        ouvintes.add(atualizar);
        if (!ouvindoEvento) {
            ouvindoEvento = true;
            window.addEventListener(EVENTO_MENU, () => void recarregarMenu());
        }
        if (!dados) {
            const c = lerCache();
            if (c) {
                dados = c;
                avisar();
            }
        }
        if (!carregado && !buscando) void recarregarMenu();
        return () => {
            ouvintes.delete(atualizar);
        };
    }, []);

    const c = calcular();
    return {
        carregado,
        modulos: c.modulos,
        modulosPessoais: c.modulosPessoais,
        fixos: c.fixos,
        organizacao: dados?.organizacao ?? null,
        preferencias: dados?.preferencias ?? null,
        podeOrganizar: !!dados?.pode_organizar,
        tabelasProntas: dados?.tabelas !== false,
        recarregar: recarregarMenu,
    };
}
