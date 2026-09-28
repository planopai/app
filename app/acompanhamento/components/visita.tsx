"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Modal from "./Modal";
import type { Registro } from "./types";

const API_URL = "https://api.planoassistencialintegrado.com.br/visita.php";

export type VisitaStatus = "visitado" | "em_andamento" | "visitar" | "indisponivel";

export type VisitaStatusResumo = {
    atendimento_id: string;
    status: VisitaStatus;
};

type VisitaPergunta = {
    numero: 1 | 2 | 3 | 4 | 5;
    titulo: string;
    descricao: string;
    aplicavel: boolean;
    motivo_nao_aplicavel?: string | null;
};

type VisitaResposta = {
    nota: "" | "1" | "2" | "3" | "4" | "5" | "nao_sei";
    observacao: string;
    fotoBlob: Blob | null;
    fotoPreview: string;
    fotoExistenteUrl: string;
};

type VisitaDados = {
    visita: null | {
        id: number;
        atendimento_id: number | string;
        status: "em_andamento" | "visitado";
        inicio_em: string;
        fim_em?: string | null;
        visitante_id: number;
        visitante_nome: string;
        com_quem_conversou?: string | null;
        grau_parentesco?: string | null;
        apoio_prestado?: string | null;
        latitude_inicio?: number | null;
        longitude_inicio?: number | null;
        precisao_inicio_m?: number | null;
    };
    atendimento: {
        id: number | string;
        falecido: string;
        status: string;
    };
    perguntas: VisitaPergunta[];
    respostas: Array<{
        pergunta_numero: number;
        nota: string | null;
        observacao: string | null;
        foto_url: string | null;
    }>;
};

type AcessoVisita = {
    autenticado: boolean;
    autorizado: boolean;
    id?: number | null;
    nome?: string | null;
    usuario?: string | null;
    cargo?: string | null;
};

const PARENTESCOS = [
    "Cônjuge/companheiro(a)",
    "Filho(a)",
    "Pai/Mãe",
    "Irmão(ã)",
    "Neto(a)",
    "Avô/Avó",
    "Outro parente",
    "Amigo/não-parente",
] as const;

const NOTAS = [
    { value: "1", label: "1 · Muito ruim" },
    { value: "2", label: "2 · Ruim" },
    { value: "3", label: "3 · Regular" },
    { value: "4", label: "4 · Bom" },
    { value: "5", label: "5 · Excelente" },
    { value: "nao_sei", label: "Não sei" },
] as const;

let acessoPromise: Promise<AcessoVisita> | null = null;

async function apiJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...init,
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
        throw new Error(data?.msg || "Sessão expirada. Faça login novamente.");
    }

    if (response.status === 403) {
        throw new Error(data?.msg || "Usuário sem permissão para realizar a visita.");
    }

    if (!response.ok || data?.erro) {
        throw new Error(data?.msg || "Falha na operação da visita.");
    }

    return data;
}

export async function consultarAcessoVisita(force = false): Promise<AcessoVisita> {
    if (!acessoPromise || force) {
        acessoPromise = apiJson(`${API_URL}?action=me&_=${Date.now()}`)
            .then((data) => ({
                autenticado: !!data?.autenticado,
                autorizado: !!data?.autorizado,
                id: data?.id ?? null,
                nome: data?.nome ?? null,
                usuario: data?.usuario ?? null,
                cargo: data?.cargo ?? null,
            }))
            .catch((error) => {
                acessoPromise = null;
                throw error;
            });
    }

    return acessoPromise;
}

export async function consultarStatusVisitas(
    ids: Array<string | number>,
): Promise<Record<string, VisitaStatus>> {
    const uniqueIds = Array.from(
        new Set(
            ids
                .map((id) => String(id ?? "").trim())
                .filter(Boolean),
        ),
    );

    if (uniqueIds.length === 0) {
        return {};
    }

    /**
     * O visita.php limita o status_batch a 300 IDs por requisição.
     * Usamos 200 para:
     * - ficar com margem abaixo do limite do backend;
     * - evitar URLs excessivamente grandes;
     * - reduzir risco de 400/414 em Apache, proxy ou WAF.
     */
    const BATCH_SIZE = 200;

    const out: Record<string, VisitaStatus> = {};

    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        const lote = uniqueIds.slice(i, i + BATCH_SIZE);

        const data = await apiJson(
            `${API_URL}?action=status_batch&ids=${encodeURIComponent(
                lote.join(","),
            )}&_=${Date.now()}`,
        );

        for (const row of Array.isArray(data?.rows) ? data.rows : []) {
            const id = String(row?.atendimento_id ?? "").trim();
            if (!id) continue;

            const status = String(row?.status ?? "") as VisitaStatus;

            out[id] =
                status === "visitado" ||
                    status === "em_andamento" ||
                    status === "visitar"
                    ? status
                    : "indisponivel";
        }
    }

    return out;
}

