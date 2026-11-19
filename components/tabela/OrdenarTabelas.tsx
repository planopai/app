"use client";

/**
 * OrdenarTabelas (19/11/2026) — ordenar qualquer lista em tabela do sistema clicando no nome da coluna.
 *
 * Montado UMA vez no components/app-shell.tsx (vale para todas as telas, também dentro das abas). Não precisa mexer
 * nas telas: ele acha as tabelas (<table> com <th> no cabeçalho) e deixa o cabeçalho clicável.
 *  - 1º clique: A→Z / menor→maior; clique de novo: inverte.
 *  - Texto em ordem alfabética sem ligar para acento ("Ávila" junto de "Avila") e com números no lugar certo ("Sala 2" antes de "Sala 10").
 *  - Valores (R$ 1.234,56), números, % e datas (dd/mm/aaaa, com ou sem hora; mm/aaaa) pelo valor. Vazio ("", "—", "-") sempre no fim.
 *  - Linha "Total…" fica sempre no fim. Linha de detalhe logo abaixo de outra (uma célula ocupando a linha toda) anda junto com ela.
 *  - A ordem escolhida fica salva no aparelho por tela e por tabela.
 *  - Quando a tela atualiza a lista (busca, filtro, dados novos), a ordem é refeita sozinha.
 *
 * Fica de fora (sem ordenar):
 *  - tabela (ou algo acima dela) com o atributo data-sem-ordenar;
 *  - tabela com campos de digitar no corpo (input, select, textarea): são telas de edição, a ordem é a de quem digita;
 *  - tabela com células juntadas no meio (rowSpan, ou linhas de grupo/subtotal): a ordem faz parte do relatório;
 *  - coluna cujo cabeçalho já tem botão ou campo próprio, está vazio ou ocupa várias colunas (colSpan).
 * Uma célula pode dizer o valor de ordenação com data-valor="..." (ex.: data em ISO, número sem formatação).
 */

import { useEffect } from "react";

type Estado = { col: number; asc: boolean } | null;

const CAMPOS = "input, select, textarea, [contenteditable='true']";
const ATRIBUTO = "data-pai-ord";
const decoradas = new WeakSet<HTMLTableElement>();
const ordemOriginal = new WeakMap<HTMLTableRowElement, number>();
const estados = new WeakMap<HTMLTableElement, Estado>();
let mexendo = false;
let contadorOriginal = 0;

const CSS = `
th[${ATRIBUTO}] { cursor: pointer; user-select: none; -webkit-user-select: none }
th[${ATRIBUTO}]:hover { text-decoration: underline; text-underline-offset: 3px }
th[${ATRIBUTO}]:focus-visible { outline: 2px solid #3D6A99; outline-offset: -2px }
th[${ATRIBUTO}]::after { content: "▲▼"; display: inline-block; margin-left: 4px; font-size: 8px; letter-spacing: -1px; opacity: .35; vertical-align: middle; text-decoration: none }
th[${ATRIBUTO}="asc"]::after { content: "▲"; opacity: 1; color: #3D6A99; letter-spacing: 0 }
th[${ATRIBUTO}="desc"]::after { content: "▼"; opacity: 1; color: #3D6A99; letter-spacing: 0 }
.dark th[${ATRIBUTO}="asc"]::after, .dark th[${ATRIBUTO}="desc"]::after { color: #8FB0D6 }
`;

/* ---------- valores ---------- */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const comparador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

type Valor = { vazio: boolean; n: number | null; t: string };

