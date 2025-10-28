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
import { API } from "./constants";
import TextFeedback from "./TextFeedback";

/* ======================= Tipos ======================= */
export type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

type Ponto = {
    lat: number;
    lng: number;
    ts: number; // epoch ms
    spd?: number; // m/s (nativo)
    acc?: number; // acurácia (m)
};

export type TelemetriaHandle = {
    stopAndSave: () => Promise<void>;
};

/* ======================= Veículos (fallback local) ======================= */
/** Troque por sua fonte real se quiser, ou mantenha esta lista padrão */
const VEICULOS: string[] = [
    "Strada RDR 8G25",
    "S10 PRY 7H63",
    "SPRINTER RDG 9170",
    "DOBLO OZP 9875",
    "SAVEIRO RCQ 5B26",
    "HILUX SKT 5G28",
    "SAVEIRO PLL",
    "DUCATO PLV",
    "DUCATO PLL 6E98",
    "OUTRA EMPRESA",
];

/* ======================= Utils ======================= */

function isNum(v: any): v is number {
    return Number.isFinite(v);
}
function distMeters(a: Ponto, b: Ponto) {
    // haversine rápido
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const x =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
}

/* --------- Queue offline --------- */
type OffPayload = {
    when: number;
    url: string;
    body: any;
};
function readQueue(): OffPayload[] {
    try {
        const raw = localStorage.getItem("telemetria_offline_queue");
        return raw ? (JSON.parse(raw) as OffPayload[]) : [];
    } catch {
        return [];
    }
}
function writeQueue(q: OffPayload[]) {
    try {
        localStorage.setItem("telemetria_offline_queue", JSON.stringify(q));
    } catch { }
}
async function flushQueue() {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return;
    const rest: OffPayload[] = [];
    for (const item of q) {
        try {
            const r = await fetch(item.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(item.body),
            });
            const j = await r.json();
            if (!r.ok || !j?.sucesso) throw new Error("Fail");
        } catch {
            rest.push(item);
        }
    }
    writeQueue(rest);
}

/* --------- Snapshot da sessão ativa --------- */
function saveActiveSnapshot(snap: any) {
    try {
        localStorage.setItem("tele_active_snapshot", JSON.stringify(snap));
    } catch { }
}
function clearActiveSnapshot() {
    try {
        localStorage.removeItem("tele_active_snapshot");
    } catch { }
}

