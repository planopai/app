"use client";
import React, { useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import ModalDetalheRegistro from "./ModalDetalheRegistro";
import { listarFalecidosComCriacao } from "./Api";
import { FalecidoItem } from "./TiposHistorico";

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
    const [registroSelecionado, setRegistroSelecionado] =
        useState<FalecidoItem | null>(null);

    // análise geral
    const [analiseOpen, setAnaliseOpen] = useState(false);

    // mapa de criação por registro
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

    // carregar lista já com datas de criação
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
        return (lista || []).filter((reg) => {
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome))
                return false;
            if (filtroDe || filtroAte) {
                const base = (criacaoMap[reg.sepultamento_id] || "").substring(0, 10);
                if (filtroDe && base && base < filtroDe) return false;
                if (filtroAte && base && base > filtroAte) return false;
            }
            return true;
        });
    }, [lista, filtroNome, filtroDe, filtroAte, criacaoMap]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pageItems = filtrados.slice(
        (pagina - 1) * porPagina,
        pagina * porPagina
    );

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

            {/* LISTA em largura total */}
            <ListaRegistros
                registros={pageItems}
                loading={loadingLista}
                pagina={pagina}
                totalPaginas={totalPaginas}
                onPaginaAnterior={() => setPagina((p) => Math.max(1, p - 1))}
                onPaginaProxima={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                selecionadoId={registroSelecionado?.sepultamento_id}
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
