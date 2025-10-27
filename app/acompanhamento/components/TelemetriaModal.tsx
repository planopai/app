"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import { API } from "./constants";
import { jsonWith401 } from "./helpers";

/** lista fixa pedida */
const VEICULOS = [
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
] as const;

type TipoTele = "remocao" | "para_velorio" | "para_sepultamento";

type Ponto = { ts: number; lat: number; lng: number; acc?: number; spd?: number };

function haversineKm(a: Ponto, b: Ponto) {
    const R = 6371;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export default function TelemetriaModal({
    open,
    onClose,
    registro,
    fase, // "fase01" | "fase07" | "fase09"
    tipo,  // "remocao" | "para_velorio" | "para_sepultamento"
    onConfirmAcao, // ao iniciar, confirma a ação original
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro;
    fase: string;
    tipo: TipoTele;
    onConfirmAcao: (fase: string) => void | Promise<void>;
}) {
    const [veiculo, setVeiculo] = useState<string>("");
    const [obs, setObs] = useState<string>("");
    const [iniciou, setIniciou] = useState(false);
    const [watchId, setWatchId] = useState<number | null>(null);
    const [pontos, setPontos] = useState<Ponto[]>([]);
    const [inicioTs, setInicioTs] = useState<number | null>(null);
    const [fimTs, setFimTs] = useState<number | null>(null);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [saving, setSaving] = useState(false);

    // reset ao abrir/fechar
    useEffect(() => {
        if (!open) return;
        setVeiculo("");
        setObs("");
        setIniciou(false);
        setPontos([]);
        setWatchId(null);
        setInicioTs(null);
        setFimTs(null);
        setMsg(null);
    }, [open]);

    // iniciar rastreamento
    const start = useCallback(async () => {
        if (iniciou) return;
        setMsg(null);

        if (!veiculo.trim()) {
            setMsg({ text: "Escolha um veículo para iniciar.", ok: false });
            return;
        }

        if (!("geolocation" in navigator)) {
            setMsg({ text: "Este dispositivo não permite geolocalização.", ok: false });
            return;
        }

        // confirma a ação de status antes de começar a gravar pontos
        try { await onConfirmAcao(fase); } catch { }

        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy, speed } = pos.coords;
                const p: Ponto = {
                    ts: Date.now(),
                    lat: latitude,
                    lng: longitude,
                    acc: accuracy ?? undefined,
                    spd: typeof speed === "number" ? speed : undefined,
                };
                setPontos((arr) => (arr.length && arr[arr.length - 1].lat === p.lat && arr[arr.length - 1].lng === p.lng ? arr : [...arr, p]));
            },
            (err) => {
                setMsg({ text: "Falha na geolocalização: " + (err?.message || "erro"), ok: false });
            },
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
        );

        setWatchId(id as unknown as number);
        setInicioTs(Date.now());
        setIniciou(true);
    }, [iniciou, veiculo, fase, onConfirmAcao]);

    // encerrar rastreamento
    const stop = useCallback(() => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
        setFimTs(Date.now());
    }, [watchId]);

    // métricas
    const { distanciaKm, duracaoSeg, velMediaKmh, velMaxKmh } = useMemo(() => {
        let dist = 0;
        for (let i = 1; i < pontos.length; i++) {
            dist += haversineKm(pontos[i - 1], pontos[i]);
        }
        const t0 = inicioTs ?? (pontos[0]?.ts || null);
        const t1 = fimTs ?? (pontos[pontos.length - 1]?.ts || null);
        const dur = t0 && t1 ? Math.max(0, Math.round((t1 - t0) / 1000)) : 0;
        const vMedia = dur > 0 ? (dist / (dur / 3600)) : 0;
        const vMax = pontos.reduce((mx, p) => (typeof p.spd === "number" ? Math.max(mx, p.spd * 3.6) : mx), 0);
        return { distanciaKm: dist, duracaoSeg: dur, velMediaKmh: vMedia, velMaxKmh: vMax };
    }, [pontos, inicioTs, fimTs]);

    // salvar no PHP (um único insert por trajeto)
    const salvar = useCallback(async () => {
        if (!registro?.id) { setMsg({ text: "Registro inválido.", ok: false }); return; }
        if (!iniciou) { setMsg({ text: "Inicie o trajeto antes de salvar.", ok: false }); return; }

        // garantir stop
        if (!fimTs) stop();

        try {
            setSaving(true);
            const body = {
                acao: "inserir",
                sepultamento_id: Number(registro.id),
                tipo,
                falecido: registro.falecido || "",
                veiculo_nome: veiculo,
                veiculo_obs: obs || null,
                inicio_ts: new Date(inicioTs || Date.now()).toISOString().slice(0, 19).replace("T", " "),
                fim_ts: new Date((fimTs || Date.now())).toISOString().slice(0, 19).replace("T", " "),
                distancia_km: Number(distanciaKm.toFixed(3)),
                duracao_seg: duracaoSeg,
                vel_media_kmh: Number(velMediaKmh.toFixed(2)),
                vel_max_kmh: Number(velMaxKmh.toFixed(2)),
                amostras: pontos.length,
                pontos_json: pontos,
                source_device: "web",
                encerrado: 1,
            };

            const res = await jsonWith401(`${API}/api/php/telemetria.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res?.sucesso) {
                setMsg({ text: "Telemetria salva!", ok: true });
                // fecha em seguida
                setTimeout(onClose, 800);
            } else {
                setMsg({ text: res?.msg || "Falha ao salvar telemetria.", ok: false });
            }
        } catch (e: any) {
            setMsg({ text: e?.message || "Erro ao salvar.", ok: false });
        } finally {
            setSaving(false);
        }
    }, [registro?.id, iniciou, fimTs, stop, tipo, registro?.falecido, veiculo, obs, inicioTs, distanciaKm, duracaoSeg, velMediaKmh, velMaxKmh, pontos, onClose]);

    const podeSalvar = iniciou && pontos.length >= 2;

    if (!open) return null;

    return (
        <Modal open={open} onClose={() => { if (iniciou) stop(); onClose(); }} ariaLabel="Seleção de veículo" maxWidth={640}>
            <h3 className="text-lg font-semibold">Selecionar veículo e telemetria</h3>
            <p className="mt-1 text-xs text-muted-foreground">
                Esta etapa aparece para: <b>Indo Retirar o Óbito</b>, <b>Transportando Óbito P/Velório</b> e <b>Transportando P/ Sepultamento</b>.
            </p>

            <div className="mt-4 grid gap-3">
                <div>
                    <label className="mb-1 block text-sm font-medium">Veículo</label>
                    <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={veiculo}
                        onChange={(e) => setVeiculo(e.target.value)}
                        disabled={iniciou}
                    >
                        <option value="">Selecione…</option>
                        {VEICULOS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium">Observação (opcional)</label>
                    <input
                        type="text"
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ex.: com coroa / tanque baixo / etc."
                        disabled={iniciou}
                    />
                </div>

                <div className="rounded-md border p-3 text-sm">
                    <div><b>Falecido(a):</b> {registro?.falecido || "-"}</div>
                    <div><b>Tipo do trajeto:</b> {tipo === "remocao" ? "Remoção" : tipo === "para_velorio" ? "Para Velório" : "Para Sepultamento"}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <div><b>Pontos:</b> {pontos.length}</div>
                        <div><b>Distância (km):</b> {distanciaKm.toFixed(3)}</div>
                        <div><b>Duração:</b> {duracaoSeg}s</div>
                        <div><b>Vel. média (km/h):</b> {velMediaKmh.toFixed(2)}</div>
                        <div><b>Vel. máx (km/h):</b> {velMaxKmh.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
                {!iniciou ? (
                    <>
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={onClose}>Cancelar</button>
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                            disabled={!veiculo}
                            onClick={start}
                            title="Confirma a ação e inicia o rastreamento"
                        >
                            Iniciar trajeto e confirmar ação
                        </button>
                    </>
                ) : (
                    <>
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => { stop(); onClose(); }}>
                            Encerrar sem salvar
                        </button>
                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
                            disabled={!podeSalvar || saving}
                            onClick={salvar}
                        >
                            {saving ? "Salvando…" : "Finalizar e salvar telemetria"}
                        </button>
                    </>
                )}

                <span className="ml-auto text-xs text-muted-foreground">
                    {iniciou ? "Rastreando…" : "Aguardando início"}
                </span>
            </div>

            {msg && (
                <div className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
                    {msg.text}
                </div>
            )}
        </Modal>
    );
}
