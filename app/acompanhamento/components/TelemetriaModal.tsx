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
    placa: string;
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
    return `${v.nome} ${placaComTraco(v.placa)}`;
}

function getRegistroId(registro?: Registro) {
    const r = registro as any;
    return r?.sepultamento_id ?? r?.id_sepultamento ?? r?.id ?? null;
}

function getFalecido(registro?: Registro) {
    const r = registro as any;
    return r?.falecido || r?.falecido_nome || r?.nome_falecido || null;
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

/* ======================= Fila offline ======================= */

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

            if (!r.ok || !j?.sucesso) {
                throw new Error(j?.msg || "Falha ao enviar item da fila.");
            }
        } catch {
            rest.push(item);
        }
    }

    writeQueue(rest);
}

/* ======================= Snapshot da sessão ativa ======================= */

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
    const [veiculo, setVeiculo] = useState("");
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);

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
            origem_dados: "itrack",
            source_device: "rastreador",
        };
    }

    async function startAfterSelect(veiculoEscolhido: VeiculoOpcao) {
        if (starting || activeRef.current) return;

        const placa = normalizePlaca(veiculoEscolhido.placa);
        if (!placa) {
            try {
                alert("Selecione um veículo com placa.");
            } catch { }
            return;
        }

        setStarting(true);

        veiculoRef.current = {
            ...veiculoEscolhido,
            placa,
        };

        activeRef.current = true;
        startTsRef.current = Date.now();
        endTsRef.current = null;

        try {
            await onConfirmAcao?.(fase);
        } catch { }

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
        setStarting(false);

        // Fecha o modal depois da seleção. A sessão fica marcada como ativa até stopAndSave().
        onClose();
    }

    async function stopAndSave() {
        if (saving) return;

        setSaving(true);

        try {
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

            const veic = veiculoRef.current || veiculoSelecionado;
            const placa = normalizePlaca(veic?.placa || "");

            if (!veic || !placa) {
                activeRef.current = false;
                try {
                    alert("Nenhum veículo com placa foi selecionado para buscar a rota do rastreador.");
                } catch { }
                return;
            }

            const inicioMs = startTsRef.current || Date.now();
            const fimMs = Date.now();
            endTsRef.current = fimMs;

            const payload = {
                acao: "inserir_itrack",

                sepultamento_id: getRegistroId(registro),
                tipo,
                falecido: getFalecido(registro),

                veiculo_nome: veic.nome || veiculoLabel(veic),
                placa,
                veiculo_obs: null,

                inicio_ts: toMysqlDateTime(new Date(inicioMs)),
                fim_ts: toMysqlDateTime(new Date(fimMs)),

                source_device: "rastreador",
                origem_dados: "itrack",
                encerrado: 1,
            };

            let sent = false;

            try {
                if (navigator.onLine) {
                    const r = await fetch(TELEMETRIA_URL, {
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
                        throw new Error(j?.msg || "Falha ao gravar telemetria pelo rastreador.");
                    }

                    sent = true;
                } else {
                    throw new Error("Sem internet.");
                }
            } catch (e: any) {
                const q = readQueue();
                q.push({ when: Date.now(), url: TELEMETRIA_URL, body: payload });
                writeQueue(q);

                try {
                    alert(
                        e?.message
                            ? `Não foi possível enviar agora: ${e.message}. A sessão foi salva no aparelho e será reenviada ao reconectar.`
                            : "Sem internet: sessão salva no aparelho e será enviada ao reconectar."
                    );
                } catch { }
            }

            startTsRef.current = null;
            endTsRef.current = null;
            activeRef.current = false;
            veiculoRef.current = null;

            if (sent) {
                onSaved?.();
            }
        } finally {
            setSaving(false);
        }
    }

    /* ======================= Efeitos ======================= */

    useEffect(() => {
        if (open) {
            setStarting(false);
            setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
            return;
        }

        setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
        setStarting(false);
    }, [open]);

    useEffect(() => {
        flushQueue();
        const on = () => flushQueue();
        window.addEventListener("online", on);
        return () => window.removeEventListener("online", on);
    }, []);

    useEffect(() => {
        return () => {
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

    /* ======================= UI ======================= */

    return (
        <Modal
            open={open}
            onClose={saving || starting ? () => { } : onClose}
            ariaLabel="Selecionar veículo"
            maxWidth={420}
        >
            <h3 className="text-lg font-semibold uppercase">Selecionar veículo</h3>

            <div className="mt-4">
                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={veiculo}
                    disabled={saving || starting}
                    onChange={async (e) => {
                        const label = e.target.value;
                        if (!label) return;

                        const escolhido = veiculosOpcoes.find((v) => veiculoLabel(v) === label);
                        if (!escolhido) return;

                        const placa = normalizePlaca(escolhido.placa);
                        if (!placa) {
                            setVeiculo("");
                            try {
                                alert("Selecione um veículo com placa.");
                            } catch { }
                            return;
                        }

                        const escolhidoNormalizado = {
                            ...escolhido,
                            placa,
                        };

                        veiculoRef.current = escolhidoNormalizado;
                        setVeiculo(label);
                        await startAfterSelect(escolhidoNormalizado);
                    }}
                >
                    <option value="">Selecione…</option>

                    {veiculosOpcoes.map((v) => {
                        const label = veiculoLabel(v);

                        return (
                            <option key={`${v.nome}-${v.placa}`} value={label}>
                                {label}
                            </option>
                        );
                    })}
                </select>
            </div>

            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    onClick={saving || starting ? undefined : onClose}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                    disabled={saving || starting}
                >
                    Fechar
                </button>
            </div>
        </Modal>
    );
});
