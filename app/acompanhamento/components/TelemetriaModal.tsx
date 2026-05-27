"use client";

import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import Modal from "./Modal";
import { Registro } from "./types";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const TELEMETRIA_URL = `${ENDPOINT}/api/php/telemetria.php`;

/* ======================= Tipos ======================= */

export type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

type VeiculoOpcao = {
    nome: string;
    placa: string | null;
};

type OffPayload = {
    when: number;
    url: string;
    body: any;
};

export type TelemetriaHandle = {
    /** Chamado externamente quando chegar a fase que encerra a telemetria */
    stopAndSave: () => Promise<void>;
};

/* ======================= Veículos fixos ======================= */

const VEICULOS_FIXOS: VeiculoOpcao[] = [
    { nome: "STRADA", placa: "RDR8G25" },
    { nome: "S10", placa: "PRY7H63" },
    { nome: "SPRINTER", placa: "RDG9170" },
    { nome: "DOBLO", placa: "OZP9875" },
    { nome: "SAVEIRO", placa: "RCQ5B26" },
    { nome: "HILUX", placa: "SKT5G28" },
    { nome: "HILUX", placa: "QTV4I21" },
    { nome: "SAVEIRO", placa: "ONQ6794" },
    { nome: "DUCATO", placa: "PLV6H34" },
    { nome: "DUCATO", placa: "PLL6E98" },
    { nome: "OUTRA EMPRESA", placa: null },
];

/* ======================= Utils ======================= */

function normalizePlaca(v?: string | null) {
    return String(v || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 7);
}

function placaComTraco(v?: string | null) {
    const p = normalizePlaca(v || "");
    if (p.length !== 7) return p || "";
    return `${p.slice(0, 3)}-${p.slice(3)}`;
}

function veiculoLabel(v: VeiculoOpcao) {
    const placa = placaComTraco(v.placa);
    return placa ? `${v.nome} ${placa}` : v.nome;
}

function getRegistroId(registro?: Registro) {
    const r = registro as any;
    return r?.sepultamento_id ?? r?.id_sepultamento ?? r?.id ?? null;
}

function getFalecido(registro?: Registro) {
    const r = registro as any;
    return r?.falecido || r?.falecido_nome || r?.nome_falecido || r?.nome || null;
}

function pad2(v: number) {
    return String(v).padStart(2, "0");
}

function toMysqlDateTime(date: Date) {
    return [
        date.getFullYear(),
        "-",
        pad2(date.getMonth() + 1),
        "-",
        pad2(date.getDate()),
        " ",
        pad2(date.getHours()),
        ":",
        pad2(date.getMinutes()),
        ":",
        pad2(date.getSeconds()),
    ].join("");
}

function getPayloadError(j: any, fallback = "Falha ao enviar telemetria.") {
    return String(j?.msg || j?.erro || j?.message || fallback);
}

/* ======================= Fila offline ======================= */

function readQueue(): OffPayload[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("telemetria_offline_queue");
        return raw ? (JSON.parse(raw) as OffPayload[]) : [];
    } catch {
        return [];
    }
}

function writeQueue(q: OffPayload[]) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem("telemetria_offline_queue", JSON.stringify(q));
    } catch { }
}

async function postTelemetria(payload: any) {
    const r = await fetch(TELEMETRIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    let j: any = null;

    try {
        j = text ? JSON.parse(text) : null;
    } catch {
        j = null;
    }

    if (!r.ok || !j?.sucesso) {
        throw new Error(getPayloadError(j, `Erro HTTP ${r.status} ao salvar telemetria.`));
    }

    return j;
}

async function flushQueue() {
    if (typeof navigator === "undefined") return;
    const q = readQueue();
    if (!q.length || navigator.onLine === false) return;

    const rest: OffPayload[] = [];

    for (const item of q) {
        try {
            await postTelemetria(item.body);
        } catch {
            rest.push(item);
        }
    }

    writeQueue(rest);
}

function enqueueTelemetria(payload: any) {
    const q = readQueue();
    q.push({ when: Date.now(), url: TELEMETRIA_URL, body: payload });
    writeQueue(q);
}

/* ======================= Snapshot da sessão ativa ======================= */

function saveActiveSnapshot(snap: any) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem("tele_active_snapshot", JSON.stringify(snap));
    } catch { }
}

