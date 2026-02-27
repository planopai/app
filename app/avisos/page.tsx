"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import AvisosBox from "../acompanhamento/components/AvisosBox";
import type { Aviso, Registro } from "../acompanhamento/components/types";
import { jsonWith401, normalizarStatus } from "../acompanhamento/components/helpers";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

export default function AvisosPage() {
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [registros, setRegistros] = useState<Registro[]>([]);

    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // ✅ buscar avisos
    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(`${ENDPOINT}/avisos.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            setAvisos(Array.isArray(data) ? data : []);
        } catch {
            setAvisos([]);
        }
    }, []);

    // ✅ buscar atendimentos (para listar falecidos no quadro)
    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(`${ENDPOINT}/informativo.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
                    id: it?.id != null ? String(it.id) : it.id,
                    status: normalizarStatus?.(it?.status) ?? it?.status,
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    const enviarAviso = useCallback(async () => {
        const val = (avisoInputRef.current?.value ?? "").trim();
        if (!val) {
            setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
            return;
        }

        try {
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mensagem: val }),
            });

            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso adicionado!", ok: true });
                if (avisoInputRef.current) avisoInputRef.current.value = "";
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || res?.msg || "Erro ao adicionar!", ok: false });
            }
        } catch (e: any) {
            setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            try {
                const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, mensagem }),
                });

                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || res?.msg || "Erro ao editar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao editar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const excluirAviso = useCallback(
        async (id: number | string) => {
            if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;

            try {
                const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, excluir: true }),
                });

                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso excluído!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || res?.msg || "Erro ao excluir!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao excluir!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const finalizarAviso = useCallback(
        async (id: number | string) => {
            try {
                const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, finalizar: true }),
                });

                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || res?.msg || "Erro ao finalizar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    useEffect(() => {
        fetchAvisos();
        fetchRegistros();
    }, [fetchAvisos, fetchRegistros]);

    useEffect(() => {
        const intAv = setInterval(fetchAvisos, 3000);
        const intReg = setInterval(fetchRegistros, 10000);

        const onVis = () => {
            if (!document.hidden) {
                fetchAvisos();
                fetchRegistros();
            }
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            clearInterval(intAv);
            clearInterval(intReg);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [fetchAvisos, fetchRegistros]);

    // ✅ você decide o que vai acontecer aqui.
    // Por enquanto: cria um aviso já com o nome do falecido.
    const onAddObservacao = useCallback(
        async (registroId: string) => {
            const r = registros.find((x: any) => String(x?.id) === String(registroId));
            const nome = String((r as any)?.falecido ?? "").trim();

            if (!nome) {
                alert("Não encontrei o nome do falecido nesse atendimento.");
                return;
            }

            const obs = window.prompt(`Adicionar observação para: ${nome}\n\nDigite a observação:`, "");
            if (!obs || !obs.trim()) return;

            // ✅ aqui eu estou salvando como "aviso" (mensagem do plantão).
            // Se você quiser salvar em outro lugar (ex: observacao_itens do registro),
            // me diga que endpoint você usa.
            try {
                const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ mensagem: `${nome}: ${obs.trim()}` }),
                });

                if (res?.sucesso) {
                    setAvisoMsg({ ok: true, text: "Observação adicionada como aviso!" });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ ok: false, text: res?.erro || res?.msg || "Erro ao adicionar observação." });
                }
            } catch (e: any) {
                setAvisoMsg({ ok: false, text: e?.message || "Erro ao adicionar observação." });
            }
        },
        [registros, fetchAvisos]
    );

    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Avisos</h1>
                </div>
            </header>

            <AvisosBox
                avisos={avisos}
                registros={registros} // ✅ agora passa
                onAddObservacao={onAddObservacao} // ✅ agora passa
                avisoMsg={avisoMsg}
                setAvisoMsg={setAvisoMsg}
                enviarAviso={enviarAviso}
                editarAviso={editarAviso}
                excluirAviso={excluirAviso}
                finalizarAviso={finalizarAviso}
                avisoInputRef={avisoInputRef}
            />
        </div>
    );
}