function lerValor(celula: Element | undefined): Valor {
    if (!celula) return { vazio: true, n: null, t: "" };
    const bruto = (celula.getAttribute("data-valor") ?? celula.textContent ?? "").replace(/\s+/g, " ").trim();
    if (bruto === "" || bruto === "—" || bruto === "-" || bruto === "–") return { vazio: true, n: null, t: "" };
    // data dd/mm/aaaa (com ou sem hora)
    let m = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\D{1,4}(\d{1,2})[:h](\d{2}))?/);
    if (m) return { vazio: false, n: Date.UTC(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0), t: bruto };
    // data ISO aaaa-mm-dd
    m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (m) return { vazio: false, n: Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0), t: bruto };
    // mês mm/aaaa
    m = bruto.match(/^(\d{2})\/(\d{4})$/);
    if (m) return { vazio: false, n: +m[2] * 100 + +m[1], t: bruto };
    // número, valor em R$ ou % (padrão brasileiro: ponto de milhar, vírgula decimal)
    const sinal = bruto.replace(/[−–]/g, "-").replace(/\s/g, "");
    const negativo = /^-|^R\$-/i.test(sinal);
    const limpo = sinal.replace(/^[-+]/, "").replace(/^R\$[-+]?/i, "").replace(/%$/, "");
    if (/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(limpo)) {
        const n = Number(limpo.replace(/\./g, "").replace(",", "."));
        return { vazio: false, n: negativo ? -n : n, t: bruto };
    }
    return { vazio: false, n: null, t: semAcento(bruto) };
}

function comparar(a: Valor, b: Valor): number {
    if (a.n !== null && b.n !== null) return a.n - b.n;
    if (a.n !== null) return -1; // número antes de texto
    if (b.n !== null) return 1;
    return comparador.compare(a.t, b.t);
}

/* ---------- estrutura da tabela ---------- */

function linhaCabecalho(tabela: HTMLTableElement): HTMLTableRowElement | null {
    const thead = tabela.tHead;
    if (thead && thead.rows.length) return thead.rows[thead.rows.length - 1];
    return null;
}

function colunasDoCabecalho(linha: HTMLTableRowElement): { th: HTMLTableCellElement; col: number }[] {
    const lista: { th: HTMLTableCellElement; col: number }[] = [];
    let col = 0;
    for (const c of Array.from(linha.cells)) {
        if (c.tagName === "TH" && c.colSpan === 1) lista.push({ th: c, col });
        col += c.colSpan || 1;
    }
    return lista;
}

function totalColunas(linha: HTMLTableRowElement): number {
    return Array.from(linha.cells).reduce((s, c) => s + (c.colSpan || 1), 0);
}

const ehLinhaCheia = (tr: HTMLTableRowElement, total: number) => tr.cells.length === 1 && (tr.cells[0].colSpan || 1) >= total && total > 1;
const ehTotal = (tr: HTMLTableRowElement) => /^(sub)?total\b/i.test((tr.cells[0]?.textContent || "").trim());

/** Grupos de linhas (linha + detalhes) ou null se a tabela não pode ser ordenada. */
function grupos(tbody: HTMLTableSectionElement, total: number): { linhas: HTMLTableRowElement[]; fixo: boolean }[] | null {
    const lista: { linhas: HTMLTableRowElement[]; fixo: boolean }[] = [];
    for (const tr of Array.from(tbody.rows)) {
        if (Array.from(tr.cells).some((c) => (c.rowSpan || 1) > 1)) return null;
        const cheia = ehLinhaCheia(tr, total);
        if (cheia && lista.length && !lista[lista.length - 1].fixo) { lista[lista.length - 1].linhas.push(tr); continue; } // detalhe da linha de cima
        if (cheia) { lista.push({ linhas: [tr], fixo: true }); continue; } // aviso ("Nenhum registro", carregando)
        if (totalColunas(tr) !== total) return null; // linha de grupo/subtotal: relatório com estrutura própria
        lista.push({ linhas: [tr], fixo: ehTotal(tr) });
    }
    return lista;
}

function podeOrdenar(tabela: HTMLTableElement): boolean {
    if (tabela.closest("[data-sem-ordenar]")) return false;
    for (const tb of Array.from(tabela.tBodies)) if (tb.querySelector(CAMPOS)) return false;
    return true;
}

/* ---------- memória por tela ---------- */

