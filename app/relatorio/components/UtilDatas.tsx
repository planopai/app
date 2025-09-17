"use client";

/* ======================== Datas ======================== */

export function formataDataHora(str?: string) {
    if (!str) return "";
    const dt = new Date(str.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return str;
    return dt.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/Sao_Paulo",
        hour12: false,
    });
}

export function formataDataDia(str?: string) {
    if (!str) return "";
    const dt = new Date(str.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return str;
    return dt.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
    });
}

export function formataSeDataIso(v?: string): string {
    if (!v) return "";
    const s = String(v).trim();

    // ISO só data
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const dt = new Date(s + "T00:00:00");
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
            });
        }
    }

    // ISO com hora
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        const dt = new Date(s.replace(" ", "T"));
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: s.length >= 19 ? "2-digit" : undefined,
                timeZone: "America/Sao_Paulo",
                hour12: false,
            });
        }
    }

    return s;
}

/* ======================== Extras úteis (código grande) ======================== */

export function hojeIso(): string {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    return dt.toISOString().slice(0, 10);
}

export function ontemIso(): string {
    const dt = new Date();
    dt.setDate(dt.getDate() - 1);
    dt.setHours(0, 0, 0, 0);
    return dt.toISOString().slice(0, 10);
}

export function primeiroDiaMesIso(): string {
    const dt = new Date();
    dt.setDate(1);
    dt.setHours(0, 0, 0, 0);
    return dt.toISOString().slice(0, 10);
}
