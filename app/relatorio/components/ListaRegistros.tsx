"use client";

/**
 * Lista do Histórico de sepultamentos (/relatorio).
 *
 * 27/10/2026 (visual novo):
 * - linha com nome + segunda linha (falecimento, velório, última ação) e selo "Teste";
 * - data curta ("27/10 · 13:57"; ano só quando for outro ano);
 * - Visita e Pós-atendimento como etiquetas com texto (antes só ícone colorido) e legenda das cores;
 * - celular em cartão; alvos de toque de 44 px;
 * - paginação com total, "Mostrando x–y de n", primeira/última página e registros por página.
 * Mesmos dados e mesmas ações de antes (nada muda no servidor).
 */

import React from "react";
import {
    IconChevronLeft,
    IconChevronRight,
    IconChevronsLeft,
    IconChevronsRight,
    IconClipboardCheck,
    IconMapPin,
} from "@tabler/icons-react";
import { FalecidoItem } from "./TiposHistorico";
import type { AvaliacaoStatusResumo, StatusAvaliacoesItem } from "./Api";

interface Props {
    registros: FalecidoItem[];
    loading: boolean;
    pagina: number;
    totalPaginas: number;
    onPaginaAnterior: () => void;
    onPaginaProxima: () => void;
    selecionadoId?: string;
    onSelecionar: (item: FalecidoItem) => void;
    criacaoMap: Record<string, string>;

    avaliacoesMap?: Record<string, StatusAvaliacoesItem>;
    podeVerVisita?: boolean;
    podeVerPosAtendimento?: boolean;
    loadingAvaliacoes?: boolean;

    onAbrirVisita?: (item: FalecidoItem) => void;
    onAbrirPosAtendimento?: (item: FalecidoItem) => void;

    /** 27/10/2026: paginação completa (opcionais para não quebrar quem usa a versão antiga). */
    totalRegistros?: number;
    porPagina?: number;
    onIrPagina?: (p: number) => void;
    onMudarPorPagina?: (n: number) => void;
}

/* =========================
   Helpers: ID e Datas
   ========================= */

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id ?? anyItem?.id ?? "").trim();
}

function parseBrDate(s: string): Date | null {
    const m = s?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}

