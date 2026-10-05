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
    numero: 1 | 2 | 3 | 4 | 5 | 6;
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

type VisitaRegistroFoto = {
    localId: string;
    id?: number;
    fotoBlob: Blob | null;
    fotoPreview: string;
    fotoUrl: string;
    legenda: string;
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
        observacao_geral?: string | null;
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
    registros: Array<{
        id: number;
        foto_url: string;
        legenda: string | null;
        criado_em?: string | null;
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
    somenteIcone = false,
}: {
    status: VisitaStatus;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    /** Celular: mostra só o ícone (o texto fica no aria-label e no title). */
    somenteIcone?: boolean;
}) {
    const classes =
        status === "visitado"
            ? "bg-[#7BA11A] hover:bg-[#5C7A12] text-white"
            : status === "em_andamento"
                ? "bg-[#313C55] dark:bg-[#F2CB3F] hover:bg-[#232B40] dark:hover:bg-[#E4BC30] text-white"
                : status === "visitar"
                    ? "bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30] text-white"
                    : "bg-[#E3E8F0] dark:bg-white/15 text-[#5B6478] dark:text-[#AEB9CF]";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || status === "indisponivel"}
            aria-label={somenteIcone ? `Visita: ${statusLabel(status)}` : undefined}
            className={`${somenteIcone ? "grid size-11 place-items-center rounded-xl" : "rounded-md px-3 py-1.5 text-xs font-semibold"} transition disabled:cursor-not-allowed disabled:opacity-60 ${classes} ${className}`}
            title={
                status === "indisponivel"
                    ? "Visita disponível somente durante o velório."
                    : "Abrir visita de avaliação"
            }
        >
            {somenteIcone ? (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            ) : (
                statusLabel(status)
            )}
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

    const [responsavel, setResponsavel] = useState("");
    const [parentesco, setParentesco] = useState("");
    const [observacaoGeral, setObservacaoGeral] = useState("");

    const [respostas, setRespostas] = useState<
        Record<number, VisitaResposta>
    >({});

    const [registrosFotos, setRegistrosFotos] = useState<VisitaRegistroFoto[]>([]);
    const [registrosRemover, setRegistrosRemover] = useState<number[]>([]);

    const [cameraAberta, setCameraAberta] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraErro, setCameraErro] = useState("");
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Referências usadas para levar o usuário diretamente ao primeiro
    // campo obrigatório pendente ao tentar concluir a visita.
    const responsavelRef = useRef<HTMLInputElement>(null);
    const parentescoRef = useRef<HTMLSelectElement>(null);
    const perguntaRefs = useRef<Record<number, HTMLElement | null>>({});
    const registrosRef = useRef<HTMLDivElement>(null);

    const perguntas = dados?.perguntas ?? [];
    const visita = dados?.visita ?? null;
    const concluida = visita?.status === "visitado";

    const pararCamera = useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            for (const track of stream.getTracks()) track.stop();
        }
        streamRef.current = null;
        setCameraAberta(false);
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
            setResponsavel(String(v?.com_quem_conversou ?? ""));
            setParentesco(String(v?.grau_parentesco ?? ""));
            setObservacaoGeral(
                String(v?.observacao_geral ?? v?.apoio_prestado ?? ""),
            );

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

            setRegistrosFotos((prev) => {
                for (const item of prev) {
                    if (item.fotoPreview?.startsWith("blob:")) {
                        URL.revokeObjectURL(item.fotoPreview);
                    }
                }

                return (data?.registros ?? []).map((item) => ({
                    localId: `db-${item.id}`,
                    id: Number(item.id),
                    fotoBlob: null,
                    fotoPreview: "",
                    fotoUrl: String(item.foto_url ?? ""),
                    legenda: String(item.legenda ?? ""),
                }));
            });
            setRegistrosRemover([]);
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

    const abrirCamera = async () => {
        if (concluida) return;

        pararCamera();
        setCameraAberta(true);
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
        const video = videoRef.current;
        if (!video) return;

        setCameraLoading(true);
        setCameraErro("");

        try {
            const blob = await comprimirFotoComCarimbo(video, falecido);
            const preview = URL.createObjectURL(blob);

            setRegistrosFotos((prev) => [
                ...prev,
                {
                    localId: `novo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    fotoBlob: blob,
                    fotoPreview: preview,
                    fotoUrl: "",
                    legenda: "",
                },
            ]);

            pararCamera();

            requestAnimationFrame(() => {
                registrosRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            });
        } catch (e: any) {
            setCameraErro(e?.message || "Falha ao capturar a foto.");
        } finally {
            setCameraLoading(false);
        }
    };

    const levarAoCampo = useCallback((element: HTMLElement | null) => {
        if (!element) return;

        requestAnimationFrame(() => {
            element.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
            });

            window.setTimeout(() => {
                const focusable =
                    element.matches("input, select, textarea, button")
                        ? element
                        : element.querySelector<HTMLElement>(
                            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
                        );

                focusable?.focus({ preventScroll: true });
            }, 350);
        });
    }, []);

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

    const atualizarLegendaRegistro = (localId: string, legenda: string) => {
        setRegistrosFotos((prev) =>
            prev.map((item) =>
                item.localId === localId ? { ...item, legenda } : item,
            ),
        );
    };

    const removerRegistro = (localId: string) => {
        setRegistrosFotos((prev) => {
            const item = prev.find((x) => x.localId === localId);

            if (item?.fotoPreview?.startsWith("blob:")) {
                URL.revokeObjectURL(item.fotoPreview);
            }

            if (item?.id) {
                setRegistrosRemover((ids) =>
                    ids.includes(item.id!) ? ids : [...ids, item.id!],
                );
            }

            return prev.filter((x) => x.localId !== localId);
        });
    };

    const montarFormData = (finalizar: boolean) => {
        if (!visita?.id) throw new Error("A visita ainda não foi iniciada.");

        const payload = {
            visita_id: visita.id,
            atendimento_id: atendimentoId,
            finalizar,
            responsavel: responsavel.trim(),
            grau_parentesco: parentesco,
            observacao_geral: observacaoGeral.trim(),
            respostas: perguntas.map((p) => ({
                pergunta_numero: p.numero,
                nota: respostas[p.numero]?.nota || null,
                observacao: respostas[p.numero]?.observacao?.trim() || "",
            })),
            registros_existentes: registrosFotos
                .filter((item) => item.id)
                .map((item) => ({
                    id: item.id,
                    legenda: item.legenda.trim(),
                })),
            registros_remover: registrosRemover,
            registros_novos: registrosFotos
                .filter((item) => item.fotoBlob)
                .map((item) => ({
                    local_id: item.localId,
                    legenda: item.legenda.trim(),
                })),
        };

        const form = new FormData();
        form.append("payload", JSON.stringify(payload));

        for (const item of registrosFotos) {
            if (!item.fotoBlob) continue;

            form.append(
                `registro_${item.localId}`,
                item.fotoBlob,
                `visita-${atendimentoId}-${item.localId}.jpg`,
            );
        }

        return form;
    };

    const validarFinalizacao = () => {
        if (!responsavel.trim()) {
            levarAoCampo(responsavelRef.current);
            throw new Error("Informe o responsável.");
        }

        if (!parentesco) {
            levarAoCampo(parentescoRef.current);
            throw new Error("Informe o grau de parentesco.");
        }

        for (const pergunta of perguntas) {
            if (!pergunta.aplicavel) continue;

            const resp = respostas[pergunta.numero];

            if (!resp?.nota) {
                levarAoCampo(perguntaRefs.current[pergunta.numero] ?? null);
                throw new Error(
                    `Selecione uma nota para a pergunta ${pergunta.numero}.`,
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
            return !!r?.nota;
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
                                <h2 className="text-xl font-semibold text-[#313C55] dark:text-white">
                                    Visita durante a cerimônia
                                </h2>
                                <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                    Falecido(a):{" "}
                                    <strong>{falecido || "Não informado"}</strong>
                                </p>
                            </div>

                            {visita ? (
                                <span
                                    className={[
                                        "rounded-full px-3 py-1 text-xs font-semibold",
                                        concluida
                                            ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/20 text-[#313C55] dark:text-white"
                                            : "bg-[#E6F7FE] dark:bg-[#00AEEC]/20 text-[#313C55] dark:text-white",
                                    ].join(" ")}
                                >
                                    {concluida ? "Visitado" : "Em andamento"}
                                </span>
                            ) : null}
                        </div>

                    </div>

                    {loading ? (
                        <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                            Carregando visita...
                        </p>
                    ) : null}

                    {erro ? (
                        <div className="rounded-lg border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">
                            {erro}
                        </div>
                    ) : null}

                    {sucesso ? (
                        <div className="rounded-lg border border-[#7BA11A]/50 dark:border-[#B3CE52]/40 bg-[#EEF5D6] dark:bg-[#B3CE52]/20 p-3 text-sm text-[#313C55] dark:text-white">
                            {sucesso}
                        </div>
                    ) : null}

                    {!loading && !dados && !erro ? (
                        <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                            Visita indisponível.
                        </p>
                    ) : null}

                    {!loading && dados && !visita ? (
                        <div className="rounded-xl border border-[#F2CB3F] bg-[#FCF3CC] dark:bg-[#F2CB3F]/15 p-4">
                            <button
                                type="button"
                                onClick={iniciarVisita}
                                disabled={
                                    saving ||
                                    normalizarStatus(
                                        dados?.atendimento?.status,
                                    ) !== "fase08"
                                }
                                className="rounded-lg bg-[#F2CB3F] text-[#313C55] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E4BC30] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? "Iniciando..." : "Iniciar Visita"}
                            </button>
                        </div>
                    ) : null}

                    {visita ? (
                        <>
                            <div className="grid gap-3 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] p-4 sm:grid-cols-3">
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">
                                        Início
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {formatarDataHora(visita.inicio_em)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">
                                        Visitante
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {visita.visitante_nome}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">
                                        Progresso
                                    </div>
                                    <div className="mt-1 text-sm font-semibold">
                                        {progresso.completos} de{" "}
                                        {progresso.total} perguntas
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] p-4 sm:grid-cols-2">
                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Responsável <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                                    </span>
                                    <input
                                        ref={responsavelRef}
                                        value={responsavel}
                                        onChange={(e) =>
                                            setResponsavel(e.target.value)
                                        }
                                        disabled={concluida}
                                        maxLength={180}
                                        required
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
                                        placeholder="Nome do responsável"
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Grau de parentesco <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                                    </span>
                                    <select
                                        ref={parentescoRef}
                                        value={parentesco}
                                        onChange={(e) =>
                                            setParentesco(e.target.value)
                                        }
                                        disabled={concluida}
                                        required
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
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
                            </div>

                            <div className="space-y-4">
                                {perguntas.filter((pergunta) => pergunta.aplicavel).map((pergunta) => {
                                    const resp =
                                        respostas[pergunta.numero] ??
                                        defaultResposta();

                                    return (
                                        <section
                                            key={pergunta.numero}
                                            ref={(el) => {
                                                perguntaRefs.current[pergunta.numero] = el;
                                            }}
                                            className={[
                                                "rounded-xl border p-4 border-[#E3E8F0] dark:border-white/[0.12]",
                                                pergunta.aplicavel
                                                    ? "border-[#E3E8F0] dark:border-white/[0.12]"
                                                    : "border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] opacity-75",
                                            ].join(" ")}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#313C55] dark:bg-[#F2CB3F] text-sm font-bold text-white dark:text-[#313C55]">
                                                    {pergunta.numero}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold text-[#313C55] dark:text-white">
                                                        {pergunta.titulo}
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-6 text-[#5B6478] dark:text-[#AEB9CF]">
                                                        {pergunta.descricao}
                                                    </p>
                                                </div>
                                            </div>

                                            {pergunta.aplicavel ? (
                                                <div className="mt-4 space-y-4">
                                                    <label className="block">
                                                        <span className="text-sm font-medium">
                                                            Nota
                                                        </span>
                                                        <select
                                                            value={resp.nota}
                                                            onChange={(e) =>
                                                                updateResposta(
                                                                    pergunta.numero,
                                                                    {
                                                                        nota: e.target.value as VisitaResposta["nota"],
                                                                    },
                                                                )
                                                            }
                                                            disabled={concluida}
                                                            className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
                                                        >
                                                            <option value="">
                                                                Selecione a nota...
                                                            </option>
                                                            {NOTAS.map((nota) => (
                                                                <option
                                                                    key={nota.value}
                                                                    value={nota.value}
                                                                >
                                                                    {nota.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>

                                                    <label className="block">
                                                        <span className="text-sm font-medium">
                                                            Observação
                                                        </span>
                                                        <textarea
                                                            value={resp.observacao}
                                                            onChange={(e) =>
                                                                updateResposta(
                                                                    pergunta.numero,
                                                                    {
                                                                        observacao: e.target.value,
                                                                    },
                                                                )
                                                            }
                                                            disabled={concluida}
                                                            maxLength={2000}
                                                            rows={3}
                                                            className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
                                                            placeholder="Observação deste item"
                                                        />
                                                    </label>
                                                </div>
                                            ) : null}
                                        </section>
                                    );
                                })}
                            </div>

                            <div
                                ref={registrosRef}
                                className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] p-4"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-[#313C55] dark:text-white">
                                            Registros
                                        </h3>
                                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                            Você pode adicionar fotos da visita e incluir uma legenda em cada registro.
                                        </p>
                                    </div>

                                    {!concluida ? (
                                        <button
                                            type="button"
                                            onClick={() => void abrirCamera()}
                                            className="rounded-lg bg-[#313C55] dark:bg-[#F2CB3F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#232B40] dark:hover:bg-[#E4BC30] dark:text-[#313C55]"
                                        >
                                            Adicionar registro
                                        </button>
                                    ) : null}
                                </div>

                                {registrosFotos.length > 0 ? (
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        {registrosFotos.map((item, index) => (
                                            <div
                                                key={item.localId}
                                                className="rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] p-3"
                                            >
                                                <img
                                                    src={item.fotoPreview || item.fotoUrl}
                                                    alt={`Registro ${index + 1}`}
                                                    className="max-h-72 w-full rounded-lg bg-black object-contain"
                                                />

                                                <label className="mt-3 block">
                                                    <span className="text-sm font-medium">
                                                        Legenda
                                                    </span>
                                                    <textarea
                                                        value={item.legenda}
                                                        onChange={(e) =>
                                                            atualizarLegendaRegistro(
                                                                item.localId,
                                                                e.target.value,
                                                            )
                                                        }
                                                        disabled={concluida}
                                                        maxLength={500}
                                                        rows={2}
                                                        className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
                                                        placeholder="Legenda do registro"
                                                    />
                                                </label>

                                                {!concluida ? (
                                                    <div className="mt-3 flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                removerRegistro(
                                                                    item.localId,
                                                                )
                                                            }
                                                            className="rounded-lg border border-[#B42318]/40 dark:border-[#FF9C92]/40 px-3 py-2 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92] hover:bg-red-50"
                                                        >
                                                            Remover
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-lg border border-dashed p-5 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF] border-[#E3E8F0] dark:border-white/[0.12]">
                                        Nenhum registro adicionado.
                                    </div>
                                )}
                            </div>

                            <label className="block rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] p-4">
                                <span className="text-sm font-medium">
                                    Conclusão
                                </span>
                                <textarea
                                    value={observacaoGeral}
                                    onChange={(e) =>
                                        setObservacaoGeral(e.target.value)
                                    }
                                    disabled={concluida}
                                    maxLength={4000}
                                    rows={5}
                                    className="mt-2 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-[#EEF2F7] border-[#E3E8F0] dark:border-white/[0.12]"
                                    placeholder="Registre a conclusão geral da visita..."
                                />
                            </label>

                            {!concluida ? (
                                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => void salvar(false)}
                                        disabled={saving}
                                        className="rounded-lg border border-[#C9D1DE] dark:border-white/25 px-4 py-2 text-sm font-semibold hover:bg-[#EEF2F7] dark:hover:bg-white/10 disabled:opacity-50"
                                    >
                                        {saving
                                            ? "Salvando..."
                                            : "Salvar rascunho"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => void salvar(true)}
                                        disabled={saving}
                                        className="rounded-lg bg-[#7BA11A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5C7A12] disabled:opacity-50"
                                    >
                                        {saving
                                            ? "Salvando..."
                                            : "Concluir visita"}
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-[#7BA11A]/50 dark:border-[#B3CE52]/40 bg-[#EEF5D6] dark:bg-[#B3CE52]/20 p-4 text-sm font-medium text-[#313C55] dark:text-white">
                                    Visita concluída em{" "}
                                    {formatarDataHora(visita.fim_em)}.
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </Modal>

            <Modal
                open={cameraAberta}
                onClose={pararCamera}
                ariaLabel="Câmera da visita"
                maxWidth={760}
                zIndex={80}
                closeOnBackdrop={!cameraLoading}
            >
                <div>
                    <h3 className="text-lg font-semibold">
                        Novo registro fotográfico
                    </h3>
                    <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        A foto será registrada diretamente pela câmera com
                        data/hora e o nome do falecido. Depois você poderá adicionar uma legenda.
                    </p>

                    {cameraErro ? (
                        <div className="mt-3 rounded-lg border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">
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
                            className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 border-[#E3E8F0] dark:border-white/[0.12]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void capturarFoto()}
                            disabled={cameraLoading || !streamRef.current}
                            className="rounded-lg bg-[#313C55] dark:bg-[#F2CB3F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#232B40] dark:hover:bg-[#E4BC30] disabled:opacity-50"
                        >
                            {cameraLoading ? "Aguarde..." : "Capturar foto"}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
