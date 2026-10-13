"use client";

/*
 * ORÇAMENTO (13/10/2026) — página "orcamento" do pai_api.php, no módulo Atendimento.
 *
 * O orçamento é passado para a família com poucos dados (falecido, contato e telefone) e os itens escolhidos.
 * A folha segue as mesmas regras da OS do registro (prévia da OS, sempre Particular) e vale 7 dias.
 * Fica guardado e pode virar atendimento: "Virar atendimento" abre o Novo registro já preenchido.
 *
 * Endereços: /orcamento · /orcamento?novo=1 (atalho da tela inicial) · /orcamento?id=<n> (abre o orçamento).
 * Tudo desta tela fica em app/orcamento/components. Servidor: orcamento.php (tabela orcamentos).
 */

import React, { useCallback, useEffect, useState } from "react";
import { carregarOpcoes, listarOrcamentos } from "./components/api";
import DetalheOrcamento from "./components/DetalheOrcamento";
import EditorOrcamento from "./components/EditorOrcamento";
import ListaOrcamentos from "./components/ListaOrcamentos";
import type { Opcoes, Orcamento, ResumoLista } from "./components/tipos";
import { Aviso, BTN_PRI, Ic, Icone, MUTED } from "./components/ui";

type Tela = { tipo: "lista" } | { tipo: "editor"; orcamento: Orcamento | null };

function trocarEndereco(params: Record<string, string> | null) {
    if (typeof window === "undefined") return;
    const q = params ? `?${new URLSearchParams(params).toString()}` : "";
    window.history.replaceState(null, "", `/orcamento${q}`);
}

export default function OrcamentoPage() {
    const [tela, setTela] = useState<Tela>({ tipo: "lista" });
    const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
    const [erroOpcoes, setErroOpcoes] = useState("");
    const [linhas, setLinhas] = useState<ResumoLista[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [filtro, setFiltro] = useState("ABERTO");
    const [busca, setBusca] = useState("");
    const [aberto, setAberto] = useState<number | null>(null);

    useEffect(() => {
        carregarOpcoes()
            .then(setOpcoes)
            .catch((e) => setErroOpcoes(e?.message || "Não foi possível carregar as opções do orçamento."));
        // Atalhos: ?novo=1 (tela inicial) e ?id=<n>
        const p = new URLSearchParams(window.location.search);
        if (p.get("novo") === "1") setTela({ tipo: "editor", orcamento: null });
        const id = Number(p.get("id") || 0);
        if (id > 0) setAberto(id);
    }, []);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro("");
        try {
            setLinhas(await listarOrcamentos(filtro, busca.trim()));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os orçamentos.");
        } finally {
            setCarregando(false);
        }
    }, [filtro, busca]);

    useEffect(() => {
        if (tela.tipo !== "lista") return;
        const t = window.setTimeout(() => void carregar(), busca ? 350 : 0);
        return () => window.clearTimeout(t);
    }, [carregar, tela.tipo, busca]);

    const novo = () => {
        setMsg("");
        setTela({ tipo: "editor", orcamento: null });
        trocarEndereco({ novo: "1" });
        window.scrollTo({ top: 0 });
    };

    return (
        <main className="min-h-[100dvh] w-full overflow-x-clip bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-[1120px] lg:px-10 lg:pt-8">
                {tela.tipo === "lista" ? (
                    <>
                        <header className="flex items-center gap-3 px-4 pb-3 pt-4 lg:mb-6 lg:p-0">
                            <div className="min-w-0 flex-1">
                                <h1 className="text-[22px] font-extrabold leading-tight lg:text-[28px]">Orçamentos</h1>
                                <p className={`mt-1 hidden text-sm lg:block ${MUTED}`}>
                                    Orçamento para a família, com as mesmas regras da OS (Particular). Vale {opcoes?.validade_dias || 7} dias e pode virar atendimento.
                                </p>
                            </div>
                            <button type="button" onClick={novo} className={`${BTN_PRI} lg:h-12`}>
                                <Icone d={Ic.mais} />
                                Novo orçamento
                            </button>
                        </header>

                        {msg ? (
                            <div className="mx-4 mb-3 lg:mx-0">
                                <Aviso tom="ok">{msg}</Aviso>
                            </div>
                        ) : null}
                        {erro ? (
                            <div className="mx-4 mb-3 lg:mx-0">
                                <Aviso tom="erro">{erro}</Aviso>
                            </div>
                        ) : null}

                        <ListaOrcamentos
                            linhas={linhas}
                            carregando={carregando}
                            filtro={filtro}
                            onFiltro={setFiltro}
                            busca={busca}
                            onBusca={setBusca}
                            onAtualizar={() => void carregar()}
                            onAbrir={(o) => {
                                setAberto(o.id);
                                trocarEndereco({ id: String(o.id) });
                            }}
                        />
                    </>
                ) : !opcoes ? (
                    <div className="px-4 pt-6 lg:px-0">
                        {erroOpcoes ? <Aviso tom="erro">{erroOpcoes}</Aviso> : <p className={`text-center text-sm ${MUTED}`}>Carregando…</p>}
                    </div>
                ) : (
                    <EditorOrcamento
                        key={tela.orcamento?.id || "novo"}
                        inicial={tela.orcamento}
                        opcoes={opcoes}
                        onVoltar={() => {
                            setTela({ tipo: "lista" });
                            trocarEndereco(null);
                        }}
                        onSalvo={(o, m) => {
                            setMsg(m);
                            setFiltro("ABERTO");
                            setTela({ tipo: "lista" });
                            setAberto(o.id);
                            trocarEndereco({ id: String(o.id) });
                            window.scrollTo({ top: 0 });
                        }}
                    />
                )}
            </div>

            {aberto !== null && tela.tipo === "lista" ? (
                <DetalheOrcamento
                    key={aberto}
                    id={aberto}
                    onFechar={() => {
                        setAberto(null);
                        trocarEndereco(null);
                    }}
                    onEditar={(o) => {
                        setAberto(null);
                        setMsg("");
                        setTela({ tipo: "editor", orcamento: o });
                        trocarEndereco({ id: String(o.id) });
                        window.scrollTo({ top: 0 });
                    }}
                    onAlterou={(m) => {
                        setMsg(m);
                        setAberto(null);
                        trocarEndereco(null);
                        void carregar();
                    }}
                />
            ) : null}
        </main>
    );
}
