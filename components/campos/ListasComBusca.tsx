"use client";

/**
 * ListasComBusca (25/11/2026) — toda lista fechada do sistema (<select>) vira campo de digitar com sugestões.
 *
 * Montado UMA vez no components/app-shell.tsx (vale para todas as telas, módulos, abas e janelas). Não precisa mexer
 * nas telas: o <select> continua no lugar (com o mesmo onChange, valor e visual); ao clicar, tocar ou começar a digitar
 * nele, abre por cima um campo de busca com as opções da própria lista.
 *  - Escreve e vai filtrando (sem ligar para acento e maiúsculas; cada palavra digitada precisa aparecer na opção).
 *  - Setas ↑ ↓ andam nas opções, Enter (ou Tab depois de digitar) escolhe, Esc fecha sem mudar nada.
 *  - A escolha passa pelo mesmo caminho da lista nativa (evento change): a tela não percebe diferença.
 *  - Mostra os grupos (optgroup), as opções desativadas (sem deixar escolher) e marca a opção atual.
 *  - Listas muito grandes mostram as primeiras 300 opções: é só continuar digitando para achar as outras.
 *
 * Fica de fora (continua a lista nativa):
 *  - <select multiple> ou com size > 1 e <select disabled>;
 *  - lista (ou algo acima dela) com o atributo data-sem-busca.
 */

import { useEffect } from "react";

type Item = { indice: number; texto: string; busca: string; grupo: string; desativado: boolean };
type Aberto = {
    select: HTMLSelectElement;
    raiz: HTMLDivElement;
    input: HTMLInputElement;
    lista: HTMLUListElement;
    itens: Item[];
    visiveis: Item[];
    ativo: number; // posição em visiveis
    digitou: boolean;
    timer: number;
};

const LIMITE = 300;
const RAIZ = "data-pai-lb";
let atual: Aberto | null = null;
let sequencia = 0;
let tocouEm = 0; // hora do último toque que abriu a busca (reserva do celular)

const CSS = `
[${RAIZ}] { position: fixed; z-index: 2147483000; display: flex; flex-direction: column; gap: 6px; font-family: inherit; }
[${RAIZ}][data-acima] { flex-direction: column-reverse; }
[${RAIZ}] input { box-sizing: border-box; font-family: inherit; width: 100%; min-height: 44px; border: 2px solid #3D6A99; border-radius: 12px; background: #F1F4F8; color: #313C55; padding: 0 12px; font-size: 16px; font-weight: 600; outline: none; box-shadow: 0 0 0 4px rgba(61,106,153,.2), 0 10px 30px rgba(15,23,42,.18); }
[${RAIZ}] input::placeholder { color: #8391A7; font-weight: 500; }
[${RAIZ}] ul { list-style: none; margin: 0; padding: 4px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; border-radius: 12px; background: #FFFFFF; border: 1px solid #D8E0EA; box-shadow: 0 12px 32px rgba(15,23,42,.2); }
[${RAIZ}] li { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 10px; border-radius: 8px; font-size: 15px; line-height: 1.25; color: #1F2937; cursor: pointer; word-break: break-word; }
[${RAIZ}] li[data-ativo] { background: #E9EFF6; }
[${RAIZ}] li[aria-selected="true"] { color: #313C55; font-weight: 800; }
[${RAIZ}] li[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
[${RAIZ}] li[data-grupo] { min-height: 0; padding: 10px 10px 4px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #6B7A90; cursor: default; }
[${RAIZ}] li[data-aviso] { min-height: 0; padding: 10px; font-size: 13px; color: #6B7A90; cursor: default; }
[${RAIZ}] li span { flex: 1; min-width: 0; }
[${RAIZ}] li svg { flex: none; width: 16px; height: 16px; color: #3D6A99; }
[${RAIZ}] mark { background: transparent; color: inherit; font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
@media (pointer: coarse) { [${RAIZ}] li { min-height: 44px; } }
.dark [${RAIZ}] input { background: #1C2334; color: #F1F4F8; border-color: #3D6A99; }
.dark [${RAIZ}] input::placeholder { color: #7D8BA3; }
.dark [${RAIZ}] ul { background: #151B2B; border-color: #2A3550; }
.dark [${RAIZ}] li { color: #E5E9F0; }
.dark [${RAIZ}] li[data-ativo] { background: rgba(61,106,153,.35); }
.dark [${RAIZ}] li[aria-selected="true"] { color: #FFFFFF; }
.dark [${RAIZ}] li[data-grupo], .dark [${RAIZ}] li[data-aviso] { color: #93A1B8; }
.dark [${RAIZ}] li svg { color: #8FB0D6; }
`;

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5l10 -10"/></svg>';

