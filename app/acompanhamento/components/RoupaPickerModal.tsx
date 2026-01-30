"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { API as API_ROOT } from "./constants";
import { jsonWith401 } from "./helpers";

type DepRoupa = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA" | "";
type DepCordao = "ARMARIO SANDRO" | "ARMARIO ILDO" | "FUNERARIA" | "";

type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

export type RoupaPickResult = {
    // ROUPA
    roupa_texto: string;
    roupa_deposito_nome: DepRoupa;
    roupa_produto_id: number;
    roupa_codigo_barras: string;

    // CORDÃO
    cordao_texto: string;
    cordao_deposito_nome: DepCordao;
    cordao_produto_id: number;
    cordao_codigo_barras: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    disabled?: boolean;
    initial?: {
        roupa_deposito_nome?: string;
        roupa?: string;
        roupa_produto_id?: number;
        roupa_codigo_barras?: string;

        cordao_deposito_nome?: string;
        cordao?: string;
        cordao_produto_id?: number;
        cordao_codigo_barras?: string;
    };
    onConfirm: (result: RoupaPickResult) => void;
};

const ESTOQUE_API = `${API_ROOT}/api/php/materiais_gerais.php`;

// cordão fixo (por pedido)
const CORDAO_FIXO_NOME = "CORDAO SAO FRANCISCO";
const CORDAO_FIXO_CB = "6901";

