"use client";

import React from "react";
import { CampoBusca } from "../ui/BuscaLista";
import { Ic, type NomeIcone } from "../ui/Icones";
import { Janela } from "../ui/Janela";
import type { AbaCadastrosV } from "./useAbaCadastros";

// Aba Cadastros: botões em grupos (Saldos, Locais e classificação, Arquivos) e a janela de cada um.

function Botao({ ic, titulo, n, go }: { ic: NomeIcone; titulo: string; n?: string; go: () => void }) {
    return (
        <button type="button" className="cadb" onClick={go}>
            <span className="chip">
                <Ic n={ic} />
            </span>
            <span className="ttl">{titulo}</span>
            {n != null && <span className="cnt">{n}</span>}
        </button>
    );
}

function JanelaCadastro({ v, m }: { v: AbaCadastrosV; m: boolean }) {
    const rodape = v.cadForm ? (
        <>
            <button type="button" className="btn" onClick={v.fecharCad}>
                Cancelar
            </button>
            <button type="button" className="btn pri" onClick={v.salvarCad} disabled={v.busy}>
                Salvar
            </button>
        </>
    ) : (
        <button type="button" className="btn" onClick={v.fecharCad}>
            Fechar
        </button>
    );

    return (
        <Janela m={m} titulo={v.cadTitulo} aoFechar={v.fecharCad} rodape={rodape}>
            {v.cadAjuste && (
                <div style={{ display: "grid", gridTemplateColumns: m ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))", gap: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <p className="flbl">Produto</p>
                        <CampoBusca b={v.cbAjP} rotulo="Produto" placeholder="Digite parte do nome" m={m} />
                    </div>
                    <div>
                        <p className="flbl">Depósito</p>
                        <CampoBusca b={v.cbAjD} rotulo="Depósito" m={m} />
                    </div>
                    <div>
                        <p className="flbl">Saldo atual → novo saldo</p>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <div className="inp" style={{ width: "80px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", opacity: ".8" }}>
                                {v.ajAtual}
                            </div>
                            <span aria-hidden="true">→</span>
                            <input className="inp" type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Novo saldo" value={v.ajNovo} onChange={v.onAjNovo} />
                        </div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <p className="flbl">Motivo (obrigatório)</p>
                        <input className="inp" placeholder="Ex.: avaria, perda" aria-label="Motivo" value={v.ajMotivo} onChange={v.onAjMotivo} />
                    </div>
                </div>
            )}

            {v.cadLista && (
                <>
                    <div style={{ border: "1px solid var(--line)", borderRadius: "14px", overflow: "auto", maxHeight: "300px" }}>
                        {v.listaCad.map((i) => (
                            <div className="li" key={String(i.id)}>
                                <span style={{ flex: "1" }}>{i.nm}</span>
                                <button type="button" className="btn" onClick={i.go} style={{ height: "40px", padding: "0 12px", fontSize: "13px" }}>
                                    Renomear
                                </button>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                        <div style={{ flex: "1" }}>
                            <p className="flbl">{v.nomeLbl}</p>
                            <input className="inp" value={v.nome} onChange={v.onNome} placeholder="Digite o nome" aria-label="Nome" />
                        </div>
                        {v.renomeando && (
                            <button type="button" className="btn" onClick={v.cancelarRen} style={{ height: "48px" }}>
                                Cancelar
                            </button>
                        )}
                        <button type="button" className="btn pri" onClick={v.salvarLista} style={{ height: "48px" }} disabled={v.busy}>
                            {v.nomeBtn}
                        </button>
                    </div>
                </>
            )}

            {v.cadExp && (
                <div>
                    <p className="flbl">Depósito</p>
                    <CampoBusca b={v.cbExpDep} rotulo="Depósito" m={m} />
                </div>
            )}

            {v.cadImp && (
                <div>
                    <p className="flbl">Arquivo CSV</p>
                    <input className="inp" type="file" accept=".csv,text/csv" aria-label="Arquivo CSV" style={{ paddingTop: "12px" }} onChange={v.onArquivo} />
                </div>
            )}

            {v.erro ? (
                <div className="msg-err" role="alert">
                    {v.erro}
                </div>
            ) : null}
        </Janela>
    );
}

export function AbaCadastros({ v, m }: { v: AbaCadastrosV; m: boolean }) {
    const grade = m ? "cadg cadgm" : "cadg";
    return (
        <>
            <section style={{ display: "flex", flexDirection: "column", gap: m ? "14px" : "20px" }} aria-label="Cadastros">
                <div>
                    <p className="grp-t">Saldos</p>
                    <div className={grade}>
                        <Botao ic="ajustes" titulo="Ajuste de saldos" go={v.abrirAjuste} />
                        <Botao ic="maleta" titulo="Materiais de Assistência" go={v.abrirMat} />
                    </div>
                </div>
                <div>
                    <p className="grp-t">Locais e classificação</p>
                    <div className={grade}>
                        <Botao ic="casa" titulo="Depósitos" n={v.nDep} go={v.abrirDep} />
                        <Botao ic="etiqueta" titulo="Categorias" n={v.nCat} go={v.abrirCat} />
                        <Botao ic="fabrica" titulo="Fabricantes" n={v.nFab} go={v.abrirFab} />
                    </div>
                </div>
                <div>
                    <p className="grp-t">Arquivos</p>
                    <div className={grade}>
                        <Botao ic="baixar" titulo="Exportar para conferência" go={v.abrirExp} />
                        <Botao ic="subir" titulo="Importar CSV" go={v.abrirImp} />
                    </div>
                </div>
            </section>
            {v.cadOpen && <JanelaCadastro v={v} m={m} />}
        </>
    );
}
