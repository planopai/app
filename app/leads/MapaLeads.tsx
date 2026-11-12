"use client";

/**
 * 12/11/2026: aba "Mapa" da página /leads.
 * Mapa (Leaflet + OpenStreetMap, o mesmo da telemetria) com as cidades de onde as pessoas acompanharam
 * o velório online; mesmos leads e filtros da lista.
 * - coordenadas das cidades do Brasil (IBGE) servidas pelo próprio app em /noprecache/leads-mapa/;
 * - cada cidade é uma bolinha com a quantidade; o ponto fica no CENTRO da cidade (o lead só tem a cidade digitada);
 * - cidade encontrada pelo estado (sigla) + nome; nomes com erro de digitação ficam em "sem localização".
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { IconBrandWhatsapp, IconChevronLeft, IconMapPinOff } from "@tabler/icons-react";

export type LeadMapa = {
    id: number;
    nome: string;
    pais: string;
    uf: string;
    cidade: string;
    telefone: string;
    registro: Date | null;
};

type Ponto = {
    chave: string;
    pais: string;
    uf: string;
    cidade: string;
    lat: number;
    lng: number;
    km: number;
    pessoas: LeadMapa[];
};

type Municipios = Record<string, Record<string, [string, number, number]>>;

const BASE = "/noprecache/leads-mapa";
const MEMORIAL = { lat: -12.1439, lng: -44.9968 }; // Barreiras-BA

// Fora do Brasil: cidades já vistas nos leads e centro aproximado dos países (quando a cidade não está aqui).
const CIDADES_EXTERIOR: Record<string, [string, number, number]> = {
    lisboa: ["Lisboa", 38.72, -9.14], leiria: ["Leiria", 39.74, -8.81], faro: ["Faro", 37.02, -7.93], covilha: ["Covilhã", 40.28, -7.5],
    porto: ["Porto", 41.15, -8.61], vigo: ["Vigo", 42.24, -8.72], cordoba: ["Córdoba", 37.89, -4.78], zaragoza: ["Zaragoza", 41.65, -0.89],
    madrid: ["Madrid", 40.42, -3.7], barcelona: ["Barcelona", 41.39, 2.17], amsterdam: ["Amsterdã", 52.37, 4.9], amsterda: ["Amsterdã", 52.37, 4.9],
    londres: ["Londres", 51.51, -0.13], london: ["Londres", 51.51, -0.13], zurique: ["Zurique", 47.37, 8.54], zurich: ["Zurique", 47.37, 8.54],
    napoli: ["Nápoles", 40.85, 14.27], napoles: ["Nápoles", 40.85, 14.27], roma: ["Roma", 41.9, 12.5], paris: ["Paris", 48.86, 2.35],
    ina: ["Ina", 35.83, 137.95], toquio: ["Tóquio", 35.68, 139.69], tokyo: ["Tóquio", 35.68, 139.69], sydney: ["Sydney", -33.87, 151.21],
    orlando: ["Orlando", 28.54, -81.38], cambridge: ["Cambridge", 42.37, -71.11], nahant: ["Nahant", 42.43, -70.92], boston: ["Boston", 42.36, -71.06],
    philadelphia: ["Filadélfia", 39.95, -75.17], filadelfia: ["Filadélfia", 39.95, -75.17], "nova york": ["Nova York", 40.71, -74.01], miami: ["Miami", 25.76, -80.19],
    huntsville: ["Huntsville", 45.33, -79.22], quebec: ["Quebec", 46.81, -71.21], qubec: ["Quebec", 46.81, -71.21], "ville de quebec": ["Quebec", 46.81, -71.21],
    "vila de quebec": ["Quebec", 46.81, -71.21], toronto: ["Toronto", 43.65, -79.38], cochabamba: ["Cochabamba", -17.39, -66.16],
    assuncao: ["Assunção", -25.26, -57.58], assuncion: ["Assunção", -25.26, -57.58], "buenos aires": ["Buenos Aires", -34.6, -58.38],
};
const PAISES: Record<string, [string, number, number]> = {
    portugal: ["Portugal", 39.6, -8.0], espanha: ["Espanha", 40.2, -3.6], espana: ["Espanha", 40.2, -3.6], "estados unidos": ["Estados Unidos", 39.8, -98.6],
    usa: ["Estados Unidos", 39.8, -98.6], eua: ["Estados Unidos", 39.8, -98.6], canada: ["Canadá", 56.1, -106.3], "paises baixos": ["Países Baixos", 52.1, 5.3],
    holanda: ["Países Baixos", 52.1, 5.3], japao: ["Japão", 36.2, 138.3], suica: ["Suíça", 46.8, 8.2], "reino unido": ["Reino Unido", 54.0, -2.0],
    inglaterra: ["Reino Unido", 52.4, -1.5], italia: ["Itália", 42.8, 12.8], australia: ["Austrália", -25.3, 133.8], bolivia: ["Bolívia", -16.3, -63.6],
    paraguai: ["Paraguai", -23.4, -58.4], argentina: ["Argentina", -38.4, -63.6], franca: ["França", 46.6, 2.2], alemanha: ["Alemanha", 51.2, 10.4],
    irlanda: ["Irlanda", 53.4, -8.2], chile: ["Chile", -35.7, -71.5], uruguai: ["Uruguai", -32.5, -55.8], angola: ["Angola", -11.2, 17.9],
};

const chave = (s: string) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

function ehBrasil(pais: string, uf: string) {
    const p = chave(pais);
    if (!p) return /^[A-Z]{2}$/.test(uf);
    return p.startsWith("bra") || p.startsWith("bre") || p.startsWith("bea") || p === "br" || p === "basil" || p.startsWith("bar") || p.startsWith("brs");
}

function distanciaKm(a: { lat: number; lng: number }) {
    const r = (x: number) => (x * Math.PI) / 180;
    const h =
        Math.sin(r(a.lat - MEMORIAL.lat) / 2) ** 2 +
        Math.cos(r(MEMORIAL.lat)) * Math.cos(r(a.lat)) * Math.sin(r(a.lng - MEMORIAL.lng) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function localizar(l: LeadMapa, mun: Municipios, unicas: Map<string, [string, string, number, number]>) {
    const uf = /^[A-Z]{2}$/.test(l.uf) ? l.uf : "";
    if (ehBrasil(l.pais, uf)) {
        const c = chave(l.cidade);
        if (!c) return null;
        const semUf = c.replace(/\s(ba|bahia|df|sp|go|mg|pe|to|pi|es|rs|ce|pr|rj|sc|mt|ms|pa|ma|pb|rn|al|se|am|ro|ac|ap|rr)$/, "").trim();
        if (uf === "DF") return { pais: "Brasil", uf: "DF", cidade: "Brasília", lat: -15.78, lng: -47.93 };
        const lista = uf ? mun[uf] : undefined;
        const achado = (lista && (lista[c] || lista[semUf])) || null;
        if (achado) return { pais: "Brasil", uf, cidade: achado[0], lat: achado[1], lng: achado[2] };
        const u = unicas.get(c) || unicas.get(semUf);
        if (u) return { pais: "Brasil", uf: u[0], cidade: u[1], lat: u[2], lng: u[3] };
        return null;
    }
    const p = PAISES[chave(l.pais)];
    const cid = CIDADES_EXTERIOR[chave(l.cidade)];
    if (cid) return { pais: p ? p[0] : "Exterior", uf: "", cidade: cid[0], lat: cid[1], lng: cid[2] };
    if (p) return { pais: p[0], uf: "", cidade: l.cidade || p[0], lat: p[1], lng: p[2] };
    return null;
}

function foneWhats(bruto: string): { texto: string; whats: string | null } {
    let d = String(bruto || "").replace(/\D/g, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.length === 11) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`, whats: `55${d}` };
    if (d.length === 10) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`, whats: `55${d}` };
    return { texto: String(bruto || "").trim() || "—", whats: null };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const dataBr = (d: Date | null) => (d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : "");
const fmt = (n: number) => n.toLocaleString("pt-BR");
const iniciais = (nome: string) =>
    nome
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("") || "?";

let promessaMun: Promise<Municipios> | null = null;
function carregarMunicipios() {
    if (!promessaMun) {
        promessaMun = fetch(`${BASE}/municipios-br.json?v=1`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não foi possível carregar as cidades."))))
            .catch((e) => {
                promessaMun = null;
                throw e;
            });
    }
    return promessaMun;
}

/** Tamanho da bolinha pela quantidade de pessoas (raiz: 835 não fica gigante perto de 1). */
const raio = (n: number) => Math.round(11 + Math.min(22, Math.sqrt(n) * 1.5));

