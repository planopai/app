'use client';

/**
 * Janela "Enviar pelo chat" dos demonstrativos (folha e comissões) — 10/11/2026.
 * Mostra para quem vai e quem fica de fora (sem login do app), envia um por um com o andamento e no fim lista as falhas.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconCheck, IconSend, IconX } from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC } from '@/components/shell/ModuloHub';
import { enviarPeloChat, type EnvioChat, type ResultadoEnvio } from './demonstrativos';

const BTN_SEC = `${BOTAO_PAGINA} ${BOTAO_PAGINA_SEC} disabled:opacity-40`;
const BTN_PRI = `${BOTAO_PAGINA} ${BOTAO_PAGINA_PRI} disabled:opacity-40`;
const NOTA = 'flex items-start gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] leading-snug text-[#313C55] dark:bg-[#1C2334] dark:text-[#DDE3EE]';
const SUB = 'text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]';

export default function EnviarChat({ titulo, envios, previa, onFechar, onConcluido }: { titulo: string; envios: EnvioChat[]; previa?: boolean; onFechar: () => void; onConcluido: (msg: string) => void }) {
    const [ok, setOk] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [feitos, setFeitos] = useState(0);
    const [res, setRes] = useState<ResultadoEnvio | null>(null);
    const comLogin = envios.filter((e) => e.usuarioId);
    const semLogin = envios.filter((e) => !e.usuarioId);

    useEffect(() => {
        setOk(true);
    }, []);
    useEffect(() => {
        const k = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !enviando) onFechar();
        };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onFechar, enviando]);

    const enviar = async () => {
        setEnviando(true);
        setFeitos(0);
        const r = await enviarPeloChat(comLogin, (f) => setFeitos(f));
        setRes(r);
        setEnviando(false);
        if (r.enviados.length) onConcluido(`${r.enviados.length} demonstrativo(s) enviado(s) pelo chat.${r.falhas.length ? ` ${r.falhas.length} não foi(ram).` : ''}`);
    };

    if (!ok) return null;
    return createPortal(
        <div
            data-pai-overlay
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
            onClick={(e) => {
                if (e.target === e.currentTarget && !enviando) onFechar();
            }}
        >
            <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl">
                <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[18px] font-extrabold leading-tight">Enviar pelo chat</h2>
                        <div className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{titulo}</div>
                    </div>
                    <button type="button" onClick={onFechar} disabled={enviando} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]">
                        <IconX size={20} />
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
                    {!res ? (
                        <>
                            <div className={NOTA}>
                                <span>
                                    Cada pessoa recebe só o próprio demonstrativo, em PDF, na conversa individual com você no Messenger.
                                    {previa ? ' Os valores ainda não são finais: o PDF vai com a faixa "PRÉVIA".' : ''}
                                </span>
                            </div>
                            <div className="text-[14.5px]">
                                <b>{comLogin.length}</b> pessoa(s) vão receber
                                {comLogin.length <= 8 && comLogin.length ? `: ${comLogin.map((e) => e.nome).join(', ')}` : ''}.
                            </div>
                            {semLogin.length ? (
                                <div className={`${NOTA} bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]`}>
                                    <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                    <span>
                                        Sem login do app ligado ao cadastro (não recebem): {semLogin.map((e) => e.nome).join(', ')}. Ligue o login em Usuários para mandar a elas.
                                    </span>
                                </div>
                            ) : null}
                            {enviando ? (
                                <div>
                                    <div className={SUB}>
                                        Enviando {feitos} de {comLogin.length}…
                                    </div>
                                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F1F4F8] dark:bg-white/[0.08]">
                                        <div className="h-full rounded-full bg-[#313C55] transition-all dark:bg-[#F2CB3F]" style={{ width: `${comLogin.length ? (feitos / comLogin.length) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <>
                            {res.enviados.length ? (
                                <div className={`${NOTA} bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]`}>
                                    <IconCheck size={18} className="mt-0.5 shrink-0" />
                                    <span>
                                        Enviado para {res.enviados.length} pessoa(s): {res.enviados.join(', ')}.
                                    </span>
                                </div>
                            ) : null}
                            {res.falhas.length ? (
                                <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                                    <b className="block">Não foi enviado:</b>
                                    {res.falhas.map((f) => (
                                        <span key={f.nome} className="block">
                                            {f.nome}: {f.motivo}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/[0.08] dark:bg-[#1C2334] [&>*]:flex-1 lg:[&>*]:flex-none">
                    <button type="button" className={BTN_SEC} disabled={enviando} onClick={onFechar}>
                        {res ? 'Fechar' : 'Voltar'}
                    </button>
                    {!res ? (
                        <button type="button" className={BTN_PRI} disabled={enviando || !comLogin.length} onClick={() => void enviar()}>
                            <IconSend size={18} /> {enviando ? 'Enviando…' : `Enviar ${comLogin.length}`}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>,
        document.body,
    );
}
