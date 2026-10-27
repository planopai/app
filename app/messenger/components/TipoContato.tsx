"use client";

/**
 * Tipo do contato no painel do cliente (27/10/2026): cliente, fornecedor, prestador (contas a pagar), parceiro ou público,
 * com empresa e observação. A Aurora classifica sozinha quem se apresenta como fornecedor ou parceiro; aqui a equipe corrige.
 * Servidor: aurora_07.php (contato_tipo).
 * Estrela de contato frequente (27/10/2026): aparece na lista da Nova conversa para a equipe toda (aurora_09.php).
 */
import React, { useEffect, useState } from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { apiJson, API_BASE } from "@/components/messenger/api";
import type { Conversa } from "@/components/messenger/tipos";
import { TIPOS_CONTATO } from "./NovaConversaWhats";

const campo = "h-10 w-full rounded-xl border border-[#E1E5EC] bg-[#F6F8FB] px-3 text-[14.5px] outline-none dark:border-white/15 dark:bg-[#1C2334]";

export function nomeTipoContato(tipo?: string | null) {
    return TIPOS_CONTATO.find(([v]) => v === (tipo || "cliente"))?.[1] || "Cliente";
}

export default function TipoContato({ conversa, onSalvo }: { conversa: Conversa; onSalvo?: () => void }) {
    const ct = conversa.contato;
    const [aberto, setAberto] = useState(false);
    const [tipo, setTipo] = useState(ct?.tipo || "cliente");
    const [empresa, setEmpresa] = useState(ct?.empresa || "");
    const [obs, setObs] = useState(ct?.observacao || "");
    const [msg, setMsg] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [favorito, setFavorito] = useState<boolean | null>(null); // null = sem a coluna favorito no banco

    useEffect(() => {
        let vivo = true;
        setFavorito(null);
        apiJson(`${API_BASE}/aurora_09.php?action=contato&conversa_id=${conversa.id}&_=${Date.now()}`)
            .then((r) => {
                if (vivo && r.dados?.tem_favorito) setFavorito(!!r.dados.favorito);
            })
            .catch(() => {
                /* sem o aurora_09.php ou sem permissão: a estrela não aparece */
            });
        return () => {
            vivo = false;
        };
    }, [conversa.id]);

    async function trocarFavorito() {
        if (favorito === null) return;
        try {
            const r = await apiJson(`${API_BASE}/aurora_09.php?action=favorito`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversa_id: conversa.id, favorito: !favorito }),
            });
            setFavorito(!!r.dados?.favorito);
            setMsg(r.msg || "");
        } catch (e: any) {
            setMsg(e.message || "Não foi possível marcar.");
        }
    }

    useEffect(() => {
        setTipo(ct?.tipo || "cliente");
        setEmpresa(ct?.empresa || "");
        setObs(ct?.observacao || "");
        setAberto(false);
        setMsg("");
    }, [conversa.id, ct?.tipo, ct?.empresa, ct?.observacao]);

    if (!ct) return null;
    if (ct.tipo === undefined && !aberto) return null; // banco ainda sem as colunas do tipo de contato

    async function salvar() {
        setOcupado(true);
        setMsg("");
        try {
            const r = await apiJson(`${API_BASE}/aurora_07.php?action=contato_tipo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversa_id: conversa.id, tipo, empresa, observacao: obs }),
            });
            setMsg(r.msg || "Salvo.");
            setAberto(false);
            onSalvo?.();
        } catch (e: any) {
            setMsg(e.message || "Não foi possível salvar.");
        } finally {
            setOcupado(false);
        }
    }

    return (
        <div className="mt-3 rounded-xl border border-[#E1E5EC] p-3 dark:border-white/15">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Tipo de contato</div>
                    <div className="truncate text-[15px] font-extrabold">{nomeTipoContato(ct.tipo)}{ct.empresa ? ` · ${ct.empresa}` : ""}</div>
                </div>
                {favorito !== null && (
                    <button type="button" onClick={trocarFavorito} className="inline-flex h-11 w-11 shrink-0 items-center justify-center" aria-label={favorito ? "Tirar dos contatos frequentes" : "Marcar como contato frequente"} title={favorito ? "Tirar dos contatos frequentes" : "Marcar como contato frequente"}>
                        {favorito ? <IconStarFilled size={20} className="text-[#E4BC30]" /> : <IconStar size={20} className="text-[#8A93A6]" />}
                    </button>
                )}
                <button type="button" onClick={() => setAberto((v) => !v)} className="text-[13px] font-extrabold text-[#3D6A99] dark:text-[#A9BED6]">{aberto ? "fechar" : "alterar"}</button>
            </div>
            {!aberto && ct.observacao && <p className="mb-0 mt-1 text-[13.5px] text-[#4A5468] dark:text-[#C9D1DE]">{ct.observacao}</p>}
            {msg && <p className="mb-0 mt-1 text-[13px] font-bold">{msg}</p>}
            {aberto && (
                <div className="mt-2 flex flex-col gap-2">
                    <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de contato">
                        {TIPOS_CONTATO.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                    <input className={campo} value={empresa} maxLength={150} onChange={(e) => setEmpresa(e.target.value)} placeholder="Empresa (opcional)" aria-label="Empresa" />
                    <textarea className={`${campo} h-20 py-2`} value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} placeholder="Observação para a equipe (ex.: fornecedor de urnas, envia boleto todo dia 10)" aria-label="Observação" />
                    <button type="button" disabled={ocupado} onClick={salvar} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-50 dark:bg-[#3D6A99]">{ocupado ? "Salvando…" : "Salvar"}</button>
                </div>
            )}
        </div>
    );
}
