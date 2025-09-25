"use client";
import React, { useEffect, useMemo, useState } from "react";
import BarraFiltros from "./BarraFiltros";
import ListaRegistros from "./ListaRegistros";
import ModalAnaliseGeral from "./ModalAnaliseGeral";
import ModalDetalheRegistro from "./ModalDetalheRegistro";
import { listarFalecidosComCriacao, listarAnalitico } from "./Api";
import { FalecidoItem } from "./TiposHistorico";

/* ===== utils simples de data ===== */
function toDate(d?: string | null): Date | null {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
}
function inRange(regDate: Date | null, de?: string, ate?: string): boolean {
    if (!regDate) return false;
    const d0 = de ? toDate(de) : null;
    const d1 = ate ? toDate(ate) : null;
    if (d0 && regDate < d0) return false;
    if (d1) {
        const end = new Date(d1);
        end.setHours(23, 59, 59, 999);
        if (regDate > end) return false;
    }
    return true;
}
const norm = (v?: string | null) => (v ? String(v).trim() : "");

export default function PaginaHistoricoSepultamentos() {
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);

    // filtros da lista
    const [pagina, setPagina] = useState(1);
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");

    // modal de detalhes
    const [modalAberto, setModalAberto] = useState(false);
    const [registroSelecionado, setRegistroSelecionado] = useState<FalecidoItem | null>(null);

    // ====== ESTADO DO MODAL DE ANÁLISE ======
    const [analiseOpen, setAnaliseOpen] = useState(false);

    // período padrão: mês atual
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");

    const [aDe, setADe] = useState(`${yyyy}-${mm}-01`);
    const [aAte, setAAte] = useState(`${yyyy}-${mm}-${dd}`);
    const [somenteTanato, setSomenteTanato] = useState(false);

    // mapa de criação por registro (lista principal)
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

    // carregar lista (com data de criação)
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
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) return false;
            if (filtroDe || filtroAte) {
                const base = (criacaoMap[reg.sepultamento_id] || "").substring(0, 10);
                if (filtroDe && base && base < filtroDe) return false;
                if (filtroAte && base && base > filtroAte) return false;
            }
            return true;
        });
    }, [lista, filtroNome, filtroDe, filtroAte, criacaoMap]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pageItems = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

    function abrirModal(item: FalecidoItem) {
        setRegistroSelecionado(item);
        setModalAberto(true);
    }

    // (opcional) se você ainda usa este carregamento para outra coisa
    async function carregarAnalise() {
        // aqui você pode manter se quiser pré-carregar algo
        await listarAnalitico();
    }

    // quando abrir o modal de análise, pode disparar um preload se desejar
    useEffect(() => {
        if (!analiseOpen) return;
        carregarAnalise();
    }, [analiseOpen, aDe, aAte, somenteTanato]);

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
                selecionadoId={registroSelecionado?.sepultamento_id}
                onSelecionar={abrirModal}
                criacaoMap={criacaoMap}
            />

            <ModalDetalheRegistro
                aberto={modalAberto}
                registro={registroSelecionado}
                onFechar={() => setModalAberto(false)}
            />

            {/* Chamada compatível com o ModalAnaliseGeral atualizado */}
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