function chave(tabela: HTMLTableElement): string {
    const cab = linhaCabecalho(tabela);
    const nomes = cab ? Array.from(cab.cells).map((c) => (c.textContent || "").trim()).join("|") : "";
    return "pai_ord:" + location.pathname + ":" + nomes.slice(0, 200);
}
function lerSalvo(tabela: HTMLTableElement): Estado {
    try { const v = localStorage.getItem(chave(tabela)); return v ? (JSON.parse(v) as Estado) : null; } catch { return null; }
}
function salvar(tabela: HTMLTableElement, e: Estado) {
    try { if (e) localStorage.setItem(chave(tabela), JSON.stringify(e)); else localStorage.removeItem(chave(tabela)); } catch { /* sem armazenamento: só não lembra */ }
}

/* ---------- ordenar ---------- */

function marcarCabecalho(tabela: HTMLTableElement) {
    const cab = linhaCabecalho(tabela);
    if (!cab) return;
    const e = estados.get(tabela) || null;
    for (const { th, col } of colunasDoCabecalho(cab)) {
        if (!th.hasAttribute(ATRIBUTO)) continue;
        const v = e && e.col === col ? (e.asc ? "asc" : "desc") : "none";
        if (th.getAttribute(ATRIBUTO) !== v) th.setAttribute(ATRIBUTO, v);
        const aria = v === "asc" ? "ascending" : v === "desc" ? "descending" : "none";
        if (th.getAttribute("aria-sort") !== aria) th.setAttribute("aria-sort", aria);
    }
}

function ordenar(tabela: HTMLTableElement) {
    const e = estados.get(tabela) || null;
    const cab = linhaCabecalho(tabela);
    if (!cab) return;
    const total = totalColunas(cab);
    for (const tbody of Array.from(tabela.tBodies)) {
        for (const tr of Array.from(tbody.rows)) if (!ordemOriginal.has(tr)) ordemOriginal.set(tr, contadorOriginal++);
        const gs = grupos(tbody, total);
        if (!gs) { desligar(tabela); return; }
        const normais = gs.filter((g) => !g.fixo);
        if (normais.length < 2 && !e) continue;
        const chaveOrig = (g: { linhas: HTMLTableRowElement[] }) => ordemOriginal.get(g.linhas[0]) ?? 0;
        const valores = new Map(normais.map((g) => [g, lerValor(g.linhas[0].cells[indiceCelula(g.linhas[0], e?.col ?? 0)])]));
        const ordenados = normais.slice().sort((a, b) => {
            if (!e) return chaveOrig(a) - chaveOrig(b);
            const va = valores.get(a)!, vb = valores.get(b)!;
            if (va.vazio !== vb.vazio) return va.vazio ? 1 : -1; // vazio sempre no fim
            const r = va.vazio ? 0 : comparar(va, vb);
            return r !== 0 ? (e.asc ? r : -r) : chaveOrig(a) - chaveOrig(b);
        });
        // fixos: avisos ficam onde estavam no topo; "Total" vai para o fim
        const topo = gs.filter((g) => g.fixo && !ehTotal(g.linhas[0]));
        const fim = gs.filter((g) => g.fixo && ehTotal(g.linhas[0]));
        const final = [...topo, ...ordenados, ...fim].flatMap((g) => g.linhas);
        const atual = Array.from(tbody.rows);
        if (final.length === atual.length && final.every((tr, i) => tr === atual[i])) continue; // já está na ordem
        mexendo = true;
        try { for (const tr of final) tbody.appendChild(tr); } finally { mexendo = false; }
    }
}

/** Índice da célula na linha para a coluna (considerando colSpan). */
function indiceCelula(tr: HTMLTableRowElement, col: number): number {
    let c = 0;
    for (let i = 0; i < tr.cells.length; i++) {
        if (c === col) return i;
        c += tr.cells[i].colSpan || 1;
        if (c > col) return i;
    }
    return tr.cells.length - 1;
}

