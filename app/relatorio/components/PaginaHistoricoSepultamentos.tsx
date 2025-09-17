"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import LinhaDoTempoLogs from "./LinhaDoTempoLogs";
import ResumoFinal from "./ResumoFinal";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import BotaoExportarPdf from "./BotaoExportarPdf";

import { listarFalecidos, listarLogPorId } from "./Api";
import { FalecidoItem, LogItem } from "./TiposHistorico";
import {
    estaFinalizado,
    isNoChangeEntry,
    montarResumoFinalDoLog,
} from "./Normalizadores";

/** Util */
function formataDataDia(s?: string) {
    return (s || "").slice(0, 10);
}

export default function PaginaHistoricoSepultamentos() {
    // Lista base
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);

    // Filtros
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");

    // Paginação
    const [pagina, setPagina] = useState(1);
    const porPagina = 10;

    // Seleção e logs
    const [selecionado, setSelecionado] = useState<FalecidoItem | null>(null);
    const [log, setLog] = useState<LogItem[]>([]);
    const [loadingLog, setLoadingLog] = useState(false);

    // Data de criação por registro (para filtros/visual)
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

    // Modal análise (placeholder — mesma assinatura que você já usa)
    const [analiseOpen, setAnaliseOpen] = useState(false);

    /* ================= Carregar lista ================= */
    const carregarFalecidos = useCallback(async () => {
        try {
            setLoadingLista(true);
            const dados = await listarFalecidos();
            setLista(dados || []);
        } finally {
            setLoadingLista(false);
        }
    }, []);

    useEffect(() => {
        carregarFalecidos();

        // Recarrega quando a aba volta a ficar visível (como no código grande)
        const onVis = () => {
            if (!document.hidden) carregarFalecidos();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [carregarFalecidos]);

    /* ================= Prefetch da data de criação (primeiro log) ================= */
    const prefetchCriacao = useCallback(async (id: string) => {
        if (criacaoMap[id]) return;
        try {
            const arr = await listarLogPorId(id);
            const ord = (arr || []).slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
            const primeiro = ord[0]?.datahora || "";
            if (primeiro) setCriacaoMap((prev) => ({ ...prev, [id]: primeiro }));
        } catch {
            // ignora
        }
    }, [criacaoMap]);

    // Prefetch para os itens da página atual
    useEffect(() => {
        pageItems.forEach((it) => prefetchCriacao(String(it.sepultamento_id)));
    }, [/* deps preenchidos depois da definição de pageItems */]); // será atualizado abaixo após pageItems

    /* ================= Selecionar registro / carregar log ================= */
    const selecionarRegistro = useCallback(async (item: FalecidoItem) => {
        setSelecionado(item);
        setLog([]);
        setLoadingLog(true);
        try {
            const l = await listarLogPorId(item.sepultamento_id);
            setLog(l || []);
            // Garante criacaoMap também no clique
            if (!criacaoMap[item.sepultamento_id] && l && l.length) {
                const ord = l.slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
                const primeiro = ord[0]?.datahora || "";
                if (primeiro) {
                    setCriacaoMap((prev) => ({ ...prev, [item.sepultamento_id]: primeiro }));
                }
            }
        } finally {
            setLoadingLog(false);
        }
    }, [criacaoMap]);

    /* ================= Filtro nome + período (usa criacaoMap se existir) ================= */
    const filtrados = useMemo(() => {
        const nome = filtroNome.trim().toLowerCase();
        return (lista || []).filter((reg) => {
            let ok = true;
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) ok = false;

            const id = String(reg.sepultamento_id);
            // Preferir data de criação; se não tiver, cai para ultima_datahora
            const base = formataDataDia(criacaoMap[id] || reg.ultima_datahora);
            if (filtroDe && base && base < filtroDe) ok = false;
            if (filtroAte && base && base > filtroAte) ok = false;

            return ok;
        });
    }, [lista, filtroNome, filtroDe, filtroAte, criacaoMap]);

    // Paginação baseada nos filtrados
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    useEffect(() => {
        if (pagina > totalPaginas) setPagina(totalPaginas);
        if (pagina < 1) setPagina(1);
    }, [totalPaginas, pagina]);

    const pageItems = useMemo(() => {
        const ini = (pagina - 1) * porPagina;
        return filtrados.slice(ini, ini + porPagina);
    }, [filtrados, pagina]);

    // Atualiza o efeito do prefetch agora que pageItems existe
    useEffect(() => {
        pageItems.forEach((it) => prefetchCriacao(String(it.sepultamento_id)));
    }, [pageItems, prefetchCriacao]);

    /* ================= Derivados do log ================= */
    const logVisiveis = useMemo(() => (log || []).filter((ent) => !isNoChangeEntry(ent)), [log]);
    const finalizado = useMemo(() => estaFinalizado(log), [log]);
    const resumoFinal = useMemo(
        () => (finalizado ? montarResumoFinalDoLog(log) : undefined),
        [finalizado, log]
    );

    /* ================= Render ================= */
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ListaRegistros
                    registros={pageItems}
                    loading={loadingLista}
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    onPaginaAnterior={() => setPagina((p) => Math.max(1, p - 1))}
                    onPaginaProxima={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    selecionadoId={selecionado?.sepultamento_id}
                    onSelecionar={selecionarRegistro}
                    criacaoMap={criacaoMap}
                />

                <div className="md:col-span-2 border rounded flex flex-col">
                    <div className="flex justify-between items-center p-2 border-b">
                        <h2 className="font-semibold">Histórico</h2>
                        {selecionado && (
                            <BotaoExportarPdf
                                desabilitado={!selecionado || logVisiveis.length === 0}
                                selecionadoNome={selecionado.falecido}
                                criacaoSelecionado={criacaoMap[selecionado.sepultamento_id]}
                                logVisiveis={logVisiveis}
                                resumoFinal={resumoFinal}
                            />
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {loadingLog ? (
                            <div className="p-4">Carregando logs...</div>
                        ) : (
                            <LinhaDoTempoLogs logs={logVisiveis} />
                        )}
                    </div>

                    <ResumoFinal visivel={!!resumoFinal} resumo={resumoFinal || {}} />
                </div>
            </div>

            {/* Modal de Análise Geral (placeholders — integre com seu módulo real) */}
            <ModalAnaliseGeral
                aberto={analiseOpen}
                onFechar={() => setAnaliseOpen(false)}
                aDe=""
                aAte=""
                setADe={() => { }}
                setAAte={() => { }}
                somenteTanato={false}
                setSomenteTanato={() => { }}
                selectedItem={undefined as any}
                setSelectedItem={() => { }}
                rows={[]}
                registrosComEventoNoPeriodo={0}
                listaTanatoPeriodo={[]}
                loading={false}
                onRecarregar={() => { }}
            />
        </div>
    );
}
