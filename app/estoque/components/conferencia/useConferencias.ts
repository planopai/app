"use client";

import { useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import { clampInt } from "../formato";
import { brl } from "../produtos/useAbaProdutos";
import { normalizar, useBuscaLista } from "../ui/BuscaLista";
import type { ConferenciaDetalheResp, ConferenciaRegistro, ConferenciasListResp, ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";
import { csvConferencia, pdfConferencia } from "./exportarConferencia";

// Conferência por etapas (repaginada): Em contagem → Em revisão → Concluída.
// A contagem salva sozinha. Enquanto a conferência não é concluída, o local fica bloqueado para movimentações.

type Filtro = "todos" | "pend" | "cont" | "div";
type Aberta = { head: ConferenciaRegistro; escopo: Array<{ id: ID; n: string; cb: string; sis: number }>; cont: Record<string, string> };

const dataHora = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(String(iso).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(iso);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const diaHora = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(String(iso).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(iso);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function useConferencias(n: EstoqueDados, avisar: (t: string) => void) {
    const { depositos, categorias, fabricantes, prodById, produtosAtivos, custosMediosMoveis, refreshInit, userById } = n;

    const [lista, setLista] = useState<ConferenciaRegistro[]>([]);
    const [progresso, setProgresso] = useState<Record<number, { feitos: number; total: number }>>({});
    const [erro, setErro] = useState("");
    const [busy, setBusy] = useState(false);
    const [aberta, setAberta] = useState<Aberta | null>(null);
    const [salvoAs, setSalvoAs] = useState("");
    const [filtro, setFiltro] = useState<Filtro>("todos");
    const [ver, setVer] = useState<ConferenciaDetalheResp | null>(null);
    const [verFiltro, setVerFiltro] = useState<"todos" | "div">("todos");
    const [concluirOpen, setConcluirOpen] = useState(false);
    const [scan, setScan] = useState(false);
    const timers = useRef<Record<string, number>>({});

    // Nova conferência
    const [ncOpen, setNcOpen] = useState(false);
    const [ncDep, setNcDep] = useState<ID | null>(null);
    const [ncCats, setNcCats] = useState<number[]>([]);
    const [ncFabs, setNcFabs] = useState<number[]>([]);
    const [ncCega, setNcCega] = useState(false);
    const [ncSem, setNcSem] = useState(false);
    const [ncSecao, setNcSecao] = useState<"" | "cats" | "fabs">("");
    const [ncBusca, setNcBusca] = useState<{ cats: string; fabs: string }>({ cats: "", fabs: "" });

    const nomeDep = (id: ID) => depositos.find((d) => Number(d.id) === Number(id))?.nome || "";
    const nomesIds = (ids: string | null | undefined, lista: Array<{ id: ID; nome: string }>) =>
        String(ids || "")
            .split(",")
            .map((x) => Number(x))
            .filter((x) => x > 0)
            .map((x) => lista.find((o) => Number(o.id) === x)?.nome || `#${x}`);
    const oQueConferiu = (c: ConferenciaRegistro) => {
        const cats = c.categorias_ids ? nomesIds(c.categorias_ids, categorias) : c.categoria_id ? nomesIds(String(c.categoria_id), categorias) : [];
        const fabs = c.fabricantes_ids ? nomesIds(c.fabricantes_ids, fabricantes) : c.fabricante_id ? nomesIds(String(c.fabricante_id), fabricantes) : [];
        const partes = [cats.length ? cats.join(", ") : "Todas"];
        if (fabs.length) partes.push(fabs.join(", "));
        return partes.join(" · ");
    };
    const custo = (pid: ID) => {
        const c = Number(custosMediosMoveis[Number(pid)]?.custo_medio);
        return Number.isFinite(c) && c > 0 ? c : Number(prodById.get(pid)?.preco_custo) || 0;
    };

    async function detalhe(id: number) {
        const r = await apiGet<ConferenciaDetalheResp>({ conferencia_id: id, _ts: Date.now() });
        if (!r.ok) throw new Error(r.msg || "Falha ao carregar a conferência.");
        return r;
    }

    async function carregar() {
        try {
            const r = await apiGet<ConferenciasListResp>({ conferencias: 1, limit: 100, _ts: Date.now() });
            if (!r.ok) throw new Error(r.msg || "Falha ao carregar conferências.");
            const rows = r.rows || [];
            setLista(rows);
            const prog: Record<number, { feitos: number; total: number }> = {};
            for (const c of rows.filter((x) => x.status === "CONTAGEM" || x.status === "REVISAO")) {
                try {
                    const d = await detalhe(c.id);
                    prog[c.id] = { feitos: d.items.length, total: (d.escopo || []).length };
                } catch {
                    /* sem progresso */
                }
            }
            setProgresso(prog);
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : "Erro ao carregar conferências.");
        }
    }

    async function abrir(id: number) {
        try {
            const d = await detalhe(id);
            const cont: Record<string, string> = {};
            d.items.forEach((it) => {
                if (it.produto_id) cont[String(it.produto_id)] = String(it.qtd_fisica);
            });
            setAberta({
                head: d.head,
                escopo: (d.escopo || []).map((e) => ({ id: e.produto_id, n: e.nome, cb: e.codigo_barras, sis: clampInt(e.saldo) })),
                cont,
            });
            setSalvoAs("");
            setFiltro("todos");
            setErro("");
            setVer(null);
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : "Erro ao abrir a conferência.");
        }
    }

    async function salvarContagem(pid: ID, valor: string | null) {
        if (!aberta) return;
        const r = await apiPost<{ ok: boolean; msg?: string; salvo_em?: string }>({
            action: "conferencia_contar",
            conferencia_id: aberta.head.id,
            itens: [{ produto_id: pid, qtd_fisica: valor === null || valor === "" ? null : clampInt(valor) }],
        });
        if (!r.ok) return setErro(r.msg || "Não foi possível salvar a contagem.");
        setSalvoAs(r.salvo_em || new Date().toTimeString().slice(0, 5));
    }

    function mudarContagem(pid: ID, valor: string) {
        if (!aberta) return;
        const limpo = valor.replace(/\D/g, "");
        setAberta({ ...aberta, cont: { ...aberta.cont, [String(pid)]: limpo } });
        const k = String(pid);
        if (timers.current[k]) window.clearTimeout(timers.current[k]);
        timers.current[k] = window.setTimeout(() => void salvarContagem(pid, limpo === "" ? null : limpo), 600);
    }

    function recontar(pid: ID) {
        if (!aberta) return;
        const cont = { ...aberta.cont };
        delete cont[String(pid)];
        setAberta({ ...aberta, head: { ...aberta.head, status: "CONTAGEM" }, cont });
        void salvarContagem(pid, null);
    }

    function bipar(codigo: string) {
        if (!aberta) return;
        const item = aberta.escopo.find((e) => String(e.cb).trim() === codigo.trim());
        if (!item) return setErro(`O código ${codigo} não faz parte desta conferência.`);
        const novo = String(clampInt(aberta.cont[String(item.id)] || 0) + 1);
        mudarContagem(item.id, novo);
        avisar(`Leu ${item.n}: total ${novo}.`);
    }

    async function etapa(e: "CONTAGEM" | "REVISAO") {
        if (!aberta) return;
        const r = await apiPost<{ ok: boolean; msg?: string }>({ action: "conferencia_etapa", conferencia_id: aberta.head.id, etapa: e });
        if (!r.ok) return setErro(r.msg || "Não foi possível mudar a etapa.");
        setAberta({ ...aberta, head: { ...aberta.head, status: e } });
        setErro("");
        setFiltro(e === "REVISAO" && linhas.some((x) => x.diff) ? "div" : "todos");
    }

    async function concluir(ajustar: boolean) {
        if (!aberta) return;
        setBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({ action: "conferencia_concluir", conferencia_id: aberta.head.id, ajustar: ajustar ? 1 : 0 });
            if (!r.ok) {
                setConcluirOpen(false);
                return setErro(r.msg || "Não foi possível concluir.");
            }
            setConcluirOpen(false);
            setAberta(null);
            avisar(r.msg || "Conferência concluída.");
            await refreshInit();
            await carregar();
        } finally {
            setBusy(false);
        }
    }

    async function criar() {
        if (!ncDep) return setErro("Escolha o local da conferência.");
        setBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number; codigo?: string }>({
                action: "conferencia_abrir",
                deposito_id: ncDep,
                categorias: ncCats,
                fabricantes: ncFabs,
                contagem_cega: ncCega ? 1 : 0,
                incluir_sem_saldo: ncSem ? 1 : 0,
            });
            if (!r.ok || !r.id) return setErro(r.msg || "Não foi possível criar a conferência.");
            setNcOpen(false);
            avisar(`${r.codigo} criada.`);
            await carregar();
            await abrir(r.id);
        } finally {
            setBusy(false);
        }
    }

    // ===== Lista =====
    const abertas = lista
        .filter((c) => c.status === "CONTAGEM" || c.status === "REVISAO")
        .map((c) => {
            const pg = progresso[c.id];
            return {
                id: c.id,
                cod: c.codigo || `CONF-${String(c.id).padStart(6, "0")}`,
                dep: c.deposito_nome || nomeDep(c.deposito_id),
                cats: oQueConferiu(c),
                u: c.operador_nome || userById.get(Number(c.operador_usuario_id))?.nome || "",
                dt: diaHora(c.criado_em),
                prog: pg ? `${pg.feitos} de ${pg.total}` : "",
                pct: pg && pg.total ? `${Math.round((pg.feitos / pg.total) * 100)}%` : "0%",
                stl: c.status === "REVISAO" ? "Em revisão" : "Em contagem",
                abrir: () => void abrir(c.id),
            };
        });
    const concluidas = lista
        .filter((c) => !c.status || c.status === "CONCLUIDA")
        .map((c) => {
            const sis = clampInt(c.total_sistema), fi = clampInt(c.total_fisico);
            return {
                id: c.id,
                cod: c.codigo || `CONF-${String(c.id).padStart(6, "0")}`,
                dep: c.deposito_nome || nomeDep(c.deposito_id),
                cats: oQueConferiu(c),
                u: c.operador_nome || "",
                dt: dataHora(c.concluido_em || c.criado_em),
                it: String(c.total_itens),
                dif: String(Number(c.total_dif) || 0),
                acc: sis ? `${Math.round((Math.min(fi, sis) / sis) * 1000) / 10}%` : "—",
                aj: c.ajuste_codigo || "",
                temAj: !!c.ajuste_codigo,
                ver: async () => {
                    try {
                        setVer(await detalhe(c.id));
                        setVerFiltro("todos");
                        setAberta(null);
                    } catch (e: unknown) {
                        setErro(e instanceof Error ? e.message : "Erro ao abrir a conferência.");
                    }
                },
            };
        });

    // ===== Conferência aberta =====
    const cega = !!aberta && Number(aberta.head.contagem_cega || 0) === 1;
    const revisao = aberta?.head.status === "REVISAO";
    const linhas = (aberta?.escopo || []).map((e) => {
        const raw = aberta?.cont[String(e.id)] ?? "";
        const tem = raw !== "";
        const c = tem ? clampInt(raw) : 0;
        const dif = tem ? c - e.sis : 0;
        return {
            id: e.id,
            n: e.n,
            cb: e.cb,
            sis: String(e.sis),
            mostraSis: !cega || revisao,
            v: raw,
            tem,
            pend: !tem,
            ok: tem && dif === 0,
            diff: tem && dif !== 0,
            dif: tem ? String(dif) : "—",
            difN: dif,
            st: !tem ? "Pendente" : dif === 0 ? "Confere" : dif < 0 ? `Falta ${-dif}` : `Sobra ${dif}`,
            valorN: dif * custo(e.id),
            onV: (ev: React.ChangeEvent<HTMLInputElement>) => mudarContagem(e.id, ev.target.value),
            recontar: () => recontar(e.id),
        };
    });
    const feitos = linhas.filter((l) => l.tem).length;
    const divs = linhas.filter((l) => l.diff);
    const falta = divs.filter((l) => l.difN < 0).reduce((a, l) => a + l.valorN, 0);
    const sobra = divs.filter((l) => l.difN > 0).reduce((a, l) => a + l.valorN, 0);
    const cRows = linhas.filter((l) => filtro === "todos" || (filtro === "pend" && l.pend) || (filtro === "cont" && l.tem) || (filtro === "div" && l.diff));

    const irRevisao = () => {
        if (feitos < linhas.length) return setErro(`Ainda faltam ${linhas.length - feitos} itens. Conte todos (ou marque como zero) para revisar.`);
        void etapa("REVISAO");
    };

    async function imprimirLista() {
        if (!aberta) return;
        const cod = aberta.head.codigo || `CONF-${aberta.head.id}`;
        await pdfConferencia({
            titulo: `Conferência ${cod}`,
            linhas: [`Local: ${nomeDep(aberta.head.deposito_id)} · ${oQueConferiu(aberta.head)}`, `Impressa em ${new Date().toLocaleString("pt-BR")}`],
            cabecalho: cega && !revisao ? ["Produto", "Código", "Contado"] : ["Produto", "Código", "Sistema", "Contado"],
            corpo: linhas.map((l) => (cega && !revisao ? [l.n, l.cb, l.v] : [l.n, l.cb, l.sis, l.v])),
            direita: cega && !revisao ? [2] : [2, 3],
            arquivo: `${cod}_lista`,
        });
    }

    // ===== Conferência concluída (visualizar) =====
    const vh = ver?.head || null;
    const cvTodas = (ver?.items || []).map((it) => {
        const d = Number(it.qtd_fisica) - Number(it.qtd_sistema);
        return { n: it.produto_nome_snapshot, cb: it.codigo_barras_snapshot || "", sis: String(it.qtd_sistema), fi: String(it.qtd_fisica), dif: String(d), ok: d === 0, diff: d !== 0, st: d === 0 ? "Confere" : d < 0 ? `Falta ${-d}` : `Sobra ${d}` };
    });
    const cvRows = cvTodas.filter((r) => verFiltro === "todos" || r.diff);
    const cvCod = vh ? vh.codigo || `CONF-${String(vh.id).padStart(6, "0")}` : "";
    const exportarVer = (tipo: "pdf" | "csv") => () => {
        if (!vh) return;
        const cab = ["Produto", "Código", "Sistema", "Contado", "Diferença"];
        const corpo = cvTodas.map((r) => [r.n, r.cb, r.sis, r.fi, r.dif]);
        if (tipo === "csv") return csvConferencia(cab, corpo, cvCod);
        void pdfConferencia({
            titulo: `Conferência ${cvCod}`,
            linhas: [`Local: ${vh.deposito_nome || nomeDep(vh.deposito_id)} · ${oQueConferiu(vh)}`, `${vh.operador_nome || ""} · ${dataHora(vh.concluido_em || vh.criado_em)}${vh.ajuste_codigo ? ` · Ajuste ${vh.ajuste_codigo}` : ""}`],
            cabecalho: cab,
            corpo,
            direita: [2, 3, 4],
            arquivo: cvCod,
        });
    };

    // ===== Nova conferência =====
    const cbNcDep = useBuscaLista(
        depositos.map((d) => ({ id: d.id, n: d.nome })),
        ncDep,
        (id) => setNcDep(id == null ? null : Number(id))
    );
    const resumoSel = (nomes: string[], vazio: string) => (!nomes.length ? vazio : nomes.length <= 2 ? nomes.join(", ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`);
    const acc = (k: "cats" | "fabs", tit: string, ids: number[], lista: Array<{ id: ID; nome: string }>, vazio: string) => {
        const nomes = lista.filter((o) => ids.includes(Number(o.id))).map((o) => o.nome);
        const ab = ncSecao === k;
        return { tit, res: resumoSel(nomes, vazio), n: nomes.length ? String(nomes.length) : "", temN: nomes.length > 0, ab, exp: ab, go: () => setNcSecao(ab ? "" : k) };
    };
    const marcar = (k: "cats" | "fabs", lista: Array<{ id: ID; nome: string }>, ids: number[], set: (v: number[]) => void) => {
        const termo = normalizar(ncBusca[k]).trim();
        return lista
            .filter((o) => !termo || normalizar(o.nome).includes(termo))
            .map((o) => ({ l: o.nome, on: ids.includes(Number(o.id)), go: () => set(ids.includes(Number(o.id)) ? ids.filter((x) => x !== Number(o.id)) : [...ids, Number(o.id)]) }));
    };

    return {
        carregar,
        erro,
        busy,
        limparErro: () => setErro(""),
        // lista
        cLista: !aberta && !ver,
        abertas,
        temAbertas: abertas.length > 0,
        concluidas,
        // nova
        ncOpen,
        abrirNc: () => {
            setNcDep(null);
            setNcCats([]);
            setNcFabs([]);
            setNcCega(false);
            setNcSem(false);
            setNcSecao("");
            setErro("");
            setNcOpen(true);
        },
        fecharNc: () => setNcOpen(false),
        cbNcDep,
        aNcCat: acc("cats", "Categorias", ncCats, categorias, "Todas"),
        aNcFab: acc("fabs", "Fabricantes", ncFabs, fabricantes, "Todos"),
        ncCatQ: ncBusca.cats,
        ncFabQ: ncBusca.fabs,
        onNcCatQ: (e: React.ChangeEvent<HTMLInputElement>) => setNcBusca((b) => ({ ...b, cats: e.target.value })),
        onNcFabQ: (e: React.ChangeEvent<HTMLInputElement>) => setNcBusca((b) => ({ ...b, fabs: e.target.value })),
        ncCats: marcar("cats", categorias, ncCats, setNcCats),
        ncFabs: marcar("fabs", fabricantes, ncFabs, setNcFabs),
        ncCega,
        togCega: () => setNcCega((v) => !v),
        ncSem,
        togSem: () => setNcSem((v) => !v),
        criarConf: () => void criar(),
        // concluída
        cVerOn: !!ver,
        cvCod,
        cvDep: vh ? vh.deposito_nome || nomeDep(vh.deposito_id) : "",
        cvCats: vh ? oQueConferiu(vh) : "",
        cvU: vh ? `${vh.operador_nome || ""} · ${dataHora(vh.concluido_em || vh.criado_em)}` : "",
        cvAj: vh ? (vh.ajuste_codigo ? `Saldos ajustados no lançamento ${vh.ajuste_codigo}` : "Concluída sem ajuste de saldo") : "",
        cvTemDet: cvTodas.length > 0,
        cvRows,
        cvIt: vh ? String(vh.total_itens) : "",
        cvSis: vh ? String(vh.total_sistema ?? "") : "",
        cvFi: vh ? String(vh.total_fisico ?? "") : "",
        cvDif: vh ? String(Number(vh.total_dif) || 0) : "",
        cvFil: ([["todos", "Todos os itens"], ["div", "Só diferenças"]] as Array<["todos" | "div", string]>).map(([k, l]) => ({ l, on: verFiltro === k, go: () => setVerFiltro(k) })),
        fecharVer: () => setVer(null),
        pdfVer: exportarVer("pdf"),
        csvVer: exportarVer("csv"),
        // aberta
        cAberta: !!aberta,
        cCod: aberta ? aberta.head.codigo || `CONF-${aberta.head.id}` : "",
        cDep: aberta ? nomeDep(aberta.head.deposito_id) : "",
        cCats: aberta ? oQueConferiu(aberta.head) : "",
        cCega: cega,
        cRev: revisao,
        cCont: !!aberta && !revisao,
        cSalvo: salvoAs ? `Salvo automaticamente às ${salvoAs}` : "Tudo salvo",
        cProg: `${feitos} de ${linhas.length} contados`,
        cPct: linhas.length ? `${Math.round((feitos / linhas.length) * 100)}%` : "0%",
        cFil: ([["todos", "Todos"], ["pend", "Pendentes"], ["cont", "Contados"], ["div", "Diferenças"]] as Array<[Filtro, string]>).map(([k, l]) => ({ l, on: filtro === k, go: () => setFiltro(k) })),
        cRows,
        cVazio: cRows.length === 0,
        voltarLista: () => {
            setAberta(null);
            setErro("");
            void carregar();
        },
        abrirLeitor: () => setScan(true),
        scan,
        fecharLeitor: () => setScan(false),
        bipar,
        irRevisao,
        voltarContagem: () => void etapa("CONTAGEM"),
        cNDiv: String(divs.length),
        cFalta: brl(Math.abs(falta)),
        cSobra: brl(sobra),
        cAcc: linhas.length ? `${Math.round(((linhas.length - divs.length) / linhas.length) * 1000) / 10}%` : "—",
        cConcluir: concluirOpen,
        pedirConcluirConf: () => setConcluirOpen(true),
        fecharConcluirConf: () => setConcluirOpen(false),
        concluirSemAjuste: () => void concluir(false),
        concluirComAjuste: () => void concluir(true),
        temDiv: divs.length > 0,
        imprimirLista: () => void imprimirLista(),
        produtosAtivos,
    };
}

export type ConferenciasV = ReturnType<typeof useConferencias>;
