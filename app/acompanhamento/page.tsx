"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrumacaoState, MateriaisState, Registro, Aviso } from "./components/types";
import {
    API,
    obrigatorios as obrigatoriosPadrao,
    steps as stepsPadrao,
    wizardStepIndexes as wizardStepIndexesPadrao,
    wizardStepTitles as wizardStepTitlesPadrao,
} from "./components/constants";
import {
    defaultArrumacao,
    defaultMateriais,
    jsonWith401,
    enviarRegistroPHP,
    capitalizeStatus,
    normalizarStatus,
    normalizeMateriaisState,
} from "./components/helpers";

import TabelaAtendimentos from "./components/TabelaAtendimentos";
import AvisosBox from "./components/AvisosBox";
import Wizard from "./components/Wizard";
import MateriaisModal from "./components/MateriaisModal";
import ArrumacaoModal from "./components/ArrumacaoModal";
import AcaoModal from "./components/AcaoModal";
import InfoModal from "./components/InfoModal";
import SignatureModal from "./components/SignatureModal";
import Modal from "./components/Modal";
import TelemetriaModal, { TipoTele, TelemetriaHandle } from "./components/TelemetriaModal";

// ✅ NOVO: modal de conferência antes do fase11
import MateriaisConferenciaModal, { MatCheckItem } from "./components/MateriaisConferenciaModal";

type TipoAtendimento = "funerario" | "terceiro";

/* -------------------- utils sessão (IDs de terceiros) -------------------- */
function addTerceiroIdToSession(id: string | number | undefined | null) {
    try {
        if (id == null) return;
        const raw = sessionStorage.getItem("terceiro_ids");
        const arr: Array<string> = raw ? JSON.parse(raw) : [];
        const sid = String(id);
        if (!arr.includes(sid)) {
            arr.push(sid);
            sessionStorage.setItem("terceiro_ids", JSON.stringify(arr));
        }
    } catch { }
}

/* ----------- resolve tipo a partir de um registro existente ----------- */
function resolveTipoFromRegistro(r?: Registro | null): TipoAtendimento {
    if (!r) return "funerario";
    if ((r as any)?.tipo_atendimento === "terceiro") return "terceiro";
    const asst = (r.assistencia || "").toString().toLowerCase();
    const tan = (r.tanato || "").toString().toLowerCase();
    const orn = (r.ornamentacao || "").toString().toLowerCase();
    if (asst === "não" && tan === "não" && orn === "não") return "terceiro";
    return "funerario";
}

/* -------------------- Config dinâmico por tipo -------------------- */
function getWizardConfig(tipo: TipoAtendimento) {
    if (tipo === "terceiro") {
        const wizardStepIndexes = [
            [0, 1, 17],
            [11, 12, 13, 19],
            [14, 15, 16, 20],
        ];
        const wizardStepTitles = ["Atendimento", "Velório", "Sepultamento"];
        const obrigatorios: string[] = [];
        return { wizardStepIndexes, wizardStepTitles, obrigatorios, steps: stepsPadrao };
    }
    return {
        wizardStepIndexes: wizardStepIndexesPadrao as number[][],
        wizardStepTitles: wizardStepTitlesPadrao as string[],
        obrigatorios: obrigatoriosPadrao as string[],
        steps: stepsPadrao,
    };
}

/* -------------------- Mapas de telemetria -------------------- */
function mapFaseToTipo(fase: string): TipoTele | null {
    if (fase === "fase01") return "remocao";
    if (fase === "fase07") return "para_velorio";
    if (fase === "fase09") return "para_sepultamento";
    return null;
}
// "fase que PARA" a telemetria iniciada por:
const STOP_BY_START: Record<string, string> = {
    fase01: "fase02", // Corpo na Clínica
    fase07: "fase08", // Entrega de Corpo
    fase09: "fase10", // Sepultamento Concluído
};

/* =======================================================================
   ✅ MODO OFFLINE (fila local + reenvio automático ao voltar a internet)
   - Sem libs, sem mexer no backend (desde que o endpoint aceite receber depois)
   - Armazena o payload inteiro (todas as informações do registro e ações).
   ======================================================================= */
type OfflineQueueItem = {
    qid: string;
    createdAt: number;
    tries: number;
    lastError?: string;
    payload: any; // payload do enviarRegistroPHP
};

const OFFLINE_QUEUE_KEY = "acomp_offline_queue_v1";

