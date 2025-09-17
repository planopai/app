"use client";
import React, { useEffect, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import LinhaDoTempoLogs from "./LinhaDoTempoLogs";
import ResumoFinal from "./ResumoFinal";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import BotaoExportarPdf from "./BotaoExportarPdf";
import { listarFalecidos, listarLogPorId } from "./Api";
import { FalecidoItem, LogItem } from "./TiposHistorico";
import { estaFinalizado, montarResumoFinalDoLog } from "./Normalizadores";

export default function PaginaHistoricoSepultamentos() {
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);
    const [pagina, setPagina] = useState(1);
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");
    const [selecionado, setSelecionado] = useState<FalecidoItem | null>(null);
    const [log, setLog] = useState<LogItem[]>([]);
    const [loadingLog, setLoadingLog] = useState(false);
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});
    const [analiseOpen, setAnaliseOpen] = useState(false);

    useEffect(() => {
        carregarFalecidos();
    }, []);

    async function carregarFalecidos() {
        setLoadingLista(true);
        const dados = await listarFalecidos();
        setLista(dados);
        setLoadingLista(false);
    }

    async function selecionarRegistro(item: FalecidoItem) {
        setSelecionado(item);
        setLoadingLog(true);
        const l = await listarLogPorId(item.sepultamento_id);
        setLog(l);
        setLoadingLog(false);
    }

    const porPagina = 10;
    const filtrados = lista.filter((i) =>
        i.falecido.toLowerCase().includes(filtroNome.toLowerCase())
    );
    const totalPaginas = Math.ceil(filtrados.length / porPagina);
    const pageItems = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

    const finalizado = estaFinalizado(log);
    const resumoFinal = finalizado ? montarResumoFinalDoLog(log) : undefined;

    return (
        <div className="p-4 flex flex-col gap-3">
            <BarraFiltros
                filtroNome={filtroNome}
                filtroDe={filtroDe}
                filtroAte={filtroAte}
                onChangeNome={setFiltroNome}
                onChangeDe={setFiltroDe}
                onChangeAte={setFiltroAte}
                onAbrirAnalise={() => setAnaliseOpen(true)}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ListaRegistros
                    registros={pageItems}
                    loading={loadingLista}
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    onPaginaAnterior={() => setPagina((p) => Math.max(1, p - 1))}
                    onPaginaProxima={() =>
                        setPagina((p) => Math.min(totalPaginas, p + 1))
                    }
                    selecionadoId={selecionado?.sepultamento_id}
                    onSelecionar={selecionarRegistro}
                    criacaoMap={criacaoMap}
                />

                <div className="md:col-span-2 border rounded flex flex-col">
                    <div className="flex justify-between items-center p-2 border-b">
                        <h2 className="font-semibold">Histórico</h2>
                        {selecionado && (
                            <BotaoExportarPdf
                                desabilitado={!selecionado}
                                selecionadoNome={selecionado.falecido}
                                criacaoSelecionado={criacaoMap[selecionado.sepultamento_id]}
                                logVisiveis={log}
                                resumoFinal={resumoFinal}
                            />
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loadingLog ? (
                            <div className="p-4">Carregando logs...</div>
                        ) : (
                            <LinhaDoTempoLogs logs={log} />
                        )}
                    </div>
                    <ResumoFinal visivel={!!resumoFinal} resumo={resumoFinal || {}} />
                </div>
            </div>

            <ModalAnaliseGeral
                aberto={analiseOpen}
                onFechar={() => setAnaliseOpen(false)}
                aDe=""
                aAte=""
                setADe={() => { }}
                setAAte={() => { }}
                somenteTanato={false}
                setSomenteTanato={() => { }}
                selectedItem={undefined}
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
