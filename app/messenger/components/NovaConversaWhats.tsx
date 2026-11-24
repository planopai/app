"use client";

/**
 * Nova conversa pelo WhatsApp (27/10/2026): falar com quem nunca escreveu (cliente, fornecedor, prestador, parceiro…)
 * ou retomar quem está com a janela de 24 h fechada. A primeira mensagem é um modelo aprovado na Meta; quando a pessoa
 * responde, a conversa segue livre. O atendimento já fica com quem abriu.
 * Contatos frequentes (27/10/2026): favoritos e mais conversados no topo; tocar preenche os campos (aurora_09.php).
 * Servidor: aurora_07.php (nova_conversa) e messenger.php (modelos, enviar).
 * 24/11/2026 (WhatsApp Web): escolha do CANAL — Oficial (Meta, com modelo) ou um número do WhatsApp Web conectado em
 * Configurações › Canais (texto livre, a conversa vai para a aba Externos). "Vincular este canal ao contato": da próxima vez,
 * ao digitar ou escolher o mesmo contato, o canal padrão dele já vem escolhido. Servidor: aurora_23.php.
 */
import React, { useEffect, useState } from "react";
import { apiJson, API_BASE, msgPost } from "@/components/messenger/api";
import SeletorModelo, { type EstadoModelo } from "@/components/messenger/SeletorModelo";
import ContatosFrequentes, { telefoneBonito } from "./ContatosFrequentes";

export const TIPOS_CONTATO: [string, string][] = [
    ["cliente", "Cliente"],
    ["fornecedor", "Fornecedor"],
    ["prestador", "Prestador · contas a pagar"],
    ["parceiro", "Parceiro"],
    ["publico", "Público · outros"],
];

const campo = "mt-1 h-12 w-full rounded-xl bg-[#F1F4F8] px-3.5 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]";
const rotulo = "text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]";
const btn = "inline-flex h-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
const btnPri = "inline-flex h-11 items-center justify-center rounded-xl bg-[#313C55] px-4 text-sm font-extrabold text-white disabled:opacity-40 dark:bg-[#3D6A99]";

type Canal = { id: number; nome: string; detalhe: string; estado: string; telefone: string | null };
const URL_CANAIS = `${API_BASE}/aurora_23.php`;

