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
import { API } from "./constants"; // mantém sua base de API

/* ======================= Tipos ======================= */
export type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

export type TelemetriaHandle = {
    /** Encerra a sessão em andamento, calcula estatísticas e salva no PHP */
    stopAndSave: () => Promise<void>;
};

type Props = {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
    /** fase é algo como "fase01" | "fase07" | "fase09" */
    fase: string;
    /** tipo: "remocao" | "para_velorio" | "para_sepultamento" */
    tipo: TipoTele;

    /** Atualiza o status no PHP sem UI de confirmação (silencioso) */
    onConfirmAcao?: (fase: string) => Promise<void> | void;
    /** Notifica o page.tsx que começamos (para ele marcar teleActive, etc.) */
    onStarted?: (info: { fase: string }) => void;
    /** Notifica o page.tsx quando salvarmos */
    onSaved?: () => void;
};

/* ======================= Fallback de veículos ======================= */
/* Tentamos importar de constants.ts (se houver), senão usamos este fallback */
let EXTERNAL_VEICS: string[] | undefined;
try {
    // @ts-ignore – se não existir, caímos no catch
    const m = require("./constants");
    EXTERNAL_VEICS =
        m?.veiculosNomes ||
        m?.veiculos ||
        m?.VEICULOS ||
        m?.VEICULOS_NOMES ||
        undefined;
} catch {
    // ignore
}

const FALLBACK_VEICS: string[] = [
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

function getVeiculosLista(reg?: Registro | null): string[] {
    const base =
        (EXTERNAL_VEICS && Array.isArray(EXTERNAL_VEICS) && EXTERNAL_VEICS.length
            ? EXTERNAL_VEICS
            : FALLBACK_VEICS) as string[];
    // Garante que o veículo previamente salvo no registro, se houver, estará na lista
    const atual = (reg?.veiculo_nome || "").toString().trim();
    if (atual && !base.some((v) => v === atual)) return [atual, ...base];
    return base;
}

/* ======================= Haversine ======================= */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371; // km
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sa =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
    return R * c;
}

