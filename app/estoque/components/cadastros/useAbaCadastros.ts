"use client";

import { useRef, useState } from "react";
import { API_BASE, apiPost } from "../api";
import { clampInt } from "../formato";
import { useBuscaLista } from "../ui/BuscaLista";
import type { ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";
import type { Cadastros } from "./useCadastros";

// Aba Cadastros (o antigo Avançado): ajuste de saldos, depósitos, categorias, fabricantes e arquivos CSV.
// Depósitos, categorias e fabricantes usam uma janela só: lista com Renomear + campo para adicionar.

type Cad = "" | "ajuste" | "dep" | "cat" | "fab" | "exp" | "imp";

const TITULO: Record<Exclude<Cad, "">, string> = {
    ajuste: "Ajuste de saldos",
    dep: "Depósitos",
    cat: "Categorias",
    fab: "Fabricantes",
    exp: "Exportar lista para conferência (CSV)",
    imp: "Importar produtos e saldos (CSV)",
};

const ACOES = {
    dep: { criar: "deposito_criar", renomear: "deposito_renomear", campo: "deposito_id" },
    cat: { criar: "categoria_criar", renomear: "categoria_renomear", campo: "categoria_id" },
    fab: { criar: "fabricante_criar", renomear: "fabricante_renomear", campo: "fabricante_id" },
} as const;

export function useAbaCadastros(n: EstoqueDados, cad: Cadastros, avisar: (t: string) => void) {
    const { depositos, categorias, fabricantes, produtosAtivos, saldosMap, refreshInit } = n;
    void cad;

    const [aberto, setAberto] = useState<Cad>("");
    const [erro, setErro] = useState("");
    const [busy, setBusy] = useState(false);
    const [nome, setNome] = useState("");
    const [ren, setRen] = useState<ID | null>(null);
    const [ajP, setAjP] = useState<ID | null>(null);
    const [ajD, setAjD] = useState<ID | null>(null);
    const [ajNovo, setAjNovo] = useState("");
    const [ajMotivo, setAjMotivo] = useState("");
    const [expDep, setExpDep] = useState<ID | null>(null);
    const arquivo = useRef<File | null>(null);

    const listas = { dep: depositos, cat: categorias, fab: fabricantes };
    const isLista = aberto === "dep" || aberto === "cat" || aberto === "fab";

    const cbAjP = useBuscaLista(
        produtosAtivos.map((p) => ({ id: p.id, n: p.nome, busca: p.codigo_barras })),
        ajP,
        (id) => setAjP(id == null ? null : Number(id))
    );
    const cbAjD = useBuscaLista(
        depositos.map((d) => ({ id: d.id, n: d.nome })),
        ajD,
        (id) => setAjD(id == null ? null : Number(id))
    );
    const cbExpDep = useBuscaLista(
        depositos.map((d) => ({ id: d.id, n: d.nome })),
        expDep,
        (id) => setExpDep(id == null ? null : Number(id))
    );

    const abrir = (k: Cad) => () => {
        if (k === "ajuste" && !ajD) setAjD(depositos.find((d) => d.nome.toUpperCase() === "ALMOXARIFADO")?.id ?? null);
        if (k === "exp" && !expDep) setExpDep(depositos.find((d) => d.nome.toUpperCase() === "ALMOXARIFADO")?.id ?? null);
        setAberto(k);
        setNome("");
        setRen(null);
        setErro("");
        setAjNovo("");
        setAjMotivo("");
        arquivo.current = null;
    };

    async function salvarLista() {
        if (!isLista) return;
        const valor = nome.trim().toUpperCase();
        if (!valor) return setErro("Digite o nome.");
        const a = ACOES[aberto as "dep" | "cat" | "fab"];
        setBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>(ren != null ? { action: a.renomear, [a.campo]: ren, nome: valor } : { action: a.criar, nome: valor });
            if (!r.ok) return setErro(r.msg || "Não foi possível salvar.");
            await refreshInit();
            setNome("");
            setRen(null);
            setErro("");
            avisar(ren != null ? `Nome alterado para ${valor}.` : `Adicionado: ${valor}.`);
        } finally {
            setBusy(false);
        }
    }

    async function salvarAjuste() {
        if (!ajP || !ajD) return setErro("Escolha o produto e o depósito.");
        if (ajNovo === "") return setErro("Informe o novo saldo.");
        if (!ajMotivo.trim()) return setErro("O motivo é obrigatório.");
        setBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; codigo?: string }>({ action: "saldo_setar", produto_id: ajP, deposito_id: ajD, quantidade: clampInt(ajNovo), motivo: ajMotivo.trim() });
            if (!r.ok) return setErro(r.msg || "Falha ao ajustar o saldo.");
            await refreshInit();
            setAberto("");
            avisar(r.codigo ? `${r.codigo} registrado.` : "Saldo ajustado.");
        } finally {
            setBusy(false);
        }
    }

    function exportar() {
        if (!expDep) return setErro("Escolha o depósito.");
        window.open(`${API_BASE}?export_deposito_id=${expDep}`, "_blank", "noopener,noreferrer");
        setAberto("");
    }

    async function importar() {
        const f = arquivo.current;
        if (!f) return setErro("Escolha o arquivo CSV.");
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("action", "import_csv");
            fd.append("arquivo", f);
            const r = await fetch(API_BASE, { method: "POST", body: fd, credentials: "include" });
            const j = (await r.json()) as { ok: boolean; msg?: string };
            if (!j.ok) return setErro(j.msg || "Falha na importação.");
            await refreshInit();
            setAberto("");
            avisar(j.msg || "Importação concluída.");
        } catch {
            setErro("Erro na importação.");
        } finally {
            setBusy(false);
        }
    }

    const salvar = () => {
        if (aberto === "ajuste") return void salvarAjuste();
        if (aberto === "exp") return exportar();
        if (aberto === "imp") return void importar();
    };

    const ajAtual = ajP && ajD ? String(clampInt(saldosMap.get(`${ajP}::${ajD}`)?.quantidade ?? 0)) : "—";

    return {
        abrirAjuste: abrir("ajuste"),
        abrirMat: () => {
            window.location.href = "/assistencia";
        },
        abrirDep: abrir("dep"),
        abrirCat: abrir("cat"),
        abrirFab: abrir("fab"),
        abrirExp: abrir("exp"),
        abrirImp: abrir("imp"),
        nDep: String(depositos.length),
        nCat: String(categorias.length),
        nFab: String(fabricantes.length),
        cadOpen: !!aberto,
        cadTitulo: aberto ? TITULO[aberto] : "",
        fecharCad: () => setAberto(""),
        salvarCad: salvar,
        busy,
        erro,
        cadAjuste: aberto === "ajuste",
        cadLista: isLista,
        cadExp: aberto === "exp",
        cadImp: aberto === "imp",
        cadForm: !isLista,
        listaCad: isLista ? listas[aberto as "dep" | "cat" | "fab"].map((x) => ({ id: x.id, nm: x.nome, go: () => (setRen(x.id), setNome(x.nome)) })) : [],
        nome,
        onNome: (e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value),
        salvarLista: () => void salvarLista(),
        renomeando: ren != null,
        nomeBtn: ren != null ? "Salvar nome" : "Adicionar",
        nomeLbl: ren != null ? "Novo nome" : "Adicionar novo",
        cancelarRen: () => (setRen(null), setNome("")),
        cbAjP,
        cbAjD,
        ajAtual,
        ajNovo,
        onAjNovo: (e: React.ChangeEvent<HTMLInputElement>) => setAjNovo(e.target.value.replace(/\D/g, "")),
        ajMotivo,
        onAjMotivo: (e: React.ChangeEvent<HTMLInputElement>) => setAjMotivo(e.target.value),
        cbExpDep,
        onArquivo: (e: React.ChangeEvent<HTMLInputElement>) => {
            arquivo.current = e.target.files?.[0] || null;
        },
    };
}

export type AbaCadastrosV = ReturnType<typeof useAbaCadastros>;