function clearActiveSnapshot() {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem("tele_active_snapshot");
    } catch { }
}

/* ======================= Wake Lock ======================= */

async function requestWakeLock(): Promise<any | null> {
    try {
        // @ts-ignore
        if (navigator.wakeLock && typeof navigator.wakeLock.request === "function") {
            // @ts-ignore
            return await navigator.wakeLock.request("screen");
        }
    } catch { }

    return null;
}

/* ======================= Componente ======================= */

export default forwardRef<
    TelemetriaHandle,
    {
        open: boolean;
        onClose: () => void;
        registro?: Registro;
        fase: string;
        tipo: TipoTele;
        /** Atualiza status sem perguntar, por exemplo fase01/fase07/fase09 */
        onConfirmAcao?: (fase: string) => Promise<void> | void;
        onStarted?: (info: { fase: string }) => void;
        onSaved?: () => void;
    }
>(function TelemetriaModal(
    { open, onClose, registro, fase, tipo, onConfirmAcao, onStarted, onSaved },
    ref
) {
    const [veiculo, setVeiculo] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const startTsRef = useRef<number | null>(null);
    const endTsRef = useRef<number | null>(null);
    const snapshotTimerRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any | null>(null);
    const relockHandlerRef = useRef<() => void>(() => { });
    const veiculoRef = useRef<VeiculoOpcao | null>(null);
    const activeRef = useRef(false);

    const veiculosOpcoes = useMemo(() => VEICULOS_FIXOS, []);

    const veiculoSelecionado = useMemo(() => {
        return veiculosOpcoes.find((v) => veiculoLabel(v) === veiculo) || null;
    }, [veiculosOpcoes, veiculo]);

    useImperativeHandle(ref, () => ({
        stopAndSave: async () => {
            await stopAndSave();
        },
    }));

    const titulo = useMemo(() => {
        if (tipo === "remocao") return "Remoção";
        if (tipo === "para_velorio") return "Transporte para Velório";
        return "Transporte para Sepultamento";
    }, [tipo]);

    function snapshotBase() {
        const veic = veiculoRef.current || veiculoSelecionado;

        return {
            id: getRegistroId(registro),
            fase,
            tipo,
            veiculo: veic ? veiculoLabel(veic) : veiculo,
            veiculo_nome: veic?.nome || veiculo || null,
            placa: veic?.placa || null,
            startTs: startTsRef.current,
            origem_dados: veic?.placa ? "itrack" : "manual_sem_rota",
            source_device: veic?.placa ? "rastreador" : "sem_rastreador",
        };
    }

    async function startAfterSelect(veiculoEscolhido: VeiculoOpcao) {
        if (starting || activeRef.current) return;

        setStarting(true);
        setMsg(null);

        const placa = normalizePlaca(veiculoEscolhido.placa);
        const veicNormalizado: VeiculoOpcao = {
            ...veiculoEscolhido,
            placa: placa || null,
        };

        try {
            // Primeiro registra a fase inicial no atendimento.
            // Se isso falhar, não marca a telemetria como ativa.
            await onConfirmAcao?.(fase);

            veiculoRef.current = veicNormalizado;
            activeRef.current = true;
            startTsRef.current = Date.now();
            endTsRef.current = null;

            wakeLockRef.current = await requestWakeLock();
            const relock = async () => {
                if (!wakeLockRef.current) {
                    wakeLockRef.current = await requestWakeLock();
                }
            };
            relockHandlerRef.current = relock;
            window.addEventListener("visibilitychange", relock);
            window.addEventListener("online", flushQueue);

            saveActiveSnapshot(snapshotBase());

            if (snapshotTimerRef.current == null) {
                snapshotTimerRef.current = window.setInterval(() => {
                    saveActiveSnapshot(snapshotBase());
                }, 5000) as unknown as number;
            }

            onStarted?.({ fase });
            onClose();
        } catch (e: any) {
            activeRef.current = false;
            veiculoRef.current = null;
            startTsRef.current = null;
            setMsg({
                text: e?.message || "Não foi possível iniciar a telemetria.",
                ok: false,
            });
        } finally {
            setStarting(false);
        }
    }

    async function cleanupActiveSession() {
        if (snapshotTimerRef.current != null) {
            window.clearInterval(snapshotTimerRef.current);
            snapshotTimerRef.current = null;
        }

        window.removeEventListener("visibilitychange", relockHandlerRef.current);
        window.removeEventListener("online", flushQueue);

        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release?.();
            } catch { }
            wakeLockRef.current = null;
        }

        clearActiveSnapshot();
    }

    function buildPayload() {
        const veic = veiculoRef.current || veiculoSelecionado;
        const placa = normalizePlaca(veic?.placa || "");

        const inicioMs = startTsRef.current || Date.now();
        const fimMs = endTsRef.current || Date.now();
        const durS = Math.max(1, Math.round((fimMs - inicioMs) / 1000));

        const base = {
            sepultamento_id: getRegistroId(registro),
            tipo,
            falecido: getFalecido(registro),
            veiculo_nome: veic?.nome || veiculo || null,
            placa: placa || null,
            veiculo_obs: veic?.placa ? null : "OUTRA EMPRESA / sem rastreador",
            inicio_ts: toMysqlDateTime(new Date(inicioMs)),
            fim_ts: toMysqlDateTime(new Date(fimMs)),
            duracao_seg: durS,
            encerrado: 1,
        };

        if (placa) {
            return {
                acao: "inserir_itrack",
                ...base,
                source_device: "rastreador",
                origem_dados: "itrack",
            };
        }

        // OUTRA EMPRESA: não existe placa/rastreador para consultar na iTrack.
        return {
            acao: "inserir",
            ...base,
            distancia_km: 0,
            vel_media_kmh: 0,
            vel_max_kmh: 0,
            velocidade_media: 0,
            velocidade_max: 0,
            amostras: 0,
            pontos_json: [],
            source_device: "sem_rastreador",
            origem_dados: "manual_sem_rota",
            observacao: "Veículo de outra empresa ou sem placa/rastreador. Registro salvo sem rota.",
        };
    }

    async function stopAndSave() {
        if (saving) return;

        // Se não há sessão ativa, não tenta gravar rota fantasma.
        if (!activeRef.current && !startTsRef.current && !veiculoRef.current) {
            return;
        }

        setSaving(true);

        try {
            endTsRef.current = Date.now();
            const payload = buildPayload();

            try {
                if (typeof navigator === "undefined" || navigator.onLine !== false) {
                    await postTelemetria(payload);
                    setMsg({ text: "Telemetria salva!", ok: true });
                } else {
                    throw new Error("offline");
                }
            } catch (e: any) {
                enqueueTelemetria(payload);
                setMsg({
                    text: "Telemetria salva no aparelho e será reenviada quando houver conexão.",
                    ok: true,
                });
            }

            await cleanupActiveSession();

            startTsRef.current = null;
            endTsRef.current = null;
            activeRef.current = false;
            veiculoRef.current = null;
            setVeiculo("");

            onSaved?.();
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        if (!open) {
            setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
            setMsg(null);
            setStarting(false);
            return;
        }
    }, [open]);

    useEffect(() => {
        flushQueue();
        const on = () => flushQueue();
        window.addEventListener("online", on);
        return () => window.removeEventListener("online", on);
    }, []);

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Selecionar veículo" maxWidth={440}>
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold">Selecionar veículo</h2>
                        <div className="mt-1 text-xs text-muted-foreground">{titulo}</div>
                    </div>
                </div>

                <div>
                    <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={veiculo}
                        disabled={saving || starting}
                        onChange={async (e) => {
                            const label = e.target.value;
                            setVeiculo(label);
                            if (!label) return;

                            const escolhido = veiculosOpcoes.find((v) => veiculoLabel(v) === label);
                            if (!escolhido) return;

                            await startAfterSelect(escolhido);
                        }}
                    >
                        <option value="">Selecione…</option>
                        {veiculosOpcoes.map((v) => {
                            const label = veiculoLabel(v);
                            return (
                                <option key={`${v.nome}-${v.placa || label}`} value={label}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {msg && (
                    <div
                        className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                            }`}
                    >
                        {msg.text}
                    </div>
                )}

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving || starting}
                        className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </Modal>
    );
});
