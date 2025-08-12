"use client";

import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   Tipos
   ========================= */
type Registro = {
    data?: string;
    falecido?: string;
    local_velorio?: string;
    hora_fim_velorio?: string;
    agente?: string;
    status?: string;
    [key: string]: any;
};

type Aviso = { usuario?: string; mensagem?: string };

/* =========================
   Utilidades
   ========================= */
const etapasCampos: (string | string[])[][] = [
    ["falecido", "contato", "religiao", "convenio"],
    ["urna", "roupa", "assistencia", "tanato"],
    [["local_sepultamento", "local"], "local_velorio", "data_inicio_velorio"],
    ["data_fim_velorio", "hora_inicio_velorio", "hora_fim_velorio", "observacao"],
];

function etapasPreenchidas(registro: Registro) {
    return etapasCampos.map((campos) =>
        campos.every((k) => {
            if (Array.isArray(k)) {
                return k.some(
                    (key) =>
                        registro[key] &&
                        String(registro[key]).trim() &&
                        !["selecionar...", "selecione..."].includes(String(registro[key]).toLowerCase())
                );
            }
            return (
                registro[k] &&
                String(registro[k]).trim() &&
                !["selecionar...", "selecione..."].includes(String(registro[k]).toLowerCase())
            );
        })
    );
}

