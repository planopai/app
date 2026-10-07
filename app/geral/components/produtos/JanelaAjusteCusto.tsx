"use client";

import React from "react";
import { clampInt, maskBRLFromDigits, maskBRLInput, moneyBRL } from "../formato";
import type { CustoAjusteTipo } from "../tipos";
import { Button, Field, Select, TextArea, TextInput } from "../ui/Basicos";
import { Modal } from "../ui/Modal";
import type { EditarProduto } from "./useEditarProduto";

export function JanelaAjusteCusto({ ed }: { ed: EditarProduto }) {
    const { calcularResumoAjusteCusto, custoAjusteBusy, custoAjusteConfirmOpen, custoAjusteFreteTotal, custoAjusteLoteId, custoAjusteNovo, custoAjusteObservacao, custoAjusteOpen, custoAjusteTipo, prepararConfirmacaoAjusteCusto, prodCustoDetalhe, salvarAjusteCusto, setCustoAjusteConfirmOpen, setCustoAjusteFreteTotal, setCustoAjusteLoteId, setCustoAjusteNovo, setCustoAjusteObservacao, setCustoAjusteOpen, setCustoAjusteTipo } = ed;

    return (
        <>
            {/* MODAL: AJUSTE DE PREÇO DE CUSTO */}
            <Modal
                open={custoAjusteOpen}
                title={custoAjusteConfirmOpen ? "Confirmar ajuste de custo" : "Ajustar preço de custo"}
                onClose={() => {
                    if (custoAjusteBusy) return;
                    setCustoAjusteConfirmOpen(false);
                    setCustoAjusteOpen(false);
                }}
                closeOnEsc={!custoAjusteBusy}
                panelClassName="lg:max-w-3xl"
            >
                {(() => {
                    const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
                        (lote) => clampInt(lote.quantidade_atual) > 0
                    );
                    const resumo = calcularResumoAjusteCusto();
            
                    if (custoAjusteConfirmOpen) {
                        return (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-[#A9BED6] dark:border-[#3D6A99]/60 bg-[#E9EFF6] dark:bg-[#3D6A99]/20 p-4">
                                    <p className="text-sm font-bold text-[#313C55] dark:text-white">Resumo do ajuste</p>
                                    <p className="mt-1 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                        Confira os valores abaixo. O ajuste será registrado no histórico depois da confirmação.
                                    </p>
                                </div>
            
                                <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F]">
                                    <dl className="divide-y divide-[#E3E8F0] dark:divide-white/12 text-sm">
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Produto</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{resumo.produto?.nome || "—"}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Operação</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{custoAjusteTipo === "LOTE" ? "Corrigir lote" : "Novo preço de custo"}</dd>
                                        </div>
                                        {custoAjusteTipo === "LOTE" ? (
                                            <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                <dt className="text-[#7A8396] dark:text-[#8893AA]">Lote</dt>
                                                <dd className="break-all font-mono text-xs font-semibold text-[#313C55] dark:text-white">{resumo.lote?.numero_lote || "—"}</dd>
                                            </div>
                                        ) : null}
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Custo base</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{moneyBRL(resumo.custoBase)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Frete total</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{moneyBRL(resumo.freteTotal)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Quantidade do rateio</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{resumo.quantidadeRateio}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-[#7A8396] dark:text-[#8893AA]">Frete por unidade</dt>
                                            <dd className="font-semibold text-[#313C55] dark:text-white">{moneyBRL(resumo.freteUnitario)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                                            <dt className="font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Novo custo final</dt>
                                            <dd className="text-lg font-bold text-[#313C55] dark:text-white">{moneyBRL(resumo.custoFinal)}</dd>
                                        </div>
                                        {custoAjusteTipo === "LOTE" ? (
                                            <>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-[#7A8396] dark:text-[#8893AA]">Saldo afetado</dt>
                                                    <dd className="font-semibold text-[#313C55] dark:text-white">{resumo.quantidadeAfetada}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-[#7A8396] dark:text-[#8893AA]">Valor atual</dt>
                                                    <dd className="font-semibold text-[#313C55] dark:text-white">{moneyBRL(resumo.valorAnterior)}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-[#7A8396] dark:text-[#8893AA]">Novo valor</dt>
                                                    <dd className="font-semibold text-[#313C55] dark:text-white">{moneyBRL(resumo.valorNovo)}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-[#7A8396] dark:text-[#8893AA]">Diferença</dt>
                                                    <dd className={resumo.diferenca > 0 ? "font-bold text-[#313C55] dark:text-white" : resumo.diferenca < 0 ? "font-bold text-[#B42318] dark:text-[#FF9C92]" : "font-bold text-[#5B6478] dark:text-[#AEB9CF]"}>
                                                        {resumo.diferenca > 0 ? "+" : ""}{moneyBRL(resumo.diferenca)}
                                                    </dd>
                                                </div>
                                            </>
                                        ) : null}
                                    </dl>
                                </div>
            
                                {custoAjusteObservacao.trim() ? (
                                    <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] p-4 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                        <span className="font-semibold">Observação:</span> {custoAjusteObservacao.trim()}
                                    </div>
                                ) : null}
            
                                <div className="flex gap-2 lg:justify-end [&>button]:flex-1 lg:[&>button]:flex-none">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={custoAjusteBusy}
                                        onClick={() => setCustoAjusteConfirmOpen(false)}
                                    >
                                        Voltar
                                    </Button>
                                    <Button type="button" disabled={custoAjusteBusy} onClick={salvarAjusteCusto}>
                                        {custoAjusteBusy ? "Confirmando..." : "Confirmar ajuste"}
                                    </Button>
                                </div>
                            </div>
                        );
                    }
            
                    return (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {([
                                    ["NOVO_PRECO", "Novo preço de custo", "Define o custo do cadastro e permite ratear o frete pelo saldo atual."],
                                    ["LOTE", "Corrigir lote", "Corrige custo e frete de um lote que ainda possui saldo."],
                                ] as Array<[CustoAjusteTipo, string, string]>).map(([tipo, titulo, descricao]) => {
                                    const ativo = custoAjusteTipo === tipo;
                                    const indisponivel = tipo === "LOTE" && lotesDisponiveis.length === 0;
                                    return (
                                        <button
                                            key={tipo}
                                            type="button"
                                            disabled={indisponivel}
                                            onClick={() => {
                                                setCustoAjusteTipo(tipo);
                                                if (tipo === "LOTE" && !custoAjusteLoteId) {
                                                    setCustoAjusteLoteId(lotesDisponiveis[0]?.id || 0);
                                                }
                                            }}
                                            className={[
                                                "rounded-2xl border p-4 text-left shadow-sm transition",
                                                ativo ? "border-[#A9BED6] dark:border-[#3D6A99]/60 bg-[#E9EFF6] dark:bg-[#3D6A99]/20 ring-2 ring-[#3D6A99]/20" : "border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] hover:border-[#C9D1DE] dark:hover:border-white/26",
                                                indisponivel ? "cursor-not-allowed opacity-50" : "",
                                            ].join(" ")}
                                        >
                                            <p className="text-sm font-bold text-[#313C55] dark:text-white">{titulo}</p>
                                            <p className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">{descricao}</p>
                                        </button>
                                    );
                                })}
                            </div>
            
                            {custoAjusteTipo === "LOTE" ? (
                                <Field label="Lote">
                                    <Select
                                        value={custoAjusteLoteId}
                                        onChange={(e) => {
                                            const id = Number(e.target.value);
                                            setCustoAjusteLoteId(id);
                                            const lote = lotesDisponiveis.find((item) => Number(item.id) === id);
                                            if (lote) {
                                                const freteUnit = Number(lote.frete_unitario) || 0;
                                                const base = Number(lote.custo_base_unitario);
                                                const baseSeguro = Number.isFinite(base)
                                                    ? base
                                                    : Math.max(0, (Number(lote.custo_unitario) || 0) - freteUnit);
                                                setCustoAjusteNovo(maskBRLFromDigits(String(Math.round(baseSeguro * 100))));
                                                setCustoAjusteFreteTotal(maskBRLFromDigits(String(Math.round((Number(lote.frete_total) || 0) * 100))));
                                            }
                                        }}
                                    >
                                        <option value={0}>Selecionar...</option>
                                        {lotesDisponiveis.map((lote) => (
                                            <option key={lote.id} value={lote.id}>
                                                {lote.numero_lote} — entrada {clampInt(lote.quantidade_inicial)} — disponível {clampInt(lote.quantidade_atual)}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            ) : null}
            
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Preço de custo por unidade">
                                    <TextInput
                                        value={custoAjusteNovo}
                                        onChange={(e) => setCustoAjusteNovo(maskBRLInput(e.target.value))}
                                        placeholder="R$ 0,00"
                                    />
                                </Field>
                                <Field label="Frete total">
                                    <TextInput
                                        value={custoAjusteFreteTotal}
                                        onChange={(e) => setCustoAjusteFreteTotal(maskBRLInput(e.target.value))}
                                        placeholder="R$ 0,00"
                                    />
                                </Field>
                            </div>
            
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div className="rounded-2xl bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                                    <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">Quantidade rateio</p>
                                    <p className="mt-1 text-lg font-bold text-[#313C55] dark:text-white">{resumo.quantidadeRateio}</p>
                                </div>
                                <div className="rounded-2xl bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                                    <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">Frete unitário</p>
                                    <p className="mt-1 text-lg font-bold text-[#313C55] dark:text-white">{moneyBRL(resumo.freteUnitario)}</p>
                                </div>
                                <div className="col-span-2 rounded-2xl bg-[#313C55] dark:bg-[#3D6A99] p-3 text-white">
                                    <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-white/75">Custo final por unidade</p>
                                    <p className="mt-1 text-xl font-bold">{moneyBRL(resumo.custoFinal)}</p>
                                </div>
                            </div>
            
                            <Field label="Observação (opcional)">
                                <TextArea
                                    rows={4}
                                    value={custoAjusteObservacao}
                                    onChange={(e) => setCustoAjusteObservacao(e.target.value)}
                                    placeholder="Ex: correção conforme nota fiscal, inclusão de frete..."
                                />
                            </Field>
            
                            <div className="flex gap-2 lg:justify-end [&>button]:flex-1 lg:[&>button]:flex-none">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={custoAjusteBusy}
                                    onClick={() => setCustoAjusteOpen(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    disabled={custoAjusteBusy || (custoAjusteTipo === "LOTE" && !custoAjusteLoteId)}
                                    onClick={prepararConfirmacaoAjusteCusto}
                                >
                                    Revisar ajuste
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>
        </>
    );
}