function desligar(tabela: HTMLTableElement) {
    const cab = linhaCabecalho(tabela);
    if (cab) for (const th of Array.from(cab.cells)) { th.removeAttribute(ATRIBUTO); th.removeAttribute("aria-sort"); if (th.getAttribute("tabindex") === "0" && th.dataset.paiOrdTab) { th.removeAttribute("tabindex"); delete th.dataset.paiOrdTab; } }
    estados.delete(tabela);
}

function decorar(tabela: HTMLTableElement) {
    if (!podeOrdenar(tabela)) { if (decoradas.has(tabela)) desligar(tabela); return; }
    const cab = linhaCabecalho(tabela);
    if (!cab) return;
    for (const { th } of colunasDoCabecalho(cab)) {
        if (th.hasAttribute(ATRIBUTO)) continue;
        if (!(th.textContent || "").trim() || th.querySelector("button, a, input, select, [role='button']")) continue;
        th.setAttribute(ATRIBUTO, "none");
        th.setAttribute("aria-sort", "none");
        if (!th.hasAttribute("tabindex")) { th.setAttribute("tabindex", "0"); th.dataset.paiOrdTab = "1"; }
        if (!th.title) th.title = "Clique para ordenar";
    }
    if (!decoradas.has(tabela)) {
        decoradas.add(tabela);
        const salvo = lerSalvo(tabela);
        if (salvo) { estados.set(tabela, salvo); ordenar(tabela); marcarCabecalho(tabela); }
    }
}

function clicar(th: HTMLTableCellElement) {
    const tabela = th.closest("table") as HTMLTableElement | null;
    const cab = tabela && linhaCabecalho(tabela);
    if (!tabela || !cab || !podeOrdenar(tabela)) return;
    const col = colunasDoCabecalho(cab).find((x) => x.th === th)?.col;
    if (col === undefined) return;
    const atual = estados.get(tabela) || null;
    const novo: Estado = !atual || atual.col !== col ? { col, asc: true } : { col, asc: !atual.asc };
    estados.set(tabela, novo);
    salvar(tabela, novo);
    ordenar(tabela);
    marcarCabecalho(tabela);
}

export default function OrdenarTabelas() {
    useEffect(() => {
        if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
        const estilo = document.createElement("style");
        estilo.setAttribute("data-pai-ord-css", "");
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        const varrer = () => document.querySelectorAll("table").forEach((t) => decorar(t as HTMLTableElement));
        varrer();

        let pendentes = new Set<HTMLTableElement>();
        let agendado = 0;
        const processar = () => {
            agendado = 0;
            varrer();
            const lista = pendentes;
            pendentes = new Set();
            lista.forEach((t) => {
                if (!t.isConnected || !estados.get(t)) return;
                ordenar(t);
                marcarCabecalho(t);
            });
            obs.takeRecords(); // o que este componente mexeu não conta como mudança da tela
        };
        const obs = new MutationObserver((registros) => {
            if (mexendo) return;
            for (const r of registros) {
                const alvo = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
                const t = alvo?.closest?.("table") as HTMLTableElement | null;
                if (t) pendentes.add(t);
            }
            if (!agendado) agendado = window.setTimeout(processar, 60);
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });

        const onClick = (ev: MouseEvent) => {
            const th = (ev.target as Element | null)?.closest?.(`th[${ATRIBUTO}]`) as HTMLTableCellElement | null;
            if (!th) return;
            if ((ev.target as Element).closest("button, a, input, select, label")) return;
            clicar(th);
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== "Enter" && ev.key !== " ") return;
            const th = (ev.target as Element | null)?.closest?.(`th[${ATRIBUTO}]`) as HTMLTableCellElement | null;
            if (!th || ev.target !== th) return;
            ev.preventDefault();
            clicar(th);
        };
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            obs.disconnect();
            if (agendado) window.clearTimeout(agendado);
            document.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
            estilo.remove();
        };
    }, []);
    return null;
}
