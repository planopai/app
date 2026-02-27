"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AvisosBox from "../acompanhamento/components/AvisosBox";
import type { Aviso, Registro } from "../acompanhamento/components/types";
import { jsonWith401, normalizarStatus } from "../acompanhamento/components/helpers";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

/* =========================
   ✅ Status (nome real)
   ========================= */
function capStatus(s?: string) {
    switch (normalizarStatus(s)) {
        case "fase01":
            return "Removendo";
        case "fase02":
            return "Aguardando Procedimento";
        case "fase03":
            return "Preparando";
        case "fase04":
            return "Aguardando Ornamentação";
        case "fase05":
            return "Ornamentando";
        case "fase06":
            return "Corpo Pronto";
        case "fase07":
            return "Transportando P/ Velório";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Transportando P/ Sepultamento";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

/* =========================
   ✅ MESMAS REGRAS DO QUADRO
   ========================= */
function isNao(v?: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}
function isSim(v?: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "sim" || s === "s";
}
function isTerceiroRegistro(r: any) {
    if (r?.tipo_atendimento === "terceiro") return true;
    return isNao(r?.assistencia) && isNao(r?.tanato) && isNao(r?.ornamentacao);
}
function parseRegistroDateTime(r: any) {
    const d = String(r?.data ?? "").trim();
    const h =
        String(r?.hora_fim_velorio ?? "").trim() ||
        String(r?.hora_inicio_velorio ?? "").trim() ||
        "00:00";
    if (!d) return 0;

    const [yyyy, mm, dd] = d.split("-");
    const iso = `${yyyy}-${mm}-${dd}T${h}:00`;
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? 0 : ts;
}

/* =========================
   ✅ Tags de aviso
   ========================= */
const TAG_SERVICO = "Atendimento:";
const TAG_GERAL = "Geral:";

function isServicoMsg(msg?: any) {
    const s = String(msg ?? "");
    return s.startsWith(TAG_SERVICO);
}
function extractServicoNome(msg?: string) {
    const s = String(msg ?? "");
    if (!s.startsWith(TAG_SERVICO)) return "";
    const rest = s.slice(TAG_SERVICO.length).trim(); // "NOME: obs"
    const idx = rest.indexOf(":");
    const nome = (idx >= 0 ? rest.slice(0, idx) : rest).trim();
    return nome;
}
function normNome(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/* =========================
   ✅ Modal observação
   ========================= */
function ObservacaoModal({
    open,
    onClose,
    falecido,
    value,
    setValue,
    onSubmit,
    loading,
}: {
    open: boolean;
    onClose: () => void;
    falecido: string;
    value: string;
    setValue: (v: string) => void;
    onSubmit: () => void;
    loading?: boolean;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={loading ? undefined : onClose}
                aria-hidden
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border bg-background shadow-2xl overflow-hidden">
                <div className="border-b px-4 py-3 sm:px-5 sm:py-4 bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-semibold leading-tight">
                                Adicionar Observação
                            </h3>
                            <p className="mt-1 text-[14px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                                Falecido(a): {falecido}
                            </p>
                        </div>

                        <button
                            type="button"
                            className="shrink-0 rounded-full border px-3 py-1.5 text-[14px] hover:bg-muted disabled:opacity-60"
                            onClick={onClose}
                            disabled={!!loading}
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-5 sm:py-5">
                    <label className="block text-[14px] font-medium text-muted-foreground">
                        Observação
                    </label>
                    <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        rows={5}
                        maxLength={255}
                        className="mt-2 w-full rounded-xl border px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Digite a observação..."
                    />

                    <div className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                        <button
                            type="button"
                            className="w-full sm:w-auto rounded-xl border px-4 py-2 text-[14px] hover:bg-muted disabled:opacity-60"
                            onClick={onClose}
                            disabled={!!loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            className="w-full sm:w-auto rounded-xl bg-sky-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-sky-600 disabled:opacity-60"
                            onClick={onSubmit}
                            disabled={!!loading}
                        >
                            {loading ? "Adicionando..." : "Adicionar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AvisosPage() {
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [registros, setRegistros] = useState<Registro[]>([]);

    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // modal obs
    const [obsOpen, setObsOpen] = useState(false);
    const [obsLoading, setObsLoading] = useState(false);
    const [obsFalecido, setObsFalecido] = useState<string>("");
    const [obsTexto, setObsTexto] = useState<string>("");

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

    // ✅ buscar atendimentos
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

                    urna_deposito_nome: String(it?.urna_deposito_nome ?? ""),
                    urna_produto_id: Number(it?.urna_produto_id ?? 0) || 0,
                    urna_codigo_barras: String(it?.urna_codigo_barras ?? ""),

                    roupa_deposito_nome: String(it?.roupa_deposito_nome ?? ""),
                    roupa_produto_id: Number(it?.roupa_produto_id ?? 0) || 0,
                    roupa_codigo_barras: String(it?.roupa_codigo_barras ?? ""),
                    roupa_propria: Number(it?.roupa_propria ?? 0) || 0,

                    invol_deposito_nome: String(it?.invol_deposito_nome ?? ""),
                    invol_produto_id: Number(it?.invol_produto_id ?? 0) || 0,
                    invol_codigo_barras: String(it?.invol_codigo_barras ?? ""),
                    invol_item: String(it?.invol_item ?? ""),

                    veu_deposito_nome: String(it?.veu_deposito_nome ?? ""),
                    veu_produto_id: Number(it?.veu_produto_id ?? 0) || 0,
                    veu_codigo_barras: String(it?.veu_codigo_barras ?? ""),
                    veu_item: String(it?.veu_item ?? ""),

                    cordao_deposito_nome: String(it?.cordao_deposito_nome ?? ""),
                    cordao_produto_id: Number(it?.cordao_produto_id ?? 0) || 0,
                    cordao_codigo_barras: String(it?.cordao_codigo_barras ?? ""),
                    cordao_item: String(it?.cordao_item ?? ""),

                    arrumacao_json: String(it?.arrumacao_json ?? ""),
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    // ✅ mesma lista do quadro (filtro + ordenação)
    const registrosParaLista = useMemo(() => {
        const base = (registros || []).filter((r: any) => {
            const statusNorm = normalizarStatus(r?.status);

            if (statusNorm === "fase11") return false;
            if (isTerceiroRegistro(r)) return statusNorm !== "fase10";
            if (!isSim(r?.assistencia)) return statusNorm !== "fase10";
            return true;
        });

        const withTs = base.map((r: any) => ({ r, ts: parseRegistroDateTime(r) }));
        withTs.sort((a, b) => b.ts - a.ts);

        return withTs.map(({ r }) => ({
            ...r,
            status: capStatus(r?.status),
        })) as Registro[];
    }, [registros]);

    // ✅ nomes ativos (pra esconder Serviço quando o atendimento some)
    const nomesAtivos = useMemo(() => {
        const set = new Set<string>();
        for (const r of registrosParaLista as any[]) {
            const nome = String(r?.falecido ?? "").trim();
            if (nome) set.add(normNome(nome));
        }
        return set;
    }, [registrosParaLista]);

    // ✅ avisos filtrados (Serviço só aparece se falecido ainda estiver no quadro)
    const avisosParaExibir = useMemo(() => {
        const arr = Array.isArray(avisos) ? avisos : [];
        return arr.filter((a) => {
            const msg = String((a as any)?.mensagem ?? "");
            if (!isServicoMsg(msg)) return true;

            const nome = extractServicoNome(msg);
            if (!nome) return true;
            return nomesAtivos.has(normNome(nome));
        });
    }, [avisos, nomesAtivos]);

    // ✅ enviar aviso "Geral"
    const enviarAviso = useCallback(async () => {
        const val = (avisoInputRef.current?.value ?? "").trim();
        if (!val) {
            setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
            return;
        }

        try {
            const mensagem = `${TAG_GERAL} ${val}`;
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mensagem }),
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
            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id, mensagem }),
            });

            if (!res?.sucesso) throw new Error(res?.erro || res?.msg || "Erro ao editar!");
            fetchAvisos();
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

    // ✅ abrir modal observação
    const onAddObservacao = useCallback(
        async (registroId: string) => {
            const r = (registrosParaLista as any[]).find((x) => String(x?.id) === String(registroId));
            const nome = String(r?.falecido ?? "").trim();

            if (!nome) {
                setAvisoMsg({ ok: false, text: "Não encontrei o nome do falecido nesse atendimento." });
                return;
            }

            setObsFalecido(nome);
            setObsTexto("");
            setObsOpen(true);
        },
        [registrosParaLista]
    );

    const closeObs = useCallback(() => {
        if (obsLoading) return;
        setObsOpen(false);
        setObsTexto("");
        setObsFalecido("");
    }, [obsLoading]);

    const submitObs = useCallback(async () => {
        const nome = String(obsFalecido ?? "").trim();
        const obs = String(obsTexto ?? "").trim();

        if (!nome) {
            setAvisoMsg({ ok: false, text: "Falecido inválido." });
            return;
        }
        if (!obs) {
            setAvisoMsg({ ok: false, text: "Digite uma observação." });
            return;
        }

        if (!nomesAtivos.has(normNome(nome))) {
            setAvisoMsg({
                ok: false,
                text: "Esse atendimento não está mais no quadro. Não foi possível adicionar a observação.",
            });
            closeObs();
            return;
        }

        setObsLoading(true);
        try {
            const mensagem = `${TAG_SERVICO} ${nome}: ${obs}`;

            const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mensagem }),
            });

            if (res?.sucesso) {
                setAvisoMsg({ ok: true, text: "Observação adicionada!" });
                closeObs();
                fetchAvisos();
            } else {
                setAvisoMsg({ ok: false, text: res?.erro || res?.msg || "Erro ao adicionar observação." });
            }
        } catch (e: any) {
            setAvisoMsg({ ok: false, text: e?.message || "Erro ao adicionar observação." });
        } finally {
            setObsLoading(false);
        }
    }, [obsFalecido, obsTexto, nomesAtivos, closeObs, fetchAvisos]);

    return (
        <div className="mx-auto w-full max-w-6xl p-3 sm:p-6 space-y-4">
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-6">
                <h1 className="text-xl sm:text-2xl font-semibold">Avisos</h1>
            </div>

            <AvisosBox
                avisos={avisosParaExibir}
                registros={registrosParaLista}
                onAddObservacao={onAddObservacao}
                avisoMsg={avisoMsg}
                setAvisoMsg={setAvisoMsg}
                enviarAviso={enviarAviso}
                editarAviso={editarAviso}
                excluirAviso={excluirAviso}
                avisoInputRef={avisoInputRef}
            />

            <ObservacaoModal
                open={obsOpen}
                onClose={closeObs}
                falecido={obsFalecido}
                value={obsTexto}
                setValue={setObsTexto}
                onSubmit={submitObs}
                loading={obsLoading}
            />
        </div>
    );
}