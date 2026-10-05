"use client";

/**
 * Números mostrados como selo no menu e na barra de baixo (e no resumo do Início).
 *
 * Usa dados que o sistema já tem; cada número falha em silêncio (null = não mostra). A consulta é única para a tela
 * inteira (menu + Início usam o mesmo resultado) e se atualiza a cada 60 s e quando a janela volta ao foco.
 *
 *  - servicos / recolher / aguardando: informativo.php?listar=1, com a MESMA regra do Quadro (concluídos não contam)
 *  - coroas: coroas.php?listar=1&grupo=confeccao (fila de confecção)
 *  - requisicoes: requisicoes.php (fila, para quem opera; senão, as minhas abertas)
 *  - estoque: materiais_gerais.php?init=1 (produtos no mínimo ou abaixo)
 *  - avisos: avisos.php?listar=1 (os que ainda não foram finalizados)
 *
 * Chat: hoje o Chat é a Aurora e não tem contador de não lidas; o selo do Chat só existirá quando houver chat interno.
 */

import { useEffect, useState } from "react";
import { aguardaAcaoDe, aguardandoRecolhimento, atendimentoDeveFicarNoQuadro, type RegistroRegra } from "@/components/atendimentos/regrasQuadro";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const INTERVALO_MS = 60_000;

export type Contadores = {
    nome: string;
    servicos: number | null;
    recolher: number | null;
    aguardando: number | null;
    coroas: number | null;
    requisicoes: number | null;
    estoque: number | null;
    avisos: number | null;
};

const VAZIO: Contadores = { nome: "", servicos: null, recolher: null, aguardando: null, coroas: null, requisicoes: null, estoque: null, avisos: null };

let estado: Contadores = { ...VAZIO };
const ouvintes = new Set<() => void>();
let temAcesso: (slug: string) => boolean = () => false;
let timer: number | undefined;
let ctl: AbortController | null = null;
let emAndamento = false;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
    try {
        const r = await fetch(url, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" }, signal });
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch {
        return null;
    }
}

function publicar(parcial: Partial<Contadores>) {
    estado = { ...estado, ...parcial };
    ouvintes.forEach((f) => f());
}

async function atualizar() {
    if (emAndamento) return;
    emAndamento = true;
    ctl?.abort();
    ctl = new AbortController();
    const sig = ctl.signal;
    const has = temAcesso;
    const t = Date.now();

    try {
        const who = await getJson<{ nome?: string }>(`${ENDPOINT}/pai_api.php?action=whoami&_=${t}`, sig);
        const completo = String(who?.nome || "").trim();
        if (completo) publicar({ nome: completo });

        // Quadro e Minhas OS são de todos: os números de atendimento também.
        const lista = await getJson<RegistroRegra[]>(`${ENDPOINT}/informativo.php?listar=1&_=${t}`, sig);
        if (Array.isArray(lista)) {
            const noQuadro = lista.filter(atendimentoDeveFicarNoQuadro);
            publicar({
                servicos: noQuadro.length,
                recolher: noQuadro.filter(aguardandoRecolhimento).length,
                aguardando: completo ? noQuadro.filter((r) => aguardaAcaoDe(r, completo)).length : null,
            });
        }

        const av = await getJson<{ finalizado?: number | string | boolean }[]>(`${ENDPOINT}/avisos.php?listar=1&_nocache=${t}`, sig);
        if (Array.isArray(av)) {
            publicar({ avisos: av.filter((a) => !(Number(a?.finalizado) === 1 || a?.finalizado === true)).length });
        }

        if (has("coroa-de-flores")) {
            const j = await getJson<{ sucesso?: boolean; meta?: { total?: number } }>(`${ENDPOINT}/coroas.php?listar=1&grupo=confeccao&page=1&per_page=1`, sig);
            if (j?.sucesso && typeof j.meta?.total === "number") publicar({ coroas: j.meta.total });
        }

        if (has("requisicoes") || has("requisicao")) {
            const operador = has("requisicoes");
            const url = operador
                ? `${ENDPOINT}/requisicoes.php?action=fila&_=${t}`
                : `${ENDPOINT}/requisicoes.php?action=minhas&status=PENDENTE,EM_SEPARACAO,EM_TRANSITO&limit=50&_=${t}`;
            const j = await getJson<{ ok?: boolean; rows?: unknown[] }>(url, sig);
            if (j?.ok && Array.isArray(j.rows)) publicar({ requisicoes: j.rows.length });
        }

        if (has("geral") || has("estoque") || has("produtos")) {
            const j = await getJson<{
                ok?: boolean;
                saldos?: { produto_id: number; quantidade: number | string; minimo?: number | string; maximo?: number | string }[];
            }>(`${ENDPOINT}/materiais_gerais.php?init=1&_ts=${t}`, sig);
            if (j?.ok && Array.isArray(j.saldos)) {
                const baixos = new Set<number>();
                for (const s of j.saldos) {
                    const q = Math.max(0, Math.floor(Number(s.quantidade) || 0));
                    const min = Math.max(0, Math.floor(Number(s.minimo) || 0));
                    const max = Math.max(0, Math.floor(Number(s.maximo) || 0));
                    if (min > 0 && max > 0 && q <= min) baixos.add(Number(s.produto_id));
                }
                publicar({ estoque: baixos.size });
            }
        }
    } finally {
        emAndamento = false;
    }
}

/** perms = o valor de usePerms().perms (null enquanto carrega); has = usePerms().has. */
export function useContadores(perms: unknown, has: (slug: string) => boolean): Contadores {
    const [, forcar] = useState(0);
    const pronto = perms != null;

    useEffect(() => {
        temAcesso = has;
    });

    useEffect(() => {
        const f = () => forcar((n) => n + 1);
        ouvintes.add(f);
        return () => {
            ouvintes.delete(f);
        };
    }, []);

    useEffect(() => {
        if (!pronto) return;
        void atualizar();
        if (timer === undefined) {
            timer = window.setInterval(() => void atualizar(), INTERVALO_MS);
        }
        const aoFocar = () => void atualizar();
        window.addEventListener("focus", aoFocar);
        return () => {
            window.removeEventListener("focus", aoFocar);
            if (ouvintes.size === 0 && timer !== undefined) {
                window.clearInterval(timer);
                timer = undefined;
            }
        };
    }, [pronto]);

    return estado;
}

/** Selo no formato do mockup: 2 dígitos; vazio quando 0 ou desconhecido. */
export function formatarSelo(n: number | null | undefined): string {
    if (n == null || n <= 0) return "";
    return n > 99 ? "99+" : String(n).padStart(2, "0");
}
