"use client";

import { useEffect, useState } from "react";

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

const etapasCampos: (string | string[])[][] = [
    ["falecido", "contato", "religiao", "convenio"],
    ["urna", "roupa", "assistencia", "tanato"],
    [["local_sepultamento", "local"], "local_velorio", "data_inicio_velorio"],
    ["data_fim_velorio", "hora_inicio_velorio", "hora_fim_velorio", "observacao"],
];

function etapasPreenchidas(registro: Registro) {
    return etapasCampos.map((campos) =>
        campos.every((k) => {
            if (Array.isArray(k))
                return k.some(
                    (key) =>
                        registro[key] &&
                        String(registro[key]).trim() &&
                        !["selecionar...", "selecione..."].includes(
                            String(registro[key]).toLowerCase()
                        )
                );
            return (
                registro[k] &&
                String(registro[k]).trim() &&
                !["selecionar...", "selecione..."].includes(
                    String(registro[k]).toLowerCase()
                )
            );
        })
    );
}

function capStatus(s?: string) {
    switch (s) {
        case "fase01": return "Removendo";
        case "fase02": return "Aguardando Procedimento";
        case "fase03": return "Preparando";
        case "fase04": return "Aguardando Ornamentação";
        case "fase05": return "Ornamentando";
        case "fase06": return "Corpo Pronto";
        case "fase07": return "Transportando P/ Velório";
        case "fase08": return "Velando";
        case "fase09": return "Transportando P/ Sepultamento";
        case "fase10": return "Sepultamento Concluído";
        default: return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

function badgeClass(s?: string) {
    switch ((s || "").toLowerCase()) {
        case "removendo": return "bg-amber-500";
        case "velando": return "bg-violet-600";
        case "preparando": return "bg-blue-600";
        case "sepultando": return "bg-orange-600";
        case "concluido": return "bg-green-600";
        default: return "bg-neutral-500";
    }
}

const sanitize = (t?: string) =>
    t ? t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

const formatDateBr = (d?: string) =>
    !d ? "" : d.split("-").length === 3 ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}` : d;

export default function QuadroAtendimentoPage() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [avisos, setAvisos] = useState<Aviso[]>([]);

    // relógio
    useEffect(() => {
        const update = () => {
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
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    // dados
    useEffect(() => {
        const load = () =>
            fetch(`/informativo.php?listar=1&_nocache=${Date.now()}`, { cache: "no-store" })
                .then((r) => r.json())
                .then((j) => setRegistros(Array.isArray(j) ? j : []))
                .catch(() => setRegistros([]));
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, []);

    // avisos
    useEffect(() => {
        const load = () =>
            fetch(`/avisos.php?listar=1&_nocache=${Date.now()}`, { cache: "no-store" })
                .then((r) => r.json())
                .then((j) => setAvisos(Array.isArray(j) ? j : []))
                .catch(() => setAvisos([]));
        load();
        const id = setInterval(load, 20000);
        return () => clearInterval(id);
    }, []);

    const ativos = registros.filter(
        (r) =>
            String(r.status).toLowerCase() !== "concluido" &&
            String(r.status).toLowerCase() !== "fase10" &&
            capStatus(r.status).toLowerCase() !== "sepultamento concluído"
    );

    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-6">
            {/* Header/clock */}
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight">Quadro de Atendimentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Atualizado em tempo real — <span className="font-medium">{clockTime}</span> • {clockDate}
                </p>
            </div>

            {/* Tabela (desktop) */}
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
                                            <td>{formatDateBr(r.data)}</td>
                                            <td className="font-semibold">{sanitize(r.falecido)}</td>
                                            <td>{sanitize(r.local_velorio)}</td>
                                            <td>{(r.hora_fim_velorio || "").slice(0, 5)}</td>
                                            <td>{sanitize(r.agente)}</td>
                                            <td>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white ${badgeClass(
                                                        r.status
                                                    )}`}
                                                >
                                                    {capStatus(r.status)}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    {["D", "I", "V", "S"].map((label, k) => (
                                                        <div key={k} className="flex items-center gap-1.5">
                                                            <span className="text-[11px] text-muted-foreground">{label}</span>
                                                            <span
                                                                className={`h-3.5 w-3.5 rounded-full border ${preenchidas[k] ? "bg-green-500 border-green-600" : "bg-transparent"
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
            <div className="sm:hidden space-y-3">
                {ativos.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-center text-muted-foreground">
                        Nenhum atendimento encontrado.
                    </div>
                ) : (
                    ativos.map((r, i) => {
                        const preenchidas = etapasPreenchidas(r);
                        return (
                            <div key={i} className="rounded-xl border bg-card/60 p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="text-base font-semibold">{sanitize(r.falecido)}</div>
                                    <span
                                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${badgeClass(
                                            r.status
                                        )}`}
                                    >
                                        {capStatus(r.status)}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-1.5 text-sm">
                                    <div><span className="text-muted-foreground">Data:</span> {formatDateBr(r.data)}</div>
                                    <div><span className="text-muted-foreground">Hora:</span> {(r.hora_fim_velorio || "").slice(0, 5)}</div>
                                    <div><span className="text-muted-foreground">Agente:</span> {sanitize(r.agente)}</div>
                                    <div><span className="text-muted-foreground">Local:</span> {sanitize(r.local_velorio)}</div>
                                    <div className="pt-1">
                                        <span className="text-muted-foreground">Etapas:</span>
                                        <div className="mt-1 flex items-center gap-3">
                                            {["D", "I", "V", "S"].map((label, k) => (
                                                <div key={k} className="flex items-center gap-1.5">
                                                    <span className="text-[11px] text-muted-foreground">{label}</span>
                                                    <span
                                                        className={`h-3.5 w-3.5 rounded-full border ${preenchidas[k] ? "bg-green-500 border-green-600" : "bg-transparent"
                                                            }`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Avisos */}
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Avisos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mensagens importantes do sistema</p>
                <div className="mt-4 space-y-2">
                    {avisos.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum aviso no momento.</p>
                    ) : (
                        avisos.map((a, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                                <strong>{sanitize(a.usuario)}:</strong>
                                <span>{sanitize(a.mensagem)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
