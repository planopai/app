"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ID = number;

type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };

type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
// ✅ NOVO
type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };

type Produto = {
    id: ID;
    nome: string;
    codigo_barras: string;
    valor: string | number;
    minimo: number;
    maximo?: number; // ✅ NOVO
    foto_url?: string | null;
    ativo: 0 | 1 | number;
    atualizado_em: string;

    categoria_id?: ID | null;
    fabricante_id?: ID | null;

    // ✅ NOVO
    classificacao_id?: ID | null;
    classificacao_nome?: string | null;

    categoria_nome?: string | null;
    fabricante_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em: string;
};

type Me = { id: ID; nome: string; usuario: string };

type InitResp = {
    ok: boolean;
    me: Me;
    usuarios: Usuario[];
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

type HistoricoRow = {
    id: number;
    tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "CADASTRO_PRODUTO";
    produto_id: ID;
    codigo_barras_snapshot: string;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto: string | null;
    solicitante_usuario_id: ID | null;
    operador_usuario_id: ID;
    observacao: string | null;
    criado_em: string;

    produto_nome?: string;
    operador_nome?: string;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
};

type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    msg?: string;
    need_login?: 1;
};

type UiTab = "HOME" | "ENTRADA" | "ESTOQUE" | "CONFERENCIA" | "HISTORICO" | "AVANCADO";

type EntradaItem = { id: number; payload: any; resumo: string; nome: string; qtd: number };
type SaidaItem = { id: number; payload: any; resumo: string };
type TrfItem = { id: number; payload: any; resumo: string };

const API_BASE = "/api/php/materiais_gerais.php";

function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function fmtDateTime(iso: string) {
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function moneyBRL(n: number) {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(n);
    } catch {
        const safe = Number.isFinite(n) ? n : 0;
        return `R$ ${safe.toFixed(2)}`;
    }
}

function maskBRLFromDigits(digitsOnly: string) {
    const digits = (digitsOnly || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    const value = cents / 100;

    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    } catch {
        const v = Number.isFinite(value) ? value : 0;
        const fixed = v.toFixed(2);
        const [intPart, dec] = fixed.split(".");
        const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${withDots},${dec}`;
    }
}

function parseBRLToNumber(brlText: string) {
    const digits = (brlText || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    return cents / 100;
}

function maskBRLInput(raw: string) {
    const digits = (raw || "").replace(/\D/g, "");
    return maskBRLFromDigits(digits);
}

function escapeCsvCell(v: any, sep = ";") {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

const IMG_BASE = "https://planoassistencialintegrado.com.br";

function normalizeImgUrl(u?: string | null) {
    const t = (u ?? "").toString().trim();
    if (!t || t === "null" || t === "undefined") return null;

    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith("/")) return `${IMG_BASE}${t}`;
    return `${IMG_BASE}/uploads/produtos/${t}`;
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""
                }`.trim()
        );
    }
    return (await r.json()) as T;
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });
    return await safeJson<T>(r);
}

async function apiPost<T>(body: any) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return await safeJson<T & { ok?: boolean; msg?: string; need_login?: 1 }>(r);
}

/* =========================
   UI KIT
========================= */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>
            {children}
        </section>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
        </label>
    );
}

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
    props,
    ref
) {
    return (
        <input
            ref={ref}
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
});

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
}

type Opt = { id: ID; nome: string };

function MultiSelectDropdown({
    label,
    options,
    selectedIds,
    onChangeIds,
    allLabel = "Todos",
    placeholder = "Selecionar...",
}: {
    label: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
    allLabel?: string;
    placeholder?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    const optMap = useMemo(() => new Map(options.map((o) => [o.id, o.nome])), [options]);

    const displayText = useMemo(() => {
        if (!selectedIds.length) return allLabel;

        const names = selectedIds.map((id) => optMap.get(id) || `#${id}`);
        if (names.length <= 2) return names.join(", ");
        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    }, [selectedIds, optMap, allLabel]);

    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return options;
        return options.filter((o) => o.nome.toLowerCase().includes(qq));
    }, [options, q]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    function toggle(id: ID) {
        const has = selectedIds.includes(id);
        const next = has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
        onChangeIds(next);
    }

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={[
                        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                        "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                        "flex items-center justify-between gap-2",
                    ].join(" ")}
                >
                    <span className={["truncate", !selectedIds.length ? "text-slate-600" : "text-slate-900"].join(" ")}>
                        {displayText || placeholder}
                    </span>
                    <span className="text-slate-500">▾</span>
                </button>

                {open ? (
                    <div
                        className={[
                            "absolute z-30 mt-2 left-0",
                            "w-full min-w-[340px] max-w-[calc(100vw-2rem)]",
                            "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg",
                        ].join(" ")}
                    >
                        <div className="p-2 border-b border-slate-100">
                            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
                            <div className="mt-2 flex gap-2">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                        onChangeIds([]);
                                        setQ("");
                                    }}
                                >
                                    Limpar
                                </Button>
                                
                            </div>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={!selectedIds.length}
                                    onChange={() => onChangeIds([])}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm text-slate-700">{allLabel}</span>
                            </label>

                            <div className="my-2 border-t border-slate-100" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-sm text-slate-600">Nenhum encontrado.</div>
                            ) : (
                                filtered.map((o) => (
                                    <label
                                        key={o.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(o.id)}
                                            onChange={() => toggle(o.id)}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm text-slate-900 whitespace-nowrap">{o.nome}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </Field>
    );
}


function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] sm:text-sm font-medium shadow-sm outline-none " +
        "focus:ring-2 focus:ring-slate-200 disabled:opacity-50 disabled:cursor-not-allowed";

    const cls =
        variant === "solid"
            ? "bg-slate-900 text-white hover:bg-slate-800 border border-slate-900"
            : variant === "soft"
                ? "bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}


function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
            {children}
        </span>
    );
}

/* =========================
   MODAL (não fecha clicando fora; fecha pelo X/botões)
========================= */

