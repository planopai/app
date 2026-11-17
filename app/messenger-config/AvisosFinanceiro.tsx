"use client";

/**
 * Configurações do Messenger › Avisos do financeiro — 17/11/2026. Back-end: aurora_15.php.
 * Liga e desliga cada aviso. Cada aviso vai pela notificação do app (abre a tela de origem) e a Aurora interna conta os avisos
 * do dia quando a pessoa abre a conversa ou pergunta. Quem recebe sai da chave da tela, em Permissões.
 */
import React, { useEffect, useState } from "react";
import { API_BASE, apiJson } from "@/components/messenger/api";

const URL_AVISOS = `${API_BASE}/aurora_15.php`;

type Cfg = Record<string, boolean>;
type Ultima = { fim?: string; msg?: string; erros?: string[] } | null;

const DETALHE: Record<string, string> = {
    pagar: "Para quem tem Contas a Pagar · todo dia às 8h (na sexta, as que vencem até segunda).",
    saldo: "Para quem tem a Tesouraria (Gestão) e a Gestão · uma vez por dia, enquanto o saldo previsto em 30 dias estiver abaixo do mínimo.",
    prov: "Para quem tem a Provisão · quando uma natureza de despesa passa de 100% no mês (uma vez por natureza).",
    caixa: "Para o dono do caixa e quem tem a Tesouraria (Gestão) · quando o caixa diário fecha sozinho às 18:30.",
    nf: "Para quem tem Contas a Receber · dia 1 de cada mês, com as OS da Prefeitura do mês anterior ainda sem NF.",
};

const cartao = "rounded-2xl border border-[#E1E5EC] bg-white p-4 md:p-5 dark:border-white/12 dark:bg-[#232B3F]";
const btnPri = "inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";
const btnSec = "inline-flex h-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] disabled:opacity-40 dark:border-white/25 dark:bg-[#232B3F] dark:text-white";

export function AbaAvisosFinanceiro({ avisar }: { avisar: (m: string) => void }) {
    const [cfg, setCfg] = useState<Cfg | null>(null);
    const [tipos, setTipos] = useState<Record<string, string>>({});
    const [ultima, setUltima] = useState<Ultima>(null);
    const [erro, setErro] = useState("");
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        apiJson(`${URL_AVISOS}?action=config&_=${Date.now()}`)
            .then((j: any) => {
                setCfg(j.dados.cfg);
                setTipos(j.dados.tipos || {});
                setUltima(j.dados.ultima || null);
            })
            .catch((e: any) => setErro(e?.message || "Não foi possível carregar."));
    }, []);

    const post = async (acao: string, corpo: Record<string, unknown> = {}) => {
        setOcupado(true);
        setErro("");
        try {
            const j: any = await apiJson(`${URL_AVISOS}?action=${acao}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
            avisar(String(j.msg || "Feito."));
            if (acao === "rodar") setUltima(j.dados || null);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
        } finally {
            setOcupado(false);
        }
    };

    return (
        <section className={`${cartao} flex flex-col gap-4`}>
            <div>
                <h2 className="m-0 text-lg font-extrabold">Avisos do financeiro</h2>
                <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                    Cada aviso chega pela notificação do app e abre a tela de origem. A Aurora conta os avisos do dia quando a pessoa abre a conversa ou pergunta. Quem recebe sai da chave da tela, em Permissões. Nada vai para cliente.
                </p>
            </div>
            {erro ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erro}</div> : null}
            {!cfg && !erro ? <p className="text-[14px] text-[#5B6478]">Carregando…</p> : null}
            {cfg ? (
                <>
                    <div className="flex flex-col divide-y divide-[#E1E5EC] dark:divide-white/10">
                        {Object.keys(tipos).map((k) => (
                            <label key={k} className="flex min-h-[52px] cursor-pointer items-start gap-3 py-3">
                                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#313C55]" checked={!!cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} />
                                <span className="min-w-0">
                                    <b className="block text-[15px]">{tipos[k]}</b>
                                    <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{DETALHE[k] || ""}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnPri} disabled={ocupado} onClick={() => void post("config_salvar", { cfg })}>
                            Salvar
                        </button>
                        <button type="button" className={btnSec} disabled={ocupado} onClick={() => void post("rodar")}>
                            Rodar agora
                        </button>
                    </div>
                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                        {ultima?.fim ? `Última verificação: ${new Date(ultima.fim).toLocaleString("pt-BR")} · ${ultima.msg || ""}` : "Ainda não rodou. Confira o cron (a cada 15 minutos)."}
                        {ultima?.erros?.length ? ` Erros: ${ultima.erros.join(" | ")}` : ""}
                    </p>
                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">"Rodar agora" envia de verdade os avisos que estiverem pendentes (o de NF entra mesmo fora do dia 1).</p>
                </>
            ) : null}
        </section>
    );
}
