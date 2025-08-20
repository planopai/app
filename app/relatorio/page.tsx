import React, { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    LineChart,
    Line,
} from "recharts";

// ======================== Tipos ========================
interface Sepultamento {
    id: number;
    nomeFalecido: string;
    data: string; // YYYY-MM-DD
    local: string;
    assistencia?: "Sim" | "Não";
    tanato?: "Sim" | "Não"; // Tanatopraxia
    materiais?: Record<string, number>; // Ex.: { "Cadeiras": 4, ... }
    arrumacao?: string; // JSON string booleano por item (Luvas, Palha...)
}

// ======================== Dados de exemplo ========================
// Troque por sua fonte real. Mantive alguns itens para demonstrar os gráficos.
const sepultamentos: Sepultamento[] = [
    {
        id: 1,
        nomeFalecido: "João da Silva",
        data: "2025-08-20",
        local: "Cemitério São Sebastião",
        assistencia: "Sim",
        tanato: "Sim",
        materiais: {
            Cadeiras: 10,
            Bebedouros: 1,
            "Suporte Coroa": 1,
            "Kit Lanche": 20,
            Velas: 12,
            Tenda: 1,
            Placa: 1,
            Paramentacao: 1,
        },
        arrumacao:
            '{"Luvas":true,"Palha":true,"Tamponamento":true,"Maquiagem":true,"Algodão":true,"Cordão":true,"Barba":false}',
    },
    {
        id: 2,
        nomeFalecido: "Maria Oliveira",
        data: "2025-08-19",
        local: "Cemitério São João Batista",
        assistencia: "Não",
        tanato: "Não",
        materiais: {
            Cadeiras: 6,
            Bebedouros: 1,
            "Kit Lanche": 12,
            Velas: 8,
            Placa: 1,
            Paramentacao: 1,
        },
        arrumacao:
            '{"Luvas":true,"Palha":false,"Tamponamento":false,"Maquiagem":true,"Algodão":false,"Cordão":true,"Barba":true}',
    },
    {
        id: 3,
        nomeFalecido: "Carlos Souza",
        data: "2025-08-18",
        local: "Cemitério Jardim da Saudade",
        assistencia: "Sim",
        tanato: "Não",
        materiais: {
            Cadeiras: 12,
            "Suporte Coroa": 2,
            Velas: 15,
            Tenda: 1,
        },
        arrumacao:
            '{"Luvas":true,"Palha":true,"Tamponamento":false,"Maquiagem":false,"Algodão":true,"Cordão":false,"Barba":false}',
    },
];

// ======================== Constantes ========================
const ARR_KEYS = [
    "Luvas",
    "Palha",
    "Tamponamento",
    "Maquiagem",
    "Algodão",
    "Cordão",
    "Barba",
] as const;

const MAT_KEYS = [
    "Cadeiras",
    "Bebedouros",
    "Suporte Coroa",
    "Kit Lanche",
    "Velas",
    "Tenda",
    "Placa",
    "Paramentacao",
] as const;

// ======================== Helpers ========================
function parseArrumacao(json?: string): Record<string, boolean> {
    if (!json) return {};
    try {
        const obj = JSON.parse(json);
        return typeof obj === "object" && obj ? obj : {};
    } catch {
        return {};
    }
}

function withinRange(date: string, from?: string, to?: string) {
    if ((!from && !to) || !date) return true;
    const d = new Date(date + "T00:00:00");
    if (from) {
        const f = new Date(from + "T00:00:00");
        if (d < f) return false;
    }
    if (to) {
        const t = new Date(to + "T23:59:59");
        if (d > t) return false;
    }
    return true;
}

function toMultiSelectValue(list: string[]): string[] {
    return [...list];
}

