"use client";



import { useEffect, useMemo, useRef, useState } from "react";

import { apiGet } from "../api";

import { clampInt } from "../formato";

import { brl } from "../produtos/useAbaProdutos";

import type { HistoricoResp, HistoricoRow } from "../tipos";

import type { EstoqueDados } from "../useEstoqueDados";



// Histórico por lançamento (repaginada): cada linha é um lançamento com os seus itens.

// Junta pelo código do lançamento (TRF-, ENT-, AJ-), pela requisição (REQ-), pelo atendimento e pela confecção;

// os movimentos antigos sem código continuam juntos pelo mesmo segundo, tipo, pessoas, locais e observação.

// Período (De/Até) e paginação (09/10/2026): o servidor filtra por data, tipo e busca e devolve uma página

// de POR_PAGINA movimentos com o total; antes a tela pegava só os 500 mais recentes.



type Tipo = "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "CONFECCAO" | "AJUSTE";

type Item = { n: string; q: number | null; local?: string; cu?: number | null };

type Lancamento = { chave: string; cod: string; sub?: string; t: Tipo; o: string; d: string; u: string; quando: string; itens: Item[]; frete: number };



const ROTULO: Record<Tipo, string> = { ENTRADA: "Entrada", SAIDA: "Saída", TRANSFERENCIA: "Transferência", CONFECCAO: "Confecção", AJUSTE: "Ajuste" };

const TIPOS: Array<"TODOS" | Tipo> = ["TODOS", "ENTRADA", "SAIDA", "TRANSFERENCIA", "CONFECCAO", "AJUSTE"];



const POR_PAGINA = 100;

type Periodo = "HOJE" | "7D" | "MES" | "TUDO";

const PERIODOS: Array<[Periodo, string]> = [

    ["HOJE", "Hoje"],

    ["7D", "7 dias"],

    ["MES", "Mês"],

    ["TUDO", "Tudo"],

];

type Filtros = { tipo: "TODOS" | Tipo; busca: string; ini: string; fim: string; offset: number };

type RespPaginada = HistoricoResp & { total?: number };



// Data local (AAAA-MM-DD). Não usa toISOString: depois das 21h na Bahia ele já daria o dia seguinte.

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function intervalo(p: Periodo): { ini: string; fim: string } {

    const hoje = new Date();

    if (p === "TUDO") return { ini: "", fim: "" };

    if (p === "HOJE") return { ini: isoLocal(hoje), fim: isoLocal(hoje) };

    if (p === "7D") return { ini: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)), fim: isoLocal(hoje) };

    return { ini: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: isoLocal(hoje) };

}

// O chip Ajuste também mostra os cadastros de produto (agrupar() trata CADASTRO_PRODUTO como AJUSTE).

const tipoApi = (t: Filtros["tipo"]) => (t === "TODOS" ? undefined : t === "AJUSTE" ? "AJUSTE,CADASTRO_PRODUTO" : t);

const milhar = (x: number) => x.toLocaleString("pt-BR");



const segundo = (iso: string) => String(iso || "").slice(0, 19);

const quando = (iso: string) => {

    const d = new Date(String(iso).replace(" ", "T"));

    if (Number.isNaN(d.getTime())) return iso;

    const p = (x: number) => String(x).padStart(2, "0");

    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;

};

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (w) => w.toLowerCase());



