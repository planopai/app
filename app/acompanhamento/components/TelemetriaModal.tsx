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
const TELEMETRIA_URL = `${ENDPOINT}/api/php/telemetria.php`;

/* ======================= Tipos ======================= */

export type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

type VeiculoOpcao = {
    nome: string;
    placa: string | null;
    obs?: string | null;
    id_veiculo_itrack?: number | null;
    id_rastreador_itrack?: string | null;
    nome_motorista?: string | null;
    origem?: "api" | "fixo";
};

type ItrackVeiculo = {
    idVeiculo?: number;
    id_veiculo?: number;
    placa?: string | null;
    descricaoVeiculo?: string | null;
    descricao_veiculo?: string | null;
    idRastreador?: string | null;
    id_rastreador?: string | null;
    nomeMotorista?: string | null;
    nome_motorista?: string | null;
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

/* ======================= Veículos ======================= */
/**
 * Mantém o padrão atual da tela: lista local de veículos/placas.
 * A rota NÃO será gravada pelo GPS do celular.
 * Ao encerrar, o modal envia placa + início + fim para o PHP, e o PHP busca a rota real na iTrack.
 *
 * Quando a API de veículos carregar, o modal cruza pela placa e usa nome/rastreador reais da iTrack.
 */
const VEICULOS_FIXOS: VeiculoOpcao[] = [
    { nome: "STRADA", placa: "RDR8G25", origem: "fixo" },
    { nome: "S10", placa: "PRY7H63", origem: "fixo" },
    { nome: "SPRINTER", placa: "RDG9170", origem: "fixo" },
    { nome: "DOBLO", placa: "OZP9875", origem: "fixo" },
    { nome: "SAVEIRO", placa: "RCQ5B26", origem: "fixo" },
    { nome: "HILUX", placa: "SKT5G28", origem: "fixo" },
    { nome: "HILUX", placa: "QTV4I21", origem: "fixo" },
    { nome: "SAVEIRO", placa: "ONQ6794", origem: "fixo" },
    { nome: "DUCATO", placa: "PLV6H34", origem: "fixo" },
    { nome: "DUCATO", placa: "PLL6E98", origem: "fixo" },
    { nome: "OUTRA EMPRESA", placa: null, obs: "Veículo externo sem rastreador iTrack", origem: "fixo" },
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
    if (placa) return `${v.nome} ${placa}`;
    if (v.obs) return `${v.nome} - ${v.obs}`;
    return v.nome;
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

function veiculoDescricaoApi(v: ItrackVeiculo) {
    const nome = String(v.descricaoVeiculo ?? v.descricao_veiculo ?? "").trim();
    return nome || null;
}

function veiculoIdApi(v: ItrackVeiculo) {
    const id = v.idVeiculo ?? v.id_veiculo;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
}

function veiculoRastreadorApi(v: ItrackVeiculo) {
    const rastreador = String(v.idRastreador ?? v.id_rastreador ?? "").trim();
    return rastreador || null;
}

function veiculoMotoristaApi(v: ItrackVeiculo) {
    const motorista = String(v.nomeMotorista ?? v.nome_motorista ?? "").trim();
    return motorista || null;
}

function normalizeItrackVehicles(payload: any): ItrackVeiculo[] {
    const list =
        payload?.dados?.data ??
        payload?.dados?.dados?.data ??
        payload?.dados ??
        payload?.data ??
        [];

    return Array.isArray(list) ? list : [];
}

function mergeVeiculosComApi(fixos: VeiculoOpcao[], api: ItrackVeiculo[]) {
    const porPlaca = new Map<string, ItrackVeiculo>();

    for (const v of api) {
        const placa = normalizePlaca(v.placa);
        if (placa) porPlaca.set(placa, v);
    }

    return fixos.map((fixo) => {
        const placa = normalizePlaca(fixo.placa);
        const encontrado = placa ? porPlaca.get(placa) : null;

        if (!encontrado) return fixo;

        return {
            ...fixo,
            nome: veiculoDescricaoApi(encontrado) || fixo.nome,
            placa,
            id_veiculo_itrack: veiculoIdApi(encontrado),
            id_rastreador_itrack: veiculoRastreadorApi(encontrado),
            nome_motorista: veiculoMotoristaApi(encontrado),
            origem: "api" as const,
        };
    });
}

/* ======================= Queue offline ======================= */

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
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const [veiculosApi, setVeiculosApi] = useState<ItrackVeiculo[]>([]);
    const [loadingVeiculosApi, setLoadingVeiculosApi] = useState(false);
    const [erroVeiculosApi, setErroVeiculosApi] = useState<string | null>(null);

    const startTsRef = useRef<number | null>(null);
    const endTsRef = useRef<number | null>(null);
    const snapshotTimerRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any | null>(null);
    const relockHandlerRef = useRef<() => void>(() => { });
    const veiculoRef = useRef<VeiculoOpcao | null>(null);
    const activeRef = useRef(false);

    const veiculosOpcoes = useMemo(() => {
        return mergeVeiculosComApi(VEICULOS_FIXOS, veiculosApi);
    }, [veiculosApi]);

    const veiculoSelecionado = useMemo(() => {
        return veiculosOpcoes.find((v) => veiculoLabel(v) === veiculo) || null;
    }, [veiculosOpcoes, veiculo]);

    const titulo = useMemo(() => {
        if (tipo === "remocao") return "Remoção";
        if (tipo === "para_velorio") return "Transporte para Velório";
        return "Transporte para Sepultamento";
    }, [tipo]);

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
            id_veiculo_itrack: veic?.id_veiculo_itrack ?? null,
            id_rastreador_itrack: veic?.id_rastreador_itrack ?? null,
            nome_motorista: veic?.nome_motorista ?? null,
            startTs: startTsRef.current,
            origem_dados: "itrack",
            source_device: "rastreador",
        };
    }

    async function carregarVeiculosApi() {
        if (loadingVeiculosApi) return;

        setLoadingVeiculosApi(true);
        setErroVeiculosApi(null);

        try {
            const qs = new URLSearchParams({
                itrack: "listaveiculos",
                salvar: "1",
                _t: String(Date.now()),
            });

            const r = await fetch(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
            });

            const text = await r.text();
            let payload: any = null;

            try {
                payload = text ? JSON.parse(text) : null;
            } catch {
                payload = null;
            }

            if (!r.ok || payload?.erro) {
                throw new Error(payload?.msg || "Falha ao carregar veículos da iTrack.");
            }

            setVeiculosApi(normalizeItrackVehicles(payload));
        } catch (e: any) {
            setErroVeiculosApi(e?.message || "Não foi possível carregar os veículos da iTrack.");
            setVeiculosApi([]);
        } finally {
            setLoadingVeiculosApi(false);
        }
    }

    async function startAfterSelect(veiculoEscolhido: VeiculoOpcao) {
        if (starting || activeRef.current) return;

        const placa = normalizePlaca(veiculoEscolhido.placa);
        if (!placa) {
            setMsg({
                text: "Este veículo não possui placa/rastreador iTrack. Selecione um veículo com placa para gravar a rota do rastreador.",
                ok: false,
            });
            return;
        }

        setStarting(true);
        setMsg(null);

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
                setMsg({
                    text: "Nenhum veículo com placa foi selecionado para buscar a rota do rastreador.",
                    ok: false,
                });
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
                veiculo_obs: veic.obs || null,

                id_veiculo_itrack: veic.id_veiculo_itrack ?? null,
                id_rastreador_itrack: veic.id_rastreador_itrack ?? null,
                nome_motorista: veic.nome_motorista ?? null,

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

            if (sent) {
                setMsg({ text: "Telemetria salva com rota do rastreador!", ok: true });
            }

            startTsRef.current = null;
            endTsRef.current = null;
            activeRef.current = false;
            veiculoRef.current = null;

            onSaved?.();
        } finally {
            setSaving(false);
        }
    }

    /* ======================= Efeitos ======================= */

    useEffect(() => {
        if (open) {
            setMsg(null);
            setStarting(false);
            setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
            carregarVeiculosApi();
            return;
        }

        setVeiculo(veiculoRef.current ? veiculoLabel(veiculoRef.current) : "");
        setMsg(null);
        setStarting(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            maxWidth={560}
        >
            <h3 className="text-lg font-semibold">Selecionar veículo</h3>

            <p className="mt-1 text-xs text-muted-foreground">
                Ao selecionar, a telemetria de {titulo.toLowerCase()} será iniciada.
                No encerramento, a rota será buscada pelo rastreador iTrack usando a placa e o período da operação.
            </p>

            <div className="mt-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm text-slate-600">Veículo</label>

                    <button
                        type="button"
                        onClick={carregarVeiculosApi}
                        disabled={saving || starting || loadingVeiculosApi}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                    >
                        {loadingVeiculosApi ? "Atualizando..." : "Atualizar iTrack"}
                    </button>
                </div>

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
                            setMsg({
                                text: "Este item não possui placa/rastreador iTrack. Selecione um veículo com placa.",
                                ok: false,
                            });
                            setVeiculo("");
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
                        const placa = normalizePlaca(v.placa);
                        const apiInfo = v.origem === "api" ? " • iTrack" : "";

                        return (
                            <option
                                key={`${v.nome}-${v.placa || v.obs || label}`}
                                value={label}
                                disabled={!placa}
                            >
                                {label}{apiInfo}
                            </option>
                        );
                    })}
                </select>

                <p className="mt-2 text-xs text-slate-500">
                    A gravação não usa mais o GPS do celular. O modal salva placa, início e fim; o PHP consulta a rota real do rastreador na iTrack.
                </p>

                {erroVeiculosApi && (
                    <p className="mt-2 text-xs text-amber-700">
                        {erroVeiculosApi} A lista local de placas continuará disponível para vínculo pela placa.
                    </p>
                )}
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
                    {starting ? "Iniciando telemetria..." : "Salvando rota pelo rastreador..."}
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