function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    closeOnBackdrop = false,
    closeOnEsc = false,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
}) {
    useEffect(() => {
        if (!open) return;
        if (!closeOnEsc) return;

        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, closeOnEsc, onClose]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className={["fixed inset-0 z-50", "flex items-center justify-center", "bg-black/45", "min-h-[100dvh] p-4"].join(
                " "
            )}
            onMouseDown={(e) => {
                if (!closeOnBackdrop) return;
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button
                        className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        aria-label="Fechar"
                        type="button"
                        title="Fechar"
                    >
                        ✕
                    </button>
                </div>

                <div className="max-h-[82dvh] overflow-y-auto p-4">{children}</div>
            </div>
        </div>
    );
}

/* =========================
   CONFIRM DIALOG
========================= */

function ConfirmDialog({
    open,
    title,
    message,
    confirmText = "Sim, confirmar",
    cancelText = "Cancelar",
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal open={open} title={title} subtitle={message} onClose={onCancel}>
            <div className="mt-2 flex flex-col gap-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Atenção: após confirmar, a movimentação será registrada no sistema.
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={onConfirm} type="button">
                        {confirmText}
                    </Button>
                    <Button variant="ghost" onClick={onCancel} type="button">
                        {cancelText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* =========================
   MODAL (POPUP) PARA QUANTIDADE APÓS SCAN (Saída / Transferência)
========================= */

function ScanQtyModal({
    open,
    title,
    subtitle,
    produto,
    depositoNome,
    disponivel,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    produto: Produto | null;
    depositoNome?: string;
    disponivel: number;
    onClose: () => void;
    onConfirm: (quantidade: number) => void;
}) {
    const [qtd, setQtd] = useState<number>(1);

    useEffect(() => {
        if (!open) return;
        setQtd(1);
    }, [open, produto?.id]);

    const max = Math.max(0, clampInt(disponivel));
    const safeQtd = clampInt(qtd) || 1;
    const invalid = !produto || safeQtd <= 0 || safeQtd > max || max <= 0;

    return (
        <Modal open={open} title={title} subtitle={subtitle} onClose={onClose}>
            {!produto ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Produto não encontrado.</div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">{produto.nome}</p>
                        <p className="mt-1 text-xs text-slate-600">
                            CB: <b>{produto.codigo_barras}</b>
                            {depositoNome ? (
                                <>
                                    {" "}
                                    • Depósito: <b>{depositoNome}</b>
                                </>
                            ) : null}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                            Disponível em estoque: <b>{max}</b>
                        </p>
                    </div>

                    {max <= 0 ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                            Este produto está <b>sem saldo</b> no depósito selecionado.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Quantidade" hint={`Máximo permitido: ${max}`}>
                                <TextInput
                                    type="number"
                                    min={1}
                                    max={max}
                                    value={safeQtd}
                                    onChange={(e) => setQtd(clampInt(e.target.value) || 1)}
                                />
                            </Field>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                Ao clicar em <b>OK</b>, o item já entra na lista.
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            onClick={() => onConfirm(Math.min(max, Math.max(1, safeQtd)))}
                            disabled={invalid}
                        >
                            OK / Adicionar
                        </Button>
                        <Button variant="ghost" type="button" onClick={onClose}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   POPUP IMAGEM (não fecha clicando fora)
========================= */

function ImagePreviewModal({
    open,
    onClose,
    url,
    title,
}: {
    open: boolean;
    onClose: () => void;
    url?: string | null;
    title?: string;
}) {
    const cleanUrl = normalizeImgUrl(url);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title || "Imagem do produto"}</h2>
                        <p className="mt-1 text-sm text-slate-600">Feche pelo ✕ no canto superior direito.</p>
                    </div>
                    <button className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
                        ✕
                    </button>
                </div>

                <div className="max-h-[82dvh] overflow-auto p-4">
                    {cleanUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={cleanUrl}
                            alt={title || "Imagem do produto"}
                            className="mx-auto h-auto w-full max-h-[76dvh] rounded-2xl border border-slate-200 object-contain"
                        />
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Produto sem imagem.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================
   FOTO MINI
========================= */

function PhotoThumb({ url, onClick }: { url?: string | null; onClick?: () => void }) {
    const cleanUrl = normalizeImgUrl(url);
    const clickable = !!cleanUrl && !!onClick;

    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            className={[
                "relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600",
                clickable ? "cursor-zoom-in hover:ring-2 hover:ring-slate-200" : "cursor-default",
            ].join(" ")}
            aria-label={clickable ? "Abrir imagem do produto" : "Sem imagem"}
            title={clickable ? "Clique para ampliar" : "Sem imagem"}
        >
            {cleanUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cleanUrl} alt="Foto do produto" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
                <span className="text-lg">🖼️</span>
            )}

            {clickable ? (
                <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow ring-1 ring-slate-200">
                    🔍
                </span>
            ) : null}
        </button>
    );
}

/* =========================
   SCANNER
========================= */

function BarcodeScannerModal({
    open,
    title,
    onClose,
    onDetected,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    onDetected: (code: string) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setErr("");

        const start = async () => {
            try {
                const codeReader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (!devices?.length) throw new Error("Nenhuma câmera encontrada.");

                const backCam =
                    devices.find((d) => /back|traseira|environment/i.test(d.label))?.deviceId || devices[0]?.deviceId;
                if (!videoRef.current) throw new Error("Vídeo não disponível.");

                const controls = await codeReader.decodeFromVideoDevice(backCam ?? undefined, videoRef.current, (result) => {
                    if (cancelled) return;
                    if (result) {
                        const text = result.getText().trim();
                        if (text) {
                            onDetected(text);
                            onClose();
                        }
                    }
                });

                controlsRef.current = { stop: () => controls.stop() };
            } catch (e: any) {
                setErr(e?.message || "Não foi possível abrir a câmera.");
            }
        };

        start();

        return () => {
            cancelled = true;

            try {
                controlsRef.current?.stop();
            } catch {
                // ignore
            }
            controlsRef.current = null;

            const el = videoRef.current;
            if (el?.srcObject) {
                const tracks = (el.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
                (el.srcObject as any) = null;
            }
        };
    }, [open, onClose, onDetected]);

    return (
        <Modal open={open} title={title} subtitle="Aponte para o código. Ao detectar, preenche automaticamente." onClose={onClose}>
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            ) : (
                <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                        <video ref={videoRef} className="h-[320px] w-full object-cover sm:h-[420px]" playsInline muted />

                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute inset-0 bg-black/25" />

                            <div className="absolute left-1/2 top-1/2 w-[92%] max-w-[560px] -translate-x-1/2 -translate-y-1/2">
                                <div className="relative mx-auto h-[110px] w-full rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                <p className="mt-2 text-center text-xs text-white/90">Centralize o código dentro do retângulo</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   TABS
========================= */

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            type="button"
            className={[
                "w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm font-medium transition",
                active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200",
            ].join(" ")}
        >
            {label}
        </button>
    );
}


/* =========================
   COMBOBOX (Produto) - CORRIGIDO (seleciona e FECHA SEMPRE)
========================= */

function ProductCombobox({
    label,
    placeholder,
    produtos,
    valueId,
    onChangeId,
    saldoByProdId,
    query,
    setQuery,
    disabled,
}: {
    label: string;
    placeholder?: string;
    produtos: Produto[];
    valueId: ID;
    onChangeId: (id: ID) => void;
    saldoByProdId?: Map<ID, number>;
    query: string;
    setQuery: (v: string) => void;
    disabled?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);

    const list = useMemo(() => {
        const qq = query.trim().toLowerCase();
        const base = !qq ? produtos : produtos.filter((p) => `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq));
        return base.slice(0, 30);
    }, [produtos, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // quando o valueId muda (por scan / digitar CB / etc), FECHA a lista também
    useEffect(() => {
        if (!valueId) return;
        setOpen(false);

        const sel = produtos.find((p) => p.id === valueId) || null;
        if (sel && (!query.trim() || query.trim() !== sel.nome)) {
            setQuery(sel.nome);
        }

        // tira foco para evitar reabrir por eventos de foco em alguns devices
        requestAnimationFrame(() => inputRef.current?.blur());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueId]);

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <TextInput
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        if (valueId) onChangeId(0);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder || "Digite para buscar..."}
                    disabled={disabled}
                />

                {open ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {list.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600">Nenhum produto encontrado.</div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {list.map((p) => {
                                    const disp = saldoByProdId?.get(p.id);
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                className={[
                                                    "w-full px-3 py-2 text-left text-sm hover:bg-slate-50",
                                                    valueId === p.id ? "bg-slate-50" : "",
                                                ].join(" ")}
                                                onMouseDown={(e) => {
                                                    // garante seleção mesmo antes de blur/focus e evita reabrir
                                                    e.preventDefault();
                                                }}
                                                onClick={() => {
                                                    onChangeId(p.id);
                                                    setQuery(p.nome);
                                                    setOpen(false);
                                                    requestAnimationFrame(() => inputRef.current?.blur());
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate font-medium text-slate-900">{p.nome}</span>
                                                    {typeof disp === "number" ? (
                                                        <span className="shrink-0 text-xs text-slate-600">
                                                            disp: <b>{disp}</b>
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-slate-600">
                                                    CB: <b>{p.codigo_barras}</b>
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
        </Field>
    );
}

/* =========================
   PAGE
========================= */

export default function Page() {
    const [tab, setTab] = useState<UiTab>("HOME");

    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState<string>("");

    const [me, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);

    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // =========================
    // AVANÇADO (POPUPS)
    // =========================
    const [advNovoProdutoOpen, setAdvNovoProdutoOpen] = useState(false);
    const [advAjusteOpen, setAdvAjusteOpen] = useState(false);

    const [advDepAddOpen, setAdvDepAddOpen] = useState(false);
    const [advDepRenameOpen, setAdvDepRenameOpen] = useState(false);

    const [advCatAddOpen, setAdvCatAddOpen] = useState(false);
    const [advCatRenameOpen, setAdvCatRenameOpen] = useState(false);

    const [advFabAddOpen, setAdvFabAddOpen] = useState(false);
    const [advFabRenameOpen, setAdvFabRenameOpen] = useState(false);

    const [advExportOpen, setAdvExportOpen] = useState(false);
    const [advImportOpen, setAdvImportOpen] = useState(false);


    // imagem popup
    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState<string>("");

    // modal editar produto
    const [prodEditOpen, setProdEditOpen] = useState(false);
    const [prodEditId, setProdEditId] = useState<ID | 0>(0);
    const [prodBusy, setProdBusy] = useState(false);
    // ✅ NOVO: busy do salvamento min/max por depósito
    const [minMaxBusy, setMinMaxBusy] = useState(false);

    // campos do cadastro
    const [editNome, setEditNome] = useState("");
    const [editValor, setEditValor] = useState<string>("R$ 0,00");
    const [editMin, setEditMin] = useState<number>(0);
    const [editMax, setEditMax] = useState<number>(0); // (produto / padrão)

    // ✅ NOVO: min/max por depósito (est_saldo)
    const [editMinMaxDepId, setEditMinMaxDepId] = useState<ID>(0);
    const [editMinDep, setEditMinDep] = useState<number>(0);
    const [editMaxDep, setEditMaxDep] = useState<number>(0);
    const [editCatId, setEditCatId] = useState<ID>(0);
    const [editFabId, setEditFabId] = useState<ID>(0);
    const [editClassId, setEditClassId] = useState<ID>(0);

    // foto: “nova foto”
    const [editFotoNova, setEditFotoNova] = useState<string>("");

    // saldos editáveis por depósito
    

    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const userById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
    const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
    const fabById = useMemo(() => new Map(fabricantes.map((f) => [f.id, f])), [fabricantes]);
    const classById = useMemo(() => new Map(classificacoes.map((c) => [c.id, c])), [classificacoes]);

    const saldosMap = useMemo(() => {
        const m = new Map<string, Saldo>();
        for (const s of saldos) m.set(`${s.produto_id}::${s.deposito_id}`, s);
        return m;
    }, [saldos]);

    useEffect(() => {
        if (!prodEditId || !editMinMaxDepId) return;

        const s = saldosMap.get(`${prodEditId}::${editMinMaxDepId}`);
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));
    }, [prodEditId, editMinMaxDepId, saldosMap]);


    async function refreshInit() {
        setLoading(true);
        setInitErr("");
        try {
            const j = await apiGet<InitResp>({ init: 1, _ts: Date.now() });
            if (!j.ok) throw new Error(j.msg || "Falha no init");

            setMe(j.me);
            setUsuarios(j.usuarios || []);
            setDepositos(j.depositos || []);

            setCategorias((j.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((j.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            setProdutos((j.produtos || []).filter((p) => Number(p.ativo) === 1));
            setClassificacoes((j.classificacoes || []).filter((c) => Number(c.ativo) === 1));

            setSaldos(j.saldos || []);
        } catch (e: any) {
            setInitErr(e?.message || "Erro ao carregar.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshInit();

        const onFocus = () => refreshInit();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ALERTAS (só se Min e Max definidos)
    const alertRows = useMemo(() => {
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; max: number; rep: number }> = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const qtd = clampInt(s.quantidade);

            // ✅ só considera alerta se Min e Max estiverem definidos
            const hasMinMax = min > 0 && max > 0;
            if (!hasMinMax) continue;

            if (qtd <= min) {
                rows.push({
                    p,
                    d,
                    qtd,
                    min,
                    max,
                    rep: Math.max(0, max - qtd),
                });
            }
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [saldos, prodById, depById]);


    const alertCount = alertRows.length;

    // ESTOQUE
    const [qEstoque, setQEstoque] = useState("");

    // ✅ multi-select: array vazio = "Todos"
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID[]>([]);
    const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID[]>([]);
    const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID[]>([]);
    const [classFiltroEstoque, setClassFiltroEstoque] = useState<ID[]>([]);

    const [onlyLow, setOnlyLow] = useState(false);

    // =========================
    // CONFERÊNCIA (não altera saldo)
    // =========================
    const [confDepositoId, setConfDepositoId] = useState<ID>(0);
    const [confFabId, setConfFabId] = useState<ID | "Todos">("Todos");
    const [confCatId, setConfCatId] = useState<ID | "Todas">("Todas");
    const [confClassId, setConfClassId] = useState<ID | "Todas">("Todas");
    const [confQ, setConfQ] = useState("");

    // qtd física por produto (como string para permitir vazio)
    const [confFisicoByProd, setConfFisicoByProd] = useState<Record<number, string>>({});

    // ✅ MOSTRA Min/Rep apenas se existir pelo menos 1 item (no(s) depósito(s) filtrado(s))
    // com minimo>0 OU maximo>0. Se todos forem 0, some as colunas.
    const showMinRepColumns = useMemo(() => {
        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;

        for (const s of saldos) {
            if (depSet && !depSet.has(Number(s.deposito_id))) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);

            if (min > 0 || max > 0) return true;
        }
        return false;
    }, [saldos, depFiltroEstoque]);



    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();

        const rows: Array<{
            p: Produto;
            d: Deposito;
            qtd: number;
            s?: Saldo;
            min: number;
            max: number;
            rep: number;
            hasMinMax: boolean;
        }> = [];

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            if (depSet && !depSet.has(d.id)) continue;

            if (catSet) {
                const pid = Number(p.categoria_id || 0);
                if (!catSet.has(pid)) continue;
            }

            if (fabSet) {
                const fid = Number(p.fabricante_id || 0);
                if (!fabSet.has(fid)) continue;
            }

            if (clsSet) {
                const cid = Number(p.classificacao_id || 0);
                if (!clsSet.has(cid)) continue;
            }

            const qtd = clampInt(s.quantidade);
            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);

            // ✅ definido = tem Min e Max > 0
            const hasMinMax = min > 0 && max > 0;

            // ✅ REP só faz sentido quando tem Min+Max definido
            const rep = hasMinMax ? Math.max(0, max - qtd) : 0;

            // ✅ "Somente alerta" só entra se tiver Min/Max definido e qtd <= min
            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab} ${cls}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({ p, d, qtd, s, min, max, rep, hasMinMax });
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR") || a.d.nome.localeCompare(b.d.nome, "pt-BR"));
        return rows;
    }, [
        saldos,
        prodById,
        depById,
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        catById,
        fabById,
        classById,
    ]);


    const estoqueResumo = useMemo(() => {
        let totalUnidades = 0;
        let totalValor = 0;

        const modelosSet = new Set<number>();

        for (const { p, qtd } of estoqueRows) {
            modelosSet.add(Number(p.id));

            const q = clampInt(qtd);
            totalUnidades += q;

            const v = Number(p.valor) || 0;
            totalValor += q * v;
        }

        return {
            totalUnidades,
            totalValor,
            totalModelos: modelosSet.size,
        };
    }, [estoqueRows]);



    function getFiltroResumo() {
        const joinNames = (opts: Array<{ id: ID; nome: string }>, sel: ID[], allTxt: string) => {
            if (!sel.length) return allTxt;
            const m = new Map(opts.map((o) => [o.id, o.nome]));
            return sel.map((id) => m.get(id) || `#${id}`).join(", ");
        };

        return {
            busca: qEstoque.trim() || "—",
            deposito: joinNames(depositos, depFiltroEstoque, "Todos"),
            categoria: joinNames(categorias, catFiltroEstoque, "Todas"),
            fabricante: joinNames(fabricantes, fabFiltroEstoque, "Todos"),
            classificacao: joinNames(classificacoes, classFiltroEstoque, "Todas"),
            somenteAlerta: onlyLow ? "Sim" : "Não",
        };
    }


    function exportarEstoqueCSV() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const sep = ";";
        const header = ["Produto", "Código de Barras", "Depósito", "Categoria", "Fabricante", "Quantidade", "Min", "Rep", "Valor (un)"];


        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const { p, d, qtd, s, min, rep } of estoqueRows) {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;

            lines.push(
                [p.nome, p.codigo_barras, d.nome, cat, fab, qtd, min, rep, moneyBRL(valorNum)]

                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ✅ PDF REAL (download direto) - Estoque (logo + horizontal)
    async function exportarEstoquePDF() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        // libs (lazy import)
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const f = getFiltroResumo();
        const geradoEm = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date());

        const norm = (s: string) =>
            (s || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toUpperCase();

        // =========================================================
        // 1) ORGANIZAÇÃO TOTAL (Depósito -> Categoria -> Fabricante -> Valor desc)
        // =========================================================
        const sortedRows = [...estoqueRows].sort((a, b) => {
            const depA = norm(a.d?.nome || "");
            const depB = norm(b.d?.nome || "");
            if (depA !== depB) return depA.localeCompare(depB, "pt-BR");

            const catA = norm(a.p?.categoria_nome || "");
            const catB = norm(b.p?.categoria_nome || "");
            if (catA !== catB) return catA.localeCompare(catB, "pt-BR");

            const fabA = norm(a.p?.fabricante_nome || "");
            const fabB = norm(b.p?.fabricante_nome || "");
            if (fabA !== fabB) return fabA.localeCompare(fabB, "pt-BR");

            const vA = Number(a.p?.valor) || 0;
            const vB = Number(b.p?.valor) || 0;
            if (vA !== vB) return vB - vA;

            const nA = (a.p?.nome || "").toString();
            const nB = (b.p?.nome || "").toString();
            return nA.localeCompare(nB, "pt-BR");
        });

        // =========================================================
        // 2) REGRAS DE COLUNAS DINÂMICAS
        // =========================================================
        const isEmpty = (v: any) => v === null || v === undefined || String(v).trim() === "";

        const hasCodigo = sortedRows.some((r) => !isEmpty(r.p?.codigo_barras));
        const hasDeposito = sortedRows.some((r) => !isEmpty(r.d?.nome));
        const hasCategoria = sortedRows.some((r) => !isEmpty(r.p?.categoria_nome));
        const hasFabricante = sortedRows.some((r) => !isEmpty(r.p?.fabricante_nome));

        const showValorCol = sortedRows.some((r) => (Number(r.p?.valor) || 0) !== 0);

        // ✅ segue a regra do sistema: se no(s) depósito(s) exportado(s) ninguém tem min/max, não mostra
        const showMinCol = showMinRepColumns;
        const showRepCol = showMinRepColumns;


        // =========================================================
        // 3) TOTAIS
        // =========================================================
        const totalLinhas = new Set(sortedRows.map((r) => r.p.id)).size;

        let totalQuantidade = 0;
        let totalValor = 0;
        for (const { p, qtd } of sortedRows) {
            const q = clampInt(qtd);
            totalQuantidade += q;
            totalValor += q * (Number(p.valor) || 0);
        }

        // helper: busca imagem e converte para dataURL
        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                const reader = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
                return reader;
            } catch {
                return null;
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        // ✅ A4 landscape
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;
        let y = 12;

        // ===== HEADER (logo + título + meta)
        if (logoDataUrl) {
            doc.addImage(logoDataUrl, logoFormat as any, marginX, y, 55, 14);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Relatório de Estoque", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Gerado em: ${geradoEm}`, marginX + 62, y + 14);

        y += 22;

        // ===== FILTROS (caixa leve)
        doc.setDrawColor(226, 232, 240); // #e2e8f0
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.roundedRect(marginX, y, pageW - marginX * 2, 22, 2, 2, "FD");

        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);

        // sem "Busca"
        doc.text(`Depósito: ${f.deposito}`, marginX + 3, y + 6);
        doc.text(`Categoria: ${f.categoria}`, marginX + 3, y + 11);
        doc.text(`Fabricante: ${f.fabricante}`, marginX + 3, y + 16);
        doc.text(`Classificação: ${(f as any).classificacao}`, marginX + 3, y + 21);

        // direita
        doc.text(`Somente alerta (do mínimo): ${f.somenteAlerta}`, pageW / 2, y + 6);

        y += 28;

        // =========================================================
        // 4) TABELA (autoTable) com colunas dinâmicas + RODAPÉ
        // =========================================================
        const head: string[] = [
            "Produto",
            ...(hasCodigo ? ["Código"] : []),
            ...(hasDeposito ? ["Depósito"] : []),
            ...(hasCategoria ? ["Categoria"] : []),
            ...(hasFabricante ? ["Fabricante"] : []),
            "Quantidade",
            ...(showMinCol ? ["Mín"] : []),
            ...(showRepCol ? ["Reposição"] : []),
            ...(showValorCol ? ["Valor"] : []),
        ];


        const body = sortedRows.map(({ p, d, qtd, rep, min, hasMinMax }) => {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;

            const row: any[] = [];
            row.push(p.nome);

            if (hasCodigo) row.push(p.codigo_barras || "");
            if (hasDeposito) row.push(d.nome || "");
            if (hasCategoria) row.push(cat);
            if (hasFabricante) row.push(fab);

            row.push(String(clampInt(qtd)));

            if (showMinCol) row.push(hasMinMax ? String(clampInt(min)) : "");
            if (showRepCol) row.push(hasMinMax ? String(clampInt(rep)) : "");

            if (showValorCol) row.push(moneyBRL(valorNum));

            return row;
        });


        // ✅ RODAPÉ (totais alinhados por coluna) — precisa vir ANTES do autoTable
        const footRow = new Array(head.length).fill("");

        // "Modelos:" na 1ª coluna (Produto)
        footRow[0] = `Modelos: ${totalLinhas}`;

        // Total embaixo de Quantidade
        const idxQtd = head.indexOf("Quantidade");
        if (idxQtd >= 0) footRow[idxQtd] = String(totalQuantidade);

        // Valor total embaixo de Valor (se existir)
        const idxValor = head.indexOf("Valor");
        if (idxValor >= 0) footRow[idxValor] = moneyBRL(totalValor);

        autoTable(doc, {
            startY: y,
            head: [head],
            body,

            // ✅ rodapé na tabela
            foot: [footRow],
            showFoot: "lastPage",

            margin: { left: marginX, right: marginX },

            styles: {
                font: "helvetica",
                fontSize: 9.2,
                cellPadding: 2.2,
                valign: "top",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },

            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },

            // ✅ estilo do rodapé
            footStyles: {
                fillColor: [248, 250, 252],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },

            didParseCell: (data) => {
                const colName = head[data.column.index];

                // ✅ alinha numéricos à direita (inclusive no rodapé)
                if (["Quantidade", "Reposição", "Valor"].includes(colName)) {
                    data.cell.styles.halign = "right";
                }

                // ✅ rodapé: 1ª coluna à esquerda
                if (data.section === "foot" && data.column.index === 0) {
                    data.cell.styles.halign = "left";
                }

                // daqui pra baixo: só body
                if (data.section !== "body") return;

                // ✅ alerta (≤ mínimo): pinta Quantidade em vermelho
                if (colName === "Quantidade") {
                    const r = sortedRows[data.row.index];
                    const low = !!r.hasMinMax && clampInt(r.qtd) <= clampInt(r.min);
                    if (low) data.cell.styles.textColor = [185, 28, 28];
                }


                // ✅ reposição verde
                if (colName === "Reposição") {
                    const txt = String(data.cell.raw || "");
                    if (txt && txt !== "0") data.cell.styles.textColor = [22, 163, 74];
                }
            },

            // ✅ deixa Produto quebrar linha quando precisar
            columnStyles: {
                0: { cellWidth: 85, overflow: "linebreak" }, // Produto
            },
        });

        // ===== DOWNLOAD DIRETO
        const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }



    // =========================
    // CONFERÊNCIA: linhas (1 depósito) + filtros
    // =========================
    const conferenciaRows = useMemo(() => {
        const depId = Number(confDepositoId);
        if (!depId) return [];

        const qq = confQ.trim().toLowerCase();

        const rows: Array<{
            p: Produto;
            qtdSistema: number;
            fabricante: string;
            categoria: string;
            classificacao: string;
        }> = [];

        for (const s of saldos) {
            if (Number(s.deposito_id) !== depId) continue;

            const p = prodById.get(s.produto_id);
            if (!p) continue;

            if (confCatId !== "Todas") {
                if (Number(p.categoria_id || 0) !== Number(confCatId)) continue;
            }

            if (confFabId !== "Todos") {
                if (Number(p.fabricante_id || 0) !== Number(confFabId)) continue;
            }

            if (confClassId !== "Todas") {
                if (Number(p.classificacao_id || 0) !== Number(confClassId)) continue;
            }

            const fabricante = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const categoria = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const classificacao =
                p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";

            if (qq) {
                const blob = `${p.nome} ${p.codigo_barras} ${fabricante} ${categoria} ${classificacao}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({
                p,
                qtdSistema: clampInt(s.quantidade),
                fabricante,
                categoria,
                classificacao,
            });
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [
        confDepositoId,
        confFabId,
        confCatId,
        confClassId,
        confQ,
        saldos,
        prodById,
        fabById,
        catById,
        classById,
    ]);

    function parseFisico(v: string): number | null {
        const t = (v || "").replace(/\D/g, "").trim();
        if (!t) return null;
        return clampInt(t);
    }

    function exportarConferenciaCSV() {
        if (!confDepositoId) return alert("Selecione o depósito.");
        if (!conferenciaRows.length) return alert("Nenhum item para exportar com os filtros atuais.");

        const sep = ";";
        const depNome = depById.get(Number(confDepositoId))?.nome || String(confDepositoId);

        const header = ["Depósito", "Produto", "Fabricante", "Categoria", "Classificação", "Qtd Sistema", "Qtd Física", "Diferença", "Ajuste", "Status"];

        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const r of conferenciaRows) {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);
            const diffN = fis === null ? null : (fis - r.qtdSistema);
            const diff = diffN === null ? "" : String(diffN);

            // ✅ Ajuste igual ao diff, mas com sinal (excel-friendly)
            const ajuste = diffN === null ? "" : (diffN > 0 ? `+${diffN}` : `${diffN}`);

            const status = fis === null ? "NAO_INFORMADO" : (fis === r.qtdSistema ? "OK" : "DIVERGENTE");

            lines.push(
                [
                    depNome,
                    r.p.nome,
                    r.fabricante,
                    r.categoria,
                    r.classificacao,
                    r.qtdSistema,
                    fis === null ? "" : fis,
                    diff,
                    ajuste,
                    status,
                ]
                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `conferencia_${depNome}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ✅ PDF REAL (download direto) - Conferência no padrão do Estoque (logo + horizontal)
    async function exportarConferenciaPDF() {
        if (!confDepositoId) return alert("Selecione o depósito.");
        if (!conferenciaRows.length) return alert("Nenhum item para exportar com os filtros atuais.");

        // libs (lazy import para não pesar no bundle inicial)
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const depNome = depById.get(Number(confDepositoId))?.nome || String(confDepositoId);

        const geradoEm = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date());

        // filtros (igual você já exibe)
        const fabTxt =
            confFabId === "Todos" ? "Todos" : (fabById.get(Number(confFabId))?.nome || String(confFabId));
        const catTxt =
            confCatId === "Todas" ? "Todas" : (catById.get(Number(confCatId))?.nome || String(confCatId));
        const clsTxt =
            confClassId === "Todas" ? "Todas" : (classById.get(Number(confClassId))?.nome || String(confClassId));
        

        // helper: busca imagem e converte para dataURL (precisa CORS liberado)
        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                const reader = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
                return reader;
            } catch {
                return null; // se falhar, segue sem logo
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);

        // ✅ A4 landscape
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;
        let y = 12;

        // ===== HEADER (logo + título + meta)
        if (logoDataUrl) {
            // logo na esquerda (ajuste tamanho se quiser)
            doc.addImage(logoDataUrl, "PNG", marginX, y, 55, 14);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Conferência de Estoque", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(
            `Depósito: ${depNome}   •   Gerado em: ${geradoEm}   •   Itens: ${conferenciaRows.length}`,
            marginX + 62,
            y + 14
        );

        y += 22;

        // ===== FILTROS (caixa leve como no Estoque)
        doc.setDrawColor(226, 232, 240); // #e2e8f0
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.roundedRect(marginX, y, pageW - marginX * 2, 18, 2, 2, "FD");

        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85); // slate-ish
        doc.text(`Fabricante: ${fabTxt}`, marginX + 3, y + 6);
        doc.text(`Categoria: ${catTxt}`, marginX + 3, y + 11);
        doc.text(`Classificação: ${clsTxt}`, marginX + 3, y + 16);
        

        y += 24;

        // ===== TOTAIS
        const totalSistema = conferenciaRows.reduce((acc, r) => acc + clampInt(r.qtdSistema), 0);

        const totalFisico = conferenciaRows.reduce((acc, r) => {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);
            return acc + (fis === null ? 0 : clampInt(fis));
        }, 0);

        const totalDif = totalFisico - totalSistema;
        const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);

        // ===== TABELA
        // ✅ NBSP para NÃO quebrar: "Qtd Sistema" / "Qtd Física"
        const head = [[
            "Produto",
            "Fabricante",
            "Qtd\u00A0Sistema",
            "Qtd\u00A0Física",
            "Dif.",
            "Ajuste",
            "Status",
        ]];

        const body = conferenciaRows.map((r) => {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);

            const diffN = fis === null ? null : (fis - r.qtdSistema);
            const diff = diffN === null ? "—" : String(diffN);
            const ajuste = diffN === null ? "—" : (diffN > 0 ? `+${diffN}` : `${diffN}`);
            const status = fis === null ? "—" : (diffN === 0 ? "OK" : "DIVERGENTE");

            return [
                r.p.nome,
                r.fabricante || "—",
                String(r.qtdSistema),
                fis === null ? "—" : String(fis),
                diff,
                ajuste,
                status,
            ];
        });

        autoTable(doc, {
            startY: y,
            head,
            body,
            margin: { left: marginX, right: marginX },

            // ✅ geral: evita quebra nas colunas (só o produto pode quebrar)
            styles: {
                font: "helvetica",
                fontSize: 9.3,
                cellPadding: 2.4,
                valign: "middle",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
                overflow: "ellipsize", // ✅ padrão: NÃO quebra, corta com "..."
            },

            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },

            // ✅ Larguras calculadas pra A4 landscape com margem 12mm (soma = 273mm)
            columnStyles: {
                0: { cellWidth: 110, overflow: "linebreak" }, // ✅ Produto: pode quebrar
                1: { cellWidth: 55, overflow: "ellipsize" },  // Fabricante: não quebra
                2: { cellWidth: 25, halign: "right" },        // Qtd Sistema (não quebra)
                3: { cellWidth: 25, halign: "right" },        // Qtd Física (não quebra)
                4: { cellWidth: 14, halign: "right" },        // Dif.
                5: { cellWidth: 16, halign: "right" },        // Ajuste
                6: { cellWidth: 28, halign: "center" },       // Status (sem quebra)
            },

            didParseCell: (data) => {
                // ✅ Cabeçalho sem quebra (reforço)
                if (data.section === "head") {
                    data.cell.styles.overflow = "ellipsize";
                    data.cell.styles.minCellHeight = 8;
                }

                // pinta status
                if (data.section === "body" && data.column.index === 6) {
                    const txt = String(data.cell.raw || "");
                    if (txt === "OK") data.cell.styles.textColor = [22, 163, 74];
                    if (txt === "DIVERGENTE") data.cell.styles.textColor = [185, 28, 28];
                }

                // pinta ajuste
                if (data.section === "body" && data.column.index === 5) {
                    const txt = String(data.cell.raw || "");
                    if (txt.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
                    if (txt.startsWith("-")) data.cell.styles.textColor = [185, 28, 28];
                }
            },
        });

        // ===== TOTAIS (caixa no final, igual “rodapé”)
        let yAfter = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : y + 6;

        // se estiver muito embaixo, quebra página
        const pageH = doc.internal.pageSize.getHeight();
        if (yAfter + 18 > pageH - 10) {
            doc.addPage();
            yAfter = 12;
        }

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, yAfter, doc.internal.pageSize.getWidth() - marginX * 2, 14, 2, 2, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);

        doc.text(`Total Sistema: ${totalSistema}`, marginX + 4, yAfter + 9);
        doc.text(`Total Físico: ${totalFisico}`, marginX + 70, yAfter + 9);

        // (opcional, mas ajuda muito) Dif total
        doc.text(`Dif Total: ${fmtSigned(totalDif)}`, marginX + 132, yAfter + 9);

        doc.setTextColor(0, 0, 0);


        // ===== DOWNLOAD DIRETO
        const safeName = `conferencia_${depNome}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }



    









    // ENTRADA
    const [entradaOpen, setEntradaOpen] = useState(false);
    const [entradaScanOpen, setEntradaScanOpen] = useState(false);

    // ✅ NOVO: popup "Concluir" + sucesso
    const [entradaConcluirOpen, setEntradaConcluirOpen] = useState(false);
    const [entradaConcluirBusy, setEntradaConcluirBusy] = useState(false);
    const [entradaSucessoOpen, setEntradaSucessoOpen] = useState(false);

    // itens que serão confirmados no popup (snapshot)
    const [entradaConcluirItens, setEntradaConcluirItens] = useState<
        Array<{ payload: any; resumo: string; nome: string; qtd: number }>
    >([]);

    const [entradaBarcode, setEntradaBarcode] = useState("");
    const [entradaDepositoId, setEntradaDepositoId] = useState<ID>(0);
    const [entradaQtd, setEntradaQtd] = useState<string>("1");

    // ✅ agora a observação fica visualmente abaixo da fila (mas continua sendo usada)
    const [entradaObs, setEntradaObs] = useState("");

    // NOVO: filtro fabricante + barra de pesquisa/lista de produtos filtrados (Entrada)
    const [entradaFabFiltroId, setEntradaFabFiltroId] = useState<ID | "Todos">("Todos");
    // NOVO: filtro categoria (Entrada)
    const [entradaCatFiltroId, setEntradaCatFiltroId] = useState<ID | "Todas">("Todas");
    const [entradaProdutoId, setEntradaProdutoId] = useState<ID>(0);
    const [entradaProdQuery, setEntradaProdQuery] = useState("");

    

    const [catQuickOpen, setCatQuickOpen] = useState(false);
    const [catQuickNome, setCatQuickNome] = useState("");
    const [fabQuickOpen, setFabQuickOpen] = useState(false);
    const [fabQuickNome, setFabQuickNome] = useState("");

    // listas em lote
    const entradaSeqRef = useRef(1);
    const saidaSeqRef = useRef(1);
    const trfSeqRef = useRef(1);

    const [entradaItens, setEntradaItens] = useState<EntradaItem[]>([]);
    const [saidaItens, setSaidaItens] = useState<SaidaItem[]>([]);
    const [trfItens, setTrfItens] = useState<TrfItem[]>([]);

    useEffect(() => {
        if (depositos.length && !entradaDepositoId) setEntradaDepositoId(depositos[0].id);
    }, [depositos, entradaDepositoId]);

    useEffect(() => {
        if (depositos.length && !confDepositoId) setConfDepositoId(depositos[0].id);
    }, [depositos, confDepositoId]);


    const entradaProdutoExistente = useMemo(() => {
        const cb = entradaBarcode.trim();
        if (!cb) return null;
        return produtos.find((p) => p.codigo_barras === cb) ?? null;
    }, [entradaBarcode, produtos]);

    // NOVO: quando digitar/scanear CB, sincroniza com a barra de pesquisa (Entrada)
    useEffect(() => {
        const cb = entradaBarcode.trim();
        if (!cb) {
            setEntradaProdutoId(0);
            // não zera query para não atrapalhar digitação do usuário
            return;
        }
        const p = produtos.find((x) => x.codigo_barras === cb) ?? null;
        if (p) {
            setEntradaProdutoId(p.id);
            setEntradaProdQuery(p.nome);
        } else {
            setEntradaProdutoId(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entradaBarcode]);

    

    // NOVO: saldo da Entrada (depósito destino selecionado) para exibir "disp" na lista
    const entradaSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(entradaDepositoId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, entradaDepositoId]);

    // NOVO: lista de produtos filtrada por depósito + fabricante (Entrada)
    const entradaProdutosNoDeposito = useMemo(() => {
        const depId = Number(entradaDepositoId);

        // pega apenas produtos que existem no depósito (tem linha de saldo)
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        let list = produtos.filter((p) => ids.has(p.id));

        // filtro categoria
        if (entradaCatFiltroId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(entradaCatFiltroId));
        }

        // filtro fabricante
        if (entradaFabFiltroId !== "Todos") {
            list = list.filter((p) => Number(p.fabricante_id || 0) === Number(entradaFabFiltroId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtos, entradaDepositoId, entradaCatFiltroId, entradaFabFiltroId]);

    async function fileToDataUrl(file: File): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
        });
    }

    async function onNovoProdutoFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setNovoFoto(url);
    }

    async function criarNovoProdutoAvancado() {
        const cb = novoCodigoBarras.trim();
        const nome = novoNome.trim();

        if (!cb) return alert("Informe o código de barras.");
        if (!nome) return alert("Informe o nome do produto.");

        if (produtos.some((p) => String(p.codigo_barras).trim() === cb)) {
            return alert("Já existe um produto com este código de barras.");
        }

        const payload: any = {
            action: "produto_criar",
            codigo_barras: cb,
            nome,
            valor: Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0,
            minimo: clampInt(novoMin),
            maximo: clampInt(novoMax),
            categoria_id: novoCategoriaId ? Number(novoCategoriaId) : 0,
            fabricante_id: novoFabricanteId ? Number(novoFabricanteId) : 0,
            classificacao_id: novoClassificacaoId ? Number(novoClassificacaoId) : 0,
            foto_url: novoFoto || "",
        };

        const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>(payload);
        if (!r.ok) return alert(r.msg || "Falha ao criar produto.");

        alert("Produto criado com sucesso.");
        setNovoCodigoBarras("");
        setNovoNome("");
        setNovoValor(0);
        setNovoMin(0);
        setNovoMax(0);
        setNovoFoto("");
        setNovoCategoriaId(0);
        setNovoFabricanteId(0);
        setNovoClassificacaoId(0);

        await refreshInit();
    }



    

    function resetEntradaForm() {
        setEntradaBarcode("");
        setEntradaProdutoId(0);
        setEntradaProdQuery("");
        setEntradaFabFiltroId("Todos");
        setEntradaCatFiltroId("Todas");
        setEntradaQtd("1");
        setEntradaObs("");
    }


    // ✅ NOVO: reset só do item (mantém depósito/filtros/observação para montar lote)
    function resetEntradaItemFieldsOnly() {
        setEntradaBarcode("");
        setEntradaProdutoId(0);
        setEntradaProdQuery("");
        setEntradaQtd("1");
    }

    // ✅ NOVO: cancelar fecha e limpa tudo
    function cancelarEntrada() {
        setEntradaItens([]);
        resetEntradaForm();
        setEntradaOpen(false);
    }

    function buildEntradaPayloadFromForm(): { payload: any; resumo: string; nome: string; qtd: number } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_id = Number(entradaDepositoId);
        const quantidade = clampInt(entradaQtd || "0");
        const codigo_barras = entradaBarcode.trim();

        if (!deposito_id) return alert("Selecione o depósito."), null;
        if (!codigo_barras) return alert("Informe/Leia o código de barras."), null;
        if (quantidade <= 0) return alert("Quantidade inválida."), null;

        const payload: any = {
            action: "entrada",
            deposito_id,
            quantidade,
            codigo_barras,
            observacao: entradaObs.trim() || undefined,
        };

        const msgNaoCadastrado =
            "Produto não cadastrado. Por gentileza, solicite a criação de um novo produto ao setor responsável.";

        const nomeProduto = entradaProdutoExistente?.nome || "";

        if (!entradaProdutoExistente) {
            alert(msgNaoCadastrado);
            return null;
        }

        const resumo = `${nomeProduto} — CB ${codigo_barras} — qtd ${quantidade} — Dep ${depById.get(deposito_id)?.nome || deposito_id
            }`;

        return { payload, resumo, nome: nomeProduto, qtd: quantidade };
    }


    async function applyEntradaSingle() {
        const built = buildEntradaPayloadFromForm();
        if (!built) return;

        const r = await apiPost<{ ok: boolean; msg?: string }>(built.payload);
        if (!r.ok) return alert(r.msg || "Falha na entrada.");

        resetEntradaForm();
        setEntradaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function addEntradaItemToList() {
        const built = buildEntradaPayloadFromForm();
        if (!built) return;
        const id = entradaSeqRef.current++;
        setEntradaItens((prev) => [...prev, { id, ...built }]);

        // ✅ mantém depósito/filtros/observação para continuar montando o lote
        resetEntradaItemFieldsOnly();
    }


    async function applyEntradaLote() {
        let items = [...entradaItens];

        if (entradaBarcode.trim()) {
            const built = buildEntradaPayloadFromForm();
            if (!built) return;
            const id = entradaSeqRef.current++;
            items = [...items, { id, ...built }];
        }

        if (!items.length) {
            alert("Adicione pelo menos um item para entrada.");
            return;
        }

        for (const it of items) {
            const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
            if (!r.ok) {
                alert(`Erro na entrada de "${it.resumo}": ${r.msg || "Falha."}`);
                return;
            }
        }

        resetEntradaForm();
        setEntradaItens([]);
        setEntradaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function montarSnapshotConcluirEntrada() {
        const obs = entradaObs.trim();

        // começa com os itens já na fila
        const base = entradaItens.map((it) => {
            const cb = String(it.payload?.codigo_barras || "").trim();
            const prod = cb ? produtos.find((p) => p.codigo_barras === cb) : null;

            const nome = String(it.payload?.nome || prod?.nome || "(sem nome)");
            const qtd = clampInt(it.payload?.quantidade);

            // ✅ aplica observação do lote no momento da conclusão
            const payload = obs ? { ...it.payload, observacao: obs } : { ...it.payload };

            return { payload, resumo: it.resumo, nome, qtd };
        });

        // se o usuário deixou um item “no formulário” (barcode preenchido), inclui no snapshot também
        if (entradaBarcode.trim()) {
            const built = buildEntradaPayloadFromForm();
            if (!built) return null;

            const cb = String(built.payload?.codigo_barras || "").trim();
            const prod = cb ? produtos.find((p) => p.codigo_barras === cb) : null;

            const nome = String(built.payload?.nome || prod?.nome || "(sem nome)");
            const qtd = clampInt(built.payload?.quantidade);

            const payload = obs ? { ...built.payload, observacao: obs } : { ...built.payload };

            base.push({ payload, resumo: built.resumo, nome, qtd });
        }

        return base;
    }

    function abrirConcluirEntrada() {
        const snap = montarSnapshotConcluirEntrada();
        if (!snap) return; // buildEntradaPayloadFromForm já alerta se inválido
        if (!snap.length) {
            alert("Adicione pelo menos um item para entrada.");
            return;
        }

        setEntradaConcluirItens(snap);
        setEntradaConcluirOpen(true);
    }

    async function confirmarEntradaDoSnapshot() {
        if (!entradaConcluirItens.length) return;

        setEntradaConcluirBusy(true);
        try {
            for (const it of entradaConcluirItens) {
                const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
                if (!r.ok) {
                    alert(`Erro na entrada de "${it.nome}": ${r.msg || "Falha."}`);
                    return;
                }
            }

            // ✅ sucesso
            setEntradaConcluirOpen(false);
            setEntradaItens([]);
            resetEntradaForm();
            setEntradaOpen(false);

            await refreshInit();
            setTab("ESTOQUE");

            setEntradaSucessoOpen(true);
        } finally {
            setEntradaConcluirBusy(false);
        }
    }


    async function criarCategoriaQuick() {
        const nome = catQuickNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "categoria_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
        setCatQuickNome("");
        setCatQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoCategoriaId(Number(r.id));
    }

    async function criarFabricanteQuick() {
        const nome = fabQuickNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "fabricante_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
        setFabQuickNome("");
        setFabQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoFabricanteId(Number(r.id));
    }

    // ======= PRODUTO EDITOR =======

    function openProdutoEditor(produtoId: ID, depositoId?: ID) {
        const p = prodById.get(produtoId);
        if (!p) return;

        setProdEditId(produtoId);

        setEditNome(p.nome || "");

        const valorNum = Number(p.valor) || 0;
        const valorDigits = String(Math.round(Math.max(0, valorNum) * 100));
        setEditValor(maskBRLFromDigits(valorDigits));

        // mantém padrão do produto (não quebra legado)
        setEditMin(clampInt(p.minimo));
        setEditMax(clampInt((p as any).maximo ?? 0));

        setEditCatId(Number(p.categoria_id || 0));
        setEditFabId(Number(p.fabricante_id || 0));
        setEditClassId(Number(p.classificacao_id || 0));
        setEditFotoNova("");

        // ✅ seleciona depósito vindo da linha do estoque (ou fallback)
        const depId = Number(depositoId || 0) || Number(depositos[0]?.id || 0);
        setEditMinMaxDepId(depId);

        // ✅ carrega min/max do est_saldo daquele depósito
        const s = depId ? saldosMap.get(`${produtoId}::${depId}`) : undefined;
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));

        setProdEditOpen(true);
    }

    async function onProdutoFotoNova(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setEditFotoNova(url);
    }

    async function salvarCadastroProduto() {
        if (!prodEditId) return;
        if (!editNome.trim()) return alert("Nome obrigatório.");

        setProdBusy(true);
        try {
            const payload: any = {
                action: "produto_atualizar",
                produto_id: prodEditId,
                nome: editNome.trim(),
                valor: parseBRLToNumber(editValor),
                minimo: clampInt(editMin),
                maximo: clampInt(editMax), // ✅ NOVO
                categoria_id: editCatId ? Number(editCatId) : 0,
                fabricante_id: editFabId ? Number(editFabId) : 0,
                classificacao_id: editClassId ? Number(editClassId) : 0,
            };

            if (editFotoNova) payload.foto_url = editFotoNova;

            const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
            if (!r.ok) return alert(r.msg || "Falha ao salvar cadastro.");

            await refreshInit();
            alert("Produto atualizado.");
        } finally {
            setProdBusy(false);
        }
    }

    async function salvarMinMaxDoDeposito() {
        if (!prodEditId) return alert("Produto inválido.");
        if (!editMinMaxDepId) return alert("Selecione o depósito.");

        setMinMaxBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "saldo_minmax_setar", // ✅ backend precisa aceitar isso
                produto_id: Number(prodEditId),
                deposito_id: Number(editMinMaxDepId),
                minimo: clampInt(editMinDep),
                maximo: clampInt(editMaxDep),
            });

            if (!r.ok) return alert(r.msg || "Falha ao salvar mín/máx do depósito.");

            await refreshInit();
            alert("Mín/Máx do depósito atualizado.");
        } finally {
            setMinMaxBusy(false);
        }
    }


    // =========================
    // AJUSTE MANUAL (AVANÇADO) - SALDOS POR DEPÓSITO
    // =========================
    const [ajusteProdId, setAjusteProdId] = useState<ID>(0);
    const [ajusteProdQuery, setAjusteProdQuery] = useState("");
    const [ajusteSaldos, setAjusteSaldos] = useState<Record<number, number>>({});
    const [ajusteBusy, setAjusteBusy] = useState(false);

    // quando escolher o produto, carrega os saldos atuais para edição
    useEffect(() => {
        if (!ajusteProdId) {
            setAjusteSaldos({});
            return;
        }

        const m: Record<number, number> = {};
        for (const d of depositos) {
            const s = saldosMap.get(`${ajusteProdId}::${d.id}`);
            m[d.id] = clampInt(s?.quantidade ?? 0);
        }
        setAjusteSaldos(m);

        const p = prodById.get(ajusteProdId);
        if (p && (!ajusteProdQuery.trim() || ajusteProdQuery.trim() !== p.nome)) {
            setAjusteProdQuery(p.nome);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ajusteProdId, depositos, saldosMap, prodById]);

    async function salvarAjusteSaldosAvancado() {
        if (!ajusteProdId) return alert("Selecione um produto.");

        setAjusteBusy(true);
        try {
            for (const d of depositos) {
                const novo = clampInt(ajusteSaldos[d.id] ?? 0);
                const atual = clampInt(saldosMap.get(`${ajusteProdId}::${d.id}`)?.quantidade ?? 0);
                if (novo === atual) continue;

                const r = await apiPost<{ ok: boolean; msg?: string }>({
                    action: "saldo_setar",
                    produto_id: ajusteProdId,
                    deposito_id: d.id,
                    quantidade: novo,
                });

                if (!r.ok) {
                    alert(r.msg || `Falha ao salvar saldo em ${d.nome}`);
                    return;
                }
            }

            await refreshInit();
            alert("Saldos atualizados.");
        } finally {
            setAjusteBusy(false);
        }
    }


    

    /* =========================
       SAÍDA
    ========================= */

    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saidaScanOpen, setSaidaScanOpen] = useState(false);

    // ✅ agora "saidaConfirmOpen" vira o popup de CONCLUIR (com lista + botão confirmar)
    const [saidaConfirmOpen, setSaidaConfirmOpen] = useState(false);
    const [saidaConfirmBusy, setSaidaConfirmBusy] = useState(false);
    const [saidaConfirmItens, setSaidaConfirmItens] = useState<
        Array<{ payload: any; nome: string; qtd: number }>
    >([]);

    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
    const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(0);
    const [saidaDestinoDepositoId, setSaidaDestinoDepositoId] = useState<ID>(0);

    const [saidaBarcode, setSaidaBarcode] = useState("");
    const [saidaCategoriaId, setSaidaCategoriaId] = useState<ID | "Todas">("Todas");

    const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
    const [saidaProdQuery, setSaidaProdQuery] = useState("");

    const [saidaQtd, setSaidaQtd] = useState<string>("1");

    // ✅ observação fica abaixo e pode valer para o lote (como Entrada)
    const [saidaObs, setSaidaObs] = useState("");

    // ✅ monta snapshot (fila + item do formulário se existir) e abre popup "Concluir"
    function montarSnapshotConcluirSaida() {
        const obs = saidaObs.trim();

        const base = saidaItens.map((it) => {
            const pid = Number(it.payload?.produto_id || 0);
            const qtd = clampInt(it.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...it.payload, observacao: obs } : { ...it.payload };
            return { payload, nome, qtd };
        });

        // se existe um item “no formulário”, inclui no snapshot também
        if (saidaProdutoId) {
            const built = buildSaidaPayloadFromForm();
            if (!built) return null;

            const pid = Number(built.payload?.produto_id || 0);
            const qtd = clampInt(built.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...built.payload, observacao: obs } : { ...built.payload };

            base.push({ payload, nome, qtd });
        }

        return base;
    }

    function abrirConcluirSaida() {
        const snap = montarSnapshotConcluirSaida();
        if (!snap) return;
        if (!snap.length) {
            alert("Adicione pelo menos um item para saída.");
            return;
        }
        setSaidaConfirmItens(snap);
        setSaidaConfirmOpen(true);
    }

    async function confirmarSaidaDoSnapshot() {
        if (!saidaConfirmItens.length) return;

        setSaidaConfirmBusy(true);
        try {
            for (const it of saidaConfirmItens) {
                const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
                if (!r.ok) {
                    alert(`Erro na saída de "${it.nome}": ${r.msg || "Falha."}`);
                    return;
                }
            }

            // ✅ sucesso
            setSaidaConfirmOpen(false);
            setSaidaConfirmItens([]);

            resetSaidaAll();
            setSaidaOpen(false);

            await refreshInit();
            setTab("ESTOQUE");
        } finally {
            setSaidaConfirmBusy(false);
        }
    }


    // NOVO: popup de quantidade após SCAN (Saída)
    const [saidaScanQtyOpen, setSaidaScanQtyOpen] = useState(false);
    const [saidaScanProduto, setSaidaScanProduto] = useState<Produto | null>(null);
    const [saidaScanDisponivel, setSaidaScanDisponivel] = useState<number>(0);

    const saidaSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(saidaDepositoId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, saidaDepositoId]);

    const saidaProdutosNoDeposito = useMemo(() => {
        const depId = Number(saidaDepositoId);
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        let list = produtos.filter((p) => ids.has(p.id));

        if (saidaCategoriaId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(saidaCategoriaId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtos, saidaDepositoId, saidaCategoriaId]);

    function onSaidaBarcodePick(code: string) {
        // mantém para digitação manual no campo (sem popup)
        setSaidaBarcode(code);
        const p = produtos.find((x) => x.codigo_barras === code);
        if (p) {
            setSaidaProdutoId(p.id);
            setSaidaProdQuery(p.nome);
        }
    }

    // NOVO: SCAN abre popup para escolher quantidade e adicionar direto na lista
    function onSaidaBarcodeScanDetected(code: string) {
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const deposito_id = Number(saidaDepositoId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) return alert("Selecione o solicitante antes de usar o scanner.");
        if (!deposito_id) return alert("Selecione o depósito (origem) antes de usar o scanner.");
        if (!destino_texto) return alert("Selecione o destino antes de usar o scanner.");

        const p = produtos.find((x) => x.codigo_barras === code.trim()) ?? null;
        if (!p) {
            alert(`Produto não encontrado para o código: ${code}`);
            return;
        }

        const disp = saidaSaldoByProd.get(p.id) ?? 0;

        // preenche campos (opcional) para manter consistência visual
        setSaidaBarcode(p.codigo_barras);
        setSaidaProdutoId(p.id);
        setSaidaProdQuery(p.nome);

        setSaidaScanProduto(p);
        setSaidaScanDisponivel(disp);
        setSaidaScanQtyOpen(true);
    }

    function resetSaidaItemFields() {
        setSaidaBarcode("");
        setSaidaCategoriaId("Todas");
        setSaidaProdutoId(0);
        setSaidaProdQuery("");
        setSaidaQtd("1");
        // ✅ NÃO limpar observação aqui
        // setSaidaObs("");
    }

    function resetSaidaAll() {
        setSaidaItens([]);
        resetSaidaItemFields();
        setSaidaObs(""); // ✅ aqui sim, ao limpar tudo
    }


    function buildSaidaPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(saidaProdutoId);
        const deposito_id = Number(saidaDepositoId);
        const quantidade = clampInt(saidaQtd || "0");
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) {
            alert("Selecione o solicitante.");
            return null;
        }
        if (!deposito_id) {
            alert("Selecione o depósito.");
            return null;
        }
        if (!produto_id) {
            alert("Selecione um produto.");
            return null;
        }
        if (quantidade <= 0) {
            alert("Quantidade inválida.");
            return null;
        }
        if (!destino_texto) {
            alert("Selecione o destino.");
            return null;
        }

        const s = saldosMap.get(`${produto_id}::${deposito_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) {
            alert(`Quantidade maior que disponível (${atual}).`);
            return null;
        }

        const payload: any = {
            action: "saida",
            produto_id,
            deposito_id,
            quantidade,
            solicitante_usuario_id,
            destino_texto,
            observacao: saidaObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${quantidade} — Dep ${depById.get(deposito_id)?.nome || deposito_id} → ${destino_texto}`;

        return { payload, resumo };
    }

    // NOVO: builder rápido (para o popup pós scan)
    function buildSaidaPayloadDirect(produto_id: ID, quantidade: number): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_id = Number(saidaDepositoId);
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) return alert("Selecione o solicitante."), null;
        if (!deposito_id) return alert("Selecione o depósito."), null;
        if (!produto_id) return alert("Selecione um produto."), null;
        if (clampInt(quantidade) <= 0) return alert("Quantidade inválida."), null;
        if (!destino_texto) return alert("Selecione o destino."), null;

        const s = saldosMap.get(`${produto_id}::${deposito_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (clampInt(quantidade) > atual) return alert(`Quantidade maior que disponível (${atual}).`), null;

        const payload: any = {
            action: "saida",
            produto_id,
            deposito_id,
            quantidade: clampInt(quantidade),
            solicitante_usuario_id,
            destino_texto,
            observacao: saidaObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${clampInt(quantidade)} — Dep ${depById.get(deposito_id)?.nome || deposito_id} → ${destino_texto}`;

        return { payload, resumo };
    }

    function addSaidaItemToList() {
        const built = buildSaidaPayloadFromForm();
        if (!built) return;
        const id = saidaSeqRef.current++;
        setSaidaItens((prev) => [...prev, { id, ...built }]);
        resetSaidaItemFields();
    }

    // NOVO: adiciona item via popup pós scan
    function addSaidaItemFromScan(produto_id: ID, quantidade: number) {
        const built = buildSaidaPayloadDirect(produto_id, quantidade);
        if (!built) return;
        const id = saidaSeqRef.current++;
        setSaidaItens((prev) => [...prev, { id, ...built }]);

        // limpa apenas seleção de item (mantém solicitante/dep/destino)
        setSaidaBarcode("");
        setSaidaProdutoId(0);
        setSaidaProdQuery("");
        setSaidaQtd("1");
        // mantém obs e filtros se o usuário quiser repetir
    }

    async function confirmarSaida() {
        let items = [...saidaItens];

        if (saidaProdutoId) {
            const built = buildSaidaPayloadFromForm();
            if (!built) return;
            const id = saidaSeqRef.current++;
            items = [...items, { id, ...built }];
        }

        if (!items.length) {
            alert("Adicione pelo menos um item para saída.");
            return;
        }

        for (const it of items) {
            const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
            if (!r.ok) {
                alert(`Erro na saída de "${it.resumo}": ${r.msg || "Falha."}`);
                return;
            }
        }

        resetSaidaAll();
        setSaidaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function cancelarSaida() {
        resetSaidaAll();
        setSaidaOpen(false);
    }

    /* =========================
       TRANSFERÊNCIA (com leitor de código adicionado)
    ========================= */

    const [trfOpen, setTrfOpen] = useState(false);
    const [trfScanOpen, setTrfScanOpen] = useState(false);

    // ✅ agora "trfConfirmOpen" vira o popup de CONCLUIR (com lista + botão confirmar)
    const [trfConfirmOpen, setTrfConfirmOpen] = useState(false);
    const [trfConfirmBusy, setTrfConfirmBusy] = useState(false);
    const [trfConfirmItens, setTrfConfirmItens] = useState<
        Array<{ payload: any; nome: string; qtd: number }>
    >([]);

    // ✅ monta snapshot (fila + item do formulário se existir) e abre popup "Concluir"
    function montarSnapshotConcluirTrf() {
        const obs = trfObs.trim();

        const base = trfItens.map((it) => {
            const pid = Number(it.payload?.produto_id || 0);
            const qtd = clampInt(it.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...it.payload, observacao: obs } : { ...it.payload };
            return { payload, nome, qtd };
        });

        // se existe um item “no formulário”, inclui no snapshot também
        if (trfProdutoId) {
            const built = buildTrfPayloadFromForm();
            if (!built) return null;

            const pid = Number(built.payload?.produto_id || 0);
            const qtd = clampInt(built.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...built.payload, observacao: obs } : { ...built.payload };

            base.push({ payload, nome, qtd });
        }

        return base;
    }

    function abrirConcluirTransferencia() {
        const snap = montarSnapshotConcluirTrf();
        if (!snap) return;
        if (!snap.length) {
            alert("Adicione pelo menos uma transferência.");
            return;
        }
        setTrfConfirmItens(snap);
        setTrfConfirmOpen(true);
    }

    async function confirmarTransferenciaDoSnapshot() {
        if (!trfConfirmItens.length) return;

        setTrfConfirmBusy(true);
        try {
            for (const it of trfConfirmItens) {
                const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
                if (!r.ok) {
                    alert(`Erro na transferência de "${it.nome}": ${r.msg || "Falha."}`);
                    return;
                }
            }

            // ✅ sucesso
            setTrfConfirmOpen(false);
            setTrfConfirmItens([]);

            resetTrfAll();
            setTrfOpen(false);

            await refreshInit();
            setTab("ESTOQUE");
        } finally {
            setTrfConfirmBusy(false);
        }
    }


    const [trfSolicitanteId, setTrfSolicitanteId] = useState<ID>(0);
    const [trfOrigemId, setTrfOrigemId] = useState<ID>(0);
    const [trfDestinoId, setTrfDestinoId] = useState<ID>(0);

    const [trfBarcode, setTrfBarcode] = useState("");
    const [trfCategoriaId, setTrfCategoriaId] = useState<ID | "Todas">("Todas");

    const [trfProdutoId, setTrfProdutoId] = useState<ID>(0);
    const [trfProdQuery, setTrfProdQuery] = useState("");

    const [trfQtd, setTrfQtd] = useState<string>("1");
    const [trfObs, setTrfObs] = useState("");

    // NOVO: popup de quantidade após SCAN (Transferência)
    const [trfScanQtyOpen, setTrfScanQtyOpen] = useState(false);
    const [trfScanProduto, setTrfScanProduto] = useState<Produto | null>(null);
    const [trfScanDisponivel, setTrfScanDisponivel] = useState<number>(0);

    
    const trfSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(trfOrigemId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, trfOrigemId]);

    const trfProdutosNaOrigem = useMemo(() => {
        const depId = Number(trfOrigemId);
        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        let list = produtos.filter((p) => ids.has(p.id));

        if (trfCategoriaId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(trfCategoriaId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtos, trfOrigemId, trfCategoriaId]);

    function onTrfBarcodePick(code: string) {
        // mantém para digitação manual no campo (sem popup)
        setTrfBarcode(code);
        const p = produtos.find((x) => x.codigo_barras === code);
        if (p) {
            setTrfProdutoId(p.id);
            setTrfProdQuery(p.nome);
        }
    }

    // NOVO: SCAN abre popup para escolher quantidade e adicionar direto na lista
    function onTrfBarcodeScanDetected(code: string) {
        const solicitante_usuario_id = Number(trfSolicitanteId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);

        if (!solicitante_usuario_id) return alert("Selecione o solicitante antes de usar o scanner.");
        if (!deposito_origem_id || !deposito_destino_id) return alert("Selecione origem e destino antes de usar o scanner.");
        if (deposito_origem_id === deposito_destino_id) return alert("Origem e destino não podem ser iguais.");

        const p = produtos.find((x) => x.codigo_barras === code.trim()) ?? null;
        if (!p) {
            alert(`Produto não encontrado para o código: ${code}`);
            return;
        }

        const disp = trfSaldoByProd.get(p.id) ?? 0;

        // preenche campos (opcional) para manter consistência visual
        setTrfBarcode(p.codigo_barras);
        setTrfProdutoId(p.id);
        setTrfProdQuery(p.nome);

        setTrfScanProduto(p);
        setTrfScanDisponivel(disp);
        setTrfScanQtyOpen(true);
    }

    function resetTrfItemFields() {
        setTrfBarcode("");
        setTrfCategoriaId("Todas");
        setTrfProdutoId(0);
        setTrfProdQuery("");
        setTrfQtd("1");
        // ✅ NÃO limpar observação aqui
        // setTrfObs("");
    }

    function resetTrfAll() {
        setTrfItens([]);
        resetTrfItemFields();
        setTrfObs(""); // ✅ aqui sim, ao limpar tudo
    }

    function buildTrfPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(trfProdutoId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const quantidade = clampInt(trfQtd || "0");
        const solicitante_usuario_id = Number(trfSolicitanteId);

        if (!solicitante_usuario_id) {
            alert("Selecione o solicitante.");
            return null;
        }
        if (!produto_id) {
            alert("Selecione um produto.");
            return null;
        }
        if (!deposito_origem_id || !deposito_destino_id) {
            alert("Selecione depósitos.");
            return null;
        }
        if (deposito_origem_id === deposito_destino_id) {
            alert("Origem e destino não podem ser iguais.");
            return null;
        }
        if (quantidade <= 0) {
            alert("Quantidade inválida.");
            return null;
        }

        const s = saldosMap.get(`${produto_id}::${deposito_origem_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) {
            alert(`Quantidade maior que disponível na origem (${atual}).`);
            return null;
        }

        const payload: any = {
            action: "transferencia",
            produto_id,
            deposito_origem_id,
            deposito_destino_id,
            quantidade,
            solicitante_usuario_id,
            observacao: trfObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${quantidade} — ${depById.get(deposito_origem_id)?.nome || deposito_origem_id
            } → ${depById.get(deposito_destino_id)?.nome || deposito_destino_id}`;

        return { payload, resumo };
    }

    // NOVO: builder rápido (para o popup pós scan)
    function buildTrfPayloadDirect(produto_id: ID, quantidade: number): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const solicitante_usuario_id = Number(trfSolicitanteId);

        if (!solicitante_usuario_id) return alert("Selecione o solicitante."), null;
        if (!produto_id) return alert("Selecione um produto."), null;
        if (!deposito_origem_id || !deposito_destino_id) return alert("Selecione depósitos."), null;
        if (deposito_origem_id === deposito_destino_id) return alert("Origem e destino não podem ser iguais."), null;
        if (clampInt(quantidade) <= 0) return alert("Quantidade inválida."), null;

        const s = saldosMap.get(`${produto_id}::${deposito_origem_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (clampInt(quantidade) > atual) return alert(`Quantidade maior que disponível na origem (${atual}).`), null;

        const payload: any = {
            action: "transferencia",
            produto_id,
            deposito_origem_id,
            deposito_destino_id,
            quantidade: clampInt(quantidade),
            solicitante_usuario_id,
            observacao: trfObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${clampInt(quantidade)} — ${depById.get(deposito_origem_id)?.nome || deposito_origem_id
            } → ${depById.get(deposito_destino_id)?.nome || deposito_destino_id}`;

        return { payload, resumo };
    }

    function addTrfItemToList() {
        const built = buildTrfPayloadFromForm();
        if (!built) return;
        const id = trfSeqRef.current++;
        setTrfItens((prev) => [...prev, { id, ...built }]);
        resetTrfItemFields();
    }

    // NOVO: adiciona item via popup pós scan
    function addTrfItemFromScan(produto_id: ID, quantidade: number) {
        const built = buildTrfPayloadDirect(produto_id, quantidade);
        if (!built) return;
        const id = trfSeqRef.current++;
        setTrfItens((prev) => [...prev, { id, ...built }]);

        // limpa apenas seleção de item (mantém solicitante/origem/destino)
        setTrfBarcode("");
        setTrfProdutoId(0);
        setTrfProdQuery("");
        setTrfQtd("1");
        // mantém obs e filtros se o usuário quiser repetir
    }

    async function confirmarTransferencia() {
        let items = [...trfItens];

        if (trfProdutoId) {
            const built = buildTrfPayloadFromForm();
            if (!built) return;
            const id = trfSeqRef.current++;
            items = [...items, { id, ...built }];
        }

        if (!items.length) {
            alert("Adicione pelo menos uma transferência.");
            return;
        }

        for (const it of items) {
            const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
            if (!r.ok) {
                alert(`Erro na transferência de "${it.resumo}": ${r.msg || "Falha."}`);
                return;
            }
        }

        resetTrfAll();
        setTrfOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function cancelarTransferencia() {
        resetTrfAll();
        setTrfOpen(false);
    }

    /* =========================
       AVANÇADO + HISTÓRICO (mantidos)
    ========================= */

    // ======= NOVO PRODUTO (AVANÇADO) =======
    const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
    const [novoNome, setNovoNome] = useState("");
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoMax, setNovoMax] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>("");

    const [novoCategoriaId, setNovoCategoriaId] = useState<ID>(0);
    const [novoFabricanteId, setNovoFabricanteId] = useState<ID>(0);
    const [novoClassificacaoId, setNovoClassificacaoId] = useState<ID>(0);


    const [novoDepNome, setNovoDepNome] = useState("");
    const [renomearDepId, setRenomearDepId] = useState<ID>(0);
    const [renomearDepNome, setRenomearDepNome] = useState("");
    const [busyDep, setBusyDep] = useState(false);

    useEffect(() => {
        if (!renomearDepId && depositos[0]?.id) {
            setRenomearDepId(depositos[0].id);
            setRenomearDepNome(depositos[0].nome);
        }
    }, [depositos, renomearDepId]);

    useEffect(() => {
        const d = depositos.find((x) => x.id === renomearDepId);
        if (d) setRenomearDepNome(d.nome);
    }, [renomearDepId, depositos]);

    async function criarDeposito() {
        const nome = novoDepNome.trim();
        if (!nome) return alert("Informe o nome do depósito.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "deposito_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar depósito.");
            setNovoDepNome("");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    async function renomearDeposito() {
        const deposito_id = Number(renomearDepId);
        const nome = renomearDepNome.trim();
        if (!deposito_id) return alert("Selecione o depósito.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "deposito_renomear",
                deposito_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear.");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    function exportarDeposito(deposito_id: ID) {
        const url = `${API_BASE}?export_deposito_id=${deposito_id}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    


    // Categorias
    const [novoCatNome, setNovoCatNome] = useState("");
    const [renomearCatId, setRenomearCatId] = useState<ID>(0);
    const [renomearCatNome, setRenomearCatNome] = useState("");
    const [busyCat, setBusyCat] = useState(false);

    useEffect(() => {
        if (!renomearCatId && categorias[0]?.id) {
            setRenomearCatId(categorias[0].id);
            setRenomearCatNome(categorias[0].nome);
        }
    }, [categorias, renomearCatId]);

    useEffect(() => {
        const c = categorias.find((x) => x.id === renomearCatId);
        if (c) setRenomearCatNome(c.nome);
    }, [renomearCatId, categorias]);

    async function criarCategoria() {
        const nome = novoCatNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "categoria_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
            setNovoCatNome("");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    async function renomearCategoria() {
        const categoria_id = Number(renomearCatId);
        const nome = renomearCatNome.trim();
        if (!categoria_id) return alert("Selecione a categoria.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "categoria_renomear",
                categoria_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear categoria.");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    // Fabricantes
    const [novoFabNome, setNovoFabNome] = useState("");
    const [renomearFabId, setRenomearFabId] = useState<ID>(0);
    const [renomearFabNome, setRenomearFabNome] = useState("");
    const [busyFab, setBusyFab] = useState(false);

    useEffect(() => {
        if (!renomearFabId && fabricantes[0]?.id) {
            setRenomearFabId(fabricantes[0].id);
            setRenomearFabNome(fabricantes[0].nome);
        }
    }, [fabricantes, renomearFabId]);

    useEffect(() => {
        const f = fabricantes.find((x) => x.id === renomearFabId);
        if (f) setRenomearFabNome(f.nome);
    }, [renomearFabId, fabricantes]);

    async function criarFabricante() {
        const nome = novoFabNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "fabricante_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
            setNovoFabNome("");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    async function renomearFabricante() {
        const fabricante_id = Number(renomearFabId);
        const nome = renomearFabNome.trim();
        if (!fabricante_id) return alert("Selecione o fabricante.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "fabricante_renomear",
                fabricante_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear fabricante.");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    // HISTÓRICO
    const [histLoading, setHistLoading] = useState(false);
    const [histErr, setHistErr] = useState("");
    const [histRows, setHistRows] = useState<HistoricoRow[]>([]);
    const [histQ, setHistQ] = useState("");
    const [histTipo, setHistTipo] = useState<"Todos" | HistoricoRow["tipo"]>("Todos");
    const [histLimit, setHistLimit] = useState(300);

    async function loadHistorico() {
        setHistLoading(true);
        setHistErr("");
        try {
            const resp = await apiGet<HistoricoResp>({
                historico: 1,
                limit: Math.max(1, Math.min(500, histLimit)),
                q: histQ.trim() || undefined,
                tipo: histTipo !== "Todos" ? histTipo : undefined,
            });
            if (!resp.ok) throw new Error(resp.msg || "Falha ao carregar histórico.");
            setHistRows(resp.rows || []);
        } catch (e: any) {
            setHistErr(e?.message || "Erro ao carregar histórico.");
        } finally {
            setHistLoading(false);
        }
    }

    useEffect(() => {
        if (tab === "HISTORICO") loadHistorico();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const tabs = useMemo(
        () =>
            [
                ["HOME", "Movimentação"],
                ["ENTRADA", "Entrada"],
                ["ESTOQUE", "Estoque"],
                ["CONFERENCIA", "Conferência"],
                ["HISTORICO", "Histórico"],
                ["AVANCADO", "Avançado"],
            ] as const,
        []
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
                <Card className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Admin do Estoque</h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Entrada (aba própria), Saída e Transferência (dentro de Movimentação), Estoque por depósito (com filtro de Alertas), Histórico e Avançado.
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                Operador (fixo): <b>{me ? `${me.nome} (${me.usuario})` : "—"}</b>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Badge>Alertas: {alertCount}</Badge>
                            <Button variant="ghost" onClick={refreshInit} disabled={loading} type="button">
                                Atualizar
                            </Button>
                        </div>
                    </div>

                    {initErr ? (
                        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {initErr}{" "}
                            <button className="underline" onClick={refreshInit} type="button">
                                Tentar novamente
                            </button>
                        </div>
                    ) : null}
                </Card>

                <div className="mt-4">
                    <div className="grid grid-cols-2 gap-2 sm:hidden">
                        {tabs.map(([k, label]) => (
                            <TabButton key={k} label={label} active={tab === (k as UiTab)} onClick={() => setTab(k as UiTab)} />
                        ))}
                    </div>

                    <Card className="hidden p-2 sm:block">
                        <div className="grid grid-cols-6 gap-2">
                            {tabs.map(([k, label]) => (
                                <TabButton key={k} label={label} active={tab === (k as UiTab)} onClick={() => setTab(k as UiTab)} />
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* HOME / MOVIMENTAÇÃO */}
                    {tab === "HOME" ? (
                        <Card className="p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Saída</p>
                                    <p className="mt-1 text-xs text-slate-600">Selecione solicitante, depósito, destino, produto e quantidade.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setSaidaOpen(true)} type="button">
                                            Abrir Saída
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Transferência</p>
                                    <p className="mt-1 text-xs text-slate-600">Move quantidade de origem para destino com validação de saldo.</p>
                                    <div className="mt-3">
                                        <Button onClick={() => setTrfOpen(true)} type="button">
                                            Abrir Transferência
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Histórico</p>
                                    <p className="mt-1 text-xs text-slate-600">Auditoria: entradas/saídas/transferências e cadastros.</p>
                                    <div className="mt-3">
                                        <Button variant="ghost" onClick={() => setTab("HISTORICO")} type="button">
                                            Ver Histórico
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                Dica: na Entrada/Saída/Transferência você pode usar <b>câmera</b> para ler o código de barras.
                                <br />
                                NOVO: em <b>Saída</b> e <b>Transferência</b>, após o scan aparece um <b>popup</b> com o produto, saldo e seleção de quantidade (OK adiciona na lista).
                            </div>
                        </Card>
                    ) : null}

                    {/* ENTRADA (atalho) */}
                    {tab === "ENTRADA" ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base font-semibold text-slate-900">Entrada</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Leia/digite o código de barras. Se não existir, cadastre o produto. Pode montar lista de vários itens.
                                        <br />
                                        NOVO: filtro de <b>depósito</b> + <b>fabricante</b> e barra de pesquisa para listar produtos filtrados.
                                    </p>
                                </div>
                                <Button onClick={() => setEntradaOpen(true)} variant="ghost" type="button">
                                    Abrir Entrada
                                </Button>
                            </div>
                        </Card>
                    ) : null}

                    {/* ESTOQUE */}
                    {tab === "ESTOQUE" ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Estoque (por depósito)</h2>
                                    <p className="mt-1 text-sm text-slate-600">Busca por nome/código/categoria/fabricante e filtro.</p>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                    

                                    <Button variant="soft" onClick={exportarEstoqueCSV} type="button" disabled={loading || !estoqueRows.length}>
                                        ⬇️ CSV
                                    </Button>
                                    <Button variant="soft" onClick={exportarEstoquePDF} type="button" disabled={loading || !estoqueRows.length}>
                                        🧾 PDF
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-7">
                                <Field label="Pesquisar">
                                    <TextInput
                                        value={qEstoque}
                                        onChange={(e) => setQEstoque(e.target.value)}
                                        placeholder="Nome, código, depósito, categoria, fabricante, classificação..."
                                    />
                                </Field>

                                <MultiSelectDropdown
                                    label="Depósito"
                                    options={depositos}
                                    selectedIds={depFiltroEstoque}
                                    onChangeIds={setDepFiltroEstoque}
                                    allLabel="Todos"
                                />

                                <MultiSelectDropdown
                                    label="Categoria"
                                    options={categorias}
                                    selectedIds={catFiltroEstoque}
                                    onChangeIds={setCatFiltroEstoque}
                                    allLabel="Todas"
                                />

                                <MultiSelectDropdown
                                    label="Fabricante"
                                    options={fabricantes}
                                    selectedIds={fabFiltroEstoque}
                                    onChangeIds={setFabFiltroEstoque}
                                    allLabel="Todos"
                                />

                                <MultiSelectDropdown
                                    label="Classificação"
                                    options={classificacoes}
                                    selectedIds={classFiltroEstoque}
                                    onChangeIds={setClassFiltroEstoque}
                                    allLabel="Todas"
                                />

                                <Field label="Somente alerta (≤ mín)">
                                    <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                                        <input
                                            id="onlyLow"
                                            type="checkbox"
                                            checked={onlyLow}
                                            onChange={(e) => setOnlyLow(e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        <label htmlFor="onlyLow" className="text-sm text-slate-700">
                                            Mostrar
                                        </label>
                                    </div>
                                </Field>

                                <Field label="Ações">
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setOnlyLow(true)} type="button">
                                            Alertas ({alertCount})
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                // opcional: limpar todos os filtros rápido
                                                setDepFiltroEstoque([]);
                                                setCatFiltroEstoque([]);
                                                setFabFiltroEstoque([]);
                                                setClassFiltroEstoque([]);
                                                setOnlyLow(false);
                                                setQEstoque("");
                                            }}
                                            type="button"
                                        >
                                            Limpar filtros
                                        </Button>
                                    </div>
                                </Field>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {loading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : estoqueRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <>
                                        {/* MOBILE */}
                                        <ul className="divide-y divide-slate-200 sm:hidden">
                                            {estoqueRows.map(({ p, d, qtd, min, max, rep, hasMinMax }) => {
                                                const low = hasMinMax && qtd <= min;
                                                const valorNum = Number(p.valor) || 0;

                                                const foto = normalizeImgUrl(p.foto_url);

                                                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : null);
                                                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : null);

                                                // ✅ NOVO: Classificação (fallback)
                                                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : null);

                                                return (
                                                    <li key={`${p.id}_${d.id}`}>
                                                        <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <PhotoThumb
                                                                    url={foto}
                                                                    onClick={() => {
                                                                        if (!foto) return;
                                                                        setImgUrl(foto);
                                                                        setImgTitle(p.nome);
                                                                        setImgOpen(true);
                                                                    }}
                                                                />
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openProdutoEditor(p.id, d.id)}
                                                                            className="truncate text-left text-sm font-semibold text-slate-900 hover:underline"
                                                                            title="Clique para editar"
                                                                        >
                                                                            {p.nome}
                                                                        </button>

                                                                        {low ? <span className="text-xs text-red-600 shrink-0">• alerta</span> : null}
                                                                    </div>
                                                                    <p className="mt-0.5 truncate text-xs text-slate-600">
                                                                        CB: <b>{p.codigo_barras}</b> • Depósito: <b>{d.nome}</b> • Valor {moneyBRL(valorNum)}
                                                                    </p>
                                                                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                                                        {cat ? (
                                                                            <>
                                                                                Categoria: <b>{cat}</b>
                                                                            </>
                                                                        ) : null}

                                                                        {cat && fab ? " • " : null}

                                                                        {fab ? (
                                                                            <>
                                                                                Fabricante: <b>{fab}</b>
                                                                            </>
                                                                        ) : null}

                                                                        {/* ✅ NOVO: Classificação */}
                                                                        {cls ? (
                                                                            <>
                                                                                {(cat || fab) ? " • " : null}
                                                                                Classificação: <b>{cls}</b>
                                                                            </>
                                                                        ) : null}
                                                                    </p>
                                                                    
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <p className={["text-sm font-semibold", low ? "text-red-700" : "text-slate-900"].join(" ")}>
                                                                    {qtd}
                                                                </p>

                                                                {showMinRepColumns ? (
                                                                    <p className="text-xs text-slate-500">
                                                                        Min {hasMinMax ? min : "—"} • Rep{" "}
                                                                        <span className={hasMinMax ? "font-semibold text-emerald-700" : "text-slate-500"}>
                                                                            {hasMinMax ? rep : "—"}
                                                                        </span>
                                                                    </p>
                                                                ) : null}
                                                            </div>

                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        {/* PC */}
                                                {/* PC (ESTOQUE - correto, independente do PDF) */}
                                                <div className="hidden sm:block">
                                                    <div className="overflow-auto">
                                                        <table className="min-w-full border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Produto</th>
                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Depósito</th>
                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Categoria</th>
                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Fabricante</th>
                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Classificação</th>

                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd</th>

                                                                    {showMinRepColumns ? (
                                                                        <>
                                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Mín</th>
                                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Rep</th>
                                                                        </>
                                                                    ) : null}

                                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Valor (un)</th>
                                                                </tr>
                                                            </thead>


                                                            <tbody>
                                                                {estoqueRows.map(({ p, d, qtd, min, max, rep, hasMinMax }) => {
                                                                    const low = hasMinMax && clampInt(qtd) <= clampInt(min);

                                                                    const cat =
                                                                        p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "—";
                                                                    const fab =
                                                                        p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "—";
                                                                    const cls =
                                                                        p.classificacao_nome ||
                                                                        (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") ||
                                                                        "—";

                                                                    const valorNum = Number(p.valor) || 0;
                                                                    const foto = normalizeImgUrl(p.foto_url);

                                                                    return (
                                                                        <tr key={`${p.id}_${d.id}`} className="bg-white hover:bg-slate-50">
                                                                            {/* Produto (com editar) */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <PhotoThumb
                                                                                        url={foto}
                                                                                        onClick={() => {
                                                                                            if (!foto) return;
                                                                                            setImgUrl(foto);
                                                                                            setImgTitle(p.nome);
                                                                                            setImgOpen(true);
                                                                                        }}
                                                                                    />

                                                                                    <div className="min-w-0">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => openProdutoEditor(p.id, d.id)}
                                                                                            className="block truncate text-left font-semibold text-slate-900 hover:underline"
                                                                                            title="Clique para editar"
                                                                                        >
                                                                                            {p.nome}
                                                                                        </button>
                                                                                        <div className="text-xs text-slate-500 font-mono">CB: {p.codigo_barras}</div>
                                                                                    </div>
                                                                                </div>
                                                                            </td>

                                                                            {/* Depósito */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{d.nome}</td>

                                                                            {/* Categoria */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{cat}</td>

                                                                            {/* Fabricante */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{fab}</td>

                                                                            {/* Classificação */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{cls}</td>

                                                                            {/* Qtd */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-right text-sm font-semibold">
                                                                                <span className={low ? "text-rose-700" : "text-slate-900"}>{clampInt(qtd)}</span>
                                                                            </td>

                                                                            {showMinRepColumns ? (
                                                                                <>
                                                                                    {/* Mín */}
                                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-700">
                                                                                        {hasMinMax ? clampInt(min) : "—"}
                                                                                    </td>

                                                                                    {/* Rep */}
                                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm">
                                                                                        {hasMinMax ? (
                                                                                            <span className="font-semibold text-emerald-700">{clampInt(rep)}</span>
                                                                                        ) : (
                                                                                            <span className="text-slate-500">—</span>
                                                                                        )}
                                                                                    </td>
                                                                                </>
                                                                            ) : null}

                                                                            {/* Valor */}
                                                                            <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-700">
                                                                                {valorNum ? moneyBRL(valorNum) : "—"}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>


                                                            <tfoot>
                                                                <tr className="bg-slate-50 text-xs text-slate-700">
                                                                    <td className="border-t border-slate-200 px-3 py-3 font-semibold" colSpan={5}>
                                                                        Total de modelos: <span className="text-slate-900">{estoqueResumo.totalModelos}</span>
                                                                    </td>

                                                                    {/* Total Qtd */}
                                                                    <td className="border-t border-slate-200 px-3 py-3 text-right font-bold text-slate-900">
                                                                        {estoqueResumo.totalUnidades}
                                                                    </td>

                                                                    {showMinRepColumns ? (
                                                                        <>
                                                                            <td className="border-t border-slate-200 px-3 py-3" />
                                                                            <td className="border-t border-slate-200 px-3 py-3" />
                                                                        </>
                                                                    ) : null}

                                                                    {/* Total Valor */}
                                                                    <td className="border-t border-slate-200 px-3 py-3 text-right font-bold text-slate-900">
                                                                        {moneyBRL(estoqueResumo.totalValor)}
                                                                    </td>
                                                                </tr>
                                                            </tfoot>

                                                        </table>
                                                    </div>
                                                </div>

                                    </>
                                )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-sm text-slate-700">
                                    Itens (unidades): <b>{estoqueResumo.totalUnidades}</b>
                                </div>

                                <div className="text-sm text-slate-700">
                                    Valor total (mercadoria): <b>{moneyBRL(estoqueResumo.totalValor)}</b>
                                </div>
                            </div>



                        </Card>
                    ) : null}

                    {/* CONFERÊNCIA */}
                    {tab === "CONFERENCIA" ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Conferência</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Preencha a <b>Qtd física</b> e compare com a <b>Qtd do sistema</b>. Não altera saldo.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        type="button"
                                        onClick={() => setConfFisicoByProd({})}
                                        disabled={!conferenciaRows.length}
                                    >
                                        Limpar físicos
                                    </Button>

                                    <Button
                                        variant="soft"
                                        type="button"
                                        onClick={exportarConferenciaCSV}
                                        disabled={!conferenciaRows.length || !confDepositoId}
                                    >
                                        ⬇️ CSV
                                    </Button>

                                    <Button
                                        variant="soft"
                                        type="button"
                                        onClick={exportarConferenciaPDF}
                                        disabled={!conferenciaRows.length || !confDepositoId}
                                    >
                                        🧾 PDF
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <Field label="Depósito (estoque)">
                                    <Select
                                        value={confDepositoId}
                                        onChange={(e) => {
                                            const id = Number(e.target.value);
                                            setConfDepositoId(id);
                                            setConfFisicoByProd({});
                                        }}
                                    >
                                        <option value={0} disabled>Selecionar...</option>
                                        {depositos.map((d) => (
                                            <option key={d.id} value={d.id}>{d.nome}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Fabricante">
                                    <Select
                                        value={confFabId as any}
                                        onChange={(e) => setConfFabId(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
                                    >
                                        <option value="Todos">Todos</option>
                                        {fabricantes.map((f) => (
                                            <option key={f.id} value={f.id}>{f.nome}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Categoria">
                                    <Select
                                        value={confCatId as any}
                                        onChange={(e) => setConfCatId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}
                                    >
                                        <option value="Todas">Todas</option>
                                        {categorias.map((c) => (
                                            <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Classificação">
                                    <Select
                                        value={confClassId as any}
                                        onChange={(e) => setConfClassId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}
                                    >
                                        <option value="Todas">Todas</option>
                                        {classificacoes.map((c) => (
                                            <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Buscar">
                                    <TextInput
                                        value={confQ}
                                        onChange={(e) => setConfQ(e.target.value)}
                                        placeholder="Produto, CB, fabricante..."
                                    />
                                </Field>

                                <Field label="Resumo">
                                    <div className="flex h-[42px] items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
                                        Itens: <b className="ml-2">{conferenciaRows.length}</b>
                                    </div>
                                </Field>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {loading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : conferenciaRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <>
                                        {/* MOBILE */}
                                                <ul className="divide-y divide-slate-200 sm:hidden">
                                                    {conferenciaRows.map((r) => {
                                                        const fisTxt = confFisicoByProd[r.p.id] ?? "";
                                                        const fis = parseFisico(fisTxt);
                                                        const diff = fis === null ? null : fis - r.qtdSistema;
                                                        const ok = diff !== null && diff === 0;

                                                        const icon = fis === null ? "—" : ok ? "✅" : "❌";
                                                        const iconCls =
                                                            fis === null
                                                                ? "text-slate-400"
                                                                : ok
                                                                    ? "text-emerald-600"
                                                                    : "text-rose-600";

                                                        return (
                                                            <li key={r.p.id} className="px-4 py-2">
                                                                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                                                    <div className="flex items-center gap-3">
                                                                        {/* NOME: sempre completo (pode quebrar linha) */}
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-[13px] font-semibold text-slate-900 leading-snug whitespace-normal break-words">
                                                                                {r.p.nome}
                                                                            </p>
                                                                        </div>

                                                                        {/* SISTEMA: label curto em cima do número */}
                                                                        <div className="shrink-0 flex flex-col items-center">
                                                                            <span className="text-[10px] leading-none text-slate-500">Sist</span>
                                                                            <span className="mt-1 inline-flex min-w-[44px] justify-center rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-900">
                                                                                {r.qtdSistema}
                                                                            </span>
                                                                        </div>

                                                                        {/* FÍSICO: menor (metade) e mais à direita */}
                                                                        <div className="shrink-0 w-[72px]">
                                                                            <TextInput
                                                                                inputMode="numeric"
                                                                                value={fisTxt}
                                                                                onChange={(e) =>
                                                                                    setConfFisicoByProd((prev) => ({
                                                                                        ...prev,
                                                                                        [r.p.id]: e.target.value.replace(/\D/g, ""),
                                                                                    }))
                                                                                }
                                                                                placeholder="Fís."
                                                                            />
                                                                        </div>

                                                                        {/* STATUS */}
                                                                        <div className="shrink-0 w-7 flex justify-end">
                                                                            <span className={fis === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600"}>
                                                                                {fis === null ? "—" : ok ? "✅" : "❌"}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>

                                                        );
                                                    })}
                                                </ul>


                                        {/* PC */}
                                        <div className="hidden sm:block">
                                            <div className="overflow-auto">
                                                <table className="min-w-full border-separate border-spacing-0">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Produto</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Fabricante</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Sistema</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Qtd Física</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Dif.</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-center">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {conferenciaRows.map((r) => {
                                                            const fisTxt = confFisicoByProd[r.p.id] ?? "";
                                                            const fis = parseFisico(fisTxt);
                                                            const ok = fis !== null && fis === r.qtdSistema;
                                                            const diff = fis === null ? null : fis - r.qtdSistema;

                                                            return (
                                                                <tr key={r.p.id} className="bg-white">
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                                        <div className="font-semibold">{r.p.nome}</div>
                                                                        <div className="text-xs text-slate-500 font-mono">CB: {r.p.codigo_barras}</div>
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">
                                                                        {r.fabricante || "—"}
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900">
                                                                        {r.qtdSistema}
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2">
                                                                        <TextInput
                                                                            inputMode="numeric"
                                                                            value={fisTxt}
                                                                            onChange={(e) =>
                                                                                setConfFisicoByProd((prev) => ({
                                                                                    ...prev,
                                                                                    [r.p.id]: e.target.value.replace(/\D/g, ""),
                                                                                }))
                                                                            }
                                                                            placeholder="Qtd física..."
                                                                        />
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm">
                                                                        <span className={diff === null ? "text-slate-500" : ok ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                                                                            {diff === null ? "—" : diff}
                                                                        </span>
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-center">
                                                                        <span className={fis === null ? "text-slate-500" : ok ? "text-emerald-700" : "text-rose-700"}>
                                                                            {fis === null ? "—" : ok ? "✅" : "❌"}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                                Dica: o botão <b>PDF</b> abre a impressão — no celular/PC você pode escolher <b>Salvar como PDF</b>.
                            </div>
                        </Card>
                    ) : null}


                    {/* HISTÓRICO */}
                    {tab === "HISTORICO" ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Histórico</h2>
                                    <p className="mt-1 text-sm text-slate-600">Auditoria de movimentações (Entrada/Saída/Transferência + Cadastro).</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={loadHistorico} disabled={histLoading} type="button">
                                        Atualizar
                                    </Button>
                                </div>
                            </div>

                            {histErr ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{histErr}</div> : null}

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-3">
                                    <Field label="Buscar (produto, CB, destino, obs)">
                                        <TextInput value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Ex: URNA, 1745..., Obra X" />
                                    </Field>
                                </div>

                                <Field label="Tipo">
                                    <Select value={histTipo} onChange={(e) => setHistTipo(e.target.value as "Todos" | HistoricoRow["tipo"])}>
                                        <option value="Todos">Todos</option>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                        <option value="TRANSFERENCIA">Transferência</option>
                                        <option value="CADASTRO_PRODUTO">Cadastro produto</option>
                                    </Select>
                                </Field>

                                <Field label="Limite">
                                    <Select value={histLimit} onChange={(e) => setHistLimit(Number(e.target.value))}>
                                        <option value={80}>80</option>
                                        <option value={120}>120</option>
                                        <option value={300}>300</option>
                                        <option value={500}>500</option>
                                    </Select>
                                </Field>

                                <div className="sm:col-span-6 flex flex-wrap gap-2">
                                    <Button onClick={loadHistorico} disabled={histLoading} type="button">
                                        Filtrar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setHistQ("");
                                            setHistTipo("Todos");
                                            setTimeout(() => loadHistorico(), 0);
                                        }}
                                        disabled={histLoading}
                                        type="button"
                                    >
                                        Limpar
                                    </Button>

                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-xs text-slate-500">Mostrando: {histRows.length}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {histLoading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : histRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {histRows.map((h) => {
                                            const tipoBadge =
                                                h.tipo === "ENTRADA"
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : h.tipo === "SAIDA"
                                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                                        : h.tipo === "TRANSFERENCIA"
                                                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                            : "bg-slate-50 text-slate-700 border-slate-200";

                                            const origem = h.deposito_origem_nome || (h.deposito_origem_id ? depById.get(h.deposito_origem_id)?.nome : null);
                                            const destino = h.deposito_destino_nome || (h.deposito_destino_id ? depById.get(h.deposito_destino_id)?.nome : null);

                                            return (
                                                <li key={h.id} className="px-4 py-3">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tipoBadge}`}>{h.tipo}</span>
                                                                <span className="text-xs text-slate-500">{fmtDateTime(h.criado_em)}</span>
                                                            </div>

                                                            <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                                                                {h.produto_nome || `Produto ${h.produto_id}`}{" "}
                                                                <span className="text-xs font-normal text-slate-500">• CB {h.codigo_barras_snapshot}</span>
                                                            </p>

                                                            <p className="mt-0.5 text-xs text-slate-600">
                                                                {h.tipo === "ENTRADA" ? (
                                                                    <>
                                                                        Depósito: <b>{destino || "—"}</b>
                                                                    </>
                                                                ) : h.tipo === "SAIDA" ? (
                                                                    <>
                                                                        Depósito: <b>{origem || "—"}</b> • Destino: <b>{h.destino_texto || "—"}</b>
                                                                    </>
                                                                ) : h.tipo === "TRANSFERENCIA" ? (
                                                                    <>
                                                                        Origem: <b>{origem || "—"}</b> → Destino: <b>{destino || "—"}</b>
                                                                    </>
                                                                ) : (
                                                                    <>—</>
                                                                )}
                                                            </p>

                                                            <p className="mt-0.5 text-[11px] text-slate-500">
                                                                Operador: <b>{h.operador_nome || userById.get(h.operador_usuario_id)?.nome || `#${h.operador_usuario_id}`}</b>
                                                                {h.solicitante_usuario_id ? (
                                                                    <>
                                                                        {" "}
                                                                        • Solicitante: <b>{h.solicitante_nome || userById.get(h.solicitante_usuario_id)?.nome || `#${h.solicitante_usuario_id}`}</b>
                                                                    </>
                                                                ) : null}
                                                                {h.observacao ? <> • Obs: {h.observacao}</> : null}
                                                            </p>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <p className="text-sm font-semibold text-slate-900">{h.quantidade === null ? "—" : h.quantidade}</p>
                                                            <p className="text-xs text-slate-500">qtd</p>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </Card>
                    ) : null}

                    {/* AVANÇADO */}
                    {tab === "AVANCADO" ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Avançado</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Ações administrativas em popups (mais organizado).
                                    </p>
                                </div>

                                <Button variant="ghost" onClick={() => setTab("ESTOQUE")} type="button">
                                    Voltar
                                </Button>
                            </div>

                            {/* GRID DE AÇÕES */}
                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {/* Produtos */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Cadastrar novo produto</p>
                                    <p className="mt-1 text-xs text-slate-600">Use apenas quando autorizado.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvNovoProdutoOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Ajuste manual de saldos</p>
                                    <p className="mt-1 text-xs text-slate-600">Gera AJUSTE. Use com cuidado.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvAjusteOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                {/* Depósitos */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar depósito</p>
                                    <p className="mt-1 text-xs text-slate-600">Cria um novo depósito.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvDepAddOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear depósito</p>
                                    <p className="mt-1 text-xs text-slate-600">Altera o nome de um depósito.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvDepRenameOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                {/* Categorias */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar categoria</p>
                                    <p className="mt-1 text-xs text-slate-600">Cria uma nova categoria.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvCatAddOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear categoria</p>
                                    <p className="mt-1 text-xs text-slate-600">Altera o nome de uma categoria.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvCatRenameOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                {/* Fabricantes */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar fabricante</p>
                                    <p className="mt-1 text-xs text-slate-600">Cria um novo fabricante.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvFabAddOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear fabricante</p>
                                    <p className="mt-1 text-xs text-slate-600">Altera o nome de um fabricante.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvFabRenameOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                {/* Export / Import */}
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Exportação (CSV)</p>
                                    <p className="mt-1 text-xs text-slate-600">Exporta CSV por depósito (conferência).</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvExportOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-semibold text-slate-900">Importar via CSV</p>
                                    <p className="mt-1 text-xs text-slate-600">Importa produtos e saldos.</p>
                                    <div className="mt-3">
                                        <Button variant="soft" onClick={() => setAdvImportOpen(true)} type="button" className="w-full">
                                            Abrir
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : null}

                </div>
            </div>

            {/* POPUP IMAGEM */}
            <ImagePreviewModal open={imgOpen} onClose={() => setImgOpen(false)} url={imgUrl} title={imgTitle} />

            {/* MODAL: EDITAR PRODUTO */}
            <Modal
                open={prodEditOpen}
                title="Editar produto"
                subtitle="Edite o cadastro do produto."
                onClose={() => setProdEditOpen(false)}
            >
                {(() => {
                    const p = prodEditId ? prodById.get(prodEditId) : null;
                    const fotoAtual = p?.foto_url ? normalizeImgUrl(p.foto_url) : null;
                    const fotoPreview = editFotoNova || fotoAtual;

                    return (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                    {fotoPreview ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={fotoPreview} alt="Foto do produto" className="h-20 w-20 object-cover" />
                                    ) : (
                                        <div className="flex h-20 w-20 items-center justify-center text-2xl">🖼️</div>
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{p?.nome || "—"}</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        Código de barras: <b>{p?.codigo_barras || "—"}</b>
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-500">Atualizado: {p?.atualizado_em ? fmtDateTime(p.atualizado_em) : "—"}</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-3">
                                <p className="text-sm font-semibold text-slate-900">Cadastro</p>

                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Nome">
                                        <TextInput value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                                    </Field>

                                    <Field label="Valor (R$)">
                                        <TextInput type="text" inputMode="numeric" value={editValor} onChange={(e) => setEditValor(maskBRLInput(e.target.value))} placeholder="R$ 0,00" />
                                    </Field>

                                    <Field label="Mínimo (padrão do produto)">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            value={editMin}
                                            onChange={(e) => setEditMin(clampInt(e.target.value))}
                                        />
                                    </Field>

                                    <Field label="Máximo (padrão do produto)">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            value={editMax}
                                            onChange={(e) => setEditMax(clampInt(e.target.value))}
                                        />
                                    </Field>

                                    {/* ✅ NOVO: Min/Max por depósito */}
                                    <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <p className="text-sm font-semibold text-slate-900">Mín/Máx por depósito</p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Escolha o depósito e ajuste o mínimo/máximo daquele estoque.
                                        </p>

                                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <Field label="Depósito">
                                                <Select
                                                    value={editMinMaxDepId}
                                                    onChange={(e) => setEditMinMaxDepId(Number(e.target.value))}
                                                >
                                                    <option value={0} disabled>Selecionar...</option>
                                                    {depositos.map((d) => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.nome}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </Field>

                                            <Field label="Mínimo (depósito)">
                                                <TextInput
                                                    type="number"
                                                    min={0}
                                                    value={editMinDep}
                                                    onChange={(e) => setEditMinDep(clampInt(e.target.value))}
                                                    disabled={!editMinMaxDepId}
                                                />
                                            </Field>

                                            <Field label="Máximo (depósito)">
                                                <TextInput
                                                    type="number"
                                                    min={0}
                                                    value={editMaxDep}
                                                    onChange={(e) => setEditMaxDep(clampInt(e.target.value))}
                                                    disabled={!editMinMaxDepId}
                                                />
                                            </Field>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Button
                                                variant="soft"
                                                type="button"
                                                onClick={salvarMinMaxDoDeposito}
                                                disabled={!prodEditId || !editMinMaxDepId || minMaxBusy}
                                            >
                                                {minMaxBusy ? "Salvando..." : "Salvar mín/máx deste depósito"}
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                type="button"
                                                onClick={() => {
                                                    setEditMinMaxDepId(0);
                                                    setEditMinDep(0);
                                                    setEditMaxDep(0);
                                                }}
                                            >
                                                Limpar
                                            </Button>
                                        </div>
                                    </div>

                                    <Field label="Categoria">
                                        <Select value={editCatId} onChange={(e) => setEditCatId(Number(e.target.value))}>
                                            <option value={0}>—</option>
                                            {categorias.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Fabricante">
                                        <Select value={editFabId} onChange={(e) => setEditFabId(Number(e.target.value))}>
                                            <option value={0}>—</option>
                                            {fabricantes.map((f) => (
                                                <option key={f.id} value={f.id}>
                                                    {f.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Classificação">
                                        <Select value={editClassId} onChange={(e) => setEditClassId(Number(e.target.value))}>
                                            <option value={0}>—</option>
                                            {classificacoes.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <div className="sm:col-span-2">
                                        <Field label="Nova foto (opcional)" hint="Envie uma imagem para substituir a atual.">
                                            <input type="file" accept="image/*" onChange={(e) => onProdutoFotoNova(e.target.files?.[0])} className="block w-full text-sm text-slate-700" />
                                        </Field>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {fotoPreview ? (
                                                <Button
                                                    variant="ghost"
                                                    type="button"
                                                    onClick={() => {
                                                        setImgUrl(fotoPreview);
                                                        setImgTitle(p?.nome || "Imagem do produto");
                                                        setImgOpen(true);
                                                    }}
                                                >
                                                    Ver imagem
                                                </Button>
                                            ) : null}

                                            {editFotoNova ? (
                                                <Button variant="ghost" type="button" onClick={() => setEditFotoNova("")}>
                                                    Remover nova foto
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button onClick={salvarCadastroProduto} disabled={prodBusy || !editNome.trim()} type="button">
                                        Salvar cadastro
                                    </Button>
                                    <Button variant="ghost" onClick={() => setProdEditOpen(false)} disabled={prodBusy} type="button">
                                        Fechar
                                    </Button>
                                </div>
                            </div>

                            
                        </div>
                    );
                })()}
            </Modal>

            {/* MODAL: ENTRADA */}
            <Modal
                open={entradaOpen}
                title="Entrada"
                subtitle="Monte a lista e conclua. Se o produto não existir, cadastre na hora."
                onClose={cancelarEntrada}
            >
                <div className="space-y-4">
                    {/* ✅ 2 colunas por linha + ordem solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (entrada) + Fabricante */}
                        <Field label="Depósito (entrada)">
                            <Select
                                value={entradaDepositoId}
                                onChange={(e) => {
                                    setEntradaDepositoId(Number(e.target.value));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Fabricante (filtro)">
                            <Select
                                value={entradaFabFiltroId as any}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setEntradaFabFiltroId(v === "Todos" ? "Todos" : Number(v));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                <option value="Todos">Todos</option>
                                {fabricantes.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Categoria + Buscar Produto */}
                        <Field label="Categoria (filtro)">
                            <Select
                                value={entradaCatFiltroId as any}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setEntradaCatFiltroId(v === "Todas" ? "Todas" : Number(v));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                <option value="Todas">Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <div>
                            <ProductCombobox
                                label="Buscar produto (no depósito, filtrado)"
                                placeholder="Digite nome ou código..."
                                produtos={entradaProdutosNoDeposito}
                                valueId={entradaProdutoId}
                                onChangeId={(id) => {
                                    setEntradaProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setEntradaBarcode(p.codigo_barras);
                                        setEntradaProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={entradaSaldoByProd}
                                query={entradaProdQuery}
                                setQuery={setEntradaProdQuery}
                                disabled={!entradaDepositoId}
                            />

                            {entradaProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Estoque atual neste depósito: <b>{entradaSaldoByProd.get(entradaProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* ✅ Código + Scan (sempre na mesma linha) */}
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                                <Field label="Código de barras">
                                    <TextInput
                                        value={entradaBarcode}
                                        onChange={(e) => setEntradaBarcode(e.target.value)}
                                        placeholder="Ex: 789..."
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>

                            <div className="w-[120px]">
                                <Field label="Scan">
                                    <Button
                                        variant="soft"
                                        onClick={() => setEntradaScanOpen(true)}
                                        type="button"
                                        className="w-full"
                                    >
                                        📷 Ler
                                    </Button>
                                </Field>
                            </div>
                        </div>


                        <Field label="Scan" hint="Use a câmera para preencher o código.">
                            <Button
                                variant="soft"
                                onClick={() => setEntradaScanOpen(true)}
                                type="button"
                                className="w-full"
                            >
                                📷 Ler código
                            </Button>
                        </Field>

                        {/* 4ª linha: Quantidade + Adicionar à lista */}
                        <Field label="Quantidade">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={entradaQtd}
                                onChange={(e) => setEntradaQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button
                                variant="soft"
                                onClick={addEntradaItemToList}
                                type="button"
                                className="w-full"
                                disabled={!entradaProdutoExistente}
                            >
                                + Adicionar
                            </Button>

                        </Field>
                    </div>

                    {/* status produto */}
                    {entradaProdutoExistente ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Produto encontrado: <b>{entradaProdutoExistente.nome}</b>{" "}
                            <span className="text-xs text-emerald-700">• clique no nome na tabela de estoque para editar</span>
                        </div>
                    ) : entradaBarcode.trim() ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <b>Produto não cadastrado.</b> Por gentileza, solicite a criação de um novo produto ao setor responsável.
                        </div>
                    ) : (

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            Informe o código de barras para continuar.
                        </div>
                    )}

                    {/* ✅ Itens na fila */}
                    {entradaItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Itens na fila</p>
                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {entradaItens.map((it) => (
                                    <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                                        <div className="min-w-0 flex-1">
                                            {/* ✅ Nome em 2 linhas (sem plugin) */}
                                            <p
                                                className="text-sm font-semibold text-slate-900 leading-snug"
                                                style={{
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: "vertical",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                {it.nome}
                                            </p>

                                            {/* ✅ Quantidade maior e mais visível */}
                                            <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                <span className="text-xs text-slate-600">Qtd</span>
                                                <span className="text-lg font-bold leading-none text-slate-900">{it.qtd}</span>
                                            </div>
                                        </div>

                                        {/* ✅ Botão pequeno (não ocupa tudo) */}
                                        <Button
                                            variant="ghost"
                                            type="button"
                                            className="w-auto px-3 py-2 text-sm"
                                            onClick={() => setEntradaItens((prev) => prev.filter((x) => x.id !== it.id))}
                                        >
                                            Remover
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}


                    {/* ✅ Observação abaixo da fila */}
                    <Field label="Observação (opcional)" hint="Aplica na conclusão (para todos os itens do lote).">
                        <TextArea
                            value={entradaObs}
                            onChange={(e) => setEntradaObs(e.target.value)}
                            placeholder="Ex: NF 123 / Compra / Ajuste..."
                        />
                    </Field>

                    {/* ✅ Só 2 botões: Concluir (esquerda) e Cancelar (direita) */}
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={abrirConcluirEntrada}
                            type="button"
                            disabled={!entradaItens.length && !entradaProdutoExistente}
                        >
                            Concluir
                        </Button>

                        <Button variant="ghost" onClick={cancelarEntrada} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ✅ POPUP: CONCLUIR ENTRADA */}
            <Modal
                open={entradaConcluirOpen}
                title="Concluir entrada"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (entradaConcluirBusy) return;
                    setEntradaConcluirOpen(false);
                }}
            >
                <div className="space-y-3">

                    {/* ✅ RESUMO PEQUENO */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Operador:</span>{" "}
                                <b>{me?.nome ? `${me.nome} (${me.usuario})` : "—"}</b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {entradaDepositoId
                                        ? (depById.get(Number(entradaDepositoId))?.nome || `#${entradaDepositoId}`)
                                        : "—"}
                                </b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {entradaConcluirItens.map((it, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{it.nome}</p>
                                        <p className="text-xs text-slate-500">
                                            Quantidade: <b>{it.qtd}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO EMBAIXO */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={confirmarEntradaDoSnapshot} type="button" disabled={entradaConcluirBusy}>
                            {entradaConcluirBusy ? "Confirmando..." : "Confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setEntradaConcluirOpen(false)} type="button" disabled={entradaConcluirBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ✅ POPUP: SUCESSO */}
            <Modal
                open={entradaSucessoOpen}
                title="Sucesso"
                subtitle="A entrada foi realizada com sucesso."
                onClose={() => setEntradaSucessoOpen(false)}
            >
                <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        ✅ Entrada registrada com sucesso.
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={() => setEntradaSucessoOpen(false)} type="button">
                            OK
                        </Button>
                    </div>
                </div>
            </Modal>



            {/* MODAL: SAÍDA */}
            <Modal
                open={saidaOpen}
                title="Saída"
                subtitle="Selecione depósito (origem), destino, solicitante e itens. Valida saldo disponível."
                onClose={cancelarSaida}
            >
                <div className="space-y-4">
                    {/* ✅ Mesmo padrão da Entrada: 2 colunas por linha + sequência solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (origem) + Destino */}
                        <Field label="Depósito (origem)">
                            <Select value={saidaDepositoId} onChange={(e) => setSaidaDepositoId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Destino">
                            <Select value={saidaDestinoDepositoId} onChange={(e) => setSaidaDestinoDepositoId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Solicitante + Categoria */}
                        <Field label="Solicitante">
                            <Select value={saidaSolicitanteId} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome} ({u.usuario})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria (filtro)">
                            <Select
                                value={saidaCategoriaId as any}
                                onChange={(e) => setSaidaCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}
                            >
                                <option value="Todas">Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 3ª linha: Produto (full) */}
                        <div className="sm:col-span-2">
                            <ProductCombobox
                                label="Produto"
                                produtos={saidaProdutosNoDeposito}
                                valueId={saidaProdutoId}
                                onChangeId={(id) => {
                                    setSaidaProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setSaidaBarcode(p.codigo_barras);
                                        setSaidaProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={saidaSaldoByProd}
                                query={saidaProdQuery}
                                setQuery={setSaidaProdQuery}
                                disabled={!saidaDepositoId}
                            />

                            {saidaProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Disponível no depósito: <b>{saidaSaldoByProd.get(saidaProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* ✅ Código + Scan (sempre na mesma linha) */}
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                                <Field label="Código de barras (opcional)">
                                    <TextInput
                                        value={saidaBarcode}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSaidaBarcode(v);
                                            const p = produtos.find((x) => x.codigo_barras === v.trim());
                                            if (p) {
                                                setSaidaProdutoId(p.id);
                                                setSaidaProdQuery(p.nome);
                                            }
                                        }}
                                        placeholder="Digite ou use Scan"
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>

                            <div className="w-[120px]">
                                <Field label="Scan">
                                    <Button
                                        variant="soft"
                                        onClick={() => setSaidaScanOpen(true)}
                                        type="button"
                                        className="w-full"
                                    >
                                        📷 Scan
                                    </Button>
                                </Field>
                            </div>
                        </div>


                        <Field label="Scan" hint="Via Scan abre popup para escolher a quantidade e adicionar direto na lista.">
                            <Button variant="soft" onClick={() => setSaidaScanOpen(true)} type="button" className="w-full">
                                📷 Scan
                            </Button>
                        </Field>

                        {/* 5ª linha: Quantidade + Adicionar à lista */}
                        <Field label="Qtd">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={saidaQtd}
                                onChange={(e) => setSaidaQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button variant="soft" onClick={addSaidaItemToList} type="button" className="w-full" disabled={!saidaProdutoId}>
                                + Adicionar
                            </Button>
                        </Field>
                    </div>

                    {/* Itens na fila */}
                    {saidaItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Itens na fila</p>

                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {saidaItens.map((it) => {
                                    const pid = Number(it.payload?.produto_id || 0);
                                    const nome = prodById.get(pid)?.nome || it.resumo;
                                    const qtd = clampInt(it.payload?.quantidade);

                                    return (
                                        <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="text-sm font-semibold text-slate-900 leading-snug"
                                                    style={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {nome}
                                                </p>

                                                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <span className="text-xs text-slate-600">Qtd</span>
                                                    <span className="text-lg font-bold leading-none text-slate-900">{qtd}</span>
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                type="button"
                                                className="w-auto px-3 py-2 text-sm"
                                                onClick={() => setSaidaItens((prev) => prev.filter((x) => x.id !== it.id))}
                                            >
                                                Remover
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}


                    {/* Observação abaixo da fila (mesmo padrão da Entrada) */}
                    <Field label="Observação (opcional)">
                        <TextInput value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} placeholder="Ex: Obra X / Setor Y..." />
                    </Field>

                    {/* ✅ Botões finais: Confirmar (abre ConfirmDialog) e Cancelar */}
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={abrirConcluirSaida}
                            type="button"
                            disabled={!saidaItens.length && !saidaProdutoId}
                        >
                            Concluir
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* MODAL: TRANSFERÊNCIA */}
            <Modal
                open={trfOpen}
                title="Transferência"
                subtitle="Selecione depósito (origem), destino, solicitante e itens. Valida saldo disponível."
                onClose={cancelarTransferencia}
            >
                <div className="space-y-4">
                    {/* ✅ Mesmo padrão da Entrada: 2 colunas por linha + sequência solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (origem) + Destino */}
                        <Field label="Depósito (origem)">
                            <Select value={trfOrigemId} onChange={(e) => setTrfOrigemId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Depósito (destino)">
                            <Select value={trfDestinoId} onChange={(e) => setTrfDestinoId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Solicitante + Categoria */}
                        <Field label="Solicitante">
                            <Select value={trfSolicitanteId} onChange={(e) => setTrfSolicitanteId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome} ({u.usuario})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria (filtro)">
                            <Select
                                value={trfCategoriaId as any}
                                onChange={(e) => setTrfCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}
                            >
                                <option value="Todas">Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 3ª linha: Produto (full) */}
                        <div className="sm:col-span-2">
                            <ProductCombobox
                                label="Produto (na origem)"
                                produtos={trfProdutosNaOrigem}
                                valueId={trfProdutoId}
                                onChangeId={(id) => {
                                    setTrfProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setTrfBarcode(p.codigo_barras);
                                        setTrfProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={trfSaldoByProd}
                                query={trfProdQuery}
                                setQuery={setTrfProdQuery}
                                disabled={!trfOrigemId}
                            />

                            {trfProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Disponível na origem: <b>{trfSaldoByProd.get(trfProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* ✅ Código + Scan (sempre na mesma linha) */}
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                                <Field label="Código de barras (opcional)">
                                    <TextInput
                                        value={trfBarcode}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setTrfBarcode(v);
                                            const p = produtos.find((x) => x.codigo_barras === v.trim());
                                            if (p) {
                                                setTrfProdutoId(p.id);
                                                setTrfProdQuery(p.nome);
                                            }
                                        }}
                                        placeholder="Digite ou use Scan"
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>

                            <div className="w-[120px]">
                                <Field label="Scan">
                                    <Button
                                        variant="soft"
                                        onClick={() => setTrfScanOpen(true)}
                                        type="button"
                                        className="w-full"
                                    >
                                        📷 Scan
                                    </Button>
                                </Field>
                            </div>
                        </div>


                        <Field label="Scan" hint="Via Scan abre popup para escolher a quantidade e adicionar direto na lista.">
                            <Button variant="soft" onClick={() => setTrfScanOpen(true)} type="button" className="w-full">
                                📷 Scan
                            </Button>
                        </Field>

                        {/* 5ª linha: Quantidade + Adicionar à lista */}
                        <Field label="Qtd">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={trfQtd}
                                onChange={(e) => setTrfQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button variant="soft" onClick={addTrfItemToList} type="button" className="w-full" disabled={!trfProdutoId}>
                                + Adicionar
                            </Button>
                        </Field>
                    </div>

                    {/* Transferências na fila */}
                    {trfItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Transferências na fila</p>

                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {trfItens.map((it) => {
                                    const pid = Number(it.payload?.produto_id || 0);
                                    const nome = prodById.get(pid)?.nome || it.resumo;
                                    const qtd = clampInt(it.payload?.quantidade);

                                    return (
                                        <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="text-sm font-semibold text-slate-900 leading-snug"
                                                    style={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {nome}
                                                </p>

                                                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <span className="text-xs text-slate-600">Qtd</span>
                                                    <span className="text-lg font-bold leading-none text-slate-900">{qtd}</span>
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                type="button"
                                                className="w-auto px-3 py-2 text-sm"
                                                onClick={() => setTrfItens((prev) => prev.filter((x) => x.id !== it.id))}
                                            >
                                                Remover
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}


                    {/* Observação abaixo da fila (mesmo padrão da Entrada) */}
                    <Field label="Observação (opcional)">
                        <TextInput value={trfObs} onChange={(e) => setTrfObs(e.target.value)} placeholder="Ex: remanejamento / conferência..." />
                    </Field>

                    {/* ✅ Botões finais: Confirmar (abre ConfirmDialog) e Cancelar */}
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={abrirConcluirTransferencia}
                            type="button"
                            disabled={!trfItens.length && !trfProdutoId}
                        >
                            Concluir
                        </Button>
                    </div>

                </div>
            </Modal>


            {/* MODAL: CRIAR CATEGORIA (QUICK) */}
            <Modal open={catQuickOpen} title="Nova categoria" subtitle="Crie e selecione automaticamente." onClose={() => setCatQuickOpen(false)}>
                <div className="space-y-3">
                    <Field label="Nome">
                        <TextInput value={catQuickNome} onChange={(e) => setCatQuickNome(e.target.value)} placeholder="Ex: EPIs" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarCategoriaQuick} type="button" disabled={!catQuickNome.trim()}>
                            Criar
                        </Button>
                        <Button variant="ghost" onClick={() => setCatQuickOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: CRIAR FABRICANTE (QUICK) */}
            <Modal open={fabQuickOpen} title="Novo fabricante" subtitle="Crie e selecione automaticamente." onClose={() => setFabQuickOpen(false)}>
                <div className="space-y-3">
                    <Field label="Nome">
                        <TextInput value={fabQuickNome} onChange={(e) => setFabQuickNome(e.target.value)} placeholder="Ex: 3M" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarFabricanteQuick} type="button" disabled={!fabQuickNome.trim()}>
                            Criar
                        </Button>
                        <Button variant="ghost" onClick={() => setFabQuickOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* CONFIRMAÇÕES (Saída / Transferência) */}
            <Modal
                open={saidaConfirmOpen}
                title="Confirmar saída"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (saidaConfirmBusy) return;
                    setSaidaConfirmOpen(false);
                }}
            >
                <div className="mt-2 flex flex-col gap-3">

                    {/* ✅ RESUMO PEQUENO (1 linha, pode quebrar se faltar espaço) */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Solicitante:</span>{" "}
                                <b>
                                    {saidaSolicitanteId
                                        ? (userById.get(Number(saidaSolicitanteId))?.nome || `#${saidaSolicitanteId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Origem:</span>{" "}
                                <b>
                                    {saidaDepositoId
                                        ? (depById.get(Number(saidaDepositoId))?.nome || `#${saidaDepositoId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {saidaDestinoDepositoId
                                        ? (depById.get(Number(saidaDestinoDepositoId))?.nome || `#${saidaDestinoDepositoId}`)
                                        : "—"}
                                </b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {saidaConfirmItens.map((it, idx) => (
                                <li key={idx} className="flex items-start justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p
                                            className="text-sm font-semibold text-slate-900 leading-snug"
                                            style={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {it.nome}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Quantidade: <b>{it.qtd}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO VAI PRA BAIXO (acima dos botões) */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Button onClick={confirmarSaidaDoSnapshot} type="button" disabled={saidaConfirmBusy}>
                            {saidaConfirmBusy ? "Confirmando..." : "Sim, confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setSaidaConfirmOpen(false)} type="button" disabled={saidaConfirmBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>




            <Modal
                open={trfConfirmOpen}
                title="Confirmar transferência"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (trfConfirmBusy) return;
                    setTrfConfirmOpen(false);
                }}
            >
                <div className="mt-2 flex flex-col gap-3">

                    {/* ✅ RESUMO PEQUENO */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Solicitante:</span>{" "}
                                <b>
                                    {trfSolicitanteId
                                        ? (userById.get(Number(trfSolicitanteId))?.nome || `#${trfSolicitanteId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Origem:</span>{" "}
                                <b>
                                    {trfOrigemId
                                        ? (depById.get(Number(trfOrigemId))?.nome || `#${trfOrigemId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {trfDestinoId
                                        ? (depById.get(Number(trfDestinoId))?.nome || `#${trfDestinoId}`)
                                        : "—"}
                                </b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {trfConfirmItens.map((it, idx) => (
                                <li key={idx} className="flex items-start justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p
                                            className="text-sm font-semibold text-slate-900 leading-snug"
                                            style={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {it.nome}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Quantidade: <b>{it.qtd}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO EMBAIXO */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Button onClick={confirmarTransferenciaDoSnapshot} type="button" disabled={trfConfirmBusy}>
                            {trfConfirmBusy ? "Confirmando..." : "Sim, confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setTrfConfirmOpen(false)} type="button" disabled={trfConfirmBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>



            {/* POPUP PÓS-SCAN (Saída) */}
            <ScanQtyModal
                open={saidaScanQtyOpen}
                title="Produto detectado (Saída)"
                subtitle="Selecione a quantidade para adicionar na lista."
                produto={saidaScanProduto}
                depositoNome={depById.get(Number(saidaDepositoId))?.nome || ""}
                disponivel={saidaScanDisponivel}
                onClose={() => {
                    setSaidaScanQtyOpen(false);
                    setSaidaScanProduto(null);
                    setSaidaScanDisponivel(0);
                }}
                onConfirm={(qtd) => {
                    if (!saidaScanProduto) return;
                    addSaidaItemFromScan(saidaScanProduto.id, qtd);
                    setSaidaScanQtyOpen(false);
                    setSaidaScanProduto(null);
                    setSaidaScanDisponivel(0);
                }}
            />

            {/* POPUP PÓS-SCAN (Transferência) */}
            <ScanQtyModal
                open={trfScanQtyOpen}
                title="Produto detectado (Transferência)"
                subtitle="Selecione a quantidade para adicionar na lista."
                produto={trfScanProduto}
                depositoNome={depById.get(Number(trfOrigemId))?.nome || ""}
                disponivel={trfScanDisponivel}
                onClose={() => {
                    setTrfScanQtyOpen(false);
                    setTrfScanProduto(null);
                    setTrfScanDisponivel(0);
                }}
                onConfirm={(qtd) => {
                    if (!trfScanProduto) return;
                    addTrfItemFromScan(trfScanProduto.id, qtd);
                    setTrfScanQtyOpen(false);
                    setTrfScanProduto(null);
                    setTrfScanDisponivel(0);
                }}
            />

            {/* =========================
    AVANÇADO: MODAIS
========================= */}


            {/* 1) CADASTRAR NOVO PRODUTO */}
            <Modal
                open={advNovoProdutoOpen}
                title="Cadastrar novo produto"
                subtitle="Use apenas quando autorizado. A Entrada não cadastra novos produtos."
                onClose={() => setAdvNovoProdutoOpen(false)}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-2">
                            <Field label="Código de barras">
                                <TextInput
                                    value={novoCodigoBarras}
                                    onChange={(e) => setNovoCodigoBarras(e.target.value)}
                                    inputMode="numeric"
                                    placeholder="789..."
                                />
                            </Field>
                        </div>

                        <div className="sm:col-span-4">
                            <Field label="Nome do produto">
                                <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Luva nitrílica M" />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Valor (R$)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={Number.isFinite(Number(novoValor)) ? String(novoValor) : "0"}
                                    onChange={(e) => setNovoValor(Number(e.target.value || 0))}
                                />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Mínimo (padrão do produto)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    value={novoMin}
                                    onChange={(e) => setNovoMin(clampInt(e.target.value))}
                                />
                            </Field>

                            <Field label="Máximo (padrão do produto)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    value={novoMax}
                                    onChange={(e) => setNovoMax(clampInt(e.target.value))}
                                />
                            </Field>

                            
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Categoria (opcional)">
                                <div className="flex gap-2">
                                    <Select value={novoCategoriaId} onChange={(e) => setNovoCategoriaId(Number(e.target.value))}>
                                        <option value={0}>—</option>
                                        {categorias.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button variant="ghost" type="button" onClick={() => setCatQuickOpen(true)}>
                                        + Nova
                                    </Button>
                                </div>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Fabricante (opcional)">
                                <div className="flex gap-2">
                                    <Select value={novoFabricanteId} onChange={(e) => setNovoFabricanteId(Number(e.target.value))}>
                                        <option value={0}>—</option>
                                        {fabricantes.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button variant="ghost" type="button" onClick={() => setFabQuickOpen(true)}>
                                        + Novo
                                    </Button>
                                </div>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Classificação (opcional)">
                                <Select value={novoClassificacaoId} onChange={(e) => setNovoClassificacaoId(Number(e.target.value))}>
                                    <option value={0}>—</option>
                                    {classificacoes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-6">
                            <Field label="Foto (opcional)" hint="Envie uma imagem ou cole uma URL/base64 (data:).">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input type="file" accept="image/*" onChange={(e) => onNovoProdutoFoto(e.target.files?.[0])} className="block w-full text-sm" />
                                    <TextInput value={novoFoto} onChange={(e) => setNovoFoto(e.target.value)} placeholder="...ou cole URL / base64 (data:)" />
                                </div>
                            </Field>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={criarNovoProdutoAvancado} type="button" disabled={!novoCodigoBarras.trim() || !novoNome.trim()}>
                            Criar produto
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvNovoProdutoOpen(false)} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 2) AJUSTE MANUAL */}
            <Modal
                open={advAjusteOpen}
                title="Ajuste manual de saldos por depósito"
                subtitle="Gera AJUSTE. Use com cuidado."
                onClose={() => setAdvAjusteOpen(false)}
            >
                <div className="space-y-4">
                    <ProductCombobox
                        label="Produto"
                        placeholder="Digite para buscar..."
                        produtos={produtos}
                        valueId={ajusteProdId}
                        onChangeId={(id) => setAjusteProdId(id)}
                        query={ajusteProdQuery}
                        setQuery={(v) => {
                            setAjusteProdQuery(v);
                            if (ajusteProdId) setAjusteProdId(0);
                        }}
                    />

                    {!ajusteProdId ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            Selecione um produto para editar os saldos por depósito.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {depositos.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                        <p className="text-[11px] text-slate-500">
                                            Qtd atual: {clampInt(saldosMap.get(`${ajusteProdId}::${d.id}`)?.quantidade ?? 0)}
                                        </p>
                                    </div>
                                    <div className="w-[120px]">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            value={clampInt(ajusteSaldos[d.id] ?? 0)}
                                            onChange={(e) =>
                                                setAjusteSaldos((prev) => ({
                                                    ...prev,
                                                    [d.id]: clampInt(e.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={salvarAjusteSaldosAvancado} disabled={ajusteBusy || !ajusteProdId} type="button">
                            {ajusteBusy ? "Salvando..." : "Salvar saldos"}
                        </Button>

                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => {
                                setAjusteProdId(0);
                                setAjusteProdQuery("");
                                setAjusteSaldos({});
                            }}
                            disabled={ajusteBusy}
                        >
                            Limpar
                        </Button>

                        <Button variant="ghost" onClick={() => setAdvAjusteOpen(false)} type="button" disabled={ajusteBusy}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 3) ADICIONAR DEPÓSITO */}
            <Modal
                open={advDepAddOpen}
                title="Adicionar depósito"
                subtitle="Crie um novo depósito."
                onClose={() => setAdvDepAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome do novo depósito">
                        <TextInput value={novoDepNome} onChange={(e) => setNovoDepNome(e.target.value)} placeholder="Ex: Almox C" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarDeposito} disabled={busyDep || !novoDepNome.trim()} type="button">
                            Criar depósito
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvDepAddOpen(false)} type="button" disabled={busyDep}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 4) RENOMEAR DEPÓSITO */}
            <Modal
                open={advDepRenameOpen}
                title="Renomear depósito"
                subtitle="Altere o nome de um depósito."
                onClose={() => setAdvDepRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Depósito">
                        <Select value={renomearDepId} onChange={(e) => setRenomearDepId(Number(e.target.value))}>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearDepNome} onChange={(e) => setRenomearDepNome(e.target.value)} />
                    </Field>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        Observação: não há opção de excluir depósito (por segurança).
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={renomearDeposito} disabled={busyDep || !renomearDepId || !renomearDepNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvDepRenameOpen(false)} type="button" disabled={busyDep}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 5) ADICIONAR CATEGORIA */}
            <Modal
                open={advCatAddOpen}
                title="Adicionar categoria"
                subtitle="Crie uma nova categoria."
                onClose={() => setAdvCatAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome da categoria">
                        <TextInput value={novoCatNome} onChange={(e) => setNovoCatNome(e.target.value)} placeholder="Ex: EPIs" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarCategoria} disabled={busyCat || !novoCatNome.trim()} type="button">
                            Criar categoria
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvCatAddOpen(false)} type="button" disabled={busyCat}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 6) RENOMEAR CATEGORIA */}
            <Modal
                open={advCatRenameOpen}
                title="Renomear categoria"
                subtitle="Altere o nome de uma categoria."
                onClose={() => setAdvCatRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Categoria">
                        <Select value={renomearCatId} onChange={(e) => setRenomearCatId(Number(e.target.value))}>
                            {categorias.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearCatNome} onChange={(e) => setRenomearCatNome(e.target.value)} />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={renomearCategoria} disabled={busyCat || !renomearCatId || !renomearCatNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvCatRenameOpen(false)} type="button" disabled={busyCat}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 7) ADICIONAR FABRICANTE */}
            <Modal
                open={advFabAddOpen}
                title="Adicionar fabricante"
                subtitle="Crie um novo fabricante."
                onClose={() => setAdvFabAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome do fabricante">
                        <TextInput value={novoFabNome} onChange={(e) => setNovoFabNome(e.target.value)} placeholder="Ex: 3M" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarFabricante} disabled={busyFab || !novoFabNome.trim()} type="button">
                            Criar fabricante
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvFabAddOpen(false)} type="button" disabled={busyFab}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 8) RENOMEAR FABRICANTE */}
            <Modal
                open={advFabRenameOpen}
                title="Renomear fabricante"
                subtitle="Altere o nome de um fabricante."
                onClose={() => setAdvFabRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Fabricante">
                        <Select value={renomearFabId} onChange={(e) => setRenomearFabId(Number(e.target.value))}>
                            {fabricantes.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearFabNome} onChange={(e) => setRenomearFabNome(e.target.value)} />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={renomearFabricante} disabled={busyFab || !renomearFabId || !renomearFabNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvFabRenameOpen(false)} type="button" disabled={busyFab}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 9) EXPORTAÇÃO CSV */}
            <Modal
                open={advExportOpen}
                title="Exportação para Conferência (CSV)"
                subtitle="Exporta a lista do depósito com quantidade (inclui itens sem saldo como 0)."
                onClose={() => setAdvExportOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {depositos.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                <p className="text-[11px] text-slate-500">CSV para conferência</p>
                            </div>
                            <Button variant="soft" onClick={() => exportarDeposito(d.id)} type="button">
                                Exportar
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="mt-3">
                    <Button variant="ghost" onClick={() => setAdvExportOpen(false)} type="button">
                        Fechar
                    </Button>
                </div>
            </Modal>


            {/* 10) IMPORTAR CSV */}
            <Modal
                open={advImportOpen}
                title="Importar produtos e saldos via CSV"
                subtitle="Formato esperado: CODIGO, ETIQUETA, DESCRIÇÃO, CATEGORIA, FABRICANTE, DEPÓSITO, EST. MINIMO, EST. MAXIMO, ESTOQUE, PREÇO VENDA..."
                onClose={() => setAdvImportOpen(false)}
            >
                <div className="space-y-3">
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            const fd = new FormData();
                            fd.append("action", "import_csv");
                            fd.append("arquivo", file);

                            fetch(API_BASE, {
                                method: "POST",
                                body: fd,
                                credentials: "include",
                            })
                                .then((r) => r.json())
                                .then((j) => {
                                    if (!j.ok) {
                                        alert(j.msg || "Falha na importação.");
                                        return;
                                    }
                                    alert(j.msg || "Importação concluída.");
                                    refreshInit();
                                })
                                .catch((err) => {
                                    console.error(err);
                                    alert("Erro na importação.");
                                });
                        }}
                    />

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setAdvImportOpen(false)} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* SCANNERS */}
            <BarcodeScannerModal open={entradaScanOpen} title="Ler código de barras (Entrada)" onClose={() => setEntradaScanOpen(false)} onDetected={(code) => setEntradaBarcode(code)} />

            <BarcodeScannerModal
                open={saidaScanOpen}
                title="Ler código de barras (Saída)"
                onClose={() => setSaidaScanOpen(false)}
                onDetected={(code) => onSaidaBarcodeScanDetected(code)}
            />

            <BarcodeScannerModal
                open={trfScanOpen}
                title="Ler código de barras (Transferência)"
                onClose={() => setTrfScanOpen(false)}
                onDetected={(code) => onTrfBarcodeScanDetected(code)}
            />
        </main>
    );
}