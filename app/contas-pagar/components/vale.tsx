'use client';

/**
 * Vale e empréstimo que nascem no financeiro — 17/11/2026. Back-end: fin_vales.php.
 * Usado na Tesouraria (botão "Vale" do caixa: o dinheiro sai da gaveta) e no Contas a Pagar (botão "Vale ou empréstimo":
 * caixa ou banco). Vira conta a pagar já paga (natureza Adiantamento de salário) e a folha abate o vale ou as parcelas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { api, brl, BTN_PRI, BTN_SEC, CAMPO, ERRO, hojeISO, Janela, mensagemErro, mesBR, NOTA, paraNumero, PILULA, ROTULO, SUB } from './fin';

export const URL_VALES = 'https://api.planoassistencialintegrado.com.br/fin_vales.php';

type CadVale = {
    colaboradores: { id: number; nome: string }[];
    caixas: { id: number; nome: string; aberto: boolean; saldo: number }[];
    bancos: { id: number; nome: string }[];
    formas: { id: number; codigo: string; nome: string }[];
    areas: { id: number; nome: string; pai_id: number | null }[];
    locais: { id: number; nome: string }[];
    natureza: { id: number; nome: string } | null;
    ultima_folha_paga: { competencia: string; data_pagamento: string } | null;
    competencia_sugerida: string;
};

function opcoesAreaVale(areas: CadVale['areas']) {
    const out: { id: number; nome: string }[] = [];
    areas.filter((a) => a.pai_id === null).forEach((a) => {
        const linhas = areas.filter((l) => l.pai_id === a.id);
        out.push({ id: a.id, nome: linhas.length ? `${a.nome} (geral)` : a.nome });
        linhas.forEach((l) => out.push({ id: l.id, nome: `${a.nome} · ${l.nome}` }));
    });
    return out;
}

/**
 * contaId: caixa fixo (Tesouraria). Sem contaId, a pessoa escolhe um caixa aberto ou um banco (Contas a Pagar).
 */
