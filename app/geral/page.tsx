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

type UiTab =
  | "HOME"
  | "ENTRADA"
  | "SAIDA"
  | "TRANSFERENCIA"
  | "ESTOQUE"
  | "ALERTAS"
  | "HISTORICO"
  | "AVANCADO";

/** itens em lote */
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

/**
 * Máscara BRL (digit-only -> centavos)
 * Ex.: digits="1" => R$ 0,01 | "100000" => R$ 1.000,00
 */
function maskBRLFromDigits(digitsOnly: string) {
  const digits = (digitsOnly || "").replace(/\D/g, "");
  const cents = digits ? Number(digits) : 0;
  const value = cents / 100;

  try {
    // gera "R$ 1.234,56"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  } catch {
    // fallback simples
    const v = Number.isFinite(value) ? value : 0;
    const fixed = v.toFixed(2); // "1234.56"
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
  // aceita qualquer coisa, mas transforma em dígitos e mascara
  const digits = (raw || "").replace(/\D/g, "");
  return maskBRLFromDigits(digits);
}

function escapeCsvCell(v: any, sep = ";") {
  const s = String(v ?? "");
  const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
  const escaped = s.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

const IMG_BASE = "https://planoassistencialintegrado.com.br"; // domínio onde as imagens existem

function normalizeImgUrl(u?: string | null) {
  const t = (u ?? "").toString().trim();
  if (!t || t === "null" || t === "undefined") return null;

  // já é URL absoluta
  if (/^https?:\/\//i.test(t)) return t;

  // veio "/uploads/..." (relativa) -> força domínio principal
  if (t.startsWith("/")) return `${IMG_BASE}${t}`;

  // veio só o filename -> monta no domínio principal
  return `${IMG_BASE}/uploads/produtos/${t}`;
}

async function safeJson<T>(r: Response): Promise<T> {
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await r.text().catch(() => "");
    throw new Error(
      `Resposta inesperada (${ct || "sem content-type"}). ${
        txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""
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

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none",
        "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

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
   MODAL
========================= */

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
   POPUP IMAGEM
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{title || "Imagem do produto"}</h2>
            <p className="mt-1 text-sm text-slate-600">Clique fora ou pressione ESC para fechar.</p>
          </div>
          <button
            className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              Produto sem imagem.
            </div>
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
  // ✅ agora o valor no editor é string com máscara "R$ 1.000,00"
  const [editValor, setEditValor] = useState<string>("R$ 0,00");
  const [editMin, setEditMin] = useState<number>(0);
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
      const j = await apiGet<InitResp>({ init: 1 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ALERTAS
  const alertRows = useMemo(() => {
    const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; s?: Saldo }> = [];
    for (const s of saldos) {
      const p = prodById.get(s.produto_id);
      const d = depById.get(s.deposito_id);
      if (!p || !d) continue;
      const min = clampInt(p.minimo);
      const qtd = clampInt(s.quantidade);
      if (qtd <= min) rows.push({ p, d, qtd, min, s });
    }
    rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
    return rows;
  }, [saldos, prodById, depById]);

  const alertCount = alertRows.length;

  // ESTOQUE
  const [qEstoque, setQEstoque] = useState("");
  const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID | "Todos">("Todos");
  const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID | "Todos">("Todos");
  const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID | "Todos">("Todos");
  const [onlyLow, setOnlyLow] = useState(false);

  const estoqueRows = useMemo(() => {
    const qq = qEstoque.trim().toLowerCase();
    const rows: Array<{ p: Produto; d: Deposito; qtd: number; s?: Saldo }> = [];

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
      if (onlyLow && !(qtd <= min)) continue;

      if (qq) {
        const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
        const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
        const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab}`.toLowerCase();
        if (!blob.includes(qq)) continue;
      }

      rows.push({ p, d, qtd, s });
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
    onlyLow,
    catById,
    fabById,
  ]);

  // ✅ EXPORTAÇÃO (CSV / PDF) do ESTOQUE conforme filtro atual
  function getFiltroResumo() {
    const depTxt =
      depFiltroEstoque === "Todos" ? "Todos" : depById.get(Number(depFiltroEstoque))?.nome || String(depFiltroEstoque);
    const catTxt =
      catFiltroEstoque === "Todos" ? "Todas" : catById.get(Number(catFiltroEstoque))?.nome || String(catFiltroEstoque);
    const fabTxt =
      fabFiltroEstoque === "Todos" ? "Todos" : fabById.get(Number(fabFiltroEstoque))?.nome || String(fabFiltroEstoque);

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
    const header = [
      "Produto",
      "Código de Barras",
      "Depósito",
      "Categoria",
      "Fabricante",
      "Quantidade",
      "Mínimo",
      "Max (mín - qtd)",
      "Valor (un)",
      "Atualizado",
    ];

    const lines: string[] = [];
    // BOM p/ Excel pt-BR abrir acentos ok
    lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

    for (const { p, d, qtd, s } of estoqueRows) {
      const min = clampInt(p.minimo);
      const max = Math.max(0, min - qtd);
      const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
      const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
      const valorNum = Number(p.valor) || 0;

      lines.push(
        [
          p.nome,
          p.codigo_barras,
          d.nome,
          cat,
          fab,
          qtd,
          min,
          max,
          moneyBRL(valorNum),
          s?.atualizado_em ? fmtDateTime(s.atualizado_em) : "",
        ]
          .map((x) => escapeCsvCell(x, sep))
          .join(sep)
      );
    }

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const f = getFiltroResumo();
    const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // opcional: feedback
    // alert("CSV gerado.");
  }

  function exportarEstoquePDF() {
    if (!estoqueRows.length) {
      alert("Nenhum item para exportar com os filtros atuais.");
      return;
    }

    const f = getFiltroResumo();
    const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

    const rowsHtml = estoqueRows
      .map(({ p, d, qtd, s }) => {
        const min = clampInt(p.minimo);
        const max = Math.max(0, min - qtd);
        const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
        const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
        const valorNum = Number(p.valor) || 0;

        const esc = (x: any) =>
          String(x ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        return `
          <tr>
            <td>${esc(p.nome)}</td>
            <td class="mono">${esc(p.codigo_barras)}</td>
            <td>${esc(d.nome)}</td>
            <td>${esc(cat)}</td>
            <td>${esc(fab)}</td>
            <td class="num">${esc(qtd)}</td>
            <td class="num">${esc(min)}</td>
            <td class="num green">${esc(max)}</td>
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
    .green{ color:#16a34a; font-weight:700; }
    @media print{
      body{ margin: 14mm; }
      .filters{ break-inside: avoid; }
      table{ page-break-inside:auto; }
      tr{ page-break-inside:avoid; page-break-after:auto; }
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
        <th class="num">Max (min - qtd)</th>
        <th class="num">Valor</th>
        <th>Atualizado</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <script>
    // abre o diálogo de impressão (Salvar como PDF no navegador)
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

    const resumo = `${nomeProduto || "(sem nome)"} — CB ${codigo_barras} — qtd ${quantidade} — Dep ${
      depById.get(deposito_id)?.nome || deposito_id
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

    // se formulário atual estiver preenchido com código, inclui também
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

  // ======= PRODUTO EDITOR (cadastro + saldos) =======

  function openProdutoEditor(produtoId: ID) {
    const p = prodById.get(produtoId);
    if (!p) return;

    setProdEditId(produtoId);
    setEditNome(p.nome || "");

    // ✅ máscara BRL no editor
    const valorNum = Number(p.valor) || 0;
    const valorDigits = String(Math.round(Math.max(0, valorNum) * 100)); // centavos
    setEditValor(maskBRLFromDigits(valorDigits));

    setEditMin(clampInt(p.minimo));
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
        // ✅ converte "R$ 1.000,00" para number
        valor: parseBRLToNumber(editValor),
        minimo: clampInt(editMin),
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

  // SAÍDA
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [saidaScanOpen, setSaidaScanOpen] = useState(false);

  const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(0);
  const [saidaBusca, setSaidaBusca] = useState("");
  const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
  const [saidaBarcode, setSaidaBarcode] = useState("");
  const [saidaQtd, setSaidaQtd] = useState<number>(1);
  const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
  const [saidaDestino, setSaidaDestino] = useState("");
  const [saidaObs, setSaidaObs] = useState("");

  useEffect(() => {
    if (depositos.length && !saidaDepositoId) setSaidaDepositoId(depositos[0].id);
  }, [depositos, saidaDepositoId]);

  useEffect(() => {
    if (!saidaSolicitanteId && usuarios[0]?.id) setSaidaSolicitanteId(usuarios[0].id);
  }, [usuarios, saidaSolicitanteId]);

  const saidaProdutosNoDeposito = useMemo(() => {
    const depId = Number(saidaDepositoId);
    const ids = new Set<ID>();
    for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

    const qq = saidaBusca.trim().toLowerCase();
    return produtos
      .filter((p) => ids.has(p.id))
      .filter((p) => (!qq ? true : `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [saldos, produtos, saidaDepositoId, saidaBusca]);

  useEffect(() => {
    if (!saidaProdutoId && saidaProdutosNoDeposito[0]?.id) setSaidaProdutoId(saidaProdutosNoDeposito[0].id);
    if (saidaProdutoId && !saidaProdutosNoDeposito.find((p) => p.id === saidaProdutoId)) {
      setSaidaProdutoId(saidaProdutosNoDeposito[0]?.id ?? 0);
    }
  }, [saidaProdutosNoDeposito, saidaProdutoId]);

  function resetSaidaForm() {
    setSaidaBarcode("");
    setSaidaBusca("");
    setSaidaProdutoId(0);
    setSaidaQtd(1);
    setSaidaDestino("");
    setSaidaObs("");
  }

  function onSaidaBarcodePick(code: string) {
    setSaidaBarcode(code);
    const p = produtos.find((x) => x.codigo_barras === code);
    if (p) setSaidaProdutoId(p.id);
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
    const destino_texto = saidaDestino.trim();

    if (!produto_id) {
      alert("Selecione um produto.");
      return null;
    }
    if (!deposito_id) {
      alert("Selecione o depósito.");
      return null;
    }
    if (quantidade <= 0) {
      alert("Quantidade inválida.");
      return null;
    }
    if (!solicitante_usuario_id) {
      alert("Selecione o solicitante.");
      return null;
    }
    if (!destino_texto) {
      alert("Informe o destino.");
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
    const resumo = `${prodNome} — qtd ${quantidade} — Dep ${
      depById.get(deposito_id)?.nome || deposito_id
    } → ${destino_texto}`;

    return { payload, resumo };
  }

  async function applySaidaSingle() {
    const built = buildSaidaPayloadFromForm();
    if (!built) return;

    const r = await apiPost<{ ok: boolean; msg?: string }>(built.payload);
    if (!r.ok) return alert(r.msg || "Falha na saída.");

    resetSaidaForm();
    setSaidaOpen(false);
    await refreshInit();
    setTab("ESTOQUE");
  }

  function addSaidaItemToList() {
    const built = buildSaidaPayloadFromForm();
    if (!built) return;
    const id = saidaSeqRef.current++;
    setSaidaItens((prev) => [...prev, { id, ...built }]);
    resetSaidaForm();
  }

  async function applySaidaLote() {
    let items = [...saidaItens];

    if (saidaProdutoId && saidaDestino.trim()) {
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

    resetSaidaForm();
    setSaidaItens([]);
    setSaidaOpen(false);
    await refreshInit();
    setTab("ESTOQUE");
  }

  // TRANSFERÊNCIA
  const [trfBusca, setTrfBusca] = useState("");
  const [trfProdutoId, setTrfProdutoId] = useState<ID>(0);
  const [trfOrigemId, setTrfOrigemId] = useState<ID>(0);
  const [trfDestinoId, setTrfDestinoId] = useState<ID>(0);
  const [trfQtd, setTrfQtd] = useState<number>(1);
  const [trfSolicitanteId, setTrfSolicitanteId] = useState<ID>(0);
  const [trfObs, setTrfObs] = useState("");

  useEffect(() => {
    if (depositos.length) {
      if (!trfOrigemId) setTrfOrigemId(depositos[0].id);
      if (!trfDestinoId) setTrfDestinoId(depositos[1]?.id ?? depositos[0].id);
    }
  }, [depositos, trfOrigemId, trfDestinoId]);

  useEffect(() => {
    if (!trfSolicitanteId && usuarios[0]?.id) setTrfSolicitanteId(usuarios[0].id);
  }, [usuarios, trfSolicitanteId]);

  const trfProdutosNaOrigem = useMemo(() => {
    const depId = Number(trfOrigemId);
    const ids = new Set<ID>();
    for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

    const qq = trfBusca.trim().toLowerCase();
    return produtos
      .filter((p) => ids.has(p.id))
      .filter((p) => (!qq ? true : `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [saldos, produtos, trfOrigemId, trfBusca]);

  useEffect(() => {
    if (!trfProdutoId && trfProdutosNaOrigem[0]?.id) setTrfProdutoId(trfProdutosNaOrigem[0].id);
    if (trfProdutoId && !trfProdutosNaOrigem.find((p) => p.id === trfProdutoId)) {
      setTrfProdutoId(trfProdutosNaOrigem[0]?.id ?? 0);
    }
  }, [trfProdutosNaOrigem, trfProdutoId]);

  function resetTrfForm() {
    setTrfBusca("");
    setTrfProdutoId(0);
    setTrfQtd(1);
    setTrfObs("");
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
    if (!solicitante_usuario_id) {
      alert("Selecione o solicitante.");
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
    const resumo = `${prodNome} — qtd ${quantidade} — ${
      depById.get(deposito_origem_id)?.nome || deposito_origem_id
    } → ${depById.get(deposito_destino_id)?.nome || deposito_destino_id}`;

    return { payload, resumo };
  }

  async function applyTransferenciaSingle() {
    const built = buildTrfPayloadFromForm();
    if (!built) return;

    const r = await apiPost<{ ok: boolean; msg?: string }>(built.payload);
    if (!r.ok) return alert(r.msg || "Falha na transferência.");

    resetTrfForm();
    await refreshInit();
    setTab("ESTOQUE");
  }

  function addTrfItemToList() {
    const built = buildTrfPayloadFromForm();
    if (!built) return;
    const id = trfSeqRef.current++;
    setTrfItens((prev) => [...prev, { id, ...built }]);
    resetTrfForm();
  }

  async function applyTransferenciaLote() {
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

    resetTrfForm();
    setTrfItens([]);
    await refreshInit();
    setTab("ESTOQUE");
  }

  // AVANÇADO - Depósitos
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

  // AVANÇADO - Categorias
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

  // AVANÇADO - Fabricantes
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
        ["SAIDA", "Saída"],
        ["TRANSFERENCIA", "Transferência"],
        ["ESTOQUE", "Estoque"],
        ["ALERTAS", `Alertas (${alertCount})`],
        ["HISTORICO", "Histórico"],
        ["AVANCADO", "Avançado"],
      ] as const,
    [alertCount]
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Admin do Estoque</h1>
              <p className="mt-1 text-sm text-slate-600">
                Entrada, Saída, Transferência, Estoque por depósito, Alertas, Histórico e Avançado.
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
            <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
              {tabs.map(([k, label]) => (
                <TabButton key={k} label={label} active={tab === (k as UiTab)} onClick={() => setTab(k as UiTab)} />
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          {/* HOME */}
          {tab === "HOME" ? (
            <Card className="p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Entrada</p>
                  <p className="mt-1 text-xs text-slate-600">Cadastrar (se não existir) e somar saldo no depósito.</p>
                  <div className="mt-3">
                    <Button onClick={() => setEntradaOpen(true)} type="button">
                      Abrir Entrada
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Saída</p>
                  <p className="mt-1 text-xs text-slate-600">Escolha depósito, solicitante, destino e quantidade.</p>
                  <div className="mt-3">
                    <Button onClick={() => setSaidaOpen(true)} type="button">
                      Abrir Saída
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
                Dica: na Entrada/Saída você pode usar <b>câmera</b> para ler o código de barras.
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
                  </p>
                </div>
                <Button onClick={() => setEntradaOpen(true)} variant="ghost" type="button">
                  Abrir Entrada
                </Button>
              </div>
            </Card>
          ) : null}

          {/* SAÍDA (atalho) */}
          {tab === "SAIDA" ? (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">Saída</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Pode escanear por câmera ou pesquisar manualmente (filtrando por depósito). Também permite lista de itens.
                  </p>
                </div>
                <Button onClick={() => setSaidaOpen(true)} variant="ghost" type="button">
                  Abrir Saída
                </Button>
              </div>
            </Card>
          ) : null}

          {/* TRANSFERÊNCIA */}
          {tab === "TRANSFERENCIA" ? (
            <Card className="p-4">
              {/* ... (sem mudanças aqui) ... */}
              {/* (mantido igual ao seu arquivo original) */}
              {/* Para reduzir risco de erro, não mexi no bloco de Transferência. */}
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Transferência entre Depósitos</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Move quantidade de origem para destino (com validação de saldo). É possível montar uma lista de transferências.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Origem (Depósito)">
                    <Select value={trfOrigemId} onChange={(e) => setTrfOrigemId(Number(e.target.value))}>
                      {depositos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Destino (Depósito)">
                    <Select value={trfDestinoId} onChange={(e) => setTrfDestinoId(Number(e.target.value))}>
                      {depositos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Solicitante">
                    <Select value={trfSolicitanteId} onChange={(e) => setTrfSolicitanteId(Number(e.target.value))}>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome} ({u.usuario})
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className="sm:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Buscar produto (nome/código)">
                      <TextInput value={trfBusca} onChange={(e) => setTrfBusca(e.target.value)} placeholder="Ex: URNA ou 174501..." />
                    </Field>

                    <Field label="Produto (na origem)">
                      <Select value={trfProdutoId} onChange={(e) => setTrfProdutoId(Number(e.target.value))}>
                        {trfProdutosNaOrigem.length ? (
                          trfProdutosNaOrigem.map((p) => {
                            const s = saldosMap.get(`${p.id}::${trfOrigemId}`);
                            const qtd = s ? clampInt(s.quantidade) : 0;
                            return (
                              <option key={p.id} value={p.id}>
                                {p.nome} — CB:{p.codigo_barras} — disp:{qtd}
                              </option>
                            );
                          })
                        ) : (
                          <option value={0}>Sem itens no depósito</option>
                        )}
                      </Select>
                    </Field>

                    <Field label="Quantidade">
                      <TextInput type="number" min={1} step={1} value={trfQtd} onChange={(e) => setTrfQtd(Number(e.target.value))} />
                    </Field>

                    <div className="sm:col-span-3">
                      <Field label="Observação (opcional)">
                        <TextArea value={trfObs} onChange={(e) => setTrfObs(e.target.value)} placeholder="Detalhes..." />
                      </Field>
                    </div>

                    <div className="sm:col-span-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={applyTransferenciaSingle}>
                        Confirmar esta transferência
                      </Button>
                      <Button type="button" variant="soft" onClick={addTrfItemToList}>
                        Adicionar à lista
                      </Button>
                      <Button type="button" variant="ghost" onClick={applyTransferenciaLote} disabled={!trfItens.length && !trfProdutoId}>
                        Confirmar lista inteira
                      </Button>
                    </div>
                  </div>
                </div>

                {trfItens.length ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Lista de transferências pendentes</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {trfItens.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                          <span className="truncate">{it.resumo}</span>
                          <Button type="button" variant="ghost" onClick={() => setTrfItens((prev) => prev.filter((x) => x.id !== it.id))}>
                            Remover
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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

                  {/* ✅ Exportações do filtro atual */}
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
                  <TextInput
                    value={qEstoque}
                    onChange={(e) => setQEstoque(e.target.value)}
                    placeholder="Nome, código, depósito, categoria, fabricante..."
                  />
                </Field>

                <Field label="Depósito">
                  <Select
                    value={depFiltroEstoque as any}
                    onChange={(e) => setDepFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
                  >
                    <option value="Todos">Todos</option>
                    {depositos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Categoria">
                  <Select
                    value={catFiltroEstoque as any}
                    onChange={(e) => setCatFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
                  >
                    <option value="Todos">Todas</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Fabricante">
                  <Select
                    value={fabFiltroEstoque as any}
                    onChange={(e) => setFabFiltroEstoque(e.target.value === "Todos" ? "Todos" : Number(e.target.value))}
                  >
                    <option value="Todos">Todos</option>
                    {fabricantes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Somente alerta (≤ mínimo)">
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
                    <Button variant="ghost" onClick={() => setTab("ALERTAS")} type="button">
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
                  <ul className="divide-y divide-slate-200">
                    {estoqueRows.map(({ p, d, qtd, s }) => {
                      const min = clampInt(p.minimo);
                      const low = qtd <= min;
                      const max = Math.max(0, min - qtd); // ✅ regra pedida
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
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  Atualizado: {s?.atualizado_em ? fmtDateTime(s.atualizado_em) : "—"}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-slate-900">{qtd}</p>

                              {/* ✅ min + max (verde) */}
                              <p className="text-xs text-slate-500">
                                mín {min}{" "}
                                {low ? (
                                  <>
                                    • máx <span className="font-semibold text-emerald-700">{max}</span>
                                  </>
                                ) : null}
                              </p>
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

          {/* ALERTAS */}
          {tab === "ALERTAS" ? (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Alertas (Reposição)</h2>
                  <p className="mt-1 text-sm text-slate-600">Lista dos itens com quantidade ≤ mínimo.</p>
                </div>
                <Button variant="ghost" onClick={() => setTab("ESTOQUE")} type="button">
                  Voltar ao Estoque
                </Button>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                {alertRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">Nenhum item em alerta 🎉</div>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {alertRows.map(({ p, d, qtd, min }) => {
                      const max = Math.max(0, min - qtd); // ✅ min - qtd
                      return (
                        <li key={`${p.id}_${d.id}`} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{p.nome}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-600">
                                CB: <b>{p.codigo_barras}</b> • Depósito: <b>{d.nome}</b>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-red-700">{qtd}</p>

                              {/* ✅ min + max (verde) */}
                              <p className="text-xs text-slate-500">
                                mín {min} • máx <span className="font-semibold text-emerald-700">{max}</span>
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setEntradaOpen(true)} type="button">
                  Fazer Entrada
                </Button>
                <Button variant="ghost" onClick={() => setTab("HISTORICO")} type="button">
                  Ver Histórico
                </Button>
              </div>
            </Card>
          ) : null}

          {/* HISTÓRICO */}
          {tab === "HISTORICO" ? (
            <Card className="p-4">
              {/* ... (sem mudanças aqui) ... */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Histórico</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Auditoria de movimentações (Entrada/Saída/Transferência + Cadastro).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={loadHistorico} disabled={histLoading} type="button">
                    Atualizar
                  </Button>
                </div>
              </div>

              {histErr ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{histErr}</div>
              ) : null}

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

                      const origem =
                        h.deposito_origem_nome || (h.deposito_origem_id ? depById.get(h.deposito_origem_id)?.nome : null);
                      const destino =
                        h.deposito_destino_nome || (h.deposito_destino_id ? depById.get(h.deposito_destino_id)?.nome : null);

                      return (
                        <li key={h.id} className="px-4 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tipoBadge}`}>
                                  {h.tipo}
                                </span>
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
                                Operador:{" "}
                                <b>{h.operador_nome || userById.get(h.operador_usuario_id)?.nome || `#${h.operador_usuario_id}`}</b>
                                {h.solicitante_usuario_id ? (
                                  <>
                                    {" "}
                                    • Solicitante:{" "}
                                    <b>
                                      {h.solicitante_nome ||
                                        userById.get(h.solicitante_usuario_id)?.nome ||
                                        `#${h.solicitante_usuario_id}`}
                                    </b>
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
              {/* ... (sem mudanças aqui) ... */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Avançado</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Depósitos, Categorias e Fabricantes: criar, renomear + exportação/importação CSV.
                  </p>
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

                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      Observação: não há opção de excluir depósito (por segurança).
                    </div>
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
                    Formato esperado: CODIGO, ETIQUETA, DESCRIÇÃO, CATEGORIA, FABRICANTE, DEPÓSITO, EST. MINIMO, EST. MAXIMO, ESTOQUE,
                    PREÇO VENDA...
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
      <Modal
        open={prodEditOpen}
        title="Editar produto"
        subtitle="Edite o cadastro e/ou ajuste os saldos por depósito."
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

                  {/* ✅ padrão R$1.000,00 */}
                  <Field label="Valor (R$)">
                    <TextInput
                      type="text"
                      inputMode="numeric"
                      value={editValor}
                      onChange={(e) => setEditValor(maskBRLInput(e.target.value))}
                      onFocus={(e) => {
                        // mantém formato; se vier vazio por algum motivo, força
                        if (!editValor?.trim()) setEditValor("R$ 0,00");
                        // coloca cursor no final (boa UX)
                        setTimeout(() => {
                          try {
                            const el = e.target;
                            const len = el.value.length;
                            el.setSelectionRange(len, len);
                          } catch {}
                        }, 0);
                      }}
                      placeholder="R$ 0,00"
                    />
                  </Field>

                  <Field label="Mínimo (alerta)">
                    <TextInput type="number" min={0} step={1} value={editMin} onChange={(e) => setEditMin(Number(e.target.value))} />
                  </Field>

                  <Field label="Foto (trocar)">
                    <TextInput type="file" accept="image/*" onChange={async (e) => onProdutoFotoNova(e.target.files?.[0])} />
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
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={salvarCadastroProduto} disabled={prodBusy}>
                    Salvar cadastro
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setProdEditOpen(false)} disabled={prodBusy}>
                    Fechar
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">Saldos por depósito</p>

                <div className="mt-3 space-y-2">
                  {depositos.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                      </div>

                      <div className="w-28">
                        <TextInput
                          type="number"
                          min={0}
                          step={1}
                          value={editSaldos[d.id] ?? 0}
                          onChange={(e) => setEditSaldos((prev) => ({ ...prev, [d.id]: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="soft" onClick={salvarSaldosProduto} disabled={prodBusy}>
                    Salvar saldos
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-500">Obs.: código de barras fica somente leitura aqui (se quiser editar também, precisa endpoint).</div>
            </div>
          );
        })()}
      </Modal>

      {/* MODAL: ENTRADA */}
      <Modal
        open={entradaOpen}
        title="Entrada"
        subtitle="Leia/digite o código (ou use a câmera). Se não existir, preencha dados do produto. Você pode montar uma lista de vários itens."
        onClose={() => setEntradaOpen(false)}
      >
        {/* ... (sem mudanças aqui) ... */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código de barras">
            <div className="flex gap-2">
              <TextInput
                value={entradaBarcode}
                onChange={(e) => setEntradaBarcode(e.target.value)}
                placeholder="Leia com leitor ou digite"
                inputMode="numeric"
              />
              <Button variant="ghost" type="button" onClick={() => setEntradaScanOpen(true)} title="Abrir câmera">
                📷 Escanear
              </Button>
            </div>
          </Field>

          <Field label="Depósito (entrada)">
            <Select value={entradaDepositoId} onChange={(e) => setEntradaDepositoId(Number(e.target.value))}>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Quantidade (entrada)">
            <TextInput type="number" min={1} step={1} value={entradaQtd} onChange={(e) => setEntradaQtd(Number(e.target.value))} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Observação (opcional)">
              <TextArea value={entradaObs} onChange={(e) => setEntradaObs(e.target.value)} placeholder="Detalhes da entrada..." />
            </Field>
          </div>

          {!entradaProdutoExistente && entradaBarcode.trim() ? (
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Produto novo (código não encontrado)</p>
              <p className="mt-1 text-xs text-slate-600">Preencha para cadastrar junto com a entrada.</p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nome do produto">
                  <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: URNA 008 ..." />
                </Field>

                <Field label="Valor">
                  <TextInput type="number" step="0.01" value={novoValor} onChange={(e) => setNovoValor(Number(e.target.value))} />
                </Field>

                <Field label="Mínimo (alerta)">
                  <TextInput type="number" min={0} step={1} value={novoMin} onChange={(e) => setNovoMin(Number(e.target.value))} />
                </Field>

                <Field label="Foto (arquivo)">
                  <TextInput
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      await onEntradaFoto(file);
                    }}
                  />
                </Field>

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
                    <Button variant="ghost" type="button" onClick={() => setCatQuickOpen(true)} title="Criar categoria">
                      ＋
                    </Button>
                  </div>
                </Field>

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
                    <Button variant="ghost" type="button" onClick={() => setFabQuickOpen(true)} title="Criar fabricante">
                      ＋
                    </Button>
                  </div>
                </Field>

                {novoFoto ? (
                  <div className="sm:col-span-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={novoFoto} alt="Prévia" className="h-40 w-full rounded-2xl border border-slate-200 object-cover" />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button onClick={applyEntradaSingle} disabled={loading} type="button">
              Confirmar esta entrada
            </Button>
            <Button variant="soft" onClick={addEntradaItemToList} type="button">
              Adicionar à lista
            </Button>
            <Button variant="ghost" onClick={applyEntradaLote} disabled={!entradaItens.length && !entradaBarcode.trim()} type="button">
              Confirmar lista inteira
            </Button>
            <Button variant="ghost" onClick={() => setEntradaOpen(false)} type="button">
              Cancelar
            </Button>
          </div>

          {entradaItens.length ? (
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Lista de entradas pendentes</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {entradaItens.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                    <span className="truncate">{it.resumo}</span>
                    <Button type="button" variant="ghost" onClick={() => setEntradaItens((prev) => prev.filter((x) => x.id !== it.id))}>
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <BarcodeScannerModal
        open={entradaScanOpen}
        title="Escanear código de barras (Entrada)"
        onClose={() => setEntradaScanOpen(false)}
        onDetected={(code) => setEntradaBarcode(code)}
      />

      {/* MODAL QUICK: CATEGORIA */}
      <Modal open={catQuickOpen} title="Criar categoria" subtitle="Cria e já deixa disponível para seleção." onClose={() => setCatQuickOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
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

      {/* MODAL QUICK: FABRICANTE */}
      <Modal open={fabQuickOpen} title="Criar fabricante" subtitle="Cria e já deixa disponível para seleção." onClose={() => setFabQuickOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
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

      {/* MODAL: SAÍDA */}
      <Modal
        open={saidaOpen}
        title="Saída"
        subtitle="Filtre pelo depósito, procure o produto ou escaneie por câmera. Você pode adicionar vários itens na lista."
        onClose={() => setSaidaOpen(false)}
      >
        {/* ... (sem mudanças aqui) ... */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Depósito (origem)">
            <Select value={saidaDepositoId} onChange={(e) => setSaidaDepositoId(Number(e.target.value))}>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Código de barras (opcional)">
            <div className="flex gap-2">
              <TextInput
                value={saidaBarcode}
                onChange={(e) => setSaidaBarcode(e.target.value)}
                placeholder="Escaneie ou digite"
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const code = saidaBarcode.trim();
                    if (code) onSaidaBarcodePick(code);
                  }
                }}
              />
              <Button variant="ghost" type="button" onClick={() => setSaidaScanOpen(true)} title="Abrir câmera">
                📷 Escanear
              </Button>
            </div>
          </Field>

          <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Buscar produto (nome/código)">
              <TextInput value={saidaBusca} onChange={(e) => setSaidaBusca(e.target.value)} placeholder="Ex: URNA ou 174501..." />
            </Field>

            <Field label="Produto (no depósito)">
              <Select value={saidaProdutoId} onChange={(e) => setSaidaProdutoId(Number(e.target.value))}>
                {saidaProdutosNoDeposito.length ? (
                  saidaProdutosNoDeposito.map((p) => {
                    const s = saldosMap.get(`${p.id}::${saidaDepositoId}`);
                    const qtd = s ? clampInt(s.quantidade) : 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.nome} — CB:{p.codigo_barras} — disp:{qtd}
                      </option>
                    );
                  })
                ) : (
                  <option value={0}>Sem itens no depósito</option>
                )}
              </Select>
            </Field>
          </div>

          <Field label="Quantidade">
            <TextInput type="number" min={1} step={1} value={saidaQtd} onChange={(e) => setSaidaQtd(Number(e.target.value))} />
          </Field>

          <Field label="Solicitante">
            <Select value={saidaSolicitanteId} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value))}>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.usuario})
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Destino (obra/setor/local)">
              <TextInput value={saidaDestino} onChange={(e) => setSaidaDestino(e.target.value)} placeholder="Ex: Obra X / Setor Y" />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Observação (opcional)">
              <TextArea value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} placeholder="Detalhes da saída..." />
            </Field>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button onClick={applySaidaSingle} disabled={loading || !saidaProdutosNoDeposito.length || !saidaProdutoId} type="button">
              Confirmar esta saída
            </Button>
            <Button variant="soft" onClick={addSaidaItemToList} disabled={!saidaProdutoId} type="button">
              Adicionar à lista
            </Button>
            <Button variant="ghost" onClick={applySaidaLote} disabled={!saidaItens.length && !saidaProdutoId} type="button">
              Confirmar lista inteira
            </Button>
            <Button variant="ghost" onClick={() => setSaidaOpen(false)} type="button">
              Cancelar
            </Button>
          </div>

          {saidaItens.length ? (
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Lista de saídas pendentes</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {saidaItens.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                    <span className="truncate">{it.resumo}</span>
                    <Button type="button" variant="ghost" onClick={() => setSaidaItens((prev) => prev.filter((x) => x.id !== it.id))}>
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <BarcodeScannerModal
        open={saidaScanOpen}
        title="Escanear código de barras (Saída)"
        onClose={() => setSaidaScanOpen(false)}
        onDetected={(code) => onSaidaBarcodePick(code)}
      />
    </main>
  );
}
