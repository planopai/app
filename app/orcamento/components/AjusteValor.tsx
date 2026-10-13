"use client";

/*
 * Ajuste de valores do orçamento (14/10/2026) — as mesmas regras da OS Particular (ItensOSAjuste / os_regras.php):
 *  - Item: valor só aumenta (acréscimo livre, não aparece separado; translado pelo valor do km) e desconto em R$.
 *  - Desconto geral: % ou R$, depois dos descontos dos itens. Por %, mostra a base.
 *  - Limite: todos os descontos juntos até 8% (produto com valor mínimo próprio, como a Tanatopraxia, vai até o mínimo).
 *    Gestão e Financeiro passam. O servidor confere ao aplicar (prévia com "antes") e de novo ao salvar.
 * Nada é gravado aqui: o ajuste entra no rascunho e vale quando o orçamento for salvo.
 */

import React, { useState } from "react";
import { calcularPrevia } from "./api";
import { brl, rascunhoParaServidor, type Linha, type Previa, type Rascunho } from "./tipos";
import { Aviso, BTN_PRI, BTN_SEC, CAMPO, Campo, Janela, MUTED } from "./ui";

const num = (s: string) => {
    const t = String(s ?? "").trim().replace(/[^\d,.-]/g, "");
    if (!t) return 0;
    const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : 0;
};
const dec = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
const r2 = (v: number) => Math.round(v * 100) / 100;
const pctTxt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

/** Confere no servidor (mesma regra da gravação) e devolve a prévia nova. */
async function conferir(novo: Rascunho, atual: Rascunho): Promise<Previa> {
    const p = await calcularPrevia(rascunhoParaServidor(novo), rascunhoParaServidor(atual));
    if (p.bloqueio) throw new Error(p.bloqueio);
    return p;
}

function textoLimite(previa: Previa | null) {
    const res = previa?.resumo;
    if (!res) return "";
    if (previa?.pode_passar_limite) return "Gestão / Financeiro: pode passar de 8%.";
    const min = res.minimos?.length ? ` ${res.minimos.map((m) => `${m.nome}: até ${brl(m.valor)}`).join("; ")} (fora dos 8%).` : "";
    return `Todos os descontos juntos até ${pctTxt(res.limite_percentual)}% (${brl(res.limite_valor)}; ${brl(res.reducao_no_limite)} já usados).${min}`;
}

function Rodape({ salvando, onFechar, onAplicar }: { salvando: boolean; onFechar: () => void; onAplicar: () => void }) {
    return (
        <>
            <button type="button" className={BTN_SEC} disabled={salvando} onClick={onFechar}>
                Cancelar
            </button>
            <button type="button" className={BTN_PRI} disabled={salvando} onClick={onAplicar}>
                {salvando ? "Conferindo…" : "Aplicar"}
            </button>
        </>
    );
}

