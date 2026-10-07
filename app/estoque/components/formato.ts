import type { Categoria, Classificacao, EntradaItem, Fabricante, ID, Opt, Produto } from "./tipos";

// Formatação: nomes, datas, R$, máscaras, rateio de frete, CSV e opções de filtro.

export function nomeChave(value?: string | null) {
    return (value || "").trim().toLocaleUpperCase("pt-BR");
}

export function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

export function fmtDateTime(iso: string) {
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}


export function localDateInputValue(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function dashboardTodayValue() {
    return localDateInputValue(new Date());
}

export function dashboardMonthStartValue() {
    const d = new Date();
    d.setDate(1);
    return localDateInputValue(d);
}

export function historicoTimestamp(value?: string | null) {
    if (!value) return NaN;
    const normalized = String(value).trim().replace(" ", "T");
    const time = new Date(normalized).getTime();
    return Number.isFinite(time) ? time : NaN;
}

export function moneyBRL(n: number) {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(n);
    } catch {
        const safe = Number.isFinite(n) ? n : 0;
        return `R$ ${safe.toFixed(2)}`;
    }
}

export function maskBRLFromDigits(digitsOnly: string) {
    const digits = (digitsOnly || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    const value = cents / 100;

    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    } catch {
        const v = Number.isFinite(value) ? value : 0;
        const fixed = v.toFixed(2);
        const [intPart, dec] = fixed.split(".");
        const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${withDots},${dec}`;
    }
}

export function parseBRLToNumber(brlText: string) {
    const digits = (brlText || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    return cents / 100;
}

export function roundCost(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(0, value) * 10000) / 10000;
}

export function ratearFreteEntrada(items: EntradaItem[], freteTotalInformado: number): EntradaItem[] {
    const totalQuantidade = items.reduce((total, item) => total + clampInt(item.qtd), 0);
    const freteTotal = roundCost(freteTotalInformado);

    if (!items.length || totalQuantidade <= 0) {
        return items.map((item) => ({
            ...item,
            freteTotal: 0,
            freteUnitario: 0,
            custoUnitario: roundCost(item.custoBaseUnitario),
            custoTotal: roundCost(item.custoBaseUnitario * item.qtd),
            payload: { ...item.payload, frete_total: 0 },
        }));
    }

    const fretePorUnidadeTeorico = freteTotal / totalQuantidade;
    let freteDistribuido = 0;

    return items.map((item, index) => {
        const quantidade = clampInt(item.qtd);
        const isLast = index === items.length - 1;
        const freteRestante = roundCost(Math.max(0, freteTotal - freteDistribuido));
        const freteCalculado = roundCost(fretePorUnidadeTeorico * quantidade);
        const freteDoItem = isLast
            ? freteRestante
            : Math.min(freteCalculado, freteRestante);

        freteDistribuido = roundCost(freteDistribuido + freteDoItem);

        const freteUnitario = quantidade > 0 ? roundCost(freteDoItem / quantidade) : 0;
        const custoUnitario = roundCost(item.custoBaseUnitario + freteUnitario);
        const custoTotal = roundCost(custoUnitario * quantidade);

        return {
            ...item,
            freteTotal: freteDoItem,
            freteUnitario,
            custoUnitario,
            custoTotal,
            payload: {
                ...item.payload,
                frete_total: freteDoItem,
            },
        };
    });
}

export function maskBRLInput(raw: string) {
    const digits = (raw || "").replace(/\D/g, "");
    return maskBRLFromDigits(digits);
}


export function createOperationUuid() {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {
        // fallback abaixo
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

export function escapeCsvCell(v: any, sep = ";") {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

export function uniqOptions(items: Array<Opt | null | undefined>) {
    const map = new Map<ID, Opt>();

    for (const item of items) {
        if (!item?.id) continue;
        if (!map.has(item.id)) map.set(item.id, item);
    }

    return Array.from(map.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR")
    );
}

export function produtoCategoriaOption(p: Produto, catById: Map<ID, Categoria>): Opt | null {
    const id = Number(p.categoria_id || 0);
    if (!id) return null;

    const nome = p.categoria_nome || catById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}

export function produtoFabricanteOption(p: Produto, fabById: Map<ID, Fabricante>): Opt | null {
    const id = Number(p.fabricante_id || 0);
    if (!id) return null;

    const nome = p.fabricante_nome || fabById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}

export function produtoClassificacaoOption(p: Produto, classById: Map<ID, Classificacao>): Opt | null {
    const id = Number(p.classificacao_id || 0);
    if (!id) return null;

    const nome = p.classificacao_nome || classById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}