/* ---------- texto ---------- */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function escapar(t: string) {
    return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Destaca o primeiro trecho de cada palavra digitada (posições iguais com e sem acento). */
function destacar(texto: string, palavras: string[]): string {
    if (!palavras.length) return escapar(texto);
    const base = semAcento(texto);
    if (base.length !== texto.length) return escapar(texto); // letra que muda de tamanho sem acento: não arrisca
    const marcas = new Array<boolean>(texto.length).fill(false);
    for (const p of palavras) {
        const i = base.indexOf(p);
        if (i >= 0) for (let k = i; k < i + p.length; k++) marcas[k] = true;
    }
    let html = "";
    let dentro = false;
    for (let i = 0; i < texto.length; i++) {
        if (marcas[i] !== dentro) { html += marcas[i] ? "<mark>" : "</mark>"; dentro = marcas[i]; }
        html += escapar(texto[i]);
    }
    return dentro ? html + "</mark>" : html;
}

/* ---------- lista ---------- */

function elegivel(alvo: EventTarget | null): HTMLSelectElement | null {
    const el = alvo as Element | null;
    const s = (el && typeof el.closest === "function" ? el.closest("select") : null) as HTMLSelectElement | null;
    if (!s || s.multiple || s.size > 1 || s.disabled || s.closest("[data-sem-busca]")) return null;
    return s;
}

function lerItens(s: HTMLSelectElement): Item[] {
    const itens: Item[] = [];
    Array.from(s.options).forEach((o, indice) => {
        if (o.hidden) return;
        const texto = (o.label || o.text || "").replace(/\s+/g, " ").trim();
        const pai = o.parentElement;
        const grupo = pai && pai.tagName === "OPTGROUP" ? ((pai as HTMLOptGroupElement).label || "").trim() : "";
        const grupoDesativado = pai && pai.tagName === "OPTGROUP" ? (pai as HTMLOptGroupElement).disabled : false;
        itens.push({ indice, texto: texto || " ", busca: semAcento(texto + " " + grupo), grupo, desativado: o.disabled || grupoDesativado });
    });
    return itens;
}

function filtrar(a: Aberto) {
    const termo = semAcento(a.input.value.trim());
    const palavras = termo ? termo.split(/\s+/) : [];
    a.visiveis = palavras.length ? a.itens.filter((it) => palavras.every((p) => it.busca.includes(p))) : a.itens;
    const sel = a.select.selectedIndex;
    if (palavras.length) {
        a.ativo = a.visiveis.findIndex((it) => !it.desativado);
    } else {
        a.ativo = a.visiveis.findIndex((it) => it.indice === sel && !it.desativado);
        if (a.ativo < 0) a.ativo = a.visiveis.findIndex((it) => !it.desativado);
    }
    desenhar(a, palavras);
}

function desenhar(a: Aberto, palavras: string[]) {
    const sel = a.select.selectedIndex;
    const mostrar = a.visiveis.slice(0, LIMITE);
    let html = "";
    let grupo = "";
    mostrar.forEach((it, pos) => {
        if (it.grupo && it.grupo !== grupo) html += `<li data-grupo role="presentation">${escapar(it.grupo)}</li>`;
        grupo = it.grupo;
        const marcado = it.indice === sel;
        html += `<li role="option" id="${a.lista.id}-${pos}" data-pos="${pos}" aria-selected="${marcado}"${it.desativado ? ' aria-disabled="true"' : ""}${pos === a.ativo ? " data-ativo" : ""}><span>${destacar(it.texto, palavras)}</span>${marcado ? CHECK : ""}</li>`;
    });
    if (!mostrar.length) html = `<li data-aviso role="presentation">Nada encontrado para “${escapar(a.input.value.trim())}”.</li>`;
    else if (a.visiveis.length > LIMITE) html += `<li data-aviso role="presentation">Mostrando ${LIMITE} de ${a.visiveis.length}. Continue digitando para achar as outras.</li>`;
    a.lista.innerHTML = html;
    marcarAtivo(a, true);
}

function marcarAtivo(a: Aberto, rolar: boolean) {
    a.lista.querySelectorAll("li[data-ativo]").forEach((li) => li.removeAttribute("data-ativo"));
    const li = a.ativo >= 0 ? (a.lista.querySelector(`li[data-pos="${a.ativo}"]`) as HTMLLIElement | null) : null;
    if (li) {
        li.setAttribute("data-ativo", "");
        a.input.setAttribute("aria-activedescendant", li.id);
        if (rolar) {
            const topo = li.offsetTop, base = topo + li.offsetHeight;
            if (topo < a.lista.scrollTop) a.lista.scrollTop = topo - 4;
            else if (base > a.lista.scrollTop + a.lista.clientHeight) a.lista.scrollTop = base - a.lista.clientHeight + 4;
        }
    } else a.input.removeAttribute("aria-activedescendant");
}

function mover(a: Aberto, passo: number) {
    const total = Math.min(a.visiveis.length, LIMITE);
    if (!total) return;
    let p = a.ativo;
    for (let n = 0; n < total; n++) {
        p = p < 0 ? (passo > 0 ? 0 : total - 1) : Math.min(total - 1, Math.max(0, p + passo));
        if (!a.visiveis[p].desativado) { a.ativo = p; break; }
        if ((passo > 0 && p === total - 1) || (passo < 0 && p === 0)) break;
    }
    marcarAtivo(a, true);
}

/* ---------- posição ---------- */

function posicionar(a: Aberto) {
    if (!a.select.isConnected || a.select.disabled) { fechar(false); return; }
    const r = a.select.getBoundingClientRect();
    const vv = window.visualViewport;
    const altTela = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const largTela = document.documentElement.clientWidth || window.innerWidth;
    if (r.width === 0 && r.height === 0) { fechar(false); return; } // a lista sumiu (aba ou janela fechada)
    if (r.bottom < 0 || r.top > altTela) { fechar(false); return; } // rolou para fora da tela
    const largura = Math.min(Math.max(r.width, 260), largTela - 16);
    const esquerda = Math.min(Math.max(8, r.left), largTela - largura - 8);
    const altCampo = Math.max(r.height, 44);
    const abaixo = altTela - r.top - altCampo - 14;
    const acima = r.top - 14;
    const st = a.raiz.style;
    st.left = esquerda + "px";
    st.width = largura + "px";
    a.input.style.height = altCampo + "px";
    if (abaixo >= 180 || abaixo >= acima) {
        a.raiz.removeAttribute("data-acima");
        st.top = Math.max(4, r.top) + "px";
        st.bottom = "";
        a.lista.style.maxHeight = Math.max(120, Math.min(340, abaixo)) + "px";
    } else {
        a.raiz.setAttribute("data-acima", "");
        st.top = "";
        st.bottom = Math.max(4, window.innerHeight - (r.top + altCampo)) + "px";
        a.lista.style.maxHeight = Math.max(120, Math.min(340, acima)) + "px";
    }
}

/* ---------- abrir, escolher, fechar ---------- */

function abrir(s: HTMLSelectElement, inicial = "") {
    if (atual && atual.select === s) return;
    fechar(false);
    const itens = lerItens(s);
    const raiz = document.createElement("div");
    raiz.setAttribute(RAIZ, "");
    const id = "pai-lb-" + ++sequencia;
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", id);
    const rotulo = s.getAttribute("aria-label") || (s.labels && s.labels[0] ? (s.labels[0].textContent || "").trim() : "") || s.title || "";
    if (rotulo) input.setAttribute("aria-label", rotulo);
    const textoAtual = s.selectedIndex >= 0 ? (s.options[s.selectedIndex]?.text || "").trim() : "";
    input.placeholder = textoAtual ? `${textoAtual} · digite para buscar` : "Digite para buscar…";
    input.value = inicial;
    const lista = document.createElement("ul");
    lista.id = id;
    lista.setAttribute("role", "listbox");
    raiz.appendChild(input);
    raiz.appendChild(lista);
    document.body.appendChild(raiz);
    const a: Aberto = { select: s, raiz, input, lista, itens, visiveis: itens, ativo: -1, digitou: !!inicial, timer: 0 };
    atual = a;
    input.addEventListener("input", () => { a.digitou = true; filtrar(a); });
    input.addEventListener("blur", () => {
        window.setTimeout(() => { if (atual === a && !a.raiz.contains(document.activeElement)) fechar(false); }, 0);
    });
    filtrar(a);
    posicionar(a);
    a.timer = window.setInterval(() => { if (atual === a) posicionar(a); }, 250);
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* campo sem seleção */ }
}