export function JanelaAjusteItem({ linha, rascunho, previa, onAplicar, onFechar }: {
    linha: Linha;
    rascunho: Rascunho;
    previa: Previa | null;
    onAplicar: (novo: Rascunho, p: Previa) => void;
    onFechar: () => void;
}) {
    const ehKm = linha.unidade === "km" && !!linha.km;
    const km = Number(linha.km) || 0;
    const tabUnit = Number(linha.valor_tabela_unit ?? linha.valor_tabela ?? linha.valor) || 0;
    const unitAtual = ehKm ? (Number(linha.valor) || 0) / km : Number(linha.valor) || 0;
    const [unit, setUnit] = useState(dec(unitAtual));
    const [desc, setDesc] = useState((Number(linha.desconto) || 0) > 0 ? dec(Number(linha.desconto)) : "");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    const u = Math.max(num(unit), tabUnit);
    const valor = r2(ehKm ? (u > tabUnit + 0.004 ? u * km : Number(linha.valor_tabela) || 0) : u);
    const d = Math.min(num(desc), valor);

    const aplicar = async () => {
        if (salvando) return;
        setErro("");
        if (num(unit) < tabUnit - 0.004) {
            setErro(`O valor ${ehKm ? "do km" : "do item"} não pode ficar abaixo de ${brl(tabUnit)}. Para reduzir, use o desconto em R$.`);
            return;
        }
        if (num(desc) > valor + 0.01) {
            setErro(`O desconto (${brl(num(desc))}) é maior que o valor do item (${brl(valor)}).`);
            return;
        }
        const id = String(linha.id || linha.chave);
        const ajustes = { ...rascunho.ajustes };
        const vu = u > tabUnit + 0.004 ? r2(u) : 0;
        if (vu > 0 || d > 0) ajustes[id] = { produto_id: Number(linha.produto_id) || 0, valor_unit: vu, desconto: r2(d) };
        else delete ajustes[id];
        const novo = { ...rascunho, ajustes };
        setSalvando(true);
        try {
            onAplicar(novo, await conferir(novo, rascunho));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível aplicar.");
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Valor e desconto do item" subtitulo={linha.nome} onFechar={() => !salvando && onFechar()} largura="max-w-[460px]" rodape={<Rodape salvando={salvando} onFechar={onFechar} onAplicar={() => void aplicar()} />}>
            <div className="flex flex-col gap-3">
                {ehKm ? <p className={`text-sm ${MUTED}`}>Distância: {String(km).replace(".", ",")} km (a quantidade de km não muda aqui).</p> : null}
                <Campo rotulo={ehKm ? "Valor por km (só aumenta)" : "Valor do item (só aumenta)"} dica={`Tabela: ${brl(tabUnit)}${ehKm ? " por km" : ""}`}>
                    <input className={CAMPO} inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </Campo>
                <Campo rotulo="Desconto (R$)">
                    <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={desc} onChange={(e) => setDesc(e.target.value)} />
                </Campo>
                <div className="rounded-xl bg-[#F6F8FB] px-3 py-2 text-sm font-bold dark:bg-[#1C2334]">
                    Valor {brl(valor)} · Desconto {d ? `− ${brl(d)}` : brl(0)} · Final {brl(valor - d)}
                </div>
                <p className={`text-xs ${MUTED}`}>{textoLimite(previa)}</p>
                {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
            </div>
        </Janela>
    );
}

export function JanelaDescontoGeral({ rascunho, previa, onAplicar, onFechar }: {
    rascunho: Rascunho;
    previa: Previa | null;
    onAplicar: (novo: Rascunho, p: Previa) => void;
    onFechar: () => void;
}) {
    const res = previa?.resumo;
    const atual = rascunho.desconto_geral;
    const [modo, setModo] = useState<"%" | "R$">(atual?.tipo === "VALOR" ? "R$" : "%");
    const [val, setVal] = useState(atual ? (atual.tipo === "VALOR" ? dec(atual.valor) : pctTxt(atual.valor)) : "");
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);
    const base = res?.subtotal ?? 0;
    const v = num(val);
    const dg = modo === "%" ? r2((base * Math.min(100, v)) / 100) : Math.min(v, base);

    const aplicar = async () => {
        if (salvando) return;
        setErro("");
        if (v < 0 || (modo === "%" && v > 100)) {
            setErro(modo === "%" ? "O percentual deve estar entre 0 e 100." : "O desconto não pode ser negativo.");
            return;
        }
        if (modo === "R$" && v > base + 0.01) {
            setErro(`O desconto (${brl(v)}) é maior que o subtotal (${brl(base)}).`);
            return;
        }
        const novo: Rascunho = { ...rascunho, desconto_geral: v > 0 ? { tipo: modo === "%" ? "PERCENTUAL" : "VALOR", valor: modo === "%" ? v : r2(v) } : null };
        setSalvando(true);
        try {
            onAplicar(novo, await conferir(novo, rascunho));
        } catch (e: any) {
            setErro(e?.message || "Não foi possível aplicar.");
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Desconto geral" subtitulo="Calculado depois dos descontos dos itens." onFechar={() => !salvando && onFechar()} largura="max-w-[460px]" rodape={<Rodape salvando={salvando} onFechar={onFechar} onAplicar={() => void aplicar()} />}>
            <div className="flex flex-col gap-3">
                <p className={`text-sm ${MUTED}`}>
                    Subtotal {brl(res?.bruto ?? 0)} · descontos nos itens {res?.desconto_itens ? `− ${brl(res.desconto_itens)}` : brl(0)} · base do desconto geral <b>{brl(base)}</b>
                </p>
                <div className="flex gap-2">
                    <div role="group" aria-label="Tipo do desconto" className="inline-flex shrink-0 overflow-hidden rounded-xl border-[1.5px] border-[#C9D1DE] dark:border-white/25">
                        {(["%", "R$"] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                aria-pressed={modo === m}
                                onClick={() => setModo(m)}
                                className={`h-12 min-w-[56px] px-3 text-[15px] font-extrabold ${modo === m ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "bg-white text-[#313C55] dark:bg-transparent dark:text-white"}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    <input className={CAMPO} inputMode="decimal" placeholder={modo === "%" ? "0" : "0,00"} value={val} onChange={(e) => setVal(e.target.value)} aria-label="Desconto geral" />
                </div>
                <div className="rounded-xl bg-[#F6F8FB] px-3 py-2 text-sm font-bold dark:bg-[#1C2334]">
                    Desconto geral {dg ? `− ${brl(dg)}` : brl(0)} · Total {brl(base - dg)}
                </div>
                <p className={`text-xs ${MUTED}`}>{textoLimite(previa)} Para tirar o desconto, deixe 0.</p>
                {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
            </div>
        </Janela>
    );
}
