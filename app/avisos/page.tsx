"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AvisosBox from "../acompanhamento/components/AvisosBox";
import type { Aviso, Registro } from "../acompanhamento/components/types";
import { jsonWith401, normalizarStatus } from "../acompanhamento/components/helpers";
import { fases } from "../acompanhamento/components/constants";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

function faseIndex(status: any) {
    const st = String(status ?? "");
    const idx = (fases as readonly string[]).indexOf(st);
    return idx >= 0 ? idx : 999;
}

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

    // ✅ buscar atendimentos (MESMA normalização do quadro)
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
                    status: normalizarStatus(it?.status) ?? it?.status,

                    // ✅ URNA
                    urna_deposito_nome: String(it?.urna_deposito_nome ?? ""),
                    urna_produto_id: Number(it?.urna_produto_id ?? 0) || 0,
                    urna_codigo_barras: String(it?.urna_codigo_barras ?? ""),

                    // ✅ ROUPA
                    roupa_deposito_nome: String(it?.roupa_deposito_nome ?? ""),
                    roupa_produto_id: Number(it?.roupa_produto_id ?? 0) || 0,
                    roupa_codigo_barras: String(it?.roupa_codigo_barras ?? ""),
                    roupa_propria: Number(it?.roupa_propria ?? 0) || 0,

                    // ✅ INVOL
                    invol_deposito_nome: String(it?.invol_deposito_nome ?? ""),
                    invol_produto_id: Number(it?.invol_produto_id ?? 0) || 0,
                    invol_codigo_barras: String(it?.invol_codigo_barras ?? ""),
                    invol_item: String(it?.invol_item ?? ""),

                    // ✅ VÉU
                    veu_deposito_nome: String(it?.veu_deposito_nome ?? ""),
                    veu_produto_id: Number(it?.veu_produto_id ?? 0) || 0,
                    veu_codigo_barras: String(it?.veu_codigo_barras ?? ""),
                    veu_item: String(it?.veu_item ?? ""),

                    // ✅ CORDÃO
                    cordao_deposito_nome: String(it?.cordao_deposito_nome ?? ""),
                    cordao_produto_id: Number(it?.cordao_produto_id ?? 0) || 0,
                    cordao_codigo_barras: String(it?.cordao_codigo_barras ?? ""),
                    cordao_item: String(it?.cordao_item ?? ""),

                    // ✅ INSUMOS
                    arrumacao_json: String(it?.arrumacao_json ?? ""),
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

    // ✅ aqui é onde você garante "MESMAS REGRAS" da lista do quadro:
    // - ordenação por fase
    // - filtros (exemplo: esconder fase11)
    const registrosParaLista = useMemo(() => {
        const base = [...registros];

        // 🔧 ajuste aqui se o quadro faz isso:
        // const filtrado = base.filter((r: any) => String(r?.status) !== "fase11");
        const filtrado = base;

        filtrado.sort((a: any, b: any) => {
            const fa = faseIndex(a?.status);
            const fb = faseIndex(b?.status);
            if (fa !== fb) return fa - fb;

            // desempate: nome do falecido
            const na = String((a as any)?.falecido ?? "").toLowerCase();
            const nb = String((b as any)?.falecido ?? "").toLowerCase();
            if (na && nb && na !== nb) return na.localeCompare(nb);

            return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
        });

        return filtrado;
    }, [registros]);

    const onAddObservacao = useCallback(
        async (registroId: string) => {
            const r = registrosParaLista.find((x: any) => String(x?.id) === String(registroId));
            const nome = String((r as any)?.falecido ?? "").trim();

            if (!nome) {
                alert("Não encontrei o nome do falecido nesse atendimento.");
                return;
            }

            const obs = window.prompt(`Adicionar observação para: ${nome}\n\nDigite a observação:`, "");
            if (!obs || !obs.trim()) return;

            // ✅ salvando como aviso (mensagem do plantão)
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
        [registrosParaLista, fetchAvisos]
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
                registros={registrosParaLista} // ✅ usa a lista com mesmas regras
                onAddObservacao={onAddObservacao} // ✅ botão de add obs por falecido
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