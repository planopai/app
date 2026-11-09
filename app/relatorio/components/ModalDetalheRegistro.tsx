"use client";

/*
 * Janela de detalhe do atendimento (Histórico de sepultamentos).
 * 05/11/2026: refeita pela prévia aprovada "Detalhe do atendimento" (três abas: Resumo, Itens e
 * Linha do tempo; no celular abre na Linha do tempo). Os dados e cálculos são os mesmos do PDF
 * (montarDadosRelatorio do PdfRelatorio.ts); o PDF não muda.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
    IconArchive,
    IconArrowBackUp,
    IconBan,
    IconBuildingBank,
    IconBuildingChurch,
    IconCalendar,
    IconCamera,
    IconCar,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconClipboardCheck,
    IconClock,
    IconCoffee,
    IconCoffin,
    IconCross,
    IconDownload,
    IconFileText,
    IconFlask,
    IconFlower,
    IconHeart,
    IconHome,
    IconLayoutGrid,
    IconList,
    IconMapPin,
    IconNotes,
    IconPackage,
    IconPencil,
    IconPhone,
    IconPhoto,
    IconPlant2,
    IconPlus,
    IconRoute,
    IconSignature,
    IconTag,
    IconUser,
    IconUsers,
    IconX,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";
import {
    listarLogPorId,
    obterMateriaisMap,
    obterRegistroAnaliticoPorId,
    type MateriaisMap,
    type AvaliacaoStatusResumo,
    type StatusAvaliacoesItem,
} from "./Api";
import BotaoExportarPdf from "./BotaoExportarPdf";
import TermoVelorioOnlineModal from "@/app/acompanhamento/components/TermoVelorioOnlineModal";
import { situacaoTermoVelorio } from "@/app/acompanhamento/components/termoVelorioOnline";
import { montarResumoFinalDoLog } from "./Normalizadores";
import {
    fmtDuracao,
    montarDadosRelatorio,
    type EventoLinhaTempo,
    type ItemEstoqueRelatorio,
} from "./PdfRelatorio";

interface Props {
    aberto: boolean;
    registro: FalecidoItem | null;
    onFechar: () => void;
    statusAvaliacoes?: StatusAvaliacoesItem;
    podeVerVisita?: boolean;
    podeVerPosAtendimento?: boolean;
    loadingAvaliacoes?: boolean;
    onAbrirVisita?: (item: FalecidoItem) => void;
    onAbrirPosAtendimento?: (item: FalecidoItem) => void;
}

type FotoHistorico = {
    url: string;
    titulo: string;
};

type AbaDetalhe = "resumo" | "itens" | "linha";

type VisualViewportState = {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
};

type Icone = TablerIcon;

/* ============================== Estilos ============================== */

const ROTULO = "text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const CARTAO = "rounded-2xl bg-[#FFFFFF] dark:bg-[#232B3F]";
const TEXTO_FORTE = "text-[#313C55] dark:text-white";
const TEXTO_MEDIO = "text-[#4A5368] dark:text-[#D6DCE8]";
const BTN_ICONE =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40";
const CHIP_VERDE =
    "border border-[#7BA11A] bg-[#EEF5D6] text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]";
const CHIP_AMARELO =
    "border border-[#E4BC30] bg-[#FCF3CC] text-[#6B5200] dark:border-[#F2CB3F]/40 dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]";
const CHIP_CINZA = "bg-[#F1F4F8] text-[#4A5368] dark:bg-[#1C2334] dark:text-[#D6DCE8]";
const CHIP_AZUL = "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-[#D6DCE8]";

/* ============================== Etapas ============================== */

const TRILHA: Array<{ nome: string; equipe: string; icone: Icone }> = [
    { nome: "Aberto", equipe: "Abertura", icone: IconPlus },
    { nome: "Remoção", equipe: "Remoção", icone: IconCar },
    { nome: "Conservação", equipe: "Conservação", icone: IconFlask },
    { nome: "Ornamentação", equipe: "Ornamentação", icone: IconPlant2 },
    { nome: "Corpo pronto", equipe: "Corpo pronto", icone: IconCheck },
    { nome: "Velório", equipe: "Velório", icone: IconBuildingChurch },
    { nome: "Sepultamento", equipe: "Sepultamento", icone: IconCross },
    { nome: "Recolhido", equipe: "Material recolhido", icone: IconArchive },
];

function numeroFase(status?: string) {
    const m = String(status || "").match(/^fase(\d+)/i);
    return m ? Number(m[1]) : null;
}

/** Posição da fase na trilha (o Corpo pronto, fase 12, vem antes do velório). */
function indiceTrilha(status?: string): number {
    const n = numeroFase(status);
    if (n == null) return 0;
    if (n <= 2) return 1;
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    if (n === 12) return 4;
    if (n <= 8) return 5;
    if (n <= 10) return 6;
    if (n === 11) return 7;
    return 0;
}

function iconeDaEtapa(nome: string): Icone {
    const s = nome.toLowerCase();
    if (s.includes("aguard")) return IconClock;
    if (s.includes("conserva")) return IconFlask;
    if (s.includes("ornamenta")) return IconPlant2;
    if (s.includes("pronto")) return IconCheck;
    if (s.includes("transport") || s.includes("retirar") || s.includes("indo")) return IconCar;
    if (s.includes("clínica") || s.includes("clinica")) return IconHome;
    if (s.includes("entrega") || s.includes("velório") || s.includes("velorio")) return IconBuildingChurch;
    if (s.includes("sepult")) return IconCross;
    if (s.includes("recolhid")) return IconArchive;
    return IconClock;
}

function iconeDoEvento(ev: EventoLinhaTempo): Icone {
    const s = ev.texto.toLowerCase();
    if (s.startsWith("atendimento aberto")) return IconPlus;
    if (s.startsWith("atendimento cancelado")) return IconBan;
    if (s.startsWith("etapa voltada")) return IconArrowBackUp;
    if (s.includes("assinad")) return IconSignature;
    if (!ev.etapa) return s.startsWith("foto") ? IconCamera : IconPencil;
    const ultima = s.split("»").pop() || s;
    if (ultima.includes("(com foto)") && !/pronto|entrega|velório/.test(ultima)) return IconCamera;
    return iconeDaEtapa(ultima);
}

function iconeDoServico(rotulo: string): Icone {
    const s = rotulo.toLowerCase();
    if (s.includes("tanato") || s.includes("reconstitui")) return IconFlask;
    if (s.includes("ornamenta")) return IconPlant2;
    if (s.includes("assist")) return IconHeart;
    if (s.includes("coroa")) return IconFlower;
    if (s.includes("lanche")) return IconCoffee;
    if (s.includes("religi")) return IconBuildingChurch;
    if (s.includes("translado")) return IconRoute;
    if (s.includes("prefeitura")) return IconBuildingBank;
    return IconClipboardCheck;
}

function iconeDoGrupo(grupo: string): Icone {
    const s = grupo.toLowerCase();
    if (s.includes("urna")) return IconCoffin;
    if (s.includes("acess")) return IconTag;
    if (s.includes("insumo")) return IconFlask;
    if (s.includes("coroa")) return IconFlower;
    return IconPackage;
}

/* ============================== Utilitários ============================== */

function txt(v: any): string {
    if (v == null || typeof v === "object") return "";
    const s = String(v).trim();
    if (!s || s === "(vazio)" || s === "null" || s === "undefined") return "";
    return s;
}

function simNao(v: any): "sim" | "nao" | "" {
    const s = txt(v)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    if (s === "sim" || s === "1" || s === "true") return "sim";
    if (s === "nao" || s === "0" || s === "false") return "nao";
    return "";
}

function parseJson(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    try {
        return JSON.parse(String(v));
    } catch {
        return null;
    }
}

/** "2026-10-07 14:47:00" → { dia: "07/10/2026", hora: "14:47" } */
function partesDataHora(v: any) {
    const m = txt(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return null;
    return { dia: `${m[3]}/${m[2]}/${m[1]}`, hora: `${m[4]}:${m[5]}` };
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function diaComSemana(dia: string) {
    const m = dia.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return dia;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return `${DIAS_SEMANA[d.getDay()]}, ${dia}`;
}

function curtaData(dia: string) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(dia) ? dia.slice(0, 5) : dia;
}

function dataCurta(v: any) {
    const s = txt(v);
    if (!s || s.startsWith("0000-00-00")) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}`;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[1]}/${br[2]}`;
    return s;
}

function horaCurta(v: any) {
    const m = txt(v).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function juntarComE(lista: string[]) {
    if (lista.length <= 1) return lista.join("");
    return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}

function telefoneLink(contato: string) {
    const d = contato.replace(/\D+/g, "");
    return d.length >= 8 && d.length <= 13 ? `tel:${d}` : "";
}

function logsSemVazios(logs: LogItem[]) {
    return [...(logs || [])]
        .filter((l) => {
            const d = parseJson(l.detalhes);
            return !(d && typeof d === "object" && (d as any).sem_alteracoes === true);
        })
        .sort((a, b) => String(a.datahora || "").localeCompare(String(b.datahora || "")));
}

function ehLogDeEtapa(l: LogItem) {
    const a = String(l.acao || "").toLowerCase();
    return a.includes("criou") || a.includes("atualizou status") || a === "material_recolhido";
}

/* ============================== Pedaços da tela ============================== */

function Titulo({ icone: Ic, children }: { icone: Icone; children: React.ReactNode }) {
    return (
        <h2 className={`m-0 flex items-center gap-2 ${ROTULO}`}>
            <Ic size={16} stroke={2} />
            {children}
        </h2>
    );
}

function CartaoInfo({
    icone: Ic,
    rotulo,
    principal,
    detalhe,
    link,
}: {
    icone: Icone;
    rotulo: string;
    principal: string;
    detalhe?: string;
    link?: { href: string; texto: string };
}) {
    return (
        <div className={`${CARTAO} flex min-w-0 gap-3 p-3 lg:p-4`}>
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E9EFF6] text-[#3D6A99] sm:flex dark:bg-[#3D6A99]/25 dark:text-[#A9BED6]">
                <Ic size={20} stroke={2} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className={`flex items-center gap-1.5 ${ROTULO} text-[11.5px] lg:text-[12px]`}>
                    <span className="sm:hidden">
                        <Ic size={14} stroke={2} />
                    </span>
                    {rotulo}
                </span>
                <span className={`break-words text-[16px] font-extrabold leading-tight lg:text-[19px] ${TEXTO_FORTE}`}>
                    {principal || "—"}
                </span>
                {detalhe ? (
                    <span className={`line-clamp-2 break-words text-[13px] lg:text-[14px] ${TEXTO_MEDIO}`}>{detalhe}</span>
                ) : null}
                {link ? (
                    <a
                        href={link.href}
                        className="inline-flex min-h-[28px] items-center gap-1.5 text-[13px] font-bold text-[#313C55] underline-offset-2 hover:underline lg:text-[14px] dark:text-[#A9BED6]"
                    >
                        <IconPhone size={14} stroke={2} />
                        {link.texto}
                    </a>
                ) : null}
            </div>
        </div>
    );
}

function statusVisualAvaliacao(status?: AvaliacaoStatusResumo | null) {
    switch (status?.status) {
        case "concluida":
            return { classes: "border border-[#7BA11A] bg-[#EEF5D6] text-[#3F5A0A] hover:bg-[#E3EEC4] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]", texto: status.avaliador_nome ? `Concluída por ${status.avaliador_nome}` : "Concluída" };
        case "em_andamento":
            return { classes: "border border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] hover:bg-[#DCE5F0] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-[#A9BED6]", texto: status.avaliador_nome ? `Em andamento por ${status.avaliador_nome}` : "Em andamento" };
        case "pendente":
            return { classes: "border border-[#E4BC30] bg-[#FCF3CC] text-[#6B5200] hover:bg-[#F8EAB0] dark:border-[#F2CB3F]/40 dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]", texto: "Pendente" };
        case "nao_aplicavel":
            return { classes: "border border-[#E3E8EF] bg-[#F6F8FB] text-[#8893AA] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#8893AA]", texto: "Não aplicável" };
        default:
            return { classes: "border border-[#D5DCE6] bg-[#FFFFFF] text-[#313C55] hover:bg-[#F1F4F8] dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8]", texto: "Abrir" };
    }
}

/* ============================== Fotos e resumo (como antes) ============================== */

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id || anyItem?.id || "").trim();
}

