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

/* ===== mapeamento de campos que virão do informativo.php?listar=1 =====
   Ajuste aqui se o backend tiver nomes diferentes */
const CAMPOS = [
    { campo: "tanato", tipo: "Tanatopraxia", keyPrefix: "tanato" },
    { campo: "ornamentacao", tipo: "Ornamentação", keyPrefix: "ornamentacao" },
    { campo: "urna", tipo: "Urna", keyPrefix: "urna" },
    { campo: "assistencia", tipo: "Assistência", keyPrefix: "assistencia" },
    { campo: "local_velorio", tipo: "Local do Velório", keyPrefix: "local_velorio" },
] as const;
type Row = { key: string; item: string; tipo: string; quantidade: number };
type Evento = { nome: string; data: string; itemKey?: string };

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
    const [selectedItem, setSelectedItem] = useState<string | undefined>(undefined);

    const [rows, setRows] = useState<Row[]>([]);
    const [registrosComEventoNoPeriodo, setRegistrosComEventoNoPeriodo] = useState(0);
    const [listaTanatoPeriodo, setListaTanatoPeriodo] = useState<Evento[]>([]);
    const [loadingAnalise, setLoadingAnalise] = useState(false);

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

    // ===== carregador do ANALÍTICO =====
    async function carregarAnalise() {
        setLoadingAnalise(true);
        try {
            const lista = await listarAnalitico(); // -> /api/php/informativo.php?listar=1
            // filtra por período
            const filtrados = (lista || []).filter((r: any) => {
                // prioridade: r.data; se vazio, tenta data_inicio_velorio
                const dx = norm(r.data) || norm(r.data_inicio_velorio);
                return inRange(toDate(dx), aDe, aAte);
            });

            const counter = new Map<string, Row>();
            const eventosTanato: Evento[] = [];

            for (const r of filtrados) {
                for (const cfg of CAMPOS) {
                    const valor = norm(r[cfg.campo as keyof typeof r] as any);
                    if (!valor) continue;
                    if (somenteTanato && cfg.campo !== "tanato") continue;

                    const key = `${cfg.keyPrefix}|${valor}`;
                    const prev = counter.get(key);
                    if (prev) prev.quantidade += 1;
                    else counter.set(key, { key, item: valor, tipo: cfg.tipo, quantidade: 1 });

                    if (cfg.campo === "tanato") {
                        const nome = norm(r.falecido) || "(Sem nome)";
                        const dataStr = norm(r.data) || norm(r.data_inicio_velorio) || "";
                        eventosTanato.push({ nome, data: dataStr, itemKey: key });
                    }
                }
            }

            const linhas = Array.from(counter.values()).sort((a, b) => {
                if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
                if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
                return a.item.localeCompare(b.item);
            });

            setRows(linhas);
            setRegistrosComEventoNoPeriodo(filtrados.length);
            setListaTanatoPeriodo(eventosTanato);
        } catch (e) {
            console.error("Falha ao carregar análise:", e);
            setRows([]);
            setRegistrosComEventoNoPeriodo(0);
            setListaTanatoPeriodo([]);
        } finally {
            setLoadingAnalise(false);
        }
    }

    // quando abrir o modal e sempre que filtro do modal mudar, recarrega
    useEffect(() => {
        if (!analiseOpen) return;
        setSelectedItem(undefined);
        carregarAnalise();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            {/* Agora o modal recebe DADOS de verdade */}
            <ModalAnaliseGeral
                aberto={analiseOpen}
                onFechar={() => setAnaliseOpen(false)}
                aDe={aDe}
                aAte={aAte}
                setADe={setADe}
                setAAte={setAAte}
                somenteTanato={somenteTanato}
                setSomenteTanato={setSomenteTanato}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                rows={rows}
                registrosComEventoNoPeriodo={registrosComEventoNoPeriodo}
                listaTanatoPeriodo={listaTanatoPeriodo}
                loading={loadingAnalise}
                onRecarregar={carregarAnalise}
            />
        </div>
    );
}
