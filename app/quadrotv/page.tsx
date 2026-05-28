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

    invol?: any;

    ornamentacao?: string;
    ornamentacao_tipo?: string;

    local?: string;
    local_sepultamento?: string;

    materiais?: string;
    material?: string;

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
function decodeHtmlEntitiesOnce(input: string): string {
    if (!input) return input;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.innerHTML = input;
        return ta.value;
    }

    return input
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
        )
        .replace(/&#(\d+);/g, (_, num) =>
            String.fromCharCode(parseInt(num, 10))
        );
}

function decodeHtmlEntitiesDeep(input: string, maxPasses = 3): string {
    let s = String(input ?? "");
    for (let i = 0; i < maxPasses; i++) {
        const next = decodeHtmlEntitiesOnce(s);
        if (next === s) break;
        s = next;
    }
    return s;
}

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

    const m = normalized.match(/^(\d+(?:\.\d+)?)/);
    if (m?.[1]) return `${m[1]}x`;

    return `${normalized}x`;
}

function normalizeMatTextToQtyPrefix(text: string): string {
    const s = decodeHtmlEntitiesDeep(String(text ?? ""))
        .replace(/\s+/g, " ")
        .trim();
    if (!s) return s;

    let m = s.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s*(.+)$/);
    if (m) {
        const qtd = m[1].replace(",", ".");
        const nome = m[2].trim();
        return `${qtd}x ${nome}`;
    }

    m = s.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)\s*$/);
    if (m) {
        const nome = m[1].trim();
        const qtd = m[2].replace(",", ".");
        return `${qtd}x ${nome}`;
    }

    return `1x ${s}`;
}

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

function isJsonNoiseLine(raw: any): boolean {
    const s = decodeHtmlEntitiesDeep(String(raw ?? "")).trim();
    if (!s) return false;

    const low = s.toLowerCase().replace(/\s+/g, " ").trim();
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

        if (isJsonNoiseLine(s)) return;

        if (low.startsWith("{") || low.startsWith("[")) return;
        if (looksLikeMateriaisJson(s)) return;

        if (["selecionar...", "selecione...", "a definir"].includes(low)) return;

        const withQtd = normalizeMatTextToQtyPrefix(s);
        if (!withQtd) return;

        if (isJsonNoiseLine(withQtd)) return;

        if (seen.has(withQtd)) return;
        seen.add(withQtd);
        out.push(withQtd);
    };

    const pushNomeQtd = (nomeRaw: any, qtdRaw?: any) => {
        const nome = decodeHtmlEntitiesDeep(String(nomeRaw ?? "")).trim();
        if (!nome) return;

        const prefix = qtyPrefixFromAny(qtdRaw);
        pushItem(`${prefix} ${nome}`);
    };

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
                const qtdVal =
                    (node as any).qtd ??
                    (node as any).quantidade ??
                    (node as any).qtd_item;

                if (maybeNome != null && (hasChecked ? asBool(checkedVal) : true)) {
                    items.push({ nome: maybeNome, qtd: qtdVal });
                }

                const containerKeys = [
                    "itens",
                    "items",
                    "materiais",
                    "materiais_json",
                    "material_json",
                    "data",
                ];
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

            pushItem(`1x ${nome}: ${valStr}`);
        }

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
                pushItem(`1x ${nome}: ${valStr}`);
            }
        }
    };

    const addFromUnknown = ((raw: unknown) => {
        if (raw == null || raw === "") return;

        if (Array.isArray(raw)) {
            if (extractFromStructured(raw)) return;
            for (const it of raw) pushItem(it);
            return;
        }

        if (isPlainObject(raw)) {
            if (extractFromStructured(raw)) return;

            const obj = raw as Record<string, unknown>;
            if (isLikelyBooleanMap(obj)) addFromBooleanMap(obj);
            else addFromMixedObject(obj);
            return;
        }

        if (typeof raw === "string") {
            let s = decodeHtmlEntitiesDeep(raw).trim();
            if (!s) return;

            const original = s;
            s = s.replace(/^\s*json\s*:\s*/i, "").trim();

            const parsed = tryParseJsonFromStringMaybeEmbedded(s);
            if (parsed != null) {
                if (extractFromStructured(parsed)) return;
                return;
            }

            const extracted = extractMateriaisByRegex(s);
            if (extracted.length) {
                extracted.forEach((it) => pushNomeQtd(it.nome, it.qtd));
                return;
            }

            if (/^\s*json\s*:/i.test(original) || looksLikeMateriaisJson(s)) return;

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
                s.split(";")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .forEach(pushItem);
                return;
            }
            if (s.includes(",")) {
                s.split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .forEach(pushItem);
                return;
            }

            pushItem(s);
            return;
        }

        if (typeof raw === "number") return;
        if (typeof raw === "boolean") return;

        pushItem(String(raw));
    }) as (raw: unknown) => void;

    addFromUnknown((registro as any).materiais_json);
    addFromUnknown((registro as any).material_json);
    addFromUnknown((registro as any).materiais);
    addFromUnknown((registro as any).material);

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

