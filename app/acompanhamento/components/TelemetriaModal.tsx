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

import TextFeedback from "./TextFeedback";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

/* ======================= Tipos ======================= */
export type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

type Ponto = {
    lat: number;
    lng: number;
    ts: number; // epoch ms
    spd?: number; // m/s
    acc?: number; // metros de precisão
};

type PontoPayload = {
    lat: number;
    lng: number;
    ts: number; // epoch ms, mantido por compatibilidade com este coletor
    t: number; // epoch seconds, compatível com a tela de telemetria
    spd?: number; // m/s, mantido por compatibilidade
    spd_kmh?: number; // km/h, compatível com parsers que leem spd_kmh
    v?: number; // km/h, compatível com parsers que leem v
    acc?: number;
    label?: string;
};

type VeiculoOpcao = {
    nome: string;
    placa: string | null;
    obs?: string | null;
};

export type TelemetriaHandle = {
    /** Chamado externamente (ex.: quando chega a fase que encerra) */
    stopAndSave: () => Promise<void>;
};

/* ======================= Veículos (fallback local) ======================= */
/**
 * Lista local com nome + placa separada.
 *
 * Isso evita salvar apenas "Strada RDR 8G25" em veiculo_nome e deixar placa vazia.
 * A tela de Atendimentos Funerários consegue consultar melhor a iTrack quando o campo placa vem separado.
 */
const VEICULOS: VeiculoOpcao[] = [
    { nome: "Strada", placa: "RDR8G25" },
    { nome: "S10", placa: "PRY7H63" },
    { nome: "SPRINTER", placa: "RDG9170" },
    { nome: "DOBLO", placa: "OZP9875" },
    { nome: "SAVEIRO", placa: "RCQ5B26" },
    { nome: "HILUX", placa: "SKT5G28" },
    { nome: "HILUX", placa: "QTV4I21" },
    { nome: "SAVEIRO", placa: "ONQ6794" },
    { nome: "DUCATO", placa: null, obs: "PLV" },
    { nome: "DUCATO", placa: "PLL6E98" },
    { nome: "OUTRA EMPRESA", placa: null, obs: "Veículo externo" },
];

/* ======================= Utils ======================= */
function isNum(v: any): v is number {
    return Number.isFinite(v);
}

function distMeters(a: Ponto, b: Ponto) {
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
    if (placa) return `${v.nome} ${placa}`;
    if (v.obs) return `${v.nome} - ${v.obs}`;
    return v.nome;
}

function pontoToPayload(p: Ponto): PontoPayload {
    const velocidadeKmh = isNum(p.spd) ? Number((p.spd * 3.6).toFixed(2)) : undefined;
    const data = new Date(p.ts || Date.now());

    return {
        lat: Number(p.lat),
        lng: Number(p.lng),
        ts: p.ts,
        t: Math.floor((p.ts || Date.now()) / 1000),
        spd: p.spd,
        spd_kmh: velocidadeKmh,
        v: velocidadeKmh,
        acc: p.acc,
        label: Number.isNaN(data.getTime()) ? undefined : data.toLocaleString("pt-BR"),
    };
}

function getRegistroId(registro?: Registro) {
    const r = registro as any;
    return r?.sepultamento_id ?? r?.id_sepultamento ?? r?.id ?? null;
}

function getFalecido(registro?: Registro) {
    const r = registro as any;
    return r?.falecido || r?.falecido_nome || r?.nome_falecido || null;
}

/* --------- Queue offline --------- */
type OffPayload = { when: number; url: string; body: any };

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

            const text = await r.text();
            let j: any = null;

            try {
                j = text ? JSON.parse(text) : null;
            } catch {
                j = null;
            }

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

