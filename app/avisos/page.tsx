"use client";

/**
 * /avisos — mural de avisos gerais e observações dos atendimentos do Quadro.
 *
 * 29/10/2026 (repaginação visual, arquivo único; o AvisosBox deixou de ser usado aqui):
 * - novo aviso geral no topo (várias linhas, contador, Enter envia / Shift+Enter quebra linha);
 * - filtro Todos | Gerais | Atendimentos;
 * - observações agrupadas dentro do card de cada atendimento (pelo sepultamento_id ou pelo nome);
 * - datas relativas ("há 5 min"), destaque de aviso novo, excluir com confirmação no padrão do app;
 * - mesmas chamadas ao avisos.php e ao informativo.php, mesmas tags gravadas ("Geral:" / "Atendimento:").
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconAlertTriangle,
    IconClipboardList,
    IconDots,
    IconMessagePlus,
    IconPencil,
    IconSend,
    IconSpeakerphone,
    IconTrash,
    IconX,
} from "@tabler/icons-react";

import type { Aviso, Registro } from "../acompanhamento/components/types";
import { jsonWith401, normalizarStatus } from "../acompanhamento/components/helpers";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const LIMITE = 255;
/** Aviso criado há menos disso ganha o destaque "novo". */
const NOVO_MS = 10 * 60 * 1000;

/* =========================
   Status (nome real)
   ========================= */
