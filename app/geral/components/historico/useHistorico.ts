"use client";

import { useMemo, useState } from "react";
import { apiGet } from "../api";
import { clampInt } from "../formato";
import { brl } from "../produtos/useAbaProdutos";
import { normalizar } from "../ui/BuscaLista";
import type { HistoricoResp, HistoricoRow } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";

// Histórico por lançamento (repaginada): cada linha é um lançamento com os seus itens.
// Junta pelo código do lançamento (TRF-, ENT-, AJ-), pela requisição (REQ-), pelo atendimento e pela confecção;
// os movimentos antigos sem código continuam juntos pelo mesmo segundo, tipo, pessoas, locais e observação.

type Tipo = "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "CONFECCAO" | "AJUSTE";
type Item = { n: string; q: number | null; local?: string; cu?: number | null };
type Lancamento = { chave: string; cod: string; sub?: string; t: Tipo; o: string; d: string; u: string; quando: string; itens: Item[]; frete: number };

const ROTULO: Record<Tipo, string> = { ENTRADA: "Entrada", SAIDA: "Saída", TRANSFERENCIA: "Transferência", CONFECCAO: "Confecção", AJUSTE: "Ajuste" };
const TIPOS: Array<"TODOS" | Tipo> = ["TODOS", "ENTRADA", "SAIDA", "TRANSFERENCIA", "CONFECCAO", "AJUSTE"];

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
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState("");
    const [tipo, setTipo] = useState<"TODOS" | Tipo>("TODOS");
    const [busca, setBusca] = useState("");
    const [aberto, setAberto] = useState("");

    async function carregar() {
        setCarregando(true);
        setErro("");
        try {
            const r = await apiGet<HistoricoResp>({ historico: 1, limit: 500 });
            if (!r.ok) throw new Error(r.msg || "Falha ao carregar o histórico.");
            setRows(r.rows || []);
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico.");
        } finally {
            setCarregando(false);
        }
    }

    const lancamentos = useMemo(() => agrupar(rows), [rows]);
    const termo = normalizar(busca).trim();

    const histRows = lancamentos
        .filter((l) => tipo === "TODOS" || l.t === tipo)
        .filter((l) => !termo || normalizar(`${l.cod} ${l.sub || ""} ${l.o} ${l.d} ${l.u} ${l.itens.map((i) => i.n).join(" ")}`).includes(termo))
        .map((l) => {
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

    return {
        carregar,
        carregando,
        erro,
        htipos: TIPOS.map((k) => ({ k, l: k === "TODOS" ? "Todos" : ROTULO[k], sel: tipo === k, go: () => setTipo(k) })),
        hb: busca,
        onHb: (e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value),
        histRows,
        vazioHist: !carregando && histRows.length === 0,
    };
}

export type HistoricoV = ReturnType<typeof useHistorico>;