/* ======================= Componente ======================= */
const TelemetriaModal = forwardRef<TelemetriaHandle, Props>(function TelemetriaModal(
    { open, onClose, registro, fase, tipo, onConfirmAcao, onStarted, onSaved },
    ref
) {
    // lista de veículos (somente UI mínima)
    const veics = useMemo(() => getVeiculosLista(registro || null), [registro]);

    // estado mínimo
    const [sel, setSel] = useState<string>("");
    const [saving, setSaving] = useState(false);

    // telemetria em memória
    const watchIdRef = useRef<number | null>(null);
    const startedAtRef = useRef<number | null>(null);
    const pontosRef = useRef<{ ts: number; lat: number; lng: number; spd?: number }[]>([]);
    const veiculoRef = useRef<string>("");

    useEffect(() => {
        if (!open) {
            setSel("");
        }
    }, [open]);

    // expõe stopAndSave para o page.tsx
    useImperativeHandle(ref, () => ({
        stopAndSave: async () => {
            // se não foi iniciado, apenas notifica
            if (!startedAtRef.current) {
                onSaved?.();
                return;
            }
            try {
                setSaving(true);

                // para o watch
                if (watchIdRef.current != null) {
                    navigator.geolocation.clearWatch(watchIdRef.current);
                    watchIdRef.current = null;
                }

                const pontos = pontosRef.current.slice();
                const t0 = startedAtRef.current!;
                const t1 = Date.now();
                const duracao_seg = Math.max(0, Math.round((t1 - t0) / 1000));

                // distância e velocidades
                let distancia_km = 0;
                let vel_max_kmh = 0;

                for (let i = 1; i < pontos.length; i++) {
                    const a = pontos[i - 1];
                    const b = pontos[i];
                    distancia_km += haversineKm(a, b);
                    if (typeof b.spd === "number") {
                        vel_max_kmh = Math.max(vel_max_kmh, b.spd * 3.6); // m/s -> km/h
                    }
                }

                const vel_media_kmh =
                    duracao_seg > 0 ? (distancia_km / (duracao_seg / 3600)) : 0;

                // monta payload compatível com seu telemetria.php
                const payload: any = {
                    acao: "inserir",
                    sepultamento_id:
                        registro?.sepultamento_id != null ? Number(registro.sepultamento_id) : null,
                    tipo,
                    falecido: registro?.falecido ?? null,
                    veiculo_nome: veiculoRef.current || sel || registro?.veiculo_nome || null,
                    veiculo_obs: null,
                    inicio_ts: new Date(t0).toISOString().slice(0, 19).replace("T", " "),
                    fim_ts: new Date(t1).toISOString().slice(0, 19).replace("T", " "),
                    distancia_km,
                    duracao_seg,
                    vel_media_kmh,
                    vel_max_kmh,
                    amostras: pontos.length,
                    pontos_json: pontos.map((p) => ({
                        ts: p.ts,
                        lat: p.lat,
                        lng: p.lng,
                        spd: p.spd ?? null,
                    })),
                    source_device: "web",
                    encerrado: true,
                };

                await fetch(`${API}/api/php/telemetria.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                }).catch(() => null);

                // limpa estado
                startedAtRef.current = null;
                pontosRef.current = [];
                veiculoRef.current = "";

                onSaved?.();
            } finally {
                setSaving(false);
            }
        },
    }));

    // inicia a coleta (sem exibir nada além do select)
    async function startAfterSelect(vNome: string) {
        veiculoRef.current = vNome;

        // pede permissão/primeiro ponto (não bloqueante)
        try {
            await new Promise<void>((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    () => resolve(),
                    () => resolve(),
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
                );
            });
        } catch {
            // segue mesmo sem o 1º ponto
        }

        // confere/atualiza status no PHP (silencioso)
        try {
            await onConfirmAcao?.(fase);
        } catch {
            // mesmo que falhe, vamos em frente para não travar o agente
        }

        // Inicia o watch
        try {
            startedAtRef.current = Date.now();
            pontosRef.current = [];
            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, speed } = pos.coords;
                    // normaliza
                    const lat = Number(latitude);
                    const lng = Number(longitude);
                    const spd = typeof speed === "number" && isFinite(speed) ? speed : undefined;
                    if (!isFinite(lat) || !isFinite(lng)) return;

                    pontosRef.current.push({
                        ts: Date.now(),
                        lat,
                        lng,
                        spd,
                    });
                    // limitador simples para não crescer infinito (opcional)
                    if (pontosRef.current.length > 5000) {
                        pontosRef.current.splice(0, 1000);
                    }
                },
                // erro – apenas ignora (não mostra nada ao agente)
                () => { },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
            );
            watchIdRef.current = id as unknown as number;
        } catch {
            // sem watch, seguimos – o stopAndSave vai salvar com 0 pontos
        }

        // avisa a página que começamos
        onStarted?.({ fase });
        // fecha o modal imediatamente (fluxo pedido)
        onClose();
    }

    return (
        <Modal open={open} onClose={onClose} ariaLabel="Selecionar veículo" maxWidth={720}>
            <h2 className="text-xl font-semibold">Selecionar veículo</h2>
            <p className="mt-1 text-xs text-muted-foreground">
                Ao selecionar, pediremos a localização (se necessário), confirmaremos a ação e
                iniciaremos a telemetria automaticamente.
            </p>

            {/* Único controle visível: select de veículo */}
            <div className="mt-4">
                <label className="mb-1 block text-sm font-medium">Veículo</label>
                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={sel}
                    onChange={(e) => {
                        const v = e.target.value;
                        setSel(v);
                        if (v) {
                            // inicia tudo e fecha
                            startAfterSelect(v);
                        }
                    }}
                >
                    <option value="">Selecione...</option>
                    {veics.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mt-6 flex items-center justify-between">
                <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={onClose}
                    disabled={saving}
                >
                    Fechar
                </button>
                <div className="text-xs text-muted-foreground">
                    {saving ? "Salvando..." : "Aguardando seleção"}
                </div>
            </div>
        </Modal>
    );
});

export default TelemetriaModal;