function normUpper(v: any) {
    return String(v ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function normNoAccLower(v: any) {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isRoupaPropria(v: any) {
    const s = normNoAccLower(v);
    return s === "roupa propria" || s === "roupa própria";
}

function getPidFromRow(it: EstoqueRow): number {
    return Number((it as any).id ?? (it as any).produto_id ?? (it as any).est_produto_id ?? 0) || 0;
}

function normalizeDep(v: any): DepRoupa {
    const s = normUpper(v);
    if (s === "ARMARIO ILDO") return "ARMARIO ILDO";
    if (s === "FUNERARIA") return "FUNERARIA";
    if (s === "ARMARIO SANDRO") return "ARMARIO SANDRO";
    return "";
}

export default function RoupaPickerModal({
    open,
    onClose,
    disabled,
    initial,
    onConfirm,
}: Props) {
    // -----------------------------
    // ROUPA
    // -----------------------------
    const [depRoupa, setDepRoupa] = useState<DepRoupa>("ARMARIO SANDRO");
    const [qRoupa, setQRoupa] = useState("");
    const [loadingRoupa, setLoadingRoupa] = useState(false);
    const [errRoupa, setErrRoupa] = useState("");
    const [rowsRoupa, setRowsRoupa] = useState<EstoqueRow[]>([]);
    const [selRoupa, setSelRoupa] = useState<{
        kind: "none" | "propria" | "estoque";
        nome: string;
        produto_id: number;
        codigo_barras: string;
    }>({ kind: "none", nome: "", produto_id: 0, codigo_barras: "" });

    // -----------------------------
    // CORDÃO (fixo)
    // -----------------------------
    const [cordaoOn, setCordaoOn] = useState(false);
    const [depCordao, setDepCordao] = useState<DepCordao>("ARMARIO SANDRO");

    // validação do modal
    const [uiErr, setUiErr] = useState<string>("");

    const abortRef = useRef<AbortController | null>(null);

    // -----------------------------
    // Sync initial ao abrir
    // -----------------------------
    useEffect(() => {
        if (!open) return;

        setUiErr("");
        setErrRoupa("");
        setRowsRoupa([]);
        setQRoupa("");

        const depR = normalizeDep(initial?.roupa_deposito_nome ?? "ARMARIO SANDRO") || "ARMARIO SANDRO";
        setDepRoupa(depR);

        const roupaTxt = String(initial?.roupa ?? "").trim();
        const roupaPid = Number(initial?.roupa_produto_id ?? 0) || 0;
        const roupaCb = String(initial?.roupa_codigo_barras ?? "").trim();

        if (roupaTxt && isRoupaPropria(roupaTxt)) {
            setSelRoupa({ kind: "propria", nome: "ROUPA PRÓPRIA", produto_id: 0, codigo_barras: "" });
        } else if (roupaTxt && roupaPid > 0) {
            setSelRoupa({
                kind: "estoque",
                nome: roupaTxt,
                produto_id: roupaPid,
                codigo_barras: roupaCb,
            });
        } else if (roupaTxt) {
            // texto sem pid -> trata como "none" (força usuário escolher de novo)
            setSelRoupa({ kind: "none", nome: "", produto_id: 0, codigo_barras: "" });
        } else {
            setSelRoupa({ kind: "none", nome: "", produto_id: 0, codigo_barras: "" });
        }

        // cordão
        const cTxt = String(initial?.cordao ?? "").trim();
        const cCb = String(initial?.cordao_codigo_barras ?? "").trim();
        const cDep = normalizeDep(initial?.cordao_deposito_nome ?? "ARMARIO SANDRO") || "ARMARIO SANDRO";

        const cordaoSelecionado =
            (!!cTxt && normUpper(cTxt) === CORDAO_FIXO_NOME) || (cCb && cCb === CORDAO_FIXO_CB);

        setCordaoOn(!!cordaoSelecionado);
        setDepCordao(cDep);
    }, [open, initial]);

    // -----------------------------
    // Busca roupas (lista)
    // action=roupas_listar (novo no PHP)
    // - aceita deposito_nome
    // - aceita q (opcional)
    // - somente_com_saldo=1
    // - limit=300
    // -----------------------------
    useEffect(() => {
        if (!open) return;

        // abort anterior
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const dep = depRoupa;
        if (!dep) {
            setRowsRoupa([]);
            setErrRoupa("");
            return;
        }

        const qq = qRoupa.trim();
        if (qq.length === 1) {
            // evita ruído
            setRowsRoupa([]);
            setErrRoupa("");
            return;
        }

        const t = setTimeout(async () => {
            setLoadingRoupa(true);
            setErrRoupa("");

            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", "roupas_listar");
                url.searchParams.set("deposito_nome", dep);
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "300");
                if (qq.length >= 2) url.searchParams.set("q", qq);

                const data = await jsonWith401(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                if (!data?.ok) throw new Error(data?.msg || "Falha ao listar roupas");
                setRowsRoupa((data.rows || []) as EstoqueRow[]);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setRowsRoupa([]);
                setErrRoupa(e?.message || "Falha ao listar roupas");
            } finally {
                setLoadingRoupa(false);
            }
        }, 220);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [open, depRoupa, qRoupa]);

    const roupaResumo = useMemo(() => {
        if (selRoupa.kind === "propria") return "ROUPA PRÓPRIA";
        if (selRoupa.kind === "estoque") return `${selRoupa.nome} (CB: ${selRoupa.codigo_barras || "-"})`;
        return "(nenhuma)";
    }, [selRoupa]);

    const cordaoResumo = useMemo(() => {
        if (!cordaoOn) return "(nenhum)";
        return `${CORDAO_FIXO_NOME} (CB: ${CORDAO_FIXO_CB}) — ${depCordao || "sem depósito"}`;
    }, [cordaoOn, depCordao]);

    const limparRoupa = () => {
        setSelRoupa({ kind: "none", nome: "", produto_id: 0, codigo_barras: "" });
        setUiErr("");
    };

    const escolherRoupaPropria = () => {
        setSelRoupa({ kind: "propria", nome: "ROUPA PRÓPRIA", produto_id: 0, codigo_barras: "" });
        setUiErr("");
    };

    const escolherRoupaEstoque = (it: EstoqueRow) => {
        const pid = getPidFromRow(it);
        if (!pid) {
            setUiErr("Item do estoque veio sem produto_id. Contate o suporte.");
            return;
        }
        setSelRoupa({
            kind: "estoque",
            nome: String(it.nome || "").trim(),
            produto_id: pid,
            codigo_barras: String((it as any).codigo_barras || "").trim(),
        });
        setUiErr("");
    };

    const validarAntesSalvar = (): boolean => {
        setUiErr("");

        // se obrigatoriedade for tratada no Wizard, aqui só garante consistência
        if (selRoupa.kind === "estoque") {
            if (!depRoupa) {
                setUiErr("Selecione o depósito da roupa.");
                return false;
            }
            if (selRoupa.produto_id <= 0) {
                setUiErr("Roupa inválida: selecione um item do estoque.");
                return false;
            }
        }

        if (cordaoOn) {
            if (!depCordao) {
                setUiErr("Selecione o depósito do cordão.");
                return false;
            }
            // produto_id pode ficar 0 (vamos resolver no backend depois),
            // mas o CB é fixo e suficiente para identificar.
        }

        return true;
    };

    const confirmar = () => {
        if (!validarAntesSalvar()) return;

        const roupaIsPropria = selRoupa.kind === "propria";

        const result: RoupaPickResult = {
            // ROUPA
            roupa_texto:
                selRoupa.kind === "propria"
                    ? "ROUPA PRÓPRIA"
                    : selRoupa.kind === "estoque"
                        ? selRoupa.nome
                        : "",
            roupa_deposito_nome:
                roupaIsPropria || selRoupa.kind !== "estoque" ? "" : (depRoupa as DepRoupa),
            roupa_produto_id: roupaIsPropria ? 0 : selRoupa.kind === "estoque" ? selRoupa.produto_id : 0,
            roupa_codigo_barras: roupaIsPropria ? "" : selRoupa.kind === "estoque" ? selRoupa.codigo_barras : "",

            // CORDÃO
            cordao_texto: cordaoOn ? CORDAO_FIXO_NOME : "",
            cordao_deposito_nome: cordaoOn ? (depCordao as DepCordao) : "",
            // pode ficar 0 (vamos resolver por CB=6901 no backend)
            cordao_produto_id: cordaoOn ? 0 : 0,
            cordao_codigo_barras: cordaoOn ? CORDAO_FIXO_CB : "",
        };

        onConfirm(result);
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Selecionar Roupa e Cordão" maxWidth={820}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Selecionar Roupa e Cordão</h3>
                    <div className="mt-1 text-xs text-muted-foreground">
                        Seleção guiada para evitar digitação. A baixa do estoque acontece automaticamente na <b>fase05</b>.
                    </div>
                </div>

                <button
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    onClick={onClose}
                    disabled={!!disabled}
                    type="button"
                >
                    Fechar
                </button>
            </div>

            {/* RESUMO */}
            <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Resumo atual</div>
                <div className="mt-1 text-sm text-slate-800">
                    <div>
                        <b>Roupa:</b> {roupaResumo}
                    </div>
                    <div className="mt-1">
                        <b>Cordão:</b> {cordaoResumo}
                    </div>
                </div>
            </div>

            {uiErr ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {uiErr}
                </div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* =========================
            ROUPA
           ========================= */}
                <div className="rounded-xl border p-4">
                    <div className="flex items-end justify-between gap-2">
                        <div>
                            <div className="text-sm font-semibold">Roupa</div>
                            <div className="text-[11px] text-slate-500">
                                Escolha uma roupa do estoque ou selecione <b>ROUPA PRÓPRIA</b>.
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                onClick={escolherRoupaPropria}
                                disabled={!!disabled}
                            >
                                ROUPA PRÓPRIA
                            </button>
                            <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                onClick={limparRoupa}
                                disabled={!!disabled}
                                title="Limpar seleção"
                            >
                                Limpar
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">Depósito</label>
                            <select
                                className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                value={depRoupa}
                                onChange={(e) => {
                                    const next = normalizeDep(e.target.value) || "ARMARIO SANDRO";
                                    setDepRoupa(next);
                                    setErrRoupa("");
                                    setRowsRoupa([]);
                                }}
                                disabled={!!disabled}
                            >
                                <option value="ARMARIO SANDRO">ARMARIO SANDRO</option>
                                <option value="ARMARIO ILDO">ARMARIO ILDO</option>
                                <option value="FUNERARIA">FUNERARIA</option>
                            </select>

                            <div className="mt-3">
                                <label className="mb-1 block text-xs font-medium text-slate-700">Buscar</label>
                                <input
                                    className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                                    placeholder="Filtrar por nome (opcional)"
                                    value={qRoupa}
                                    onChange={(e) => setQRoupa(e.target.value)}
                                    disabled={!!disabled}
                                />
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Dica: deixe vazio para listar todas (depende do PHP aceitar q vazio).
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">Lista</label>

                            {loadingRoupa ? (
                                <div className="rounded-md border p-3 text-sm text-slate-600">Carregando…</div>
                            ) : errRoupa ? (
                                <div className="rounded-md border p-3 text-sm text-red-600">{errRoupa}</div>
                            ) : rowsRoupa.length === 0 ? (
                                <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
                                    Nenhuma roupa encontrada com saldo em <b>{depRoupa}</b>.
                                </div>
                            ) : (
                                <div className="max-h-80 overflow-auto rounded-md border">
                                    <div className="grid grid-cols-[1fr_88px] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                                        <div>Produto</div>
                                        <div className="text-right">Estoque</div>
                                    </div>

                                    <ul className="divide-y">
                                        {rowsRoupa.map((it) => {
                                            const pid = getPidFromRow(it);
                                            const selected = selRoupa.kind === "estoque" && selRoupa.produto_id === pid;

                                            return (
                                                <li key={pid || it.nome}>
                                                    <button
                                                        type="button"
                                                        className={`w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60 ${selected ? "bg-blue-50" : ""
                                                            }`}
                                                        disabled={!!disabled}
                                                        onClick={() => escolherRoupaEstoque(it)}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-medium text-slate-900">
                                                                    {it.nome}
                                                                </div>
                                                                <div className="truncate text-[11px] text-slate-500">
                                                                    CB: <b>{String((it as any).codigo_barras || "")}</b>
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-sm text-slate-700">
                                                                <b>{Number(it.saldo_total) || 0}</b>
                                                            </div>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            <div className="mt-2 text-[11px] text-slate-500">
                                * Ao confirmar, a roupa escolhida será salva no atendimento (e baixada na fase05).
                            </div>
                        </div>
                    </div>
                </div>

                {/* =========================
            CORDÃO (fixo)
           ========================= */}
                <div className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-sm font-semibold">Cordão</div>
                            <div className="text-[11px] text-slate-500">
                                Item fixo: <b>{CORDAO_FIXO_NOME}</b> (CB <b>{CORDAO_FIXO_CB}</b>).
                            </div>
                        </div>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={cordaoOn}
                                onChange={(e) => {
                                    setCordaoOn(e.target.checked);
                                    setUiErr("");
                                }}
                                disabled={!!disabled}
                            />
                            Usar cordão
                        </label>
                    </div>

                    <div className="mt-4">
                        <label className="mb-1 block text-xs font-medium text-slate-700">Depósito do Cordão</label>
                        <select
                            className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                            value={depCordao}
                            onChange={(e) => {
                                const next = normalizeDep(e.target.value) || "ARMARIO SANDRO";
                                setDepCordao(next);
                                setUiErr("");
                            }}
                            disabled={!!disabled || !cordaoOn}
                        >
                            <option value="ARMARIO SANDRO">ARMARIO SANDRO</option>
                            <option value="ARMARIO ILDO">ARMARIO ILDO</option>
                            <option value="FUNERARIA">FUNERARIA</option>
                        </select>

                        <div className="mt-2 rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
                            <div>
                                <b>Produto:</b> {CORDAO_FIXO_NOME}
                            </div>
                            <div className="mt-1">
                                <b>Código de barras:</b> {CORDAO_FIXO_CB}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                                * A baixa será feita na fase05 junto com os demais itens.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AÇÕES */}
            <div className="mt-5 flex justify-end gap-2">
                <button
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                    onClick={onClose}
                    disabled={!!disabled}
                    type="button"
                >
                    Cancelar
                </button>

                <button
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                    onClick={confirmar}
                    disabled={!!disabled}
                    type="button"
                >
                    Confirmar seleção
                </button>
            </div>
        </Modal>
    );
}
