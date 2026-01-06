"use client";
import React, { useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import ModalDetalheRegistro from "./ModalDetalheRegistro";
import { listarFalecidosComCriacao, listarAnalitico } from "./Api";
import { FalecidoItem } from "./TiposHistorico";

/* =========================
   Helpers: ID e Datas
   ========================= */

function getRegistroId(item: FalecidoItem): string {
    const anyItem = item as any;
    return String(item?.sepultamento_id ?? anyItem?.id ?? "").trim();
}

// dd/mm/aaaa[, HH:MM[:SS]]
function parseBrDate(s: string): Date | null {
    const m = s?.trim().match(
        /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}

// ISO local-friendly (sem timezone vira horário local)
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

function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function makeRange(de?: string, ate?: string) {
    const d0 = de ? parseDateFlex(de) : null;
    const d1 = ate ? parseDateFlex(ate) : null;

    const baseStart = d0 ?? d1;
    const baseEnd = d1 ?? d0;

    const start = baseStart ? startOfDay(baseStart) : null;
    const end = baseEnd ? endOfDay(baseEnd) : null;

    if (start && end && end < start) return { start: end, end: start };
    return { start, end };
}

/** Melhor data disponível para um item (ordenação/filtragem). */
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

export default function PaginaHistoricoSepultamentos() {
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);

    const [pagina, setPagina] = useState(1);
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");

    const [modalAberto, setModalAberto] = useState(false);
    const [registroSelecionado, setRegistroSelecionado] = useState<FalecidoItem | null>(null);

    const [analiseOpen, setAnaliseOpen] = useState(false);

    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");

    const [aDe, setADe] = useState(`${yyyy}-${mm}-01`);
    const [aAte, setAAte] = useState(`${yyyy}-${mm}-${dd}`);
    const [somenteTanato, setSomenteTanato] = useState(false);

    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

    useEffect(() => {
        (async () => {
            setLoadingLista(true);
            try {
                const { lista, criacaoMap } = await listarFalecidosComCriacao();
                setLista(lista);
                setCriacaoMap(criacaoMap);
            } finally {
                setLoadingLista(false);
            }
        })();
    }, []);

    const porPagina = 10;

    const filtrados = useMemo(() => {
        const nome = filtroNome.trim().toLowerCase();
        const { start, end } = makeRange(filtroDe, filtroAte);

        const base = (lista || []).filter((reg) => {
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) return false;

            if (start || end) {
                const d = getItemDate(reg, criacaoMap);
                if (!d) return false;
                if (start && d < start) return false;
                if (end && d > end) return false;
            }
            return true;
        });

        base.sort((a, b) => {
            const da = getItemDate(a, criacaoMap);
            const db = getItemDate(b, criacaoMap);
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            return tb - ta;
        });

        return base;
    }, [lista, filtroNome, filtroDe, filtroAte, criacaoMap]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pageItems = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

    function abrirModal(item: FalecidoItem) {
        setRegistroSelecionado(item);
        setModalAberto(true);
    }

    async function carregarAnalise() {
        await listarAnalitico();
    }

    useEffect(() => {
        if (!analiseOpen) return;
        carregarAnalise();
    }, [analiseOpen, aDe, aAte, somenteTanato]);

    const selecionadoId = registroSelecionado ? getRegistroId(registroSelecionado) : undefined;

    return (
        <div className="p-4 flex flex-col gap-3">
            <BarraFiltros
                filtroNome={filtroNome}
                filtroDe={filtroDe}
                filtroAte={filtroAte}
                onChangeNome={(v) => {
                    setFiltroNome(v);
                    setPagina(1);
                }}
                onChangeDe={(v) => {
                    setFiltroDe(v);
                    setPagina(1);
                }}
                onChangeAte={(v) => {
                    setFiltroAte(v);
                    setPagina(1);
                }}
                onAbrirAnalise={() => setAnaliseOpen(true)}
            />

            <ListaRegistros
                registros={pageItems}
                loading={loadingLista}
                pagina={pagina}
                totalPaginas={totalPaginas}
                onPaginaAnterior={() => setPagina((p) => Math.max(1, p - 1))}
                onPaginaProxima={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                selecionadoId={selecionadoId}  // ✅ agora usa sepultamento_id OU id
                onSelecionar={abrirModal}
                criacaoMap={criacaoMap}
            />

            <ModalDetalheRegistro
                aberto={modalAberto}
                registro={registroSelecionado}
                onFechar={() => setModalAberto(false)}
            />

            <ModalAnaliseGeral
                aberto={analiseOpen}
                onFechar={() => setAnaliseOpen(false)}
                aDe={aDe}
                aAte={aAte}
                setADe={setADe}
                setAAte={setAAte}
                somenteTanato={somenteTanato}
                setSomenteTanato={setSomenteTanato}
                onRecarregar={carregarAnalise}
            />
        </div>
    );
}
