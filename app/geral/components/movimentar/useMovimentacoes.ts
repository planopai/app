"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import { clampInt, maskBRLInput, parseBRLToNumber } from "../formato";
import { brl } from "../produtos/useAbaProdutos";
import { useBuscaLista, type OpcaoBusca } from "../ui/BuscaLista";
import type { ConfeccaoPreviewResp, HistoricoResp, HistoricoRow, ID, Produto } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";

// Movimentações (repaginada): Transferência, Entrada e Confecção na própria aba, com a confirmação numa janela.
// A Saída manual saiu da tela (as saídas acontecem pelo atendimento e pelas requisições).

export type Operacao = "transf" | "entrada" | "confeccao";
type ItemFila = { k: number; id: ID; n: string; cb: string; q: number; cu: number };
type Insumo = { id: ID; q: number };

const OPS: Array<{ k: Operacao; l: string; d: string }> = [
    { k: "transf", l: "Transferência", d: "Leva o material de um depósito para outro" },
    { k: "entrada", l: "Entrada", d: "Compra ou reposição, com preço de custo e frete" },
    { k: "confeccao", l: "Confecção", d: "Kit lanche, coroas e outros itens feitos na casa" },
];
const ROTULO: Record<Operacao, string> = { transf: "transferência", entrada: "entrada", confeccao: "confecção" };