function safeReadQueue(): OfflineQueueItem[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
    } catch {
        return [];
    }
}

function safeWriteQueue(items: OfflineQueueItem[]) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    } catch {
        // ignore
    }
}

function genQid() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isOnlineNow() {
    if (typeof window === "undefined") return true;
    return navigator.onLine !== false;
}

function enqueueOffline(payload: any, errMsg?: string) {
    const items = safeReadQueue();
    items.push({
        qid: genQid(),
        createdAt: Date.now(),
        tries: 0,
        lastError: errMsg,
        payload,
    });
    safeWriteQueue(items);
    return items.length;
}

export default function AcompanhamentoPage() {
    // Tabela
    const [registros, setRegistros] = useState<Registro[]>([]);

    // Avisos
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // Tipo do cadastro atual
    const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("funerario");

    // Wizard
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardTitle, setWizardTitle] = useState("Novo Registro");
    const [wizardEditing, setWizardEditing] = useState(false);
    const [wizardIdx, setWizardIdx] = useState<number | null>(null);
    const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState<Registro>({});
    const [wizardMsg, setWizardMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [wizardSubmitting, setWizardSubmitting] = useState(false);

    // selects
    const [assistenciaVal, setAssistenciaVal] = useState<string>("");
    const [tanatoVal, setTanatoVal] = useState<string>("");

    // Materiais
    const [materiaisOpen, setMateriaisOpen] = useState(false);
    const [materiais, setMateriais] = useState<MateriaisState>(defaultMateriais());

    // Arrumação
    const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
    const [arrumacao, setArrumacao] = useState<ArrumacaoState>(defaultArrumacao());

    // Ações (por ID)
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoId, setAcaoId] = useState<Registro["id"] | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [acaoSubmitting, setAcaoSubmitting] = useState(false);

    // ✅ NOVO: conferência de materiais antes do "Material Recolhido"
    const [matCheckOpen, setMatCheckOpen] = useState(false);
    const [matCheckItens, setMatCheckItens] = useState<MatCheckItem[]>([]);
    const [matCheckReturnToAcao, setMatCheckReturnToAcao] = useState(false);

    // Info
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoId, setInfoId] = useState<Registro["id"] | null>(null);

    // Assinatura
    const [signOpen, setSignOpen] = useState(false);
    const [signTipo, setSignTipo] = useState<"recebimento" | "requisicao">("recebimento");
    const [signIdx, setSignIdx] = useState<number | null>(null);

    // Modal: escolher tipo no novo registro
    const [chooseTipoOpen, setChooseTipoOpen] = useState(false);

    // Telemetria
    const teleRef = useRef<TelemetriaHandle>(null);
    const [teleOpen, setTeleOpen] = useState(false);
    const [teleFase, setTeleFase] = useState<string>("fase01");
    const [teleTipo, setTeleTipo] = useState<TipoTele>("remocao");
    const [teleRegistroId, setTeleRegistroId] = useState<Registro["id"] | null>(null);

    // Controle de sessão ativa de telemetria (para sabermos em qual "par" parar)
    const [teleActive, setTeleActive] = useState(false);
    const [teleStartFase, setTeleStartFase] = useState<string | null>(null);

    /* -------------------- Config corrente por tipo -------------------- */
    const {
        wizardStepIndexes: wizardStepIndexesForTipo,
        wizardStepTitles: wizardStepTitlesForTipo,
        obrigatorios: obrigatoriosForTipo,
        steps: stepsForTipo,
    } = useMemo(() => getWizardConfig(tipoAtendimento), [tipoAtendimento]);

    /* ===========================
       ✅ OFFLINE: Flush da fila
       =========================== */
    const flushingRef = useRef(false);

    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/informativo.php?listar=1&_nocache=${Date.now()}`, {
                cache: "no-store",
                headers: {
                    Pragma: "no-cache",
                    Expires: "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
                credentials: "include",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
                    id: it?.id != null ? String(it.id) : it.id,
                    status: normalizarStatus(it?.status) ?? it?.status,
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    // helper para não depender da ordem do arquivo (flush usa isso)
    const fetchRegistrosSafe = useCallback(async () => {
        await fetchRegistros();
    }, [fetchRegistros]);

    const flushOfflineQueue = useCallback(async () => {
        if (typeof window === "undefined") return;
        if (!isOnlineNow()) return;
        if (flushingRef.current) return;

        const items = safeReadQueue();
        if (!items.length) return;

        flushingRef.current = true;
        try {
            let queue = items;
            queue = [...queue].sort((a, b) => a.createdAt - b.createdAt);

            for (const item of queue) {
                try {
                    const json = await enviarRegistroPHP(item.payload);

                    if (json?.sucesso) {
                        try {
                            const acao = String(item.payload?.acao ?? "");
                            const tipoAt = String(item.payload?.tipo_atendimento ?? "");
                            if (acao === "novo" && tipoAt === "terceiro") {
                                const novoId = json?.id ?? json?.novo_id ?? json?.last_id ?? null;
                                addTerceiroIdToSession(novoId);
                            }
                        } catch {
                            // ignore
                        }

                        const after = safeReadQueue().filter((x) => x.qid !== item.qid);
                        safeWriteQueue(after);
                    } else {
                        const after = safeReadQueue().map((x) =>
                            x.qid === item.qid
                                ? {
                                    ...x,
                                    tries: (x.tries ?? 0) + 1,
                                    lastError: json?.erro || "Erro ao enviar (offline queue).",
                                }
                                : x
                        );
                        safeWriteQueue(after);
                        break;
                    }
                } catch (e: any) {
                    const after = safeReadQueue().map((x) =>
                        x.qid === item.qid
                            ? {
                                ...x,
                                tries: (x.tries ?? 0) + 1,
                                lastError: e?.message || "Falha ao enviar (offline queue).",
                            }
                            : x
                    );
                    safeWriteQueue(after);
                    break;
                }
            }

            await fetchRegistrosSafe();
        } finally {
            flushingRef.current = false;
        }
    }, [fetchRegistrosSafe]);

    /* -------------------- Fetch helpers (avisos) -------------------- */
    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/avisos.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
            });
            if (r.status === 401) return;
            const data = await r.json().catch(() => null);
            if (data?.need_login) return;
            setAvisos(Array.isArray(data) ? data : []);
        } catch {
            setAvisos([]);
        }
    }, []);

    const enviarAviso = useCallback(async () => {
        const val = (avisoInputRef.current?.value ?? "").trim();
        if (!val) {
            setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
            return;
        }
        try {
            const res = await jsonWith401(`${API}/api/php/avisos.php`, {
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
                setAvisoMsg({ text: res?.erro || "Erro ao adicionar!", ok: false });
            }
        } catch (e: any) {
            setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, mensagem }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao editar!", ok: false });
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
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, excluir: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso excluído!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao excluir!", ok: false });
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
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ id, finalizar: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao finalizar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    /* -------------------- Ciclos -------------------- */
    useEffect(() => {
        fetchRegistros();
        fetchAvisos();
        flushOfflineQueue();
    }, [fetchRegistros, fetchAvisos, flushOfflineQueue]);

    useEffect(() => {
        const intReg = setInterval(fetchRegistros, 10000);
        const intAv = setInterval(fetchAvisos, 3000);
        const intFlush = setInterval(() => {
            flushOfflineQueue();
        }, 20000);

        const onVis = () => {
            if (!document.hidden) {
                fetchRegistros();
                flushOfflineQueue();
            }
        };
        document.addEventListener("visibilitychange", onVis);

        const onOnline = () => {
            flushOfflineQueue();
        };
        window.addEventListener("online", onOnline);

        return () => {
            clearInterval(intReg);
            clearInterval(intAv);
            clearInterval(intFlush);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("online", onOnline);
        };
    }, [fetchRegistros, fetchAvisos, flushOfflineQueue]);

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setWizardOpen(false);
                setAcaoOpen(false);
                setInfoOpen(false);
                setMateriaisOpen(false);
                setArrumacaoOpen(false);
                setSignOpen(false);
                setChooseTipoOpen(false);
                setTeleOpen(false);

                // ✅ fecha conferência também
                setMatCheckOpen(false);
            }
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, []);

    /* -------------------- Parsers locais -------------------- */
    const parseMateriaisFromRegistro = (r: Registro): MateriaisState => {
        // ✅ novo formato (dinâmico): vem pronto no materiais_json
        if ((r as any)?.materiais_json) {
            try {
                const parsed = JSON.parse(String((r as any).materiais_json));
                return normalizeMateriaisState(parsed);
            } catch {
                // segue fallback
            }
        }

        // Fallback legado (se ainda existir no banco): materiais_*_qtd
        const out: MateriaisState = {};
        try {
            for (const [k, v] of Object.entries(r as any)) {
                if (!k.startsWith("materiais_") || !k.endsWith("_qtd")) continue;
                const qtd = Math.max(0, Math.floor(Number(v ?? 0)));
                if (qtd <= 0) continue;

                const nomeBase = k.replace(/^materiais_/, "").replace(/_qtd$/, "");
                out[nomeBase] = {
                    checked: true,
                    qtd,
                    nome: nomeBase.replace(/_/g, " "),
                } as any;
            }
        } catch { }

        return out;
    };

    // ✅ atualizado: além do arrumacao_json, aceita colunas diretas (ex: invol)
    const parseArrumacaoFromRegistro = (r: Registro): ArrumacaoState => {
        const base = defaultArrumacao();

        // 1) merge do JSON (quando existir)
        if (r.arrumacao_json) {
            try {
                const parsed = JSON.parse(String(r.arrumacao_json));
                Object.assign(base, parsed);
            } catch { }
        }

        // 2) fallback/override por colunas diretas (quando backend enviar/guardar em colunas)
        (Object.keys(base) as Array<keyof ArrumacaoState>).forEach((k) => {
            const col = (r as any)[k];
            if (col == null) return;

            if (typeof col === "boolean") base[k] = col;
            else if (typeof col === "number") base[k] = col === 1;
            else if (typeof col === "string") {
                const s = col.trim().toLowerCase();
                base[k] = s === "1" || s === "true" || s === "sim" || s === "s";
            } else {
                base[k] = !!col;
            }
        });

        return base;
    };

    /* -------------------- Aberturas -------------------- */
    const abrirNovoRegistro = useCallback(() => {
        setChooseTipoOpen(true);
    }, []);

    const iniciarNovoRegistro = useCallback(
        (tipo: TipoAtendimento) => {
            setChooseTipoOpen(false);
            setTipoAtendimento(tipo);

            setWizardSubmitting(false);
            setWizardEditing(false);
            setWizardIdx(null);
            setWizardRestrictGroup(null);
            setWizardStep(0);
            setWizardMsg(null);
            setWizardTitle("Novo Registro");

            const empty: Registro = {};
            (stepsPadrao as any).forEach((s: any) => ((empty as any)[s.id] = ""));

            if (tipo === "terceiro") {
                empty.assistencia = "Não";
                empty.tanato = "Não";
                empty.ornamentacao = "Não";
                (empty as any).tipo_atendimento = "terceiro";
            } else {
                (empty as any).tipo_atendimento = "funerario";
            }

            setWizardData(empty);
            setMateriais(defaultMateriais());
            setArrumacao(defaultArrumacao());
            setAssistenciaVal(String(empty.assistencia || ""));
            setTanatoVal(String(empty.tanato || ""));
            setWizardOpen(true);
        },
        [wizardStepIndexesForTipo, wizardStep, wizardData] // deps não críticos aqui, mas ok
    );

    const abrirWizard = useCallback(
        (tipo: "novo" | "editar", idx: number | null = null, grupoStep: number | null = null) => {
            setWizardSubmitting(false);
            const editing = tipo === "editar";
            setWizardEditing(editing);
            setWizardIdx(idx);
            setWizardRestrictGroup(grupoStep);
            setWizardStep(grupoStep ?? 0);
            setWizardMsg(null);
            setWizardTitle(editing ? "Editar Registro" : "Novo Registro");

            if (editing && idx !== null && registros[idx]) {
                const r = registros[idx];

                setTipoAtendimento(resolveTipoFromRegistro(r));

                const data: Registro = {};
                (stepsPadrao as any).forEach((s: any) => {
                    (data as any)[s.id] = (r as any)[s.id] ?? "";
                });
                data.id = r.id;

                const mats = parseMateriaisFromRegistro(r);
                setMateriais(mats);
                (data as any).materiais = mats;

                const arr = parseArrumacaoFromRegistro(r);
                setArrumacao(arr);
                (data as any).arrumacao = arr;

                setWizardData(data);
                setAssistenciaVal(String((r.assistencia ?? "") as string));
                setTanatoVal(String((r.tanato ?? "") as string));
            } else {
                iniciarNovoRegistro(tipoAtendimento);
                return;
            }

            setWizardOpen(true);
        },
        [registros, iniciarNovoRegistro, tipoAtendimento]
    );

    const salvarGrupoWizard = useCallback((): Registro | null => {
        const grupo = wizardStepIndexesForTipo[wizardStep];
        const next: Registro = { ...wizardData };

        for (const idx of grupo) {
            const s = (stepsForTipo as any)[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as HTMLInputElement | HTMLTextAreaElement | null;
            const v = (el?.value ?? "").trim();

            if (obrigatoriosForTipo.includes(s.id) && !v) {
                el?.focus();
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return null;
            }
            (next as any)[s.id] = v;
        }

        if (wizardData.id != null) next.id = wizardData.id;

        (next as any).materiais = materiais;
        (next as any).arrumacao = arrumacao;
        (next as any).tipo_atendimento = tipoAtendimento;

        setWizardData(next);
        return next;
    }, [
        wizardData,
        wizardStep,
        materiais,
        arrumacao,
        wizardStepIndexesForTipo,
        stepsForTipo,
        obrigatoriosForTipo,
        tipoAtendimento,
    ]);

    const concluirWizard = useCallback(async () => {
        if (wizardSubmitting) return;
        const dataAtualizada = salvarGrupoWizard();
        if (!dataAtualizada) return;

        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexesForTipo[wizardRestrictGroup];
            const ids = grupo.map((i) => (stepsForTipo as any)[i].id);
            grupoObrigatorios = ids.filter((id) => obrigatoriosForTipo.includes(id));
        } else {
            grupoObrigatorios = obrigatoriosForTipo;
        }

        for (const id of grupoObrigatorios) {
            if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        // ✅ OFFLINE: se não tiver internet, guarda o payload inteiro e sai
        if (!isOnlineNow()) {
            try {
                setWizardSubmitting(true);
                const payload = { ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" };
                enqueueOffline(payload, "offline");
                setWizardMsg({
                    text: "Sem internet: registro salvo offline e será enviado automaticamente quando a conexão voltar.",
                    ok: true,
                });
                setTimeout(() => setWizardOpen(false), 950);
            } catch (e: any) {
                setWizardMsg({ text: e?.message || "Não foi possível salvar offline.", ok: false });
            } finally {
                setWizardSubmitting(false);
            }
            return;
        }

        try {
            setWizardSubmitting(true);
            const payload = { ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" };
            const json = await enviarRegistroPHP(payload);
            if (json?.sucesso) {
                setWizardMsg({ text: "Registro salvo!", ok: true });
                if ((dataAtualizada as any).tipo_atendimento === "terceiro") {
                    const novoId = json?.id ?? json?.novo_id ?? json?.last_id ?? dataAtualizada.id ?? null;
                    addTerceiroIdToSession(novoId);
                }
                fetchRegistros();
                setTimeout(() => setWizardOpen(false), 950);
            } else {
                setWizardMsg({ text: json?.erro || "Erro ao salvar!", ok: false });
            }
        } catch (e: any) {
            enqueueOffline({ ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" }, e?.message);
            setWizardMsg({
                text: "Falha de conexão: registro guardado offline e será enviado automaticamente quando a conexão voltar.",
                ok: true,
            });
            setTimeout(() => setWizardOpen(false), 950);
        } finally {
            setWizardSubmitting(false);
            flushOfflineQueue();
        }
    }, [
        salvarGrupoWizard,
        wizardRestrictGroup,
        wizardEditing,
        fetchRegistros,
        wizardSubmitting,
        obrigatoriosForTipo,
        wizardStepIndexesForTipo,
        stepsForTipo,
        wizardStep,
        wizardData,
        materiais,
        arrumacao,
        tipoAtendimento,
        flushOfflineQueue,
    ]);

    /* -------------------- Ações (status) -------------------- */
    const abrirPopupAcaoPorId = useCallback((id: Registro["id"]) => {
        setAcaoMsg(null);
        setAcaoId(id != null ? String(id) : null);
        setAcaoSubmitting(false);
        setAcaoOpen(true);
    }, []);

    const registrarAcao = useCallback(
        async (
            acao: string,
            opts?: { skipMaterialCheck?: boolean; skipConfirm?: boolean }
        ) => {
            if (acaoSubmitting) return;
            if (acaoId == null) return;

            // ✅ NOVA REGRA: antes de "Material Recolhido" (fase11), exigir conferência dos materiais
            if (acao === "fase11" && !opts?.skipMaterialCheck) {
                const reg = registros.find((x) => String(x.id) === String(acaoId));
                const mats = reg ? parseMateriaisFromRegistro(reg) : {};

                const itens: MatCheckItem[] = Object.entries(mats || {})
                    .map(([k, it]: any) => ({
                        key: String(k),
                        nome: String(it?.nome || k),
                        qtd: Number(it?.qtd ?? 0),
                        checked: !!it?.checked,
                    }))
                    .filter((x) => x.checked && x.qtd > 0)
                    .map((x) => ({ key: x.key, nome: x.nome, qtd: x.qtd }));

                setMatCheckItens(itens);
                setMatCheckReturnToAcao(true);
                setAcaoOpen(false); // evita modal em cima de modal
                setMatCheckOpen(true);
                return;
            }

            if (!opts?.skipConfirm) {
                const ok = window.confirm("Deseja confirmar essa ação?");
                if (!ok) return;
            }

            // ✅ OFFLINE: guarda a ação e fecha
            if (!isOnlineNow()) {
                try {
                    setAcaoSubmitting(true);
                    enqueueOffline({ acao: "atualizar_status", id: acaoId, status: acao }, "offline");
                    setAcaoMsg({
                        text: "Sem internet: ação guardada offline e será enviada automaticamente quando a conexão voltar.",
                        ok: true,
                    });
                    setAcaoOpen(false);
                } finally {
                    setAcaoSubmitting(false);
                }
                return;
            }

            setAcaoSubmitting(true);
            try {
                const json = await enviarRegistroPHP({
                    acao: "atualizar_status",
                    id: acaoId,
                    status: acao,
                });

                if (json?.sucesso) {
                    setAcaoMsg({
                        text: `Status alterado para "${capitalizeStatus(acao)}"`,
                        ok: true,
                    });

                    // se a ação é uma "parada" da telemetria ativa, para e salva automaticamente
                    if (
                        teleActive &&
                        teleStartFase &&
                        STOP_BY_START[teleStartFase] &&
                        STOP_BY_START[teleStartFase] === acao
                    ) {
                        await teleRef.current?.stopAndSave();
                        setTeleActive(false);
                        setTeleStartFase(null);
                    }

                    await fetchRegistros();
                    setAcaoOpen(false);
                } else {
                    setAcaoMsg({
                        text: json?.erro || "Erro ao atualizar status.",
                        ok: false,
                    });
                }
            } catch (e: any) {
                enqueueOffline({ acao: "atualizar_status", id: acaoId, status: acao }, e?.message);
                setAcaoMsg({
                    text: "Falha de conexão: ação guardada offline e será enviada automaticamente quando a conexão voltar.",
                    ok: true,
                });
                setAcaoOpen(false);
            } finally {
                setAcaoSubmitting(false);
                flushOfflineQueue();
            }
        },
        [acaoSubmitting, acaoId, registros, fetchRegistros, teleActive, teleStartFase, flushOfflineQueue]
    );

    /* ---- Confirmação silenciosa para a TelemetriaModal (start) ---- */
    const confirmarAcaoSilenciosa = useCallback(
        async (fase: string) => {
            const id = teleRegistroId ?? acaoId;
            if (id == null) return;

            // ✅ OFFLINE: guarda e retorna (sem UI)
            if (!isOnlineNow()) {
                enqueueOffline({ acao: "atualizar_status", id, status: fase }, "offline");
                return;
            }

            try {
                await enviarRegistroPHP({
                    acao: "atualizar_status",
                    id,
                    status: fase,
                });
                await fetchRegistros();
            } catch (e: any) {
                enqueueOffline({ acao: "atualizar_status", id, status: fase }, e?.message);
            } finally {
                flushOfflineQueue();
            }
        },
        [teleRegistroId, acaoId, fetchRegistros, flushOfflineQueue]
    );

    /* -------------------- Info por ID (estável) -------------------- */
    const registroInfo = useMemo(
        () => (infoId != null ? registros.find((x) => String(x.id) === String(infoId)) ?? null : null),
        [registros, infoId]
    );

    const infoIdxResolved = useMemo(() => {
        if (infoId == null) return null;
        const idx = registros.findIndex((x) => String(x.id) === String(infoId));
        return idx >= 0 ? idx : null;
    }, [registros, infoId]);

    const abrirInfoPorId = useCallback((id: Registro["id"]) => {
        setInfoId(id != null ? String(id) : null);
        setInfoOpen(true);
    }, []);

    const abrirWizardFromInfo = useCallback(
        (tipo: "novo" | "editar", _idx: number | null = null, grupoStep: number | null = null) => {
            const idx = infoIdxResolved;
            if (idx != null) {
                setTipoAtendimento(resolveTipoFromRegistro(registros[idx]));
                abrirWizard(tipo, idx, grupoStep);
            }
        },
        [infoIdxResolved, abrirWizard, registros]
    );

    const abrirAssinaturaFromInfo = useCallback(
        (_idx: number, tipo: "recebimento" | "requisicao") => {
            const idx = infoIdxResolved;
            if (idx != null) {
                setSignIdx(idx);
                setSignTipo(tipo);
                setSignOpen(true);
            }
        },
        [infoIdxResolved]
    );

    /* -------------------- Assinatura (fora do Info) -------------------- */
    const abrirAssinatura = useCallback((idx: number, tipo: "recebimento" | "requisicao") => {
        setSignIdx(idx);
        setSignTipo(tipo);
        setSignOpen(true);
    }, []);

    /* -------------------- Telemetria: abrir via AcaoModal -------------------- */
    const handleVeiculoRequired = useCallback(
        (id: Registro["id"] | null | undefined, fase: string) => {
            const tipo = mapFaseToTipo(fase);
            if (!tipo) {
                setAcaoId(id != null ? String(id) : null);
                registrarAcao(fase);
                return;
            }
            setTeleRegistroId(id != null ? String(id) : null);
            setTeleFase(fase);
            setTeleTipo(tipo);
            setTeleOpen(true);
            setAcaoOpen(false);
        },
        [registrarAcao]
    );

    /* -------------------- Resumos -------------------- */
    const materiaisSelecionadosResumo = useMemo(() => {
        const matsPrefer = (wizardData as any)?.materiais;
        const mats: any =
            matsPrefer && typeof matsPrefer === "object" && Object.keys(matsPrefer).length > 0 ? matsPrefer : materiais;

        const list = Object.values(mats || {})
            .filter((it: any) => it?.checked && Number(it?.qtd ?? 0) > 0)
            .map((it: any) => `${String(it?.nome || "Item")} (${Number(it?.qtd ?? 1)})`);

        return list.length ? list.join(" • ") : "Nenhum material selecionado";
    }, [wizardData, materiais]);

    const arrumacaoSelecionadaResumo = useMemo(() => {
        const mapa: { key: keyof ArrumacaoState; label: string }[] = [
            { key: "luvas", label: "Luvas" },
            { key: "palha", label: "Palha" },
            { key: "tamponamento", label: "Tamponamento" },
            { key: "maquiagem", label: "Maquiagem" },
            { key: "algodao", label: "Algodão" },
            { key: "cordao", label: "Cordão" },
            { key: "barba", label: "Barba" },
            { key: "ta32", label: "TA-32" },
            { key: "fluido_cavitario", label: "Fluído Cavitário" },
            { key: "formol", label: "Formol" },
            { key: "mascara", label: "Máscara" },
        ];
        const arr = wizardData.arrumacao || arrumacao;
        return mapa
            .filter((o) => !!(arr as any)?.[o.key])
            .map((o) => o.label)
            .join(" • ");
    }, [wizardData.arrumacao, arrumacao]);

    /* -------------------- Helpers -------------------- */
    const findRegistroById = useCallback(
        (id: Registro["id"] | null): Registro | undefined =>
            id == null ? undefined : registros.find((x) => String(x.id) === String(id)),
        [registros]
    );

    /* -------------------- Render -------------------- */
    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Gestão de Atendimentos</h1>
                    <p className="text-sm text-muted-foreground">
                        Cadastre, acompanhe e atualize o status dos atendimentos.
                    </p>
                </div>
                <button
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    onClick={abrirNovoRegistro}
                >
                    Novo Registro
                </button>
            </header>

            <TabelaAtendimentos
                registros={registros}
                onAcao={(id) => abrirPopupAcaoPorId(id)}
                onInfo={(id) => abrirInfoPorId(id)}
            />

            <AvisosBox
                avisos={avisos}
                avisoMsg={avisoMsg}
                setAvisoMsg={setAvisoMsg}
                enviarAviso={enviarAviso}
                editarAviso={editarAviso}
                excluirAviso={excluirAviso}
                finalizarAviso={finalizarAviso}
                avisoInputRef={avisoInputRef}
            />

            {/* Modal de escolha: tipo do novo registro */}
            <Modal open={chooseTipoOpen} onClose={() => setChooseTipoOpen(false)} ariaLabel="Escolher tipo" maxWidth={420}>
                <h3 className="text-lg font-semibold">Qual tipo de atendimento?</h3>
                <div className="mt-4 grid gap-2">
                    <button
                        className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
                        onClick={() => iniciarNovoRegistro("funerario")}
                    >
                        Atendimento Funerário
                    </button>
                    <button
                        className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
                        onClick={() => iniciarNovoRegistro("terceiro")}
                    >
                        Serviço de Outra Empresa
                    </button>
                </div>
            </Modal>

            <Wizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                wizardTitle={wizardTitle}
                wizardStep={wizardStep}
                setWizardStep={setWizardStep}
                wizardRestrictGroup={wizardRestrictGroup}
                wizardData={wizardData}
                setWizardData={setWizardData}
                obrigatorios={obrigatoriosForTipo}
                steps={stepsForTipo as any}
                wizardStepIndexes={wizardStepIndexesForTipo}
                wizardStepTitles={wizardStepTitlesForTipo}
                assistenciaVal={assistenciaVal}
                setAssistenciaVal={setAssistenciaVal}
                tanatoVal={tanatoVal}
                setTanatoVal={setTanatoVal}
                materiaisSelecionadosResumo={materiaisSelecionadosResumo}
                arrumacaoSelecionadaResumo={arrumacaoSelecionadaResumo}
                setMateriaisOpen={setMateriaisOpen}
                setArrumacaoOpen={setArrumacaoOpen}
                salvarGrupoWizard={salvarGrupoWizard}
                concluirWizard={concluirWizard}
                wizardSubmitting={wizardSubmitting}
            />

            <MateriaisModal
                open={materiaisOpen}
                setOpen={setMateriaisOpen}
                materiais={materiais}
                setMateriais={setMateriais}
                setWizardData={setWizardData}
            />

            <ArrumacaoModal
                open={arrumacaoOpen}
                setOpen={setArrumacaoOpen}
                arrumacao={arrumacao}
                setArrumacao={setArrumacao}
                setWizardData={setWizardData}
            />

            <AcaoModal
                open={acaoOpen}
                setOpen={setAcaoOpen}
                registros={registros}
                acaoId={acaoId}
                registrarAcao={registrarAcao}
                acaoMsg={acaoMsg}
                acaoSubmitting={acaoSubmitting}
                onVeiculoRequired={handleVeiculoRequired}
            />

            {/* ✅ NOVO: Conferência obrigatória antes de Material Recolhido */}
            <MateriaisConferenciaModal
                open={matCheckOpen}
                itens={matCheckItens}
                onClose={() => {
                    setMatCheckOpen(false);
                    if (matCheckReturnToAcao) setAcaoOpen(true);
                    setMatCheckReturnToAcao(false);
                }}
                onConfirm={async () => {
                    setMatCheckOpen(false);
                    setMatCheckReturnToAcao(false);
                    // confirma fase11 sem reabrir a checagem e sem window.confirm
                    await registrarAcao("fase11", { skipMaterialCheck: true, skipConfirm: true });
                }}
            />

            <InfoModal
                open={infoOpen}
                setOpen={setInfoOpen}
                infoIdx={infoIdxResolved}
                abrirWizard={abrirWizardFromInfo}
                abrirAssinatura={(idx, tipo) => abrirAssinaturaFromInfo(idx, tipo)}
                registro={registroInfo}
            />

            <SignatureModal
                open={signOpen}
                onClose={() => setSignOpen(false)}
                registro={signIdx != null ? registros[signIdx] : undefined}
                tipo={signTipo}
                onSaved={() => {
                    fetchRegistros();
                }}
            />

            {/* ---- Telemetria ---- */}
            <TelemetriaModal
                ref={teleRef}
                open={teleOpen}
                onClose={() => {
                    setTeleOpen(false);
                    fetchRegistros();
                }}
                registro={findRegistroById(teleRegistroId)}
                fase={teleFase}
                tipo={teleTipo}
                onConfirmAcao={confirmarAcaoSilenciosa}
                onStarted={({ fase }) => {
                    setTeleActive(true);
                    setTeleStartFase(fase);
                }}
                onSaved={() => {
                    setTeleActive(false);
                    setTeleStartFase(null);
                    fetchRegistros();
                }}
            />
        </div>
    );
}