function capStatus(s?: string) {
    switch (s) {
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
            return "Transp. p/ Velório";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Transp. p/ Sepultamento";
        case "fase10":
            return "Sepultamento Concluído";
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

/** Cores do “badge” de status (evolui conforme muda) */
function statusColor(s?: string) {
    const k = (s || "").toLowerCase();
    if (k.includes("fase10") || k.includes("conclu")) return "bg-emerald-600"; // verde
    if (k.includes("fase03") || k.includes("prepar")) return "bg-blue-600"; // azul
    if (k.includes("fase05") || k.includes("ornam")) return "bg-indigo-600"; // roxo/índigo
    if (k.includes("fase06") || k.includes("pronto")) return "bg-teal-600"; // teal
    if (k.includes("fase07")) return "bg-cyan-600"; // ciano
    if (k.includes("fase08") || k.includes("vel")) return "bg-violet-600"; // violeta
    if (k.includes("fase09") || k.includes("sepult")) return "bg-orange-600"; // laranja
    if (k.includes("fase01") || k.includes("fase02") || k.includes("aguard"))
        return "bg-slate-500"; // cinza (em espera/início)
    return "bg-neutral-500"; // default
}

const sanitize = (t?: string) =>
    t
        ? t
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        : "";

const formatDateBr = (d?: string) =>
    !d ? "" : d.split("-").length === 3 ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}` : d;

/* =========================
   Ticker (marquee) responsivo
   ========================= */
function Ticker({ items }: { items: Aviso[] }) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [duration, setDuration] = useState(18); // s

    const text = useMemo(() => {
        if (!items?.length) return "Nenhum aviso no momento.";
        return items
            .map((a) => {
                const u = (a?.usuario || "").trim();
                const m = (a?.mensagem || "").trim();
                return `${u ? u + ": " : ""}${m}`;
            })
            .filter(Boolean)
            .join("   •   ");
    }, [items]);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        const contentWidth = el.scrollWidth;
        const speed = 140; // px/seg — um pouco mais rápido
        const base = Math.max(10, Math.round(contentWidth / speed));
        setDuration(base);
    }, [text]);

    return (
        <div
            ref={wrapperRef}
            className="fixed bottom-0 left-0 right-0 z-40 select-none"
            style={{
                background: "linear-gradient(180deg, rgba(0,0,0,.06), rgba(0,0,0,.06)) , #073051",
            }}
        >
            <div className="mx-auto flex h-14 max-w-[1920px] items-center overflow-hidden px-4 sm:h-16 sm:px-6">
                <strong className="mr-3 shrink-0 text-white/90 sm:mr-4 sm:text-xl">Avisos:</strong>
                <div className="relative flex-1 overflow-hidden">
                    <div
                        className="whitespace-nowrap text-white text-[15px] sm:text-lg font-extrabold will-change-transform"
                        ref={innerRef}
                        style={{ animation: `ticker ${duration}s linear infinite` }}
                    >
                        <span dangerouslySetInnerHTML={{ __html: sanitize(text) }} />
                        <span className="mx-8">•</span>
                        <span dangerouslySetInnerHTML={{ __html: sanitize(text) }} />
                    </div>
                </div>
            </div>

            <style jsx global>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="ticker"] {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
        </div>
    );
}

/* =========================
   Página (TV)
   ========================= */
export default function PainelTV() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [connErr, setConnErr] = useState<string | null>(null);

    // Relógio suave
    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const now = new Date();
            const h = now.getHours().toString().padStart(2, "0");
            const m = now.getMinutes().toString().padStart(2, "0");
            const s = now.getSeconds().toString().padStart(2, "0");
            setClockTime(`${h}:${m}:${s}`);
            const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
            const dd = now.getDate().toString().padStart(2, "0");
            const mm = (now.getMonth() + 1).toString().padStart(2, "0");
            const yyyy = now.getFullYear();
            setClockDate(`${dias[now.getDay()]}, ${dd}/${mm}/${yyyy}`);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    // Fetch helpers
    async function safeJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
        try {
            const r = await fetch(url, { cache: "no-store", signal });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return (await r.json()) as T;
        } catch {
            return null;
        }
    }

    // Registros
    useEffect(() => {
        let timer: any;
        let active = true;
        const run = async () => {
            const ctrl = new AbortController();
            const url = `https://planoassistencialintegrado.com.br/informativo.php?listar=1&_nocache=${Date.now()}`;
            const data = await safeJson<Registro[]>(url, ctrl.signal);
            if (!active) return;
            if (Array.isArray(data)) {
                setRegistros(data);
                setConnErr(null);
            } else {
                setConnErr("Erro na conexão.");
            }
            timer = setTimeout(run, 8000);
            return () => ctrl.abort();
        };
        run();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, []);

    // Avisos
    useEffect(() => {
        let timer: any;
        let active = true;
        const run = async () => {
            const ctrl = new AbortController();
            const url = `https://planoassistencialintegrado.com.br/avisos.php?listar=1&_nocache=${Date.now()}`;
            const data = await safeJson<Aviso[]>(url, ctrl.signal);
            if (!active) return;
            setAvisos(Array.isArray(data) ? data : []);
            timer = setTimeout(run, 15000);
            return () => ctrl.abort();
        };
        run();
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, []);

    const ativos = useMemo(
        () =>
            registros.filter(
                (r) =>
                    String(r.status).toLowerCase() !== "concluido" &&
                    String(r.status).toLowerCase() !== "fase10" &&
                    capStatus(r.status).toLowerCase() !== "sepultamento concluído"
            ),
        [registros]
    );

    return (
        <>
            {/* Nunito carregada aqui */}
            <Head>
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
                    rel="stylesheet"
                />
            </Head>

            <div className="min-h-screen w-full bg-[#0e2a44] text-white">
                {/* Top bar com logo central */}
                <header className="bg-[#059de0]">
                    <div className="mx-auto grid h-20 w-full max-w-[1920px] grid-cols-3 items-center px-4 sm:h-24 sm:px-8">
                        {/* Coluna esquerda (vazia / pode colocar algo se quiser) */}
                        <div className="hidden sm:block" />
                        {/* Centro com logo */}
                        <div className="flex items-center justify-center">
                            {/* Troque o src para o caminho real da sua logo */}
                            <img
                                src="/logo.svg"
                                alt="PAI - Plano Assistencial Integrado"
                                className="h-10 w-auto drop-shadow-sm sm:h-12"
                            />
                        </div>
                        {/* Direita com relógio */}
                        <div className="text-right leading-tight">
                            <div className="text-xl font-extrabold tracking-wide sm:text-3xl">{clockTime}</div>
                            <div className="text-sm font-semibold opacity-95 sm:text-base">{clockDate}</div>
                        </div>
                    </div>
                </header>

                {/* Conteúdo */}
                <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
                    <section className="rounded-3xl bg-white text-[#1b2a41] shadow-2xl ring-1 ring-black/5">
                        <div className="px-5 pb-5 pt-6 sm:px-8 sm:pt-8">
                            <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-4xl">
                                Quadro de Atendimentos
                            </h2>
                            <div className="mx-auto mt-2 h-1 w-24 rounded-full bg-[#059de0]/80" />
                        </div>

                        {/* Tabela (TV/Desktop) */}
                        <div className="hidden px-4 pb-6 sm:block">
                            <div className="overflow-hidden rounded-2xl">
                                <table className="min-w-full text-lg" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
                                    <thead>
                                        <tr className="bg-[#1f3554] text-white/95 [&>th]:px-4 [&>th]:py-3 [&>th]:text-left">
                                            <th>Data</th>
                                            <th>Falecido(a)</th>
                                            <th>Local</th>
                                            <th>Hora</th>
                                            <th>Agente</th>
                                            <th>Status</th>
                                            <th className="whitespace-nowrap">Etapas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white text-[#1b2a41]">
                                        {connErr ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-[#6b7a90] text-xl">
                                                    {connErr}
                                                </td>
                                            </tr>
                                        ) : ativos.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-8 text-center text-[#6b7a90] text-xl">
                                                    Nenhum atendimento encontrado.
                                                </td>
                                            </tr>
                                        ) : (
                                            ativos.map((r, i) => {
                                                const preenchidas = etapasPreenchidas(r);
                                                return (
                                                    <tr key={i} className="border-b border-black/5 [&>td]:px-4 [&>td]:py-4">
                                                        <td className="font-semibold">{formatDateBr(r.data)}</td>
                                                        <td className="font-extrabold">{sanitize(r.falecido)}</td>
                                                        <td className="font-semibold">{sanitize(r.local_velorio)}</td>
                                                        <td className="font-semibold">{(r.hora_fim_velorio || "").slice(0, 5)}</td>
                                                        <td className="font-semibold">{sanitize(r.agente)}</td>
                                                        <td>
                                                            <span
                                                                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold text-white ${statusColor(
                                                                    r.status
                                                                )}`}
                                                            >
                                                                {capStatus(r.status)}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="flex items-center gap-4">
                                                                {["D", "I", "V", "S"].map((label, k) => (
                                                                    <div key={k} className="flex items-center gap-2">
                                                                        <span className="text-sm text-[#6b7a90]">{label}</span>
                                                                        <span
                                                                            className={`h-4 w-4 rounded-full border ${preenchidas[k]
                                                                                    ? "bg-emerald-500 border-emerald-600"
                                                                                    : "bg-transparent border-[#cfd7e3]"
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Cards (mobile) */}
                        <div className="px-4 pb-6 sm:hidden">
                            {connErr ? (
                                <div className="rounded-xl bg-white p-4 text-center text-[#6b7a90] shadow">{connErr}</div>
                            ) : ativos.length === 0 ? (
                                <div className="rounded-xl bg-white p-4 text-center text-[#6b7a90] shadow">
                                    Nenhum atendimento encontrado.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {ativos.map((r, i) => {
                                        const preenchidas = etapasPreenchidas(r);
                                        return (
                                            <div key={i} className="rounded-xl bg-white p-4 shadow ring-1 ring-black/5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-base font-extrabold text-[#1b2a41]">{sanitize(r.falecido)}</div>
                                                    <span
                                                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${statusColor(
                                                            r.status
                                                        )}`}
                                                    >
                                                        {capStatus(r.status)}
                                                    </span>
                                                </div>

                                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[15px] text-[#1b2a41]">
                                                    <div>
                                                        <span className="text-[#6b7a90]">Data:</span> {formatDateBr(r.data)}
                                                    </div>
                                                    <div>
                                                        <span className="text-[#6b7a90]">Hora:</span> {(r.hora_fim_velorio || "").slice(0, 5)}
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className="text-[#6b7a90]">Local:</span> {sanitize(r.local_velorio)}
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className="text-[#6b7a90]">Agente:</span> {sanitize(r.agente)}
                                                    </div>
                                                    <div className="col-span-2 pt-1">
                                                        <span className="text-[#6b7a90]">Etapas:</span>
                                                        <div className="mt-1 flex items-center gap-3">
                                                            {["D", "I", "V", "S"].map((label, k) => (
                                                                <div key={k} className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] text-[#6b7a90]">{label}</span>
                                                                    <span
                                                                        className={`h-3.5 w-3.5 rounded-full border ${preenchidas[k]
                                                                                ? "bg-emerald-500 border-emerald-600"
                                                                                : "bg-transparent border-[#cfd7e3]"
                                                                            }`}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </main>

                {/* Ticker de avisos */}
                <Ticker items={avisos} />
            </div>

            {/* Fonte Nunito aplicada globalmente a esta página */}
            <style jsx global>{`
        html, body, * {
          font-family: 'Nunito', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif !important;
        }
      `}</style>
        </>
    );
}