// ======================== Componente ========================
const RelatorioPage: React.FC = () => {
    const [search, setSearch] = useState("");
    const [analiseOpen, setAnaliseOpen] = useState(false);

    // filtros da análise
    const [from, setFrom] = useState<string>("");
    const [to, setTo] = useState<string>("");

    const [arrSelected, setArrSelected] = useState<string[]>([]); // multi-select
    const [matSelected, setMatSelected] = useState<string[]>([]); // multi-select

    const [assistFilter, setAssistFilter] = useState<"Todos" | "Sim" | "Não">("Todos");
    const [tanatoFilter, setTanatoFilter] = useState<"Todos" | "Sim" | "Não">("Todos");

    const listFiltered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sepultamentos.filter((s) => {
            const matchesText =
                !q || s.nomeFalecido.toLowerCase().includes(q) || s.local.toLowerCase().includes(q);
            return matchesText;
        });
    }, [search]);

    // ---- dataset filtrado para gráficos ----
    const dataset = useMemo(() => {
        return sepultamentos.filter((s) => {
            if (!withinRange(s.data, from, to)) return false;

            // Assistência
            if (assistFilter !== "Todos" && (s.assistencia || "Não") !== assistFilter) return false;
            // Tanato
            if (tanatoFilter !== "Todos" && (s.tanato || "Não") !== tanatoFilter) return false;

            const arr = parseArrumacao(s.arrumacao);

            // Deve conter TODOS itens de arrumação selecionados
            for (const k of arrSelected) {
                if (!arr[k]) return false;
            }

            // Deve conter TODOS materiais selecionados (>0)
            for (const k of matSelected) {
                const qtd = s.materiais?.[k] ?? 0;
                if (!qtd || qtd <= 0) return false;
            }

            return true;
        });
    }, [from, to, arrSelected, matSelected, assistFilter, tanatoFilter]);

    // ---- agregações ----
    const materiaisAgg = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of dataset) {
            for (const k of MAT_KEYS) {
                const qtd = s.materiais?.[k] ?? 0;
                if (qtd > 0) map.set(k, (map.get(k) || 0) + qtd);
            }
        }
        // ordena desc
        return MAT_KEYS.map((k) => ({ material: k, qtd: map.get(k) || 0 }))
            .filter((d) => d.qtd > 0)
            .sort((a, b) => b.qtd - a.qtd);
    }, [dataset]);

    const arrumacaoAgg = useMemo(() => {
        const map = new Map<string, number>();
        for (const k of ARR_KEYS) map.set(k, 0);
        for (const s of dataset) {
            const arr = parseArrumacao(s.arrumacao);
            for (const k of ARR_KEYS) {
                if (arr[k]) map.set(k, (map.get(k) || 0) + 1);
            }
        }
        return ARR_KEYS.map((k) => ({ item: k, qtd: map.get(k) || 0 }))
            .filter((d) => d.qtd > 0)
            .sort((a, b) => b.qtd - a.qtd);
    }, [dataset]);

    const porDiaAgg = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of dataset) {
            const d = s.data;
            map.set(d, (map.get(d) || 0) + 1);
        }
        return Array.from(map.entries())
            .map(([data, qtd]) => ({ data, qtd }))
            .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    }, [dataset]);

    const totalMateriais = useMemo(
        () => materiaisAgg.reduce((sum, it) => sum + it.qtd, 0),
        [materiaisAgg]
    );
    const totalRegistros = dataset.length;

    // ======================== PDF (lista simples) ========================
    const gerarPDF = () => {
        const doc = new jsPDF();
        let y = 10;

        listFiltered.forEach((s) => {
            doc.text(`Falecido: ${s.nomeFalecido}`, 10, y);
            y += 6;
            doc.text(`Data: ${s.data}`, 10, y);
            y += 6;
            doc.text(`Local: ${s.local}`, 10, y);
            y += 6;

            if (s.assistencia) {
                doc.text(`Assistência: ${s.assistencia}`, 10, y);
                y += 6;
            }
            if (s.tanato) {
                doc.text(`Tanatopraxia: ${s.tanato}`, 10, y);
                y += 6;
            }

            if (s.materiais) {
                doc.text("Materiais:", 10, y);
                y += 6;
                Object.entries(s.materiais).forEach(([nome, qtd]) => {
                    doc.text(`- ${nome}: ${qtd}`, 14, y);
                    y += 6;
                });
            }

            if (s.arrumacao) {
                doc.text("Arrumação:", 10, y);
                y += 6;
                try {
                    const arr = JSON.parse(s.arrumacao);
                    Object.entries(arr).forEach(([item, marcado]) => {
                        if (marcado) {
                            doc.text(`✅ ${item}`, 14, y);
                            y += 6;
                        }
                    });
                } catch (e) {
                    doc.text("(Erro ao processar arrumação)", 14, y);
                    y += 6;
                }
            }

            y += 10;
        });

        doc.save("relatorio_sepultamentos.pdf");
    };

    // ======================== UI ========================
    return (
        <div className="p-4 sm:p-6">
            <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-semibold">Histórico de Sepultamentos</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        Pesquise e gere PDF. Use "Análise Geral" para gráficos e filtros.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filtrar por falecido ou local"
                        className="w-full rounded-md border px-3 py-2 text-sm md:w-72"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => setAnaliseOpen(true)}
                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                            title="Abrir análise geral"
                        >
                            Análise Geral
                        </button>
                        <button
                            onClick={gerarPDF}
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                        >
                            Gerar PDF
                        </button>
                    </div>
                </div>
            </header>

            {/* Lista básica */}
            <div className="space-y-4">
                {listFiltered.map((s) => (
                    <div key={s.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">{s.nomeFalecido}</div>
                            <div className="text-sm opacity-70">
                                {s.data} • {s.local}
                            </div>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-2 text-xs sm:text-sm">
                            {s.assistencia && (
                                <span className="rounded border px-2 py-0.5">Assistência: {s.assistencia}</span>
                            )}
                            {s.tanato && (
                                <span className="rounded border px-2 py-0.5">Tanatopraxia: {s.tanato}</span>
                            )}
                        </div>

                        {s.materiais && (
                            <div className="mt-2 text-sm">
                                <strong>Materiais:</strong>{" "}
                                {Object.entries(s.materiais)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" • ")}
                            </div>
                        )}

                        {s.arrumacao && (
                            <div className="mt-1 text-sm">
                                <strong>Arrumação:</strong>{" "}
                                {(() => {
                                    const arr = parseArrumacao(s.arrumacao);
                                    return ARR_KEYS.filter((k) => arr[k])
                                        .map((k) => `✅ ${k}`)
                                        .join(" • ");
                                })()}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* === Modal de Análise === */}
            {analiseOpen && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Análise Geral"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setAnaliseOpen(false);
                    }}
                >
                    <div className="w-full max-w-6xl rounded-2xl bg-white p-4 sm:p-5 shadow-xl">
                        {/* Cabeçalho flutuante para telas grandes */}
                        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <h2 className="text-lg sm:text-xl font-semibold">Análise Geral</h2>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                    Filtros compactos (select) e gráficos responsivos.
                                </p>
                            </div>
                            <button
                                onClick={() => setAnaliseOpen(false)}
                                className="self-end rounded-md border px-3 py-2 text-sm hover:bg-muted"
                            >
                                Fechar
                            </button>
                        </div>

                        {/* Layout responsivo: coluna lateral fixa + conteúdo */}
                        <div className="grid gap-4 lg:grid-cols-[340px,1fr]">
                            {/* Filtros compactos */}
                            <div className="rounded-xl border p-3 sm:p-4">
                                <div className="mb-3 text-sm font-semibold">Filtros</div>

                                {/* Período */}
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">De</span>
                                        <input
                                            type="date"
                                            value={from}
                                            onChange={(e) => setFrom(e.target.value)}
                                            className="rounded-md border px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">Até</span>
                                        <input
                                            type="date"
                                            value={to}
                                            onChange={(e) => setTo(e.target.value)}
                                            className="rounded-md border px-3 py-2 text-sm"
                                        />
                                    </label>
                                </div>

                                {/* Assistência e Tanato */}
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">Assistência</span>
                                        <select
                                            value={assistFilter}
                                            onChange={(e) => setAssistFilter(e.target.value as any)}
                                            className="rounded-md border px-3 py-2 text-sm"
                                        >
                                            <option value="Todos">Todos</option>
                                            <option value="Sim">Sim</option>
                                            <option value="Não">Não</option>
                                        </select>
                                    </label>

                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">Tanatopraxia</span>
                                        <select
                                            value={tanatoFilter}
                                            onChange={(e) => setTanatoFilter(e.target.value as any)}
                                            className="rounded-md border px-3 py-2 text-sm"
                                        >
                                            <option value="Todos">Todos</option>
                                            <option value="Sim">Sim</option>
                                            <option value="Não">Não</option>
                                        </select>
                                    </label>
                                </div>

                                {/* Arrumação (multi-select) */}
                                <div className="mt-3">
                                    <label className="mb-1 block text-xs text-muted-foreground">Arrumação (selecione 1+)</label>
                                    <select
                                        multiple
                                        size={Math.min(7, ARR_KEYS.length)}
                                        value={toMultiSelectValue(arrSelected)}
                                        onChange={(e) =>
                                            setArrSelected(Array.from(e.currentTarget.selectedOptions).map((o) => o.value))
                                        }
                                        className="h-auto w-full rounded-md border px-2 py-2 text-sm"
                                    >
                                        {ARR_KEYS.map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                        <button
                                            className="rounded border px-2 py-1 hover:bg-muted"
                                            onClick={() => setArrSelected([...ARR_KEYS])}
                                            type="button"
                                        >
                                            Todos
                                        </button>
                                        <button
                                            className="rounded border px-2 py-1 hover:bg-muted"
                                            onClick={() => setArrSelected([])}
                                            type="button"
                                        >
                                            Nenhum
                                        </button>
                                    </div>
                                </div>

                                {/* Materiais (multi-select) */}
                                <div className="mt-3">
                                    <label className="mb-1 block text-xs text-muted-foreground">Materiais (selecione 1+)</label>
                                    <select
                                        multiple
                                        size={Math.min(8, MAT_KEYS.length)}
                                        value={toMultiSelectValue(matSelected)}
                                        onChange={(e) =>
                                            setMatSelected(Array.from(e.currentTarget.selectedOptions).map((o) => o.value))
                                        }
                                        className="h-auto w-full rounded-md border px-2 py-2 text-sm"
                                    >
                                        {MAT_KEYS.map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                        <button
                                            className="rounded border px-2 py-1 hover:bg-muted"
                                            onClick={() => setMatSelected([...MAT_KEYS])}
                                            type="button"
                                        >
                                            Todos
                                        </button>
                                        <button
                                            className="rounded border px-2 py-1 hover:bg-muted"
                                            onClick={() => setMatSelected([])}
                                            type="button"
                                        >
                                            Nenhum
                                        </button>
                                    </div>
                                </div>

                                {/* Resumo compacto */}
                                <div className="mt-3 text-xs text-muted-foreground">
                                    <div>Registros no período: <b>{totalRegistros}</b></div>
                                    <div>Materiais somados: <b>{totalMateriais}</b></div>
                                </div>
                            </div>

                            {/* Conteúdo (gráficos) */}
                            <div className="grid gap-4">
                                {/* Materiais: barras horizontais para melhor leitura em desktop */}
                                <div className="rounded-xl border p-3 sm:p-4">
                                    <h3 className="mb-2 text-sm sm:text-base font-medium">Materiais consumidos (soma das quantidades)</h3>
                                    <div className="h-[280px] sm:h-[340px]">
                                        {materiaisAgg.length === 0 ? (
                                            <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados</div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <BarChart data={materiaisAgg} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis type="number" allowDecimals={false} />
                                                    <YAxis type="category" dataKey="material" width={110} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Bar dataKey="qtd" name="Quantidade" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                {/* Arrumação: barras horizontais */}
                                <div className="rounded-xl border p-3 sm:p-4">
                                    <h3 className="mb-2 text-sm sm:text-base font-medium">Arrumação (nº de atendimentos com o item marcado)</h3>
                                    <div className="h-[280px] sm:h-[340px]">
                                        {arrumacaoAgg.length === 0 ? (
                                            <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados</div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <BarChart data={arrumacaoAgg} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis type="number" allowDecimals={false} />
                                                    <YAxis type="category" dataKey="item" width={110} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Bar dataKey="qtd" name="Atendimentos" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                {/* Atendimentos por dia */}
                                <div className="rounded-xl border p-3 sm:p-4">
                                    <h3 className="mb-2 text-sm sm:text-base font-medium">Atendimentos por dia</h3>
                                    <div className="h-[240px] sm:h-[300px]">
                                        {porDiaAgg.length === 0 ? (
                                            <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados</div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <LineChart data={porDiaAgg} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                                                    <YAxis allowDecimals={false} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="qtd" name="Atendimentos" />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RelatorioPage;