function safeJsonParse(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;

    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

function isFotoAcaoUrl(v: any): boolean {
    const s = String(v ?? "").trim();
    return s.includes("/uploads/acoes_fotos/") || s.includes("uploads/acoes_fotos/");
}

function extrairFotoAcaoUrl(v: any): string {
    const s = String(v ?? "").trim();
    if (!s) return "";

    const match =
        s.match(/https?:\/\/[^\s\"'<>]*\/uploads\/acoes_fotos\/[^\s\"'<>]+/i) ||
        s.match(/\/uploads\/acoes_fotos\/[^\s\"'<>]+/i) ||
        s.match(/uploads\/acoes_fotos\/[^\s\"'<>]+/i);

    return match?.[0] || "";
}

function normalizarFotoAcaoUrl(v: any): string {
    let url = extrairFotoAcaoUrl(v);
    if (!url) return "";

    url = url.trim();

    if (/^https?:\/\//i.test(url)) {
        return url
            .replace(
                "https://pai.planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br",
            )
            .replace(
                "https://planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br",
            );
    }

    if (url.startsWith("/uploads/")) {
        return `https://api.planoassistencialintegrado.com.br${url}`;
    }

    if (url.startsWith("uploads/")) {
        return `https://api.planoassistencialintegrado.com.br/${url}`;
    }

    return url;
}

function nomeFotoAcaoPorTexto(v: any): string {
    const s = String(v ?? "").toLowerCase();

    if (s.includes("fim_ornamentacao") || s.includes("ornamentacao")) {
        return "Foto da Ornamentação";
    }

    if (s.includes("entrega_corpo") || s.includes("paramentacao")) {
        return "Foto da Paramentação";
    }

    return "Foto da ação";
}

function extrairFotosDosLogs(logs: LogItem[]): FotoHistorico[] {
    const out: FotoHistorico[] = [];
    const seen = new Set<string>();

    function pushFoto(raw: any) {
        if (!isFotoAcaoUrl(raw)) return;

        const url = normalizarFotoAcaoUrl(raw);
        if (!url || seen.has(url)) return;

        seen.add(url);
        out.push({ url, titulo: nomeFotoAcaoPorTexto(raw) });
    }

    function walk(value: any) {
        if (value == null) return;
        if (typeof value === "string") {
            pushFoto(value);
            const parsed = safeJsonParse(value);
            if (parsed && parsed !== value) walk(parsed);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (typeof value === "object") Object.values(value).forEach(walk);
    }

    for (const log of logs || []) walk((log as any)?.detalhes);

    const ordem = (f: FotoHistorico) => {
        const t = f.titulo.toLowerCase();
        if (t.includes("falecido")) return 0;
        if (t.includes("ornamentação") || t.includes("ornamentacao")) return 1;
        if (t.includes("paramentação") || t.includes("paramentacao")) return 2;
        return 3;
    };

    return out.sort((a, b) => ordem(a) - ordem(b));
}

function isFotoFalecidoUrl(v: any): boolean {
    const s = String(v ?? "").trim();
    return s.includes("/uploads/falecidos/") || s.includes("uploads/falecidos/");
}

function normalizarFotoFalecidoUrl(v: any): string {
    let url = String(v ?? "").trim();
    if (!url) return "";

    url = url.replace(/\\/g, "/");

    if (/^https?:\/\//i.test(url)) {
        return url
            .replace(
                "https://pai.planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br",
            )
            .replace(
                "https://planoassistencialintegrado.com.br",
                "https://api.planoassistencialintegrado.com.br",
            );
    }

    if (url.startsWith("/uploads/")) {
        return `https://api.planoassistencialintegrado.com.br${url}`;
    }

    if (url.startsWith("uploads/")) {
        return `https://api.planoassistencialintegrado.com.br/${url}`;
    }

    return url;
}

function temValorRelatorio(value: any): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
}

function montarResumoDadosAtendimento(
    registro: FalecidoItem | RegistroAnalise | null,
): Record<string, any> {
    if (!registro) return {};

    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(registro as any)) {
        if (!temValorRelatorio(value)) continue;

        // Mantém também objetos e arrays estruturados. O FormatadorRelatorio
        // decide como transformá-los em conteúdo humano.
        out[key] = value;
    }

    if ((registro as any).falecido) {
        out.falecido = String((registro as any).falecido);
    }

    return out;
}

function mesclarResumoAtendimento(
    ...fontes: Array<Record<string, any> | null | undefined>
): Record<string, any> {
    const out: Record<string, any> = {};

    for (const fonte of fontes) {
        if (!fonte) continue;

        for (const [key, value] of Object.entries(fonte)) {
            if (!temValorRelatorio(value)) continue;
            out[key] = value;
        }
    }

    return out;
}

function primeiroLogData(logs: LogItem[]) {
    return [...logs]
        .filter((l) => l.datahora)
        .sort((a, b) => String(a.datahora).localeCompare(String(b.datahora)))[0]?.datahora || "";
}

function IconeVisita() {
    return (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2.2" />
        </svg>
    );
}

function IconePos() {
    return (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6M9 9h6M9 13h6M9 17h4" />
            <path d="m15.5 16.5 1.3 1.3 2.7-3" />
        </svg>
    );
}

export default function ModalDetalheRegistro({
    aberto,
    registro,
    onFechar,
    statusAvaliacoes,
    podeVerVisita = false,
    podeVerPosAtendimento = false,
    loadingAvaliacoes = false,
    onAbrirVisita,
    onAbrirPosAtendimento,
}: Props) {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [registroCompleto, setRegistroCompleto] =
        useState<RegistroAnalise | null>(null);
    const [loading, setLoading] = useState(false);
    const [materiaisMap, setMateriaisMap] = useState<MateriaisMap>({});
    const [fotosOpen, setFotosOpen] = useState(false);
    /* 09/11/2026: Termo do Velório On-line (ver, baixar e compartilhar o PDF assinado). */
    const [termoVelorioOpen, setTermoVelorioOpen] = useState(false);
    const [aba, setAba] = useState<AbaDetalhe>("resumo");
    const [soEtapas, setSoEtapas] = useState(false);
    const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
    const [viewport, setViewport] =
        useState<VisualViewportState | null>(null);

    useEffect(() => {
        if (!aberto || !registro) return;

        const id = getRegistroId(registro);
        if (!id) {
            setLogs([]);
            setRegistroCompleto(null);
            return;
        }

        let cancel = false;

        (async () => {
            setLoading(true);
            setLogs([]);
            setRegistroCompleto(null);

            try {
                // O histórico explica o que aconteceu; o informativo.php fornece
                // a fotografia atual e completa do atendimento.
                const [listaLogs, atual] = await Promise.all([
                    listarLogPorId(id),
                    obterRegistroAnaliticoPorId(id),
                ]);

                if (cancel) return;

                setLogs(Array.isArray(listaLogs) ? listaLogs : []);
                setRegistroCompleto(atual);
            } finally {
                if (!cancel) setLoading(false);
            }
        })();

        return () => {
            cancel = true;
        };
    }, [aberto, registro]);

    useEffect(() => {
        if (!aberto) return;

        let cancel = false;
        (async () => {
            const map = await obterMateriaisMap();
            if (!cancel) setMateriaisMap(map || {});
        })();

        return () => {
            cancel = true;
        };
    }, [aberto]);

    // Ao abrir: no celular começa pela Linha do tempo; no computador, pelo Resumo.
    useEffect(() => {
        if (!aberto) {
            setFotosOpen(false);
            return;
        }
        const celular = typeof window !== "undefined" && window.innerWidth < 1024;
        setAba(celular ? "linha" : "resumo");
        setSoEtapas(false);
        setAbertos(new Set());
    }, [aberto, registro]);

    // Esc fecha as fotos ou a janela (não age se a Visita/Pós-atendimento estiver aberta por cima).
    useEffect(() => {
        if (!aberto) return;
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (document.querySelector(".fixed.z-\\[80\\], .fixed.z-\\[100\\]")) return;
            if (termoVelorioOpen) return; // a janela do termo fecha sozinha com o Esc
            if (fotosOpen) setFotosOpen(false);
            else onFechar();
        };
        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    }, [aberto, fotosOpen, onFechar, termoVelorioOpen]);

    useEffect(() => {
        if (!aberto || typeof window === "undefined") return;

        const html = document.documentElement;
        const body = document.body;

        const oldHtmlOverflow = html.style.overflow;
        const oldBodyOverflow = body.style.overflow;
        const oldBodyOverscroll = body.style.overscrollBehavior;
        const oldBodyTouchAction = body.style.touchAction;

        const updateViewport = () => {
            const vv = window.visualViewport;

            setViewport({
                width: Math.max(1, Math.round(vv?.width ?? window.innerWidth)),
                height: Math.max(1, Math.round(vv?.height ?? window.innerHeight)),
                offsetTop: Math.max(0, Math.round(vv?.offsetTop ?? 0)),
                offsetLeft: Math.max(0, Math.round(vv?.offsetLeft ?? 0)),
            });
        };

        updateViewport();

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
        body.style.touchAction = "none";

        const vv = window.visualViewport;

        vv?.addEventListener("resize", updateViewport);
        vv?.addEventListener("scroll", updateViewport);
        window.addEventListener("resize", updateViewport);
        window.addEventListener("orientationchange", updateViewport);

        return () => {
            vv?.removeEventListener("resize", updateViewport);
            vv?.removeEventListener("scroll", updateViewport);
            window.removeEventListener("resize", updateViewport);
            window.removeEventListener("orientationchange", updateViewport);

            html.style.overflow = oldHtmlOverflow;
            body.style.overflow = oldBodyOverflow;
            body.style.overscrollBehavior = oldBodyOverscroll;
            body.style.touchAction = oldBodyTouchAction;

            setViewport(null);
        };
    }, [aberto]);

    /* ---------- dados (os mesmos que o PDF usa) ---------- */

    const dadosListaResumo = useMemo(
        () => montarResumoDadosAtendimento(registro),
        [registro],
    );

    const dadosBancoResumo = useMemo(
        () => montarResumoDadosAtendimento(registroCompleto),
        [registroCompleto],
    );

    const dadosLogsResumo = useMemo(
        () => montarResumoFinalDoLog(logs, materiaisMap),
        [logs, materiaisMap],
    );

    const resumoAtual = useMemo(
        () => mesclarResumoAtendimento(dadosListaResumo, dadosLogsResumo, dadosBancoResumo),
        [dadosListaResumo, dadosLogsResumo, dadosBancoResumo],
    );

    const nomeFalecidoAtual = String(
        (registroCompleto as any)?.falecido ?? registro?.falecido ?? "",
    ).trim();

    const registroId = registro ? getRegistroId(registro) : "";

    const dados = useMemo(
        () =>
            montarDadosRelatorio({
                resumo: resumoAtual,
                logs,
                materiaisMap,
                nome: nomeFalecidoAtual,
                id: registroId,
            }),
        [resumoAtual, logs, materiaisMap, nomeFalecidoAtual, registroId],
    );

    const criacaoSelecionado = useMemo(
        () =>
            primeiroLogData(logs) ||
            String((registroCompleto as any)?.created_at ?? (registro as any)?.criacao ?? ""),
        [logs, registroCompleto, registro],
    );

    const logsOrdenados = useMemo(() => logsSemVazios(logs), [logs]);

    /** Status atual: o último do histórico; sem histórico, o do cadastro. */
    const statusAtual = useMemo(() => {
        let s = "";
        for (const l of logsOrdenados) if (txt(l.status_novo)) s = txt(l.status_novo);
        return s || txt((registroCompleto as any)?.status);
    }, [logsOrdenados, registroCompleto]);

    const cancelado = /cancel/i.test(statusAtual);

    const trilha = useMemo(() => {
        const atual = indiceTrilha(statusAtual);
        return TRILHA.map((t, i) => {
            const feito = dados.finalizado || i < atual || (i === atual && i === 0 && logsOrdenados.length > 0);
            const agora = !dados.finalizado && i === atual && !feito;
            return { ...t, feito, agora };
        });
    }, [statusAtual, dados.finalizado, logsOrdenados.length]);

    /** Quem fez cada etapa: usuários dos registros de etapa, agrupados como na trilha. */
    const equipe = useMemo(() => {
        const grupos = new Map<number, string[]>();
        for (const l of logsOrdenados) {
            if (!ehLogDeEtapa(l)) continue;
            const acao = String(l.acao || "").toLowerCase();
            const idx = acao.includes("criou") ? 0 : indiceTrilha(l.status_novo);
            if (!acao.includes("criou") && idx === 0) continue;
            const quem = txt(l.usuario);
            if (!quem) continue;
            const lista = grupos.get(idx) || [];
            if (!lista.includes(quem)) lista.push(quem);
            grupos.set(idx, lista);
        }
        const linhas: Array<{ etapa: string; pessoa: string; icone: Icone }> = [];
        for (const idx of Array.from(grupos.keys()).sort((a, b) => a - b)) {
            const pessoa = juntarComE(grupos.get(idx) || []);
            const etapa = TRILHA[idx].equipe;
            const ant = linhas[linhas.length - 1];
            if (ant && ant.pessoa === pessoa) {
                ant.etapa = `${ant.etapa} e ${etapa.charAt(0).toLowerCase()}${etapa.slice(1)}`;
                continue;
            }
            linhas.push({ etapa, pessoa, icone: TRILHA[idx].icone });
        }
        return linhas;
    }, [logsOrdenados]);

    const duracaoTotal = useMemo(() => {
        const seg = dados.tempos.reduce((s, t) => s + (t.segundos ?? 0), 0);
        return seg > 0 ? fmtDuracao(seg) : "";
    }, [dados.tempos]);

    const maiorTempo = useMemo(
        () => Math.max(1, ...dados.tempos.map((t) => t.segundos ?? 0)),
        [dados.tempos],
    );

    const recolhimento = useMemo(() => {
        const l = [...logsOrdenados].reverse().find((x) => numeroFase(x.status_novo) === 11);
        const dh = partesDataHora(l?.datahora);
        if (!l || !dh) return "";
        return `${curtaData(dh.dia)} ${dh.hora}${txt(l.usuario) ? ` por ${txt(l.usuario)}` : ""}`;
    }, [logsOrdenados]);

    /* ---------- cartões do resumo ---------- */

    const r = resumoAtual;
    const par = (lista: Array<[string, string]>, rotulo: string) =>
        lista.find(([k]) => k === rotulo)?.[1] || "";

    const cartaoFalecimento = useMemo(() => {
        const idade = dados.vida.match(/(\d+) anos/)?.[1];
        const nasc = par(dados.falecido, "Nascimento");
        return {
            principal: par(dados.falecido, "Falecimento"),
            detalhe: [idade ? `${idade} anos` : "", nasc ? `nasc. ${nasc}` : ""].filter(Boolean).join(" · "),
        };
    }, [dados]);

    const cartaoVelorio = useMemo(() => {
        if (simNao(r.realiza_velorio) === "nao") return { principal: "Não realiza", detalhe: "" };
        const quando = [dataCurta(r.data_inicio_velorio), horaCurta(r.hora_inicio_velorio)].filter(Boolean).join(" · ");
        const local = par(dados.velorio, "Local do velório");
        const sala = par(dados.velorio, "Sala");
        return { principal: quando, detalhe: [local, sala].filter(Boolean).join(" · ") };
    }, [r, dados]);

    const cartaoSepultamento = useMemo(() => {
        if (simNao(r.realiza_sepultamento) === "nao") return { principal: "Não realiza", detalhe: "" };
        const quando = [curtaData(dados.dataSepultamento), dados.horaSepultamento].filter(Boolean).join(" · ");
        return { principal: quando, detalhe: dados.cemiterio };
    }, [r, dados]);

    const contatoResponsavel = par(dados.responsavel, "Contatos");

    /* ---------- serviços ---------- */

    const conservacao = par(dados.servicos, "Conservação");

    const servicos = useMemo(() => {
        const out: Array<{ rotulo: string; valor: string; nao: boolean }> = [];
        for (const [rotulo, valor] of dados.servicos) {
            if (rotulo === "Conservação") continue;
            let v = valor;
            if (rotulo === "Assistência" && simNao(valor) === "sim" && dados.materiaisKit) v = `Sim · ${dados.materiaisKit}`;
            out.push({ rotulo, valor: v, nao: simNao(valor) === "nao" });
        }
        const coroas = dados.itens.filter((i) => i.grupo === "Coroas de flores");
        if (coroas.length) {
            out.push({
                rotulo: coroas.length > 1 ? "Coroas de flores" : "Coroa de flores",
                valor: coroas.length > 1 ? `${coroas.length} coroas` : coroas[0].nome,
                nao: false,
            });
        } else if (simNao(r.coroa_flores) === "nao") {
            out.push({ rotulo: "Coroa de flores", valor: "Não", nao: true });
        }
        if (simNao(r.kit_lanche) === "nao") out.push({ rotulo: "Kit lanche", valor: "Não", nao: true });
        const religiao = par(dados.falecido, "Religião");
        if (religiao) out.push({ rotulo: "Religião", valor: religiao, nao: false });
        return out;
    }, [dados, r]);

    /* ---------- itens ---------- */

    const gruposItens = useMemo(() => {
        const mapa = new Map<string, ItemEstoqueRelatorio[]>();
        for (const it of dados.itens) {
            const lista = mapa.get(it.grupo) || [];
            lista.push(it);
            mapa.set(it.grupo, lista);
        }
        return Array.from(mapa.entries());
    }, [dados.itens]);

    const qtdItens = dados.itens.length + dados.materiais.length;

    /* ---------- linha do tempo ---------- */

    const diasLinha = useMemo(() => {
        const out: Array<{ dia: string; eventos: EventoLinhaTempo[] }> = [];
        for (const ev of dados.linhaTempo) {
            if (soEtapas && !ev.etapa) continue;
            const ult = out[out.length - 1];
            if (ult && ult.dia === ev.dia) ult.eventos.push(ev);
            else out.push({ dia: ev.dia, eventos: [ev] });
        }
        return out;
    }, [dados.linhaTempo, soEtapas]);

    const alternarEvento = (chave: string) =>
        setAbertos((atual) => {
            const novo = new Set(atual);
            if (novo.has(chave)) novo.delete(chave);
            else novo.add(chave);
            return novo;
        });

    const qtdTudo = dados.linhaTempo.length;
    const qtdEtapas = dados.linhaTempo.filter((e) => e.etapa).length;

    /* ---------- fotos ---------- */

    const fotos = useMemo(() => {
        const lista = extrairFotosDosLogs(logs);
        const fotoFalecido = normalizarFotoFalecidoUrl(
            (registroCompleto as any)?.foto_falecido ?? (registro as any)?.foto_falecido,
        );

        if (fotoFalecido && isFotoFalecidoUrl(fotoFalecido)) {
            const jaExiste = lista.some((f) => f.url === fotoFalecido);
            if (!jaExiste) {
                lista.unshift({ url: fotoFalecido, titulo: "Foto do Falecido(a)" });
            }
        }

        return lista;
    }, [logs, registro, registroCompleto]);

    if (!aberto || !registro) return null;

    const computador = (viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1280)) >= 1024;
    const alturaTela = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 800);
    const alturaJanela = computador
        ? Math.max(320, Math.min(alturaTela - 48, 940))
        : Math.max(320, Math.round(alturaTela * 0.92));

    const aberturaChip = par(dados.chips, "Aberto");
    const convenio = par(dados.chips, "Convênio");
    const pdfDesabilitado = loading || logs.length === 0;

    const statusChip = cancelado
        ? { classe: CHIP_CINZA, texto: "Cancelado", icone: IconBan }
        : dados.finalizado
            ? { classe: CHIP_VERDE, texto: `Finalizado · ${dados.etapaAtual}`, icone: IconCheck }
            : { classe: CHIP_AMARELO, texto: `Em andamento · ${dados.etapaAtual}`, icone: IconClock };

    const abas: Array<{ id: AbaDetalhe; rotulo: string; curto: string; qtd: string; icone: Icone }> = [
        { id: "resumo", rotulo: "Resumo", curto: "Resumo", qtd: "", icone: IconLayoutGrid },
        { id: "itens", rotulo: "Itens", curto: "Itens", qtd: qtdItens ? String(qtdItens) : "", icone: IconPackage },
        { id: "linha", rotulo: "Linha do tempo", curto: "Linha", qtd: qtdTudo ? String(qtdTudo) : "", icone: IconList },
    ];

    const visitaVisual = statusVisualAvaliacao(statusAvaliacoes?.visita);
    const posVisual = statusVisualAvaliacao(statusAvaliacoes?.pos_atendimento);

    return (
        <>
            <div
                className="fixed z-50 flex items-end justify-center overflow-hidden bg-black/50 lg:items-center lg:p-6"
                style={{
                    top: viewport?.offsetTop ?? 0,
                    left: viewport?.offsetLeft ?? 0,
                    width: viewport ? `${viewport.width}px` : "100vw",
                    height: viewport ? `${viewport.height}px` : "100dvh",
                }}
                role="dialog"
                aria-modal="true"
                aria-label={`Atendimento de ${nomeFalecidoAtual}`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onFechar();
                }}
            >
                <div
                    className="flex w-full max-w-[1120px] flex-col overflow-hidden rounded-t-3xl bg-[#F6F8FB] text-[#313C55] shadow-2xl lg:rounded-3xl dark:bg-[#1C2334] dark:text-white"
                    style={{ height: `${alturaJanela}px` }}
                >
                    {/* ================= Cabeçalho ================= */}
                    <div className="shrink-0 rounded-b-[20px] bg-[#FFFFFF] px-4 pt-4 shadow-[0_4px_16px_rgba(49,60,85,0.08)] lg:rounded-none lg:px-7 lg:pt-6 lg:shadow-none dark:bg-[#232B3F]">
                        <div className="flex flex-col gap-3 lg:gap-[18px]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-start gap-3 lg:gap-4">
                                    <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#313C55] text-[#F2CB3F] lg:flex dark:bg-[#3D6A99]">
                                        <IconUser size={28} stroke={2} />
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {registroId ? (
                                                <span className={ROTULO}>
                                                    <span className="hidden sm:inline">Atendimento </span>#{registroId}
                                                </span>
                                            ) : null}
                                            {!loading && logs.length > 0 ? (
                                                <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold lg:inline-flex ${statusChip.classe}`}>
                                                    <statusChip.icone size={14} stroke={2.5} />
                                                    {statusChip.texto}
                                                </span>
                                            ) : null}
                                        </div>
                                        <h1 className="m-0 hidden break-words text-[28px] font-extrabold leading-tight lg:block">
                                            {nomeFalecidoAtual}
                                        </h1>
                                        <div className="hidden flex-wrap gap-2 lg:flex">
                                            {convenio ? (
                                                <span className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[13.5px] font-bold ${CHIP_AZUL}`}>
                                                    <IconBuildingBank size={15} stroke={2} />
                                                    {convenio}
                                                </span>
                                            ) : null}
                                            {aberturaChip ? (
                                                <span className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[13.5px] font-semibold ${CHIP_CINZA}`}>
                                                    <IconPlus size={15} stroke={2} />
                                                    Aberto em {aberturaChip}
                                                </span>
                                            ) : null}
                                            {duracaoTotal ? (
                                                <span className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[13.5px] font-semibold ${CHIP_CINZA}`}>
                                                    <IconClock size={15} stroke={2} />
                                                    {dados.finalizado ? `Duração total ${duracaoTotal}` : `${duracaoTotal} até a etapa atual`}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
                                    <div
                                        className={`relative h-11 w-11 shrink-0 lg:w-[86px] ${pdfDesabilitado ? "opacity-40" : ""}`}
                                        title="Baixar PDF"
                                    >
                                        <span className="pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center gap-2 rounded-xl border border-[#D5DCE6] bg-[#FFFFFF] text-[14px] font-extrabold text-[#313C55] dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8]">
                                            <IconDownload size={20} stroke={2} />
                                            <span className="hidden lg:inline">PDF</span>
                                        </span>
                                        <div className="absolute inset-0 [&_button]:!h-11 [&_button]:!w-full [&_button]:!overflow-hidden [&_button]:!rounded-xl [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!px-0 [&_button]:!text-transparent [&_button]:hover:!bg-transparent">
                                            <BotaoExportarPdf
                                                desabilitado={pdfDesabilitado}
                                                selecionadoNome={nomeFalecidoAtual}
                                                criacaoSelecionado={criacaoSelecionado}
                                                logVisiveis={logs}
                                                resumoFinal={resumoAtual}
                                                materiaisMap={materiaisMap}
                                                sepultamentoId={registroId}
                                                registroAtual={(registroCompleto || registro) as any}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={`${BTN_ICONE} border border-[#D5DCE6] bg-[#FFFFFF] text-[#313C55] hover:bg-[#F1F4F8] dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8] dark:hover:bg-[#1C2334]`}
                                        title={fotos.length > 0 ? "Ver fotos anexadas" : "Nenhuma foto anexada"}
                                        aria-label="Ver fotos anexadas"
                                        disabled={loading || fotos.length === 0}
                                        onClick={() => setFotosOpen(true)}
                                    >
                                        <IconPhoto size={20} stroke={2} />
                                    </button>

                                    {(() => {
                                        const reg: any = registroCompleto || registro;
                                        const termo = situacaoTermoVelorio(reg);
                                        const temVelorioOnline = /^(sim|s|1|true)$/i.test(String(reg?.velorio_online ?? "").trim());
                                        if (!termo.assinado && !temVelorioOnline) return null;
                                        return (
                                            <button
                                                type="button"
                                                className={`${BTN_ICONE} border ${termo.assinado
                                                    ? "border-[#7BA11A]/50 bg-[#EEF5D6] text-[#313C55] hover:brightness-95 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/20 dark:text-white"
                                                    : "border-[#D5DCE6] bg-[#FFFFFF] text-[#313C55] dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8]"
                                                    }`}
                                                title={termo.assinado ? `Termo do Velório On-line assinado por ${termo.nome}` : "Termo do Velório On-line não assinado"}
                                                aria-label="Termo do Velório On-line"
                                                disabled={loading || !termo.assinado}
                                                onClick={() => setTermoVelorioOpen(true)}
                                            >
                                                <IconFileText size={20} stroke={2} />
                                            </button>
                                        );
                                    })()}

                                    {podeVerVisita ? (
                                        <button
                                            type="button"
                                            className={`${BTN_ICONE} ${visitaVisual.classes}`}
                                            onClick={() => onAbrirVisita?.(registro)}
                                            disabled={loadingAvaliacoes || statusAvaliacoes?.visita?.status === "nao_aplicavel"}
                                            title={`Visita: ${visitaVisual.texto}`}
                                            aria-label={`Visualizar visita. ${visitaVisual.texto}`}
                                        >
                                            <IconeVisita />
                                        </button>
                                    ) : null}

                                    {podeVerPosAtendimento ? (
                                        <button
                                            type="button"
                                            className={`${BTN_ICONE} ${posVisual.classes}`}
                                            onClick={() => onAbrirPosAtendimento?.(registro)}
                                            disabled={loadingAvaliacoes || statusAvaliacoes?.pos_atendimento?.status === "nao_aplicavel"}
                                            title={`Pós-Atendimento: ${posVisual.texto}`}
                                            aria-label={`Visualizar pós-atendimento. ${posVisual.texto}`}
                                        >
                                            <IconePos />
                                        </button>
                                    ) : null}

                                    <button
                                        type="button"
                                        className={`${BTN_ICONE} bg-[#F1F4F8] text-[#313C55] hover:bg-[#E3E8EF] dark:bg-[#1C2334] dark:text-[#D6DCE8] dark:hover:bg-[#151B29]`}
                                        onClick={onFechar}
                                        title="Fechar"
                                        aria-label="Fechar"
                                    >
                                        <IconX size={20} stroke={2.2} />
                                    </button>
                                </div>
                            </div>

                            {/* Nome e etiquetas no celular */}
                            <div className="flex flex-col gap-3 lg:hidden">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#313C55] text-[#F2CB3F] dark:bg-[#3D6A99]">
                                        <IconUser size={24} stroke={2} />
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <h1 className="m-0 break-words text-[21px] font-extrabold leading-tight">
                                            {nomeFalecidoAtual}
                                        </h1>
                                        {convenio ? (
                                            <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold ${TEXTO_MEDIO}`}>
                                                <IconBuildingBank size={14} stroke={2} />
                                                {convenio}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                {!loading && logs.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${statusChip.classe}`}>
                                            <statusChip.icone size={13} stroke={2.5} />
                                            {statusChip.texto}
                                        </span>
                                        {duracaoTotal ? (
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${CHIP_CINZA}`}>
                                                <IconClock size={13} stroke={2} />
                                                {duracaoTotal}
                                            </span>
                                        ) : null}
                                        {aberturaChip ? (
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${CHIP_CINZA}`}>
                                                <IconPlus size={13} stroke={2} />
                                                {aberturaChip.replace(/^(\d{2}\/\d{2})\/\d{4}/, "$1").replace(" por ", " · ")}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            {/* Trilha das etapas (computador) */}
                            {!loading && logs.length > 0 ? (
                                <div className="hidden overflow-x-auto lg:block">
                                    <div className="flex min-w-[760px] gap-1.5">
                                        {trilha.map((t) => (
                                            <div key={t.nome} className="flex flex-1 flex-col gap-1.5">
                                                <div
                                                    className={`h-1.5 rounded-full ${t.feito
                                                        ? "bg-[#7BA11A] dark:bg-[#B3CE52]"
                                                        : t.agora
                                                            ? "bg-[#F2CB3F]"
                                                            : "bg-[#E3E8EF] dark:bg-white/10"
                                                        }`}
                                                />
                                                <span
                                                    className={`inline-flex items-center gap-1.5 text-[12px] font-bold leading-tight ${t.feito || t.agora ? TEXTO_MEDIO : "text-[#8893AA]"}`}
                                                >
                                                    <t.icone size={14} stroke={2.2} className={t.feito ? "text-[#5E7E12] dark:text-[#B3CE52]" : ""} />
                                                    {t.nome}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {/* Abas: sublinhadas no computador, segmentadas no celular */}
                            <div
                                role="tablist"
                                aria-label="Seções do atendimento"
                                className="mb-3 grid grid-cols-3 gap-1 rounded-[14px] bg-[#F1F4F8] p-1 lg:mb-0 lg:flex lg:gap-1 lg:rounded-none lg:border-b lg:border-[#E3E8EF] lg:bg-transparent lg:p-0 dark:bg-[#1C2334] lg:dark:border-white/12 lg:dark:bg-transparent"
                            >
                                {abas.map((a) => {
                                    const ativa = aba === a.id;
                                    return (
                                        <button
                                            key={a.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={ativa}
                                            onClick={() => setAba(a.id)}
                                            className={[
                                                "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[11px] px-2 text-[14px] transition lg:h-12 lg:justify-start lg:gap-2 lg:rounded-none lg:border-b-[3px] lg:px-4 lg:text-[15px]",
                                                ativa
                                                    ? "bg-[#FFFFFF] font-extrabold text-[#313C55] shadow-sm lg:border-[#F2CB3F] lg:bg-transparent lg:shadow-none dark:bg-[#232B3F] dark:text-white lg:dark:bg-transparent"
                                                    : "font-bold text-[#5B6478] lg:border-transparent dark:text-[#AEB9CF]",
                                            ].join(" ")}
                                        >
                                            <a.icone size={18} stroke={2} />
                                            <span className="lg:hidden">{a.curto}</span>
                                            <span className="hidden lg:inline">{a.rotulo}</span>
                                            {a.qtd ? (
                                                <span
                                                    className={`hidden rounded-full px-2 py-0.5 text-[12px] font-extrabold lg:inline ${ativa
                                                        ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                                        : "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-[#D6DCE8]"
                                                        }`}
                                                >
                                                    {a.qtd}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ================= Conteúdo ================= */}
                    <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-6 pt-3.5 lg:px-7 lg:pb-7 lg:pt-6 [contain:inline-size]"
                        style={{
                            WebkitOverflowScrolling: "touch",
                            overscrollBehaviorY: "contain",
                            touchAction: "pan-y",
                        }}
                    >
                        {loading ? (
                            <div className={`${CARTAO} p-6 text-center text-[14px] ${TEXTO_MEDIO}`}>
                                Carregando o atendimento…
                            </div>
                        ) : aba === "resumo" ? (
                            <div className="flex flex-col gap-3 lg:gap-5">
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
                                    <CartaoInfo icone={IconCalendar} rotulo="Falecimento" principal={cartaoFalecimento.principal} detalhe={cartaoFalecimento.detalhe} />
                                    <CartaoInfo icone={IconHome} rotulo="Velório" principal={cartaoVelorio.principal} detalhe={cartaoVelorio.detalhe} />
                                    <CartaoInfo icone={IconCross} rotulo="Sepultamento" principal={cartaoSepultamento.principal} detalhe={cartaoSepultamento.detalhe} />
                                    <CartaoInfo
                                        icone={IconUser}
                                        rotulo="Responsável"
                                        principal={dados.responsavelNome || "Não informado"}
                                        detalhe={telefoneLink(contatoResponsavel) ? "" : contatoResponsavel}
                                        link={telefoneLink(contatoResponsavel) ? { href: telefoneLink(contatoResponsavel), texto: contatoResponsavel } : undefined}
                                    />
                                </div>

                                <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-4">
                                    <div className="flex flex-col gap-3 lg:gap-4">
                                        <section className={`${CARTAO} flex flex-col gap-3.5 p-4 lg:px-5`}>
                                            <Titulo icone={IconClipboardCheck}>Serviços</Titulo>
                                            {servicos.length ? (
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    {servicos.map((s) => {
                                                        const Ic = iconeDoServico(s.rotulo);
                                                        return (
                                                            <div key={s.rotulo} className="flex min-w-0 items-center gap-2.5">
                                                                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#F1F4F8] text-[#3D6A99] dark:bg-[#1C2334] dark:text-[#A9BED6]">
                                                                    <Ic size={17} stroke={2} />
                                                                </span>
                                                                <div className="flex min-w-0 flex-col">
                                                                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{s.rotulo}</span>
                                                                    <span className={`break-words text-[15px] leading-snug ${s.nao ? "font-bold text-[#6B7488] dark:text-[#8893AA]" : `font-extrabold ${TEXTO_FORTE}`}`}>
                                                                        {s.valor}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className={`m-0 text-[14px] ${TEXTO_MEDIO}`}>Nenhum serviço registrado.</p>
                                            )}
                                            {conservacao ? (
                                                <div className={`rounded-xl bg-[#F1F4F8] px-3 py-2.5 text-[13.5px] leading-relaxed dark:bg-[#1C2334] ${TEXTO_MEDIO}`}>
                                                    <b className={TEXTO_FORTE}>Conservação:</b> {conservacao}
                                                </div>
                                            ) : null}
                                        </section>

                                        <section className={`${CARTAO} flex flex-col gap-2.5 p-4 lg:px-5`}>
                                            <Titulo icone={IconUsers}>Quem fez cada etapa</Titulo>
                                            {equipe.length ? (
                                                <div className="flex flex-col">
                                                    {equipe.map((q) => (
                                                        <div
                                                            key={q.etapa}
                                                            className="flex items-center justify-between gap-3 border-b border-[#EEF1F5] py-2 text-[14px] last:border-b-0 lg:text-[14.5px] dark:border-white/10"
                                                        >
                                                            <span className={`inline-flex min-w-0 items-center gap-2.5 ${TEXTO_MEDIO}`}>
                                                                <q.icone size={17} stroke={2} className="shrink-0 text-[#3D6A99] dark:text-[#A9BED6]" />
                                                                {q.etapa}
                                                            </span>
                                                            <span className={`text-right font-extrabold ${TEXTO_FORTE}`}>{q.pessoa}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className={`m-0 text-[14px] ${TEXTO_MEDIO}`}>Nenhuma etapa registrada no histórico.</p>
                                            )}
                                        </section>

                                        {dados.observacoes.length ? (
                                            <section className={`${CARTAO} flex flex-col gap-2.5 p-4 lg:px-5`}>
                                                <Titulo icone={IconNotes}>Observações</Titulo>
                                                {dados.observacoes.map(([rotulo, valor]) => (
                                                    <div key={rotulo} className="flex flex-col gap-0.5">
                                                        <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</span>
                                                        <span className={`whitespace-pre-line break-words text-[14.5px] ${TEXTO_FORTE}`}>{valor}</span>
                                                    </div>
                                                ))}
                                            </section>
                                        ) : null}
                                    </div>

                                    <section className={`${CARTAO} flex flex-col gap-3.5 p-4 lg:px-5`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Titulo icone={IconClock}>Tempo por etapa</Titulo>
                                            {dados.temposResumo ? (
                                                <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{dados.temposResumo}</span>
                                            ) : null}
                                        </div>
                                        {dados.tempos.length ? (
                                            <>
                                                <div className="flex flex-col gap-3">
                                                    {dados.tempos.map((t, i) => {
                                                        const Ic = iconeDaEtapa(t.etapa);
                                                        const rapido = t.segundos != null && t.segundos < 60;
                                                        const largura = t.segundos == null ? 100 : Math.max(2, Math.round((t.segundos / maiorTempo) * 100));
                                                        return (
                                                            <div
                                                                key={`${t.etapa}-${i}`}
                                                                className="flex flex-col gap-1 sm:grid sm:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_88px] sm:items-center sm:gap-3"
                                                            >
                                                                <div className="flex items-center justify-between gap-2 sm:contents">
                                                                    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] sm:text-[14px]">
                                                                        <Ic size={16} stroke={2} className="shrink-0 text-[#3D6A99] dark:text-[#A9BED6]" />
                                                                        {t.etapa}
                                                                    </span>
                                                                    <span className="text-right text-[13px] font-extrabold sm:order-3 sm:text-[14px]">
                                                                        {t.segundos == null ? `desde ${t.desde || ""}` : fmtDuracao(t.segundos)}
                                                                    </span>
                                                                </div>
                                                                <div className="h-2 overflow-hidden rounded-full bg-[#EEF1F5] sm:order-2 sm:h-2.5 dark:bg-white/10">
                                                                    <div
                                                                        className={`h-full rounded-full ${t.segundos == null
                                                                            ? "bg-[#A9BED6] dark:bg-[#3D6A99]/60"
                                                                            : rapido
                                                                                ? "bg-[#F2CB3F]"
                                                                                : "bg-[#3D6A99]"
                                                                            }`}
                                                                        style={{ width: `${largura}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {dados.tempos.some((t) => t.segundos != null && t.segundos < 60) ? (
                                                    <div className="flex items-center gap-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#F2CB3F]" />
                                                        Marcada em menos de 1 minuto (início e fim em sequência no app)
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <p className={`m-0 text-[14px] ${TEXTO_MEDIO}`}>Sem registros de etapa no histórico.</p>
                                        )}
                                    </section>
                                </div>
                            </div>
                        ) : aba === "itens" ? (
                            <div className="flex flex-col gap-3 lg:gap-5">
                                {gruposItens.length ? (
                                    <>
                                        {/* Computador: tabela */}
                                        <div className={`${CARTAO} hidden overflow-x-auto lg:block`}>
                                            <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
                                                <thead>
                                                    <tr className={`text-left ${ROTULO}`}>
                                                        <th className="px-5 py-3.5 font-extrabold">Item</th>
                                                        <th className="w-14 px-3 py-3.5 font-extrabold">Qtd</th>
                                                        <th className="px-3 py-3.5 font-extrabold">Saiu de</th>
                                                        <th className="px-5 py-3.5 font-extrabold">Situação</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {gruposItens.map(([grupo, lista]) => {
                                                        const Ic = iconeDoGrupo(grupo);
                                                        return (
                                                            <React.Fragment key={grupo}>
                                                                <tr>
                                                                    <td colSpan={4} className="bg-[#F6F8FB] px-5 pb-2 pt-3 dark:bg-[#1C2334]">
                                                                        <span className={`inline-flex items-center gap-2 ${ROTULO}`}>
                                                                            <Ic size={16} stroke={2} className="text-[#3D6A99] dark:text-[#A9BED6]" />
                                                                            {grupo}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                                {lista.map((it, i) => (
                                                                    <tr key={`${grupo}-${i}`} className="border-t border-[#EEF1F5] dark:border-white/10">
                                                                        <td className={`break-words px-5 py-3 font-bold ${TEXTO_FORTE}`}>{it.nome}</td>
                                                                        <td className="px-3 py-3">{it.qtd}</td>
                                                                        <td className={`px-3 py-3 ${TEXTO_MEDIO}`}>
                                                                            <span className="inline-flex items-center gap-1.5">
                                                                                <IconMapPin size={14} stroke={2} />
                                                                                {it.origem || "—"}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-5 py-3">
                                                                            <ChipSituacao item={it} />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Celular: cartões */}
                                        <div className="flex flex-col gap-2 lg:hidden">
                                            {gruposItens.map(([grupo, lista]) => {
                                                const Ic = iconeDoGrupo(grupo);
                                                return (
                                                    <React.Fragment key={grupo}>
                                                        <div className={`flex items-center gap-2 px-0.5 pb-0.5 pt-2 ${ROTULO}`}>
                                                            <Ic size={15} stroke={2} className="text-[#3D6A99] dark:text-[#A9BED6]" />
                                                            {grupo}
                                                        </div>
                                                        {lista.map((it, i) => (
                                                            <div key={`${grupo}-${i}`} className={`${CARTAO} flex flex-col gap-2 px-3.5 py-3`}>
                                                                <div className="flex justify-between gap-2.5">
                                                                    <span className={`break-words text-[14.5px] font-extrabold leading-snug ${TEXTO_FORTE}`}>{it.nome}</span>
                                                                    <span className={`shrink-0 text-[14px] font-extrabold ${TEXTO_MEDIO}`}>x{it.qtd}</span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <span className={`inline-flex items-center gap-1.5 text-[13px] ${TEXTO_MEDIO}`}>
                                                                        <IconMapPin size={13} stroke={2} />
                                                                        {it.origem || "—"}
                                                                    </span>
                                                                    <ChipSituacao item={it} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div className={`${CARTAO} p-6 text-center text-[14px] ${TEXTO_MEDIO}`}>
                                        Nenhum item de estoque registrado neste atendimento.
                                    </div>
                                )}

                                {dados.materiais.length ? (
                                    <section className={`${CARTAO} flex flex-col gap-3.5 p-4 lg:px-5`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Titulo icone={IconHeart}>
                                                {dados.materiaisKit ? `Material de assistência · ${dados.materiaisKit}` : "Material de assistência"}
                                            </Titulo>
                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold ${dados.materiaisSituacao === "Recolhido" ? CHIP_VERDE : CHIP_AMARELO}`}
                                            >
                                                <IconArchive size={14} stroke={2.2} />
                                                {dados.materiaisSituacao === "Recolhido"
                                                    ? recolhimento
                                                        ? `Recolhido em ${recolhimento}`
                                                        : "Recolhido"
                                                    : "A recolher"}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:gap-2">
                                            {dados.materiais.map((m, i) => (
                                                <div
                                                    key={`${m.nome}-${i}`}
                                                    className="flex justify-between gap-2 rounded-[10px] bg-[#F6F8FB] px-2.5 py-2 text-[13px] lg:px-3 lg:py-2.5 lg:text-[14px] dark:bg-[#1C2334]"
                                                >
                                                    <span className="min-w-0 break-words">{m.nome}</span>
                                                    <b className="shrink-0">{m.qtd}</b>
                                                </div>
                                            ))}
                                        </div>
                                        {dados.naoUsados.length ? (
                                            <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                Não usados: {juntarComE(dados.naoUsados)}.
                                            </span>
                                        ) : null}
                                    </section>
                                ) : dados.naoUsados.length ? (
                                    <span className="px-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                        Não usados: {juntarComE(dados.naoUsados)}.
                                    </span>
                                ) : null}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 lg:gap-4">
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                    {[
                                        { id: false, rotulo: `Tudo (${qtdTudo})`, icone: IconList },
                                        { id: true, rotulo: `Só etapas (${qtdEtapas})`, icone: IconCheck },
                                    ].map((f) => {
                                        const ativo = soEtapas === f.id;
                                        return (
                                            <button
                                                key={String(f.id)}
                                                type="button"
                                                aria-pressed={ativo}
                                                onClick={() => setSoEtapas(f.id)}
                                                className={[
                                                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-[14px] font-extrabold transition",
                                                    ativo
                                                        ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                                        : "border-[#D5DCE6] bg-[#FFFFFF] text-[#313C55] hover:bg-[#F1F4F8] dark:border-white/12 dark:bg-[#232B3F] dark:text-[#D6DCE8]",
                                                ].join(" ")}
                                            >
                                                <f.icone size={16} stroke={2} />
                                                {f.rotulo}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className={`${CARTAO} px-3.5 pb-3 pt-1 lg:px-5 lg:pb-4 lg:pt-2`}>
                                    {diasLinha.length ? (
                                        diasLinha.map((d) => (
                                            <div key={d.dia || "sem-dia"}>
                                                <div className={`flex items-center gap-2 pb-1.5 pt-3.5 lg:pb-2 lg:pt-4 ${ROTULO}`}>
                                                    <IconCalendar size={15} stroke={2} />
                                                    {d.dia ? diaComSemana(d.dia) : "Sem data"}
                                                </div>
                                                {d.eventos.map((ev, i) => {
                                                    const Ic = iconeDoEvento(ev);
                                                    return (
                                                        <div
                                                            key={`${ev.hora}-${i}`}
                                                            className="grid grid-cols-[44px_32px_minmax(0,1fr)] items-start gap-2.5 py-1.5 lg:grid-cols-[52px_32px_minmax(0,1fr)_auto] lg:gap-3"
                                                        >
                                                            <span className="pt-1.5 text-[14px] font-extrabold">{ev.hora}</span>
                                                            <span
                                                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ev.etapa
                                                                    ? "bg-[#313C55] text-white dark:bg-[#3D6A99]"
                                                                    : "bg-[#E9EFF6] text-[#3D6A99] dark:bg-[#3D6A99]/25 dark:text-[#A9BED6]"
                                                                    }`}
                                                            >
                                                                <Ic size={16} stroke={2} />
                                                            </span>
                                                            <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                                                                <ConteudoEvento
                                                                    ev={ev}
                                                                    aberto={abertos.has(`${d.dia}-${i}`)}
                                                                    onAlternar={() => alternarEvento(`${d.dia}-${i}`)}
                                                                />
                                                                {ev.por ? (
                                                                    <span className="mt-0.5 self-start rounded-lg bg-[#F1F4F8] px-2 py-0.5 text-[12.5px] font-bold text-[#4A5368] lg:hidden dark:bg-[#1C2334] dark:text-[#D6DCE8]">
                                                                        {ev.por}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            {ev.por ? (
                                                                <span className="mt-1 hidden whitespace-nowrap rounded-lg bg-[#F1F4F8] px-2 py-0.5 text-[12.5px] font-bold text-[#4A5368] lg:inline dark:bg-[#1C2334] dark:text-[#D6DCE8]">
                                                                    {ev.por}
                                                                </span>
                                                            ) : (
                                                                <span className="hidden lg:inline" />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))
                                    ) : (
                                        <p className={`m-0 py-5 text-center text-[14px] ${TEXTO_MEDIO}`}>
                                            Nenhum evento no histórico deste atendimento.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <TermoVelorioOnlineModal
                open={termoVelorioOpen}
                onClose={() => setTermoVelorioOpen(false)}
                registro={(registroCompleto || registro) as any}
                zIndex={100}
            />

            {fotosOpen && (
                <div
                    className="fixed z-[90] flex items-center justify-center overflow-hidden bg-black/70 p-3 sm:p-6"
                    style={{
                        top: viewport?.offsetTop ?? 0,
                        left: viewport?.offsetLeft ?? 0,
                        width: viewport ? `${viewport.width}px` : "100vw",
                        height: viewport ? `${viewport.height}px` : "100dvh",
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Fotos anexadas"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setFotosOpen(false);
                    }}
                >
                    <div
                        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-[#232B3F]"
                        style={{
                            maxHeight: viewport
                                ? `${Math.max(1, viewport.height - 24)}px`
                                : "calc(100dvh - 1.5rem)",
                        }}
                    >
                        <div className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
                            <div>
                                <h3 className="text-base font-semibold">Fotos anexadas</h3>
                                <p className="text-xs text-muted-foreground">
                                    Foto do falecido(a), ornamentação e paramentação anexadas ao atendimento.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border hover:bg-muted"
                                onClick={() => setFotosOpen(false)}
                                title="Fechar"
                                aria-label="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 p-3 sm:p-4 dark:bg-[#1C2334]"
                            style={{
                                WebkitOverflowScrolling: "touch",
                                overscrollBehaviorY: "contain",
                                touchAction: "pan-y",
                            }}
                        >
                            {fotos.length === 0 ? (
                                <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground dark:bg-[#232B3F]">
                                    Nenhuma foto anexada neste atendimento.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {fotos.map((foto) => (
                                        <div
                                            key={foto.url}
                                            className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-[#232B3F]"
                                        >
                                            <div className="border-b px-3 py-2 text-sm font-semibold">
                                                {foto.titulo}
                                            </div>
                                            <div className="bg-slate-50 p-3 dark:bg-[#1C2334]">
                                                <img
                                                    src={foto.url}
                                                    alt={foto.titulo}
                                                    className="mx-auto max-h-[64vh] w-auto max-w-full rounded-lg border bg-white object-contain dark:bg-[#232B3F]"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function ChipSituacao({ item }: { item: ItemEstoqueRelatorio }) {
    const s = item.situacao;
    if (!s) {
        const coroa = item.grupo.toLowerCase().includes("coroa");
        return (
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold ${CHIP_CINZA}`}>
                {coroa ? <IconFlower size={13} stroke={2.2} /> : null}
                {coroa ? "Pedido de coroa" : "Sem baixa"}
            </span>
        );
    }
    const pendente = /pendente/i.test(s);
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-extrabold ${pendente ? CHIP_AMARELO : CHIP_AZUL}`}
        >
            {pendente ? <IconClock size={13} stroke={2.5} /> : <IconCheck size={13} stroke={2.5} />}
            {pendente ? "Baixa pendente" : s}
        </span>
    );
}

/* ============================== Evento da linha do tempo ============================== */

/** Quantas informações de uma edição aparecem antes do "Ver todas". */
const LIMITE_CAMPOS = 4;

/**
 * Separa o texto da edição (o mesmo do PDF: "Campo: valor · Campo: valor") em linhas.
 * Uma informação só continua numa linha; várias viram uma lista curta, que abre por inteiro.
 */
function camposDaEdicao(texto: string) {
    return texto
        .split(" · ")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
            const i = p.indexOf(": ");
            return i > 0 && i <= 60 ? { rotulo: p.slice(0, i), valor: p.slice(i + 2) } : { rotulo: "", valor: p };
        });
}

function ConteudoEvento({
    ev,
    aberto,
    onAlternar,
}: {
    ev: EventoLinhaTempo;
    aberto: boolean;
    onAlternar: () => void;
}) {
    const detalhe = ev.subitens.length ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {ev.subitens.map((s, k) => (
                <li key={k} className="break-words text-[13px] leading-relaxed text-[#5B6478] dark:text-[#AEB9CF]">
                    {s}
                </li>
            ))}
        </ul>
    ) : null;

    // Etapas: uma por bloco, com a seta entre elas e "com foto" como etiqueta.
    if (ev.etapa) {
        const passos = ev.texto.split(" » ").map((t) => ({
            nome: t.replace(/\s*\(com foto\)\s*/i, "").trim(),
            foto: /\(com foto\)/i.test(t),
        }));
        return (
            <div className="flex min-w-0 flex-col gap-1 pt-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {passos.map((p, k) => (
                        <React.Fragment key={k}>
                            {k > 0 ? <IconChevronRight size={15} stroke={2.4} className="shrink-0 text-[#8893AA]" /> : null}
                            <span className={`text-[15px] font-extrabold leading-snug ${TEXTO_FORTE}`}>{p.nome}</span>
                            {p.foto ? (
                                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ${CHIP_CINZA}`}>
                                    <IconCamera size={12} stroke={2} />
                                    foto
                                </span>
                            ) : null}
                        </React.Fragment>
                    ))}
                </div>
                {detalhe}
            </div>
        );
    }

    const campos = camposDaEdicao(ev.texto);

    if (campos.length <= 1) {
        const c = campos[0];
        return (
            <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                <span className={`break-words text-[14.5px] leading-snug ${TEXTO_MEDIO}`}>
                    {c?.rotulo ? (
                        <>
                            <span className="font-semibold">{c.rotulo}:</span> <b className={TEXTO_FORTE}>{c.valor}</b>
                        </>
                    ) : (
                        <span className="font-semibold">{c?.valor || ev.texto}</span>
                    )}
                </span>
                {detalhe}
            </div>
        );
    }

    const visiveis = aberto ? campos : campos.slice(0, LIMITE_CAMPOS);
    const escondidos = campos.length - LIMITE_CAMPOS;

    return (
        <div className="flex min-w-0 flex-col gap-1.5 pt-1">
            <span className={`text-[14.5px] font-bold leading-snug ${TEXTO_MEDIO}`}>
                Cadastro atualizado · {campos.length} informações
            </span>
            <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl bg-[#F6F8FB] px-3 py-2 sm:grid-cols-2 dark:bg-[#1C2334]">
                {visiveis.map((c, k) => (
                    <div key={k} className="flex min-w-0 flex-col py-0.5">
                        {c.rotulo ? (
                            <dt className="text-[12px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">{c.rotulo}</dt>
                        ) : null}
                        <dd className={`m-0 break-words text-[13.5px] font-semibold leading-snug ${TEXTO_FORTE}`}>{c.valor}</dd>
                    </div>
                ))}
            </dl>
            {escondidos > 0 ? (
                <button
                    type="button"
                    onClick={onAlternar}
                    aria-expanded={aberto}
                    className="inline-flex min-h-[36px] items-center gap-1 self-start rounded-lg px-1 text-[13px] font-extrabold text-[#3D6A99] hover:underline dark:text-[#A9BED6]"
                >
                    <IconChevronDown size={15} stroke={2.4} className={aberto ? "rotate-180" : ""} />
                    {aberto ? "Mostrar menos" : `Ver todas (+${escondidos})`}
                </button>
            ) : null}
            {detalhe}
        </div>
    );
}