function parseIsoDate(s: string): Date | null {
    const t = s?.trim().replace(" ", "T");
    if (!t) return null;

    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }

    m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
        const [, yyyy, mm, dd, hh, mi, ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function parseDateFlex(s?: string | null): Date | null {
    if (!s) return null;
    return parseBrDate(s) || parseIsoDate(s) || null;
}

function getItemDate(item: FalecidoItem, criacaoMap: Record<string, string>): Date | null {
    const id = getRegistroId(item);
    const candidatos = [
        id ? criacaoMap[id] : undefined,
        (item as any).created_at,
        (item as any).data,
        (item as any).data_inicio_velorio,
        (item as any).data_fim_velorio,
    ];
    for (const c of candidatos) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "27/10 · 13:57" (ano só quando não for o ano atual). */
function dataCurta(d: Date | null, comHora = true): string {
    if (!d) return "—";
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : "";
    const dia = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}${ano}`;
    return comHora ? `${dia} · ${p2(d.getHours())}:${p2(d.getMinutes())}` : dia;
}

function dataCompleta(d: Date | null): string {
    if (!d) return "";
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} às ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Registro de teste (nome com a palavra TESTE). */
export function ehRegistroTeste(item: FalecidoItem): boolean {
    const n = String(item?.falecido || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();
    return /(^|[^A-Z])TESTE([^A-Z]|$)/.test(n);
}

/** Segunda linha: falecimento, velório e última ação (só o que veio preenchido). */
function detalhesDoRegistro(item: FalecidoItem): string[] {
    const a = item as any;
    const out: string[] = [];

    const fal = parseDateFlex(String(a.data_falecimento || ""));
    if (fal) out.push(`Falecimento ${dataCurta(fal, false)}`);

    const local = String(a.local_velorio || "").trim();
    const dataVel = String(a.data_inicio_velorio || "").trim();
    const horaVel = String(a.hora_inicio_velorio || "").trim().slice(0, 5);
    const dv = parseDateFlex(dataVel);
    let vel = "";
    if (dv) vel = `${p2(dv.getDate())}/${p2(dv.getMonth() + 1)}${horaVel ? ` ${horaVel}` : ""}`;
    if (local || vel) {
        const localCurto = local.length > 42 ? `${local.slice(0, 40)}…` : local;
        out.push(`Velório ${[localCurto, vel].filter(Boolean).join(", ")}`);
    }

    const acao = String(a.ultima_acao || "").trim();
    if (acao && !/^(criou|editou) registro$/i.test(acao) && acao.toLowerCase() !== "atualizou status") out.push(acao);

    return out;
}

/* =========================
   Avaliações (Visita / Pós)
   ========================= */

type Visual = { classes: string; ponto: string; curto: string; texto: string };

function statusVisual(status?: AvaliacaoStatusResumo | null): Visual {
    switch (status?.status) {
        case "concluida":
            return {
                classes:
                    "border-[#7BA11A] bg-[#EEF5D6] text-[#3F5A0A] hover:bg-[#E3EEC2] dark:border-[#B3CE52]/50 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A] dark:hover:bg-[#B3CE52]/25",
                ponto: "bg-[#7BA11A] dark:bg-[#B3CE52]",
                curto: "Concluída",
                texto: status.avaliador_nome ? `Concluída por ${status.avaliador_nome}` : "Concluída",
            };
        case "em_andamento":
            return {
                classes:
                    "border-[#3D6A99] bg-[#E9EFF6] text-[#2E5277] hover:bg-[#DCE6F1] dark:border-[#3D6A99] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA] dark:hover:bg-[#3D6A99]/35",
                ponto: "bg-[#3D6A99] dark:bg-[#A9BED6]",
                curto: "Em andamento",
                texto: status.avaliador_nome ? `Em andamento por ${status.avaliador_nome}` : "Em andamento",
            };
        case "pendente":
            return {
                classes:
                    "border-[#E4BC30] bg-white text-[#7A5D00] hover:bg-[#FCF3CC] dark:border-[#F2CB3F]/60 dark:bg-transparent dark:text-[#F2CB3F] dark:hover:bg-[#F2CB3F]/10",
                ponto: "bg-[#F2CB3F]",
                curto: "Pendente",
                texto: "Pendente",
            };
        case "nao_aplicavel":
            return {
                classes: "border-[#E3E8F0] bg-[#F6F8FB] text-[#98A1B3] cursor-default dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-[#7D879B]",
                ponto: "bg-[#C9D1DE] dark:bg-[#5B6478]",
                curto: "Não se aplica",
                texto: "Não se aplica",
            };
        default:
            return {
                classes: "border-[#E3E8F0] bg-[#F6F8FB] text-[#98A1B3] dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-[#7D879B]",
                ponto: "bg-[#C9D1DE] dark:bg-[#5B6478]",
                curto: "—",
                texto: "Situação indisponível",
            };
    }
}

function EtiquetaAvaliacao({
    tipo,
    status,
    carregando,
    onClick,
}: {
    tipo: "visita" | "pos";
    status?: AvaliacaoStatusResumo | null;
    carregando?: boolean;
    onClick: () => void;
}) {
    const v = statusVisual(status);
    const naoAplicavel = status?.status === "nao_aplicavel";
    const nome = tipo === "visita" ? "Visita" : "Pós";
    const titulo = `${tipo === "visita" ? "Visita" : "Pós-atendimento"}: ${v.texto}`;
    const Icone = tipo === "visita" ? IconMapPin : IconClipboardCheck;

    return (
        <button
            type="button"
            title={titulo}
            aria-label={titulo}
            disabled={carregando || naoAplicavel}
            onClick={(e) => {
                e.stopPropagation();
                if (!carregando && !naoAplicavel) onClick();
            }}
            className={[
                "inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2.5 text-left transition lg:w-[150px]",
                v.classes,
                carregando ? "cursor-wait opacity-60" : "",
            ].join(" ")}
        >
            <Icone size={18} stroke={1.8} className="shrink-0" />
            <span className="min-w-0 leading-tight">
                <span className="block text-[12px] font-extrabold">{nome}</span>
                <span className="block truncate text-[12px] font-semibold opacity-90">{carregando ? "…" : v.curto}</span>
            </span>
        </button>
    );
}

function Legenda() {
    const itens: [string, string][] = [
        ["bg-[#F2CB3F]", "Pendente"],
        ["bg-[#3D6A99] dark:bg-[#A9BED6]", "Em andamento"],
        ["bg-[#7BA11A] dark:bg-[#B3CE52]", "Concluída"],
        ["bg-[#C9D1DE] dark:bg-[#5B6478]", "Não se aplica"],
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">
            <span className="font-bold">Avaliações:</span>
            {itens.map(([cor, r]) => (
                <span key={r} className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${cor}`} />
                    {r}
                </span>
            ))}
        </div>
    );
}

/* =========================
   Paginação
   ========================= */

const BTN_PAG =
    "inline-flex size-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white";

