"use client";
import React, { useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import { listarFalecidos } from "./Api";
import { FalecidoItem } from "./TiposHistorico";
import ModalDetalheRegistro from "./ModalDetalheRegistro";

export default function PaginaHistoricoSepultamentos() {
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);

    // filtros
    const [pagina, setPagina] = useState(1);
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");

    // modal de detalhes
    const [modalAberto, setModalAberto] = useState(false);
    const [registroSelecionado, setRegistroSelecionado] = useState<FalecidoItem | null>(null);

    // modal de análise geral (permanece como está)
    const [analiseOpen, setAnaliseOpen] = useState(false);

    useEffect(() => {
        (async () => {
            setLoadingLista(true);
            try {
                const dados = await listarFalecidos();
                setLista(dados);
            } finally {
                setLoadingLista(false);
            }
        })();
    }, []);

    const porPagina = 10;

    const filtrados = useMemo(() => {
        const nome = filtroNome.trim().toLowerCase();
        return (lista || []).filter((reg) => {
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) return false;
            // se quiser filtrar por data de criação, precisaria ter a data no objeto base
            if (filtroDe || filtroAte) {
                const base = (reg.ultima_datahora || "").substring(0, 10);
                if (filtroDe && base && base < filtroDe) return false;
                if (filtroAte && base && base > filtroAte) return false;
            }
            return true;
        });
    }, [lista, filtroNome, filtroDe, filtroAte]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pageItems = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

    function abrirModal(item: FalecidoItem) {
        setRegistroSelecionado(item);
        setModalAberto(true);
    }

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

            {/* somente a lista */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <ListaRegistros
                    registros={pageItems}
                    loading={loadingLista}
                    pagina={pagina}
                    totalPaginas={totalPaginas}
                    onPaginaAnterior={() => setPagina((p) => Math.max(1, p - 1))}
                    onPaginaProxima={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    selecionadoId={registroSelecionado?.sepultamento_id}
                    onSelecionar={abrirModal}
                />
            </div>

            {/* modal de detalhes (logs + resumo + PDF) */}
            <ModalDetalheRegistro
                aberto={modalAberto}
                registro={registroSelecionado}
                onFechar={() => setModalAberto(false)}
            />

            {/* modal de análise geral (sem mudanças) */}
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