function agrupar(rows: HistoricoRow[]): Lancamento[] {

    const mapa = new Map<string, Lancamento>();

    const ordem: string[] = [];



    for (const h of rows) {

        const tipo = (h.tipo === "CADASTRO_PRODUTO" ? "AJUSTE" : h.tipo) as Tipo;

        const dest = String(h.destino_texto || "");

        const req = dest.match(/^(REQ-\d+)/);

        const atend = dest.match(/^Atendimento #(\d+)/i);

        const q = h.quantidade == null ? null : Number(h.quantidade);

        let chave: string;

        let base: Omit<Lancamento, "itens" | "frete">;



        if (h.tipo === "CONFECCAO") {

            const id = Number(h.confeccao_id || -h.id);

            chave = `CF:${id}`;

            base = { chave, cod: `CONFECÇÃO #${id}`, t: "CONFECCAO", o: h.deposito_origem_nome || "", d: h.deposito_destino_nome || "", u: h.operador_nome || "", quando: h.criado_em };

            const itens: Item[] = [{ n: h.produto_nome || "", q: clampInt(h.quantidade) }, ...(h.insumos || []).map((x) => ({ n: x.nome, q: -clampInt(x.quantidade) }))];

            mapa.set(chave, { ...base, itens, frete: 0 });

            ordem.push(chave);

            continue;

        } else if (h.lancamento_codigo) {

            chave = `L:${h.lancamento_codigo}`;

            base = { chave, cod: h.lancamento_codigo, t: tipo, o: h.deposito_origem_nome || "", d: h.deposito_destino_nome || "", u: h.operador_nome || "", quando: h.criado_em };

        } else if (req) {

            chave = `R:${req[1]}:${h.tipo}`;

            const resto = dest.replace(/^REQ-\d+\s*-\s*/, "");

            const destino = h.deposito_destino_nome || (/transfer/i.test(resto) ? "" : resto);

            base = { chave, cod: req[1], t: tipo, o: h.deposito_origem_nome || "", d: destino, u: h.operador_nome || "", quando: h.criado_em };

        } else if (atend && h.tipo === "SAIDA") {

            chave = `A:${atend[1]}:${segundo(h.criado_em)}`;

            const fal = String(h.observacao || "").match(/Falecido\(a\):\s*([^|]+)/i);

            base = { chave, cod: fal ? `Atendimento: ${titulo(fal[1].trim())}` : `Atendimento #${atend[1]}`, sub: `Atendimento #${atend[1]}`, t: "SAIDA", o: "", d: "", u: h.operador_nome || "", quando: h.criado_em };

        } else if (tipo === "AJUSTE" && (q == null || h.tipo === "CADASTRO_PRODUTO")) {

            chave = `C:${segundo(h.criado_em)}:${h.operador_usuario_id}:${h.tipo}`;

            base = { chave, cod: "Cadastro", t: "AJUSTE", o: "", d: h.tipo === "CADASTRO_PRODUTO" ? "Novo produto" : String(h.observacao || "Atualização de cadastro").replace(/\.$/, ""), u: h.operador_nome || "", quando: h.criado_em };

        } else {

            chave = ["M", h.tipo, segundo(h.criado_em), h.operador_usuario_id || 0, h.solicitante_usuario_id || 0, h.deposito_origem_id || 0, h.deposito_destino_id || 0, dest, h.observacao || ""].join("|");

            base = { chave, cod: `#${h.id}`, t: tipo, o: h.deposito_origem_nome || "", d: h.deposito_destino_nome || dest, u: h.operador_nome || "", quando: h.criado_em };

        }



        let l = mapa.get(chave);

        if (!l) {

            l = { ...base, itens: [], frete: 0 };

            mapa.set(chave, l);

            ordem.push(chave);

        }

        // Mesmo produto em vários lotes do mesmo lançamento vira uma linha só.

        const nome = h.produto_nome || h.codigo_barras_snapshot;

        const local = atend ? h.deposito_origem_nome || "" : undefined;

        const custo = h.tipo === "ENTRADA" && h.custo_unitario_snapshot != null ? Number(h.custo_unitario_snapshot) : null;

        const ja = l.itens.find((i) => i.n === nome && i.local === local && (i.cu ?? null) === custo);

        if (ja && ja.q != null && q != null) ja.q += q;

        else if (!ja || q == null) l.itens.push({ n: nome, q, local, cu: custo });

        if (h.tipo === "ENTRADA") l.frete += Number(h.frete_total_snapshot) || 0;

    }



    return ordem.map((k) => mapa.get(k) as Lancamento);

}



export function useHistorico(n: EstoqueDados) {

    void n;

    const [rows, setRows] = useState<HistoricoRow[]>([]);

    const [total, setTotal] = useState<number | null>(null);

    const [carregando, setCarregando] = useState(false);

    const [erro, setErro] = useState("");

    const [aberto, setAberto] = useState("");

    const [f, setF] = useState<Filtros>(() => ({ tipo: "TODOS", busca: "", ...intervalo("MES"), offset: 0 }));

    const fRef = useRef(f);

    const pedido = useRef(0); // só a última consulta vale (evita a resposta antiga chegar por cima da nova)

    const espera = useRef<ReturnType<typeof setTimeout> | null>(null);



    useEffect(() => () => {

        if (espera.current) clearTimeout(espera.current);

    }, []);



    async function buscar(nf: Filtros) {

        // De depois do Até: troca os dois em vez de mostrar lista vazia.

        if (nf.ini && nf.fim && nf.ini > nf.fim) nf = { ...nf, ini: nf.fim, fim: nf.ini };

        fRef.current = nf;

        setF(nf);

        const id = ++pedido.current;

        setCarregando(true);

        setErro("");

        try {

            const r = await apiGet<RespPaginada>({

                historico: 1,

                limit: POR_PAGINA,

                offset: nf.offset,

                tipo: tipoApi(nf.tipo),

                q: nf.busca.trim() || undefined,

                data_ini: nf.ini || undefined,

                data_fim: nf.fim || undefined,

            });

            if (id !== pedido.current) return;

            if (!r.ok) throw new Error(r.msg || "Falha ao carregar o histórico.");

            setRows(r.rows || []);

            // Sem "total", o materiais_gerais.php do servidor ainda é o antigo (sem período nem páginas).

            if (typeof r.total !== "number" || !Number.isFinite(r.total) || r.total < 0) {
                throw new Error(
                    "A API de Histórico não retornou o total da paginação. " +
                    "Confirme que o materiais_gerais.php atualizado está publicado."
                );
            }
            setTotal(r.total);

            setAberto("");

        } catch (e: unknown) {

            if (id !== pedido.current) return;

            setTotal(null);
            setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico.");

        } finally {

            if (id === pedido.current) setCarregando(false);

        }

    }



    // Chamado pela página ao abrir a aba e no Atualizar: recarrega a página atual com os filtros atuais.

    async function carregar() {

        if (espera.current) clearTimeout(espera.current);

        await buscar(fRef.current);

    }



    // Qualquer filtro novo volta para a primeira página.

    const filtrar = (mud: Partial<Filtros>) => void buscar({ ...fRef.current, ...mud, offset: 0 });



    const onBusca = (e: React.ChangeEvent<HTMLInputElement>) => {

        const valor = e.target.value;

        fRef.current = { ...fRef.current, busca: valor };

        setF(fRef.current);

        if (espera.current) clearTimeout(espera.current);

        espera.current = setTimeout(() => filtrar({ busca: valor }), 400);

    };



    const paginas = total == null ? 1 : Math.max(1, Math.ceil(total / POR_PAGINA));

    const pagina = Math.floor(f.offset / POR_PAGINA) + 1;

    const irPagina = (p: number) => {

        const alvo = Math.min(Math.max(1, p), paginas);

        if (alvo !== pagina) void buscar({ ...fRef.current, offset: (alvo - 1) * POR_PAGINA });

    };

    const periodoAtual = (PERIODOS.find(([k]) => {

        const i = intervalo(k);

        return i.ini === f.ini && i.fim === f.fim;

    }) || [null])[0];



    const lancamentos = useMemo(() => agrupar(rows), [rows]);



    // Tipo e busca já vêm filtrados do servidor; aqui só monta as linhas.

    const histRows = lancamentos.map((l) => {

        const comES = l.t === "CONFECCAO" || (l.t === "AJUSTE" && l.itens.some((i) => i.q != null));

        const comLocal = l.itens.some((i) => !!i.local);

        const comCusto = l.t === "ENTRADA" && l.itens.some((i) => i.cu != null);

        const totQ = l.itens.reduce((a, i) => a + (i.q || 0), 0);

        const totV = l.itens.reduce((a, i) => a + (i.q || 0) * (i.cu || 0), 0);

        return {

            chave: l.chave,

            cod: l.cod,

            tc: `t-${l.t}`,

            tl: ROTULO[l.t],

            rota: l.sub ? l.sub : l.o && l.d ? `${l.o} → ${l.d}` : l.d || l.o,

            comES,

            comLocal: comLocal && !comES,

            comCusto: comCusto && !comES,

            semLocal: !comES && !comLocal && !comCusto,

            totQ: String(totQ),

            totV: brl(totV),

            temFrete: l.frete > 0,

            frete: brl(l.frete),

            u: l.u,

            dt: quando(l.quando),

            n: `${l.itens.length} ${l.itens.length === 1 ? "item" : "itens"}`,

            resumo: l.itens.slice(0, 2).map((i) => i.n).join(", ") + (l.itens.length > 2 ? ` e mais ${l.itens.length - 2}` : ""),

            aberto: aberto === l.chave,

            go: () => setAberto(aberto === l.chave ? "" : l.chave),

            secs: [

                { t: "Entrada", itens: l.itens.filter((i) => (i.q || 0) > 0).map((i) => ({ n: i.n, q: String(i.q) })) },

                { t: "Saída", itens: l.itens.filter((i) => (i.q || 0) < 0).map((i) => ({ n: i.n, q: String(-(i.q || 0)) })) },

            ].filter((s) => s.itens.length),

            itens: l.itens.map((i) => ({

                n: i.n,

                local: i.local || "",

                cu: i.cu != null ? brl(i.cu) : "",

                tot: i.cu != null ? brl(i.cu * (i.q || 0)) : "",

                q: i.q == null ? "—" : String(i.q),

            })),

        };

    });



    const de = rows.length ? f.offset + 1 : 0;

    const ate = f.offset + rows.length;



    return {

        carregar,

        carregando,

        erro,

        htipos: TIPOS.map((k) => ({ k, l: k === "TODOS" ? "Todos" : ROTULO[k], sel: f.tipo === k, go: () => filtrar({ tipo: k }) })),

        hb: f.busca,

        onHb: onBusca,

        histRows,

        vazioHist: !carregando && histRows.length === 0,

        // Período

        hIni: f.ini,

        hFim: f.fim,

        onIni: (e: React.ChangeEvent<HTMLInputElement>) => filtrar({ ini: e.target.value }),

        onFim: (e: React.ChangeEvent<HTMLInputElement>) => filtrar({ fim: e.target.value }),

        hperiodos: PERIODOS.map(([k, l]) => ({ k, l, sel: periodoAtual === k, go: () => filtrar(intervalo(k)) })),

        // Paginação (só aparece com o materiais_gerais.php novo, que devolve o total)

        temPaginas: total != null,

        pagina,

        paginas,

        resumoPag: total == null ? "" : total === 0 ? "Nenhum movimento" : `${milhar(de)}–${milhar(ate)} de ${milhar(total)} ${total === 1 ? "movimento" : "movimentos"}`,

        podeVoltar: !carregando && pagina > 1,

        podeAvancar: !carregando && pagina < paginas,

        voltar: () => irPagina(pagina - 1),

        avancar: () => irPagina(pagina + 1),

        semPeriodoNoServidor: !carregando && !erro && total == null && rows.length > 0,

    };

}



export type HistoricoV = ReturnType<typeof useHistorico>;