function defaultResposta(): VisitaResposta {
    return {
        nota: "",
        observacao: "",
        fotoBlob: null,
        fotoPreview: "",
        fotoExistenteUrl: "",
    };
}

function normalizarStatus(status?: string) {
    const raw = String(status ?? "").trim();
    if (!raw) return "";

    const low = raw.toLowerCase();

    if (low.startsWith("fase")) {
        const num = low.replace(/\D+/g, "");
        if (!num) return low;
        return `fase${num.padStart(2, "0")}`;
    }

    const key = low
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const map: Record<string, string> = {
        removendo: "fase01",
        "aguardando procedimento": "fase02",
        preparando: "fase03",
        "aguardando ornamentacao": "fase04",
        ornamentando: "fase05",
        "fim da ornamentacao": "fase06",
        "aguardando corpo pronto": "fase06",
        "corpo pronto": "fase12",
        transportando: "fase07",
        "transportando obito p/velorio": "fase07",
        "transportando obito para velorio": "fase07",
        velando: "fase08",
        "entrega de corpo": "fase08",
        sepultando: "fase09",
        "transportando p/ sepultamento": "fase09",
        "transportando obito para o sepultamento": "fase09",
        "sepultamento concluido": "fase10",
        "material recolhido": "fase11",
    };

    return map[key] ?? low;
}

function formatarDataHora(value?: string | null) {
    if (!value) return "";
    const d = new Date(value.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(d);
}

function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Este aparelho não oferece geolocalização."));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
        });
    });
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    type = "image/jpeg",
    quality = 0.82,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) =>
                blob
                    ? resolve(blob)
                    : reject(new Error("Não foi possível gerar a foto.")),
            type,
            quality,
        );
    });
}

async function comprimirFotoComCarimbo(
    video: HTMLVideoElement,
    falecido: string,
): Promise<Blob> {
    const sourceW = Math.max(1, video.videoWidth || 1280);
    const sourceH = Math.max(1, video.videoHeight || 720);

    const maxW = 1280;
    const maxH = 960;
    const scale = Math.min(maxW / sourceW, maxH / sourceH, 1);

    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível neste navegador.");

    ctx.drawImage(video, 0, 0, width, height);

    const agora = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(new Date());

    const nome = String(falecido || "Atendimento").trim();
    const fontSize = Math.max(18, Math.round(width * 0.022));
    const padding = Math.max(14, Math.round(width * 0.018));
    const lineHeight = Math.round(fontSize * 1.35);

    ctx.font = `600 ${fontSize}px sans-serif`;

    const nomeMax = width - padding * 2;
    let nomeRender = nome;

    while (
        nomeRender.length > 10 &&
        ctx.measureText(nomeRender).width > nomeMax
    ) {
        nomeRender = `${nomeRender.slice(0, -4)}…`;
    }

    const boxH = padding * 2 + lineHeight * 2;
    const y = height - boxH;

    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    ctx.fillRect(0, y, width, boxH);

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(nomeRender, padding, y + padding, nomeMax);
    ctx.font = `500 ${Math.max(15, Math.round(fontSize * 0.82))}px sans-serif`;
    ctx.fillText(agora, padding, y + padding + lineHeight, nomeMax);

    let blob = await canvasToBlob(canvas, "image/jpeg", 0.82);

    if (blob.size > 900 * 1024) {
        blob = await canvasToBlob(canvas, "image/jpeg", 0.68);
    }

    return blob;
}

function statusLabel(status: VisitaStatus) {
    if (status === "visitado") return "Visitado";
    if (status === "em_andamento") return "Em andamento";
    if (status === "visitar") return "Visitar";
    return "—";
}

