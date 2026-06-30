"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/* =========================
   Cache rápido (memória + localStorage)
   ========================= */
type CacheEntry = { exp: number; data: any };
const MEM_CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<any>>();

function getMem<T>(k: string): T | null {
    const hit = MEM_CACHE.get(k);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
        MEM_CACHE.delete(k);
        return null;
    }
    return hit.data as T;
}
function setMem(k: string, data: any, ttlMs: number) {
    MEM_CACHE.set(k, { exp: Date.now() + ttlMs, data });
}

function readLS<T>(k: string): T | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
function writeLS(k: string, v: any) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(k, JSON.stringify(v));
    } catch {
        // ignore
    }
}

async function fetchJsonFast<T = any>(
    url: string,
    opts?: { ttlMs?: number; timeoutMs?: number; cacheKey?: string }
): Promise<T> {
    const ttlMs = opts?.ttlMs ?? 8_000;
    const timeoutMs = opts?.timeoutMs ?? 12_000;
    const cacheKey = opts?.cacheKey ?? url;

    const cached = getMem<T>(cacheKey);
    if (cached) return cached;

    const inF = INFLIGHT.get(cacheKey);
    if (inF) return (await inF) as T;

    const p = (async () => {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                cache: "no-store",
                credentials: "include",
                signal: ac.signal,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = (await resp.json()) as T;
            setMem(cacheKey, data, ttlMs);
            return data;
        } finally {
            clearTimeout(t);
            INFLIGHT.delete(cacheKey);
        }
    })();

    INFLIGHT.set(cacheKey, p);
    return (await p) as T;
}

/* =========================
   Tipos
   ========================= */
type Registro = {
    data?: string;
    foto_falecido?: string;
    foto_url?: string;
    foto?: string;
    imagem?: string;
    falecido?: string;
    local_velorio?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_fim_velorio?: string;
    hora_inicio_velorio?: string;
    agente?: string;
    status?: string;
    religiao?: string;
    contato?: string;
    convenio?: string;
    observacao?: string;
    observacao_atendimento?: string;
    observacao_itens?: string;
    observacao_velorio01?: string;
    observacao_velorio02?: string;

    urna?: string;
    roupa?: string;
    assistencia?: string;
    tanato?: string;

    // ✅ novo campo (Invol)
    invol?: any;
    // ✅ novo campo (Cordão / Véu)
    cordao?: any; // "Sim"/"Não" ou 1/0 etc
    veu?: any;    // "Não" ou nome do véu


    ornamentacao?: string;
    ornamentacao_tipo?: string;

    local?: string;
    local_sepultamento?: string;

    // campos antigos
    materiais?: string;
    material?: string;

    // possíveis campos do backend/relatórios
    materiais_json?: any;
    material_json?: any;

    tipo_atendimento?: "funerario" | "terceiro";

    [key: string]: any;
};

type Aviso = { usuario?: string; mensagem?: string; criado_em?: string };

type LogItem = {
    id?: number | string;
    datahora?: string;
    acao?: string;
    status_novo?: string;
    detalhes?: any;
    usuario?: string;
};

/* =========================
   Helpers comuns
   ========================= */

/**
 * React já escapa strings.
 * O seu problema real era o backend mandar entidades HTML (&quot; etc).
 * Então aqui a gente DECODIFICA entidades para exibir bonito.
 */
function decodeHtmlEntitiesOnce(input: string): string {
    if (!input) return input;

    // Browser (client): usa textarea pra decodificar corretamente
    if (typeof window !== "undefined" && typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.innerHTML = input;
        return ta.value;
    }

    // Fallback (caso raríssimo)
    return input
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

/** algumas vezes vem “duplamente escapado” (ex: &amp;quot;) */
function decodeHtmlEntitiesDeep(input: string, maxPasses = 3): string {
    let s = String(input ?? "");
    for (let i = 0; i < maxPasses; i++) {
        const next = decodeHtmlEntitiesOnce(s);
        if (next === s) break;
        s = next;
    }
    return s;
}

// antes era "sanitize" (escapava tudo e causava &quot; na tela)
const sanitize = (t?: any) => decodeHtmlEntitiesDeep(String(t ?? ""));

const shown = (v?: any, fallback = "a definir") => {
    const s = decodeHtmlEntitiesDeep(String(v ?? "")).trim();
    return s ? s : fallback;
};

/* =========================
   Materiais (normalização para exibir no modal)
   ========================= */

type MatLookupInfo = {
    catNome: string;
    catOrdem: number;
    itemOrdem: number;
};

type MatLine = { text: string; itemKey?: string };

/** ✅ NOVO: formata quantidade sempre ANTES do nome (ex: "2x Luvas", "1x Extensão") */
function qtyPrefixFromAny(qtdRaw: any): string {
    const qtdStr = decodeHtmlEntitiesDeep(String(qtdRaw ?? "")).trim();
    if (!qtdStr) return "1x";

    const normalized = qtdStr.replace(",", ".").trim();
    const n = Number(normalized);

    if (Number.isFinite(n) && n > 0) {
        const isInt = Math.abs(n - Math.round(n)) < 1e-9;
        const val = isInt ? String(Math.round(n)) : normalized;
        return `${val}x`;
    }

    // tenta pegar número no começo (ex: "2 un", "3,5kg")
    const m = normalized.match(/^(\d+(?:\.\d+)?)/);
    if (m?.[1]) return `${m[1]}x`;

    // fallback: ainda assim coloca algo como "Xx"
    return `${normalized}x`;
}

/** ✅ NOVO: garante "QTDx Nome" mesmo quando veio "Nome (QTD)" ou só "Nome" */
function normalizeMatTextToQtyPrefix(text: string): string {
    const s = decodeHtmlEntitiesDeep(String(text ?? "")).replace(/\s+/g, " ").trim();
    if (!s) return s;

    // já está com "2x Nome"
    let m = s.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s*(.+)$/);
    if (m) {
        const qtd = m[1].replace(",", ".");
        const nome = m[2].trim();
        return `${qtd}x ${nome}`;
    }

    // está como "Nome (2)" -> vira "2x Nome"
    m = s.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)\s*$/);
    if (m) {
        const nome = m[1].trim();
        const qtd = m[2].replace(",", ".");
        return `${qtd}x ${nome}`;
    }

    // caso padrão: sem qtd -> 1x
    return `1x ${s}`;
}

/* ✅ NOVO (copy-safe): decide se um item é “material real” (evita "1x Sim"/"1x Item" e afins) */
function isRealMaterialForClipboard(item: string): boolean {
    const s = decodeHtmlEntitiesDeep(String(item ?? "")).trim();
    if (!s) return false;

    const low = s.toLowerCase().replace(/\s+/g, " ").trim();

    if (low === "sim" || low === "não" || low === "nao") return false;
    if (low === "1x sim" || low === "1x não" || low === "1x nao") return false;
    if (low === "item" || low === "1x item") return false;
    if (low.includes("a definir")) return false;

    return true;
}

/** ✅ detecta lixo do tipo "Json: {...}" mesmo com prefixo "1x " */
function isJsonNoiseLine(raw: any): boolean {
    const s = decodeHtmlEntitiesDeep(String(raw ?? "")).trim();
    if (!s) return false;

    const low = s.toLowerCase().replace(/\s+/g, " ").trim();

    // "json: {...}" OU "1x json: {...}" OU "2x Json: {}"
    return /^(\d+(?:[.,]\d+)?\s*[xX]\s*)?json\s*:/.test(low);
}

function normalizeMateriaisFromRegistro(registro: Registro): string[] {
    const out: string[] = [];
    const seen = new Set<string>();

    const pushItem = (raw: any) => {
        const s0 = String(raw ?? "");
        const s = decodeHtmlEntitiesDeep(s0).trim();
        if (!s) return;

        const low = s.toLowerCase().trim();

        // ✅ NOVO: mata também "1x Json: {}" (e variações)
        if (isJsonNoiseLine(s)) return;

        // continua protegendo JSON puro
        if (low.startsWith("{") || low.startsWith("[")) return;
        if (looksLikeMateriaisJson(s)) return;

        if (["selecionar...", "selecione...", "a definir"].includes(low)) return;

        // ✅ aqui garante "QTDx Nome" SEMPRE
        const withQtd = normalizeMatTextToQtyPrefix(s);
        if (!withQtd) return;

        // ✅ NOVO: se após normalizar virar algo como "1x Json: {}", corta também
        if (isJsonNoiseLine(withQtd)) return;

        if (seen.has(withQtd)) return;
        seen.add(withQtd);
        out.push(withQtd);
    };

    const pushNomeQtd = (nomeRaw: any, qtdRaw?: any) => {
        const nome = decodeHtmlEntitiesDeep(String(nomeRaw ?? "")).trim();
        if (!nome) return;

        // ✅ sempre prefixa quantidade (mesmo 1)
        const prefix = qtyPrefixFromAny(qtdRaw);
        pushItem(`${prefix} ${nome}`);
    };

    /**
     * Extrai materiais de JSON padrão:
     * {
     *   "item3": { "checked": true, "qtd": 1, "nome": "Extensão", ... },
     * }
     * ou array de objetos com {nome, checked, qtd}
     */
    const extractFromStructured = (raw: unknown): boolean => {
        const items: { nome: any; qtd?: any }[] = [];

        const walk = (node: any) => {
            if (node == null) return;

            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }

            if (isPlainObject(node)) {
                const maybeNome =
                    (node as any).nome ??
                    (node as any).name ??
                    (node as any).descricao ??
                    (node as any).descrição ??
                    (node as any).material;

                const hasChecked = Object.prototype.hasOwnProperty.call(node, "checked");
                const checkedVal = (node as any).checked;
                const qtdVal = (node as any).qtd ?? (node as any).quantidade ?? (node as any).qtd_item;

                if (maybeNome != null && (hasChecked ? asBool(checkedVal) : true)) {
                    items.push({ nome: maybeNome, qtd: qtdVal });
                }

                const containerKeys = ["itens", "items", "materiais", "materiais_json", "material_json", "data"];
                for (const k of containerKeys) {
                    if ((node as any)[k] != null) walk((node as any)[k]);
                }

                for (const [, v] of Object.entries(node)) {
                    if (v == null) continue;
                    if (typeof v === "object") {
                        walk(v);
                    }
                }
            }
        };

        walk(raw);

        if (items.length === 0) return false;

        for (const it of items) pushNomeQtd(it.nome, it.qtd);
        return true;
    };

    const addFromBooleanMap = (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) {
            if (asBool(v)) {
                const nome = overrideCampoNome(k, titleCaseFromSnake(k));
                pushItem(`1x ${nome}`);
            }
        }
    };

    const addFromMixedObject = (obj: Record<string, unknown>) => {
        // 1) pega materiais_<nome>_qtd primeiro
        for (const [key, value] of Object.entries(obj)) {
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (!m) continue;
            const valStr = decodeHtmlEntitiesDeep(String(value ?? "")).trim();
            if (!valStr) continue;

            const n = Number(valStr.replace(",", "."));
            if (!Number.isNaN(n) && n <= 0) continue;

            const base = m[1];
            const nome = overrideCampoNome(base, titleCaseFromSnake(base));
            pushItem(`${qtyPrefixFromAny(valStr)} ${nome}`);
        }

        // 2) booleans/números em materiais_<nome>
        for (const [key, value] of Object.entries(obj)) {
            if (/^materiais_.+?_qtd$/i.test(key)) continue;

            const m = key.match(/^materiais_(.+)$/i);
            if (!m) continue;

            const base = m[1];
            const nome = overrideCampoNome(base, titleCaseFromSnake(base));

            if (asBool(value)) {
                pushItem(`1x ${nome}`);
                continue;
            }

            const valStr = decodeHtmlEntitiesDeep(String(value ?? "")).trim();
            if (!valStr) continue;

            const n = Number(valStr.replace(",", "."));
            if (!Number.isNaN(n)) {
                if (n > 0) pushItem(`${qtyPrefixFromAny(valStr)} ${nome}`);
                continue;
            }

            // se não for número, mantém como texto (mas ainda prefixa 1x no nome “principal”)
            pushItem(`1x ${nome}: ${valStr}`);
        }

        // 3) se o objeto for um "mapa" comum de { item: qtd }
        for (const [k, v] of Object.entries(obj)) {
            if (k === "materiais_json" || k === "material_json") continue;
            if (/^materiais_.+/i.test(k)) continue;
            if (v == null) continue;
            if (typeof v === "object") continue;

            const valStr = decodeHtmlEntitiesDeep(String(v)).trim();
            if (!valStr) continue;

            const nome = overrideCampoNome(k, titleCaseFromSnake(k));
            const maybeNum = Number(valStr.replace(",", "."));
            if (!Number.isNaN(maybeNum)) {
                if (maybeNum > 0) pushItem(`${qtyPrefixFromAny(valStr)} ${nome}`);
            } else if (asBool(valStr)) {
                pushItem(`1x ${nome}`);
            } else {
                // sem número: vira 1x "Nome: valor"
                pushItem(`1x ${nome}: ${valStr}`);
            }
        }
    };

    const addFromUnknown = ((raw: unknown) => {
        if (raw == null || raw === "") return;

        // Array
        if (Array.isArray(raw)) {
            if (extractFromStructured(raw)) return;
            for (const it of raw) pushItem(it);
            return;
        }

        // Objeto
        if (isPlainObject(raw)) {
            if (extractFromStructured(raw)) return;

            const obj = raw as Record<string, unknown>;
            if (isLikelyBooleanMap(obj)) addFromBooleanMap(obj);
            else addFromMixedObject(obj);
            return;
        }

        // String
        if (typeof raw === "string") {
            let s = decodeHtmlEntitiesDeep(raw).trim();
            if (!s) return;

            const original = s;

            // remove prefixos comuns tipo "Json:"
            s = s.replace(/^\s*json\s*:\s*/i, "").trim();

            // 1) tenta parsear JSON
            const parsed = tryParseJsonFromStringMaybeEmbedded(s);
            if (parsed != null) {
                if (extractFromStructured(parsed)) return;
                return;
            }

            // 2) tenta extrair por regex (nome/qtd)
            const extracted = extractMateriaisByRegex(s);
            if (extracted.length) {
                extracted.forEach((it) => pushNomeQtd(it.nome, it.qtd));
                return;
            }

            // 3) se parece JSON de materiais, ignora
            if (/^\s*json\s*:/i.test(original) || looksLikeMateriaisJson(s)) return;

            // 4) listas normais
            if (s.includes("\n")) {
                s.split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .filter((line) => {
                        const low = line.toLowerCase().trim();
                        if (low.startsWith("json:")) return false;
                        if (low.startsWith("{") || low.startsWith("[")) return false;
                        if (looksLikeMateriaisJson(line)) return false;
                        return true;
                    })
                    .forEach(pushItem);
                return;
            }
            if (s.includes(";")) {
                s.split(";").map((x) => x.trim()).filter(Boolean).forEach(pushItem);
                return;
            }
            if (s.includes(",")) {
                s.split(",").map((x) => x.trim()).filter(Boolean).forEach(pushItem);
                return;
            }

            pushItem(s);
            return;
        }

        // ✅ ALTERAÇÃO: se vier number/boolean (ruído), NÃO gera material nenhum
        if (typeof raw === "number") return;
        if (typeof raw === "boolean") return;

        pushItem(String(raw));
    }) as (raw: unknown) => void;

    // 1) fontes diretas
    addFromUnknown((registro as any).materiais_json);
    addFromUnknown((registro as any).material_json);
    addFromUnknown((registro as any).materiais);
    addFromUnknown((registro as any).material);

    // 2) varredura por chaves materiais_* no próprio registro
    if (isPlainObject(registro)) {
        const obj = registro as Record<string, unknown>;
        const picked: Record<string, unknown> = {};
        let hasAny = false;
        for (const k of Object.keys(obj)) {
            if (/^materiais_.+/i.test(k)) {
                picked[k] = obj[k];
                hasAny = true;
            }
        }
        if (hasAny) {
            if (isLikelyBooleanMap(picked)) addFromBooleanMap(picked);
            else addFromMixedObject(picked);
        }
    }

    return out;
}