/* --------- Wake Lock (manter tela acordada) --------- */
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
export default forwardRef<TelemetriaHandle, {
    open: boolean;
    onClose: () => void;
    registro?: Registro;
    fase: string; // fase01/fase07/fase09
    tipo: TipoTele;
    onConfirmAcao?: (fase: string) => Promise<void> | void; // atualiza status sem perguntar
    onStarted?: (info: { fase: string }) => void;
    onSaved?: () => void;
}>(function TelemetriaModal(
    { open, onClose, registro, fase, tipo, onConfirmAcao, onStarted, onSaved },
    ref
) {
    const [veiculo, setVeiculo] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    // coleta
    const watchIdRef = useRef<number | null>(null);
    const pontosRef = useRef<Ponto[]>([]);
    const startTsRef = useRef<number | null>(null);
    const endTsRef = useRef<number | null>(null);
    const snapshotTimerRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any | null>(null);

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

    /* ====== start/stop ====== */

    async function startAfterSelect() {
        setMsg(null);

        // confirma ação (muda status) silenciosamente
        try {
            await onConfirmAcao?.(fase);
        } catch { }

        // wake lock
        wakeLockRef.current = await requestWakeLock();
        const relock = async () => {
            if (!wakeLockRef.current) {
                wakeLockRef.current = await requestWakeLock();
            }
        };
        window.addEventListener("visibilitychange", relock);

        // watchPosition
        try {
            startTsRef.current = Date.now();
            pontosRef.current = [];

            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, accuracy, speed } = pos.coords;
                    const p: Ponto = {
                        lat: latitude,
                        lng: longitude,
                        ts: pos.timestamp || Date.now(),
                        spd: isNum(speed) ? Number(speed) : undefined,
                        acc: isNum(accuracy) ? Number(accuracy) : undefined,
                    };

                    const arr = pontosRef.current;
                    const last = arr.length ? arr[arr.length - 1] : null;

                    // filtros: pelo menos 3s e 10m do último
                    const enoughTime = !last || p.ts - last.ts >= 3000;
                    const enoughMove = !last || distMeters(last, p) >= 10;

                    if (enoughTime && enoughMove) {
                        arr.push(p);
                    } else if (!last) {
                        arr.push(p);
                    }

                    // snapshot periódico
                    saveActiveSnapshot({
                        id: registro?.id ?? null,
                        fase,
                        tipo,
                        veiculo,
                        startTs: startTsRef.current,
                        pontos: arr,
                    });
                },
                () => { },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
            );
            watchIdRef.current = id;
        } catch (e: any) {
            setMsg({ text: e?.message || "Falha ao iniciar localização.", ok: false });
        }

        // snapshot timer (garantia)
        if (snapshotTimerRef.current == null) {
            snapshotTimerRef.current = window.setInterval(() => {
                saveActiveSnapshot({
                    id: registro?.id ?? null,
                    fase,
                    tipo,
                    veiculo,
                    startTs: startTsRef.current,
                    pontos: pontosRef.current,
                });
            }, 5000) as unknown as number;
        }

        // flush fila quando ficar online
        window.addEventListener("online", flushQueue);

        onStarted?.({ fase });
    }

    async function stopAndSave() {
        if (saving) return;
        setSaving(true);

        try {
            if (watchIdRef.current != null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            if (snapshotTimerRef.current != null) {
                window.clearInterval(snapshotTimerRef.current);
                snapshotTimerRef.current = null;
            }
            clearActiveSnapshot();
            if (wakeLockRef.current) {
                try {
                    await wakeLockRef.current.release?.();
                } catch { }
                wakeLockRef.current = null;
            }

            endTsRef.current = Date.now();

            const pontos = pontosRef.current.slice();
            if (pontos.length === 1) {
                pontos.push({ ...pontos[0], ts: (pontos[0].ts || Date.now()) + 1000 });
            }

            // métricas
            let dist = 0;
            let vmax = 0;
            for (let i = 1; i < pontos.length; i++) dist += distMeters(pontos[i - 1], pontos[i]);
            for (const p of pontos) if (isNum(p.spd)) vmax = Math.max(vmax, p.spd! * 3.6);

            const durS = Math.max(1, Math.round(((endTsRef.current || 0) - (startTsRef.current || 0)) / 1000));
            const velMedKmH = dist > 0 ? (dist / 1000) / (durS / 3600) : 0;

            // payload
            const payload = {
                acao: "inserir",
                sepultamento_id: (registro as any)?.sepultamento_id ?? null,
                tipo: tipo,
                falecido: (registro as any)?.falecido || (registro as any)?.falecido_nome || null,
                veiculo_nome: veiculo || null,
                veiculo_obs: null,
                inicio_ts: new Date(startTsRef.current || Date.now()).toISOString().slice(0, 19).replace("T", " "),
                fim_ts: new Date(endTsRef.current || Date.now()).toISOString().slice(0, 19).replace("T", " "),
                inicio_lat: pontos[0]?.lat ?? null,
                inicio_lng: pontos[0]?.lng ?? null,
                fim_lat: pontos[pontos.length - 1]?.lat ?? null,
                fim_lng: pontos[pontos.length - 1]?.lng ?? null,
                distancia_km: Number((dist / 1000).toFixed(3)),
                duracao_seg: durS,
                vel_media_kmh: Number(velMedKmH.toFixed(2)),
                vel_max_kmh: Number(vmax.toFixed(2)),
                amostras: pontos.length,
                pontos_json: pontos, // array puro; o PHP já serializa
                source_device: "web",
                encerrado: 1,
            };

            let sent = false;
            try {
                if (navigator.onLine) {
                    const r = await fetch(`${API}/api/php/telemetria.php`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(payload),
                    });
                    const j = await r.json();
                    if (!r.ok || !j?.sucesso) throw new Error("Falha ao enviar");
                    sent = true;
                }
            } catch {
                // fila offline
                const q = readQueue();
                q.push({ when: Date.now(), url: `${API}/api/php/telemetria.php`, body: payload });
                writeQueue(q);
                try {
                    alert("Sem internet: sessão salva no aparelho e será enviada ao reconectar.");
                } catch { }
            }

            if (sent) setMsg({ text: "Telemetria salva!", ok: true });
            onSaved?.();
            onClose();
        } finally {
            setSaving(false);
        }
    }

    /* ====== efeitos ====== */
    useEffect(() => {
        if (!open) {
            setVeiculo("");
            setMsg(null);
            return;
        }
    }, [open]);

    useEffect(() => {
        // tenta escoar fila ao abrir modal
        flushQueue();
        const on = () => flushQueue();
        window.addEventListener("online", on);
        return () => window.removeEventListener("online", on);
    }, []);

    /* ====== UI ====== */

    // Apenas a lista de veículos. Ao escolher, começa automaticamente.
    return (
        <Modal open={open} onClose={saving ? () => { } : onClose} ariaLabel="Selecionar veículo" maxWidth={560}>
            <h3 className="text-lg font-semibold">Selecionar veículo</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                Ao selecionar, pediremos a localização (se necessário), atualizaremos o status e iniciaremos a telemetria.
            </p>

            <div className="mt-4">
                <label className="mb-1 block text-sm text-slate-600">Veículo</label>
                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={veiculo}
                    onChange={async (e) => {
                        const v = e.target.value;
                        setVeiculo(v);
                        // inicia imediatamente após escolher
                        await startAfterSelect();
                    }}
                >
                    <option value="">Selecione…</option>
                    {VEICULOS.map((v: string) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <button
                    type="button"
                    onClick={saving ? undefined : onClose}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    disabled={saving}
                >
                    Fechar
                </button>

                <button
                    type="button"
                    onClick={saving ? undefined : stopAndSave}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    disabled={saving}
                >
                    Encerrar e Salvar
                </button>
            </div>

            {msg && (
                <div className="mt-3">
                    <TextFeedback kind={msg.ok ? "success" : "error"}>{msg.text}</TextFeedback>
                </div>
            )}
        </Modal>
    );
});