function Paginacao({
    pagina,
    totalPaginas,
    total,
    porPagina,
    onAnterior,
    onProxima,
    onIr,
    onPorPagina,
}: {
    pagina: number;
    totalPaginas: number;
    total?: number;
    porPagina?: number;
    onAnterior: () => void;
    onProxima: () => void;
    onIr?: (p: number) => void;
    onPorPagina?: (n: number) => void;
}) {
    const tp = Math.max(1, totalPaginas);
    const ini = total && porPagina ? Math.min(total, (pagina - 1) * porPagina + 1) : 0;
    const fim = total && porPagina ? Math.min(total, pagina * porPagina) : 0;

    return (
        <div className="flex flex-col gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.08] dark:bg-[#1C2334] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] sm:justify-start">
                {total ? (
                    <span>
                        Mostrando <b className="text-[#313C55] dark:text-white">{ini}–{fim}</b> de{" "}
                        <b className="text-[#313C55] dark:text-white">{total.toLocaleString("pt-BR")}</b>
                    </span>
                ) : null}
                {onPorPagina && porPagina ? (
                    <label className="inline-flex items-center gap-2">
                        <span className="hidden sm:inline">Por página</span>
                        <select
                            value={porPagina}
                            onChange={(e) => onPorPagina(Number(e.target.value))}
                            aria-label="Registros por página"
                            className="h-11 rounded-xl border-0 bg-white px-3 text-[15px] font-bold text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#232B3F] dark:text-white"
                        >
                            {[10, 20, 50].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
                {onIr ? (
                    <button type="button" className={BTN_PAG} onClick={() => onIr(1)} disabled={pagina <= 1} aria-label="Primeira página" title="Primeira página">
                        <IconChevronsLeft size={18} />
                    </button>
                ) : null}
                <button type="button" className={BTN_PAG} onClick={onAnterior} disabled={pagina <= 1} aria-label="Página anterior" title="Página anterior">
                    <IconChevronLeft size={18} />
                </button>
                <span className="min-w-[92px] text-center text-[14px] font-bold">
                    {pagina} de {tp}
                </span>
                <button type="button" className={BTN_PAG} onClick={onProxima} disabled={pagina >= tp} aria-label="Próxima página" title="Próxima página">
                    <IconChevronRight size={18} />
                </button>
                {onIr ? (
                    <button type="button" className={BTN_PAG} onClick={() => onIr(tp)} disabled={pagina >= tp} aria-label="Última página" title="Última página">
                        <IconChevronsRight size={18} />
                    </button>
                ) : null}
            </div>
        </div>
    );
}

/* =========================
   Lista
   ========================= */

export default function ListaRegistros({
    registros,
    loading,
    pagina,
    totalPaginas,
    onPaginaAnterior,
    onPaginaProxima,
    selecionadoId,
    onSelecionar,
    criacaoMap,

    avaliacoesMap = {},
    podeVerVisita = false,
    podeVerPosAtendimento = false,
    loadingAvaliacoes = false,

    onAbrirVisita,
    onAbrirPosAtendimento,

    totalRegistros,
    porPagina,
    onIrPagina,
    onMudarPorPagina,
}: Props) {
    const semDuplicados = React.useMemo(() => {
        const map = new Map<string, FalecidoItem>();
        for (let i = 0; i < (registros || []).length; i++) {
            const it = registros[i];
            let id = getRegistroId(it);
            if (!id) {
                const created = (it as any).created_at || "";
                id = `sem-id-${i}-${String(created)}`;
                map.set(id, it);
                continue;
            }
            const atual = map.get(id);
            if (!atual) {
                map.set(id, it);
            } else {
                const dNovo = getItemDate(it, criacaoMap)?.getTime() ?? 0;
                const dAtual = getItemDate(atual, criacaoMap)?.getTime() ?? 0;
                if (dNovo >= dAtual) map.set(id, it);
            }
        }
        return Array.from(map.values());
    }, [registros, criacaoMap]);

    const ordenados = React.useMemo(() => {
        const arr = [...semDuplicados];
        arr.sort((a, b) => (getItemDate(b, criacaoMap)?.getTime() ?? 0) - (getItemDate(a, criacaoMap)?.getTime() ?? 0));
        return arr;
    }, [semDuplicados, criacaoMap]);

    const mostraAvaliacoes = podeVerVisita || podeVerPosAtendimento;

    return (
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]">
            {/* Cabeçalho da lista */}
            <div className="flex flex-col gap-2 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[15px] font-extrabold text-[#313C55] dark:text-white">
                    {loading ? "Carregando registros…" : `${(totalRegistros ?? ordenados.length).toLocaleString("pt-BR")} ${(totalRegistros ?? ordenados.length) === 1 ? "registro" : "registros"}`}
                    <span className="ml-2 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">· mais recentes primeiro</span>
                </div>
                {mostraAvaliacoes ? <Legenda /> : null}
            </div>

            <div className="flex-1">
                {loading ? (
                    <ul aria-hidden="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <li key={i} className="border-b border-[#EEF1F6] px-4 py-4 dark:border-white/[0.06]">
                                <div className="h-4 w-1/2 animate-pulse rounded bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#F1F4F8] dark:bg-white/[0.05]" />
                            </li>
                        ))}
                    </ul>
                ) : ordenados.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-[15px] font-extrabold text-[#313C55] dark:text-white">Nenhum registro encontrado.</p>
                        <p className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Confira o nome ou amplie o período.</p>
                    </div>
                ) : (
                    <ul>
                        {ordenados.map((item, idx) => {
                            const id = getRegistroId(item);
                            const criadoEm = (id ? criacaoMap[id] : "") || (item as any).created_at || "";
                            const dataReg = parseDateFlex(String(criadoEm || "")) || getItemDate(item, criacaoMap);
                            const key = (id ? `id-${id}` : `sem-id-${idx}`) + `-${criadoEm || "s-data"}`;
                            const status = id && avaliacoesMap[id] ? avaliacoesMap[id] : undefined;
                            const detalhes = detalhesDoRegistro(item);
                            const teste = ehRegistroTeste(item);
                            const selecionado = selecionadoId === id;

                            return (
                                <li
                                    key={key}
                                    className={[
                                        "group relative border-b border-[#EEF1F6] last:border-b-0 dark:border-white/[0.06]",
                                        selecionado ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "",
                                        teste ? "opacity-70" : "",
                                    ].join(" ")}
                                >
                                    {selecionado ? <span className="absolute inset-y-0 left-0 w-1 bg-[#3D6A99]" aria-hidden="true" /> : null}
                                    <div className="flex flex-col gap-3 px-4 py-3 transition hover:bg-[#F6F8FB] dark:hover:bg-white/[0.03] lg:flex-row lg:items-center lg:gap-4">
                                        {/* Nome + detalhes (abre o registro) */}
                                        <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onSelecionar(item)}>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="min-w-0 break-words text-[15px] font-extrabold leading-snug text-[#313C55] dark:text-white lg:truncate">
                                                        {item.falecido || "Sem nome"}
                                                    </span>
                                                    {teste ? (
                                                        <span className="rounded-md border border-[#C9D1DE] px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#5B6478] dark:border-white/[0.2] dark:text-[#AEB9CF]">
                                                            Teste
                                                        </span>
                                                    ) : null}
                                                </span>
                                                {detalhes.length ? (
                                                    <span className="mt-0.5 block text-[13px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{detalhes.join(" · ")}</span>
                                                ) : null}
                                                {/* Data no celular */}
                                                <span className="mt-1 block text-[12px] text-[#7A8396] lg:hidden">Registrado em {dataCurta(dataReg)}</span>
                                            </span>
                                            <IconChevronRight size={18} className="mt-0.5 shrink-0 text-[#98A1B3] lg:hidden" />
                                        </button>

                                        {/* Data (computador) */}
                                        <div className="hidden w-[110px] shrink-0 text-right lg:block" title={dataCompleta(dataReg)}>
                                            <span className="block text-[11px] font-bold uppercase tracking-wide text-[#98A1B3]">Registro</span>
                                            <span className="block text-[13px] font-semibold text-[#313C55] dark:text-[#DDE3EE]">{dataCurta(dataReg)}</span>
                                        </div>

                                        {/* Avaliações */}
                                        {id && mostraAvaliacoes ? (
                                            <div className="grid shrink-0 grid-cols-2 gap-2 lg:flex">
                                                {podeVerVisita ? (
                                                    <EtiquetaAvaliacao tipo="visita" status={status?.visita} carregando={loadingAvaliacoes} onClick={() => onAbrirVisita?.(item)} />
                                                ) : null}
                                                {podeVerPosAtendimento ? (
                                                    <EtiquetaAvaliacao tipo="pos" status={status?.pos_atendimento} carregando={loadingAvaliacoes} onClick={() => onAbrirPosAtendimento?.(item)} />
                                                ) : null}
                                            </div>
                                        ) : null}

                                        <button
                                            type="button"
                                            onClick={() => onSelecionar(item)}
                                            aria-label={`Abrir o registro de ${item.falecido || "sem nome"}`}
                                            title="Abrir o registro"
                                            className="hidden size-11 shrink-0 place-items-center rounded-xl text-[#98A1B3] transition hover:bg-[#E9EFF6] hover:text-[#313C55] dark:hover:bg-white/[0.06] dark:hover:text-white lg:grid"
                                        >
                                            <IconChevronRight size={20} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <Paginacao
                pagina={pagina}
                totalPaginas={totalPaginas}
                total={totalRegistros}
                porPagina={porPagina}
                onAnterior={onPaginaAnterior}
                onProxima={onPaginaProxima}
                onIr={onIrPagina}
                onPorPagina={onMudarPorPagina}
            />
        </div>
    );
}