/* ✅ extrai materiais estruturados preservando a key "itemXX" para agrupar por categoria */
function extractMateriaisStructuredWithKey(registro: Registro): MatLine[] {
    const out: MatLine[] = [];
    const seen = new Set<string>();

    const pushItem = (raw: any, itemKey?: string) => {
        const s0 = String(raw ?? "");
        const s = decodeHtmlEntitiesDeep(s0).trim();
        if (!s) return;

        const low = s.toLowerCase().trim();

        // ✅ NOVO: mata também "1x Json: {}"
        if (isJsonNoiseLine(s)) return;

        if (low.startsWith("{") || low.startsWith("[")) return;
        if (looksLikeMateriaisJson(s)) return;
        if (["selecionar...", "selecione...", "a definir"].includes(low)) return;

        const withQtd = normalizeMatTextToQtyPrefix(s);
        if (!withQtd) return;

        // ✅ NOVO: se normalizado virar "1x Json: {}", corta também
        if (isJsonNoiseLine(withQtd)) return;

        if (seen.has(withQtd)) return;
        seen.add(withQtd);
        out.push({ text: withQtd, itemKey });
    };

    const pushNomeQtd = (nomeRaw: any, qtdRaw?: any, itemKey?: string) => {
        const nome = decodeHtmlEntitiesDeep(String(nomeRaw ?? "")).trim();
        if (!nome) return;

        const prefix = qtyPrefixFromAny(qtdRaw);
        pushItem(`${prefix} ${nome}`, itemKey);
    };

    const normalizeItemKeyFromAny = (v: any): string | undefined => {
        if (v == null) return undefined;
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return `item${n}`;
        const s = String(v).trim();
        if (/^item\d+$/i.test(s)) return s;
        return undefined;
    };

    const walk = (node: any, parentKey?: string) => {
        if (node == null) return;

        if (Array.isArray(node)) {
            node.forEach((x) => walk(x, parentKey));
            return;
        }

        if (isPlainObject(node)) {
            const maybeNome =
                (node as any).nome ??
                (node as any).name ??
                (node as any).descricao ??
                (node as any).descrição ??
                (node as any).material;

            const hasChecked = Object.prototype.hasOwnProperty.call(node, "checked");
            const checkedVal = (node as any).checked;
            const qtdVal = (node as any).qtd ?? (node as any).quantidade ?? (node as any).qtd_item;

            const inferredKey =
                normalizeItemKeyFromAny((node as any).item_id) ??
                normalizeItemKeyFromAny((node as any).itemId) ??
                normalizeItemKeyFromAny((node as any).item_key) ??
                normalizeItemKeyFromAny((node as any).id) ??
                (typeof parentKey === "string" && /^item\d+$/i.test(parentKey) ? parentKey : undefined);

            if (maybeNome != null && (hasChecked ? asBool(checkedVal) : true)) {
                pushNomeQtd(maybeNome, qtdVal, inferredKey);
            }

            const containerKeys = ["itens", "items", "materiais", "materiais_json", "material_json", "data"];
            for (const k of containerKeys) {
                if ((node as any)[k] != null) walk((node as any)[k], k);
            }

            for (const [k, v] of Object.entries(node)) {
                if (v == null) continue;
                if (typeof v === "object") walk(v, k);
            }
        }
    };

    const add = (raw: unknown) => {
        if (raw == null || raw === "") return;

        if (typeof raw === "string") {
            const s = decodeHtmlEntitiesDeep(raw).trim();
            if (!s) return;
            const parsed = tryParseJsonFromStringMaybeEmbedded(s);
            if (parsed != null) walk(parsed, undefined);
            return;
        }

        walk(raw, undefined);
    };

    add((registro as any).materiais_json);
    add((registro as any).material_json);

    return out;
}

