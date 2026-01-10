"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ID = number;

type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };

type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };

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
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
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

type UiTab = "HOME" | "ENTRADA" | "ESTOQUE" | "HISTORICO" | "AVANCADO";

type EntradaItem = { id: number; payload: any; resumo: string };
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
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none",
                "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className ?? "",
            ].join(" ")}
        />
    );
});

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none",
                "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className ?? "",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className ?? "",
            ].join(" ")}
        />
    );
}

function Button({
    children,
    variant = "solid",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const cls =
        variant === "solid"
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                : "bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200";

    return (
        <button
            {...props}
            className={[
                "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                "disabled:cursor-not-allowed disabled:opacity-50",
                cls,
                props.className ?? "",
            ].join(" ")}
        >
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
                "w-full rounded-xl px-3 py-2 text-sm font-medium transition",
                active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200",
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
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // imagem popup
    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState<string>("");

    // modal editar produto
    const [prodEditOpen, setProdEditOpen] = useState(false);
    const [prodEditId, setProdEditId] = useState<ID | 0>(0);
    const [prodBusy, setProdBusy] = useState(false);

    // campos do cadastro
    const [editNome, setEditNome] = useState("");
    const [editValor, setEditValor] = useState<string>("R$ 0,00");
    const [editMin, setEditMin] = useState<number>(0);
    const [editMax, setEditMax] = useState<number>(0); // ✅ NOVO
    const [editCatId, setEditCatId] = useState<ID>(0);
    const [editFabId, setEditFabId] = useState<ID>(0);

    // foto: “nova foto”
    const [editFotoNova, setEditFotoNova] = useState<string>("");

    // saldos editáveis por depósito
    const [editSaldos, setEditSaldos] = useState<Record<number, number>>({});

    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const userById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
    const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
    const fabById = useMemo(() => new Map(fabricantes.map((f) => [f.id, f])), [fabricantes]);

    const saldosMap = useMemo(() => {
        const m = new Map<string, Saldo>();
        for (const s of saldos) m.set(`${s.produto_id}::${s.deposito_id}`, s);
        return m;
    }, [saldos]);

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

    // ALERTAS
    const alertRows = useMemo(() => {
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; s?: Saldo; rep: number }> = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const min = clampInt(p.minimo);
            const max = clampInt((p as any).maximo ?? 0);
            const qtd = clampInt(s.quantidade);

            // ✅ alerta quando atingir o mínimo OU abaixo (<=)
            if (qtd <= min) {
                rows.push({
                    p,
                    d,
                    qtd,
                    min,
                    s,
                    // ✅ REP = MAX - QTD
                    rep: Math.max(0, max - qtd),
                });
            }
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [saldos, prodById, depById]);

    // ESTOQUE
    const [qEstoque, setQEstoque] = useState("");
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID | "Todos">("Todos");
    const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID | "Todos">("Todos");
    const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID | "Todos">("Todos");
    const [onlyLow, setOnlyLow] = useState(false);

    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; s?: Saldo; min: number; rep: number }> = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            if (depFiltroEstoque !== "Todos" && d.id !== depFiltroEstoque) continue;

            if (catFiltroEstoque !== "Todos") {
                const pid = Number(p.categoria_id || 0);
                if (pid !== Number(catFiltroEstoque)) continue;
            }

            if (fabFiltroEstoque !== "Todos") {
                const fid = Number(p.fabricante_id || 0);
                if (fid !== Number(fabFiltroEstoque)) continue;
            }

            const qtd = clampInt(s.quantidade);
            const min = clampInt(p.minimo);
            const max = clampInt((p as any).maximo ?? 0);
            const rep = Math.max(0, max - qtd); // ✅ REP = MAX - QTD

            if (onlyLow && !(qtd <= min)) continue; // ✅ mantém alerta ao chegar no mínimo

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({ p, d, qtd, s, min, rep });
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR") || a.d.nome.localeCompare(b.d.nome, "pt-BR"));
        return rows;
    }, [saldos, prodById, depById, qEstoque, depFiltroEstoque, catFiltroEstoque, fabFiltroEstoque, onlyLow, catById, fabById]);

    function getFiltroResumo() {
        const depTxt = depFiltroEstoque === "Todos" ? "Todos" : depById.get(Number(depFiltroEstoque))?.nome || String(depFiltroEstoque);
        const catTxt = catFiltroEstoque === "Todos" ? "Todas" : catById.get(Number(catFiltroEstoque))?.nome || String(catFiltroEstoque);
        const fabTxt = fabFiltroEstoque === "Todos" ? "Todos" : fabById.get(Number(fabFiltroEstoque))?.nome || String(fabFiltroEstoque);

        return {
            busca: qEstoque.trim() || "—",
            deposito: depTxt,
            categoria: catTxt,
            fabricante: fabTxt,
            somenteAlerta: onlyLow ? "Sim" : "Não",
        };
    }

    function exportarEstoqueCSV() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const sep = ";";
        const header = ["Produto", "Código de Barras", "Depósito", "Categoria", "Fabricante", "Quantidade", "Min", "Rep", "Valor (un)", "Atualizado"];

        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const { p, d, qtd, s, min, rep } of estoqueRows) {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;

            lines.push(
                [p.nome, p.codigo_barras, d.nome, cat, fab, qtd, min, rep, moneyBRL(valorNum), s?.atualizado_em ? fmtDateTime(s.atualizado_em) : ""]
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

    function exportarEstoquePDF() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const f = getFiltroResumo();
        const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

        const rowsHtml = estoqueRows
            .map(({ p, d, qtd, s, min, rep }) => {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const valorNum = Number(p.valor) || 0;

                const esc = (x: any) =>
                    String(x ?? "")
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;");

                const low = qtd <= min;

                return `
          <tr class="${low ? "low" : ""}">
            <td>${esc(p.nome)}</td>
            <td class="mono">${esc(p.codigo_barras)}</td>
            <td>${esc(d.nome)}</td>
            <td>${esc(cat)}</td>
            <td>${esc(fab)}</td>
            <td class="num ${low ? "red" : ""}"><b>${esc(qtd)}</b></td>
            <td class="num">${esc(min)}</td>
            <td class="num green"><b>${esc(rep)}</b></td>
            <td class="num">${esc(moneyBRL(valorNum))}</td>
            <td>${esc(s?.atualizado_em ? fmtDateTime(s.atualizado_em) : "")}</td>
          </tr>
        `;
            })
            .join("");

        const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório de Estoque</title>
  <style>
    *{ box-sizing:border-box; }
    body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color:#0f172a; }
    h1{ margin:0 0 6px 0; font-size:18px; }
    .meta{ font-size:12px; color:#475569; margin-bottom:12px; }
    .filters{ border:1px solid #e2e8f0; background:#f8fafc; padding:10px 12px; border-radius:12px; margin-bottom:14px; }
    .filters div{ font-size:12px; color:#334155; margin:2px 0; }
    table{ width:100%; border-collapse:collapse; font-size:11px; }
    th, td{ border:1px solid #e2e8f0; padding:8px; vertical-align:top; }
    th{ background:#f1f5f9; text-align:left; font-weight:700; }
    .num{ text-align:right; white-space:nowrap; }
    .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    .green{ color:#16a34a; }
    .red{ color:#b91c1c; }
    .low td{ background:#fff7f7; }
    @media print{
      body{ margin: 14mm; }
      .filters{ break-inside: avoid; }
      table{ page-break-inside:auto; }
      tr{ page-break-inside:avoidavoid; page-break-after:auto; }
      thead{ display: table-header-group; }
    }
  </style>
</head>
<body>
  <h1>Relatório de Estoque</h1>
  <div class="meta">Gerado em: <b>${geradoEm}</b> • Itens: <b>${estoqueRows.length}</b></div>

  <div class="filters">
    <div><b>Busca:</b> ${String(f.busca).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <div><b>Depósito:</b> ${String(f.deposito).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <div><b>Categoria:</b> ${String(f.categoria).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <div><b>Fabricante:</b> ${String(f.fabricante).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <div><b>Somente alerta (≤ mínimo):</b> ${String(f.somenteAlerta)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Produto</th>
        <th>Código</th>
        <th>Depósito</th>
        <th>Categoria</th>
        <th>Fabricante</th>
        <th class="num">Qtd</th>
        <th class="num">Min</th>
        <th class="num">Rep</th>
        <th class="num">Valor</th>
        <th>Atualizado</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <script>
    setTimeout(() => window.print(), 250);
  </script>
</body>
</html>`;

        const w = window.open("", "_blank", "noopener,noreferrer");
        if (!w) {
            alert("Pop-up bloqueado. Permita pop-ups para exportar PDF.");
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // ENTRADA
    const [entradaOpen, setEntradaOpen] = useState(false);
    const [entradaScanOpen, setEntradaScanOpen] = useState(false);

    const [entradaBarcode, setEntradaBarcode] = useState("");
    const [entradaDepositoId, setEntradaDepositoId] = useState<ID>(0);
    const [entradaQtd, setEntradaQtd] = useState<number>(1);
    const [entradaObs, setEntradaObs] = useState("");

    // NOVO: filtro fabricante + barra de pesquisa/lista de produtos filtrados (Entrada)
    const [entradaFabFiltroId, setEntradaFabFiltroId] = useState<ID | "Todos">("Todos");
    // NOVO: filtro categoria (Entrada)
    const [entradaCatFiltroId, setEntradaCatFiltroId] = useState<ID | "Todas">("Todas");
    const [entradaProdutoId, setEntradaProdutoId] = useState<ID>(0);
    const [entradaProdQuery, setEntradaProdQuery] = useState("");

    const [novoNome, setNovoNome] = useState("");
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>("");

    const [novoCategoriaId, setNovoCategoriaId] = useState<ID>(0);
    const [novoFabricanteId, setNovoFabricanteId] = useState<ID>(0);

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

    useEffect(() => {
        if (entradaProdutoExistente) {
            setNovoNome("");
            setNovoValor(0);
            setNovoMin(0);
            setNovoFoto("");
            setNovoCategoriaId(0);
            setNovoFabricanteId(0);
        }
    }, [entradaProdutoExistente]);

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

    async function onEntradaFoto(file?: File | null) {
        if (!file) return;
        const url = await fileToDataUrl(file);
        setNovoFoto(url);
    }

    function resetEntradaForm() {
        setEntradaBarcode("");
        setEntradaProdutoId(0);
        setEntradaProdQuery("");
        setEntradaFabFiltroId("Todos");
        setEntradaQtd(1);
        setEntradaObs("");
        setNovoNome("");
        setNovoValor(0);
        setNovoMin(0);
        setNovoFoto("");
        setNovoCategoriaId(0);
        setNovoFabricanteId(0);
    }

    function buildEntradaPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }
        const deposito_id = Number(entradaDepositoId);
        const quantidade = clampInt(entradaQtd);
        const codigo_barras = entradaBarcode.trim();

        if (!deposito_id) {
            alert("Selecione o depósito.");
            return null;
        }
        if (!codigo_barras) {
            alert("Informe/Leia o código de barras.");
            return null;
        }
        if (quantidade <= 0) {
            alert("Quantidade inválida.");
            return null;
        }

        const payload: any = {
            action: "entrada",
            deposito_id,
            quantidade,
            codigo_barras,
            observacao: entradaObs.trim() || undefined,
        };

        let nomeProduto = entradaProdutoExistente?.nome || "";

        if (!entradaProdutoExistente) {
            const nome = novoNome.trim();
            if (!nome) {
                alert("Produto novo: informe o nome.");
                return null;
            }
            nomeProduto = nome;
            payload.nome = nome;
            payload.valor = Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0;
            payload.minimo = clampInt(novoMin);
            payload.foto_url = novoFoto || "";

            payload.categoria_id = novoCategoriaId ? Number(novoCategoriaId) : 0;
            payload.fabricante_id = novoFabricanteId ? Number(novoFabricanteId) : 0;
        }

        const resumo = `${nomeProduto || "(sem nome)"} — CB ${codigo_barras} — qtd ${quantidade} — Dep ${depById.get(deposito_id)?.nome || deposito_id
            }`;

        return { payload, resumo };
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
        resetEntradaForm();
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

    function openProdutoEditor(produtoId: ID) {
        const p = prodById.get(produtoId);
        if (!p) return;

        setProdEditId(produtoId);
        setEditNome(p.nome || "");

        const valorNum = Number(p.valor) || 0;
        const valorDigits = String(Math.round(Math.max(0, valorNum) * 100));
        setEditValor(maskBRLFromDigits(valorDigits));

        setEditMin(clampInt(p.minimo));
        setEditMax(clampInt((p as any).maximo ?? 0)); // ✅ NOVO
        setEditCatId(Number(p.categoria_id || 0));
        setEditFabId(Number(p.fabricante_id || 0));
        setEditFotoNova("");

        const m: Record<number, number> = {};
        for (const d of depositos) {
            const s = saldosMap.get(`${produtoId}::${d.id}`);
            m[d.id] = clampInt(s?.quantidade ?? 0);
        }
        setEditSaldos(m);

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

    async function salvarSaldosProduto() {
        if (!prodEditId) return;

        setProdBusy(true);
        try {
            for (const d of depositos) {
                const novo = clampInt(editSaldos[d.id] ?? 0);
                const atual = clampInt(saldosMap.get(`${prodEditId}::${d.id}`)?.quantidade ?? 0);
                if (novo === atual) continue;

                const r = await apiPost<{ ok: boolean; msg?: string }>({
                    action: "saldo_setar",
                    produto_id: prodEditId,
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
            setProdBusy(false);
        }
    }

    /* =========================
       SAÍDA
    ========================= */

    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saidaScanOpen, setSaidaScanOpen] = useState(false);
    const [saidaConfirmOpen, setSaidaConfirmOpen] = useState(false);

    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
    const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(0);
    const [saidaDestinoDepositoId, setSaidaDestinoDepositoId] = useState<ID>(0);

    const [saidaBarcode, setSaidaBarcode] = useState("");
    const [saidaCategoriaId, setSaidaCategoriaId] = useState<ID | "Todas">("Todas");

    const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
    const [saidaProdQuery, setSaidaProdQuery] = useState("");

    const [saidaQtd, setSaidaQtd] = useState<number>(1);
    const [saidaObs, setSaidaObs] = useState("");

    // NOVO: popup de quantidade após SCAN (Saída)
    const [saidaScanQtyOpen, setSaidaScanQtyOpen] = useState(false);
    const [saidaScanProduto, setSaidaScanProduto] = useState<Produto | null>(null);
    const [saidaScanDisponivel, setSaidaScanDisponivel] = useState<number>(0);

    useEffect(() => {
        if (depositos.length && !saidaDepositoId) setSaidaDepositoId(depositos[0].id);
    }, [depositos, saidaDepositoId]);

    useEffect(() => {
        if (depositos.length && !saidaDestinoDepositoId) setSaidaDestinoDepositoId(depositos[0].id);
    }, [depositos, saidaDestinoDepositoId]);

    useEffect(() => {
        if (!saidaSolicitanteId && usuarios[0]?.id) setSaidaSolicitanteId(usuarios[0].id);
    }, [usuarios, saidaSolicitanteId]);

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
        setSaidaQtd(1);
        setSaidaObs("");
    }

    function resetSaidaAll() {
        setSaidaItens([]);
        resetSaidaItemFields();
    }

    function buildSaidaPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(saidaProdutoId);
        const deposito_id = Number(saidaDepositoId);
        const quantidade = clampInt(saidaQtd);
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
        setSaidaQtd(1);
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
    const [trfConfirmOpen, setTrfConfirmOpen] = useState(false);

    const [trfSolicitanteId, setTrfSolicitanteId] = useState<ID>(0);
    const [trfOrigemId, setTrfOrigemId] = useState<ID>(0);
    const [trfDestinoId, setTrfDestinoId] = useState<ID>(0);

    const [trfBarcode, setTrfBarcode] = useState("");
    const [trfCategoriaId, setTrfCategoriaId] = useState<ID | "Todas">("Todas");

    const [trfProdutoId, setTrfProdutoId] = useState<ID>(0);
    const [trfProdQuery, setTrfProdQuery] = useState("");

    const [trfQtd, setTrfQtd] = useState<number>(1);
    const [trfObs, setTrfObs] = useState("");

    // NOVO: popup de quantidade após SCAN (Transferência)
    const [trfScanQtyOpen, setTrfScanQtyOpen] = useState(false);
    const [trfScanProduto, setTrfScanProduto] = useState<Produto | null>(null);
    const [trfScanDisponivel, setTrfScanDisponivel] = useState<number>(0);

    useEffect(() => {
        if (depositos.length) {
            if (!trfOrigemId) setTrfOrigemId(depositos[0].id);
            if (!trfDestinoId) setTrfDestinoId(depositos[1]?.id ?? depositos[0].id);
        }
    }, [depositos, trfOrigemId, trfDestinoId]);

    useEffect(() => {
        if (!trfSolicitanteId && usuarios[0]?.id) setTrfSolicitanteId(usuarios[0].id);
    }, [usuarios, trfSolicitanteId]);

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
        setTrfQtd(1);
        setTrfObs("");
    }

    function resetTrfAll() {
        setTrfItens([]);
        resetTrfItemFields();
    }

    function buildTrfPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(trfProdutoId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const quantidade = clampInt(trfQtd);
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
        setTrfQtd(1);
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
                        <div className="grid grid-cols-5 gap-2">
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
                                    <Button variant="ghost" onClick={() => setEntradaOpen(true)} type="button">
                                        Entrada
                                    </Button>
                                    <Button variant="ghost" onClick={() => setSaidaOpen(true)} type="button">
                                        Saída
                                    </Button>
                                    <Button variant="ghost" onClick={() => setTrfOpen(true)} type="button">
                                        Transferência
                                    </Button>

                                    <Button variant="soft" onClick={exportarEstoqueCSV} type="button" disabled={loading || !estoqueRows.length}>
                                        ⬇️ CSV
                                    </Button>
                                    <Button variant="soft" onClick={exportarEstoquePDF} type="button" disabled={loading || !estoqueRows.length}>
                                        🧾 PDF
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <Field label="Pesquisar">
                                    <TextInput value={qEstoque} onChange={(e) => setQEstoque(e.target.value)} placeholder="Nome, código, depósito, categoria, fabricante..." />
                                </Field>

                                <Field label="Depósito">
                                    <Select value={depFiltroEstoque as any} onChange={(e) => setDepFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}>
                                        <option value="Todos">Todos</option>
                                        {depositos.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Categoria">
                                    <Select value={catFiltroEstoque as any} onChange={(e) => setCatFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}>
                                        <option value="Todos">Todas</option>
                                        {categorias.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Fabricante">
                                    <Select value={fabFiltroEstoque as any} onChange={(e) => setFabFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}>
                                        <option value="Todos">Todos</option>
                                        {fabricantes.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Somente alerta (≤ mín)">
                                    <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                                        <input id="onlyLow" type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" />
                                        <label htmlFor="onlyLow" className="text-sm text-slate-700">
                                            Mostrar
                                        </label>
                                    </div>
                                </Field>

                                <Field label="Ações">
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                setOnlyLow(true);
                                            }}
                                            type="button"
                                        >
                                            Alertas ({alertCount})
                                        </Button>
                                        <Button variant="ghost" onClick={() => setTab("HISTORICO")} type="button">
                                            Histórico
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
                                            {estoqueRows.map(({ p, d, qtd, s, min, rep }) => {
                                                const low = qtd <= min;
                                                const valorNum = Number(p.valor) || 0;

                                                const foto = normalizeImgUrl(p.foto_url);
                                                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : null);
                                                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : null);

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
                                                                            onClick={() => openProdutoEditor(p.id)}
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
                                                                    </p>
                                                                    <p className="mt-0.5 text-[11px] text-slate-500">Atualizado: {s?.atualizado_em ? fmtDateTime(s.atualizado_em) : "—"}</p>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0 text-right">
                                                                <p className={["text-sm font-semibold", low ? "text-red-700" : "text-slate-900"].join(" ")}>{qtd}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    Min {min} • Rep <span className="font-semibold text-emerald-700">{rep}</span>
                                                                </p>
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
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Código</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Depósito</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Categoria</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Fabricante</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Min</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Rep</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Valor</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Atualizado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {estoqueRows.map(({ p, d, qtd, s, min, rep }) => {
                                                            const low = qtd <= min;
                                                            const valorNum = Number(p.valor) || 0;
                                                            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "");
                                                            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "");
                                                            return (
                                                                <tr key={`${p.id}_${d.id}`} className={low ? "bg-rose-50/40" : "bg-white"}>
                                                                    <td className="border-b border-slate-200 px-3 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <PhotoThumb
                                                                                url={p.foto_url}
                                                                                onClick={() => {
                                                                                    const foto = normalizeImgUrl(p.foto_url);
                                                                                    if (!foto) return;
                                                                                    setImgUrl(foto);
                                                                                    setImgTitle(p.nome);
                                                                                    setImgOpen(true);
                                                                                }}
                                                                            />
                                                                            <div className="min-w-0">
                                                                                <button type="button" onClick={() => openProdutoEditor(p.id)} className="truncate text-sm font-semibold text-slate-900 hover:underline">
                                                                                    {p.nome}
                                                                                </button>
                                                                                {low ? <div className="text-xs text-red-600">alerta</div> : <div className="text-xs text-slate-500">—</div>}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">
                                                                        <span className="font-mono text-xs">{p.codigo_barras}</span>
                                                                    </td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{d.nome}</td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{cat || "—"}</td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{fab || "—"}</td>
                                                                    <td className={["border-b border-slate-200 px-3 py-2 text-right text-sm font-semibold", low ? "text-red-700" : "text-slate-900"].join(" ")}>
                                                                        {qtd}
                                                                    </td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-700">{min}</td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm font-semibold text-emerald-700">{rep}</td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-700">{moneyBRL(valorNum)}</td>
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600">{s?.atualizado_em ? fmtDateTime(s.atualizado_em) : "—"}</td>
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
                                    <p className="mt-1 text-sm text-slate-600">Depósitos, Categorias e Fabricantes: criar, renomear + exportação/importação CSV.</p>
                                </div>
                                <Button variant="ghost" onClick={() => setTab("ESTOQUE")} type="button">
                                    Voltar
                                </Button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {/* Depósitos */}
                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar Depósito</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <Field label="Nome do novo depósito">
                                            <TextInput value={novoDepNome} onChange={(e) => setNovoDepNome(e.target.value)} placeholder="Ex: Almox C" />
                                        </Field>
                                        <Button onClick={criarDeposito} disabled={busyDep || !novoDepNome.trim()} type="button">
                                            Criar depósito
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear Depósito</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
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
                                        <Button onClick={renomearDeposito} disabled={busyDep || !renomearDepId || !renomearDepNome.trim()} type="button">
                                            Renomear
                                        </Button>

                                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Observação: não há opção de excluir depósito (por segurança).</div>
                                    </div>
                                </div>

                                {/* Categorias */}
                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar Categoria</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <Field label="Nome da categoria">
                                            <TextInput value={novoCatNome} onChange={(e) => setNovoCatNome(e.target.value)} placeholder="Ex: EPIs" />
                                        </Field>
                                        <Button onClick={criarCategoria} disabled={busyCat || !novoCatNome.trim()} type="button">
                                            Criar categoria
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear Categoria</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
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
                                        <Button onClick={renomearCategoria} disabled={busyCat || !renomearCatId || !renomearCatNome.trim()} type="button">
                                            Renomear
                                        </Button>
                                    </div>
                                </div>

                                {/* Fabricantes */}
                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Adicionar Fabricante</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <Field label="Nome do fabricante">
                                            <TextInput value={novoFabNome} onChange={(e) => setNovoFabNome(e.target.value)} placeholder="Ex: 3M" />
                                        </Field>
                                        <Button onClick={criarFabricante} disabled={busyFab || !novoFabNome.trim()} type="button">
                                            Criar fabricante
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Renomear Fabricante</p>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
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
                                        <Button onClick={renomearFabricante} disabled={busyFab || !renomearFabId || !renomearFabNome.trim()} type="button">
                                            Renomear
                                        </Button>
                                    </div>
                                </div>

                                {/* Exportação */}
                                <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Exportação para Conferência (CSV)</p>
                                    <p className="mt-1 text-xs text-slate-600">Exporta a lista do depósito com quantidade (inclui itens sem saldo como 0).</p>

                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        {depositos.map((d) => (
                                            <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                                    <p className="text-[11px] text-slate-500">CSV para conferência</p>
                                                </div>
                                                <Button variant="ghost" onClick={() => exportarDeposito(d.id)} type="button">
                                                    Exportar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Importação CSV */}
                                <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4">
                                    <p className="text-sm font-semibold text-slate-900">Importar produtos e saldos via CSV</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        Formato esperado: CODIGO, ETIQUETA, DESCRIÇÃO, CATEGORIA, FABRICANTE, DEPÓSITO, EST. MINIMO, EST. MAXIMO, ESTOQUE, PREÇO VENDA...
                                    </p>

                                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            <Modal open={prodEditOpen} title="Editar produto" subtitle="Edite o cadastro e/ou ajuste os saldos por depósito." onClose={() => setProdEditOpen(false)}>
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

                                    <Field label="Mínimo">
                                        <TextInput type="number" min={0} value={editMin} onChange={(e) => setEditMin(clampInt(e.target.value))} />
                                    </Field>

                                    <Field label="Máximo">
                                        <TextInput type="number" min={0} value={editMax} onChange={(e) => setEditMax(clampInt(e.target.value))} />
                                    </Field>

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

                            <div className="rounded-2xl border border-slate-200 p-3">
                                <p className="text-sm font-semibold text-slate-900">Saldos por depósito</p>
                                <p className="mt-1 text-xs text-slate-600">Ajuste manual (gera AJUSTE). Use com cuidado.</p>

                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {depositos.map((d) => (
                                        <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                                <p className="text-[11px] text-slate-500">Qtd atual: {clampInt(saldosMap.get(`${prodEditId}::${d.id}`)?.quantidade ?? 0)}</p>
                                            </div>
                                            <div className="w-[120px]">
                                                <TextInput
                                                    type="number"
                                                    min={0}
                                                    value={clampInt(editSaldos[d.id] ?? 0)}
                                                    onChange={(e) =>
                                                        setEditSaldos((prev) => ({
                                                            ...prev,
                                                            [d.id]: clampInt(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button onClick={salvarSaldosProduto} disabled={prodBusy || !prodEditId} type="button">
                                        Salvar saldos
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* MODAL: ENTRADA */}
            <Modal open={entradaOpen} title="Entrada" subtitle="Leia/digite o código e confirme. Se o produto não existir, cadastre na hora." onClose={() => setEntradaOpen(false)}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                            <Field label="Código de barras" hint="Você pode usar a câmera (Scan).">
                                <div className="flex gap-2">
                                    <TextInput value={entradaBarcode} onChange={(e) => setEntradaBarcode(e.target.value)} placeholder="Ex: 789..." inputMode="numeric" />
                                    <Button variant="soft" onClick={() => setEntradaScanOpen(true)} type="button">
                                        📷 Scan
                                    </Button>
                                </div>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
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
                        </div>

                        <div className="sm:col-span-1">
                            <Field label="Qtd">
                                <TextInput type="number" min={1} value={entradaQtd} onChange={(e) => setEntradaQtd(clampInt(e.target.value) || 1)} />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
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
                        </div>


                        <div className="sm:col-span-2">
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
                        </div>

                        <div className="sm:col-span-4">
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

                        <div className="sm:col-span-6">
                            <Field label="Observação (opcional)">
                                <TextArea value={entradaObs} onChange={(e) => setEntradaObs(e.target.value)} placeholder="Ex: NF 123 / Compra / Ajuste..." />
                            </Field>
                        </div>
                    </div>

                    {entradaProdutoExistente ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Produto encontrado: <b>{entradaProdutoExistente.nome}</b>{" "}
                            <span className="text-xs text-emerald-700">• clique no nome na tabela de estoque para editar</span>
                        </div>
                    ) : entradaBarcode.trim() ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Cadastro rápido (produto novo)</p>
                            <p className="mt-1 text-xs text-slate-600">Preencha o mínimo necessário para cadastrar.</p>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-3">
                                    <Field label="Nome do produto">
                                        <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Luva nitrílica M" />
                                    </Field>
                                </div>

                                <div className="sm:col-span-2">
                                    <Field label="Valor (R$)">
                                        <TextInput type="number" min={0} step="0.01" value={Number.isFinite(Number(novoValor)) ? String(novoValor) : "0"} onChange={(e) => setNovoValor(Number(e.target.value || 0))} />
                                    </Field>
                                </div>

                                <div className="sm:col-span-1">
                                    <Field label="Mínimo">
                                        <TextInput type="number" min={0} value={novoMin} onChange={(e) => setNovoMin(clampInt(e.target.value))} />
                                    </Field>
                                </div>

                                <div className="sm:col-span-3">
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

                                <div className="sm:col-span-3">
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

                                <div className="sm:col-span-6">
                                    <Field label="Foto (opcional)" hint="Você pode enviar uma imagem (fica em base64) ou colar uma URL no campo abaixo.">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <input type="file" accept="image/*" onChange={(e) => onEntradaFoto(e.target.files?.[0])} className="block w-full text-sm" />
                                            <TextInput value={novoFoto} onChange={(e) => setNovoFoto(e.target.value)} placeholder="...ou cole URL / base64 (data:)" />
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Informe o código de barras para continuar.</div>
                    )}

                    {entradaItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Itens na fila</p>
                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {entradaItens.map((it) => (
                                    <li key={it.id} className="flex items-center justify-between gap-2 p-3">
                                        <p className="min-w-0 truncate text-sm text-slate-700">{it.resumo}</p>
                                        <Button variant="ghost" type="button" onClick={() => setEntradaItens((prev) => prev.filter((x) => x.id !== it.id))}>
                                            Remover
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <Button variant="soft" onClick={addEntradaItemToList} type="button" disabled={!entradaBarcode.trim()}>
                            + Adicionar à lista
                        </Button>

                        <Button onClick={applyEntradaSingle} type="button" disabled={!entradaBarcode.trim()}>
                            Confirmar 1 item
                        </Button>

                        <Button variant="ghost" onClick={applyEntradaLote} type="button" disabled={!entradaItens.length && !entradaBarcode.trim()}>
                            Confirmar lote
                        </Button>

                        <Button variant="ghost" onClick={() => setEntradaOpen(false)} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: SAÍDA */}
            <Modal open={saidaOpen} title="Saída" subtitle="Selecione solicitante, depósito, destino e itens. Valida saldo disponível." onClose={cancelarSaida}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-2">
                            <Field label="Solicitante">
                                <Select value={saidaSolicitanteId} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value))}>
                                    {usuarios.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome} ({u.usuario})
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Depósito (origem)">
                                <Select value={saidaDepositoId} onChange={(e) => setSaidaDepositoId(Number(e.target.value))}>
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Destino">
                                <Select value={saidaDestinoDepositoId} onChange={(e) => setSaidaDestinoDepositoId(Number(e.target.value))}>
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-3">
                            <Field label="Código de barras (opcional)">
                                <div className="flex gap-2">
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
                                    <Button variant="soft" onClick={() => setSaidaScanOpen(true)} type="button">
                                        📷 Scan
                                    </Button>
                                </div>
                            </Field>
                            <p className="mt-1 text-[11px] text-slate-500">NOVO: via Scan abre popup para selecionar quantidade e adicionar direto na lista.</p>
                        </div>

                        <div className="sm:col-span-3">
                            <Field label="Categoria (filtro)">
                                <Select value={saidaCategoriaId as any} onChange={(e) => setSaidaCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}>
                                    <option value="Todas">Todas</option>
                                    {categorias.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-6">
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

                        <div className="sm:col-span-2">
                            <Field label="Qtd">
                                <TextInput type="number" min={1} value={saidaQtd} onChange={(e) => setSaidaQtd(clampInt(e.target.value) || 1)} />
                            </Field>
                        </div>

                        <div className="sm:col-span-4">
                            <Field label="Observação (opcional)">
                                <TextInput value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} placeholder="Ex: Obra X / Setor Y..." />
                            </Field>
                        </div>
                    </div>

                    {saidaItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Itens na fila</p>
                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {saidaItens.map((it) => (
                                    <li key={it.id} className="flex items-center justify-between gap-2 p-3">
                                        <p className="min-w-0 truncate text-sm text-slate-700">{it.resumo}</p>
                                        <Button variant="ghost" type="button" onClick={() => setSaidaItens((prev) => prev.filter((x) => x.id !== it.id))}>
                                            Remover
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <Button variant="soft" onClick={addSaidaItemToList} type="button" disabled={!saidaProdutoId}>
                                + Adicionar à lista
                            </Button>
                            <Button variant="ghost" onClick={cancelarSaida} type="button">
                                Cancelar
                            </Button>
                        </div>

                        <div className="sm:ml-auto">
                            <Button onClick={() => setSaidaConfirmOpen(true)} type="button">
                                Confirmar
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* MODAL: TRANSFERÊNCIA */}
            <Modal open={trfOpen} title="Transferência" subtitle="Move quantidade de um depósito para outro (com validação de saldo)." onClose={cancelarTransferencia}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-2">
                            <Field label="Solicitante">
                                <Select value={trfSolicitanteId} onChange={(e) => setTrfSolicitanteId(Number(e.target.value))}>
                                    {usuarios.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome} ({u.usuario})
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Origem">
                                <Select value={trfOrigemId} onChange={(e) => setTrfOrigemId(Number(e.target.value))}>
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Destino">
                                <Select value={trfDestinoId} onChange={(e) => setTrfDestinoId(Number(e.target.value))}>
                                    {depositos.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-3">
                            <Field label="Código de barras (opcional)">
                                <div className="flex gap-2">
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
                                    <Button variant="soft" onClick={() => setTrfScanOpen(true)} type="button">
                                        📷 Scan
                                    </Button>
                                </div>
                            </Field>
                            <p className="mt-1 text-[11px] text-slate-500">NOVO: via Scan abre popup para selecionar quantidade e adicionar direto na lista.</p>
                        </div>

                        <div className="sm:col-span-3">
                            <Field label="Categoria (filtro)">
                                <Select value={trfCategoriaId as any} onChange={(e) => setTrfCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value))}>
                                    <option value="Todas">Todas</option>
                                    {categorias.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-6">
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

                        <div className="sm:col-span-2">
                            <Field label="Qtd">
                                <TextInput type="number" min={1} value={trfQtd} onChange={(e) => setTrfQtd(clampInt(e.target.value) || 1)} />
                            </Field>
                        </div>

                        <div className="sm:col-span-4">
                            <Field label="Observação (opcional)">
                                <TextInput value={trfObs} onChange={(e) => setTrfObs(e.target.value)} placeholder="Ex: remanejamento / conferência..." />
                            </Field>
                        </div>
                    </div>

                    {trfItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Transferências na fila</p>
                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {trfItens.map((it) => (
                                    <li key={it.id} className="flex items-center justify-between gap-2 p-3">
                                        <p className="min-w-0 truncate text-sm text-slate-700">{it.resumo}</p>
                                        <Button variant="ghost" type="button" onClick={() => setTrfItens((prev) => prev.filter((x) => x.id !== it.id))}>
                                            Remover
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <Button variant="soft" onClick={addTrfItemToList} type="button" disabled={!trfProdutoId}>
                                + Adicionar à lista
                            </Button>
                            <Button variant="ghost" onClick={cancelarTransferencia} type="button">
                                Cancelar
                            </Button>
                        </div>

                        <div className="sm:ml-auto">
                            <Button onClick={() => setTrfConfirmOpen(true)} type="button">
                                Confirmar
                            </Button>
                        </div>
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
            <ConfirmDialog
                open={saidaConfirmOpen}
                title="Confirmar saída"
                message="Tem certeza que deseja confirmar a SAÍDA?"
                onCancel={() => setSaidaConfirmOpen(false)}
                onConfirm={async () => {
                    setSaidaConfirmOpen(false);
                    await confirmarSaida();
                }}
            />

            <ConfirmDialog
                open={trfConfirmOpen}
                title="Confirmar transferência"
                message="Tem certeza que deseja confirmar a TRANSFERÊNCIA?"
                onCancel={() => setTrfConfirmOpen(false)}
                onConfirm={async () => {
                    setTrfConfirmOpen(false);
                    await confirmarTransferencia();
                }}
            />

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