function capStatus(s?: string) {
    switch (normalizarStatus(s)) {
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
            return "Transportando P/ Velório";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Transportando P/ Sepultamento";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

/** Cor da etiqueta de status, por etapa. */
function corStatus(s?: string): string {
    const f = normalizarStatus(s) || "";
    if (["fase01", "fase02", "fase03"].includes(f)) {
        return "bg-[#E9EFF6] text-[#3D6A99] dark:bg-[#3D6A99]/30 dark:text-[#9CC0E6]";
    }
    if (["fase04", "fase05"].includes(f)) {
        return "bg-[#FFF7DB] text-[#6B5208] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]";
    }
    if (["fase06", "fase08", "fase12"].includes(f)) {
        return "bg-[#B3CE52]/20 text-[#3F5410] dark:text-[#B3CE52]";
    }
    return "bg-[#EEF2F7] text-[#313C55] dark:bg-white/10 dark:text-[#D6DCE8]";
}

/* =========================
   MESMAS REGRAS DO QUADRO
   ========================= */
function isNao(v?: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}
function isSim(v?: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "s";
}
function isTerceiroRegistro(r: any) {
    if (r?.tipo_atendimento === "terceiro") return true;
    return isNao(r?.assistencia) && isNao(r?.tanato) && isNao(r?.ornamentacao);
}

/**
 * Compatibilidade para os campos novos:
 * - "Não" desativa a rota;
 * - "Sim" ativa;
 * - vazio/NULL/undefined = atendimento legado, portanto mantém o fluxo antigo como "Sim".
 */
function rotaAtivaLegado(v: any) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return true;
    return s !== "não" && s !== "nao" && s !== "n";
}

/**
 * Mesma regra usada nos quadros de Atendimento e TV.
 *
 * - fase11: encerrou definitivamente e sai da lista.
 * - Assistência = Sim em atendimento funerário: permanece até Material Recolhido.
 * - Com Sepultamento: permanece até fase10.
 * - Sem Sepultamento, mas com Velório: encerra ao chegar em fase08.
 * - Sem Velório e sem Sepultamento: Corpo Pronto (fase12) é a última etapa.
 */
function atendimentoDeveFicarNoQuadro(r: any) {
    const status = normalizarStatus(r?.status);

    // Se o status ainda não estiver definido/reconhecido, não escondemos o atendimento.
    if (!status) return true;

    // Material Recolhido encerra sempre.
    if (status === "fase11") return false;

    const terceiro = isTerceiroRegistro(r);
    const precisaMaterialRecolhido = !terceiro && isSim(r?.assistencia);

    // Quando há Assistência, o atendimento continua até Material Recolhido,
    // independentemente de Velório/Sepultamento.
    if (precisaMaterialRecolhido) return true;

    const realizaVelorio = rotaAtivaLegado(r?.realiza_velorio);
    const realizaSepultamento = rotaAtivaLegado(r?.realiza_sepultamento);

    // Sepultamento é a última rota aplicável.
    if (realizaSepultamento) {
        return status !== "fase10";
    }

    // Sem sepultamento, mas com velório: encerra em Velando/Entrega de Corpo.
    if (realizaVelorio) {
        return !["fase08", "fase09", "fase10"].includes(status);
    }

    // Sem velório e sem sepultamento: Corpo Pronto encerra o fluxo.
    return !["fase12", "fase07", "fase08", "fase09", "fase10"].includes(status);
}

function parseRegistroDateTime(r: any) {
    const d = String(r?.data ?? "").trim();
    const h =
        String(r?.hora_fim_velorio ?? "").trim() ||
        String(r?.hora_inicio_velorio ?? "").trim() ||
        "00:00";
    if (!d) return 0;

    const [yyyy, mm, dd] = d.split("-");
    const iso = `${yyyy}-${mm}-${dd}T${h}:00`;
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? 0 : ts;
}

/* =========================
   Tags de aviso
   ========================= */
const TAG_SERVICO = "Atendimento:";
const TAG_GERAL = "Geral:";

function normNome(s: string) {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}

/** "Falecido(a):", "Falecido:", "Falecida:"... (gravadas pelo informativo.php ao editar o atendimento). */
const RE_FALECIDO = /^falecid[oa]s?(\(a\))?:/i;
/** "Falecido(a): NOME Obs: texto" → [NOME, texto]. */
const RE_FALECIDO_OBS = /^\s*falecid[oa]s?(?:\(a\))?:\s*(.+?)\s+obs:\s*([\s\S]*)$/i;

type AvisoLido = {
    id: number | string;
    tipo: "geral" | "atendimento";
    /** Texto para mostrar (sem a tag e, nas observações, sem o nome). */
    texto: string;
    /** Nome do falecido citado (observações no formato "Atendimento: NOME: texto"). */
    nome: string;
    /** Formato "Falecido(a): NOME Obs: texto" (do informativo.php). */
    legado: boolean;
    sepultamentoId: string;
    usuario: string;
    criadoEm: number;
    original: Aviso;
};

function lerAviso(a: Aviso): AvisoLido {
    const s = String(a?.mensagem ?? "").trim();
    const base = {
        id: a.id,
        sepultamentoId: String((a as any)?.sepultamento_id ?? "").trim(),
        usuario: String(a?.usuario ?? "").trim(),
        criadoEm: parseDataAviso(a?.criado_em),
        original: a,
    };

    if (s.startsWith(TAG_SERVICO)) {
        const resto = s.slice(TAG_SERVICO.length).trim(); // "NOME: obs"
        const i = resto.indexOf(":");
        const nome = (i >= 0 ? resto.slice(0, i) : "").trim();
        const texto = (i >= 0 ? resto.slice(i + 1) : resto).trim();
        return { ...base, tipo: "atendimento", nome, texto: texto || resto, legado: false };
    }
    if (RE_FALECIDO.test(s)) {
        const m = s.match(RE_FALECIDO_OBS);
        if (m) {
            // o texto costuma vir como "Fulano adicionou uma observação: ..."; mostra só a observação
            const texto = m[2].replace(/^.*?adicionou uma observa(ç|c)ão:\s*/i, "").trim();
            return { ...base, tipo: "atendimento", nome: m[1].trim(), texto: texto || m[2].trim(), legado: true };
        }
        return { ...base, tipo: "atendimento", nome: "", texto: s, legado: true };
    }
    if (s.startsWith(TAG_GERAL)) {
        return { ...base, tipo: "geral", nome: "", texto: s.slice(TAG_GERAL.length).trim(), legado: false };
    }
    // aviso antigo sem tag
    return { ...base, tipo: "geral", nome: "", texto: s, legado: false };
}

/* =========================
   Datas
   ========================= */

/** "2026-10-28 14:32:10" (hora do servidor, Brasília) → timestamp local. Funciona também no Safari. */
function parseDataAviso(v?: string): number {
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime();
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
}

function quando(ts: number, agora: number): string {
    if (!ts) return "";
    const diff = Math.max(0, agora - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const d = new Date(ts);
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const hoje = new Date(agora);
    const ontem = new Date(agora - 86400000);
    const mesmoDia = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (mesmoDia(d, hoje)) return `hoje ${hora}`;
    if (mesmoDia(d, ontem)) return `ontem ${hora}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

function dataCompleta(ts: number): string {
    return ts ? new Date(ts).toLocaleString("pt-BR") : "";
}

function iniciais(nome: string): string {
    const p = nome.trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return ((p[0][0] ?? "") + (p.length > 1 ? p[p.length - 1][0] ?? "" : "")).toUpperCase();
}

/* =========================
   Estilos
   ========================= */
const TXT_SEC = "text-[#5B6782] dark:text-[#AEB9CF]";
const CARD =
    "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]";
const BTN_PRIMARIO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#313C55] px-5 text-sm font-bold text-white transition hover:bg-[#3D6A99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_SECUNDARIO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#D5DCE6] bg-white px-4 text-sm font-semibold text-[#313C55] transition hover:bg-[#F6F8FB] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-[#232B3F] dark:text-white dark:hover:bg-[#1C2334]";
const BTN_PERIGO =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#B42318] px-5 text-sm font-bold text-white transition hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FF9C92] dark:text-[#3A0F0B] dark:hover:bg-[#FF8A7E]";
const CAMPO_TEXTO =
    "w-full resize-none rounded-xl border border-[#D5DCE6] bg-white px-3 py-3 text-[16px] leading-6 text-[#313C55] outline-none transition placeholder:text-[#8A94A8] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:border-white/25 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#7F8AA3]";

/* =========================
   Componentes de apoio
   ========================= */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

function Janela({
    titulo,
    subtitulo,
    icone,
    onClose,
    podeFechar = true,
    rodape,
    children,
}: {
    titulo: string;
    subtitulo?: string;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape?: React.ReactNode;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && podeFechar) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose, podeFechar]);

    return (
        <NoCorpo>
            <div
                role="dialog"
                data-pai-overlay
                aria-modal="true"
                aria-label={titulo}
                className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && podeFechar) onClose();
                }}
            >
                <div className="flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-[88vh] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? (
                                <p className={`mt-0.5 break-words text-[13px] [overflow-wrap:anywhere] lg:mt-1 lg:text-sm ${TXT_SEC}`}>
                                    {subtitulo}
                                </p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!podeFechar}
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>

                    {rodape ? (
                        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:gap-3 lg:px-6 lg:py-4">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/** Campo de texto com contador. Enter envia; Shift+Enter quebra a linha. */
function CampoMensagem({
    id,
    value,
    onChange,
    onEnviar,
    placeholder,
    linhas = 3,
    disabled,
    autoFocus,
}: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    onEnviar?: () => void;
    placeholder: string;
    linhas?: number;
    disabled?: boolean;
    autoFocus?: boolean;
}) {
    const restante = LIMITE - value.length;
    return (
        <div>
            <textarea
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value.slice(0, LIMITE))}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && onEnviar) {
                        e.preventDefault();
                        onEnviar();
                    }
                }}
                rows={linhas}
                maxLength={LIMITE}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                className={CAMPO_TEXTO}
            />
            <div className={`mt-1 flex items-center justify-between gap-2 text-xs ${TXT_SEC}`}>
                <span className="hidden sm:inline">Enter envia · Shift+Enter quebra a linha</span>
                <span
                    className={[
                        "ml-auto font-semibold tabular-nums",
                        restante <= 20 ? "text-[#B42318] dark:text-[#FF9C92]" : "",
                    ].join(" ")}
                >
                    {value.length}/{LIMITE}
                </span>
            </div>
        </div>
    );
}

/** Menu "⋯" com Editar / Excluir. */
function MenuAcoes({ onEditar, onExcluir, rotulo }: { onEditar: () => void; onExcluir: () => void; rotulo: string }) {
    const [aberto, setAberto] = useState(false);
    useEffect(() => {
        if (!aberto) return;
        const fechar = () => setAberto(false);
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
        window.addEventListener("click", fechar);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("click", fechar);
            window.removeEventListener("keydown", onKey);
        };
    }, [aberto]);

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                aria-label={`Ações do ${rotulo}`}
                aria-haspopup="menu"
                aria-expanded={aberto}
                onClick={(e) => {
                    e.stopPropagation();
                    setAberto((v) => !v);
                }}
                className="grid size-10 place-items-center rounded-xl text-[#5B6782] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/10"
            >
                <IconDots size={20} stroke={2} />
            </button>
            {aberto ? (
                <div
                    role="menu"
                    className="absolute right-0 top-11 z-30 w-40 overflow-hidden rounded-xl border border-[#E3E8F0] bg-white py-1 shadow-xl dark:border-white/[0.12] dark:bg-[#1C2334]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setAberto(false);
                            onEditar();
                        }}
                        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm font-semibold hover:bg-[#F6F8FB] dark:hover:bg-white/10"
                    >
                        <IconPencil size={17} stroke={1.8} />
                        Editar
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            setAberto(false);
                            onExcluir();
                        }}
                        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm font-semibold text-[#B42318] hover:bg-red-50 dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10"
                    >
                        <IconTrash size={17} stroke={1.8} />
                        Excluir
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function SeloNovo() {
    return (
        <span className="rounded-full bg-[#F2CB3F] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#313C55]">
            novo
        </span>
    );
}

/* =========================
   Página
   ========================= */

type Filtro = "todos" | "gerais" | "atendimentos";

type Aviso_UI = { text: string; ok: boolean } | null;

export default function AvisosPage() {
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [carregado, setCarregado] = useState(false);

    const [aviso, setAviso] = useState<Aviso_UI>(null);
    const [filtro, setFiltro] = useState<Filtro>("todos");
    const [agora, setAgora] = useState(() => Date.now());

    // novo aviso geral
    const [textoGeral, setTextoGeral] = useState("");
    const [enviandoGeral, setEnviandoGeral] = useState(false);

    // observação
    const [obsAlvo, setObsAlvo] = useState<{ id: string; nome: string } | null>(null);
    const [obsTexto, setObsTexto] = useState("");
    const [obsLoading, setObsLoading] = useState(false);

    // edição / exclusão
    const [editando, setEditando] = useState<AvisoLido | null>(null);
    const [editTexto, setEditTexto] = useState("");
    const [editLoading, setEditLoading] = useState(false);
    const [excluindo, setExcluindo] = useState<AvisoLido | null>(null);
    const [excluirLoading, setExcluirLoading] = useState(false);

    // a mensagem de sucesso some sozinha; o relógio das datas relativas anda a cada 30 s
    useEffect(() => {
        if (!aviso?.ok) return;
        const t = window.setTimeout(() => setAviso(null), 4000);
        return () => window.clearTimeout(t);
    }, [aviso]);
    useEffect(() => {
        const t = window.setInterval(() => setAgora(Date.now()), 30000);
        return () => window.clearInterval(t);
    }, []);

    /* ---------------- Carregamento ---------------- */

    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(`${ENDPOINT}/avisos.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            setAvisos(Array.isArray(data) ? data : []);
        } catch {
            setAvisos([]);
        } finally {
            setCarregado(true);
            setAgora(Date.now());
        }
    }, []);

    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(`${ENDPOINT}/informativo.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
                    id: it?.id != null ? String(it.id) : it.id,
                    status: normalizarStatus(it?.status) ?? it?.status,
                    // NULL representa atendimento legado: não converter para "Não".
                    realiza_velorio: it?.realiza_velorio ?? null,
                    realiza_sepultamento: it?.realiza_sepultamento ?? null,
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    useEffect(() => {
        fetchAvisos();
        fetchRegistros();
    }, [fetchAvisos, fetchRegistros]);

    useEffect(() => {
        const intAv = setInterval(() => {
            if (!document.hidden) fetchAvisos();
        }, 3000);
        const intReg = setInterval(() => {
            if (!document.hidden) fetchRegistros();
        }, 10000);

        const onVis = () => {
            if (!document.hidden) {
                fetchAvisos();
                fetchRegistros();
            }
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            clearInterval(intAv);
            clearInterval(intReg);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [fetchAvisos, fetchRegistros]);

    /* ---------------- Dados derivados ---------------- */

    // mesma lista do quadro (filtro + ordenação)
    const atendimentos = useMemo(() => {
        const base = (registros || []).filter(atendimentoDeveFicarNoQuadro);
        const withTs = base.map((r: any) => ({ r, ts: parseRegistroDateTime(r) }));
        withTs.sort((a, b) => b.ts - a.ts);
        return withTs.map(({ r }) => r) as Registro[];
    }, [registros]);

    const porNome = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of atendimentos as any[]) {
            const nome = String(r?.falecido ?? "").trim();
            if (nome) m.set(normNome(nome), String(r.id));
        }
        return m;
    }, [atendimentos]);

    const idsAtivos = useMemo(() => new Set((atendimentos as any[]).map((r) => String(r.id))), [atendimentos]);

    /** Avisos ativos, lidos e mais novos primeiro. */
    const lidos = useMemo(() => {
        return (avisos ?? [])
            .filter((a: any) => Number(a?.finalizado ?? 0) !== 1)
            .map(lerAviso)
            .sort((a, b) => b.criadoEm - a.criadoEm);
    }, [avisos]);

    // O avisos.php já esconde as observações de atendimentos que saíram do Quadro (pelo número ou pelo nome).
    // A tela confere de novo com a lista do Quadro, para o aviso sumir junto com o card, sem esperar o servidor.
    const { gerais, obsPorAtendimento, obsSoltas } = useMemo(() => {
        const g: AvisoLido[] = [];
        const mapa = new Map<string, AvisoLido[]>();
        const soltas: AvisoLido[] = [];
        for (const a of lidos) {
            if (a.tipo === "geral") {
                g.push(a);
                continue;
            }
            const alvo =
                (a.sepultamentoId && idsAtivos.has(a.sepultamentoId) ? a.sepultamentoId : "") ||
                (a.nome ? porNome.get(normNome(a.nome)) ?? "" : "");
            if (alvo) {
                if (!mapa.has(alvo)) mapa.set(alvo, []);
                mapa.get(alvo)!.push(a);
            } else if (!a.nome) {
                // sem nome reconhecível: não dá para saber de qual atendimento é
                soltas.push(a);
            }
            // com nome/número de atendimento que não está mais no quadro: não mostra
        }
        return { gerais: g, obsPorAtendimento: mapa, obsSoltas: soltas };
    }, [lidos, idsAtivos, porNome]);

    const totalObs = useMemo(() => {
        let n = obsSoltas.length;
        obsPorAtendimento.forEach((l) => (n += l.length));
        return n;
    }, [obsPorAtendimento, obsSoltas]);

    /* ---------------- Ações ---------------- */

    const enviarGeral = useCallback(async () => {
        const val = textoGeral.trim();
        if (!val) {
            setAviso({ text: "Digite um aviso para enviar.", ok: false });
            return;
        }
        setEnviandoGeral(true);
        try {
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mensagem: `${TAG_GERAL} ${val}` }),
            });
            if (res?.sucesso) {
                setAviso({ text: "Aviso publicado.", ok: true });
                setTextoGeral("");
                fetchAvisos();
            } else {
                setAviso({ text: res?.erro || res?.msg || "Erro ao publicar o aviso.", ok: false });
            }
        } catch (e: any) {
            setAviso({ text: e?.message || "Erro ao publicar o aviso.", ok: false });
        } finally {
            setEnviandoGeral(false);
        }
    }, [textoGeral, fetchAvisos]);

    const abrirObservacao = (r: any) => {
        const nome = String(r?.falecido ?? "").trim();
        if (!nome) {
            setAviso({ ok: false, text: "Não encontrei o nome do falecido nesse atendimento." });
            return;
        }
        setObsTexto("");
        setObsAlvo({ id: String(r?.id ?? ""), nome });
    };

    const fecharObservacao = useCallback(() => {
        if (obsLoading) return;
        setObsAlvo(null);
        setObsTexto("");
    }, [obsLoading]);

    const enviarObservacao = useCallback(async () => {
        if (!obsAlvo) return;
        const obs = obsTexto.trim();
        if (!obs) {
            setAviso({ ok: false, text: "Digite a observação." });
            return;
        }
        if (!idsAtivos.has(obsAlvo.id)) {
            setAviso({
                ok: false,
                text: "Esse atendimento não está mais no quadro. Não foi possível adicionar a observação.",
            });
            setObsAlvo(null);
            return;
        }

        setObsLoading(true);
        try {
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                // 27/10/2026: manda o número do atendimento; o avisos.php esconde o aviso quando o atendimento sai do Quadro.
                body: JSON.stringify({
                    mensagem: `${TAG_SERVICO} ${obsAlvo.nome}: ${obs}`,
                    sepultamento_id: Number(obsAlvo.id) || undefined,
                }),
            });
            if (res?.sucesso) {
                setAviso({ ok: true, text: "Observação adicionada." });
                setObsAlvo(null);
                setObsTexto("");
                fetchAvisos();
            } else {
                setAviso({ ok: false, text: res?.erro || res?.msg || "Erro ao adicionar a observação." });
            }
        } catch (e: any) {
            setAviso({ ok: false, text: e?.message || "Erro ao adicionar a observação." });
        } finally {
            setObsLoading(false);
        }
    }, [obsAlvo, obsTexto, idsAtivos, fetchAvisos]);

    const abrirEdicao = (a: AvisoLido) => {
        setEditTexto(a.texto);
        setEditando(a);
    };

    const fecharEdicao = useCallback(() => {
        if (editLoading) return;
        setEditando(null);
        setEditTexto("");
    }, [editLoading]);

    const salvarEdicao = useCallback(async () => {
        if (!editando) return;
        const t = editTexto.trim();
        if (!t) {
            setAviso({ ok: false, text: "Digite um texto para salvar." });
            return;
        }
        // mantém o formato gravado: "Geral: texto" / "Atendimento: NOME: texto" / mensagem antiga como está
        const mensagem =
            editando.tipo === "geral"
                ? `${TAG_GERAL} ${t}`
                : editando.legado
                    ? editando.nome
                        ? `Falecido(a): ${editando.nome} Obs: ${t}`
                        : t
                    : editando.nome
                        ? `${TAG_SERVICO} ${editando.nome}: ${t}`
                        : `${TAG_SERVICO} ${t}`;

        setEditLoading(true);
        try {
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: editando.id, mensagem }),
            });
            if (!res?.sucesso) throw new Error(res?.erro || res?.msg || "Erro ao salvar.");
            setAviso({ ok: true, text: "Aviso atualizado." });
            setEditando(null);
            setEditTexto("");
            fetchAvisos();
        } catch (e: any) {
            setAviso({ ok: false, text: e?.message || "Erro ao salvar." });
        } finally {
            setEditLoading(false);
        }
    }, [editando, editTexto, fetchAvisos]);

    const confirmarExclusao = useCallback(async () => {
        if (!excluindo) return;
        setExcluirLoading(true);
        try {
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: excluindo.id, excluir: true }),
            });
            if (res?.sucesso) {
                setAviso({ ok: true, text: "Aviso excluído." });
                setExcluindo(null);
                fetchAvisos();
            } else {
                setAviso({ ok: false, text: res?.erro || res?.msg || "Erro ao excluir." });
            }
        } catch (e: any) {
            setAviso({ ok: false, text: e?.message || "Erro ao excluir." });
        } finally {
            setExcluirLoading(false);
        }
    }, [excluindo, fetchAvisos]);

    /* ---------------- Render ---------------- */

    const mostrarGerais = filtro !== "atendimentos";
    const mostrarAtendimentos = filtro !== "gerais";

    const chips: Array<{ k: Filtro; label: string; n: number }> = [
        { k: "todos", label: "Todos", n: gerais.length + totalObs },
        { k: "gerais", label: "Gerais", n: gerais.length },
        { k: "atendimentos", label: "Atendimentos", n: totalObs },
    ];

    const linhaAutor = (a: AvisoLido) => (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {a.usuario ? <span className="font-bold text-[#313C55] dark:text-white">{a.usuario}</span> : null}
            {a.criadoEm ? (
                <time className={TXT_SEC} dateTime={new Date(a.criadoEm).toISOString()} title={dataCompleta(a.criadoEm)}>
                    {quando(a.criadoEm, agora)}
                </time>
            ) : null}
            {a.criadoEm && agora - a.criadoEm < NOVO_MS ? <SeloNovo /> : null}
        </div>
    );

    const blocoObservacao = (a: AvisoLido) => (
        <li key={String(a.id)} className="flex items-start gap-2 py-2.5">
            <span
                aria-hidden
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#FFF7DB] text-[11px] font-extrabold text-[#6B5208] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]"
            >
                {iniciais(a.usuario || "?")}
            </span>
            <div className="min-w-0 flex-1">
                {linhaAutor(a)}
                <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-relaxed [overflow-wrap:anywhere]">
                    {a.texto}
                </p>
            </div>
            <MenuAcoes rotulo="observação" onEditar={() => abrirEdicao(a)} onExcluir={() => setExcluindo(a)} />
        </li>
    );

    return (
        <div className="min-h-screen bg-[#F6F8FB] text-[#313C55] dark:bg-[#1C2334] dark:text-white">
            <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                {/* Cabeçalho */}
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Avisos</h1>
                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                            {gerais.length} {gerais.length === 1 ? "aviso geral" : "avisos gerais"} · {totalObs}{" "}
                            {totalObs === 1 ? "observação" : "observações"} de atendimento · {atendimentos.length}{" "}
                            {atendimentos.length === 1 ? "atendimento" : "atendimentos"} no quadro
                        </p>
                    </div>
                </header>

                {/* Retorno das ações */}
                {aviso ? (
                    <div
                        role={aviso.ok ? "status" : "alert"}
                        className={[
                            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
                            aviso.ok
                                ? "border-[#B3CE52]/60 bg-[#B3CE52]/15 text-[#3F5410] dark:text-[#B3CE52]"
                                : "border-red-200 bg-red-50 text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
                        ].join(" ")}
                    >
                        <span className="min-w-0 flex-1">{aviso.text}</span>
                        <button
                            type="button"
                            onClick={() => setAviso(null)}
                            aria-label="Fechar aviso"
                            className="-my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                        >
                            <IconX size={16} stroke={2} />
                        </button>
                    </div>
                ) : null}

                {/* Novo aviso geral */}
                <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="novo-aviso-titulo">
                    <div className="flex items-center gap-2">
                        <span className="grid size-9 place-items-center rounded-xl bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            <IconSpeakerphone size={19} stroke={1.8} />
                        </span>
                        <h2 id="novo-aviso-titulo" className="text-base font-extrabold">
                            Novo aviso geral
                        </h2>
                    </div>
                    <p className={`mt-1 text-sm ${TXT_SEC}`}>Aparece para toda a equipe, no sino e nesta tela.</p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                            <label htmlFor="aviso-geral" className="sr-only">
                                Texto do aviso geral
                            </label>
                            <CampoMensagem
                                id="aviso-geral"
                                value={textoGeral}
                                onChange={setTextoGeral}
                                onEnviar={enviarGeral}
                                placeholder="Ex.: Reunião às 17h na sala de controle."
                                linhas={2}
                                disabled={enviandoGeral}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={enviarGeral}
                            disabled={enviandoGeral || !textoGeral.trim()}
                            className={`${BTN_PRIMARIO} w-full sm:w-auto`}
                        >
                            <IconSend size={18} stroke={2} />
                            {enviandoGeral ? "Publicando…" : "Publicar"}
                        </button>
                    </div>
                </section>

                {/* Filtro */}
                <div role="tablist" aria-label="Filtrar avisos" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {chips.map((c) => {
                        const ativo = filtro === c.k;
                        return (
                            <button
                                key={c.k}
                                type="button"
                                role="tab"
                                aria-selected={ativo}
                                onClick={() => setFiltro(c.k)}
                                className={[
                                    "inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold transition",
                                    ativo
                                        ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                        : "border-[#E3E8F0] bg-white text-[#5B6782] hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF]",
                                ].join(" ")}
                            >
                                {c.label}
                                <span
                                    className={[
                                        "rounded-full px-2 py-0.5 text-[11px]",
                                        ativo ? "bg-white/15" : "bg-[#E9EFF6] dark:bg-white/10",
                                    ].join(" ")}
                                >
                                    {c.n}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="space-y-6">
                    {/* Mural de avisos gerais */}
                    {mostrarGerais ? (
                        <section aria-labelledby="gerais-titulo" className="min-w-0 space-y-3">
                            <h2 id="gerais-titulo" className={`text-xs font-extrabold uppercase tracking-wider ${TXT_SEC}`}>
                                Avisos gerais ({gerais.length})
                            </h2>

                            {gerais.length === 0 ? (
                                <div className={`${CARD} border-dashed p-6 text-center text-sm ${TXT_SEC}`}>
                                    {carregado ? "Nenhum aviso geral no momento." : "Carregando…"}
                                </div>
                            ) : (
                                gerais.map((a) => (
                                    <article
                                        key={String(a.id)}
                                        className={`${CARD} relative overflow-hidden border-l-4 border-l-[#B42318] p-4 dark:border-l-[#FF9C92]`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span
                                                aria-hidden
                                                className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FDECEA] text-[12px] font-extrabold text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                                            >
                                                {iniciais(a.usuario || "?")}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                {linhaAutor(a)}
                                                <p className="mt-1 whitespace-pre-line break-words text-[16px] leading-relaxed [overflow-wrap:anywhere]">
                                                    {a.texto}
                                                </p>
                                            </div>
                                            <MenuAcoes rotulo="aviso" onEditar={() => abrirEdicao(a)} onExcluir={() => setExcluindo(a)} />
                                        </div>
                                    </article>
                                ))
                            )}
                        </section>
                    ) : null}

                    {/* Atendimentos do quadro com as observações */}
                    {mostrarAtendimentos ? (
                        <section aria-labelledby="atend-titulo" className="min-w-0 space-y-3">
                            <h2 id="atend-titulo" className={`text-xs font-extrabold uppercase tracking-wider ${TXT_SEC}`}>
                                Atendimentos no quadro ({atendimentos.length})
                            </h2>

                            {atendimentos.length === 0 ? (
                                <div className={`${CARD} border-dashed p-6 text-center text-sm ${TXT_SEC}`}>
                                    {carregado ? "Nenhum atendimento no quadro agora." : "Carregando…"}
                                </div>
                            ) : (
                                (atendimentos as any[]).map((r) => {
                                    const obs = obsPorAtendimento.get(String(r.id)) ?? [];
                                    const local = String(r?.local_velorio ?? "").trim();
                                    const hora = String(r?.hora_inicio_velorio ?? "").trim().slice(0, 5);
                                    return (
                                        <article key={String(r.id)} className={`${CARD} p-4`}>
                                            <div className="flex flex-wrap items-start gap-3">
                                                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E9EFF6] text-[#3D6A99] dark:bg-[#3D6A99]/30 dark:text-[#9CC0E6]">
                                                    <IconClipboardList size={19} stroke={1.8} />
                                                </span>
                                                <div className="min-w-[160px] flex-1">
                                                    <h3 className="break-words text-[16px] font-extrabold leading-snug [overflow-wrap:anywhere]">
                                                        {String(r?.falecido ?? "") || `Atendimento #${r.id}`}
                                                    </h3>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${corStatus(r?.status)}`}>
                                                            {capStatus(r?.status) || "Sem status"}
                                                        </span>
                                                        {local || hora ? (
                                                            <span className={`text-xs ${TXT_SEC}`}>
                                                                Velório{local ? `: ${local}` : ""}
                                                                {hora ? ` · ${hora}` : ""}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => abrirObservacao(r)}
                                                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-[#D5DCE6] px-3 text-sm font-bold text-[#313C55] transition hover:bg-[#F6F8FB] sm:w-auto dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                                                >
                                                    <IconMessagePlus size={18} stroke={1.8} />
                                                    Observação
                                                </button>
                                            </div>

                                            {obs.length > 0 ? (
                                                <ul className="mt-3 divide-y divide-[#EEF2F7] rounded-xl bg-[#F6F8FB] px-3 dark:divide-white/[0.08] dark:bg-[#1C2334]">
                                                    {obs.map(blocoObservacao)}
                                                </ul>
                                            ) : null}
                                        </article>
                                    );
                                })
                            )}

                            {obsSoltas.length > 0 ? (
                                <article className={`${CARD} p-4`}>
                                    <h3 className="text-sm font-extrabold">Outras observações</h3>
                                    <p className={`mt-0.5 text-xs ${TXT_SEC}`}>
                                        Observações que não foi possível ligar a um atendimento do quadro.
                                    </p>
                                    <ul className="mt-2 divide-y divide-[#EEF2F7] rounded-xl bg-[#F6F8FB] px-3 dark:divide-white/[0.08] dark:bg-[#1C2334]">
                                        {obsSoltas.map(blocoObservacao)}
                                    </ul>
                                </article>
                            ) : null}
                        </section>
                    ) : null}
                </div>
            </div>

            {/* ============================== Janelas ============================== */}

            {obsAlvo ? (
                <Janela
                    titulo="Nova observação"
                    subtitulo={`Atendimento de ${obsAlvo.nome}`}
                    icone={<IconMessagePlus size={24} stroke={1.8} className="text-[#3D6A99] dark:text-[#9CC0E6]" />}
                    onClose={fecharObservacao}
                    podeFechar={!obsLoading}
                    rodape={
                        <>
                            <button type="button" onClick={fecharObservacao} disabled={obsLoading} className={BTN_SECUNDARIO}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={enviarObservacao}
                                disabled={obsLoading || !obsTexto.trim()}
                                className={BTN_PRIMARIO}
                            >
                                {obsLoading ? "Adicionando…" : "Adicionar"}
                            </button>
                        </>
                    }
                >
                    <label htmlFor="obs-texto" className="mb-1.5 block text-sm font-bold">
                        Observação
                    </label>
                    <CampoMensagem
                        id="obs-texto"
                        value={obsTexto}
                        onChange={setObsTexto}
                        onEnviar={enviarObservacao}
                        placeholder="Ex.: Família pediu para aguardar o filho chegar."
                        linhas={4}
                        disabled={obsLoading}
                        autoFocus
                    />
                </Janela>
            ) : null}

            {editando ? (
                <Janela
                    titulo={editando.tipo === "geral" ? "Editar aviso geral" : "Editar observação"}
                    subtitulo={
                        editando.tipo === "atendimento" && editando.nome ? `Atendimento de ${editando.nome}` : undefined
                    }
                    icone={<IconPencil size={24} stroke={1.8} className="text-[#3D6A99] dark:text-[#9CC0E6]" />}
                    onClose={fecharEdicao}
                    podeFechar={!editLoading}
                    rodape={
                        <>
                            <button type="button" onClick={fecharEdicao} disabled={editLoading} className={BTN_SECUNDARIO}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={salvarEdicao}
                                disabled={editLoading || !editTexto.trim()}
                                className={BTN_PRIMARIO}
                            >
                                {editLoading ? "Salvando…" : "Salvar"}
                            </button>
                        </>
                    }
                >
                    <label htmlFor="edit-texto" className="mb-1.5 block text-sm font-bold">
                        Texto
                    </label>
                    <CampoMensagem
                        id="edit-texto"
                        value={editTexto}
                        onChange={setEditTexto}
                        onEnviar={salvarEdicao}
                        placeholder="Digite o texto…"
                        linhas={5}
                        disabled={editLoading}
                        autoFocus
                    />
                </Janela>
            ) : null}

            {excluindo ? (
                <Janela
                    titulo={excluindo.tipo === "geral" ? "Excluir aviso?" : "Excluir observação?"}
                    subtitulo="Ele some para toda a equipe. Não dá para desfazer."
                    icone={<IconAlertTriangle size={24} stroke={2} className="text-[#B42318] dark:text-[#FF9C92]" />}
                    onClose={() => {
                        if (!excluirLoading) setExcluindo(null);
                    }}
                    podeFechar={!excluirLoading}
                    rodape={
                        <>
                            <button
                                type="button"
                                onClick={() => setExcluindo(null)}
                                disabled={excluirLoading}
                                className={BTN_SECUNDARIO}
                            >
                                Cancelar
                            </button>
                            <button type="button" onClick={confirmarExclusao} disabled={excluirLoading} className={BTN_PERIGO}>
                                <IconTrash size={18} stroke={2} />
                                {excluirLoading ? "Excluindo…" : "Excluir"}
                            </button>
                        </>
                    }
                >
                    <blockquote className="whitespace-pre-line break-words rounded-xl border-l-4 border-[#D5DCE6] bg-[#F6F8FB] px-4 py-3 text-sm [overflow-wrap:anywhere] dark:border-white/20 dark:bg-[#1C2334]">
                        {excluindo.texto}
                    </blockquote>
                </Janela>
            ) : null}
        </div>
    );
}