function MateriaisValue({
    registro,
    lookup = {},
    fallback = "a definir",
}: {
    registro: Registro;
    lookup?: Record<string, MatLookupInfo>;
    fallback?: string;
}) {
    const structured = extractMateriaisStructuredWithKey(registro);
    const flat = normalizeMateriaisFromRegistro(registro);

    const lines: MatLine[] = (() => {
        if (structured.length === 0) return flat.map((t) => ({ text: t }));
        const have = new Set(structured.map((x) => x.text));
        const extras = flat.filter((t) => !have.has(t)).map((t) => ({ text: t }));
        return [...structured, ...extras];
    })();

    const filteredLines = (lines ?? []).filter((l) => isRealMaterialForClipboard(l.text) && !isJsonNoiseLine(l.text));

    if (!filteredLines || filteredLines.length === 0) return <span>{fallback}</span>;

    const groups = new Map<
        string,
        { catNome: string; catOrdem: number; items: { text: string; itemOrdem: number }[] }
    >();

    for (const it of filteredLines) {
        const info = it.itemKey ? lookup[it.itemKey] : undefined;

        const catNome = (info?.catNome ?? "(Sem categoria)").trim() || "(Sem categoria)";
        const catOrdem = info?.catOrdem ?? 9999;
        const itemOrdem = info?.itemOrdem ?? 9999;

        if (!groups.has(catNome)) groups.set(catNome, { catNome, catOrdem, items: [] });
        groups.get(catNome)!.items.push({ text: it.text, itemOrdem });
    }

    const sortedCats = [...groups.values()].sort(
        (a, b) => a.catOrdem - b.catOrdem || a.catNome.localeCompare(b.catNome)
    );

    return (
        <div className="space-y-3">
            {sortedCats.map((g) => {
                const itemsSorted = [...g.items].sort(
                    (a, b) => a.itemOrdem - b.itemOrdem || a.text.localeCompare(b.text)
                );

                return (
                    <div key={g.catNome}>
                        <div className="font-bold">{g.catNome}</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                            {itemsSorted.map((x, idx) => (
                                <li key={idx} className="break-words [overflow-wrap:anywhere]">
                                    {x.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}

/* =========================
   Local do Velório: rota (Google Maps)
   ========================= */
function ensureHttpsUrl(raw: string): string {
    const s = String(raw ?? "").trim();
    if (!s) return s;

    if (/^https?:\/\//i.test(s)) {
        return s.replace(/^http:\/\//i, "https://");
    }

    if (/^(www\.)/i.test(s)) return `https://${s}`;
    if (/^(google\.com|maps\.google\.com|www\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s))
        return `https://${s}`;

    return s;
}

function isGoogleMapsRota(raw?: string): boolean {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s) return false;

    const noProto = s.replace(/^https?:\/\//, "");
    if (noProto.includes("google.com/maps/dir")) return true;
    if (noProto.includes("maps.google.com/maps/dir")) return true;
    if (noProto.startsWith("maps.app.goo.gl/")) return true;
    if (noProto.startsWith("goo.gl/maps/")) return true;

    return false;
}

function LocalVelorioValue({ value, fallback = "a definir" }: { value?: string; fallback?: string }) {
    const raw = decodeHtmlEntitiesDeep(String(value ?? "")).trim();
    if (!raw) return <span>{fallback}</span>;

    if (isGoogleMapsRota(raw)) {
        const url = ensureHttpsUrl(raw);
        return (
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-600 hover:underline underline-offset-2"
                title="Abrir rota no Google Maps"
            >
                Abrir Rota
            </a>
        );
    }

    return <span>{shown(raw, fallback)}</span>;
}

/* Datas/horas → “a definir” para zeros e vazios */
const formatDateBr = (d?: string) =>
    !d ? "" : d.split("-").length === 3 ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}` : d;

function dateOr(d?: string) {
    const raw = (d ?? "").trim();
    if (!raw || raw === "0000-00-00" || raw === "00/00/0000") return "a definir";
    const f = formatDateBr(raw);
    if (!f || f === "00/00/0000") return "a definir";
    return f;
}

/** Mostra só dia/mês para a coluna Sepultamento, mantendo "a definir" para vazio ou zero. */
function dateDayMonthOr(d?: string) {
    const raw = (d ?? "").trim();
    if (!raw || raw === "0000-00-00" || raw === "00/00/0000") return "a definir";

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [, mm, dd] = raw.split("-");
        return `${dd}/${mm}`;
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [dd, mm] = raw.split("/");
        return `${dd}/${mm}`;
    }

    const br = raw.match(/(\d{2})\/(\d{2})/);
    if (br) return `${br[1]}/${br[2]}`;

    const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}`;

    return raw;
}

function timeOr(t?: string) {
    const raw = (t ?? "").trim();
    if (!raw) return "a definir";
    const hhmm = raw.slice(0, 5);
    if (hhmm === "00:00") return "a definir";
    return hhmm;
}

function avisoDateTimeOr(v?: string) {
    const raw = String(v ?? "").trim();
    if (!raw) return "";

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;

    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).format(d);
    } catch {
        return raw;
    }
}

/* ----------- Normalização de status (texto → faseNN) ----------- */
const ROTULO_PARA_FASE: Record<string, string> = {
    removendo: "fase01",
    "aguardando procedimento": "fase02",
    preparando: "fase03",
    "aguardando ornamentacao": "fase04",
    ornamentando: "fase05",
    "corpo pronto": "fase06",
    transportando: "fase07",
    "transportando p/ velorio": "fase07",
    "transportando p/ velório": "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "transportando p/ sepultamento": "fase09",
    "sepultamento concluido": "fase10",
    "sepultamento concluído": "fase10",
    "material recolhido": "fase11",
    concluido: "fase11",
    concluído: "fase11",
};
function normalizeKey(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function normalizarStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const s = String(status).trim();
    if (s.toLowerCase().startsWith("fase")) {
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s.toLowerCase();
        return `fase${digits.padStart(2, "0")}`.toLowerCase();
    }
    const mapeado = ROTULO_PARA_FASE[normalizeKey(s)];
    return (mapeado || s).toLowerCase();
}

/* ---------------- Status badge ---------------- */
function capStatus(s?: string) {
    switch (normalizarStatus(s)) {
        case "fase01":
            return "Removendo";
        case "fase02":
            return "Aguardando Procedimento";
        case "fase03":
            return "Preparando";
        case "fase04":
            return "Aguardando Ornamentação";
        case "fase05":
            return "Ornamentando";
        case "fase06":
            return "Corpo Pronto";
        case "fase07":
            return "Transportando P/ Velório";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Transportando P/ Sepultamento";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

function badgeClass(s?: string) {
    const x = (normalizarStatus(s) || "").toLowerCase();
    if (x === "fase01") return "bg-amber-600";
    if (x === "fase02") return "bg-zinc-600";
    if (x === "fase03") return "bg-blue-600";
    if (x === "fase04") return "bg-fuchsia-600";
    if (x === "fase05") return "bg-rose-600";
    if (x === "fase06") return "bg-emerald-600";
    if (x === "fase07") return "bg-cyan-600";
    if (x === "fase08") return "bg-violet-600";
    if (x === "fase09") return "bg-orange-600";
    if (x === "fase10") return "bg-green-700";
    if (x === "fase11") return "bg-slate-700";
    return "bg-slate-500";
}

/* Convenio chip */
type ConvenioKind = "Particular" | "Prefeitura" | "Associado" | "a definir";
function normalizeConvenio(s?: string): ConvenioKind {
    const v = (s || "").toLowerCase();
    if (!v) return "a definir";
    if (v.includes("prefeitura")) return "Prefeitura";
    if (v.includes("associad")) return "Associado";
    if (v.includes("particular")) return "Particular";
    return "a definir";
}
function convenioClass(kind: ConvenioKind) {
    switch (kind) {
        case "Particular":
            return "bg-amber-500";
        case "Prefeitura":
            return "bg-cyan-600";
        case "Associado":
            return "bg-emerald-600";
        default:
            return "bg-slate-500";
    }
}

function ConvenioBadge({
    convenio,
    size = "sm",
}: {
    convenio?: string;
    size?: "xs" | "sm";
}) {
    const kind = normalizeConvenio(convenio);
    const sizeClass =
        size === "xs"
            ? "px-1.5 py-0.5 text-[9px]"
            : "px-2.5 py-1 text-[11px]";

    return (
        <span
            className={`inline-flex items-center rounded-full font-semibold text-white ${convenioClass(
                kind
            )} ${sizeClass}`}
            title="Convênio"
        >
            {kind}
        </span>
    );
}

/* ---------------- Etapas (bolinhas) ---------------- */
const STAGE_DOT_FILLED = [
    "bg-emerald-500 border-emerald-600",
    "bg-sky-500 border-sky-600",
    "bg-violet-500 border-violet-600",
    "bg-amber-500 border-amber-600",
];
const STAGE_DOT_EMPTY = "bg-transparent border-slate-300 dark:border-slate-600";

const LABELS: Record<string, string> = {
    falecido: "Falecido",
    contato: "Contato",
    religiao: "Religião",
    convenio: "Convênio",
    urna: "Urna",
    roupa: "Roupa",
    assistencia: "Assistência",
    tanato: "Tanatopraxia",
    invol: "Invol",
    cordao: "Cordão São Francisco",
    veu: "Véu",

    local_velorio: "Local do Velório",
    data_inicio_velorio: "Data Início Velório",
    data_fim_velorio: "Data Fim Velório",
    hora_inicio_velorio: "Início Velório",
    hora_fim_velorio: "Fim Velório",
    local: "Local (Geral)",
    local_sepultamento: "Local Sepultamento",
};

const isFilled = (registro: Registro, key?: string) => {
    if (!key) return false;
    const v = registro[key];
    if (v == null) return false;
    const s = decodeHtmlEntitiesDeep(String(v)).trim().toLowerCase();
    if (!s) return false;
    if (["selecionar...", "selecione...", "a definir"].includes(s)) return false;
    if (key.startsWith("data") && (s === "0000-00-00" || s === "00/00/0000")) return false;
    if (key.startsWith("hora") && s.startsWith("00:00")) return false;
    return true;
};

function etapasPreenchidas(registro: Registro) {
    const d = [false, false, false, false];

    d[0] = ["falecido", "contato", "religiao", "convenio"].every((k) => isFilled(registro, k));
    d[1] = ["urna", "roupa", "assistencia", "tanato"].every((k) => isFilled(registro, k));
    d[2] =
        isFilled(registro, "local_velorio") &&
        isFilled(registro, "data_inicio_velorio") &&
        (isFilled(registro, "local_sepultamento") || isFilled(registro, "local"));
    d[3] =
        isFilled(registro, "hora_inicio_velorio") ||
        (isFilled(registro, "data_fim_velorio") && isFilled(registro, "hora_fim_velorio"));

    return d;
}

/* =========================
   Texto para copiar
   ========================= */
function buildClipboardText(r: Registro, lookup: Record<string, MatLookupInfo> = {}) {
    const v = (k: string) => decodeHtmlEntitiesDeep(String(r?.[k] ?? "")).trim();
    const atend = (v("convenio") || "A DEFINIR").toUpperCase();

    const ornTipoRaw = v("ornamentacao_tipo") || v("ornamentacao");
    const ornTipo = ornTipoRaw
        ? (ornTipoRaw.charAt(0).toUpperCase() + ornTipoRaw.slice(1)).replace(/\s+/g, " ")
        : "A DEFINIR";

    const involRaw = r?.invol;
    const involStr = decodeHtmlEntitiesDeep(String(involRaw ?? "")).trim().toLowerCase();
    const involYN = ["1", "true", "t", "sim", "s", "yes", "y"].includes(involStr) ? "SIM" : "NÃO";
    const cordaoRaw = decodeHtmlEntitiesDeep(String((r as any)?.cordao ?? "")).trim().toLowerCase();
    const cordaoYN = ["1", "true", "t", "sim", "s", "yes", "y"].includes(cordaoRaw) ? "SIM" : "NÃO";

    const veuTxt = getVeuText(r).toUpperCase();




    const localVelRaw = v("local_velorio") || "A DEFINIR";
    const localVelClipboard = isGoogleMapsRota(localVelRaw) ? ensureHttpsUrl(localVelRaw) : localVelRaw;

    // ====== ✅ NOVO: Materiais agrupados por categoria (ex: "Básico 01") ======
    const structured = extractMateriaisStructuredWithKey(r);
    const flat = normalizeMateriaisFromRegistro(r);

    // Une structured + extras do flat (sem duplicar)
    const linesAll: MatLine[] = (() => {
        if (structured.length === 0) return flat.map((t) => ({ text: t }));
        const have = new Set(structured.map((x) => x.text));
        const extras = flat.filter((t) => !have.has(t)).map((t) => ({ text: t }));
        return [...structured, ...extras];
    })();

    const filtered = linesAll.filter(
        (l) => isRealMaterialForClipboard(l.text) && !isJsonNoiseLine(l.text)
    );

    // Agrupa por categoria (catNome)
    const groups = new Map<string, { ordem: number; items: { text: string; itemOrdem: number }[] }>();

    for (const it of filtered) {
        const info = it.itemKey ? lookup[it.itemKey] : undefined;
        const catNome = (info?.catNome ?? "Materiais").trim() || "Materiais";
        const catOrdem = info?.catOrdem ?? 9999;
        const itemOrdem = info?.itemOrdem ?? 9999;

        if (!groups.has(catNome)) groups.set(catNome, { ordem: catOrdem, items: [] });
        groups.get(catNome)!.items.push({ text: it.text, itemOrdem });
    }

    const sortedCats = [...groups.entries()].sort(
        (a, b) => a[1].ordem - b[1].ordem || a[0].localeCompare(b[0])
    );

    const materiaisClipboardLines =
        sortedCats.length === 0
            ? []
            : [
                `*Materiais:*`,
                ...sortedCats.map(([cat, g]) => {
                    const items = [...g.items]
                        .sort((a, b) => a.itemOrdem - b.itemOrdem || a.text.localeCompare(b.text))
                        .map((x) => x.text);
                    // Ex: "*Básico 01:* 1x Bebedouro, 2x Cavalete"
                    return `*${cat}:* ${items.join(", ")}`;
                }),
            ];

    const lines = [
        `*ATENDIMENTO ${atend}*`,
        `*Falecido:* ${v("falecido") || "A DEFINIR"}`,
        `*Contato:* ${v("contato") || "A DEFINIR"}`,
        `*Religião:* ${v("religiao") || "A DEFINIR"}`,
        `*Urna:* ${v("urna") || "A DEFINIR"}`,
        `*Roupa:* ${v("roupa") || "A DEFINIR"}`,
        `*Assistência:* ${v("assistencia") || "A DEFINIR"}`,
        `*Tanato:* ${v("tanato") || "A DEFINIR"}`,
        `*Cordão São Francisco:* ${cordaoYN}`,
        `*Véu:* ${veuTxt}`,
        `*Invol:* ${involYN}`,
        `*Ornamentação:* ${ornTipo || "A DEFINIR"}`,
        ...materiaisClipboardLines,
        `*Local do Velório:* ${localVelClipboard || "A DEFINIR"}`,
        `*Agente:* ${v("agente") || "A DEFINIR"}`,
        `*Observação:* ${v("observacao") || "A DEFINIR"}`,
    ];

    return lines.join("\n\n");
}

/* =========================
   Regras do painel
   ========================= */
function isNao(v?: string) {
    const s = decodeHtmlEntitiesDeep((v || "").toString()).trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}
function isSim(v?: string) {
    const s = decodeHtmlEntitiesDeep((v || "").toString()).trim().toLowerCase();
    return s === "sim" || s === "s";
}
function isTerceiroRegistro(r: Registro) {
    if ((r as any).tipo_atendimento === "terceiro") return true;
    return isNao(r.assistencia) && isNao(r.tanato) && isNao(r.ornamentacao);
}

function involSimNao(value: any): string {
    const s = decodeHtmlEntitiesDeep(String(value ?? "")).trim().toLowerCase();
    if (!s) return "Não";
    if (["1", "true", "t", "sim", "s", "yes", "y"].includes(s)) return "Sim";
    return "Não";
}

function getVeuText(r: Registro): string {
    // 1) tenta achar um nome em campos alternativos
    const pick = (...keys: string[]) => {
        for (const k of keys) {
            const val = decodeHtmlEntitiesDeep(String((r as any)?.[k] ?? "")).trim();
            if (val) return val;
        }
        return "";
    };

    const nome =
        pick(
            "veu_item",          // ✅ adiciona isso primeiro
            "veu_nome",
            "nome_veu",
            "veuTipo",
            "veu_tipo",
            "tipo_veu",
            "veu_descricao",
            "descricao_veu"
        ) || "";


    // 2) pega o campo principal "veu"
    const rawAny = (r as any)?.veu;

    // 2a) se veio objeto (ex: {nome:"Véu Branco", checked:true})
    if (rawAny && typeof rawAny === "object" && !Array.isArray(rawAny)) {
        const obj: any = rawAny;
        const n =
            decodeHtmlEntitiesDeep(String(obj?.nome ?? obj?.name ?? obj?.descricao ?? obj?.descrição ?? "")).trim();
        if (n) return n;

        // se objeto só tiver flag
        const checked = decodeHtmlEntitiesDeep(String(obj?.checked ?? "")).trim().toLowerCase();
        if (["1", "true", "t", "sim", "s", "yes", "y"].includes(checked)) return nome || "Sim";
        return "Não";
    }

    // 2b) se veio string
    const raw = decodeHtmlEntitiesDeep(String(rawAny ?? "")).trim();
    const low = raw.toLowerCase();

    // sem nada: não
    if (!raw) return nome ? nome : "Não";

    // se for "não"
    if (["nao", "não", "n", "0", "false"].includes(low)) return "Não";

    // se for "sim"
    if (["sim", "s", "1", "true"].includes(low)) return nome ? nome : "Sim";

    // 2c) se veio "Sim: Nome" / "Sim - Nome" / "Sim | Nome" etc
    // pega tudo depois de separador, se existir
    const m = raw.match(/^(sim)\s*[:\-|]\s*(.+)$/i);
    if (m?.[2]) {
        const after = m[2].trim();
        return after ? after : (nome ? nome : "Sim");
    }

    // 2d) se veio já como nome direto
    return raw;
}


/* ===== Helpers Linha do Tempo ===== */
function parseRegistroDateTime(r: Registro) {
    const d = (r.data || "").trim();
    const h = (r.hora_fim_velorio || r.hora_inicio_velorio || "").trim() || "00:00";
    if (!d) return 0;
    const [yyyy, mm, dd] = d.split("-");
    const iso = `${yyyy}-${mm}-${dd}T${h}:00`;
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? 0 : ts;
}

function capitalize(str?: string): string {
    if (!str) return "";
    const s = str.toString().trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function formatLogDateTime(value?: string): string {
    if (!value) return "";
    const s = value.replace(" ", "T");
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return value;
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function parseLogTs(value?: string): number {
    if (!value) return 0;
    const ts = Date.parse(String(value).replace(" ", "T"));
    return Number.isNaN(ts) ? 0 : ts;
}

function getSepultamentoIdFromRegistro(r: Registro): string {
    const sepId =
        (r as any).sepultamento_id ??
        (r as any).sepultamentoId ??
        (r as any).id ??
        (r as any).id_atendimento ??
        (r as any).codigo;

    return String(sepId ?? "").trim();
}

async function buscarLogsDoRegistro(r: Registro): Promise<LogItem[]> {
    const sepId = getSepultamentoIdFromRegistro(r);

    if (!sepId) {
        console.warn("Registro sem sepultamento_id para histórico:", r);
        return [];
    }

    const BASE = `https://api.planoassistencialintegrado.com.br/historico_sepultamentos.php?log=1&id=${encodeURIComponent(
        String(sepId)
    )}`;
    const url = `${BASE}&_ts=${Date.now()}`;
    const json: any = await fetchJsonFast<any>(url, { ttlMs: 20_000, cacheKey: `hist_${sepId}` });

    let logs: LogItem[] = [];
    if (Array.isArray(json)) logs = json as LogItem[];
    else if (json?.sucesso && Array.isArray(json.dados)) logs = json.dados as LogItem[];

    return [...logs].sort((a, b) => parseLogTs(a.datahora) - parseLogTs(b.datahora));
}

function getFotoFalecidoTimeline(r?: Registro | null): TimelineFoto | null {
    if (!r) return null;

    const candidatos = [
        (r as any).foto_falecido,
        (r as any).foto_url,
        (r as any).foto,
        (r as any).imagem,
    ];

    for (const c of candidatos) {
        const raw = decodeHtmlEntitiesDeep(String(c ?? "")).trim();
        if (!raw) continue;
        if (!pareceUrlImagem(raw)) continue;

        return {
            label: "Foto do Falecido(a)",
            url: normalizarUrlImagemTimeline(raw),
        };
    }

    return null;
}

function extrairFotosDeQualquerValorTimeline(raw: unknown, labelBase = "Foto"): TimelineFoto[] {
    const fotos: TimelineFoto[] = [];

    const walk = (value: unknown, key = labelBase) => {
        if (value === null || value === undefined || value === "") return;

        if (typeof value === "string") {
            const val = decodeHtmlEntitiesDeep(value).trim();
            if (!val) return;

            if (pareceUrlImagem(val)) {
                fotos.push({
                    label: labelImagemTimeline(key),
                    url: normalizarUrlImagemTimeline(val),
                });
                return;
            }

            const parsed = tryParseJsonFromStringMaybeEmbedded(val);
            if (parsed != null) walk(parsed, key);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item, idx) => walk(item, `${key}_${idx + 1}`));
            return;
        }

        if (isPlainObject(value)) {
            for (const [k, v] of Object.entries(value)) {
                walk(v, k);
            }
        }
    };

    walk(raw, labelBase);
    return fotos;
}

function montarFotosAnexadasDetalhe(registro: Registro | null, logs: LogItem[]): TimelineFoto[] {
    const fotos: TimelineFoto[] = [];
    const seen = new Set<string>();

    const add = (foto: TimelineFoto | null | undefined) => {
        if (!foto?.url) return;
        if (seen.has(foto.url)) return;
        seen.add(foto.url);
        fotos.push(foto);
    };

    add(getFotoFalecidoTimeline(registro));

    if (registro) {
        extrairFotosDeQualquerValorTimeline(registro, "Foto do Atendimento").forEach(add);
    }

    for (const log of logs || []) {
        const { fotos: fotosDoLog } = extrairDetalhesTimeline(log?.detalhes);
        fotosDoLog.forEach(add);

        if ((log as any)?.detalhes_array) {
            extrairFotosDeQualquerValorTimeline((log as any).detalhes_array, tituloLogTimeline(log)).forEach(add);
        }
    }

    return fotos;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function asBool(val: unknown): boolean {
    if (typeof val === "boolean") return val;
    const s = decodeHtmlEntitiesDeep(String(val ?? "")).trim().toLowerCase();
    if (!s) return false;
    return ["1", "true", "t", "sim", "s", "yes", "y"].includes(s);
}

function titleCaseFromSnake(key: string): string {
    return key
        .split("_")
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
}

function overrideCampoNome(_key: string, defaultName: string): string {
    return defaultName;
}

function substituirRotuloVisual(text: string): string {
    return text;
}

function formataSeDataIso(value: string): string {
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [yyyy, mm, dd] = v.split("-");
        return `${dd}/${mm}/${yyyy}`;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) {
        const [datePart, timePart] = v.split(" ");
        const [yyyy, mm, dd] = datePart.split("-");
        const hhmm = timePart.slice(0, 5);
        return `${dd}/${mm}/${yyyy} ${hhmm}`;
    }
    return v;
}

function traduzirFase(s?: string) {
    return capStatus(s) || (s ?? "");
}

function iconForAction(acao?: string, status?: string): string {
    const a = (acao || "").toLowerCase();
    if (a.includes("criou") || a.includes("novo") || a.includes("inser")) return "🟢";
    if (a.includes("edit") || a.includes("atualiz") || a.includes("alter")) return "✏️";
    if (a.includes("exclu") || a.includes("delet") || a.includes("remove")) return "🗑️";
    const st = (status || "").toLowerCase();
    if (st.startsWith("fase")) return "🔁";
    return "•";
}

/* ===== Status visual com tempo por etapa ===== */
type StatusIconKey = "hospital" | "testTube" | "flower" | "coffin" | "car" | "box" | "timer" | "hourglass" | "dot";
type StatusStepInfo = { key: string; label: string; shortLabel: string; icon: StatusIconKey };
type StatusSegment = { key: string; label: string; shortLabel: string; icon: StatusIconKey; start: number; end: number; active: boolean };

const STATUS_STEP_DEFS: StatusStepInfo[] = [
    { key: "fase01", label: "Removendo", shortLabel: "Remov.", icon: "hospital" },
    { key: "fase02", label: "Aguardando Procedimento", shortLabel: "Aguard.", icon: "timer" },
    { key: "fase03", label: "Preparando", shortLabel: "Prep.", icon: "testTube" },
    { key: "fase04", label: "Aguardando Ornamentação", shortLabel: "A. Orn.", icon: "flower" },
    { key: "fase05", label: "Ornamentando", shortLabel: "Ornam.", icon: "flower" },
    { key: "fase06", label: "Corpo Pronto", shortLabel: "Pronto", icon: "timer" },
    { key: "fase07", label: "Transportando P/ Velório", shortLabel: "T. Vel.", icon: "car" },
    { key: "fase08", label: "Velando", shortLabel: "Velando", icon: "coffin" },
    { key: "fase09", label: "Sepultando", shortLabel: "Sepult.", icon: "car" },
    { key: "fase10", label: "Sepultamento Concluído", shortLabel: "Concl.", icon: "timer" },
    { key: "fase11", label: "Material Recolhido", shortLabel: "Mat. Rec.", icon: "box" },
];

const STATUS_STEPS: StatusStepInfo[] = [
    { key: "fase01", label: "Removendo", shortLabel: "Remov.", icon: "hospital" },
    { key: "fase03", label: "Preparando", shortLabel: "Prep.", icon: "testTube" },
    { key: "fase05", label: "Ornamentando", shortLabel: "Ornam.", icon: "flower" },
    { key: "fase08", label: "Velando", shortLabel: "Velando", icon: "coffin" },
    { key: "fase09", label: "Sepultando", shortLabel: "Sepult.", icon: "car" },
    { key: "fase10", label: "Material Recolhido", shortLabel: "Mat. Rec.", icon: "box" },
    { key: "idle", label: "Tempo Ocioso", shortLabel: "Ocioso", icon: "hourglass" },
];

const STATUS_STEP_MAP = STATUS_STEP_DEFS.reduce<Record<string, StatusStepInfo>>((acc, step) => {
    acc[step.key] = step;
    return acc;
}, {});

const STATUS_MAIN_KEYS = new Set(["fase01", "fase03", "fase05", "fase08", "fase09", "fase10"]);
const STATUS_IDLE_KEYS = new Set(["fase02", "fase04", "fase06", "fase07"]);

function getStatusStepInfo(status?: string): StatusStepInfo {
    const key = normalizarStatus(status) || "";
    return STATUS_STEP_MAP[key] ?? {
        key: key || "indefinido",
        label: capStatus(status) || "a definir",
        shortLabel: "Status",
        icon: "dot",
    };
}

function getRegistroBackendId(r: Registro): string | undefined {
    const raw =
        (r as any).sepultamento_id ??
        (r as any).sepultamentoId ??
        (r as any).id ??
        (r as any).id_atendimento ??
        (r as any).codigo;

    const s = decodeHtmlEntitiesDeep(String(raw ?? "")).trim();
    return s || undefined;
}

function getRegistroTrackingId(r: Registro): string {
    return (
        getRegistroBackendId(r) ??
        `${decodeHtmlEntitiesDeep(String(r.falecido ?? "")).trim()}|${decodeHtmlEntitiesDeep(String(r.data ?? "")).trim()}|${decodeHtmlEntitiesDeep(String(r.hora_fim_velorio ?? "")).trim()}`
    );
}

function getStatusFromLog(log: LogItem): string | undefined {
    const detalhes = isPlainObject(log.detalhes) ? (log.detalhes as Record<string, unknown>) : {};
    const raw =
        log.status_novo ??
        (detalhes.status_novo as string | undefined) ??
        (detalhes.status as string | undefined) ??
        (detalhes.novo_status as string | undefined);

    const normalized = normalizarStatus(raw);
    return normalized?.startsWith("fase") ? normalized : undefined;
}

function formatDurationMs(msRaw: number): string {
    const ms = Math.max(0, Number.isFinite(msRaw) ? msRaw : 0);
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getRegistroCreatedTs(registro: Registro, logs: LogItem[] | undefined, nowMs: number): number {
    const logTimes = (logs ?? [])
        .map((log) => parseLogTs(log.datahora))
        .filter((ts) => ts > 0)
        .sort((a, b) => a - b);

    if (logTimes.length > 0) return logTimes[0];

    const registroTs = parseRegistroDateTime(registro);
    return registroTs > 0 ? registroTs : nowMs;
}

function buildStatusSegments(registro: Registro, logs: LogItem[] | undefined, nowMs: number): StatusSegment[] {
    const currentKey = normalizarStatus(registro.status);
    const createdTs = getRegistroCreatedTs(registro, logs, nowMs);

    const statusEvents = (logs ?? [])
        .map((log) => ({ key: getStatusFromLog(log), ts: parseLogTs(log.datahora) }))
        .filter((x): x is { key: string; ts: number } => !!x.key && x.ts > 0)
        .sort((a, b) => a.ts - b.ts);

    const unique: { key: string; ts: number }[] = [{ key: "fase01", ts: createdTs }];

    for (const ev of statusEvents) {
        if (ev.ts < createdTs) continue;

        if (ev.key === "fase01") continue;

        if (unique.length === 0 || unique[unique.length - 1].key !== ev.key) {
            unique.push(ev);
        }
    }

    const hasAdvancedByLog = unique.some((ev) => ev.key !== "fase01");
    const effectiveCurrentKey = hasAdvancedByLog ? currentKey : "fase01";

    if (hasAdvancedByLog && currentKey && unique[unique.length - 1]?.key !== currentKey) {
        unique.push({ key: currentKey, ts: nowMs });
    }

    return unique.map((ev, idx) => {
        const info = getStatusStepInfo(ev.key);
        const isLast = idx === unique.length - 1;
        const end = isLast ? nowMs : unique[idx + 1].ts;

        return {
            key: info.key,
            label: info.label,
            shortLabel: info.shortLabel,
            icon: info.icon,
            start: ev.ts,
            end,
            active: isLast && ev.key === effectiveCurrentKey,
        };
    });
}

function getStatusDisplayData(segments: StatusSegment[]) {
    const durations = new Map<string, number>();
    let activeKey: string | undefined;

    for (const seg of segments) {
        const duration = Math.max(0, seg.end - seg.start);
        const displayKey = STATUS_IDLE_KEYS.has(seg.key)
            ? "idle"
            : STATUS_MAIN_KEYS.has(seg.key)
                ? seg.key
                : undefined;

        if (!displayKey) continue;

        durations.set(displayKey, (durations.get(displayKey) ?? 0) + duration);
        if (seg.active) activeKey = displayKey;
    }

    return { durations, activeKey };
}

/* =========================
   Página
   ========================= */
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export default function QuadroAtendimentoPage() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");
    const [nowMs, setNowMs] = useState(() => Date.now());

    const [registros, setRegistros] = useState<Registro[]>(() => readLS<Registro[]>("qa_registros") ?? []);
    const [avisos, setAvisos] = useState<Aviso[]>(() => readLS<Aviso[]>("qa_avisos") ?? []);

    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<Registro | null>(null);
    const [copied, setCopied] = useState(false);

    const [detailTimelineOpen, setDetailTimelineOpen] = useState(false);
    const [detailLogs, setDetailLogs] = useState<LogItem[]>([]);
    const [detailLogsLoading, setDetailLogsLoading] = useState(false);
    const [detailLogsError, setDetailLogsError] = useState<string | null>(null);

    const [detailFotoAberta, setDetailFotoAberta] = useState<TimelineFoto | null>(null);
    const [detailGaleriaAberta, setDetailGaleriaAberta] = useState(false);
    const [detailGaleriaIndex, setDetailGaleriaIndex] = useState(0);
    const [detailGaleriaFotos, setDetailGaleriaFotos] = useState<TimelineFoto[]>([]);

    const [matLookup, setMatLookup] = useState<Record<string, MatLookupInfo>>({});
    const [statusLogsById, setStatusLogsById] = useState<Record<string, LogItem[]>>({});

    useEffect(() => {
        const update = () => {
            const now = new Date();
            setNowMs(now.getTime());
            const h = now.getHours().toString().padStart(2, "0");
            const m = now.getMinutes().toString().padStart(2, "0");
            const s = now.getSeconds().toString().padStart(2, "0");
            setClockTime(`${h}:${m}:${s}`);

            const dd = now.getDate().toString().padStart(2, "0");
            const mm = (now.getMonth() + 1).toString().padStart(2, "0");
            const yyyy = now.getFullYear();
            setClockDate(`${DIAS[now.getDay()]}, ${dd}/${mm}/${yyyy}`);
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let alive = true;
        const BASE = "https://api.planoassistencialintegrado.com.br/informativo.php?listar=1";

        async function load() {
            try {
                const url = `${BASE}&_ts=${Date.now()}`;
                const j = await fetchJsonFast<any>(url, { ttlMs: 6_000, cacheKey: "informativo_listar" });
                if (!alive) return;
                const arr = Array.isArray(j) ? (j as Registro[]) : [];
                setRegistros(arr);
                writeLS("qa_registros", arr);
            } catch {
                // mant
            }
        }

        load();
        const id = setInterval(load, 8000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        let alive = true;
        const BASE = "https://api.planoassistencialintegrado.com.br/avisos.php?listar=1";

        async function load() {
            try {
                const url = `${BASE}&_ts=${Date.now()}`;
                const j = await fetchJsonFast<any>(url, { ttlMs: 15_000, cacheKey: "avisos_listar" });
                if (!alive) return;
                const arr = Array.isArray(j) ? (j as Aviso[]) : [];
                setAvisos(arr);
                writeLS("qa_avisos", arr);
            } catch {
                // mantém o que já tem
            }
        }

        load();
        const id = setInterval(load, 20000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        let alive = true;

        async function loadMateriaisCatalog() {
            try {
                // ✅ DEPOIS (direto no PHP)
                const url = `https://api.planoassistencialintegrado.com.br/materiais_admin.php?op=list&all=1&_ts=${Date.now()}`;
                const res = await fetchJsonFast<any>(url, { ttlMs: 60_000, cacheKey: "mat_catalog" });

                const tree = (res?.data ?? res) as any[];
                const map: Record<string, MatLookupInfo> = {};

                for (const cat of tree ?? []) {
                    const catNome = String(cat?.nome ?? "").trim();
                    const catOrdem = Number(cat?.ordem ?? 0);

                    for (const it of cat?.itens ?? []) {
                        const itemId = Number(it?.id);
                        if (!Number.isFinite(itemId) || itemId <= 0) continue;

                        const itemOrdem = Number(it?.ordem ?? 0);
                        const itemKey = `item${itemId}`;

                        map[itemKey] = { catNome, catOrdem, itemOrdem };
                    }
                }

                if (!alive) return;
                setMatLookup(map);
            } catch {
                if (!alive) return;
                setMatLookup({});
            }
        }

        loadMateriaisCatalog();
        return () => {
            alive = false;
        };
    }, []);

    const resetDetailTimeline = useCallback(() => {
        setDetailTimelineOpen(false);
        setDetailLogs([]);
        setDetailLogsLoading(false);
        setDetailLogsError(null);
        setDetailFotoAberta(null);
        setDetailGaleriaAberta(false);
        setDetailGaleriaIndex(0);
        setDetailGaleriaFotos([]);
    }, []);

    const showDetail = useCallback(
        (r: Registro) => {
            setDetail(r);
            setOpen(true);
            setCopied(false);
            resetDetailTimeline();
        },
        [resetDetailTimeline]
    );

    const closeDetail = useCallback(() => {
        setOpen(false);
        setDetail(null);
        setCopied(false);
        resetDetailTimeline();
    }, [resetDetailTimeline]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeDetail();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeDetail]);

    const ativosOrdenados = useMemo(() => {
        const base = (registros || []).filter((r) => {
            const status = normalizarStatus(r.status);

            if (status === "fase11") return false;
            if (isTerceiroRegistro(r)) return status !== "fase10";
            if (!isSim(r.assistencia)) return status !== "fase10";
            return true;
        });

        const withTs = base.map((r) => ({ r, ts: parseRegistroDateTime(r) }));
        withTs.sort((a, b) => b.ts - a.ts);
        return withTs.map((x) => x.r);
    }, [registros]);

    useEffect(() => {
        let alive = true;

        async function carregarLogsDaLista() {
            const registrosVisiveis = ativosOrdenados.slice(0, 60);

            const pendentes = registrosVisiveis.filter((r) => {
                const trackingId = getRegistroTrackingId(r);
                return trackingId && !statusLogsById[trackingId];
            });

            if (pendentes.length === 0) return;

            const pares = await Promise.all(
                pendentes.map(async (r) => {
                    const trackingId = getRegistroTrackingId(r);

                    try {
                        const logs = await buscarLogsDoRegistro(r);
                        return [trackingId, logs] as const;
                    } catch {
                        return [trackingId, [] as LogItem[]] as const;
                    }
                })
            );

            if (!alive) return;

            setStatusLogsById((prev) => {
                const next = { ...prev };

                for (const [trackingId, logs] of pares) {
                    next[trackingId] = logs;
                }

                return next;
            });
        }

        carregarLogsDaLista();

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ativosOrdenados]);

    const TAG_SERVICO = "Atendimento:";

    function isServicoMsg(msg?: any) {
        const s = String(msg ?? "");
        return s.startsWith(TAG_SERVICO);
    }

    function extractServicoNome(msg?: string) {
        const s = String(msg ?? "");
        if (!s.startsWith(TAG_SERVICO)) return "";
        const rest = s.slice(TAG_SERVICO.length).trim(); // "NOME: obs"
        const idx = rest.indexOf(":");
        return (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    }

    function normNome(v?: string) {
        return String(v ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    const nomesAtivos = useMemo(() => {
        const set = new Set<string>();
        for (const r of ativosOrdenados as any[]) {
            const nome = String(r?.falecido ?? "").trim();
            if (nome) set.add(normNome(nome));
        }
        return set;
    }, [ativosOrdenados]);

    const avisosParaExibir = useMemo(() => {
        const arr = Array.isArray(avisos) ? avisos : [];
        return arr.filter((a) => {
            const msg = String((a as any)?.mensagem ?? "");
            if (!isServicoMsg(msg)) return true;

            const nome = extractServicoNome(msg);
            if (!nome) return true;

            return nomesAtivos.has(normNome(nome));
        });
    }, [avisos, nomesAtivos]);

    const handleCopy = useCallback(async () => {
        if (!detail) return;
        const text = buildClipboardText(detail, matLookup); // 👈 passa o lookup aqui
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } finally {
                document.body.removeChild(ta);
            }
        }
    }, [detail, matLookup]);

    const carregarHistoricoDoDetalhe = useCallback(async (r: Registro): Promise<LogItem[]> => {
        setDetailLogs([]);
        setDetailLogsError(null);
        setDetailLogsLoading(true);

        try {
            const logs = await buscarLogsDoRegistro(r);
            setDetailLogs(logs);
            return logs;
        } catch (e) {
            console.error(e);
            setDetailLogsError("Não foi possível carregar o histórico deste atendimento.");
            return [];
        } finally {
            setDetailLogsLoading(false);
        }
    }, []);

    const toggleTimelineDetalhe = useCallback(async () => {
        if (!detail) return;
        const next = !detailTimelineOpen;
        setDetailTimelineOpen(next);

        if (next && !detailLogsLoading && detailLogs.length === 0 && !detailLogsError) {
            await carregarHistoricoDoDetalhe(detail);
        }
    }, [detail, detailTimelineOpen, detailLogsLoading, detailLogs.length, detailLogsError, carregarHistoricoDoDetalhe]);

    const fotoFalecidoDetalhe = useMemo(() => getFotoFalecidoTimeline(detail), [detail]);

    const fotosAnexadasDetalhe = useMemo(() => {
        return montarFotosAnexadasDetalhe(detail, detailLogs);
    }, [detail, detailLogs]);

    const abrirGaleriaFotosDetalhe = useCallback(async (initialIndex = 0) => {
        if (!detail) return;

        let logs = detailLogs;
        if (logs.length === 0 && !detailLogsLoading && !detailLogsError) {
            logs = await carregarHistoricoDoDetalhe(detail);
        }

        const fotos = montarFotosAnexadasDetalhe(detail, logs);
        if (fotos.length === 0) return;

        setDetailGaleriaFotos(fotos);
        setDetailGaleriaIndex(Math.max(0, Math.min(initialIndex, fotos.length - 1)));
        setDetailGaleriaAberta(true);
    }, [detail, detailLogs, detailLogsLoading, detailLogsError, carregarHistoricoDoDetalhe]);

    const obsList = useCallback(
        (missing: string[]) =>
            missing.length ? `Pendências: ${missing.map((k) => LABELS[k] ?? k).join(", ")}.` : "Completo.",
        []
    );

    const missingEtapa0 = useCallback((r: Registro) => ["falecido", "contato", "religiao", "convenio"].filter((k) => !isFilled(r, k)), []);
    const missingEtapa1 = useCallback((r: Registro) => ["urna", "roupa", "assistencia", "tanato"].filter((k) => !isFilled(r, k)), []);
    const missingEtapa2 = useCallback((r: Registro) => {
        const miss: string[] = [];
        if (!isFilled(r, "local_velorio")) miss.push("local_velorio");
        if (!isFilled(r, "data_inicio_velorio")) miss.push("data_inicio_velorio");
        if (!(isFilled(r, "local_sepultamento") || isFilled(r, "local"))) miss.push("local_sepultamento");
        return miss;
    }, []);
    const noteEtapa3 = useCallback((r: Registro) => {
        const hasInicio = isFilled(r, "hora_inicio_velorio");
        const hasFim = isFilled(r, "data_fim_velorio") && isFilled(r, "hora_fim_velorio");
        if (hasInicio && hasFim) return "Horários definidos.";
        if (hasInicio) return "Horário de início definido.";
        if (hasFim) return "Horário de encerramento definido.";
        return "Pendências de horário.";
    }, []);

    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-6 overflow-x-hidden">
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Quadro de Atendimentos</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Atualizado em tempo real — <span className="font-medium">{clockTime}</span> • {clockDate}
                        </p>
                    </div>
                </div>
            </div>

            <DesktopTable
                ativos={ativosOrdenados}
                onSelect={showDetail}
                statusLogsById={statusLogsById}
                nowMs={nowMs}
            />
            <MobileCards
                ativos={ativosOrdenados}
                onSelect={showDetail}
                statusLogsById={statusLogsById}
                nowMs={nowMs}
            />

            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Avisos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mensagens importantes do sistema</p>
                <div className="mt-4 space-y-3">
                    {avisosParaExibir.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum aviso no momento.</p>
                    ) : (
                        avisosParaExibir.map((a, i) => (
                            <div
                                key={i}
                                className="rounded-xl border bg-background/70 px-4 py-3 shadow-sm"
                            >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">
                                        {shown(a.usuario, "Sistema")}
                                    </div>

                                    {a.criado_em ? (
                                        <div className="text-xs text-slate-500">
                                            {avisoDateTimeOr(a.criado_em)}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-1 text-sm leading-relaxed text-slate-700 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                                    {shown(a.mensagem, "")}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {open && detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6" aria-modal role="dialog">
                    <div className="absolute inset-0 bg-black/40" onClick={closeDetail} aria-hidden />

                    <div className="relative z-10 w-full max-w-4xl rounded-xl border bg-card shadow-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden overscroll-contain">
                        <div className="sticky top-0 z-[1] border-b bg-card/95 backdrop-blur px-3 py-2 sm:px-4 sm:py-3 overflow-x-hidden">
                            <div className="w-full flex items-center justify-center gap-2 sm:gap-3">
                                <button
                                    onClick={toggleTimelineDetalhe}
                                    className={`rounded-md border px-3 py-1.5 text-sm hover:bg-muted ${detailTimelineOpen ? "bg-muted" : ""}`}
                                    aria-label="Linha do tempo"
                                    title="Ver linha do tempo deste atendimento"
                                >
                                    Linha do tempo
                                </button>

                                <button
                                    onClick={() => abrirGaleriaFotosDetalhe(0)}
                                    className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                                    aria-label="Ver fotos anexadas"
                                    title="Ver todas as fotos anexadas"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="h-5 w-5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <path d="M21 15l-5-5L5 21" />
                                    </svg>
                                </button>

                                <button
                                    onClick={handleCopy}
                                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                                    aria-label="Copiar"
                                    title="Copiar informações"
                                >
                                    {copied ? "Copiado!" : "Copiar"}
                                </button>

                                <button onClick={closeDetail} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" aria-label="Fechar">
                                    Fechar
                                </button>
                            </div>

                            <div className="mt-3">
                                <div className="text-[12px] text-muted-foreground leading-tight">Detalhes do atendimento</div>
                                <h3 className="text-base sm:text-lg font-bold leading-tight break-words [overflow-wrap:anywhere]">
                                    {shown(detail.falecido)}
                                </h3>

                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px] sm:text-sm">
                                    <span className="text-muted-foreground">
                                        Data: <b>{dateOr(detail.data)}</b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        • Hora: <b>{timeOr(detail.hora_fim_velorio)}</b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        • Agente: <b>{shown(detail.agente)}</b>
                                    </span>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${badgeClass(detail.status)}`}>
                                        {capStatus(detail.status)}
                                    </span>
                                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                        ATEND. {shown(detail.convenio, "A DEFINIR").toUpperCase()}
                                    </span>
                                </div>

                                {detailTimelineOpen && (
                                    <div className="mt-3 rounded-xl border bg-background p-3 overflow-x-hidden">
                                        <div className="flex items-start justify-between gap-2 min-w-0">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-700">Linha do Tempo</div>
                                                <div className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                                                    Logs deste atendimento: <b className="font-semibold">{shown(detail.falecido)}</b>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setDetailTimelineOpen(false)}
                                                className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] hover:bg-muted"
                                                aria-label="Ocultar linha do tempo"
                                            >
                                                Ocultar
                                            </button>
                                        </div>

                                        {detailLogsLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando histórico…</p>}
                                        {detailLogsError && <p className="mt-2 text-sm text-red-600 break-words [overflow-wrap:anywhere]">{detailLogsError}</p>}

                                        {!detailLogsLoading && !detailLogsError && detailLogs.length === 0 && (
                                            <p className="mt-2 text-sm text-muted-foreground">Nenhum log encontrado para este atendimento.</p>
                                        )}

                                        {!detailLogsLoading && !detailLogsError && detailLogs.length > 0 && (
                                            <div className="mt-2">
                                                <LinhaDoTempoLogs logs={detailLogs} usuarioVisivel />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-3 py-3 sm:px-4 sm:py-4 space-y-6">
                            <Topic title="FOTO DO FALECIDO" note={fotoFalecidoDetalhe ? "Clique para visualizar." : "Nenhuma foto cadastrada."}>
                                {fotoFalecidoDetalhe ? (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                        <button
                                            type="button"
                                            onClick={() => setDetailFotoAberta(fotoFalecidoDetalhe)}
                                            className="group relative h-36 w-36 overflow-hidden rounded-2xl border bg-muted shadow-sm"
                                            title="Visualizar Foto do Falecido(a)"
                                        >
                                            <img
                                                src={fotoFalecidoDetalhe.url}
                                                alt={fotoFalecidoDetalhe.label}
                                                className="h-full w-full object-cover transition group-hover:scale-105"
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    className="h-7 w-7"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                                    <path d="M21 15l-5-5L5 21" />
                                                </svg>
                                            </span>
                                        </button>

                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-slate-800">Foto do Falecido(a)</div>
                                            <div className="mt-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                                                {shown(detail.falecido)}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => abrirGaleriaFotosDetalhe(0)}
                                                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                                            >
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    className="h-5 w-5"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                                    <path d="M21 15l-5-5L5 21" />
                                                </svg>
                                                Ver fotos anexadas
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                                        Nenhuma foto do falecido cadastrada neste atendimento.
                                    </div>
                                )}
                            </Topic>

                            <Topic title="INFORMAÇÕES GERAIS" note={obsList(missingEtapa0(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field label="Falecido" value={shown(detail.falecido)} />
                                    <Field label="Religião" value={shown(detail.religiao)} />
                                    <Field label="Contato" value={shown(detail.contato)} className="sm:col-span-2" />
                                    <Field label="Convênio" value={shown(detail.convenio)} className="sm:col-span-2" />
                                    <Field label="Obs. Atendimento" value={shown(detail.observacao_atendimento, "")} className="sm:col-span-2" />
                                </div>
                            </Topic>

                            <Topic title="ITENS" note={obsList(missingEtapa1(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field label="Urna" value={shown(detail.urna)} />
                                    <Field label="Roupa" value={shown(detail.roupa)} />
                                    <Field label="Assistência" value={shown(detail.assistencia)} />
                                    <Field label="Tanatopraxia" value={shown(detail.tanato)} />
                                    <Field
                                        label="Cordão São Francisco"
                                        value={isSim(String((detail as any).cordao ?? "")) ? "Sim" : "Não"}
                                    />

                                    <Field
                                        label="Véu"
                                        value={getVeuText(detail)}
                                    />



                                    <Field label="Invol" value={involSimNao(detail.invol)} />

                                    <Field label="Ornamentação" value={shown((detail.ornamentacao_tipo ?? detail.ornamentacao) as string)} />

                                    {/* ✅ Materiais agora sempre mostra "QTDx Nome" */}
                                    {normalizeMateriaisFromRegistro(detail)
                                        .filter((x) => isRealMaterialForClipboard(x) && !isJsonNoiseLine(x)).length > 0 && (
                                            <Field
                                                label="Materiais"
                                                value={<MateriaisValue registro={detail} lookup={matLookup} />}
                                                className="sm:col-span-2"
                                            />
                                        )}

                                    <Field label="Obs. Itens" value={shown(detail.observacao_itens, "")} className="sm:col-span-2" />
                                </div>
                            </Topic>

                            <Topic title="VELÓRIO" note={obsList(missingEtapa2(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-2">
                                    <Field label="Local Velório" value={<LocalVelorioValue value={detail.local_velorio} />} />
                                    <Field label="Data Início Velório" value={dateOr(detail.data_inicio_velorio)} />
                                </div>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field label="Início Velório" value={timeOr(detail.hora_inicio_velorio)} />
                                    <Field label="Obs. Velório" value={shown(detail.observacao_velorio01, "")} className="sm:col-span-2" />
                                </div>
                            </Topic>

                            <Topic title="SEPULTAMENTO" note={noteEtapa3(detail)}>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-2">
                                    <Field label="Local" value={shown(detail.local_sepultamento || detail.local)} />
                                    <Field label="Data" value={dateOr(detail.data_fim_velorio)} />
                                    <Field label="Hora" value={timeOr(detail.hora_fim_velorio)} />
                                    <Field label="Obs. Sepultamento" value={shown(detail.observacao_velorio02, "")} className="sm:col-span-2" />
                                </div>
                            </Topic>

                            <div className="rounded-xl border bg-background p-3">
                                <div className="text-[12px] sm:text-sm text-muted-foreground mb-2">Etapas preenchidas</div>
                                <EtapasRow registro={detail} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ModalFotoTimeline
                foto={detailFotoAberta}
                onClose={() => setDetailFotoAberta(null)}
            />

            <ModalGaleriaFotosTimeline
                open={detailGaleriaAberta}
                fotos={detailGaleriaFotos}
                index={detailGaleriaIndex}
                onIndexChange={setDetailGaleriaIndex}
                onClose={() => setDetailGaleriaAberta(false)}
            />
        </div>
    );
}

/* ===== Listas Memoizadas ===== */

const DesktopTable = React.memo(function DesktopTable({
    ativos,
    hiddenCount = 0,
    onSelect,
    statusLogsById,
    nowMs,
}: {
    ativos: Registro[];
    hiddenCount?: number;
    onSelect: (r: Registro) => void;
    statusLogsById: Record<string, LogItem[]>;
    nowMs: number;
}) {
    return (
        <section className="hidden min-h-0 w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0f172a]/90 sm:flex sm:flex-col">
            <div className="grid h-9 shrink-0 grid-cols-[88px_minmax(210px,1.15fr)_minmax(220px,1.05fr)_112px_108px_330px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 text-[12px] font-bold text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/70 dark:text-slate-300">
                <div>Data</div>
                <div>Falecido(a)</div>
                <div>Local</div>
                <div>Sepultamento</div>
                <div>Agente</div>
                <div>Status</div>
            </div>

            <div className="min-h-0 overflow-hidden">
                {ativos.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">Nenhum atendimento encontrado.</div>
                ) : (
                    ativos.map((r, i) => {
                        const preenchidas = etapasPreenchidas(r);
                        const trackingId = getRegistroTrackingId(r);

                        return (
                            <div
                                key={trackingId || i}
                                className="grid h-[64px] grid-cols-[88px_minmax(210px,1.15fr)_minmax(220px,1.05fr)_112px_108px_330px] items-center gap-2 border-b border-slate-200/80 px-4 text-[12px] text-slate-700 last:border-b-0 dark:border-slate-700/45 dark:text-slate-100"
                            >
                                <div className="min-w-0">
                                    <div className="mb-1 flex justify-center">
                                        <EtapasInlineDots filled={preenchidas} />
                                    </div>
                                    <div className="text-center text-[13px] font-bold leading-none tabular-nums text-slate-900 dark:text-slate-100">{dateOr(r.data)}</div>
                                    <div className="mt-1 flex justify-center">
                                        <ConvenioBadge convenio={r.convenio} size="xs" />
                                    </div>
                                </div>

                                <button
                                    className="min-w-0 text-left text-[13px] font-bold leading-tight text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
                                    onClick={() => onSelect(r)}
                                    title={shown(r.falecido)}
                                >
                                    <span className="block truncate">{shown(r.falecido)}</span>
                                </button>

                                <div className="min-w-0 text-[13px] font-medium leading-tight text-slate-700 dark:text-slate-200" title={shown(r.local_velorio)}>
                                    <div className="truncate"><LocalVelorioValue value={r.local_velorio} /></div>
                                </div>

                                <div className="min-w-0 leading-tight">
                                    <div className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{dateDayMonthOr(r.data_fim_velorio)}</div>
                                    <div className="mt-0.5 truncate text-[13px] font-bold tabular-nums text-slate-900 dark:text-slate-100">{timeOr(r.hora_fim_velorio)}</div>
                                </div>

                                <div className="min-w-0 truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200" title={shown(r.agente)}>{shown(r.agente)}</div>

                                <StatusTimelineCell registro={r} logs={statusLogsById[trackingId]} nowMs={nowMs} />
                            </div>
                        );
                    })
                )}
            </div>

            {hiddenCount > 0 && (
                <div className="border-t border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:border-slate-700/50 dark:text-slate-400">
                    + {hiddenCount} atendimento{hiddenCount === 1 ? "" : "s"} oculto{hiddenCount === 1 ? "" : "s"}
                </div>
            )}
        </section>
    );
});

const MobileCards = React.memo(function MobileCards({
    ativos,
    hiddenCount = 0,
    onSelect,
    statusLogsById,
    nowMs,
}: {
    ativos: Registro[];
    hiddenCount?: number;
    onSelect: (r: Registro) => void;
    statusLogsById: Record<string, LogItem[]>;
    nowMs: number;
}) {
    return (
        <section className="flex flex-col gap-3 sm:hidden">
            {ativos.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700/60 dark:bg-[#0f172a]/90 dark:text-slate-400">
                    Nenhum atendimento encontrado.
                </div>
            ) : (
                ativos.map((r, i) => {
                    const preenchidas = etapasPreenchidas(r);
                    const trackingId = getRegistroTrackingId(r);

                    return (
                        <article
                            key={trackingId || i}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0f172a]/90"
                        >
                            <div>
                                <button
                                    className="block w-full min-w-0 text-left text-base font-bold leading-snug text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
                                    onClick={() => onSelect(r)}
                                    title={shown(r.falecido)}
                                >
                                    <span className="block truncate">{shown(r.falecido)}</span>
                                </button>

                                <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden">
                                    <ConvenioBadge convenio={r.convenio} size="xs" />
                                    <EtapasInlineDots filled={preenchidas} />
                                    <span className="shrink-0 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                        {dateOr(r.data)}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700/50 dark:bg-slate-950/35">
                                    <div className="text-slate-500 dark:text-slate-400">Local</div>
                                    <div className="mt-1 truncate font-semibold text-slate-900 dark:text-slate-100">
                                        <LocalVelorioValue value={r.local_velorio} />
                                    </div>
                                </div>

                                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700/50 dark:bg-slate-950/35">
                                    <div className="text-slate-500 dark:text-slate-400">Sepultamento</div>
                                    <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                                        {dateDayMonthOr(r.data_fim_velorio)} • {timeOr(r.hora_fim_velorio)}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                Agente: <b className="text-slate-800 dark:text-slate-200">{shown(r.agente)}</b>
                            </div>

                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700/50 dark:bg-slate-950/35">
                                <StatusTimelineCell registro={r} logs={statusLogsById[trackingId]} nowMs={nowMs} variant="mobile" />
                            </div>
                        </article>
                    );
                })
            )}

            {hiddenCount > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-500 shadow-sm dark:border-slate-700/60 dark:bg-[#0f172a]/90 dark:text-slate-400">
                    + {hiddenCount} atendimento{hiddenCount === 1 ? "" : "s"} oculto{hiddenCount === 1 ? "" : "s"}
                </div>
            )}
        </section>
    );
});

/* ===== Componentes auxiliares ===== */

function Topic({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
    return (
        <section className="rounded-xl border bg-background p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-semibold tracking-wide text-slate-600 mb-3">{title}</h4>
                {note && <div className="text-[11px] sm:text-xs text-muted-foreground italic">{note}</div>}
            </div>
            {children}
        </section>
    );
}

function Field({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
    return (
        <div className={`flex items-baseline gap-2 ${className}`}>
            <span className="min-w-[140px] text-[13px] sm:text-sm font-semibold text-slate-700">{label}:</span>
            <span className="text-[13px] sm:text-sm text-slate-900 break-words [overflow-wrap:anywhere]">{value}</span>
        </div>
    );
}

function EtapasInlineDots({ filled }: { filled: boolean[] }) {
    return (
        <div className="flex items-center gap-1" title="Etapas preenchidas">
            {[0, 1, 2, 3].map((k) => (
                <span key={k} className={`h-1.5 w-1.5 rounded-full border ${filled[k] ? STAGE_DOT_FILLED[k] : STAGE_DOT_EMPTY}`} />
            ))}
        </div>
    );
}

function StatusTimelineCell({
    registro,
    logs,
    nowMs,
    variant = "desktop",
}: {
    registro: Registro;
    logs?: LogItem[];
    nowMs: number;
    variant?: "desktop" | "mobile";
}) {
    const segments = buildStatusSegments(registro, logs, nowMs);
    const firstStart = segments[0]?.start ?? nowMs;
    const totalMs = Math.max(0, nowMs - firstStart);

    const { durations, activeKey } = getStatusDisplayData(segments);
    const isMobile = variant === "mobile";

    return (
        <>
            <div
                className={
                    isMobile
                        ? "grid w-full min-w-0 grid-cols-8 items-center justify-items-center gap-0 overflow-visible px-1 py-0.5"
                        : "-ml-5 flex w-full min-w-0 items-center justify-start gap-1 overflow-visible px-0 pr-1"
                }
            >
                {STATUS_STEPS.map((step) => {
                    const duration = durations.get(step.key) ?? 0;
                    const skipped = isStatusStepSkipped(registro, step.key);
                    const isActive = !skipped && activeKey === step.key;

                    return (
                        <StatusPill
                            key={step.key}
                            icon={step.icon}
                            label={step.shortLabel}
                            time={skipped ? "00:00" : duration > 0 ? formatDurationMs(duration) : "00:00"}
                            active={isActive}
                            muted={!isActive && (duration <= 0 || skipped)}
                            skipped={skipped}
                            variant={variant}
                            title={`${step.label} • ${skipped ? "Não realizado neste atendimento" : duration > 0 ? formatDurationMs(duration) : "00:00"}`}
                        />
                    );
                })}

                <StatusPill
                    icon="timer"
                    label="Total"
                    time={formatDurationMs(totalMs)}
                    total
                    variant={variant}
                    title="Tempo total em atendimento"
                />
            </div>

            <StatusBlinkStyle />
        </>
    );
}

function isStatusStepSkipped(registro: Registro, stepKey: string): boolean {
    if (stepKey === "fase03") return isNao(registro.tanato);
    if (stepKey === "fase05") return isNao((registro.ornamentacao_tipo ?? registro.ornamentacao) as string | undefined);
    return false;
}

function StatusPill({
    icon,
    label,
    time,
    active = false,
    muted = false,
    total = false,
    skipped = false,
    variant = "desktop",
    title,
}: {
    icon: StatusIconKey;
    label: string;
    time: string;
    active?: boolean;
    muted?: boolean;
    total?: boolean;
    skipped?: boolean;
    variant?: "desktop" | "mobile";
    title?: string;
}) {
    const isMobile = variant === "mobile";

    const boxClass = isMobile
        ? `relative flex h-[40px] w-[34px] shrink-0 flex-col items-center justify-center px-0 text-center leading-none transition ${total ? "" : ""}`
        : `relative flex h-[35px] w-[32px] shrink-0 flex-col items-center justify-center px-0 text-center leading-none transition ${total ? "ml-0.5 mr-1" : ""}`;

    const circleClass = isMobile
        ? `relative flex h-[25px] w-[25px] items-center justify-center rounded-full ${active ? "qa-status-active-ring border border-[#22C55E]/90 shadow-[0_0_9px_rgba(34,197,94,.48)]" : "border border-transparent"}`
        : `relative flex h-[22px] w-[22px] items-center justify-center rounded-full ${active ? "qa-status-active-ring border border-[#22C55E]/90 shadow-[0_0_8px_rgba(34,197,94,.45)]" : "border border-transparent"}`;

    const iconClass = isMobile
        ? `relative flex h-[19px] w-[19px] items-center justify-center ${active ? "qa-status-blink text-[#22C55E]" : "text-[#00AEEC]"} ${muted ? "opacity-[0.12]" : ""}`
        : `relative flex h-[17px] w-[17px] items-center justify-center ${active ? "qa-status-blink text-[#22C55E]" : "text-[#00AEEC]"} ${muted ? "opacity-[0.12]" : ""}`;

    const timeClass = isMobile
        ? `mt-[3px] w-full truncate text-[9px] font-black leading-none tabular-nums ${muted ? "text-slate-400/60 dark:text-slate-500/35" : active ? "text-[#22C55E]" : "text-slate-800 dark:text-slate-100"}`
        : `mt-[3px] w-full truncate text-[8.5px] font-black leading-none tabular-nums ${muted ? "text-slate-400/60 dark:text-slate-500/35" : active ? "text-[#22C55E]" : "text-slate-800 dark:text-slate-100"}`;

    return (
        <div
            className={boxClass}
            title={title ?? `${label} • ${time}`}
        >
            <div className={circleClass}>
                <div className={iconClass} aria-hidden="true">
                    <StatusIcon type={icon} />
                </div>
            </div>

            <div className={timeClass}>{time}</div>

            {skipped && (
                <span className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center font-semibold leading-none text-[#00AEEC] ${isMobile ? "text-[46px]" : "text-[43px]"}`}>
                    ×
                </span>
            )}
        </div>
    );
}

function StatusIcon({ type }: { type: StatusIconKey }) {
    const common = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2.15,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        className: "h-full w-full",
    };

    switch (type) {
        case "hospital":
            return (
                <svg {...common}>
                    <path d="M4 21V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V21" />
                    <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
                    <path d="M12 7.5v5" />
                    <path d="M9.5 10h5" />
                    <path d="M6.5 21h11" />
                </svg>
            );

        case "testTube":
            return (
                <svg {...common}>
                    <path d="M10 2h7" />
                    <path d="M14 2v6.6l4.5 7.8A3.7 3.7 0 0 1 15.3 22H8.7a3.7 3.7 0 0 1-3.2-5.6L10 8.6V2" />
                    <path d="M8.2 15h7.6" />
                </svg>
            );

        case "flower":
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="2" />
                    <path d="M12 4.5c1.7 1.7 1.7 3.3 0 5-1.7-1.7-1.7-3.3 0-5Z" />
                    <path d="M12 19.5c-1.7-1.7-1.7-3.3 0-5 1.7 1.7 1.7 3.3 0 5Z" />
                    <path d="M4.5 12c1.7-1.7 3.3-1.7 5 0-1.7 1.7-3.3 1.7-5 0Z" />
                    <path d="M19.5 12c-1.7 1.7-3.3 1.7-5 0 1.7-1.7 3.3-1.7 5 0Z" />
                </svg>
            );

        case "coffin":
            return (
                <svg {...common}>
                    <path d="M9 3h6l3 5-1.5 13h-9L6 8l3-5Z" />
                    <path d="M12 7v8" />
                    <path d="M9.8 10h4.4" />
                </svg>
            );

        case "car":
            return (
                <svg {...common}>
                    <path d="M5 16h14" />
                    <path d="M6.5 16l1.4-5.2A3 3 0 0 1 10.8 8h2.4a3 3 0 0 1 2.9 2.8L17.5 16" />
                    <circle cx="8" cy="17" r="2" />
                    <circle cx="16" cy="17" r="2" />
                    <path d="M9 12h6" />
                </svg>
            );

        case "box":
            return (
                <svg {...common}>
                    <path d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Z" />
                    <path d="M4 8.5V16l8 4 8-4V8.5" />
                    <path d="M12 13v7" />
                    <path d="M8.2 6.2 16 10.6" />
                </svg>
            );

        case "hourglass":
            return (
                <svg {...common}>
                    <path d="M6 3h12" />
                    <path d="M6 21h12" />
                    <path d="M8 3c0 5 8 5 8 9s-8 4-8 9" />
                    <path d="M16 3c0 5-8 5-8 9s8 4 8 9" />
                    <path d="M10 8h4" />
                    <path d="M10 16h4" />
                </svg>
            );

        case "timer":
            return (
                <svg {...common}>
                    <circle cx="12" cy="13" r="7" />
                    <path d="M12 13V9" />
                    <path d="M12 13l3 2" />
                    <path d="M9 2h6" />
                    <path d="M12 2v3" />
                </svg>
            );

        default:
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                </svg>
            );
    }
}

function StatusBlinkStyle() {
    return (
        <style jsx global>{`
            @keyframes qa-status-pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                    filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.95));
                }
                50% {
                    opacity: 0.55;
                    transform: scale(1.1);
                    filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.9));
                }
            }

            @keyframes qa-status-ring-pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                    box-shadow: 0 0 6px rgba(34, 197, 94, 0.42);
                    border-color: rgba(34, 197, 94, 0.92);
                }
                50% {
                    opacity: 0.72;
                    transform: scale(1.07);
                    box-shadow: 0 0 9px rgba(34, 197, 94, 0.68);
                    border-color: rgba(34, 197, 94, 1);
                }
            }

            .qa-status-blink {
                display: inline-block;
                animation: qa-status-pulse 1.05s ease-in-out infinite;
            }

            .qa-status-active-ring {
                animation: qa-status-ring-pulse 1.05s ease-in-out infinite;
            }

            @media (prefers-reduced-motion: reduce) {
                .qa-status-blink,
                .qa-status-active-ring {
                    animation: none !important;
                }
            }
        `}</style>
    );
}


function EtapasRow({ registro }: { registro: Registro }) {
    const preenchidas = etapasPreenchidas(registro);
    const labels = ["D", "I", "V", "S"];
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {labels.map((label, k) => (
                <div key={k} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`h-4 w-4 rounded-full border ${preenchidas[k] ? STAGE_DOT_FILLED[k] : STAGE_DOT_EMPTY}`} />
                </div>
            ))}
        </div>
    );
}

/* ===== Linha do Tempo (Logs) ===== */

function isLikelyBooleanMap(obj: Record<string, unknown>) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return false;

    let boolish = 0;

    for (const [, v] of entries) {
        const s = decodeHtmlEntitiesDeep(String(v ?? "")).trim().toLowerCase();
        if (
            typeof v === "boolean" ||
            ["true", "false", "1", "0", "sim", "nao", "não"].includes(s)
        ) {
            boolish++;
        }
    }

    return boolish / entries.length >= 0.8;
}

/* ✅ detecta se a string “parece” ser JSON de materiais */
function looksLikeMateriaisJson(s: string) {
    const t = (s || "").toLowerCase();
    return (t.includes('"nome"') && t.includes('"checked"')) || t.includes('"item');
}

/* ✅ extrai nome/qtd mesmo se o JSON estiver “quebrado” e não der JSON.parse */
function extractMateriaisByRegex(text: string): Array<{ nome: string; qtd?: string }> {
    const s = decodeHtmlEntitiesDeep(text)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");

    const out: Array<{ nome: string; qtd?: string }> = [];
    const reNome = /(?:^|[,{]\s*)"?nome"?\s*:\s*["']([^"']+)["']/gi;

    let m: RegExpExecArray | null;

    while ((m = reNome.exec(s))) {
        const nome = (m[1] || "").trim();
        const near = s.slice(m.index, m.index + 260);
        const qtd = near.match(/"?qtd"?\s*:\s*["']?([0-9]+(?:[.,][0-9]+)?)["']?/i)?.[1];

        if (nome) out.push({ nome, qtd });
    }

    return out;
}

function tryParseJsonFromStringMaybeEmbedded(raw: string): unknown | null {
    const decoded = decodeHtmlEntitiesDeep(raw);
    const trimmed = decoded.trim().replace(/^\s*json\s*:\s*/i, "").trim();

    if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
        try {
            return JSON.parse(trimmed);
        } catch {
            // ignore
        }
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
        const slice = trimmed.slice(start, end + 1);
        try {
            return JSON.parse(slice);
        } catch {
            // ignore
        }
    }

    return null;
}

/* =========================
   Linha do tempo — padrão relatório
   ========================= */

const FASES_NOMES_QA: Record<string, string> = {
    fase01: "Indo Retirar o Óbito",
    fase02: "Corpo na Clínica",
    fase03: "Início de Conservação",
    fase04: "Fim da Conservação",
    fase05: "Início da Ornamentação",
    fase06: "Fim da Ornamentação",
    fase07: "Transportando Óbito P/ Velório",
    fase08: "Entrega de Corpo",
    fase09: "Transportando P/ Sepultamento",
    fase10: "Sepultamento Concluído",
    fase11: "Material Recolhido",
};

const FASES_ICONES_QA: Record<string, string> = {
    fase01: "🚑",
    fase02: "🏥",
    fase03: "🧪",
    fase04: "✅",
    fase05: "🌸",
    fase06: "🌸",
    fase07: "🚐",
    fase08: "⚰️",
    fase09: "🚐",
    fase10: "✅",
    fase11: "📦",
};

function normalizarFaseTimeline(fase?: string) {
    const raw = String(fase || "").trim();
    if (!raw) return "";

    const low = raw.toLowerCase();

    if (low.startsWith("fase")) {
        const n = low.replace(/\D+/g, "");
        if (!n) return low;
        return `fase${n.padStart(2, "0")}`;
    }

    const semAcento = low
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const map: Record<string, string> = {
        removendo: "fase01",
        "indo retirar o obito": "fase01",

        "corpo na clinica": "fase02",
        "aguardando procedimento": "fase02",

        preparando: "fase03",
        "inicio de conservacao": "fase03",

        "fim da conservacao": "fase04",
        "aguardando ornamentacao": "fase04",

        ornamentando: "fase05",
        "inicio da ornamentacao": "fase05",

        "fim da ornamentacao": "fase06",
        "corpo pronto": "fase06",

        transportando: "fase07",
        "transportando obito p/velorio": "fase07",
        "transportando obito para velorio": "fase07",
        "transportando p/ velorio": "fase07",
        "transportando para velorio": "fase07",

        velando: "fase08",
        "entrega de corpo": "fase08",

        sepultando: "fase09",
        "transportando p/ sepultamento": "fase09",
        "transportando para sepultamento": "fase09",

        "sepultamento concluido": "fase10",
        "material recolhido": "fase11",
        concluido: "fase11",
    };

    return map[semAcento] || raw;
}

function traduzirFaseTimeline(fase?: string) {
    const f = normalizarFaseTimeline(fase);
    return f ? FASES_NOMES_QA[f] || fase || "" : "";
}

function iconeAcaoTimeline(acao?: string, statusNovo?: string) {
    const fase = normalizarFaseTimeline(statusNovo);

    if (fase && FASES_ICONES_QA[fase]) {
        return FASES_ICONES_QA[fase];
    }

    const a = String(acao || "").toLowerCase();

    if (a.includes("criou")) return "🟢";
    if (a.includes("editou") || a.includes("atualizou") || a.includes("alterou")) return "✏️";
    if (a.includes("assinou")) return "🖊️";
    if (a.includes("foto")) return "🖼️";
    if (a.includes("material")) return "📦";

    return "📝";
}

function humanizarAcaoTimeline(acao?: string) {
    const a = String(acao || "").trim();
    const low = a.toLowerCase();

    const map: Record<string, string> = {
        criou: "Registro criado",
        editou: "Registro editado",
        "editou registro": "Registro editado",
        "atualizou status": "Status alterado",
        material_recolhido: "Material recolhido",
    };

    if (map[low]) return map[low];

    if (low.includes("assinou") && low.includes("assinatura_responsavel")) {
        return "Assinou o Termo de Recebimento de Material";
    }

    if (low.includes("assinou") && low.includes("assinatura_requerente")) {
        return "Assinou o Termo de Requisição de Veículo";
    }

    if (low.includes("salvou foto")) {
        return a
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^./, (c) => c.toUpperCase());
    }

    return a
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (c) => c.toUpperCase());
}

function tituloLogTimeline(log: LogItem) {
    const status = traduzirFaseTimeline(log.status_novo);

    if (status) return status;

    const acaoHumana = String((log as any)?.acao_humana || "").trim();
    if (acaoHumana) return substituirRotuloVisual(acaoHumana);

    return substituirRotuloVisual(humanizarAcaoTimeline(log.acao));
}

function pareceUrlImagem(valor: string) {
    const v = String(valor || "").trim().toLowerCase();

    if (!v) return false;
    if (v.startsWith("data:image/")) return true;

    return (
        v.includes(".jpg") ||
        v.includes(".jpeg") ||
        v.includes(".png") ||
        v.includes(".webp") ||
        v.includes(".gif") ||
        v.includes(".bmp") ||
        v.includes(".svg") ||
        v.includes("/uploads/falecidos/") ||
        v.includes("/uploads/acoes_fotos/") ||
        v.includes("/uploads/fotos/")
    );
}

function chaveEhImagem(key: string) {
    const k = String(key || "").toLowerCase();

    return (
        k.includes("foto") ||
        k.includes("imagem") ||
        k.includes("img") ||
        k.includes("arquivo")
    );
}

function normalizarUrlImagemTimeline(raw: string) {
    const v = decodeHtmlEntitiesDeep(String(raw || "")).trim();

    if (!v) return "";

    if (
        v.startsWith("http://") ||
        v.startsWith("https://") ||
        v.startsWith("data:image/")
    ) {
        return v;
    }

    if (v.startsWith("/uploads/")) {
        return `https://api.planoassistencialintegrado.com.br${v}`;
    }

    if (v.startsWith("uploads/")) {
        return `https://api.planoassistencialintegrado.com.br/${v}`;
    }

    if (v.startsWith("/")) {
        return v;
    }

    return `/${v}`;
}

function labelImagemTimeline(key: string) {
    const k = String(key || "").toLowerCase();

    if (k.includes("falecido")) return "Foto do Falecido(a)";
    if (k.includes("ornament")) return "Foto da Ornamentação";
    if (k.includes("conserv")) return "Foto da Conservação";
    if (k.includes("tanato")) return "Foto da Conservação";
    if (k.includes("velorio")) return "Foto do Velório";
    if (k.includes("sepult")) return "Foto do Sepultamento";
    if (k.includes("acao")) return "Foto da Ação";
    if (k.includes("foto")) return "Foto";

    return overrideCampoNome(key, titleCaseFromSnake(key));
}

function isLogSemAlteracoes(log: LogItem) {
    const raw = log?.detalhes;

    if (raw == null || raw === "") return false;

    let obj: any = raw;

    if (typeof raw === "string") {
        const parsed = tryParseJsonFromStringMaybeEmbedded(raw);
        if (parsed == null || !isPlainObject(parsed)) return false;
        obj = parsed;
    }

    if (!isPlainObject(obj)) return false;

    const semAlteracoes = obj.sem_alteracoes ?? obj.semAlteracoes ?? obj["Sem Alteracoes"] ?? obj["Sem Alterações"];
    return asBool(semAlteracoes);
}

function deveIgnorarCampoTimeline(key: string, value: unknown) {
    const k = String(key || "").toLowerCase();

    if (value === null || value === undefined || value === "") return true;

    if (k === "id") return true;
    if (k === "sepultamento_id") return true;
    if (k === "acao") return true;
    if (k === "acao_humana") return true;
    if (k === "usuario") return true;
    if (k === "status_anterior") return true;
    if (k === "status_novo") return true;
    if (k === "datahora") return true;
    if (k === "data_hora") return true;
    if (k === "sem_alteracoes" || k === "semalteracoes") return true;
    if (k === "sem alteracoes" || k === "sem alterações") return true;
    if (k.includes("assinatura")) return true;
    if (k.includes("pdf")) return true;

    return false;
}

function formatarValorTimeline(key: string, value: unknown) {
    if (value === null || value === undefined) return "";

    if (typeof value === "boolean") return value ? "Sim" : "Não";

    const txt = decodeHtmlEntitiesDeep(String(value)).trim();
    if (!txt) return "";

    if (txt.toLowerCase().startsWith("fase")) {
        return traduzirFaseTimeline(txt);
    }

    return substituirRotuloVisual(formataSeDataIso(txt));
}

type TimelineFoto = {
    label: string;
    url: string;
};

type TimelineRow = {
    label: string;
    value: string;
};

function extrairDetalhesTimeline(raw: unknown): {
    rows: TimelineRow[];
    fotos: TimelineFoto[];
    arrumacao: string[];
    textoLivre: string;
} {
    const rows: TimelineRow[] = [];
    const fotos: TimelineFoto[] = [];
    const arrumacao: string[] = [];
    let textoLivre = "";

    if (raw == null || raw === "") {
        return { rows, fotos, arrumacao, textoLivre };
    }

    let obj: unknown = raw;

    if (typeof raw === "string") {
        const parsed = tryParseJsonFromStringMaybeEmbedded(raw);

        if (parsed != null) {
            obj = parsed;
        } else {
            const text = substituirRotuloVisual(decodeHtmlEntitiesDeep(raw).trim());

            if (pareceUrlImagem(text)) {
                fotos.push({
                    label: "Foto",
                    url: normalizarUrlImagemTimeline(text),
                });
                return { rows, fotos, arrumacao, textoLivre };
            }

            textoLivre = text;
            return { rows, fotos, arrumacao, textoLivre };
        }
    }

    function pushFoto(key: string, value: unknown) {
        const val = decodeHtmlEntitiesDeep(String(value ?? "")).trim();
        if (!val || !pareceUrlImagem(val)) return false;

        fotos.push({
            label: labelImagemTimeline(key),
            url: normalizarUrlImagemTimeline(val),
        });

        return true;
    }

    function pushRow(key: string, value: unknown) {
        if (deveIgnorarCampoTimeline(key, value)) return;

        const val = formatarValorTimeline(key, value);
        if (!val) return;

        if ((chaveEhImagem(key) || pareceUrlImagem(val)) && pareceUrlImagem(val)) {
            pushFoto(key, val);
            return;
        }

        const label = substituirRotuloVisual(
            overrideCampoNome(key, titleCaseFromSnake(key.replace(/:/g, "_")))
        );

        rows.push({ label, value: val });
    }

    function walk(prefix: string, value: unknown) {
        if (value === null || value === undefined || value === "") return;

        if (Array.isArray(value)) {
            if (value.length === 0) return;

            if (value.every((v) => typeof v !== "object")) {
                pushRow(prefix, value.map((v) => formatarValorTimeline(prefix, v)).join(", "));
                return;
            }

            value.forEach((v, idx) => walk(`${prefix}_${idx + 1}`, v));
            return;
        }

        if (isPlainObject(value)) {
            if (/^arrum[aã]cao(\s*json|_json)?$/i.test(prefix) || isLikelyBooleanMap(value)) {
                for (const [k, v] of Object.entries(value)) {
                    if (asBool(v)) arrumacao.push(titleCaseFromSnake(k));
                }
                return;
            }

            for (const [k, v] of Object.entries(value)) {
                const nextKey = prefix ? `${prefix}_${k}` : k;

                if (/^arrum[aã]cao(\s*json|_json)?$/i.test(k) && isPlainObject(v)) {
                    for (const [ak, av] of Object.entries(v)) {
                        if (asBool(av)) arrumacao.push(titleCaseFromSnake(ak));
                    }
                    continue;
                }

                walk(nextKey, v);
            }

            return;
        }

        pushRow(prefix, value);
    }

    if (isPlainObject(obj)) {
        for (const [key, value] of Object.entries(obj)) {
            if (["materiais_json", "material_json"].includes(key)) continue;
            if (deveIgnorarCampoTimeline(key, value)) continue;

            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const valRaw = value;
                if (valRaw != null && String(valRaw).trim() !== "") {
                    const nomeBase = titleCaseFromSnake(m[1]);
                    const nome = overrideCampoNome(m[1], nomeBase);
                    rows.push({
                        label: nome,
                        value: formataSeDataIso(String(valRaw)),
                    });
                }
                continue;
            }

            if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key)) {
                if (typeof value === "string") {
                    const parsedArrumacao = tryParseJsonFromStringMaybeEmbedded(value);
                    if (isPlainObject(parsedArrumacao)) {
                        for (const [k, v] of Object.entries(parsedArrumacao)) {
                            if (asBool(v)) arrumacao.push(titleCaseFromSnake(k));
                        }
                    }
                    continue;
                }

                if (isPlainObject(value)) {
                    for (const [k, v] of Object.entries(value)) {
                        if (asBool(v)) arrumacao.push(titleCaseFromSnake(k));
                    }
                    continue;
                }
            }

            walk(key, value);
        }
    } else {
        const text = substituirRotuloVisual(decodeHtmlEntitiesDeep(String(obj)));
        if (pareceUrlImagem(text)) {
            fotos.push({
                label: "Foto",
                url: normalizarUrlImagemTimeline(text),
            });
        } else {
            textoLivre = text;
        }
    }

    return {
        rows,
        fotos,
        arrumacao: [...new Set(arrumacao)],
        textoLivre,
    };
}

function BotaoVerFotoTimeline({
    foto,
    onClick,
}: {
    foto: TimelineFoto;
    onClick: (foto: TimelineFoto) => void;
}) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{foto.label}:</span>

            <button
                type="button"
                onClick={() => onClick(foto)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                title={`Visualizar ${foto.label}`}
                aria-label={`Visualizar ${foto.label}`}
            >
                <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                </svg>
            </button>
        </div>
    );
}

function ModalFotoTimeline({
    foto,
    onClose,
}: {
    foto: TimelineFoto | null;
    onClose: () => void;
}) {
    if (!foto) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 sm:p-6">
            <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="font-semibold text-slate-800">{foto.label}</div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-slate-100"
                        aria-label="Fechar imagem"
                        title="Fechar"
                    >
                        ×
                    </button>
                </div>

                <div className="bg-slate-950 p-3">
                    <img
                        src={foto.url}
                        alt={foto.label}
                        className="max-h-[78vh] w-full rounded-xl object-contain"
                    />
                </div>
            </div>
        </div>
    );
}

function ModalGaleriaFotosTimeline({
    open,
    fotos,
    index,
    onIndexChange,
    onClose,
}: {
    open: boolean;
    fotos: TimelineFoto[];
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}) {
    if (!open || fotos.length === 0) return null;

    const safeIndex = Math.max(0, Math.min(index, fotos.length - 1));
    const foto = fotos[safeIndex];

    const prev = () => onIndexChange(safeIndex <= 0 ? fotos.length - 1 : safeIndex - 1);
    const next = () => onIndexChange(safeIndex >= fotos.length - 1 ? 0 : safeIndex + 1);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 sm:p-6">
            <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">{foto.label}</div>
                        <div className="text-xs text-slate-500">
                            {safeIndex + 1} de {fotos.length}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border hover:bg-slate-100"
                        aria-label="Fechar galeria"
                        title="Fechar"
                    >
                        ×
                    </button>
                </div>

                <div className="relative bg-slate-950 p-3">
                    <img
                        src={foto.url}
                        alt={foto.label}
                        className="max-h-[72vh] w-full rounded-xl object-contain"
                    />

                    {fotos.length > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={prev}
                                className="absolute left-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
                                aria-label="Foto anterior"
                            >
                                ‹
                            </button>
                            <button
                                type="button"
                                onClick={next}
                                className="absolute right-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
                                aria-label="Próxima foto"
                            >
                                ›
                            </button>
                        </>
                    )}
                </div>

                {fotos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto border-t bg-white p-3">
                        {fotos.map((f, i) => (
                            <button
                                key={`${f.url}-${i}`}
                                type="button"
                                onClick={() => onIndexChange(i)}
                                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${i === safeIndex ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"}`}
                                title={f.label}
                            >
                                <img src={f.url} alt={f.label} className="h-full w-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function LinhaDoTempoLogs({
    logs,
    usuarioVisivel = true,
}: {
    logs: LogItem[];
    usuarioVisivel?: boolean;
}) {
    const [fotoAberta, setFotoAberta] = useState<TimelineFoto | null>(null);

    const logsFiltrados = useMemo(
        () => (logs || []).filter((log) => !isLogSemAlteracoes(log)),
        [logs]
    );

    if (!logsFiltrados || logsFiltrados.length === 0) {
        return (
            <div className="p-4 text-center text-muted-foreground">
                Nenhum log encontrado.
            </div>
        );
    }

    return (
        <>
            <div className="space-y-3 w-full min-w-0 overflow-x-hidden">
                {logsFiltrados.map((ent, i) => {
                    const titulo = tituloLogTimeline(ent);
                    const emoji = iconeAcaoTimeline(ent.acao, ent.status_novo);
                    const { rows, fotos, arrumacao, textoLivre } = extrairDetalhesTimeline(ent.detalhes);

                    return (
                        <div
                            key={`${ent.id ?? i}-${ent.datahora ?? "sem-data"}`}
                            className="rounded-2xl border bg-background/70 p-3 sm:p-4 shadow-sm overflow-hidden min-w-0"
                        >
                            <div className="flex gap-3 min-w-0">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
                                    <span aria-hidden>{emoji}</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-muted-foreground">
                                        {formatLogDateTime(ent.datahora)}
                                    </div>

                                    <div className="mt-0.5 text-sm sm:text-base font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">
                                        {titulo}
                                    </div>

                                    {usuarioVisivel && ent.usuario && (
                                        <div className="mt-0.5 text-xs font-medium text-muted-foreground break-words [overflow-wrap:anywhere]">
                                            {ent.usuario}
                                        </div>
                                    )}

                                    {rows.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {rows.map((row, idx) => (
                                                <div
                                                    key={`${row.label}-${idx}`}
                                                    className="rounded-lg border bg-white/70 px-3 py-2 text-xs sm:text-sm text-slate-700 shadow-sm"
                                                >
                                                    <span className="font-semibold text-slate-800">
                                                        {row.label}:
                                                    </span>{" "}
                                                    <span>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {arrumacao.length > 0 && (
                                        <div className="mt-3 rounded-xl border bg-white/70 px-3 py-2 text-xs sm:text-sm">
                                            <div className="font-semibold mb-1">Arrumação:</div>
                                            <ul className="list-disc pl-4 space-y-0.5">
                                                {arrumacao.map((item, idx) => (
                                                    <li
                                                        key={`${item}-${idx}`}
                                                        className="break-words [overflow-wrap:anywhere]"
                                                    >
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {textoLivre && (
                                        <div className="mt-3 rounded-xl border bg-white/70 p-3 text-xs sm:text-sm text-slate-700 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                            {textoLivre}
                                        </div>
                                    )}

                                    {fotos.length > 0 && (
                                        <div className="mt-3 flex flex-col gap-2">
                                            {fotos.map((foto, idx) => (
                                                <BotaoVerFotoTimeline
                                                    key={`${foto.url}-${idx}`}
                                                    foto={foto}
                                                    onClick={setFotoAberta}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <ModalFotoTimeline
                foto={fotoAberta}
                onClose={() => setFotoAberta(null)}
            />
        </>
    );
}
