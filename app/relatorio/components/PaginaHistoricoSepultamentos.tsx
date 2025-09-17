"use client";
import React, { useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import ModalDetalheRegistro from "./ModalDetalheRegistro";
import { listarFalecidos, listarLogPorId } from "./Api";
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
    const [registroSelecionado, setRegistroSelecionado] = useState<FalecidoItem | null>(null);

    // análise geral
    const [analiseOpen, setAnaliseOpen] = useState(false);

    // mapa de criação por registro
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

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

    // prefetch da data/hora de criação (primeiro log) para os itens da página
    useEffect(() => {
        (async () => {
            const pendentes = pageItems
                .map((i) => String(i.sepultamento_id))
                .filter((id) => !criacaoMap[id]);

            if (pendentes.length === 0) return;

            const novos: Record<string, string> = {};
            for (const id of pendentes) {
                try {
                    const logs = await listarLogPorId(id);
                    const primeiro = [...logs].sort((a, b) =>
                        (a.datahora || "").localeCompare(b.datahora || "")
                    )[0]?.datahora;
                    if (primeiro) novos[id] = primeiro;
                } catch {
                    // silencia falha individual
                }
            }
            if (Object.keys(novos).length) {
                setCriacaoMap((prev) => ({ ...prev, ...novos }));
            }
        })();
    }, [pageItems, criacaoMap]);

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
                onChangeNome={(v) => { setFiltroNome(v); setPagina(1); }}
                onChangeDe={(v) => { setFiltroDe(v); setPagina(1); }}
                onChangeAte={(v) => { setFiltroAte(v); setPagina(1); }}
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