function iconeCidade(p: Ponto, ativo: boolean) {
    const n = p.pessoas.length;
    const d = raio(n) * 2;
    const html =
        `<div class="ml-pin${ativo ? " ml-pin--on" : ""}" style="width:${d}px;height:${d}px">` +
        `<span>${n > 999 ? Math.round(n / 100) / 10 + "k" : n}</span></div>`;
    return L.divIcon({ html, className: "ml-pin-box", iconSize: [d, d], iconAnchor: [d / 2, d / 2] });
}

const ICONE_MEMORIAL = L.divIcon({
    html: '<div class="ml-mem"><i></i><b>Memorial · Barreiras</b></div>',
    className: "ml-pin-box",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

export default function MapaLeads({ leads }: { leads: LeadMapa[] }) {
    const mapaEl = useRef<HTMLDivElement>(null);
    const mapaRef = useRef<L.Map | null>(null);
    const camadaRef = useRef<L.LayerGroup | null>(null);
    const linhasRef = useRef<L.LayerGroup | null>(null);
    const marcadores = useRef<Map<string, L.Marker>>(new Map());
    const [mun, setMun] = useState<Municipios | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [sel, setSel] = useState<Ponto | null>(null);
    const [linhas, setLinhas] = useState(false);
    const [vista, setVista] = useState<"tudo" | "brasil" | "regiao">("tudo");

    useEffect(() => {
        let vivo = true;
        carregarMunicipios()
            .then((m) => vivo && setMun(m))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível carregar o mapa."));
        return () => {
            vivo = false;
        };
    }, []);

    /* ---- agrupa os leads por cidade ---- */
    const { pontos, semLocal, cidades, paisesN, longe } = useMemo(() => {
        if (!mun) return { pontos: [] as Ponto[], semLocal: 0, cidades: 0, paisesN: 0, longe: null as Ponto | null };
        const unicas = new Map<string, [string, string, number, number]>();
        const vistos = new Map<string, number>();
        for (const [uf, lista] of Object.entries(mun))
            for (const [k, v] of Object.entries(lista)) {
                vistos.set(k, (vistos.get(k) || 0) + 1);
                unicas.set(k, [uf, v[0], v[1], v[2]]);
            }
        for (const [k, n] of vistos) if (n > 1) unicas.delete(k);

        const mapa = new Map<string, Ponto>();
        let sem = 0;
        for (const l of leads) {
            const loc = localizar(l, mun, unicas);
            if (!loc) {
                sem++;
                continue;
            }
            const k = `${loc.pais}|${loc.uf}|${loc.cidade}`;
            let p = mapa.get(k);
            if (!p) {
                p = { chave: k, ...loc, km: distanciaKm(loc), pessoas: [] };
                mapa.set(k, p);
            }
            p.pessoas.push(l);
        }
        const arr = Array.from(mapa.values()).sort((a, b) => b.pessoas.length - a.pessoas.length);
        arr.forEach((p) => p.pessoas.sort((a, b) => (b.registro?.getTime() ?? 0) - (a.registro?.getTime() ?? 0)));
        const lg = arr.reduce<Ponto | null>((m, p) => (!m || p.km > m.km ? p : m), null);
        return { pontos: arr, semLocal: sem, cidades: arr.length, paisesN: new Set(arr.map((p) => p.pais)).size, longe: lg };
    }, [mun, leads]);

    const totalNoMapa = useMemo(() => pontos.reduce((s, p) => s + p.pessoas.length, 0), [pontos]);
    const exterior = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of pontos) if (p.pais !== "Brasil") m.set(p.pais, (m.get(p.pais) || 0) + p.pessoas.length);
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [pontos]);

    /* ---- cria o mapa (mesmo mapa da telemetria: OpenStreetMap) ---- */
    useEffect(() => {
        if (!mun || !mapaEl.current || mapaRef.current) return;
        const map = L.map(mapaEl.current, { zoomControl: true, worldCopyJump: true, minZoom: 2, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        }).addTo(map);
        map.setView([-13.5, -46.5], 5);
        linhasRef.current = L.layerGroup().addTo(map);
        camadaRef.current = L.layerGroup().addTo(map);
        L.marker([MEMORIAL.lat, MEMORIAL.lng], { icon: ICONE_MEMORIAL, zIndexOffset: -1000, keyboard: false, interactive: false }).addTo(map);
        mapaRef.current = map;
        const lista = marcadores.current;
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(mapaEl.current);
        return () => {
            ro.disconnect();
            map.remove();
            mapaRef.current = null;
            camadaRef.current = null;
            linhasRef.current = null;
            lista.clear();
        };
    }, [mun]);

    /* ---- cidades e linhas (mudam com os filtros) ---- */
    useEffect(() => {
        const map = mapaRef.current;
        const cam = camadaRef.current;
        const lin = linhasRef.current;
        if (!map || !cam || !lin) return;
        cam.clearLayers();
        lin.clearLayers();
        marcadores.current.clear();
        // Menores por cima, para as cidades pequenas perto de Barreiras continuarem clicáveis.
        [...pontos].reverse().forEach((p, i) => {
            const m = L.marker([p.lat, p.lng], { icon: iconeCidade(p, false), zIndexOffset: i, riseOnHover: true, title: p.cidade });
            m.bindTooltip(
                `<b>${escapar(p.cidade)}${p.uf ? " · " + p.uf : ""}</b><br>${fmt(p.pessoas.length)} ${p.pessoas.length === 1 ? "pessoa" : "pessoas"}${p.km < 30 ? "" : ` · ${fmt(Math.round(p.km))} km`}`,
                { direction: "top", offset: [0, -raio(p.pessoas.length)], className: "ml-tip" },
            );
            m.on("click", () => setSel(p));
            m.addTo(cam);
            marcadores.current.set(p.chave, m);
            if (p.km > 30)
                L.polyline(
                    [
                        [p.lat, p.lng],
                        [MEMORIAL.lat, MEMORIAL.lng],
                    ],
                    { color: "#F2B705", weight: p.pessoas.length >= 20 ? 2.4 : 1.2, opacity: 0.55, dashArray: "4 6", interactive: false },
                ).addTo(lin);
        });
        setSel((s) => (s && pontos.some((p) => p.chave === s.chave) ? pontos.find((p) => p.chave === s.chave)! : null));
    }, [pontos]);

    useEffect(() => {
        const map = mapaRef.current;
        const lin = linhasRef.current;
        if (!map || !lin) return;
        if (linhas) lin.addTo(map);
        else lin.remove();
    }, [linhas, pontos]);

    /* ---- cidade escolhida ---- */
    useEffect(() => {
        const map = mapaRef.current;
        if (!map) return;
        marcadores.current.forEach((m, k) => {
            const p = pontos.find((x) => x.chave === k);
            if (p) m.setIcon(iconeCidade(p, !!sel && sel.chave === k));
        });
        if (sel) map.flyTo([sel.lat, sel.lng], Math.max(map.getZoom(), sel.pais === "Brasil" ? 9 : 7), { duration: 0.9 });
    }, [sel, pontos]);

    const irPara = (v: "tudo" | "brasil" | "regiao") => {
        const map = mapaRef.current;
        setVista(v);
        setSel(null);
        if (!map) return;
        if (v === "brasil") map.flyToBounds([[-33.8, -73.9], [5.3, -34.8]], { duration: 0.9 });
        else if (v === "regiao") map.flyTo([MEMORIAL.lat, MEMORIAL.lng], 7, { duration: 0.9 });
        else if (pontos.length) map.flyToBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])).pad(0.15), { duration: 0.9 });
    };

    const top = pontos.slice(0, 7);
    const maxTop = top[0]?.pessoas.length || 1;

    return (
        <div className="relative grid overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F] lg:h-[680px] lg:grid-cols-[minmax(0,1fr)_360px]">
            <style>{CSS_MAPA}</style>
            {/* Mapa */}
            <div className="relative h-[420px] min-w-0 sm:h-[480px] lg:h-full">
                <div ref={mapaEl} className="absolute inset-0 z-0" aria-label="Mapa com as cidades dos leads" />

                <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
                    {mun ? (
                        <span className="rounded-full bg-[#232B3F]/90 px-3 py-1.5 text-[12px] font-extrabold text-white shadow">
                            {fmt(totalNoMapa)} {totalNoMapa === 1 ? "pessoa" : "pessoas"} · {fmt(cidades)} {cidades === 1 ? "cidade" : "cidades"} · {paisesN}{" "}
                            {paisesN === 1 ? "país" : "países"}
                        </span>
                    ) : null}
                </div>

                <div className="absolute bottom-6 left-3 right-3 z-[500] flex gap-1.5 sm:gap-2">
                    {(
                        [
                            ["tudo", "Todos"],
                            ["brasil", "Brasil"],
                            ["regiao", "Região"],
                        ] as const
                    ).map(([v, r]) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => irPara(v)}
                            aria-pressed={vista === v}
                            className={`min-h-10 rounded-xl px-3 text-[13px] font-extrabold shadow ${
                                vista === v ? "bg-[#F2CB3F] text-[#313C55]" : "bg-white text-[#313C55] hover:bg-[#F1F4F8]"
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setLinhas((x) => !x)}
                        aria-pressed={linhas}
                        className={`min-h-10 rounded-xl px-3 text-[13px] font-extrabold shadow ${linhas ? "bg-[#313C55] text-white" : "bg-white text-[#313C55]"}`}
                    >
                        Linhas
                    </button>
                </div>

                {!mun && !erro ? (
                    <div className="absolute inset-0 z-[600] grid place-items-center bg-[#F6F8FB] text-[14px] font-bold text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="size-10 animate-spin rounded-full border-4 border-[#C9D1DE] border-t-[#F2CB3F]" />
                            Carregando o mapa…
                        </div>
                    </div>
                ) : null}
                {erro ? (
                    <div className="absolute inset-0 z-[600] grid place-items-center bg-[#F6F8FB] p-6 text-center text-[14px] font-bold text-[#B42318] dark:bg-[#1C2334] dark:text-[#FF9C92]">
                        {erro} Verifique a internet e abra a aba de novo.
                    </div>
                ) : null}
            </div>

            {/* Painel */}
            <aside className="relative border-t border-[#E3E8F0] p-4 dark:border-white/[0.08] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-5">
                {sel ? (
                    <div>
                        <button type="button" onClick={() => setSel(null)} className="mb-3 inline-flex min-h-10 items-center gap-1 text-[13px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">
                            <IconChevronLeft size={16} />
                            Voltar ao resumo
                        </button>
                        <div className="rounded-2xl border border-[#F2CB3F] bg-[#FFF8DD] p-4 dark:bg-[#F2CB3F]/10">
                            <p className="text-[11px] font-black tracking-[0.14em] text-[#8A6D00] dark:text-[#F2CB3F]">
                                {sel.pais.toUpperCase()}
                                {sel.uf ? ` · ${sel.uf}` : ""}
                            </p>
                            <h2 className="mt-1 text-[24px] font-black leading-tight">{sel.cidade}</h2>
                            <p className="mt-1 text-[13px] font-bold text-[#5B6478] dark:text-[#CFD8EA]">
                                {fmt(sel.pessoas.length)} {sel.pessoas.length === 1 ? "pessoa acompanhou" : "pessoas acompanharam"} daqui · {sel.km < 30 ? "cidade do Memorial" : `${fmt(Math.round(sel.km))} km do Memorial`}
                            </p>
                        </div>
                        <h3 className="mb-1 mt-5 text-[12px] font-black tracking-[0.14em] text-[#5B6478] dark:text-[#AEB9CF]">QUEM ACOMPANHOU</h3>
                        <ul>
                            {sel.pessoas.slice(0, 80).map((p) => {
                                const f = foneWhats(p.telefone);
                                return (
                                    <li key={p.id} className="flex items-center gap-3 border-b border-[#E3E8F0] py-2.5 dark:border-white/[0.06]">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#E8EEF7] text-[12px] font-black text-[#3D6A99] dark:bg-[#2B3A5C] dark:text-[#CFE0FF]">
                                            {iniciais(p.nome)}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <b className="block truncate text-[14px] font-extrabold">{p.nome || "Sem nome"}</b>
                                            <span className="block truncate text-[12px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
                                                {[dataBr(p.registro), f.texto].filter(Boolean).join(" · ")}
                                            </span>
                                        </div>
                                        {f.whats ? (
                                            <a
                                                href={`https://wa.me/${f.whats}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={`WhatsApp de ${p.nome}`}
                                                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#B3CE52] bg-[#EEF5D6] text-[#3F5A0A] hover:bg-[#E3EEC2] dark:border-[#B3CE52]/50 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"
                                            >
                                                <IconBrandWhatsapp size={18} />
                                            </a>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                        {sel.pessoas.length > 80 ? (
                            <p className="mt-3 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
                                e mais {fmt(sel.pessoas.length - 80)}. Use a busca da lista com o nome da cidade para ver todos.
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <Kpi rotulo="PESSOAS" valor={fmt(totalNoMapa)} sub="no mapa" />
                            <Kpi rotulo="CIDADES" valor={fmt(cidades)} sub={`em ${paisesN} ${paisesN === 1 ? "país" : "países"}`} />
                            {longe ? (
                                <div className="col-span-2">
                                    <Kpi rotulo="MAIS LONGE" valor={longe.cidade} sub={`${longe.pais} · ${fmt(Math.round(longe.km))} km do Memorial`} />
                                </div>
                            ) : null}
                        </div>

                        {top.length ? (
                            <>
                                <h3 className="mb-2.5 mt-5 text-[12px] font-black tracking-[0.14em] text-[#5B6478] dark:text-[#AEB9CF]">CIDADES QUE MAIS ACOMPANHARAM</h3>
                                <ul className="grid gap-1">
                                    {top.map((p, i) => (
                                        <li key={p.chave}>
                                            <button type="button" onClick={() => setSel(p)} className="grid w-full grid-cols-[20px_1fr_auto] items-center gap-x-2 rounded-lg px-1 py-1.5 text-left hover:bg-[#F1F4F8] dark:hover:bg-white/[0.04]">
                                                <i className="text-[12px] not-italic text-[#7A8396]">{i + 1}</i>
                                                <span className="truncate text-[14px] font-extrabold">
                                                    {p.cidade}
                                                    {p.uf ? ` · ${p.uf}` : ""}
                                                </span>
                                                <span className="text-[14px] font-extrabold">{fmt(p.pessoas.length)}</span>
                                                <span className="col-start-2 col-end-4 mt-1 h-[5px] rounded-full bg-[#E3E8F0] dark:bg-white/[0.07]">
                                                    <span className="block h-full rounded-full bg-[#F2CB3F]" style={{ width: `${(p.pessoas.length / maxTop) * 100}%` }} />
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}

                        {exterior.length ? (
                            <>
                                <h3 className="mb-2 mt-5 text-[12px] font-black tracking-[0.14em] text-[#5B6478] dark:text-[#AEB9CF]">FORA DO BRASIL</h3>
                                <ul className="grid gap-1.5">
                                    {exterior.map(([pais, n]) => (
                                        <li key={pais} className="flex items-center justify-between text-[14px] font-extrabold">
                                            <span>✈ {pais}</span>
                                            <span>{fmt(n)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}

                        {semLocal > 0 ? (
                            <p className="mt-5 flex items-start gap-2 rounded-xl border border-[#E3E8F0] bg-[#F6F8FB] p-3 text-[12px] font-semibold text-[#5B6478] dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-[#AEB9CF]">
                                <IconMapPinOff size={16} className="mt-0.5 shrink-0" />
                                {fmt(semLocal)} {semLocal === 1 ? "lead está" : "leads estão"} sem cidade reconhecida (nome digitado errado ou teste) e não {semLocal === 1 ? "aparece" : "aparecem"} no mapa.
                            </p>
                        ) : null}
                        {mun && pontos.length === 0 ? (
                            <p className="mt-5 text-[14px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Nenhum lead com cidade reconhecida nos filtros atuais.</p>
                        ) : null}
                        <p className="mt-5 text-[12px] font-semibold text-[#7A8396]">
                            Cada bolinha é uma cidade; o número é quantas pessoas acompanharam de lá. Toque para ver os nomes. O ponto fica no centro da cidade.
                        </p>
                    </div>
                )}
            </aside>
        </div>
    );
}

function escapar(s: string) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const CSS_MAPA = `
.ml-pin-box{background:none;border:0}
.ml-pin{display:grid;place-items:center;border-radius:50%;background:rgba(242,203,63,.85);border:2px solid #fff;box-shadow:0 2px 8px rgba(35,43,63,.45);color:#232B3F;font:900 12px Nunito,system-ui,sans-serif;cursor:pointer;transition:transform .15s}
.ml-pin:hover{transform:scale(1.08)}
.ml-pin--on{background:#313C55;color:#F2CB3F;border-color:#F2CB3F;box-shadow:0 0 0 6px rgba(242,203,63,.35),0 2px 8px rgba(35,43,63,.45)}
.ml-mem{position:relative;width:18px;height:18px}
.ml-mem i{position:absolute;inset:0;border-radius:50%;background:#2EA866;border:3px solid #fff;box-shadow:0 0 0 6px rgba(46,168,102,.3)}
.ml-mem b{position:absolute;left:50%;top:calc(100% + 30px);transform:translateX(-50%);white-space:nowrap;background:#2EA866;color:#fff;font:800 11px Nunito,system-ui,sans-serif;padding:3px 8px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.ml-tip{font:700 12px Nunito,system-ui,sans-serif;border-radius:10px;padding:6px 9px}
.leaflet-container{font-family:Nunito,system-ui,sans-serif}
`;

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
    return (
        <div className="rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <small className="block text-[11px] font-black tracking-[0.12em] text-[#3D6A99] dark:text-[#7FA7E8]">{rotulo}</small>
            <b className="mt-0.5 block truncate text-[24px] font-black leading-tight">{valor}</b>
            {sub ? <span className="block truncate text-[12px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">{sub}</span> : null}
        </div>
    );
}
