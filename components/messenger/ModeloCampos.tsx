"use client";

/**
 * Campos das variáveis de um modelo da Meta com preenchimento automático (macros, 27/10/2026).
 * Cada {{n}} pode puxar um dado do sistema (nome e sobrenome do contato, quem envia, contrato, valor em aberto e
 * vencimento da Unymos…). Quem configura o Messenger salva o preenchimento de cada modelo uma vez; os demais só
 * conferem a prévia. Usado na Nova conversa pelo WhatsApp e na conversa com a janela de 24 h fechada.
 * Servidor: aurora_07.php (macros, macros_salvar).
 */
import React, { useEffect, useState } from "react";
import { apiJson, API_BASE } from "@/components/messenger/api";

export type ModeloMeta = { nome: string; idioma: string; categoria?: string; corpo: string; parametros: number };
type Macros = { fontes: Record<string, string>; mapa: Record<string, string[]>; valores: Record<string, string>; conhecido: boolean; pode_configurar: boolean };

const FINANCEIRO = ["valor_aberto", "vencimento"];

export default function ModeloCampos({ modelo, conversaId, telefone, params, onParams, compacto = false }: {
    modelo: ModeloMeta; conversaId?: number; telefone?: string; params: string[]; onParams: (p: string[]) => void; compacto?: boolean;
}) {
    const chave = `${modelo.nome}|${modelo.idioma}`;
    const [m, setM] = useState<Macros | null>(null);
    const [fontes, setFontes] = useState<string[]>([]);
    const [mudouFontes, setMudouFontes] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [msg, setMsg] = useState("");
    const tel = (telefone || "").replace(/\D/g, "");

    // busca o mapa e os valores (com a Unymos só se alguma variável usa valor ou vencimento)
    useEffect(() => {
        let vivo = true;
        const t = setTimeout(async () => {
            setCarregando(true);
            try {
                const base = async (financeiro: boolean) => {
                    const u = new URL(`${API_BASE}/aurora_07.php`);
                    u.searchParams.set("action", "macros");
                    if (conversaId) u.searchParams.set("conversa_id", String(conversaId));
                    else if (tel.length >= 10) u.searchParams.set("telefone", tel);
                    if (financeiro) u.searchParams.set("financeiro", "1");
                    u.searchParams.set("_", String(Date.now()));
                    return (await apiJson(u.toString())).dados as Macros;
                };
                let d = await base(false);
                const f = d.mapa[chave] || Array(modelo.parametros).fill("livre");
                if (f.some((x) => FINANCEIRO.includes(x))) d = await base(true);
                if (!vivo) return;
                setM(d);
                setFontes(Array.from({ length: modelo.parametros }, (_, i) => f[i] || "livre"));
                setMudouFontes(false);
            } catch (e: any) {
                if (vivo) setMsg(e?.message || "Não foi possível buscar os dados para o modelo.");
            } finally {
                if (vivo) setCarregando(false);
            }
        }, conversaId ? 0 : 500);
        return () => {
            vivo = false;
            clearTimeout(t);
        };
    }, [chave, conversaId, tel, modelo.parametros]); // eslint-disable-line react-hooks/exhaustive-deps

    // aplica os valores das macros nos campos (o que for "digitar na hora" fica como a pessoa escreveu)
    useEffect(() => {
        if (!m || !fontes.length) return;
        onParams(Array.from({ length: modelo.parametros }, (_, i) => (fontes[i] && fontes[i] !== "livre" ? m.valores[fontes[i]] || params[i] || "" : params[i] || "")));
    }, [m, fontes]); // eslint-disable-line react-hooks/exhaustive-deps

    async function trocarFonte(i: number, f: string) {
        const nova = fontes.map((x, j) => (j === i ? f : x));
        setFontes(nova);
        setMudouFontes(true);
        if (FINANCEIRO.includes(f) && m && !m.valores.valor_aberto && !m.valores.aviso) {
            try {
                const u = new URL(`${API_BASE}/aurora_07.php`);
                u.searchParams.set("action", "macros");
                if (conversaId) u.searchParams.set("conversa_id", String(conversaId));
                else if (tel.length >= 10) u.searchParams.set("telefone", tel);
                u.searchParams.set("financeiro", "1");
                setM((await apiJson(u.toString())).dados as Macros);
            } catch {
                /* fica para digitar */
            }
        }
    }

    async function salvarFontes() {
        setMsg("");
        try {
            const r = await apiJson(`${API_BASE}/aurora_07.php?action=macros_salvar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ modelo: modelo.nome, idioma: modelo.idioma, fontes }),
            });
            setMsg(r.msg || "Salvo.");
            setMudouFontes(false);
            if (m) setM({ ...m, mapa: r.dados.mapa });
        } catch (e: any) {
            setMsg(e?.message || "Não foi possível salvar.");
        }
    }

    if (modelo.parametros <= 0) return null;
    const campo = `${compacto ? "h-10" : "h-12"} w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[15px] outline-none dark:border-white/12 dark:bg-[#1C2334]`;
    return (
        <div className="flex flex-col gap-2">
            {carregando && <span className="text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">Buscando os dados do contato…</span>}
            {Array.from({ length: modelo.parametros }).map((_, i) => (
                <div key={i} className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[48px_minmax(0,200px)_minmax(0,1fr)]">
                    <b className="text-[14px]">{`{{${i + 1}}}`}</b>
                    <select className={`${campo} text-[13.5px]`} value={fontes[i] || "livre"} onChange={(e) => trocarFonte(i, e.target.value)} aria-label={`Preenchimento de {{${i + 1}}}`}>
                        {Object.entries(m?.fontes || { livre: "Digitar na hora" }).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                    </select>
                    <input className={`${campo} col-span-2 sm:col-span-1`} value={params[i] || ""} onChange={(e) => onParams(Array.from({ length: modelo.parametros }, (_, j) => (j === i ? e.target.value : params[j] || "")))}
                        placeholder={fontes[i] && fontes[i] !== "livre" ? "Sem dado no sistema: digite" : "Digite"} aria-label={`Valor de {{${i + 1}}}`} />
                </div>
            ))}
            {m?.valores.aviso && <span className="text-[13px] font-bold text-[#8A5A00] dark:text-[#F7E39A]">{m.valores.aviso}</span>}
            {m?.pode_configurar && mudouFontes && (
                <button type="button" onClick={salvarFontes} className="inline-flex h-9 w-fit items-center rounded-xl border border-[#C9D1DE] px-3 text-[13px] font-extrabold dark:border-white/20">Lembrar este preenchimento para o modelo</button>
            )}
            {msg && <span className="text-[13px] font-bold">{msg}</span>}
        </div>
    );
}
