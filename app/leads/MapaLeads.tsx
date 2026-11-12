"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- a biblioteca do globo (globe.gl, carregada por <script>) não tem tipos aqui */

/**
 * 12/11/2026: aba "Mapa" da página /leads.
 * Globo 3D com as cidades de onde as pessoas acompanharam o velório online (mesmos leads e filtros da lista).
 * - globe.gl (MIT) servido pelo próprio app em /noprecache/leads-mapa/ (fora do cache do PWA; só baixa ao abrir o mapa);
 * - coordenadas das cidades do Brasil (IBGE) no mesmo lugar; nada é enviado a serviços de mapa de terceiros;
 * - cidade é encontrada pelo estado (sigla) + nome; nomes com erro de digitação ficam em "sem localização".
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
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
    memorial?: boolean;
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

/* Carrega o globe.gl uma única vez (UMD expõe window.Globe). */
let promessaGlobe: Promise<any> | null = null;
function carregarGlobe(): Promise<any> {
    const w = window as any;
    if (w.Globe) return Promise.resolve(w.Globe);
    if (promessaGlobe) return promessaGlobe;
    promessaGlobe = new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = `${BASE}/globe.gl.min.js?v=2.41.4`;
        s.async = true;
        s.onload = () => (w.Globe ? ok(w.Globe) : falha(new Error("Globe indisponível")));
        s.onerror = () => {
            promessaGlobe = null;
            falha(new Error("Não foi possível carregar o mapa."));
        };
        document.head.appendChild(s);
    });
    return promessaGlobe;
}

let promessaDados: Promise<{ mun: Municipios; paises: any }> | null = null;
function carregarDados() {
    if (!promessaDados) {
        promessaDados = Promise.all([
            fetch(`${BASE}/municipios-br.json?v=1`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("municípios")))),
            fetch(`${BASE}/paises.geo.json?v=1`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("países")))),
        ])
            .then(([mun, paises]) => ({ mun: mun as Municipios, paises }))
            .catch((e) => {
                promessaDados = null;
                throw e;
            });
    }
    return promessaDados;
}