export default function NovaConversaWhats({ onFechar, onAberta }: { onFechar: () => void; onAberta: (conversaId: number, externo?: boolean) => void }) {
    // 24/11/2026: canais (Oficial + números do WhatsApp Web que a pessoa usa) e o canal vinculado ao contato
    const [canais, setCanais] = useState<Canal[]>([]);
    const [canal, setCanal] = useState(0);
    const [vinculado, setVinculado] = useState<number | null>(null);
    const [vincular, setVincular] = useState(false);
    const [textoLivre, setTextoLivre] = useState("");
    useEffect(() => {
        apiJson(`${URL_CANAIS}?action=canais&_=${Date.now()}`, undefined, false).then((j: any) => setCanais(Array.isArray(j.dados) ? j.dados : [])).catch(() => setCanais([]));
    }, []);
    const [telefone, setTelefone] = useState("");
    const [nome, setNome] = useState("");
    const [tipo, setTipo] = useState("cliente");
    const [empresa, setEmpresa] = useState("");
    // 24/11/2026: a mensagem de abertura é escolhida por motivo (SeletorModelo)
    const [escolha, setEscolha] = useState<EstadoModelo>({ modelo: null, params: [], texto: "", pronto: false });
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
        window.addEventListener("keydown", esc);
        return () => window.removeEventListener("keydown", esc);
    }, [onFechar]);

    const m = escolha.modelo;
    const params = escolha.params;
    const previa = escolha.texto;
    const digitos = telefone.replace(/\D/g, "");
    const web = canal > 0;
    const canalSel = canais.find((x) => x.id === canal);
    const pronto = digitos.length >= 10 && (web ? textoLivre.trim().length > 0 && canalSel?.estado === "open" : !!m && escolha.pronto);

    // canal vinculado ao contato: ao digitar (ou escolher) o celular, já escolhe o canal padrão dele
    useEffect(() => {
        if (digitos.length < 10) {
            setVinculado(null);
            setVincular(false);
            return;
        }
        const t = setTimeout(() => {
            apiJson(`${URL_CANAIS}?action=contato_canal&telefone=${digitos}&_=${Date.now()}`, undefined, false)
                .then((j: any) => {
                    const v = j?.dados?.numero_id;
                    const id = v === null || v === undefined ? null : Number(v);
                    setVinculado(id);
                    if (id !== null && (id === 0 || canais.some((x) => x.id === id))) {
                        setCanal(id);
                        setVincular(true);
                    } else {
                        setVincular(false);
                    }
                })
                .catch(() => setVinculado(null));
        }, 400);
        return () => clearTimeout(t);
    }, [digitos, canais]);

    async function salvarVinculo() {
        if (vincular && vinculado !== canal) {
            await apiJson(`${URL_CANAIS}?action=contato_canal_salvar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: digitos, numero_id: canal }) }).catch(() => null);
        } else if (!vincular && vinculado !== null && vinculado === canal) {
            await apiJson(`${URL_CANAIS}?action=contato_canal_salvar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telefone: digitos, desvincular: true }) }).catch(() => null);
        }
    }

    async function abrirWeb() {
        setSalvando(true);
        setErro("");
        try {
            const r = await apiJson(`${URL_CANAIS}?action=conversa_abrir`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ numero_id: canal, telefone: digitos, nome: nome.trim(), tipo, empresa: empresa.trim(), texto: textoLivre.trim(), vincular }),
            });
            if (!vincular && vinculado === canal) await salvarVinculo();
            onAberta(Number(r.dados.conversa_id), true);
        } catch (e: any) {
            setErro(e.message || "Não foi possível abrir a conversa.");
        } finally {
            setSalvando(false);
        }
    }

    async function abrir() {
        if (!m) return;
        setSalvando(true);
        setErro("");
        try {
            const r = await apiJson(`${API_BASE}/aurora_07.php?action=nova_conversa`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telefone: digitos, nome: nome.trim(), tipo, empresa: empresa.trim() }),
            });
            const id = Number(r.dados.conversa_id);
            if (canais.length > 1) await salvarVinculo();
            await msgPost("enviar", { conversa_id: id, tipo: "modelo", texto: previa, modelo: { nome: m.nome, idioma: m.idioma, parametros: params.slice(0, m.parametros).map((p) => p.trim()) } });
            onAberta(id);
        } catch (e: any) {
            setErro(e.message || "Não foi possível abrir a conversa.");
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" style={{ background: "rgba(49,60,85,0.45)" }} onClick={onFechar}>
            <div role="dialog" aria-label="Nova conversa pelo WhatsApp" className="flex max-h-[92vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl sm:rounded-3xl dark:bg-[#232B3F] dark:text-white" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3 border-b border-[#E3E8F0] px-6 py-5 dark:border-white/12">
                    <div className="flex-1">
                        <h2 className="m-0 text-xl font-extrabold">Nova conversa pelo WhatsApp</h2>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">{web
                            ? `Pelo número ${canalSel?.nome || ""} (WhatsApp Web): mensagem livre, a qualquer hora, sem modelo. A conversa fica na aba Externos.`
                            : "Para quem nunca escreveu ou está com a janela de 24 h fechada. A primeira mensagem é um modelo aprovado na Meta; quando a pessoa responder, a conversa segue livre com você."}</p>
                    </div>
                    <button type="button" onClick={onFechar} className="flex h-11 w-11 items-center justify-center text-2xl leading-none" aria-label="Fechar">×</button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5">
                    {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
                    {canais.length > 1 && (
                        <div>
                            <span className={rotulo}>Canal</span>
                            <div className="mt-1 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Canal de envio">
                                {canais.map((x) => {
                                    const fora = x.id > 0 && x.estado !== "open";
                                    const ativo = canal === x.id;
                                    return (
                                        <button key={x.id} type="button" role="radio" aria-checked={ativo} disabled={fora} onClick={() => setCanal(x.id)}
                                            className={`flex min-h-[52px] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${ativo ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25" : "border-[#E3E8F0] bg-white dark:border-white/12 dark:bg-[#1C2334]"}`}>
                                            <span className="flex items-center gap-2 text-[15px] font-extrabold">
                                                {x.id === 0 ? "Oficial" : x.nome}
                                                {vinculado === x.id && <span className="rounded-full bg-[#E3F4E8] px-2 text-[11.5px] font-extrabold text-[#1E7A3C] dark:bg-[#2E9D5B]/20 dark:text-[#7FE0A5]">padrão do contato</span>}
                                            </span>
                                            <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{fora ? "desconectado" : x.detalhe}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <ContatosFrequentes onEscolher={(c) => { setTelefone(telefoneBonito(c.telefone)); setNome(c.nome); setTipo(TIPOS_CONTATO.some(([v]) => v === c.tipo) ? c.tipo : "cliente"); setEmpresa(c.empresa || ""); }} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block"><span className={rotulo}>Celular com DDD</span>
                            <input className={campo} inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(77) 99999-9999" autoFocus />
                        </label>
                        <label className="block"><span className={rotulo}>Nome</span>
                            <input className={campo} value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} placeholder="Como salvar o contato" />
                        </label>
                        <label className="block"><span className={rotulo}>Tipo de contato</span>
                            <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                                {TIPOS_CONTATO.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                            </select>
                        </label>
                        <label className="block"><span className={rotulo}>Empresa (opcional)</span>
                            <input className={campo} value={empresa} maxLength={150} onChange={(e) => setEmpresa(e.target.value)} />
                        </label>
                    </div>
                    {web ? (
                        <label className="block"><span className={rotulo}>Mensagem</span>
                            <textarea className="mt-1 min-h-[110px] w-full rounded-xl bg-[#F1F4F8] px-3.5 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]" value={textoLivre} maxLength={4000} onChange={(e) => setTextoLivre(e.target.value)} placeholder="Bom dia! Aqui é do Plano PAI…" />
                        </label>
                    ) : (
                        <div className="rounded-2xl border border-[#E3E8F0] p-4 dark:border-white/12">
                            <span className={rotulo}>Mensagem de abertura</span>
                            <div className="mt-2"><SeletorModelo telefone={telefone} onEstado={setEscolha} /></div>
                        </div>
                    )}
                    {canais.length > 1 && digitos.length >= 10 && (
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl bg-[#F6F8FB] px-3.5 dark:bg-[#1C2334]">
                            <input type="checkbox" className="h-5 w-5 accent-[#313C55]" checked={vincular} onChange={(e) => setVincular(e.target.checked)} />
                            <span className="text-[14.5px]"><b>Vincular este canal ao contato</b> · da próxima vez, o canal {canal === 0 ? "Oficial" : canalSel?.nome || ""} já vem escolhido para este número</span>
                        </label>
                    )}
                    <p className="m-0 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">{web
                        ? "Pelo WhatsApp Web não há custo da Meta. Não use para disparos em massa: o WhatsApp pode bloquear o número."
                        : "O modelo é cobrado pela Meta conforme a categoria (utilidade custa menos que marketing). Diga sempre quem é e o motivo do contato, para a pessoa não bloquear o número."}</p>
                </div>
                <div className="flex justify-end gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-6 py-4 dark:border-white/12 dark:bg-[#1C2334]">
                    <button type="button" className={btn} onClick={onFechar}>Cancelar</button>
                    <button type="button" className={btnPri} disabled={!pronto || salvando} onClick={web ? abrirWeb : abrir}>{salvando ? "Enviando…" : "Enviar e abrir conversa"}</button>
                </div>
            </div>
        </div>
    );
}