export function VisitaBotao({
    status,
    onClick,
    disabled,
    className = "",
}: {
    status: VisitaStatus;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}) {
    const classes =
        status === "visitado"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : status === "em_andamento"
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : status === "visitar"
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : "bg-slate-200 text-slate-500";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || status === "indisponivel"}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${classes} ${className}`}
            title={
                status === "indisponivel"
                    ? "Visita disponível somente durante o velório."
                    : "Abrir visita de avaliação"
            }
        >
            {statusLabel(status)}
        </button>
    );
}

export default function Visita({
    open,
    onClose,
    registro,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
    onSaved?: (status: VisitaStatus) => void | Promise<void>;
}) {
    const atendimentoId = String(registro?.id ?? "").trim();
    const falecido = String(registro?.falecido ?? "").trim();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState("");
    const [dados, setDados] = useState<VisitaDados | null>(null);

    const [comQuem, setComQuem] = useState("");
    const [parentesco, setParentesco] = useState("");
    const [apoio, setApoio] = useState("");

    const [respostas, setRespostas] = useState<
        Record<number, VisitaResposta>
    >({});

    const [cameraPergunta, setCameraPergunta] = useState<number | null>(null);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraErro, setCameraErro] = useState("");
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const perguntas = dados?.perguntas ?? [];
    const visita = dados?.visita ?? null;
    const concluida = visita?.status === "visitado";

    const pararCamera = useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            for (const track of stream.getTracks()) track.stop();
        }
        streamRef.current = null;
        setCameraPergunta(null);
        setCameraLoading(false);
        setCameraErro("");
    }, []);

    useEffect(() => {
        if (!open) pararCamera();
        return () => pararCamera();
    }, [open, pararCamera]);

    const carregar = useCallback(async () => {
        if (!atendimentoId) return;

        setLoading(true);
        setErro("");
        setSucesso("");

        try {
            const data = (await apiJson(
                `${API_URL}?action=obter&atendimento_id=${encodeURIComponent(atendimentoId)}&_=${Date.now()}`,
            )) as VisitaDados;

            setDados(data);

            const v = data?.visita;
            setComQuem(String(v?.com_quem_conversou ?? ""));
            setParentesco(String(v?.grau_parentesco ?? ""));
            setApoio(String(v?.apoio_prestado ?? ""));

            const next: Record<number, VisitaResposta> = {};

            for (const p of data?.perguntas ?? []) {
                next[p.numero] = defaultResposta();
            }

            for (const r of data?.respostas ?? []) {
                const n = Number(r?.pergunta_numero);
                if (!next[n]) next[n] = defaultResposta();

                const nota = String(r?.nota ?? "");
                next[n] = {
                    ...next[n],
                    nota:
                        nota === "1" ||
                            nota === "2" ||
                            nota === "3" ||
                            nota === "4" ||
                            nota === "5" ||
                            nota === "nao_sei"
                            ? nota
                            : "",
                    observacao: String(r?.observacao ?? ""),
                    fotoExistenteUrl: String(r?.foto_url ?? ""),
                };
            }

            setRespostas((prev) => {
                for (const value of Object.values(prev)) {
                    if (value?.fotoPreview?.startsWith("blob:")) {
                        URL.revokeObjectURL(value.fotoPreview);
                    }
                }
                return next;
            });
        } catch (e: any) {
            setDados(null);
            setErro(e?.message || "Não foi possível carregar a visita.");
        } finally {
            setLoading(false);
        }
    }, [atendimentoId]);

    useEffect(() => {
        if (!open || !atendimentoId) return;
        void carregar();
    }, [open, atendimentoId, carregar]);

    const iniciarVisita = async () => {
        if (!atendimentoId || saving) return;

        setSaving(true);
        setErro("");
        setSucesso("");

        try {
            if (normalizarStatus(registro?.status) !== "fase08") {
                throw new Error(
                    "A visita só pode ser iniciada quando o atendimento estiver em Velando (fase08).",
                );
            }

            const position = await getCurrentPosition();

            const data = await apiJson(`${API_URL}?action=iniciar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    atendimento_id: atendimentoId,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    precisao_m: position.coords.accuracy,
                }),
            });

            setSucesso("Visita iniciada com localização registrada.");
            await carregar();
            await onSaved?.(
                data?.status === "visitado" ? "visitado" : "em_andamento",
            );
        } catch (e: any) {
            if (e?.code === 1) {
                setErro(
                    "Permissão de localização negada. A localização é obrigatória para iniciar a visita.",
                );
            } else {
                setErro(e?.message || "Não foi possível iniciar a visita.");
            }
        } finally {
            setSaving(false);
        }
    };

    const abrirCamera = async (numero: number) => {
        if (concluida) return;

        pararCamera();
        setCameraPergunta(numero);
        setCameraLoading(true);
        setCameraErro("");

        try {
            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "A câmera não está disponível neste navegador/aparelho.",
                );
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 960 },
                },
                audio: false,
            });

            streamRef.current = stream;

            requestAnimationFrame(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play().catch(() => undefined);
                }
            });
        } catch (e: any) {
            setCameraErro(
                e?.message ||
                "Não foi possível abrir a câmera. Verifique a permissão do navegador.",
            );
        } finally {
            setCameraLoading(false);
        }
    };

    const capturarFoto = async () => {
        const numero = cameraPergunta;
        const video = videoRef.current;
        if (!numero || !video) return;

        setCameraLoading(true);
        setCameraErro("");

        try {
            const blob = await comprimirFotoComCarimbo(video, falecido);
            const preview = URL.createObjectURL(blob);

            setRespostas((prev) => {
                const atual = prev[numero] ?? defaultResposta();

                if (atual.fotoPreview?.startsWith("blob:")) {
                    URL.revokeObjectURL(atual.fotoPreview);
                }

                return {
                    ...prev,
                    [numero]: {
                        ...atual,
                        fotoBlob: blob,
                        fotoPreview: preview,
                    },
                };
            });

            pararCamera();
        } catch (e: any) {
            setCameraErro(e?.message || "Falha ao capturar a foto.");
        } finally {
            setCameraLoading(false);
        }
    };

    const updateResposta = (
        numero: number,
        patch: Partial<VisitaResposta>,
    ) => {
        setRespostas((prev) => ({
            ...prev,
            [numero]: {
                ...(prev[numero] ?? defaultResposta()),
                ...patch,
            },
        }));
    };

    const montarFormData = (finalizar: boolean) => {
        if (!visita?.id) throw new Error("A visita ainda não foi iniciada.");

        const payload = {
            visita_id: visita.id,
            atendimento_id: atendimentoId,
            finalizar,
            com_quem_conversou: comQuem.trim(),
            grau_parentesco: parentesco,
            apoio_prestado: apoio.trim(),
            respostas: perguntas.map((p) => ({
                pergunta_numero: p.numero,
                nota: respostas[p.numero]?.nota || null,
                observacao:
                    respostas[p.numero]?.observacao?.trim() || "",
            })),
        };

        const form = new FormData();
        form.append("payload", JSON.stringify(payload));

        for (const p of perguntas) {
            const blob = respostas[p.numero]?.fotoBlob;
            if (blob) {
                form.append(
                    `foto_${p.numero}`,
                    blob,
                    `visita-${atendimentoId}-pergunta-${p.numero}.jpg`,
                );
            }
        }

        return form;
    };

    const validarFinalizacao = () => {
        if (!comQuem.trim()) {
            throw new Error("Informe com quem você conversou.");
        }

        if (!parentesco) {
            throw new Error("Informe o grau de parentesco.");
        }

        for (const pergunta of perguntas) {
            if (!pergunta.aplicavel) continue;

            const resp = respostas[pergunta.numero];
            if (!resp?.nota) {
                throw new Error(
                    `Selecione uma nota para a pergunta ${pergunta.numero}.`,
                );
            }

            if (
                !resp?.fotoBlob &&
                !String(resp?.fotoExistenteUrl || "").trim()
            ) {
                throw new Error(
                    `Tire a foto obrigatória da pergunta ${pergunta.numero}.`,
                );
            }
        }
    };

    const salvar = async (finalizar: boolean) => {
        if (saving || concluida) return;

        setSaving(true);
        setErro("");
        setSucesso("");

        try {
            if (finalizar) validarFinalizacao();

            const data = await apiJson(
                `${API_URL}?action=${finalizar ? "finalizar" : "salvar_rascunho"}`,
                {
                    method: "POST",
                    body: montarFormData(finalizar),
                },
            );

            setSucesso(
                finalizar
                    ? "Visita concluída com sucesso."
                    : "Rascunho salvo com sucesso.",
            );

            await carregar();
            await onSaved?.(
                finalizingStatus(data?.status),
            );
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar a visita.");
        } finally {
            setSaving(false);
        }
    };

    const finalizingStatus = (status: unknown): VisitaStatus =>
        String(status) === "visitado" ? "visitado" : "em_andamento";

    const progresso = useMemo(() => {
        const aplicaveis = perguntas.filter((p) => p.aplicavel);
        const completos = aplicaveis.filter((p) => {
            const r = respostas[p.numero];
            return (
                !!r?.nota &&
                (!!r?.fotoBlob || !!String(r?.fotoExistenteUrl || "").trim())
            );
        });

        return {
            total: aplicaveis.length,
            completos: completos.length,
        };
    }, [perguntas, respostas]);

    if (!registro) return null;

    return (
        <>
            <Modal
                open={open}
                onClose={() => {
                    pararCamera();
                    onClose();
                }}
                ariaLabel="Visita de avaliação"
                maxWidth={860}
                closeOnBackdrop={!saving}
            >
                <div className="space-y-5">
                    <div>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-950">
                                    Visita durante a cerimônia
                                </h2>
                                <p className="mt-1 text-sm text-slate-600">
                                    Falecido(a):{" "}
                                    <strong>{falecido || "Não informado"}</strong>
                                </p>
                            </div>

                            {visita ? (
                                <span
                                    className={[
                                        "rounded-full px-3 py-1 text-xs font-semibold",
                                        concluida
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-blue-100 text-blue-800",
                                    ].join(" ")}
                                >
                                    {concluida ? "Visitado" : "Em andamento"}
                                </span>
                            ) : null}
                        </div>

                    </div>

                    {loading ? (
                        <p className="text-sm text-slate-500">
                            Carregando visita...
                        </p>
                    ) : null}

                    {erro ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {erro}
                        </div>
                    ) : null}

                    {sucesso ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                            {sucesso}
                        </div>
                    ) : null}

                    {!loading && !dados && !erro ? (
                        <p className="text-sm text-slate-500">
                            Visita indisponível.
                        </p>
                    ) : null}

                    {!loading && dados && !visita ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <button
                                type="button"
                                onClick={iniciarVisita}
                                disabled={
                                    saving ||
                                    normalizarStatus(
                                        dados?.atendimento?.status,
                                    ) !== "fase08"
                                }
                                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? "Iniciando..." : "Iniciar Visita"}
                            </button>
                        </div>
                    ) : null}

                    {visita ? (
                        <>
                            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Início
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {formatarDataHora(visita.inicio_em)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Visitante
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {visita.visitante_nome}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                        Progresso
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {progresso.completos} de{" "}
                                        {progresso.total} perguntas
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Com quem conversou
                                    </span>
                                    <input
                                        value={comQuem}
                                        onChange={(e) =>
                                            setComQuem(e.target.value)
                                        }
                                        disabled={concluida}
                                        maxLength={180}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"
                                        placeholder="Nome ou identificação da pessoa"
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Grau de parentesco
                                    </span>
                                    <select
                                        value={parentesco}
                                        onChange={(e) =>
                                            setParentesco(e.target.value)
                                        }
                                        disabled={concluida}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"
                                    >
                                        <option value="">
                                            Selecione...
                                        </option>
                                        {PARENTESCOS.map((item) => (
                                            <option key={item} value={item}>
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block sm:col-span-2">
                                    <span className="text-sm font-medium">
                                        Apoio prestado à família
                                    </span>
                                    <textarea
                                        value={apoio}
                                        onChange={(e) =>
                                            setApoio(e.target.value)
                                        }
                                        disabled={concluida}
                                        maxLength={2000}
                                        rows={3}
                                        className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"
                                        placeholder="Ex.: resolveu dúvida, ajudou com algo prático, fez acolhimento emocional..."
                                    />
                                </label>
                            </div>

                            <div className="space-y-4">
                                {perguntas.map((pergunta) => {
                                    const resp =
                                        respostas[pergunta.numero] ??
                                        defaultResposta();

                                    return (
                                        <section
                                            key={pergunta.numero}
                                            className={[
                                                "rounded-xl border p-4",
                                                pergunta.aplicavel
                                                    ? "border-slate-200"
                                                    : "border-slate-200 bg-slate-50 opacity-75",
                                            ].join(" ")}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                                    {pergunta.numero}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold text-slate-950">
                                                        {pergunta.titulo}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                                        {pergunta.descricao}
                                                    </p>

                                                    {!pergunta.aplicavel ? (
                                                        <p className="mt-2 text-xs font-medium text-slate-500">
                                                            Não aplicável:{" "}
                                                            {pergunta.motivo_nao_aplicavel ||
                                                                "esta etapa não ocorreu."}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            {pergunta.aplicavel ? (
                                                <div className="mt-4 space-y-4">
                                                    <div>
                                                        <div className="mb-2 text-sm font-medium">
                                                            Nota
                                                        </div>
                                                        <div className="grid gap-2 sm:grid-cols-3">
                                                            {NOTAS.map(
                                                                (nota) => (
                                                                    <label
                                                                        key={
                                                                            nota.value
                                                                        }
                                                                        className={[
                                                                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                                                                            resp.nota ===
                                                                                nota.value
                                                                                ? "border-slate-900 bg-slate-50"
                                                                                : "border-slate-200",
                                                                            concluida
                                                                                ? "cursor-default"
                                                                                : "",
                                                                        ].join(
                                                                            " ",
                                                                        )}
                                                                    >
                                                                        <input
                                                                            type="radio"
                                                                            name={`visita-nota-${pergunta.numero}`}
                                                                            value={
                                                                                nota.value
                                                                            }
                                                                            checked={
                                                                                resp.nota ===
                                                                                nota.value
                                                                            }
                                                                            onChange={() =>
                                                                                updateResposta(
                                                                                    pergunta.numero,
                                                                                    {
                                                                                        nota: nota.value,
                                                                                    },
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                concluida
                                                                            }
                                                                        />
                                                                        {
                                                                            nota.label
                                                                        }
                                                                    </label>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>

                                                    <label className="block">
                                                        <span className="text-sm font-medium">
                                                            Observação
                                                        </span>
                                                        <textarea
                                                            value={
                                                                resp.observacao
                                                            }
                                                            onChange={(e) =>
                                                                updateResposta(
                                                                    pergunta.numero,
                                                                    {
                                                                        observacao:
                                                                            e
                                                                                .target
                                                                                .value,
                                                                    },
                                                                )
                                                            }
                                                            disabled={
                                                                concluida
                                                            }
                                                            maxLength={2000}
                                                            rows={3}
                                                            className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"
                                                            placeholder="Observação livre"
                                                        />
                                                    </label>

                                                    <div>
                                                        <div className="mb-2 text-sm font-medium">
                                                            Foto obrigatória
                                                        </div>

                                                        {resp.fotoPreview ||
                                                            resp.fotoExistenteUrl ? (
                                                            <img
                                                                src={
                                                                    resp.fotoPreview ||
                                                                    resp.fotoExistenteUrl
                                                                }
                                                                alt={`Foto da pergunta ${pergunta.numero}`}
                                                                className="max-h-72 w-full rounded-lg border object-contain bg-black"
                                                            />
                                                        ) : (
                                                            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
                                                                Nenhuma foto
                                                                registrada.
                                                            </div>
                                                        )}

                                                        {!concluida ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    abrirCamera(
                                                                        pergunta.numero,
                                                                    )
                                                                }
                                                                className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                                            >
                                                                {resp.fotoBlob ||
                                                                    resp.fotoExistenteUrl
                                                                    ? "Tirar nova foto"
                                                                    : "Abrir câmera"}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </section>
                                    );
                                })}
                            </div>

                            {!concluida ? (
                                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => void salvar(false)}
                                        disabled={saving}
                                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        {saving
                                            ? "Salvando..."
                                            : "Salvar rascunho"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => void salvar(true)}
                                        disabled={saving}
                                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {saving
                                            ? "Salvando..."
                                            : "Concluir visita"}
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                                    Visita concluída em{" "}
                                    {formatarDataHora(visita.fim_em)}.
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </Modal>

            <Modal
                open={cameraPergunta != null}
                onClose={pararCamera}
                ariaLabel="Câmera da visita"
                maxWidth={760}
                zIndex={80}
                closeOnBackdrop={!cameraLoading}
            >
                <div>
                    <h3 className="text-lg font-semibold">
                        Foto da pergunta {cameraPergunta}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                        A foto é tirada diretamente pela câmera. O sistema adiciona
                        data/hora e o nome do falecido.
                    </p>

                    {cameraErro ? (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {cameraErro}
                        </div>
                    ) : null}

                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="mt-4 max-h-[60vh] w-full rounded-xl bg-black object-contain"
                    />

                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={pararCamera}
                            disabled={cameraLoading}
                            className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void capturarFoto()}
                            disabled={cameraLoading || !streamRef.current}
                            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                            {cameraLoading ? "Aguarde..." : "Capturar foto"}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