export function ModalVale({ contaId, onFechar, feito }: { contaId?: number; onFechar: () => void; feito: (msg: string) => void }) {
    const [cad, setCad] = useState<CadVale | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [tipo, setTipo] = useState<'vale' | 'emprestimo'>('vale');
    const [f, setF] = useState({
        colaborador_id: '' as number | '',
        valor: '',
        abater_em: 'SALARIO' as 'SALARIO' | 'COMISSAO',
        descricao: '',
        valor_total: '',
        valor_parcela: '',
        primeira_competencia: '',
        area_id: '' as number | '',
        local_id: '' as number | '',
        conta_id: (contaId ?? '') as number | '',
        forma_id: '' as number | '',
        data: hojeISO(),
    });

    useEffect(() => {
        api(URL_VALES, 'cadastros')
            .then((j) => {
                const d = j.dados as CadVale;
                setCad(d);
                setF((x) => ({ ...x, primeira_competencia: x.primeira_competencia || d.competencia_sugerida }));
            })
            .catch((e) => {
                const m = mensagemErro(e, 'Não foi possível carregar.');
                if (m) setErro(m);
            });
    }, []);

    const conta = useMemo(() => {
        if (!cad || f.conta_id === '') return null;
        const c = cad.caixas.find((x) => x.id === f.conta_id);
        if (c) return { ...c, caixa: true as const };
        const b = cad.bancos.find((x) => x.id === f.conta_id);
        return b ? { ...b, caixa: false as const, aberto: true, saldo: 0 } : null;
    }, [cad, f.conta_id]);

    const parcelas = useMemo(() => {
        const t = paraNumero(f.valor_total);
        const p = paraNumero(f.valor_parcela);
        if (!t || !p || Number.isNaN(t) || Number.isNaN(p) || p <= 0 || p > t) return null;
        const n = Math.ceil(Math.round((t / p) * 1e6) / 1e6);
        return { n, ultima: Math.round((t - p * (n - 1)) * 100) / 100 };
    }, [f.valor_total, f.valor_parcela]);

    const ok = async () => {
        setErro(null);
        if (f.colaborador_id === '') return setErro('Escolha o colaborador.');
        if (f.area_id === '') return setErro('Escolha a área de negócio.');
        if (f.conta_id === '' || !conta) return setErro('Escolha de onde sai o dinheiro.');
        if (conta.caixa && !conta.aberto) return setErro(`${conta.nome} não está aberto.`);
        if (!conta.caixa && f.forma_id === '') return setErro('Escolha a forma de pagamento.');
        const base: Record<string, unknown> = {
            colaborador_id: f.colaborador_id,
            area_id: f.area_id,
            local_id: f.local_id || null,
            conta_id: f.conta_id,
            ...(conta.caixa ? {} : { forma_id: f.forma_id, data: f.data }),
        };
        let corpo: Record<string, unknown>;
        if (tipo === 'vale') {
            const v = paraNumero(f.valor);
            if (!v || Number.isNaN(v) || v <= 0) return setErro('Informe o valor do vale.');
            corpo = { ...base, valor: v, abater_em: f.abater_em, descricao: f.descricao || null };
        } else {
            const t = paraNumero(f.valor_total);
            const p = paraNumero(f.valor_parcela);
            if (!t || !p || Number.isNaN(t) || Number.isNaN(p) || t <= 0 || p <= 0) return setErro('Informe o valor emprestado e o valor da parcela.');
            if (!parcelas) return setErro('A parcela não pode ser maior que o valor emprestado.');
            corpo = { ...base, valor_total: t, valor_parcela: p, primeira_competencia: f.primeira_competencia, observacao: f.descricao || null };
        }
        setOcupado(true);
        try {
            const j = await api(URL_VALES, tipo, corpo);
            feito(j.msg);
            onFechar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível lançar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    const caixaFixo = contaId ? cad?.caixas.find((c) => c.id === contaId) : null;
    const corte = cad?.ultima_folha_paga ? cad.ultima_folha_paga.data_pagamento.split('-').reverse().join('/') : null;

    return (
        <Janela
            titulo={tipo === 'vale' ? 'Vale' : 'Empréstimo'}
            sub={contaId ? 'Sai do dinheiro da gaveta, vira conta a pagar paga e vai para a folha.' : 'Vira conta a pagar paga e vai para a folha.'}
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!cad || ocupado} onClick={() => void ok()}>
                        {tipo === 'vale' ? 'Lançar vale' : 'Lançar empréstimo'}
                    </button>
                </>
            }
        >
            {!cad && !erro ? <p className={SUB}>Carregando…</p> : null}
            {cad ? (
                <>
                    <div className="flex gap-2">
                        <button type="button" className={`${PILULA(tipo === 'vale')} min-h-11 flex-1`} onClick={() => setTipo('vale')}>
                            Vale
                        </button>
                        <button type="button" className={`${PILULA(tipo === 'emprestimo')} min-h-11 flex-1`} onClick={() => setTipo('emprestimo')}>
                            Empréstimo
                        </button>
                    </div>
                    <label>
                        <span className={ROTULO}>Colaborador</span>
                        <select className={CAMPO} value={f.colaborador_id} onChange={(e) => setF({ ...f, colaborador_id: e.target.value ? Number(e.target.value) : '' })}>
                            <option value="">Escolha</option>
                            {cad.colaboradores.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                    {tipo === 'vale' ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label>
                                <span className={ROTULO}>Valor</span>
                                <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
                            </label>
                            <label>
                                <span className={ROTULO}>Abater no</span>
                                <select className={CAMPO} value={f.abater_em} onChange={(e) => setF({ ...f, abater_em: e.target.value as 'SALARIO' | 'COMISSAO' })}>
                                    <option value="SALARIO">Salário</option>
                                    <option value="COMISSAO">Comissão</option>
                                </select>
                            </label>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label>
                                    <span className={ROTULO}>Valor emprestado</span>
                                    <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={f.valor_total} onChange={(e) => setF({ ...f, valor_total: e.target.value })} />
                                </label>
                                <label>
                                    <span className={ROTULO}>Valor da parcela</span>
                                    <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={f.valor_parcela} onChange={(e) => setF({ ...f, valor_parcela: e.target.value })} />
                                </label>
                            </div>
                            <label>
                                <span className={ROTULO}>Primeira folha</span>
                                <input className={CAMPO} type="month" value={f.primeira_competencia} onChange={(e) => setF({ ...f, primeira_competencia: e.target.value })} />
                            </label>
                            {parcelas ? (
                                <p className={SUB}>
                                    {parcelas.n} parcela(s) de {mesBR(f.primeira_competencia || cad.competencia_sugerida)} em diante
                                    {parcelas.n > 1 && parcelas.ultima !== paraNumero(f.valor_parcela) ? `; a última de ${brl(parcelas.ultima)}` : ''}.
                                </p>
                            ) : null}
                        </>
                    )}
                    <label>
                        <span className={ROTULO}>{tipo === 'vale' ? 'Descrição (opcional)' : 'Observação (opcional)'}</span>
                        <input className={CAMPO} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label>
                            <span className={ROTULO}>Área de negócio</span>
                            <select className={CAMPO} value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value ? Number(e.target.value) : '' })}>
                                <option value="">Escolha</option>
                                {opcoesAreaVale(cad.areas).map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className={ROTULO}>Local (opcional)</span>
                            <select className={CAMPO} value={f.local_id} onChange={(e) => setF({ ...f, local_id: e.target.value ? Number(e.target.value) : '' })}>
                                <option value="">—</option>
                                {cad.locais.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.nome}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {contaId ? (
                        <p className={SUB}>
                            Sai do {caixaFixo?.nome ?? 'caixa'}
                            {caixaFixo ? ` · em espécie: ${brl(caixaFixo.saldo)}` : ''}.
                        </p>
                    ) : (
                        <>
                            <label>
                                <span className={ROTULO}>De onde sai o dinheiro</span>
                                <select className={CAMPO} value={f.conta_id} onChange={(e) => setF({ ...f, conta_id: e.target.value ? Number(e.target.value) : '' })}>
                                    <option value="">Escolha</option>
                                    {cad.caixas.length ? (
                                        <optgroup label="Caixa (dinheiro)">
                                            {cad.caixas.map((c) => (
                                                <option key={c.id} value={c.id} disabled={!c.aberto}>
                                                    {c.nome}
                                                    {c.aberto ? ` · ${brl(c.saldo)}` : ' · fechado'}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ) : null}
                                    {cad.bancos.length ? (
                                        <optgroup label="Banco">
                                            {cad.bancos.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.nome}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ) : null}
                                </select>
                            </label>
                            {conta && !conta.caixa ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label>
                                        <span className={ROTULO}>Forma</span>
                                        <select className={CAMPO} value={f.forma_id} onChange={(e) => setF({ ...f, forma_id: e.target.value ? Number(e.target.value) : '' })}>
                                            <option value="">Escolha</option>
                                            {cad.formas.map((x) => (
                                                <option key={x.id} value={x.id}>
                                                    {x.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        <span className={ROTULO}>Data do pagamento</span>
                                        <input className={CAMPO} type="date" max={hojeISO()} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
                                    </label>
                                </div>
                            ) : null}
                        </>
                    )}
                    <div className={NOTA}>
                        <span>
                            Natureza: {cad.natureza ? cad.natureza.nome : 'Adiantamento de salário (não encontrada no plano de contas)'}.
                            {tipo === 'vale'
                                ? corte
                                    ? ` A folha abate o vale; feito a partir de ${corte} (pagamento da última folha), vai para a folha seguinte.`
                                    : ' A folha abate o vale.'
                                : ' A folha desconta as parcelas mês a mês.'}
                        </span>
                    </div>
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}