export default function MapaLeads({ leads }: { leads: LeadMapa[] }) {
    const caixaRef = useRef<HTMLDivElement>(null);
    const globoRef = useRef<HTMLDivElement>(null);
    const gRef = useRef<any>(null);
    const [dados, setDados] = useState<{ mun: Municipios; paises: any } | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [pronto, setPronto] = useState(false);
    const [sel, setSel] = useState<Ponto | null>(null);
    const [vista, setVista] = useState<"mundo" | "brasil" | "memorial">("mundo");

    useEffect(() => {
        let vivo = true;
        Promise.all([carregarGlobe(), carregarDados()])
            .then(([, d]) => vivo && setDados(d))
            .catch((e) => vivo && setErro(e?.message || "Não foi possível carregar o mapa."));
        return () => {
            vivo = false;
        };
    }, []);

    /* ---- agrupa os leads por cidade ---- */
    const { pontos, semLocal, cidades, paisesN, longe } = useMemo(() => {
        if (!dados) return { pontos: [] as Ponto[], semLocal: 0, cidades: 0, paisesN: 0, longe: null as Ponto | null };
        const unicas = new Map<string, [string, string, number, number]>();
        const vistos = new Map<string, number>();
        for (const [uf, lista] of Object.entries(dados.mun))
            for (const [k, v] of Object.entries(lista)) {
                vistos.set(k, (vistos.get(k) || 0) + 1);
                unicas.set(k, [uf, v[0], v[1], v[2]]);
            }
        for (const [k, n] of vistos) if (n > 1) unicas.delete(k);

        const mapa = new Map<string, Ponto>();
        let sem = 0;
        for (const l of leads) {
            const loc = localizar(l, dados.mun, unicas);
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
    }, [dados, leads]);

    const totalNoMapa = useMemo(() => pontos.reduce((s, p) => s + p.pessoas.length, 0), [pontos]);
    const exterior = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of pontos) if (p.pais !== "Brasil") m.set(p.pais, (m.get(p.pais) || 0) + p.pessoas.length);
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [pontos]);

    /* ---- cria o globo ---- */
    useEffect(() => {
        if (!dados || !globoRef.current || gRef.current) return;
        const Globe = (window as any).Globe;
        if (!Globe) return;
        const el = globoRef.current;
        const g = Globe()(el)
            .backgroundColor("rgba(0,0,0,0)")
            .showAtmosphere(true)
            .atmosphereColor("#3AA0FF")
            .atmosphereAltitude(0.2)
            .hexPolygonsData(dados.paises.features)
            .hexPolygonResolution(3)
            .hexPolygonMargin(0.42)
            .hexPolygonUseDots(true)
            .hexPolygonColor((f: any) => (f.properties?.n === "Brazil" ? "rgba(120,170,255,0.95)" : "rgba(70,110,190,0.55)"))
            .pointLat("lat")
            .pointLng("lng")
            .pointColor((p: Ponto) => (p.memorial ? "#34D27B" : "#F2CB3F"))
            .pointRadius((p: Ponto) => 0.12 + Math.min(0.3, Math.log10(p.pessoas.length + 1) * 0.1))
            .pointAltitude((p: Ponto) => 0.008 + Math.log10(p.pessoas.length + 1) * 0.028)
            .pointLabel(() => "")
            .ringColor((r: any) => (t: number) => (r.memorial ? `rgba(52,210,123,${1 - t})` : `rgba(242,203,63,${(1 - t) * 0.8})`))
            .ringMaxRadius((r: any) => (r.memorial ? 5 : 2.5))
            .ringPropagationSpeed(2.2)
            .ringRepeatPeriod(1400)
            .arcStartLat("lat")
            .arcStartLng("lng")
            .arcEndLat(() => MEMORIAL.lat)
            .arcEndLng(() => MEMORIAL.lng)
            .arcColor(() => ["rgba(242,203,63,0.85)", "rgba(58,160,255,0.35)"])
            .arcStroke((p: Ponto) => (p.pessoas.length >= 20 ? 0.6 : 0.25))
            .arcDashLength(0.5)
            .arcDashGap(1.2)
            .arcDashInitialGap(() => Math.random() * 2)
            .arcDashAnimateTime(2600)
            .arcAltitudeAutoScale(0.45)
            .htmlLat("lat")
            .htmlLng("lng")
            .htmlAltitude((d: Ponto) => 0.008 + Math.log10(d.pessoas.length + 1) * 0.028)
            .htmlElement((d: Ponto) => {
                const e = document.createElement("div");
                e.style.cssText =
                    "background:rgba(10,16,32,.88);border:1px solid #F2CB3F;border-radius:12px;padding:7px 11px;color:#fff;font:800 12px Nunito,system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-140%);box-shadow:0 0 24px rgba(242,203,63,.35);pointer-events:none";
                const b = document.createElement("b");
                b.style.cssText = "display:block;font-size:14px;font-weight:900";
                b.textContent = d.cidade;
                const s = document.createElement("span");
                s.style.color = "#F2CB3F";
                s.textContent = `${fmt(d.pessoas.length)} ${d.pessoas.length === 1 ? "pessoa" : "pessoas"}`;
                e.appendChild(b);
                e.appendChild(s);
                e.appendChild(document.createTextNode(` · ${fmt(Math.round(d.km))} km`));
                return e;
            });
        const mat = g.globeMaterial?.();
        if (mat) {
            mat.color?.set?.("#0A1730");
            mat.emissive?.set?.("#06101F");
            mat.shininess = 8;
        }
        g.controls().autoRotate = true;
        g.controls().autoRotateSpeed = 0.35;
        g.pointOfView({ lat: -2, lng: -30, altitude: 2.6 }, 0);
        gRef.current = g;

        const ajustar = () => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) g.width(r.width).height(r.height);
        };
        ajustar();
        const ro = new ResizeObserver(ajustar);
        ro.observe(el);
        setPronto(true);
        return () => {
            ro.disconnect();
            try {
                g.pauseAnimation?.();
                g._destructor?.();
            } catch {
                /* nada */
            }
            el.innerHTML = "";
            gRef.current = null;
        };
    }, [dados]);

    /* ---- dados no globo (mudam com os filtros) ---- */
    useEffect(() => {
        const g = gRef.current;
        if (!g) return;
        g.pointsData(pontos)
            .arcsData(pontos.filter((p) => p.km > 30))
            .ringsData([...pontos.filter((p) => p.pessoas.length >= 20), { ...MEMORIAL, memorial: true }])
            .onPointClick((p: Ponto) => setSel(p));
        if (sel && !pontos.some((p) => p.chave === sel.chave)) setSel(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pontos, pronto]);

    /* ---- cidade escolhida ---- */
    useEffect(() => {
        const g = gRef.current;
        if (!g) return;
        if (sel) {
            g.controls().autoRotate = false;
            g.pointOfView({ lat: sel.lat, lng: sel.lng, altitude: sel.pais === "Brasil" ? 0.9 : 1.4 }, 1200);
            g.htmlElementsData([sel]);
        } else {
            g.htmlElementsData([]);
        }
    }, [sel, pronto]);

    const irPara = (v: "mundo" | "brasil" | "memorial") => {
        const g = gRef.current;
        setVista(v);
        setSel(null);
        if (!g) return;
        if (v === "mundo") {
            g.controls().autoRotate = true;
            g.pointOfView({ lat: -2, lng: -30, altitude: 2.6 }, 1200);
        } else if (v === "brasil") {
            g.controls().autoRotate = false;
            g.pointOfView({ lat: -14, lng: -50, altitude: 1.15 }, 1200);
        } else {
            g.controls().autoRotate = false;
            g.pointOfView({ lat: MEMORIAL.lat, lng: MEMORIAL.lng, altitude: 0.55 }, 1200);
        }
    };

    const top = pontos.slice(0, 7);
    const maxTop = top[0]?.pessoas.length || 1;

    return (
        <div
            ref={caixaRef}
            className="relative grid overflow-hidden rounded-3xl border border-white/[0.08] text-white lg:h-[660px] lg:grid-cols-[minmax(0,1fr)_360px]"
            style={{ background: "radial-gradient(1200px 600px at 35% 45%,#14254A 0%,#0B1222 55%,#070C17 100%)" }}
        >
            {/* Globo */}
            <div className="relative h-[380px] min-w-0 sm:h-[460px] lg:h-full">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)",
                        backgroundSize: "44px 44px",
                        maskImage: "radial-gradient(circle at 50% 50%,#000 30%,transparent 75%)",
                        WebkitMaskImage: "radial-gradient(circle at 50% 50%,#000 30%,transparent 75%)",
                    }}
                />
                <div ref={globoRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" aria-label="Globo com as cidades dos leads" />

                <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2 lg:left-5 lg:top-4">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#7CAAFF]/25 bg-[#0A1020]/70 px-3 py-1.5 text-[11px] font-black tracking-[0.08em] text-[#CFE0FF] backdrop-blur">
                        <i className="size-2 rounded-full bg-[#34D27B] shadow-[0_0_0_4px_rgba(52,210,123,.2)]" />
                        MEMORIAL · BARREIRAS
                    </span>
                    {dados ? (
                        <span className="rounded-full border border-[#7CAAFF]/25 bg-[#0A1020]/70 px-3 py-1.5 text-[11px] font-black tracking-[0.08em] text-[#CFE0FF] backdrop-blur">
                            {fmt(totalNoMapa)} {totalNoMapa === 1 ? "PESSOA" : "PESSOAS"} · {fmt(cidades)} {cidades === 1 ? "CIDADE" : "CIDADES"} · {paisesN}{" "}
                            {paisesN === 1 ? "PAÍS" : "PAÍSES"}
                        </span>
                    ) : null}
                </div>

                <div className="absolute bottom-3 left-3 z-10 flex gap-2 lg:bottom-4 lg:left-5">
                    {(
                        [
                            ["mundo", "Mundo"],
                            ["brasil", "Brasil"],
                            ["memorial", "Memorial"],
                        ] as const
                    ).map(([v, r]) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => irPara(v)}
                            aria-pressed={vista === v}
                            className={`min-h-10 rounded-xl border px-3.5 text-[13px] font-black backdrop-blur ${
                                vista === v ? "border-[#F2CB3F] bg-[#0A1020]/75 text-[#F2CB3F]" : "border-white/[0.14] bg-[#0A1020]/75 text-white"
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>

                {!dados && !erro ? (
                    <div className="absolute inset-0 grid place-items-center text-[14px] font-bold text-[#AEB9CF]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-[#F2CB3F]" />
                            Carregando o mapa…
                        </div>
                    </div>
                ) : null}
                {erro ? (
                    <div className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] font-bold text-[#FF9C92]">
                        {erro} Verifique a internet e abra a aba de novo.
                    </div>
                ) : null}
            </div>

            {/* Painel */}
            <aside className="relative z-10 border-t border-white/[0.08] bg-[#0E1526]/85 p-4 backdrop-blur lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-5">
                {sel ? (
                    <div>
                        <button type="button" onClick={() => setSel(null)} className="mb-3 inline-flex min-h-10 items-center gap-1 text-[13px] font-black text-[#7FA7E8]">
                            <IconChevronLeft size={16} />
                            Voltar ao resumo
                        </button>
                        <div className="rounded-2xl border border-[#F2CB3F]/45 bg-gradient-to-br from-[#F2CB3F]/15 to-[#F2CB3F]/[0.03] p-4">
                            <p className="text-[11px] font-black tracking-[0.14em] text-[#F2CB3F]">
                                {sel.pais.toUpperCase()}
                                {sel.uf ? ` · ${sel.uf}` : ""}
                            </p>
                            <h2 className="mt-1 text-[24px] font-black leading-tight">{sel.cidade}</h2>
                            <p className="mt-1 text-[13px] font-bold text-[#CFD8EA]">
                                {fmt(sel.pessoas.length)} {sel.pessoas.length === 1 ? "pessoa acompanhou" : "pessoas acompanharam"} daqui · {fmt(Math.round(sel.km))} km do Memorial
                            </p>
                        </div>
                        <h3 className="mb-1 mt-5 text-[12px] font-black tracking-[0.14em] text-[#F2CB3F]">QUEM ACOMPANHOU</h3>
                        <ul>
                            {sel.pessoas.slice(0, 80).map((p) => {
                                const f = foneWhats(p.telefone);
                                return (
                                    <li key={p.id} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#2B3A5C] text-[12px] font-black text-[#CFE0FF]">{iniciais(p.nome)}</span>
                                        <div className="min-w-0 flex-1">
                                            <b className="block truncate text-[14px] font-black">{p.nome || "Sem nome"}</b>
                                            <span className="block truncate text-[12px] font-bold text-[#AEB9CF]">
                                                {[dataBr(p.registro), f.texto].filter(Boolean).join(" · ")}
                                            </span>
                                        </div>
                                        {f.whats ? (
                                            <a
                                                href={`https://wa.me/${f.whats}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={`WhatsApp de ${p.nome}`}
                                                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#B3CE52]/50 text-[#CFE38A] hover:bg-[#B3CE52]/15"
                                            >
                                                <IconBrandWhatsapp size={18} />
                                            </a>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                        {sel.pessoas.length > 80 ? (
                            <p className="mt-3 text-[13px] font-bold text-[#AEB9CF]">
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
                                <h3 className="mb-2.5 mt-5 text-[12px] font-black tracking-[0.14em] text-[#F2CB3F]">CIDADES QUE MAIS ACOMPANHARAM</h3>
                                <ul className="grid gap-1">
                                    {top.map((p, i) => (
                                        <li key={p.chave}>
                                            <button type="button" onClick={() => setSel(p)} className="grid w-full grid-cols-[20px_1fr_auto] items-center gap-x-2 rounded-lg py-1.5 text-left hover:bg-white/[0.04]">
                                                <i className="text-[12px] not-italic text-[#7FA7E8]">{i + 1}</i>
                                                <span className="truncate text-[14px] font-extrabold">
                                                    {p.cidade}
                                                    {p.uf ? ` · ${p.uf}` : ""}
                                                </span>
                                                <span className="text-[14px] font-extrabold">{fmt(p.pessoas.length)}</span>
                                                <span className="col-start-2 col-end-4 mt-1 h-[5px] rounded-full bg-white/[0.07]">
                                                    <span
                                                        className="block h-full rounded-full bg-gradient-to-r from-[#F2CB3F] to-[#FF9F43]"
                                                        style={{ width: `${(p.pessoas.length / maxTop) * 100}%` }}
                                                    />
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}

                        {exterior.length ? (
                            <>
                                <h3 className="mb-2 mt-5 text-[12px] font-black tracking-[0.14em] text-[#F2CB3F]">FORA DO BRASIL</h3>
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
                            <p className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[12px] font-bold text-[#AEB9CF]">
                                <IconMapPinOff size={16} className="mt-0.5 shrink-0" />
                                {fmt(semLocal)} {semLocal === 1 ? "lead está" : "leads estão"} sem cidade reconhecida (nome digitado errado ou teste) e não {semLocal === 1 ? "aparece" : "aparecem"} no mapa.
                            </p>
                        ) : null}
                        {dados && pontos.length === 0 ? (
                            <p className="mt-5 text-[14px] font-bold text-[#AEB9CF]">Nenhum lead com cidade reconhecida nos filtros atuais.</p>
                        ) : null}
                        <p className="mt-5 text-[12px] font-bold text-[#7A8396]">Toque numa cidade do globo para ver quem acompanhou de lá. Arraste para girar.</p>
                    </div>
                )}
            </aside>
        </div>
    );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
            <small className="block text-[11px] font-black tracking-[0.12em] text-[#7FA7E8]">{rotulo}</small>
            <b className="mt-0.5 block truncate text-[24px] font-black leading-tight">{valor}</b>
            {sub ? <span className="block truncate text-[12px] font-bold text-[#AEB9CF]">{sub}</span> : null}
        </div>
    );
}
