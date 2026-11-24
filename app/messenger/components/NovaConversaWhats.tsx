"use client";

/**
 * Nova conversa pelo WhatsApp (27/10/2026): falar com quem nunca escreveu (cliente, fornecedor, prestador, parceiro…)
 * ou retomar quem está com a janela de 24 h fechada. A primeira mensagem é um modelo aprovado na Meta; quando a pessoa
 * responde, a conversa segue livre. O atendimento já fica com quem abriu.
 * Contatos frequentes (27/10/2026): favoritos e mais conversados no topo; tocar preenche os campos (aurora_09.php).
 * Servidor: aurora_07.php (nova_conversa) e messenger.php (modelos, enviar).
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

export default function NovaConversaWhats({ onFechar, onAberta }: { onFechar: () => void; onAberta: (conversaId: number) => void }) {
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
    const pronto = digitos.length >= 10 && !!m && escolha.pronto;

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
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Para quem nunca escreveu ou está com a janela de 24 h fechada. A primeira mensagem é um modelo aprovado na Meta; quando a pessoa responder, a conversa segue livre com você.</p>
                    </div>
                    <button type="button" onClick={onFechar} className="flex h-11 w-11 items-center justify-center text-2xl leading-none" aria-label="Fechar">×</button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-5">
                    {erro && <div className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-4 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{erro}</div>}
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
                    <div className="rounded-2xl border border-[#E3E8F0] p-4 dark:border-white/12">
                        <span className={rotulo}>Mensagem de abertura</span>
                        <div className="mt-2"><SeletorModelo telefone={telefone} onEstado={setEscolha} /></div>
                    </div>
                    <p className="m-0 text-[13px] text-[#6B7488] dark:text-[#AEB9CF]">O modelo é cobrado pela Meta conforme a categoria (utilidade custa menos que marketing). Diga sempre quem é e o motivo do contato, para a pessoa não bloquear o número.</p>
                </div>
                <div className="flex justify-end gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-6 py-4 dark:border-white/12 dark:bg-[#1C2334]">
                    <button type="button" className={btn} onClick={onFechar}>Cancelar</button>
                    <button type="button" className={btnPri} disabled={!pronto || salvando} onClick={abrir}>{salvando ? "Enviando…" : "Enviar e abrir conversa"}</button>
                </div>
            </div>
        </div>
    );
}
