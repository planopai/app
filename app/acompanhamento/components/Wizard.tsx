"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { Registro } from "./types";
import { API as API_ROOT } from "./constants";

type Step = {
    label: string;
    id: string;
    type: "input" | "select" | "textarea" | "date" | "time" | "datalist" | "custom" | "async_urna";
    options?: string[];
    placeholder?: string;
    datalist?: string[];
};

type UrnaRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;

    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

const ESTOQUE_API = `${API_ROOT}/api/php/materiais_gerais.php`;

/* =========================
   ✅ COMBOBOX URNA (async) + DEPÓSITO
   ✅ Grava meta da urna em inputs hidden:
      - wizard-urna_deposito_nome
      - wizard-urna_produto_id
      - wizard-urna_codigo_barras

   ✅ Robustez:
   - seleciona no onPointerDown
   - Enter seleciona
   - blur com match exato auto-seleciona
   - 🔥 atualiza TODOS inputs com mesmo id (protege contra ID duplicado)
========================= */
function UrnaCombobox({
    required,
    placeholder,
    initialValue,
    disabled,
    initialDepositoNome,
    initialProdutoId,
    initialCodigoBarras,
    errorText,
    onBlurValidate,
}: {
    required: boolean;
    placeholder?: string;
    initialValue: string;
    disabled?: boolean;

    initialDepositoNome?: string;
    initialProdutoId?: number;
    initialCodigoBarras?: string;

    errorText?: string;
    onBlurValidate?: () => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizeDep = (v: any): "MEMORIAL" | "FUNERARIA" => {
        const s = String(v || "").trim().toUpperCase();
        return s === "FUNERARIA" ? "FUNERARIA" : "MEMORIAL";
    };

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState(initialValue || "");
    const [dep, setDep] = useState<"MEMORIAL" | "FUNERARIA">(normalizeDep(initialDepositoNome));
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState<UrnaRow[]>([]);

    // hidden refs
    const depHiddenRef = useRef<HTMLInputElement>(null);
    const pidHiddenRef = useRef<HTMLInputElement>(null);
    const cbHiddenRef = useRef<HTMLInputElement>(null);

    const didMountDepRef = useRef(false);

    const getPidFromRow = (it: UrnaRow): number =>
        Number((it as any).id ?? (it as any).produto_id ?? (it as any).est_produto_id ?? 0) || 0;

    // 🔥 atualiza todos os inputs que tiverem o mesmo id (protege duplicidade)
    const setAllById = (id: string, value: string) => {
        try {
            document.querySelectorAll(`input[id="${id}"]`).forEach((el) => {
                (el as HTMLInputElement).value = value;
            });
        } catch {
            // ignore
        }
    };

    function setHiddenMeta(next: { deposito_nome?: string; produto_id?: number; codigo_barras?: string }) {
        const depNome = normalizeDep(next.deposito_nome || dep);
        const pid = Number(next.produto_id || 0) || 0;
        const cb = String(next.codigo_barras || "").trim();

        // refs
        if (depHiddenRef.current) depHiddenRef.current.value = depNome;
        if (pidHiddenRef.current) pidHiddenRef.current.value = pid > 0 ? String(pid) : "0";
        if (cbHiddenRef.current) cbHiddenRef.current.value = cb;

        // 🔥 DOM (todos)
        setAllById("wizard-urna_deposito_nome", depNome);
        setAllById("wizard-urna_produto_id", pid > 0 ? String(pid) : "0");
        setAllById("wizard-urna_codigo_barras", cb);
    }

    function clearProdutoMetaOnly() {
        // refs
        if (pidHiddenRef.current) pidHiddenRef.current.value = "0";
        if (cbHiddenRef.current) cbHiddenRef.current.value = "";

        // 🔥 DOM (todos)
        setAllById("wizard-urna_produto_id", "0");
        setAllById("wizard-urna_codigo_barras", "");
    }

    const applySelection = (it: UrnaRow) => {
        const pid = getPidFromRow(it);
        if (!pid || pid <= 0) {
            setErr("Esta urna veio sem produto_id. Contate o suporte.");
            clearProdutoMetaOnly();
            onBlurValidate?.();
            return;
        }

        setQ(it.nome);

        setHiddenMeta({
            deposito_nome: dep,
            produto_id: pid,
            codigo_barras: (it as any).codigo_barras || "",
        });

        setErr("");
        setOpen(false);

        // valida de novo já com pid preenchido
        onBlurValidate?.();

        requestAnimationFrame(() => inputRef.current?.blur());
    };

    // sincroniza quando abre/edita registro
    useEffect(() => {
        const depInit = normalizeDep(initialDepositoNome);
        const pidInit = Number(initialProdutoId || 0) || 0;
        const cbInit = String(initialCodigoBarras || "").trim();

        setDep(depInit);
        setQ(initialValue || "");

        setRows([]);
        setErr("");
        setOpen(false);

        setHiddenMeta({ deposito_nome: depInit, produto_id: pidInit, codigo_barras: cbInit });

        didMountDepRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValue, initialDepositoNome, initialProdutoId, initialCodigoBarras]);

    // ao mudar depósito
    useEffect(() => {
        setHiddenMeta({ deposito_nome: dep });

        if (!didMountDepRef.current) {
            didMountDepRef.current = true;
            return;
        }

        clearProdutoMetaOnly();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dep]);

    // fecha ao clicar fora
    useEffect(() => {
        const onDoc = (e: PointerEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDoc, true);
        return () => document.removeEventListener("pointerdown", onDoc, true);
    }, []);

    // busca async
    useEffect(() => {
        if (!open) return;

        const qq = q.trim();
        setErr("");

        if (qq.length < 2) {
            setRows([]);
            return;
        }

        const ac = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", "urnas_buscar");
                url.searchParams.set("q", qq);
                url.searchParams.set("somente_com_saldo", "1");
                url.searchParams.set("limit", "30");
                url.searchParams.set("deposito_nome", dep);

                const r = await fetch(url.toString(), {
                    method: "GET",
                    cache: "no-store",
                    credentials: "include",
                    signal: ac.signal,
                });

                const j = await r.json().catch(() => null);
                if (!j?.ok) throw new Error(j?.msg || "Falha ao buscar urnas");

                setRows((j.rows || []) as UrnaRow[]);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setErr(e?.message || "Erro na busca");
                setRows([]);
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(t);
            ac.abort();
        };
    }, [q, open, dep]);

    const autoPickIfExactMatch = () => {
        const pidNow = Number((document.getElementById("wizard-urna_produto_id") as HTMLInputElement | null)?.value || 0) || 0;
        if (pidNow > 0) return;

        const txt = q.trim().toLowerCase();
        if (txt.length < 2) return;
        if (!rows?.length) return;

        const match = rows.find((it) => String(it.nome || "").trim().toLowerCase() === txt);
        if (match) applySelection(match);
    };

    return (
        <div ref={wrapRef}>
            {/* hidden metas */}
            <input ref={depHiddenRef} id="wizard-urna_deposito_nome" type="hidden" defaultValue={dep} />
            <input ref={pidHiddenRef} id="wizard-urna_produto_id" type="hidden" defaultValue={String(Number(initialProdutoId || 0) || 0)} />
            <input ref={cbHiddenRef} id="wizard-urna_codigo_barras" type="hidden" defaultValue={String(initialCodigoBarras || "")} />

            <div className="relative">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr] sm:gap-2">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">Local da Urna</label>
                        <select
                            className="w-full rounded-md border px-2 py-2 text-sm disabled:opacity-60"
                            value={dep}
                            onChange={(e) => {
                                const next = normalizeDep(e.target.value);
                                setDep(next);
                                setRows([]);
                                setErr("");
                                setOpen(true);
                            }}
                            disabled={disabled}
                            title="Local da Urna"
                        >
                            <option value="MEMORIAL">MEMORIAL</option>
                            <option value="FUNERARIA">FUNERARIA</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                            Urna {required && <span className="text-red-600">*</span>}
                        </label>

                        <input
                            ref={inputRef}
                            id="wizard-urna"
                            type="text"
                            placeholder={placeholder || "Digite para buscar..."}
                            value={q}
                            onChange={(e) => {
                                setQ(e.target.value);
                                setOpen(true);
                                clearProdutoMetaOnly();
                                setHiddenMeta({ deposito_nome: dep });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (!rows?.length) return;
                                    const txt = q.trim().toLowerCase();
                                    const exact = rows.find((it) => String(it.nome || "").trim().toLowerCase() === txt);
                                    applySelection(exact || rows[0]);
                                }
                            }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => {
                                autoPickIfExactMatch();
                                onBlurValidate?.();
                            }}
                            className={`w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60 ${errorText ? "border-red-500" : ""}`}
                            disabled={disabled}
                            autoComplete="off"
                            title="Urna"
                        />

                        {errorText ? <div className="mt-1 text-xs text-red-600">{errorText}</div> : null}
                    </div>
                </div>

                {open ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
                        {loading ? (
                            <div className="p-3 text-sm text-slate-600">Buscando...</div>
                        ) : err ? (
                            <div className="p-3 text-sm text-red-600">{err}</div>
                        ) : q.trim().length < 2 ? (
                            <div className="p-3 text-sm text-slate-600">Digite pelo menos 2 letras…</div>
                        ) : rows.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600">Nenhuma urna encontrada no estoque ({dep}).</div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {rows.map((it) => {
                                    const pidKey = getPidFromRow(it);
                                    return (
                                        <li key={pidKey || it.nome}>
                                            <button
                                                type="button"
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    applySelection(it);
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate font-medium text-slate-900">{it.nome}</span>
                                                    <span className="shrink-0 text-xs text-slate-600">
                                                        estoque: <b>{Number(it.saldo_total) || 0}</b>
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-slate-600">
                                                    CB: <b>{(it as any).codigo_barras || ""}</b>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ) : null}
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
                Dica: escolha o depósito e digite parte do nome (ou código). Ao selecionar, a lista fecha.
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
                Obs: a baixa de estoque acontece automaticamente ao registrar <b>Ínicio da Ornamentação (fase05)</b>.
            </p>
        </div>
    );
}

export default function Wizard(props: any) {
    // ⚠️ Aqui fica igual ao seu Wizard atual (não mexi na lógica geral)
    // Só substituí o UrnaCombobox acima.
    // Para não te devolver um arquivo enorme duplicado, você mantém o resto do seu Wizard como já está.
    //
    // ✅ Importante: mantenha a renderização do step "urna" usando <UrnaCombobox ... />
    return <>{/* MANTENHA O SEU WIZARD ORIGINAL AQUI, SEM ALTERAR */}</>;
}
