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

type Aviso = { usuario?: string; mensagem?: string };

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

function timeOr(t?: string) {
    const raw = (t ?? "").trim();
    if (!raw) return "a definir";
    const hhmm = raw.slice(0, 5);
    if (hhmm === "00:00") return "a definir";
    return hhmm;
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

/* =========================
   Página
   ========================= */
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export default function QuadroAtendimentoPage() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");

    const [registros, setRegistros] = useState<Registro[]>(() => readLS<Registro[]>("qa_registros") ?? []);
    const [avisos, setAvisos] = useState<Aviso[]>(() => readLS<Aviso[]>("qa_avisos") ?? []);

    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<Registro | null>(null);
    const [copied, setCopied] = useState(false);

    const [detailTimelineOpen, setDetailTimelineOpen] = useState(false);
    const [detailLogs, setDetailLogs] = useState<LogItem[]>([]);
    const [detailLogsLoading, setDetailLogsLoading] = useState(false);
    const [detailLogsError, setDetailLogsError] = useState<string | null>(null);

    const [matLookup, setMatLookup] = useState<Record<string, MatLookupInfo>>({});

    useEffect(() => {
        const update = () => {
            const now = new Date();
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
                // mantém já
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

    const carregarHistoricoDoDetalhe = useCallback(async (r: Registro) => {
        setDetailLogs([]);
        setDetailLogsError(null);
        setDetailLogsLoading(true);

        try {
            const sepId =
                (r as any).sepultamento_id ??
                (r as any).sepultamentoId ??
                (r as any).id ??
                (r as any).id_atendimento ??
                (r as any).codigo;

            if (!sepId) {
                console.warn("Registro sem sepultamento_id para histórico:", r);
                setDetailLogs([]);
                return;
            }

            // ✅ DEPOIS (direto no PHP)
            const BASE = `https://api.planoassistencialintegrado.com.br/historico_sepultamentos.php?log=1&id=${encodeURIComponent(
                String(sepId)
            )}`;
            const url = `${BASE}&_ts=${Date.now()}`;
            const json: any = await fetchJsonFast<any>(url, { ttlMs: 20_000, cacheKey: `hist_${sepId}` });

            let logs: LogItem[] = [];
            if (Array.isArray(json)) logs = json as LogItem[];
            else if (json?.sucesso && Array.isArray(json.dados)) logs = json.dados as LogItem[];

            logs = [...logs].sort((a, b) => parseLogTs(a.datahora) - parseLogTs(b.datahora));
            setDetailLogs(logs);
        } catch (e) {
            console.error(e);
            setDetailLogsError("Não foi possível carregar o histórico deste atendimento.");
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

            <DesktopTable ativos={ativosOrdenados} onSelect={showDetail} />
            <MobileCards ativos={ativosOrdenados} onSelect={showDetail} />

            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Avisos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mensagens importantes do sistema</p>
                <div className="mt-4 space-y-2">
                    {avisos.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum aviso no momento.</p>
                    ) : (
                        avisos.map((a, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                                <strong>{shown(a.usuario, "")}</strong>
                                <span>{shown(a.mensagem, "")}</span>
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
        </div>
    );
}

/* ===== Listas Memoizadas ===== */

const DesktopTable = React.memo(function DesktopTable({ ativos, onSelect }: { ativos: Registro[]; onSelect: (r: Registro) => void }) {
    return (
        <div className="hidden sm:block rounded-2xl border bg-card/60 p-0 shadow-sm">
            <div className="overflow-x-auto rounded-2xl">
                <table className="min-w-full text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                        <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-left">
                            <th>Data</th>
                            <th>Falecido(a)</th>
                            <th>Local</th>
                            <th>Hora</th>
                            <th>Agente</th>
                            <th>Status</th>
                            <th>Etapas</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {ativos.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                                    Nenhum atendimento encontrado.
                                </td>
                            </tr>
                        ) : (
                            ativos.map((r, i) => {
                                const preenchidas = etapasPreenchidas(r);
                                return (
                                    <tr key={i} className="[&>td]:px-4 [&>td]:py-3">
                                        <td>{dateOr(r.data)}</td>
                                        <td>
                                            <button className="font-semibold underline-offset-2 hover:underline" onClick={() => onSelect(r)} title="Ver detalhes">
                                                {shown(r.falecido)}
                                            </button>
                                        </td>
                                        <td>
                                            <LocalVelorioValue value={r.local_velorio} />
                                        </td>
                                        <td>{timeOr(r.hora_fim_velorio)}</td>
                                        <td>{shown(r.agente)}</td>
                                        <td>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white ${badgeClass(r.status)}`}>
                                                {capStatus(r.status) || "a definir"}
                                            </span>
                                        </td>
                                        <td>
                                            <EtapasInlineDots filled={preenchidas} />
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

const MobileCards = React.memo(function MobileCards({ ativos, onSelect }: { ativos: Registro[]; onSelect: (r: Registro) => void }) {
    return (
        <div className="sm:hidden space-y-3">
            {ativos.length === 0 ? (
                <div className="rounded-xl border bg-card/60 p-4 text-center text-muted-foreground">Nenhum atendimento encontrado.</div>
            ) : (
                ativos.map((r, i) => {
                    const preenchidas = etapasPreenchidas(r);
                    const dataBR = dateOr(r.data);
                    const hora = timeOr(r.hora_fim_velorio);
                    const statusTxt = capStatus(r.status) || "a definir";
                    const statusBg = badgeClass(r.status);
                    const localSep = shown(r.local_sepultamento || r.local);
                    const convKind = normalizeConvenio(r.convenio);

                    return (
                        <div key={i} className="rounded-xl border bg-card/60 p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <button
                                    className="text-left text-[17px] font-semibold leading-tight underline-offset-2 hover:underline"
                                    onClick={() => onSelect(r)}
                                    title="Ver detalhes"
                                >
                                    {shown(r.falecido)}
                                </button>
                                <div className="shrink-0 text-xs text-muted-foreground mt-0.5">{dataBR}</div>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${statusBg}`}>
                                        {statusTxt}
                                    </span>
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${convenioClass(convKind)}`}
                                        title="Convênio"
                                    >
                                        {convKind}
                                    </span>
                                </div>
                                <div className="text-xs">
                                    <span className="text-muted-foreground">Agente:&nbsp;</span>
                                    <b>{shown(r.agente)}</b>
                                </div>
                            </div>

                            <div className="mt-2 text-sm">
                                <span className="text-muted-foreground">Local:&nbsp;</span>
                                <LocalVelorioValue value={r.local_velorio} />
                            </div>

                            <div className="mt-3 rounded-lg border bg-background p-3">
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Sepultamento&nbsp;</span>
                                    <b>{localSep}</b>
                                </div>
                                <div className="mt-1 grid grid-cols-2 text-sm">
                                    <div className="text-muted-foreground">{dateOr(r.data_fim_velorio)}</div>
                                    <div className="text-right">{hora}</div>
                                </div>
                            </div>

                            <div className="mt-3">
                                <div className="text-xs text-muted-foreground">Etapas:</div>
                                <EtapasInlineDots filled={preenchidas} />
                            </div>
                        </div>
                    );
                })
            )}
        </div>
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
    const labels = ["D", "I", "V", "S"];
    return (
        <div className="mt-1 flex items-center gap-4">
            {labels.map((label, k) => (
                <div key={k} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span className={`h-3.5 w-3.5 rounded-full border ${filled[k] ? STAGE_DOT_FILLED[k] : STAGE_DOT_EMPTY}`} />
                </div>
            ))}
        </div>
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
        if (typeof v === "boolean" || ["true", "false", "1", "0", "sim", "nao", "não"].includes(s)) boolish++;
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

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
            return JSON.parse(trimmed);
        } catch {
            /* ignore */
        }
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
        const slice = trimmed.slice(start, end + 1);
        try {
            return JSON.parse(slice);
        } catch {
            /* ignorar */
        }
    }
    return null;
}

function buildDetalhesNodes(raw: unknown): React.ReactNode {
    if (raw == null || raw === "") return null;

    let obj: unknown = raw;

    if (typeof raw === "string") {
        const parsed = tryParseJsonFromStringMaybeEmbedded(raw);
        if (parsed != null) obj = parsed;
        else {
            const text = substituirRotuloVisual(decodeHtmlEntitiesDeep(raw).trim());
            return text ? <div className="mt-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</div> : null;
        }
    }

    if (isPlainObject(obj)) {
        const plainObj = obj as Record<string, unknown>;

        if (isLikelyBooleanMap(plainObj)) {
            const arrItems = Object.entries(plainObj)
                .filter(([, v]) => asBool(v))
                .map(([k]) => titleCaseFromSnake(k));

            return arrItems.length ? (
                <div className="mt-3 w-full min-w-0">
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs">
                        <div className="font-semibold mb-1">Arrumação:</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                            {arrItems.map((t, idx) => (
                                <li key={idx} className="break-words [overflow-wrap:anywhere]">
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ) : null;
        }

        const arrItems: string[] = [];
        const rows: { id: string; label: string; value: string }[] = [];

        for (const key of Object.keys(plainObj)) {
            if (["materiais_json", "id", "acao"].includes(key)) continue;

            const value = plainObj[key];

            if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key) && value && isPlainObject(value)) {
                for (const [k, v] of Object.entries(value)) {
                    if (asBool(v)) arrItems.push(titleCaseFromSnake(k));
                }
                continue;
            }

            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const valRaw = value;
                if (valRaw != null && String(valRaw).trim() !== "") {
                    const nomeBase = titleCaseFromSnake(m[1]);
                    const nome = overrideCampoNome(m[1], nomeBase);
                    const valFmt = formataSeDataIso(String(valRaw));
                    rows.push({ id: key, label: nome, value: valFmt });
                }
                continue;
            }

            if (value == null) continue;
            if (typeof value === "object") continue;

            const valStr = decodeHtmlEntitiesDeep(String(value)).trim();
            if (!valStr) continue;

            let nome = key.replace(/_/g, " ");
            nome = overrideCampoNome(key, titleCaseFromSnake(nome));
            let valFmt = valStr;

            const maybeEmbedded = tryParseJsonFromStringMaybeEmbedded(valFmt);
            if (maybeEmbedded && isPlainObject(maybeEmbedded) && isLikelyBooleanMap(maybeEmbedded as Record<string, unknown>)) {
                const map = maybeEmbedded as Record<string, unknown>;
                const items = Object.entries(map)
                    .filter(([, v]) => asBool(v))
                    .map(([k]) => titleCaseFromSnake(k));
                if (items.length) arrItems.push(...items);
                continue;
            }

            if (valFmt.toLowerCase().startsWith("fase")) valFmt = traduzirFase(valFmt);
            valFmt = formataSeDataIso(valFmt);

            nome = substituirRotuloVisual(nome);
            valFmt = substituirRotuloVisual(valFmt);

            rows.push({ id: key, label: nome, value: valFmt });
        }

        if (rows.length === 0 && arrItems.length === 0) return null;

        return (
            <div className="mt-3 space-y-2 w-full min-w-0">
                {arrItems.length > 0 && (
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs">
                        <div className="font-semibold mb-1">Arrumação:</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                            {[...new Set(arrItems)].map((t, idx) => (
                                <li key={idx} className="break-words [overflow-wrap:anywhere]">
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {rows.map((row) => (
                    <div key={row.id} className="rounded-lg border bg-background px-3 py-2 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0">
                        <span className="font-semibold">{row.label}: </span>
                        <span className="break-words [overflow-wrap:anywhere]">{row.value}</span>
                    </div>
                ))}
            </div>
        );
    }

    const text = substituirRotuloVisual(decodeHtmlEntitiesDeep(String(obj)));
    return text.trim() ? <div className="mt-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</div> : null;
}

function LinhaDoTempoLogs({ logs, usuarioVisivel = true }: { logs: LogItem[]; usuarioVisivel?: boolean }) {
    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-muted-foreground">Nenhum log encontrado.</div>;
    }

    return (
        <div className="space-y-2 w-full min-w-0 overflow-x-hidden">
            {logs.map((ent, i) => {
                const acao = ent.acao ? capitalize(ent.acao) : "";
                const statusLabel = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const detalhes = buildDetalhesNodes(ent.detalhes);

                return (
                    <div key={i} className="log-entry rounded-xl border bg-background/60 p-2.5 shadow-sm overflow-hidden min-w-0">
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 min-w-0">
                            <div className="text-xl leading-none flex-shrink-0 sm:mt-0.5">{iconForAction(ent.acao, ent.status_novo)}</div>

                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] text-muted-foreground">{formatLogDateTime(ent.datahora)}</div>

                                <div className="text-sm flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="break-words [overflow-wrap:anywhere]">{acao}</span>
                                    {statusLabel && (
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary break-words [overflow-wrap:anywhere]">
                                            {statusLabel}
                                        </span>
                                    )}
                                </div>

                                {usuarioVisivel && (
                                    <div className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">Usuário: {ent.usuario ?? ""}</div>
                                )}

                                {detalhes}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