/* --------- Wake Lock --------- */
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
        fase: string; // fase01/fase07/fase09
        tipo: TipoTele;
        /** Atualiza status sem perguntar (ex.: fase01) */
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

    // coleta
    const watchIdRef = useRef<number | null>(null);
    const pontosRef = useRef<Ponto[]>([]);
    const startTsRef = useRef<number | null>(null);
    const endTsRef = useRef<number | null>(null);
    const snapshotTimerRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any | null>(null);
    const relockHandlerRef = useRef<() => void>(() => { });
    const veiculoRef = useRef<VeiculoOpcao | null>(null);
    const activeRef = useRef(false);

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

    const veiculoSelecionado = useMemo(() => {
        return VEICULOS.find((v) => veiculoLabel(v) === veiculo) || null;
    }, [veiculo]);

    function snapshotBase(pontos: Ponto[] = pontosRef.current) {
        const veic = veiculoRef.current;

        return {
            id: getRegistroId(registro),
            fase,
            tipo,
            veiculo: veic ? veiculoLabel(veic) : veiculo,
            veiculo_nome: veic?.nome || veiculo || null,
            placa: veic?.placa || null,
            startTs: startTsRef.current,
            pontos,
        };
    }

    /* ====== start/stop ====== */

    async function startAfterSelect(veiculoEscolhido: VeiculoOpcao) {
        if (starting || activeRef.current) return;

        setStarting(true);
        setMsg(null);
        veiculoRef.current = veiculoEscolhido;
        activeRef.current = true;

        // confirma ação (muda status) silenciosamente
        try {
            await onConfirmAcao?.(fase);
        } catch { }

        // wake lock + relock em mudança de visibilidade
        wakeLockRef.current = await requestWakeLock();
        const relock = async () => {
            if (!wakeLockRef.current) {
                wakeLockRef.current = await requestWakeLock();
            }
        };
        relockHandlerRef.current = relock;
        window.addEventListener("visibilitychange", relock);

        // watchPosition rodando em background
        try {
            startTsRef.current = Date.now();
            endTsRef.current = null;
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

                    // filtros: pelo menos 1s e 3m entre pontos, reduzindo jitter sem perder trajetória.
                    const enoughTime = !last || p.ts - last.ts >= 1000;
                    const enoughMove = !last || distMeters(last, p) >= 3;

                    if (enoughTime && enoughMove) {
                        arr.push(p);
                    } else if (!last) {
                        arr.push(p);
                    }

                    // snapshot periódico local
                    saveActiveSnapshot(snapshotBase(arr));
                },
                () => { },
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
            );
            watchIdRef.current = id;
        } catch (e: any) {
            activeRef.current = false;
            setMsg({ text: e?.message || "Falha ao iniciar localização.", ok: false });
            setStarting(false);
            return;
        }

        // timer de snapshot (redundância)
        if (snapshotTimerRef.current == null) {
            snapshotTimerRef.current = window.setInterval(() => {
                saveActiveSnapshot(snapshotBase());
            }, 5000) as unknown as number;
        }

        // tentar escoar fila quando ficar online
        window.addEventListener("online", flushQueue);

        onStarted?.({ fase });
        setStarting(false);

        // fecha o modal imediatamente após selecionar (coleta continua em background)
        onClose();
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

            window.removeEventListener("visibilitychange", relockHandlerRef.current);
            window.removeEventListener("online", flushQueue);
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

            for (let i = 1; i < pontos.length; i++) {
                dist += distMeters(pontos[i - 1], pontos[i]);
            }

            for (const p of pontos) {
                if (isNum(p.spd)) vmax = Math.max(vmax, p.spd * 3.6);
            }

            const inicioMs = startTsRef.current || Date.now();
            const fimMs = endTsRef.current || Date.now();
            const durS = Math.max(1, Math.round((fimMs - inicioMs) / 1000));
            const velMedKmH = dist > 0 ? (dist / 1000) / (durS / 3600) : 0;

            const veic = veiculoRef.current || veiculoSelecionado;
            const placa = normalizePlaca(veic?.placa || "");
            const pontosJson = pontos.map(pontoToPayload);

            const payload = {
                acao: "inserir",

                // Fallback importante: alguns registros têm id, mas não sepultamento_id.
                sepultamento_id: getRegistroId(registro),

                tipo,
                falecido: getFalecido(registro),

                // Envia nome e placa separados para a aba Atendimentos Funerários conseguir cruzar com iTrack.
                veiculo_nome: veic?.nome || veiculo || null,
                placa: placa || null,
                veiculo_obs: veic?.obs || null,

                inicio_ts: new Date(inicioMs).toISOString().slice(0, 19).replace("T", " "),
                fim_ts: new Date(fimMs).toISOString().slice(0, 19).replace("T", " "),
                inicio_lat: pontos[0]?.lat ?? null,
                inicio_lng: pontos[0]?.lng ?? null,
                fim_lat: pontos[pontos.length - 1]?.lat ?? null,
                fim_lng: pontos[pontos.length - 1]?.lng ?? null,
                distancia_km: Number((dist / 1000).toFixed(3)),
                duracao_seg: durS,

                // Mantém os nomes antigos e adiciona nomes equivalentes que a tela lê.
                vel_media_kmh: Number(velMedKmH.toFixed(2)),
                vel_max_kmh: Number(vmax.toFixed(2)),
                velocidade_media: Number(velMedKmH.toFixed(2)),
                velocidade_max: Number(vmax.toFixed(2)),

                amostras: pontos.length,
                pontos_json: pontosJson,
                source_device: "web",
                origem_dados: "web_geolocation",
                encerrado: 1,
            };

            let sent = false;

            try {
                if (navigator.onLine) {
                    const r = await fetch(`${ENDPOINT}/api/php/telemetria.php`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
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
                        throw new Error(j?.msg || "Falha ao enviar telemetria.");
                    }

                    sent = true;
                }
            } catch {
                const q = readQueue();
                q.push({ when: Date.now(), url: `${ENDPOINT}/api/php/telemetria.php`, body: payload });
                writeQueue(q);

                try {
                    alert("Sem internet: sessão salva no aparelho e será enviada ao reconectar.");
                } catch { }
            }

            if (sent) setMsg({ text: "Telemetria salva!", ok: true });

            pontosRef.current = [];
            startTsRef.current = null;
            endTsRef.current = null;
            activeRef.current = false;
            veiculoRef.current = null;

            onSaved?.();
        } finally {
            setSaving(false);
        }
    }

    /* ====== efeitos ====== */
    useEffect(() => {
        if (!open) {
            setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
            setMsg(null);
            setStarting(false);
            return;
        }
    }, [open]);

    useEffect(() => {
        // tenta escoar fila ao montar
        flushQueue();
        const on = () => flushQueue();
        window.addEventListener("online", on);
        return () => window.removeEventListener("online", on);
    }, []);

    useEffect(() => {
        return () => {
            if (watchIdRef.current != null) {
                try {
                    navigator.geolocation.clearWatch(watchIdRef.current);
                } catch { }
                watchIdRef.current = null;
            }

            if (snapshotTimerRef.current != null) {
                try {
                    window.clearInterval(snapshotTimerRef.current);
                } catch { }
                snapshotTimerRef.current = null;
            }

            window.removeEventListener("visibilitychange", relockHandlerRef.current);
            window.removeEventListener("online", flushQueue);

            if (wakeLockRef.current) {
                try {
                    wakeLockRef.current.release?.();
                } catch { }
                wakeLockRef.current = null;
            }
        };
    }, []);

    /* ====== UI ====== */

    // Apenas a lista de veículos; ao escolher, inicia e fecha o modal.
    return (
        <Modal open={open} onClose={saving || starting ? () => { } : onClose} ariaLabel="Selecionar veículo" maxWidth={560}>
            <h3 className="text-lg font-semibold">Selecionar veículo</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                Ao selecionar, pediremos a localização, se necessário, e iniciaremos a telemetria de {titulo.toLowerCase()}.
                O encerramento ocorre automaticamente quando o próximo comando for registrado.
            </p>

            <div className="mt-4">
                <label className="mb-1 block text-sm text-slate-600">Veículo</label>
                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={veiculo}
                    disabled={saving || starting}
                    onChange={async (e) => {
                        const label = e.target.value;
                        if (!label) return;

                        const escolhido = VEICULOS.find((v) => veiculoLabel(v) === label);
                        if (!escolhido) return;

                        // Guarda em ref antes de iniciar para não depender do setState assíncrono.
                        veiculoRef.current = escolhido;
                        setVeiculo(label);
                        await startAfterSelect(escolhido);
                    }}
                >
                    <option value="">Selecione…</option>
                    {VEICULOS.map((v) => {
                        const label = veiculoLabel(v);
                        return (
                            <option key={`${v.nome}-${v.placa || v.obs || label}`} value={label}>
                                {label}
                            </option>
                        );
                    })}
                </select>

                <p className="mt-2 text-xs text-slate-500">
                    A placa será salva separadamente quando disponível, melhorando o vínculo com os atendimentos e com a iTrack.
                </p>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                    type="button"
                    onClick={saving || starting ? undefined : onClose}
                    className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60 sm:w-auto"
                    disabled={saving || starting}
                >
                    Fechar
                </button>
            </div>

            {(starting || saving) && (
                <div className="mt-3 rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {starting ? "Iniciando telemetria..." : "Salvando telemetria..."}
                </div>
            )}

            {msg && (
                <div className="mt-3">
                    <TextFeedback kind={msg.ok ? "success" : "error"}>{msg.text}</TextFeedback>
                </div>
            )}
        </Modal>
    );
});