function fechar(voltarFoco: boolean) {
    const a = atual;
    if (!a) return;
    atual = null;
    tocouEm = 0;
    window.clearInterval(a.timer);
    a.raiz.remove();
    if (voltarFoco && a.select.isConnected) {
        try { a.select.focus({ preventScroll: true }); } catch { /* sem foco */ }
    }
}

function escolher(a: Aberto, pos: number) {
    const it = a.visiveis[pos];
    if (!it || it.desativado) return;
    const s = a.select;
    fechar(true);
    if (s.selectedIndex === it.indice) return;
    s.selectedIndex = it.indice;
    // mesmo caminho da lista nativa: o onChange do React (e de formulários comuns) recebe a escolha
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ---------- componente ---------- */

export default function ListasComBusca() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const estilo = document.createElement("style");
        estilo.setAttribute("data-pai-lb-css", "");
        estilo.textContent = CSS;
        document.head.appendChild(estilo);

        const dentro = (ev: Event) => !!atual && atual.raiz.contains(ev.target as Node);

        // Mouse: impede a lista nativa e abre a de busca. Clique de novo na mesma lista fecha.
        const onMouseDown = (ev: MouseEvent) => {
            if (dentro(ev)) {
                ev.stopPropagation(); // janelas que fecham ao clicar fora não fecham por causa da busca
                if ((ev.target as Element).closest("li")) ev.preventDefault(); // não tira o foco do campo
                return;
            }
            if (ev.button !== 0) return;
            const s = elegivel(ev.target);
            if (atual && (!s || s !== atual.select)) fechar(false);
            if (!s) return;
            ev.preventDefault();
            if (atual && atual.select === s) { fechar(true); return; }
            abrir(s);
        };
        const onPointer = (ev: Event) => { if (dentro(ev)) ev.stopPropagation(); };

        // Toque: deixa rolar a tela; toque parado em cima da lista abre a busca (sem a lista nativa do celular).
        let toque: { s: HTMLSelectElement; x: number; y: number; moveu: boolean } | null = null;
        const onTouchStart = (ev: TouchEvent) => {
            if (dentro(ev)) { ev.stopPropagation(); return; }
            const s = elegivel(ev.target);
            const t = ev.touches[0];
            toque = s && t ? { s, x: t.clientX, y: t.clientY, moveu: false } : null;
        };
        const onTouchMove = (ev: TouchEvent) => {
            if (!toque) return;
            const t = ev.touches[0];
            if (t && (Math.abs(t.clientX - toque.x) > 10 || Math.abs(t.clientY - toque.y) > 10)) toque.moveu = true;
        };
        const onTouchEnd = (ev: TouchEvent) => {
            if (dentro(ev)) { ev.stopPropagation(); return; }
            const t = toque;
            toque = null;
            if (!t || t.moveu || elegivel(ev.target) !== t.s) return;
            ev.preventDefault(); // sem o clique simulado: o celular não abre a lista nativa
            if (atual && atual.select === t.s) { fechar(false); return; }
            abrir(t.s);
            tocouEm = Date.now();
        };
        // Reserva: se o celular ainda assim focar a lista logo depois do toque, troca pela busca.
        const onFocusIn = (ev: FocusEvent) => {
            const s = elegivel(ev.target);
            if (!s || !tocouEm || Date.now() - tocouEm > 800) return;
            s.blur();
            if (atual && atual.select === s) { atual.input.focus({ preventScroll: true }); return; }
            abrir(s);
        };

        const onClick = (ev: MouseEvent) => {
            if (!dentro(ev)) return;
            ev.stopPropagation();
            const a = atual!;
            const li = (ev.target as Element).closest("li[data-pos]") as HTMLLIElement | null;
            if (li) escolher(a, Number(li.dataset.pos));
        };

        const onKeyDown = (ev: KeyboardEvent) => {
            const a = atual;
            if (a && ev.target === a.input) {
                ev.stopPropagation(); // atalhos da tela e o Esc das janelas não pegam a digitação da busca
                if (ev.isComposing) return;
                switch (ev.key) {
                    case "ArrowDown": ev.preventDefault(); mover(a, 1); break;
                    case "ArrowUp": ev.preventDefault(); mover(a, -1); break;
                    case "PageDown": ev.preventDefault(); mover(a, 8); break;
                    case "PageUp": ev.preventDefault(); mover(a, -8); break;
                    case "Enter": ev.preventDefault(); if (a.ativo >= 0) escolher(a, a.ativo); break;
                    case "Escape": ev.preventDefault(); fechar(true); break;
                    case "Tab":
                        if (a.digitou && a.ativo >= 0 && a.input.value.trim()) escolher(a, a.ativo);
                        else fechar(true);
                        break; // o Tab segue do campo da lista para o próximo
                }
                return;
            }
            if (ev.ctrlKey || ev.metaKey || ev.isComposing) return;
            const s = elegivel(ev.target);
            if (!s || ev.target !== s) return;
            const abreLista = ev.key === " " || ev.key === "F4" || (ev.altKey && (ev.key === "ArrowDown" || ev.key === "ArrowUp"));
            if (abreLista) { ev.preventDefault(); abrir(s); return; }
            if (!ev.altKey && ev.key.length === 1) { ev.preventDefault(); abrir(s, ev.key); } // começou a digitar: busca com a letra
        };

        const onScroll = (ev: Event) => {
            const a = atual;
            if (!a || a.lista.contains(ev.target as Node) || ev.target === a.lista) return;
            posicionar(a);
        };
        const onResize = () => { if (atual) posicionar(atual); };

        const cap = { capture: true };
        const capAtivo = { capture: true, passive: false } as AddEventListenerOptions;
        const capPassivo = { capture: true, passive: true } as AddEventListenerOptions;
        window.addEventListener("mousedown", onMouseDown, cap);
        window.addEventListener("pointerdown", onPointer, cap);
        window.addEventListener("pointerup", onPointer, cap);
        window.addEventListener("mouseup", onPointer, cap);
        window.addEventListener("touchstart", onTouchStart, capPassivo);
        window.addEventListener("touchmove", onTouchMove, capPassivo);
        window.addEventListener("touchend", onTouchEnd, capAtivo);
        window.addEventListener("focusin", onFocusIn, cap);
        window.addEventListener("click", onClick, cap);
        window.addEventListener("keydown", onKeyDown, cap);
        window.addEventListener("scroll", onScroll, capPassivo);
        window.addEventListener("resize", onResize);
        window.visualViewport?.addEventListener("resize", onResize);
        return () => {
            fechar(false);
            window.removeEventListener("mousedown", onMouseDown, cap);
            window.removeEventListener("pointerdown", onPointer, cap);
            window.removeEventListener("pointerup", onPointer, cap);
            window.removeEventListener("mouseup", onPointer, cap);
            window.removeEventListener("touchstart", onTouchStart, capPassivo);
            window.removeEventListener("touchmove", onTouchMove, capPassivo);
            window.removeEventListener("touchend", onTouchEnd, capAtivo);
            window.removeEventListener("focusin", onFocusIn, cap);
            window.removeEventListener("click", onClick, cap);
            window.removeEventListener("keydown", onKeyDown, cap);
            window.removeEventListener("scroll", onScroll, capPassivo);
            window.removeEventListener("resize", onResize);
            window.visualViewport?.removeEventListener("resize", onResize);
            estilo.remove();
        };
    }, []);
    return null;
}