function extractMateriaisStructuredWithKey(registro: Registro): MatLine[] {
    const out: MatLine[] = [];
    const seen = new Set<string>();

    const pushItem = (raw: any, itemKey?: string) => {
        const s0 = String(raw ?? "");
        const s = decodeHtmlEntitiesDeep(s0).trim();
        if (!s) return;

        const low = s.toLowerCase().trim();

        if (isJsonNoiseLine(s)) return;

        if (low.startsWith("{") || low.startsWith("[")) return;
        if (looksLikeMateriaisJson(s)) return;
        if (["selecionar...", "selecione...", "a definir"].includes(low)) return;

        const withQtd = normalizeMatTextToQtyPrefix(s);
        if (!withQtd) return;

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
            const qtdVal =
                (node as any).qtd ??
                (node as any).quantidade ??
                (node as any).qtd_item;

            const inferredKey =
                normalizeItemKeyFromAny((node as any).item_id) ??
                normalizeItemKeyFromAny((node as any).itemId) ??
                normalizeItemKeyFromAny((node as any).item_key) ??
                normalizeItemKeyFromAny((node as any).id) ??
                (typeof parentKey === "string" && /^item\d+$/i.test(parentKey)
                    ? parentKey
                    : undefined);

            if (maybeNome != null && (hasChecked ? asBool(checkedVal) : true)) {
                pushNomeQtd(maybeNome, qtdVal, inferredKey);
            }

            const containerKeys = [
                "itens",
                "items",
                "materiais",
                "materiais_json",
                "material_json",
                "data",
            ];
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

    const filteredLines = (lines ?? []).filter(
        (l) => isRealMaterialForClipboard(l.text) && !isJsonNoiseLine(l.text)
    );

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
    if (
        /^(google\.com|maps\.google\.com|www\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)
    )
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

/** ✅ mostra só dia/mês (17/12) para a coluna "Sepultamento" */
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

    const m2 = raw.match(/(\d{2})\/(\d{2})/);
    if (m2) return `${m2[1]}/${m2[2]}`;

    const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}`;

    return raw;
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

    const structured = extractMateriaisStructuredWithKey(r);
    const flat = normalizeMateriaisFromRegistro(r);

    const linesAll: MatLine[] = (() => {
        if (structured.length === 0) return flat.map((t) => ({ text: t }));
        const have = new Set(structured.map((x) => x.text));
        const extras = flat.filter((t) => !have.has(t)).map((t) => ({ text: t }));
        return [...structured, ...extras];
    })();

    const filtered = linesAll.filter((l) => isRealMaterialForClipboard(l.text) && !isJsonNoiseLine(l.text));

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

/* ===== Status visual com tempo por etapa ===== */
type StatusStepInfo = { key: string; label: string; shortLabel: string; icon: string };
type StatusSegment = { key: string; label: string; shortLabel: string; icon: string; start: number; end: number; active: boolean };

const STATUS_STEP_DEFS: StatusStepInfo[] = [
    { key: "fase01", label: "Removendo", shortLabel: "Remov.", icon: "🚨" },
    { key: "fase02", label: "Aguardando Procedimento", shortLabel: "Aguard.", icon: "⏳" },
    { key: "fase03", label: "Preparando", shortLabel: "Prep.", icon: "🧑‍⚕️" },
    { key: "fase04", label: "Aguardando Ornamentação", shortLabel: "A. Orn.", icon: "💐" },
    { key: "fase05", label: "Ornamentando", shortLabel: "Ornam.", icon: "🌸" },
    { key: "fase06", label: "Corpo Pronto", shortLabel: "Pronto", icon: "✅" },
    { key: "fase07", label: "Transportando P/ Velório", shortLabel: "T. Vel.", icon: "🚗" },
    { key: "fase08", label: "Velando", shortLabel: "Velando", icon: "⚰️" },
    { key: "fase09", label: "Sepultando", shortLabel: "Sepult.", icon: "🚙" },
    { key: "fase10", label: "Sepultamento Concluído", shortLabel: "Concl.", icon: "🪦" },
    { key: "fase11", label: "Material Recolhido", shortLabel: "Mat. Rec.", icon: "📦" },
];

const STATUS_STEPS: StatusStepInfo[] = STATUS_STEP_DEFS.filter((step) =>
    ["fase01", "fase03", "fase05", "fase08", "fase09"].includes(step.key)
);

const STATUS_STEP_MAP = STATUS_STEP_DEFS.reduce<Record<string, StatusStepInfo>>((acc, step) => {
    acc[step.key] = step;
    return acc;
}, {});

function getStatusStepInfo(status?: string): StatusStepInfo {
    const key = normalizarStatus(status) || "";
    return STATUS_STEP_MAP[key] ?? { key: key || "indefinido", label: capStatus(status) || "a definir", shortLabel: "Status", icon: "•" };
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
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildStatusSegments(registro: Registro, logs: LogItem[] | undefined, nowMs: number): StatusSegment[] {
    const currentKey = normalizarStatus(registro.status);
    const events = (logs ?? [])
        .map((log) => ({ key: getStatusFromLog(log), ts: parseLogTs(log.datahora) }))
        .filter((x): x is { key: string; ts: number } => !!x.key && x.ts > 0)
        .sort((a, b) => a.ts - b.ts);

    const unique: { key: string; ts: number }[] = [];
    for (const ev of events) {
        if (unique.length === 0 || unique[unique.length - 1].key !== ev.key) unique.push(ev);
    }

    if (unique.length === 0) {
        const key = currentKey || "indefinido";
        const info = getStatusStepInfo(key);
        const start = parseRegistroDateTime(registro) || nowMs;
        return [{ key: info.key, label: info.label, shortLabel: info.shortLabel, icon: info.icon, start, end: nowMs, active: !!currentKey }];
    }

    if (currentKey && unique[unique.length - 1].key !== currentKey) {
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
            active: isLast && (!currentKey || ev.key === currentKey),
        };
    });
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
        const BASE_INFO = "/api/php/informativo.php?listar=1";

        async function load() {
            try {
                const url = `${BASE_INFO}&_ts=${Date.now()}`;
                const j = await fetchJsonFast<any>(url, { ttlMs: 6_000, cacheKey: "informativo_listar" });
                if (!alive) return;
                const arr = Array.isArray(j) ? (j as Registro[]) : [];
                setRegistros(arr);
                writeLS("qa_registros", arr);
            } catch {
                // mantém o que já tem
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
        const BASE_AVISOS = "/api/php/avisos.php?listar=1";

        async function load() {
            if (!alive) return;

            try {
                const url = `${BASE_AVISOS}&_ts=${Date.now()}`;
                const j = await fetchJsonFast<any>(url, {
                    ttlMs: 5_000,
                    cacheKey: "avisos_listar",
                });

                if (!alive) return;

                const arr: Aviso[] = Array.isArray(j) ? j : [];

                setAvisos(arr);
                writeLS("qa_avisos", arr);
            } catch (err) {
                console.error("Erro ao carregar avisos:", err);

                if (!alive) return;

                // mantém a UI estável e limpa o cache persistido
                setAvisos([]);
                writeLS("qa_avisos", []);
            }
        }

        load();

        const id = window.setInterval(() => {
            void load();
        }, 10000);

        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, []);

    useEffect(() => {
        let alive = true;

        async function loadMateriaisCatalog() {
            try {
                const url = `/api/php/materiais_admin.php?op=list&all=1&_ts=${Date.now()}`;
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

    useEffect(() => {
        let alive = true;

        async function loadStatusLogs() {
            const updates: Record<string, LogItem[]> = {};
            const ativosComId = ativosOrdenados
                .map((r) => ({ r, id: getRegistroBackendId(r), trackingId: getRegistroTrackingId(r) }))
                .filter((x) => !!x.id);

            await Promise.all(
                ativosComId.map(async ({ id, trackingId }) => {
                    try {
                        const BASE = `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(String(id))}`;
                        const url = `${BASE}&_ts=${Date.now()}`;
                        const json: any = await fetchJsonFast<any>(url, { ttlMs: 20_000, cacheKey: `hist_${id}` });

                        let logs: LogItem[] = [];
                        if (Array.isArray(json)) logs = json as LogItem[];
                        else if (json?.sucesso && Array.isArray(json.dados)) logs = json.dados as LogItem[];

                        updates[trackingId] = [...logs].sort((a, b) => parseLogTs(a.datahora) - parseLogTs(b.datahora));
                    } catch {
                        updates[trackingId] = [];
                    }
                })
            );

            if (!alive) return;
            setStatusLogsById((prev) => ({ ...prev, ...updates }));
        }

        loadStatusLogs();
        const id = window.setInterval(() => {
            void loadStatusLogs();
        }, 30000);

        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, [ativosOrdenados]);

    const TAG_SERVICO = "Atendimento:";

    function normNome(s?: string) {
        return String(s ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function isServicoMsg(msg?: any) {
        const s = String(msg ?? "");
        return s.startsWith(TAG_SERVICO);
    }

    function extractServicoNome(msg?: string) {
        const s = String(msg ?? "");
        if (!s.startsWith(TAG_SERVICO)) return "";

        const rest = s.slice(TAG_SERVICO.length).trim();
        const idx = rest.indexOf(":");

        return (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    }

    const nomesAtivos = useMemo(() => {
        const set = new Set<string>();

        for (const r of ativosOrdenados as Registro[]) {
            const nome = String(r?.falecido ?? "").trim();
            if (nome) set.add(normNome(nome));
        }

        return set;
    }, [ativosOrdenados]);

    const avisosParaExibir = useMemo(() => {
        const arr = Array.isArray(avisos) ? avisos : [];

        return arr.filter((a) => {
            const msg = String(a?.mensagem ?? "");

            // aviso comum: sempre exibe
            if (!isServicoMsg(msg)) return true;

            // aviso de serviço: só exibe se o nome ainda estiver entre os ativos
            const nome = extractServicoNome(msg);
            if (!nome) return true;

            return nomesAtivos.has(normNome(nome));
        });
    }, [avisos, nomesAtivos]);

    const handleCopy = useCallback(async () => {
        if (!detail) return;
        const text = buildClipboardText(detail, matLookup);
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

            const BASE = `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(String(sepId))}`;
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
        (missing: string[]) => (missing.length ? `Pendências: ${missing.map((k) => LABELS[k] ?? k).join(", ")}.` : "Completo."),
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
        <>
            <style jsx global>{`
                html,
                body,
                #__next,
                body > div {
                    max-width: 100vw !important;
                    overflow-x: hidden !important;
                    overflow-y: hidden !important;
                }
                body {
                    scrollbar-width: none !important;
                }
                body::-webkit-scrollbar {
                    display: none !important;
                }
                .qa-page-root {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                    overflow: hidden !important;
                    box-sizing: border-box !important;
                }
                .qa-no-scrollbar {
                    scrollbar-width: none !important;
                }
                .qa-no-scrollbar::-webkit-scrollbar {
                    display: none !important;
                }
            `}</style>
            <div className="qa-page-root flex h-[calc(100dvh-7rem)] w-full max-w-full min-w-0 flex-col gap-2 overflow-hidden px-2 py-2 sm:px-3 sm:py-3">
                <div className="shrink-0 rounded-2xl border bg-card/60 p-3 shadow-sm">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">Quadro de Atendimentos</h1>
                                <p className="mt-0.5 text-xs text-muted-foreground">Atualizado em tempo real</p>
                            </div>

                            <div className="text-right leading-tight">
                                <div className="text-lg font-bold tabular-nums">{clockTime}</div>
                                <div className="text-xs text-muted-foreground">{clockDate}</div>
                            </div>
                        </div>

                        <div className="border-t pt-1 overflow-hidden">
                            <AvisosTicker avisos={avisosParaExibir} />
                        </div>
                    </div>
                </div>

                <DesktopTable ativos={ativosOrdenados} onSelect={showDetail} statusLogsById={statusLogsById} nowMs={nowMs} />
                <MobileCards ativos={ativosOrdenados} onSelect={showDetail} statusLogsById={statusLogsById} nowMs={nowMs} />

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

                                        {normalizeMateriaisFromRegistro(detail).filter((x) => isRealMaterialForClipboard(x) && !isJsonNoiseLine(x)).length > 0 && (
                                            <Field label="Materiais" value={<MateriaisValue registro={detail} lookup={matLookup} />} className="sm:col-span-2" />
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
        </>
    );
}

/* ===== ✅ Avisos em ticker (uma linha, rolando direita -> esquerda) ===== */
function AvisosTicker({ avisos }: { avisos: Aviso[] }) {
    const items = useMemo(() => {
        return (avisos ?? [])
            .map((a) => ({
                usuario: shown(a?.usuario, "").trim(),
                mensagem: shown(a?.mensagem, "").trim(),
            }))
            .filter((x) => x.usuario || x.mensagem);
    }, [avisos]);

    const durationSec = useMemo(() => {
        const totalChars = items.reduce((acc, it) => acc + it.usuario.length + it.mensagem.length + 10, 0);
        const sec = Math.round(totalChars / 10);
        return Math.max(18, Math.min(60, sec));
    }, [items]);

    if (items.length === 0) {
        return <p className="text-[11px] text-muted-foreground">Nenhum aviso no momento.</p>;
    }

    const RenderItems = ({ ariaHidden = false }: { ariaHidden?: boolean }) => (
        <div className="flex items-center gap-8 px-2 py-1 whitespace-nowrap" aria-hidden={ariaHidden ? true : undefined}>
            {items.map((x, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-foreground dark:text-white">
                    {x.usuario ? <strong className="font-semibold text-foreground dark:text-white">{x.usuario}</strong> : null}
                    {x.mensagem ? <span className="text-foreground dark:text-white">{x.mensagem}</span> : null}
                    <span className="text-muted-foreground dark:text-white/70">•</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="relative w-full overflow-hidden">
            <div className="qa-avisos-track flex w-max" style={{ animationDuration: `${durationSec}s` }}>
                <RenderItems />
                <RenderItems ariaHidden />
            </div>

            <style jsx global>{`
                @keyframes qa-avisos-marquee {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
                .qa-avisos-track {
                    will-change: transform;
                    animation-name: qa-avisos-marquee;
                    animation-timing-function: linear;
                    animation-iteration-count: infinite;
                }
                .qa-avisos-track:hover {
                    animation-play-state: paused;
                }
                @media (prefers-reduced-motion: reduce) {
                    .qa-avisos-track {
                        animation: none !important;
                        transform: none !important;
                    }
                }
            `}</style>
        </div>
    );
}

/* ===== Listas Memoizadas ===== */
const DesktopTable = React.memo(function DesktopTable({
    ativos,
    onSelect,
    statusLogsById,
    nowMs,
}: {
    ativos: Registro[];
    onSelect: (r: Registro) => void;
    statusLogsById: Record<string, LogItem[]>;
    nowMs: number;
}) {
    return (
        <div className="hidden min-h-0 flex-1 max-w-full min-w-0 overflow-hidden rounded-2xl border bg-card/60 p-1.5 shadow-sm sm:block qa-no-scrollbar">
            <div className="h-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border/60 qa-no-scrollbar">
                <table className="h-full w-full max-w-full table-fixed text-[12px]">
                    <thead className="bg-muted/60 text-muted-foreground">
                        <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                            <th className="w-[82px] text-center">Data</th>
                            <th className="w-[17%]">Falecido(a)</th>
                            <th className="w-[19%]">Local</th>
                            <th className="w-[104px]">Sepultamento</th>
                            <th className="w-[104px]">Agente</th>
                            <th className="w-[230px] min-w-0">Status</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {ativos.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                                    Nenhum atendimento encontrado.
                                </td>
                            </tr>
                        ) : (
                            ativos.map((r, i) => {
                                const preenchidas = etapasPreenchidas(r);
                                const trackingId = getRegistroTrackingId(r);
                                return (
                                    <tr key={trackingId || i} className="[&>td]:px-2 [&>td]:py-1 align-middle">
                                        <td>
                                            <div className="flex flex-col items-center gap-1 leading-tight text-center">
                                                <EtapasInlineDots filled={preenchidas} />
                                                <div className="text-[12px] leading-none">{dateOr(r.data)}</div>
                                                <ConvenioBadge convenio={r.convenio} size="xs" />
                                            </div>
                                        </td>

                                        <td className="text-left">
                                            <button
                                                className="w-full text-left font-semibold leading-tight underline-offset-2 hover:underline break-words [overflow-wrap:anywhere]"
                                                onClick={() => onSelect(r)}
                                                title="Ver detalhes"
                                            >
                                                {shown(r.falecido)}
                                            </button>
                                        </td>

                                        <td className="truncate">
                                            <LocalVelorioValue value={r.local_velorio} />
                                        </td>

                                        <td>
                                            <div className="leading-tight">
                                                <div className="text-xs text-muted-foreground">{dateDayMonthOr(r.data_fim_velorio)}</div>
                                                <div className="mt-0.5">{timeOr(r.hora_fim_velorio)}</div>
                                            </div>
                                        </td>

                                        <td className="truncate">{shown(r.agente)}</td>
                                        <td className="align-middle">
                                            <StatusTimelineCell registro={r} logs={statusLogsById[trackingId]} nowMs={nowMs} variant="desktop" />
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

const MobileCards = React.memo(function MobileCards({
    ativos,
    onSelect,
    statusLogsById,
    nowMs,
}: {
    ativos: Registro[];
    onSelect: (r: Registro) => void;
    statusLogsById: Record<string, LogItem[]>;
    nowMs: number;
}) {
    return (
        <div className="sm:hidden space-y-3">
            {ativos.length === 0 ? (
                <div className="rounded-xl border bg-card/60 p-4 text-center text-muted-foreground">Nenhum atendimento encontrado.</div>
            ) : (
                ativos.map((r, i) => {
                    const preenchidas = etapasPreenchidas(r);
                    const trackingId = getRegistroTrackingId(r);
                    const dataBR = dateOr(r.data);
                    const hora = timeOr(r.hora_fim_velorio);
                    const localSep = shown(r.local_sepultamento || r.local);

                    return (
                        <div key={trackingId || i} className="rounded-xl border bg-card/60 p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <button
                                    className="text-left text-[17px] font-semibold leading-tight underline-offset-2 hover:underline"
                                    onClick={() => onSelect(r)}
                                    title="Ver detalhes"
                                >
                                    {shown(r.falecido)}
                                </button>
                                <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                                    <EtapasInlineDots filled={preenchidas} />
                                    <div className="text-xs text-muted-foreground">{dataBR}</div>
                                    <ConvenioBadge convenio={r.convenio} size="xs" />
                                </div>
                            </div>

                            <div className="mt-3 rounded-lg border bg-background p-3">
                                <div className="mb-2 text-xs font-semibold text-muted-foreground">Status</div>
                                <StatusTimelineCell registro={r} logs={statusLogsById[trackingId]} nowMs={nowMs} variant="mobile" />
                            </div>

                            <div className="mt-2 text-xs">
                                <span className="text-muted-foreground">Agente:&nbsp;</span>
                                <b>{shown(r.agente)}</b>
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

    const segmentByKey = new Map<string, StatusSegment>();
    for (const seg of segments) {
        segmentByKey.set(seg.key, seg);
    }

    const isMobile = variant === "mobile";

    if (isMobile) {
        const current = segments[segments.length - 1];
        const currentDuration = current ? Math.max(0, current.end - current.start) : 0;
        return (
            <div className="w-full min-w-0 overflow-hidden">
                <div className="grid grid-cols-2 gap-2">
                    <StatusMiniCard
                        label={current?.shortLabel ?? "Status"}
                        icon={current?.icon ?? "•"}
                        time={formatDurationMs(currentDuration)}
                        title={current?.label ?? "Status"}
                        active={!!current?.active}
                    />
                    <StatusMiniCard label="Total" icon="⏱️" time={formatDurationMs(totalMs)} title="Tempo total em atendimento" />
                </div>
                <StatusBlinkStyle />
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 overflow-hidden">
            <div className="grid w-full min-w-0 grid-cols-6 items-stretch gap-px overflow-hidden">
                {STATUS_STEPS.map((step) => {
                    const seg = segmentByKey.get(step.key);
                    const duration = seg ? Math.max(0, seg.end - seg.start) : 0;
                    const active = !!seg?.active;
                    const done = !!seg && !active;

                    return (
                        <StatusMiniCard
                            key={step.key}
                            label={step.shortLabel}
                            icon={step.icon}
                            time={duration > 0 ? formatDurationMs(duration) : "00:00"}
                            title={`${step.label} • ${duration > 0 ? formatDurationMs(duration) : "00:00"}`}
                            active={active}
                            done={done}
                        />
                    );
                })}

                <StatusMiniCard label="Total" icon="⏱️" time={formatDurationMs(totalMs)} title="Tempo total em atendimento" total />
            </div>
            <StatusBlinkStyle />
        </div>
    );
}

function StatusMiniCard({
    label,
    icon,
    time,
    title,
    active = false,
    done = false,
    total = false,
}: {
    label: string;
    icon: string;
    time: string;
    title: string;
    active?: boolean;
    done?: boolean;
    total?: boolean;
}) {
    return (
        <div
            className={`flex h-[26px] min-w-0 flex-col items-center justify-center rounded-[7px] border bg-background/75 px-0 text-center leading-none ${active ? "border-primary/70 ring-1 ring-primary/55" : done || total ? "border-border/70" : "border-border/35 opacity-40"
                }`}
            title={title}
        >
            <div className={`leading-none text-[7px] ${active ? "qa-status-blink" : ""}`}>{icon}</div>
            <div className="mt-[1px] w-full truncate px-[1px] text-[4.2px] font-bold leading-none text-muted-foreground">
                {label}
            </div>
            <div className="mt-[1px] w-full truncate px-[1px] text-[5.6px] font-bold leading-none tabular-nums">
                {time}
            </div>
        </div>
    );
}

function StatusBlinkStyle() {
    return (
        <style jsx global>{`
            @keyframes qa-status-pulse {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                }
                50% {
                    opacity: 0.35;
                    transform: scale(1.08);
                }
            }
            .qa-status-blink {
                display: inline-block;
                animation: qa-status-pulse 1s ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
                .qa-status-blink {
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
        if (typeof v === "boolean" || ["true", "false", "1", "0", "sim", "nao", "não"].includes(s)) boolish++;
    }
    return boolish / entries.length >= 0.8;
}

function looksLikeMateriaisJson(s: string) {
    const t = (s || "").toLowerCase();
    return (t.includes('"nome"') && t.includes('"checked"')) || t.includes('"item');
}

function extractMateriaisByRegex(text: string): Array<{ nome: string; qtd?: string }> {
    const s = decodeHtmlEntitiesDeep(text).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

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
            /* ignore */
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
            return text ? (
                <div className="mt-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</div>
            ) : null;
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
                    <div
                        key={row.id}
                        className="rounded-lg border bg-background px-3 py-2 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0"
                    >
                        <span className="font-semibold">{row.label}: </span>
                        <span className="break-words [overflow-wrap:anywhere]">{row.value}</span>
                    </div>
                ))}
            </div>
        );
    }

    const text = substituirRotuloVisual(decodeHtmlEntitiesDeep(String(obj)));
    return text.trim() ? (
        <div className="mt-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</div>
    ) : null;
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
                                    <div className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                                        Usuário: {ent.usuario ?? ""}
                                    </div>
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