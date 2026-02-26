"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import type { ArrumacaoState, Registro } from "./types";


type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

type InsumoSel = {
    checked: boolean;
    qtd: number;
    nome: string;
    codigo_barras?: string;
};

type DepInsumos = "ARMARIO SANDRO" | "ARMARIO ILDO" | "";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const ESTOQUE_API = `${ENDPOINT}/materiais_gerais.php`;

function normUpper(v: any) {
    return String(v ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function getPidFromRow(it: EstoqueRow): number {
    return Number((it as any).id ?? (it as any).produto_id ?? (it as any).est_produto_id ?? 0) || 0;
}

function safeParseJson(raw: any): any {
    try {
        if (!raw) return {};
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return {};
    }
}

// ✅ Pré-preenche depósito + itens a partir do arrumacao_json (suporta aliases)
function parseArrumacaoJson(raw: any): { deposito_nome: DepInsumos; itens: Record<number, InsumoSel> } {
    const out: { deposito_nome: DepInsumos; itens: Record<number, InsumoSel> } = { deposito_nome: "", itens: {} };

    const obj = safeParseJson(raw);
    if (!obj || typeof obj !== "object") return out;

    const dep = normUpper((obj as any).deposito_nome ?? (obj as any).deposito ?? "");
    out.deposito_nome = dep === "ARMARIO ILDO" ? "ARMARIO ILDO" : dep === "ARMARIO SANDRO" ? "ARMARIO SANDRO" : "";

    const itensRaw = (obj as any).itens ?? (obj as any).items ?? null;

    // ✅ formato array
    if (Array.isArray(itensRaw)) {
        for (const it of itensRaw) {
            const pid = Number((it as any)?.produto_id ?? (it as any)?.id ?? 0) || 0;
            if (pid <= 0) continue;

            const checked =
                (it as any)?.checked !== false &&
                (it as any)?.checked !== 0 &&
                (it as any)?.checked !== "0" &&
                (it as any)?.checked !== "false";

            if (!checked) continue;

            const qtd = Math.max(1, Math.floor(Number((it as any)?.qtd ?? (it as any)?.quantidade ?? 1) || 1));

            out.itens[pid] = {
                checked: true,
                qtd,
                nome: String((it as any)?.nome ?? "").trim() || `Produto ${pid}`,
                codigo_barras: String((it as any)?.codigo_barras ?? (it as any)?.cb ?? "").trim() || undefined,
            };
        }
        return out;
    }

    // ✅ formato object/dict
    if (itensRaw && typeof itensRaw === "object") {
        for (const [k, v] of Object.entries(itensRaw)) {
            const vv: any = v || {};
            let pid = Number(vv?.produto_id ?? 0) || 0;

            if (!pid) {
                const m = String(k).match(/(\d+)/);
                if (m) pid = Number(m[1]) || 0;
            }
            if (pid <= 0) continue;

            const checked =
                vv?.checked !== false && vv?.checked !== 0 && vv?.checked !== "0" && vv?.checked !== "false";
            if (!checked) continue;

            const qtd = Math.max(1, Math.floor(Number(vv?.qtd ?? vv?.quantidade ?? 1) || 1));

            out.itens[pid] = {
                checked: true,
                qtd,
                nome: String(vv?.nome ?? "").trim() || `Produto ${pid}`,
                codigo_barras: String(vv?.codigo_barras ?? vv?.cb ?? "").trim() || undefined,
            };
        }
    }

    return out;
}

export default function ArrumacaoModal({
    open,
    setOpen,
    arrumacao,
    setArrumacao,
    setWizardData,
    // ✅ passe o wizardData para pré-preencher corretamente ao editar
    wizardData,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    arrumacao: ArrumacaoState;
    setArrumacao: React.Dispatch<React.SetStateAction<ArrumacaoState>>;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
    wizardData?: Registro;
}) {
    // ✅ checks visíveis
    const campos: { key: keyof ArrumacaoState; label: string }[] = [
        { key: "luvas", label: "Luvas" },
        { key: "palha", label: "Palha" },
        { key: "tamponamento", label: "Tamponamento" },
        { key: "maquiagem", label: "Maquiagem" },
        { key: "barba", label: "Barba" },
        { key: "mascara", label: "Máscara" },
    ];

    // =========================
    // INSUMOS TANATOPRAXIA
    // =========================
    const [depInsumos, setDepInsumos] = useState<DepInsumos>("");
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const [sel, setSel] = useState<Record<number, InsumoSel>>({});

    const abortRef = useRef<AbortController | null>(null);

    // ✅ Pré-preenche depósito/itens ao abrir (quando editando)
    useEffect(() => {
        if (!open) return;

        setErr("");
        setQ("");
        setRows([]);

        const raw = (wizardData as any)?.arrumacao_json ?? (wizardData as any)?.arrumacao ?? null;
        const parsed = parseArrumacaoJson(raw);

        // se não houver nada salvo, limpa
        if (!parsed.deposito_nome) setDepInsumos("");
        else setDepInsumos(parsed.deposito_nome);

        if (Object.keys(parsed.itens).length) setSel(parsed.itens);
        else setSel({});

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // ✅ Busca insumos quando depósito muda (e quando digita busca)
    useEffect(() => {
        if (!open) return;

        // sem depósito: zera lista e cancela request
        if (!depInsumos) {
            setRows([]);
            setErr("");
            if (abortRef.current) abortRef.current.abort();
            return;
        }

        const qq = q.trim();

        // opcional: evita 1 caractere (ruído)
        if (qq.length === 1) {
            setRows([]);
            setErr("");
            return;
        }

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const t = setTimeout(async () => {
            setLoading(true);
            setErr("");

            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", "insumos_tanato_listar");
                url.searchParams.set("deposito_nome", depInsumos);
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "300");
                if (qq.length >= 2) url.searchParams.set("q", qq);

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                if (r.status === 401) throw new Error("Sessão expirada. Faça login novamente.");
                const data = await r.json().catch(() => null);

                if (!data?.ok) throw new Error(data?.msg || "Falha ao buscar insumos");
                setRows((data.rows || []) as EstoqueRow[]);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setRows([]);
                setErr(e?.message || "Falha ao buscar insumos");
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [open, depInsumos, q]);

    const selectedCount = useMemo(() => {
        return Object.values(sel).filter((x) => x?.checked && (x?.qtd ?? 0) > 0).length;
    }, [sel]);

    // ✅ monta JSON mesclando o que já existia + booleans + insumos atuais
    const buildArrumacaoJson = () => {
        // pega o json anterior para não “sumir” com campos não relacionados
        const oldRaw = (wizardData as any)?.arrumacao_json ?? null;
        const oldObj = safeParseJson(oldRaw);

        const itens = Object.entries(sel)
            .map(([pidStr, v]) => ({
                produto_id: Number(pidStr) || 0,
                qtd: Math.max(1, Math.floor(Number(v?.qtd ?? 1) || 1)),
                nome: String(v?.nome ?? "").trim(),
                codigo_barras: String(v?.codigo_barras ?? "").trim(),
                checked: !!v?.checked,
            }))
            .filter((x) => x.produto_id > 0 && x.checked && x.qtd > 0);

        // base: mantém campos antigos + atualiza booleans
        const payload: any = {
            ...(oldObj && typeof oldObj === "object" ? oldObj : {}),
            ...(arrumacao && typeof arrumacao === "object" ? arrumacao : {}),
        };

        // se tem itens -> grava bloco insumos (com aliases)
        if (itens.length > 0) {
            payload.deposito_nome = depInsumos;
            payload.deposito = depInsumos; // alias
            payload.itens = itens;
            payload.items = itens; // alias
        } else {
            // se zerou seleções, remove bloco insumos
            delete payload.deposito_nome;
            delete payload.deposito;
            delete payload.itens;
            delete payload.items;
        }

        return JSON.stringify(payload);
    };

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Arrumação do Corpo" maxWidth={720}>
            <h3 className="text-lg font-semibold">Conservação do Corpo</h3>

            {/* CHECKS */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.map((o) => (
                    <label key={o.key} className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={!!arrumacao[o.key]}
                            onChange={(e) => setArrumacao((prev) => ({ ...prev, [o.key]: e.target.checked }))}
                        />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>

            {/* INSUMOS TANATO */}
            <div className="mt-6 rounded-xl border p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-sm font-semibold">Insumos Tanatopraxia</div>
                        <div className="text-xs text-muted-foreground">
                            Selecionados aqui serão descontados automaticamente na <b>fase05</b> (início da ornamentação).
                        </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        {selectedCount > 0 ? (
                            <>
                                Selecionados: <b>{selectedCount}</b>
                            </>
                        ) : (
                            "Nenhum insumo selecionado"
                        )}
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Local dos Insumos</label>
                        <select
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={depInsumos}
                            onChange={(e) => {
                                const up = normUpper(e.target.value);
                                const next: DepInsumos = up === "ARMARIO ILDO" ? "ARMARIO ILDO" : up === "ARMARIO SANDRO" ? "ARMARIO SANDRO" : "";
                                setDepInsumos(next);
                                setErr("");
                                setRows([]);
                                // ✅ trocar depósito normalmente invalida seleção anterior
                                setSel({});
                            }}
                        >
                            <option value="">Selecione…</option>
                            <option value="ARMARIO SANDRO">ARMARIO SANDRO</option>
                            <option value="ARMARIO ILDO">ARMARIO ILDO</option>
                        </select>

                        <div className="mt-2">
                            <label className="mb-1 block text-xs font-medium text-slate-700">Buscar</label>
                            <input
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                placeholder="Digite para filtrar (opcional)"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                disabled={!depInsumos}
                            />
                            <div className="mt-1 text-[11px] text-slate-500">
                                Dica: deixe vazio para listar (o PHP já aceita q vazio).
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Itens</label>

                        {!depInsumos ? (
                            <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
                                Selecione o depósito para carregar os insumos.
                            </div>
                        ) : loading ? (
                            <div className="rounded-md border p-3 text-sm text-slate-600">Carregando…</div>
                        ) : err ? (
                            <div className="rounded-md border p-3 text-sm text-red-600">{err}</div>
                        ) : rows.length === 0 ? (
                            <div className="rounded-md border p-3 text-sm text-slate-600">
                                Nenhum insumo encontrado com saldo no depósito <b>{depInsumos}</b>.
                            </div>
                        ) : (
                            <div className="max-h-72 overflow-auto rounded-md border">
                                <div className="grid grid-cols-[1fr_92px_72px] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                                    <div>Produto</div>
                                    <div className="text-right">Estoque</div>
                                    <div className="text-right">Qtd</div>
                                </div>

                                <ul className="divide-y">
                                    {rows.map((it) => {
                                        const pid = getPidFromRow(it);
                                        if (!pid) return null;

                                        const current = sel[pid];
                                        const checked = !!current?.checked;
                                        const qtd = Math.max(1, Math.floor(Number(current?.qtd ?? 1) || 1));

                                        return (
                                            <li key={pid} className="grid grid-cols-[1fr_92px_72px] items-center gap-2 px-3 py-2">
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            const on = e.target.checked;
                                                            setSel((prev) => ({
                                                                ...prev,
                                                                [pid]: {
                                                                    checked: on,
                                                                    qtd: Math.max(1, Math.floor(Number(prev?.[pid]?.qtd ?? 1) || 1)),
                                                                    nome: String(it.nome || "").trim(),
                                                                    codigo_barras: String((it as any).codigo_barras || "").trim() || undefined,
                                                                },
                                                            }));
                                                        }}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium text-slate-900">{it.nome}</div>
                                                        <div className="truncate text-[11px] text-slate-500">
                                                            CB: <b>{String((it as any).codigo_barras || "")}</b>
                                                        </div>
                                                    </div>
                                                </label>

                                                <div className="text-right text-sm text-slate-700">
                                                    <b>{Number(it.saldo_total) || 0}</b>
                                                </div>

                                                <div className="text-right">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        className="w-full rounded-md border px-2 py-1 text-sm"
                                                        value={qtd}
                                                        disabled={!checked}
                                                        onChange={(e) => {
                                                            const nextQtd = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                                            setSel((prev) => ({
                                                                ...prev,
                                                                [pid]: {
                                                                    checked: true,
                                                                    qtd: nextQtd,
                                                                    nome: String(prev?.[pid]?.nome ?? it.nome ?? "").trim(),
                                                                    codigo_barras:
                                                                        String(prev?.[pid]?.codigo_barras ?? (it as any).codigo_barras ?? "").trim() ||
                                                                        undefined,
                                                                },
                                                            }));
                                                        }}
                                                        title="Quantidade"
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        <div className="mt-2 text-[11px] text-slate-500">
                            * Estes itens serão descontados automaticamente no estoque quando registrar <b>fase05</b>.
                        </div>
                    </div>
                </div>
            </div>

            {/* AÇÕES */}
            <div className="mt-5 flex justify-end gap-2">
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                    Cancelar
                </button>

                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    onClick={() => {
                        const json = buildArrumacaoJson();

                        setWizardData((d: Registro) => ({
                            ...d,
                            arrumacao, // mantém booleans no objeto (compatibilidade)
                            arrumacao_json: json, // ✅ fonte da verdade (booleans + insumos)
                        }));

                        setOpen(false);
                    }}
                >
                    Salvar Arrumação
                </button>
            </div>
        </Modal>
    );
}