const hhmm = (iso: string) => {
    const d = new Date(String(iso).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function useMovimentacoes(n: EstoqueDados, avisar: (t: string) => void) {
    const { depositos, usuarios, me, produtosAtivos, prodById, saldosMap, refreshInit, custosMediosMoveis } = n;

    const [op, setOp] = useState<Operacao>("transf");
    const [erro, setErro] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirmar, setConfirmar] = useState(false);
    const [scan, setScan] = useState(false);
    const seq = useRef(1);

    const depId = (nome: string) => depositos.find((d) => d.nome.toUpperCase() === nome)?.id ?? null;
    const [orig, setOrig] = useState<ID | null>(null);
    const [dest, setDest] = useState<ID | null>(null);
    const [sol, setSol] = useState<ID | null>(null);
    const [depE, setDepE] = useState<ID | null>(null);
    const [cfOri, setCfOri] = useState<ID | null>(null);
    const [cfDes, setCfDes] = useState<ID | null>(null);

    // Padrões do mockup: Almoxarifado → Memorial; entrada no Almoxarifado; solicitante = quem está usando.
    useEffect(() => {
        if (!depositos.length) return;
        setOrig((v) => v ?? depId("ALMOXARIFADO") ?? depositos[0].id);
        setDest((v) => v ?? depId("MEMORIAL"));
        setDepE((v) => v ?? depId("ALMOXARIFADO") ?? depositos[0].id);
        setCfOri((v) => v ?? depId("ALMOXARIFADO") ?? depositos[0].id);
        setCfDes((v) => v ?? depId("MEMORIAL"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depositos]);
    useEffect(() => {
        if (me && sol == null) setSol(me.id);
    }, [me, sol]);

    const [prod, setProd] = useState<ID | null>(null);
    const [qtd, setQtd] = useState("1");
    const [custoU, setCustoU] = useState("");
    const [frete, setFrete] = useState("");
    const [obs, setObs] = useState("");
    const [fila, setFila] = useState<Record<"transf" | "entrada", ItemFila[]>>({ transf: [], entrada: [] });

    const saldo = (pid: ID, dep: ID | null) => (dep ? clampInt(saldosMap.get(`${pid}::${dep}`)?.quantidade ?? 0) : 0);
    const custoMedio = (pid: ID) => {
        const c = Number(custosMediosMoveis[Number(pid)]?.custo_medio);
        if (Number.isFinite(c) && c > 0) return c;
        return Number(prodById.get(pid)?.preco_custo) || 0;
    };
    const nomeDep = (id: ID | null) => depositos.find((d) => Number(d.id) === Number(id))?.nome || "";

    const filaAtual = op === "confeccao" ? [] : fila[op];
    const naFila = (pid: ID) => filaAtual.filter((i) => Number(i.id) === Number(pid)).reduce((a, i) => a + i.q, 0);

    const depsOpc = (excl?: ID | null): OpcaoBusca[] => depositos.filter((d) => Number(d.id) !== Number(excl)).map((d) => ({ id: d.id, n: d.nome }));

    const cbOrig = useBuscaLista(depsOpc(), orig, (id) => {
        if (id == null) return;
        setOrig(Number(id));
        setFila((f) => ({ ...f, transf: [] }));
        setProd(null);
        if (Number(id) === Number(dest)) setDest(null);
    });
    const cbDest = useBuscaLista(depsOpc(orig), dest, (id) => id != null && setDest(Number(id)));
    const cbSol = useBuscaLista(usuarios.map((u) => ({ id: u.id, n: u.nome })), sol, (id) => id != null && setSol(Number(id)));
    const cbDepE = useBuscaLista(depsOpc(), depE, (id) => id != null && setDepE(Number(id)));

    const prodItens: OpcaoBusca[] = useMemo(() => {
        if (op === "entrada") return produtosAtivos.map((p) => ({ id: p.id, n: p.nome, busca: p.codigo_barras, info: `saldo ${saldo(p.id, depE)}` }));
        return produtosAtivos
            .map((p) => ({ p, s: saldo(p.id, orig) - naFila(p.id) }))
            .filter((x) => x.s > 0)
            .map(({ p, s }) => ({ id: p.id, n: p.nome, busca: p.codigo_barras, info: `saldo ${s}` }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [op, produtosAtivos, saldosMap, orig, depE, filaAtual]);
    const cbProd = useBuscaLista(prodItens, prod, (id) => setProd(id == null ? null : Number(id)));

    function addItem() {
        const p = prod ? prodById.get(prod) : undefined;
        const qt = clampInt(qtd || "1");
        if (!p) return setErro("Digite parte do nome e escolha o produto na lista.");
        if (qt <= 0) return setErro("Informe a quantidade.");
        if (op === "transf") {
            if (!orig) return setErro("Escolha a origem.");
            if (qt > saldo(p.id, orig) - naFila(p.id)) return setErro(`Quantidade maior que o saldo de ${p.nome} em ${nomeDep(orig)}.`);
        }
        const cu = parseBRLToNumber(custoU);
        if (op === "entrada" && cu <= 0) return setErro("O preço de custo por unidade é obrigatório.");
        if (op === "confeccao") return;
        setFila((f) => ({ ...f, [op]: [...f[op], { k: seq.current++, id: p.id, n: p.nome, cb: p.codigo_barras, q: qt, cu: op === "entrada" ? cu : 0 }] }));
        setProd(null);
        setQtd("1");
        setCustoU("");
        setErro("");
    }

    function lerCodigo(codigo: string) {
        const p = produtosAtivos.find((x) => String(x.codigo_barras).trim() === codigo.trim());
        if (!p) return setErro(`Código ${codigo} não encontrado.`);
        if (op === "confeccao") {
            setCfIns(p.id);
        } else {
            setProd(p.id);
        }
        setErro("");
    }

    const unid = (fila.entrada || []).reduce((a, i) => a + i.q, 0);
    const freteTotal = parseBRLToNumber(frete);
    const freteU = unid ? freteTotal / unid : 0;
    const totEntrada = fila.entrada.reduce((a, i) => a + (i.cu + freteU) * i.q, 0);

    const filaRows = filaAtual.map((i) => {
        const fin = i.cu + freteU;
        return {
            k: i.k,
            n: i.n,
            q: String(i.q),
            sd: String(saldo(i.id, op === "entrada" ? depE : orig)),
            base: brl(i.cu),
            fu: brl(freteU),
            fin: brl(fin),
            tot: brl(fin * i.q),
            rm: () => setFila((f) => (op === "confeccao" ? f : { ...f, [op]: f[op].filter((x) => x.k !== i.k) })),
        };
    });

    // ===== Confecção =====
    const [cfProd, setCfProd] = useState<ID | null>(null);
    const [cfIns, setCfIns] = useState<ID | null>(null);
    const [cfInsQ, setCfInsQ] = useState("1");
    const [cfItens, setCfItens] = useState<Insumo[]>([]);
    const [cfQtd, setCfQtd] = useState("");
    const [preview, setPreview] = useState<ConfeccaoPreviewResp | null>(null);

    const cbCfOri = useBuscaLista(depsOpc(), cfOri, (id) => {
        if (id == null) return;
        setCfOri(Number(id));
        setCfItens([]);
        setCfIns(null);
    });
    const cbCfDes = useBuscaLista(depsOpc(), cfDes, (id) => id != null && setCfDes(Number(id)));
    const confeccionados = produtosAtivos.filter((p) => Number(p.confeccionado_casa || 0) === 1);
    const cbCfProd = useBuscaLista(
        confeccionados.map((p) => ({ id: p.id, n: p.nome, busca: p.codigo_barras, info: p.categoria_nome || "" })),
        cfProd,
        (id) => setCfProd(id == null ? null : Number(id))
    );
    const cbIns = useBuscaLista(
        produtosAtivos
            .filter((p) => Number(p.id) !== Number(cfProd) && saldo(p.id, cfOri) > 0)
            .map((p) => ({ id: p.id, n: p.nome, busca: p.codigo_barras, info: `saldo ${saldo(p.id, cfOri)}` })),
        cfIns,
        (id) => setCfIns(id == null ? null : Number(id))
    );

    function addInsumo() {
        const p = cfIns ? prodById.get(cfIns) : undefined;
        const qt = clampInt(cfInsQ || "1");
        if (!p || qt <= 0) return setErro("Digite parte do nome do insumo, escolha na lista e informe a quantidade usada.");
        setCfItens((a) => {
            const ix = a.findIndex((x) => Number(x.id) === Number(p.id));
            if (ix >= 0) return a.map((x, j) => (j === ix ? { id: x.id, q: x.q + qt } : x));
            return [...a, { id: p.id, q: qt }];
        });
        setCfIns(null);
        setCfInsQ("1");
        setErro("");
    }

    const cfQ = clampInt(cfQtd);
    const cfP = cfProd ? prodById.get(cfProd) || null : null;

    // Custo real dos insumos (FIFO) calculado pelo servidor; enquanto não chega, usa o custo médio.
    useEffect(() => {
        if (op !== "confeccao" || !cfP || !cfItens.length || !cfOri || !cfDes) {
            setPreview(null);
            return;
        }
        let cancelado = false;
        const t = window.setTimeout(async () => {
            try {
                const r = await apiPost<ConfeccaoPreviewResp>({
                    action: "confeccao_preview",
                    tipo: "PRODUTO",
                    produto_final_id: cfP.id,
                    deposito_insumos_id: cfOri,
                    deposito_destino_id: cfDes,
                    quantidade: Math.max(1, cfQ),
                    insumos: cfItens.map((i) => ({ produto_id: i.id, quantidade: i.q })),
                });
                if (!cancelado) setPreview(r.ok ? r : null);
            } catch {
                if (!cancelado) setPreview(null);
            }
        }, 300);
        return () => {
            cancelado = true;
            window.clearTimeout(t);
        };
    }, [op, cfP, cfItens, cfOri, cfDes, cfQ]);

    const cfRows = cfItens.map((i, ix) => {
        const p = prodById.get(i.id) as Produto;
        const sd = saldo(i.id, cfOri);
        const pv = preview?.itens?.find((x) => Number(x.produto_id) === Number(i.id) && x.quantidade_total === i.q);
        const total = pv ? Number(pv.custo_total_previsto) || 0 : custoMedio(i.id) * i.q;
        return {
            k: String(i.id),
            n: p?.nome || `#${i.id}`,
            q: String(i.q),
            sd: String(sd),
            falta: i.q > sd,
            ok: i.q <= sd,
            cu: brl(i.q ? total / i.q : 0),
            custo: brl(total),
            raw: total,
            onQ: (e: React.ChangeEvent<HTMLInputElement>) => {
                const q = clampInt(e.target.value.replace(/\D/g, ""));
                setCfItens((a) => a.map((x, j) => (j === ix ? { id: x.id, q } : x)));
            },
            rm: () => setCfItens((a) => a.filter((_, j) => j !== ix)),
        };
    });
    const cfCusto = cfRows.reduce((a, r) => a + r.raw, 0);
    const cfOk = !!cfP && cfItens.length > 0 && cfItens.every((i) => i.q > 0) && cfQ > 0 && cfRows.every((r) => r.ok) && !!cfOri && !!cfDes;

    // Confecções registradas (vêm do histórico)
    const [cfHist, setCfHist] = useState<HistoricoRow[]>([]);
    const [cfAberto, setCfAberto] = useState<number | null>(null);
    async function carregarConfeccoes() {
        try {
            const r = await apiGet<HistoricoResp>({ historico: 1, tipo: "CONFECCAO", limit: 30 });
            if (r.ok) setCfHist(r.rows || []);
        } catch {
            /* a lista é só consulta */
        }
    }
    const cfHistRows = cfHist.map((h) => {
        const q = clampInt(h.quantidade);
        const tot = Number(h.custo_total_snapshot) || 0;
        const id = Number(h.confeccao_id || 0);
        return {
            id,
            cod: `CONFECÇÃO #${id}`,
            dt: hhmm(h.criado_em),
            n: h.produto_nome || "",
            q: String(q),
            de: h.deposito_origem_nome || "",
            dep: h.deposito_destino_nome || "",
            u: h.operador_nome || "",
            tot: brl(tot),
            un: brl(q ? tot / q : 0),
            aberto: cfAberto === id,
            go: () => setCfAberto(cfAberto === id ? null : id),
            itens: (h.insumos || []).map((x) => {
                const ct = Number(x.custo_total) || 0;
                return { n: x.nome, q: String(x.quantidade), cu: brl(x.quantidade ? ct / x.quantidade : 0), t: brl(ct) };
            }),
        };
    });

    // ===== Concluir =====
    const podeConcluir = op === "confeccao" ? cfOk : filaAtual.length > 0;
    const pedirConcluir = () => {
        if (op === "transf" && (!orig || !dest || !sol)) return setErro("Escolha origem, destino e solicitante.");
        if (op === "entrada" && !depE) return setErro("Escolha o local de entrada.");
        if (!podeConcluir) return setErro(op === "confeccao" ? "Escolha o produto, adicione os insumos e informe quantos ficaram prontos." : "Adicione pelo menos um item.");
        setErro("");
        setConfirmar(true);
    };

    function limpar() {
        if (op !== "confeccao") setFila((f) => ({ ...f, [op]: [] }));
        setObs("");
        setFrete("");
        setErro("");
        setCfItens([]);
        setCfQtd("");
        setCfProd(null);
    }

    async function confirmarMov() {
        setBusy(true);
        setErro("");
        try {
            if (op === "transf") {
                const r = await apiPost<{ ok: boolean; msg?: string; codigo?: string }>({
                    action: "transferencia_lote",
                    deposito_origem_id: orig,
                    deposito_destino_id: dest,
                    solicitante_usuario_id: sol,
                    observacao: obs.trim(),
                    itens: fila.transf.map((i) => ({ produto_id: i.id, quantidade: i.q })),
                });
                if (!r.ok) throw new Error(r.msg || "Falha na transferência.");
                setFila((f) => ({ ...f, transf: [] }));
                avisar(`${r.codigo || "Transferência"} registrada.`);
            } else if (op === "entrada") {
                const r = await apiPost<{ ok: boolean; msg?: string; codigo?: string }>({
                    action: "entrada_lote",
                    deposito_id: depE,
                    frete_total: freteTotal,
                    observacao: obs.trim(),
                    itens: fila.entrada.map((i) => ({ codigo_barras: i.cb, quantidade: i.q, custo_unitario: i.cu })),
                });
                if (!r.ok) throw new Error(r.msg || "Falha na entrada.");
                setFila((f) => ({ ...f, entrada: [] }));
                setFrete("");
                avisar(`${r.codigo || "Entrada"} registrada.`);
            } else {
                const r = await apiPost<{ ok: boolean; msg?: string; confeccao_id?: number }>({
                    action: "confeccao",
                    tipo: "PRODUTO",
                    produto_final_id: cfP?.id,
                    deposito_insumos_id: cfOri,
                    deposito_destino_id: cfDes,
                    quantidade: cfQ,
                    insumos: cfItens.map((i) => ({ produto_id: i.id, quantidade: i.q })),
                    observacao: obs.trim(),
                });
                if (!r.ok) throw new Error(r.msg || "Falha na confecção.");
                setCfItens([]);
                setCfQtd("");
                setCfProd(null);
                setCfAberto(r.confeccao_id ?? null);
                avisar(`CONFECÇÃO #${r.confeccao_id ?? ""} registrada.`);
                void carregarConfeccoes();
            }
            setObs("");
            setConfirmar(false);
            await refreshInit();
        } catch (e: unknown) {
            setConfirmar(false);
            setErro(e instanceof Error ? e.message : "Erro ao registrar.");
        } finally {
            setBusy(false);
        }
    }

    // Resumo da janela de confirmação
    const resumoConf = filaAtual.map((i) => ({ n: i.n, q: String(i.q) }));
    const cmovSecs =
        op === "confeccao" && cfP
            ? [
                  { t: "Entrada", itens: [{ n: `${cfP.nome} (${nomeDep(cfDes)})`, q: String(cfQ) }] },
                  { t: "Saída", itens: cfItens.map((i) => ({ n: `${prodById.get(i.id)?.nome || ""} (${nomeDep(cfOri)})`, q: String(i.q) })) },
              ].filter((s) => s.itens.length)
            : [];
    const linhaConf =
        op === "transf"
            ? `${nomeDep(orig)} → ${nomeDep(dest)}`
            : op === "entrada"
              ? `Entra em ${nomeDep(depE)} · total ${brl(totEntrada)}`
              : cfP
                ? `${cfQ} × ${cfP.nome} entram em ${nomeDep(cfDes)} a ${brl(cfQ ? cfCusto / cfQ : 0)} por unidade`
                : "";

    return {
        ops: OPS.map((o) => ({ ...o, sel: o.k === op, go: () => (setOp(o.k), setErro(""), setProd(null), setQtd("1"), setCustoU("")) })),
        op,
        isT: op === "transf",
        isE: op === "entrada",
        isC: op === "confeccao",
        notC: op !== "confeccao",
        opTitulo: { transf: "Transferência", entrada: "Entrada", confeccao: "Confecção" }[op],
        erro,
        busy,
        cbOrig,
        cbDest,
        cbSol,
        cbDepE,
        cbProd,
        cbCfOri,
        cbCfDes,
        cbCfProd,
        cbIns,
        qtd,
        onQtd: (e: React.ChangeEvent<HTMLInputElement>) => setQtd(e.target.value.replace(/\D/g, "")),
        custoU,
        onCustoU: (e: React.ChangeEvent<HTMLInputElement>) => setCustoU(maskBRLInput(e.target.value)),
        frete,
        onFrete: (e: React.ChangeEvent<HTMLInputElement>) => setFrete(maskBRLInput(e.target.value)),
        freteU: brl(freteU),
        unid: String(unid),
        obs,
        onObs: (e: React.ChangeEvent<HTMLInputElement>) => setObs(e.target.value),
        addItem,
        abrirLeitor: () => setScan(true),
        scan,
        fecharLeitor: () => setScan(false),
        lerCodigo,
        filaRows,
        filaVazia: filaAtual.length === 0,
        temFila: filaAtual.length > 0,
        nFila: `${filaAtual.length} ${filaAtual.length === 1 ? "item" : "itens"}`,
        totEntrada: brl(totEntrada),
        limparMov: limpar,
        concluirLbl: `Concluir ${ROTULO[op]}`,
        pedirConcluir,
        concluirOff: !podeConcluir || busy,
        cmov: confirmar,
        fecharCmov: () => setConfirmar(false),
        confirmarMov,
        cmovTitulo: `Confirmar ${ROTULO[op]}`,
        resumoConf,
        cmovQ: op !== "confeccao",
        cmovES: op === "confeccao",
        cmovSecs,
        linhaConf,
        // confecção
        temCfP: !!cfP,
        semConfeccionados: confeccionados.length === 0,
        cfInsQ,
        onCfInsQ: (e: React.ChangeEvent<HTMLInputElement>) => setCfInsQ(e.target.value.replace(/\D/g, "")),
        addInsumo,
        cfRows,
        cfVazio: cfItens.length === 0,
        cfTem: cfItens.length > 0,
        cfQtd,
        onCfQtd: (e: React.ChangeEvent<HTMLInputElement>) => setCfQtd(e.target.value.replace(/\D/g, "")),
        cfCusto: brl(cfCusto),
        cfUn: cfQ > 0 ? brl(cfCusto / cfQ) : "—",
        cfHistRows,
        carregarConfeccoes,
    };
}

export type MovimentacoesV = ReturnType<typeof useMovimentacoes>;
