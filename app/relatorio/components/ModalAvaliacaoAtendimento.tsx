"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    iniciarAvaliacao,
    obterAvaliacaoAtendimento,
    salvarAvaliacao,
    TipoAvaliacao,
} from "./Api";

type Pergunta = {
    numero: number;
    codigo?: string;
    titulo: string;
    descricao: string;
    aplicavel: boolean;
    motivo_nao_aplicavel?: string | null;
};

type Resposta = {
    nota: "" | "1" | "2" | "3" | "4" | "5" | "nao_sei";
    observacao: string;
};

type RegistroFoto = {
    localId: string;
    id?: number;
    fotoBlob: Blob | null;
    fotoPreview: string;
    fotoUrl: string;
    legenda: string;
};

type VisualViewportState = {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
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
];

const NOTAS = [
    { value: "1", label: "1 · Muito ruim" },
    { value: "2", label: "2 · Ruim" },
    { value: "3", label: "3 · Regular" },
    { value: "4", label: "4 · Bom" },
    { value: "5", label: "5 · Excelente" },
    { value: "nao_sei", label: "Não sei" },
] as const;

function tituloTipo(tipo: TipoAvaliacao) {
    return tipo === "visita"
        ? "Visita durante a cerimônia"
        : "Pós-Atendimento";
}

function formatarDataHora(value?: string | null) {
    if (!value) return "—";

    const d = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(value);

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(d);
}

function getLocalizacao(): Promise<{
    latitude: number;
    longitude: number;
    precisao_m?: number | null;
}> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(
                new Error(
                    "A localização não está disponível neste navegador.",
                ),
            );
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    precisao_m: pos.coords.accuracy,
                });
            },
            () => {
                reject(
                    new Error(
                        "Não foi possível obter a localização. Verifique a permissão do navegador.",
                    ),
                );
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            },
        );
    });
}

async function fotoComCarimbo(
    video: HTMLVideoElement,
    falecido: string,
): Promise<Blob> {
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;

    const maxW = 1280;
    const maxH = 960;
    const scale = Math.min(1, maxW / vw, maxH / vh);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Não foi possível processar a foto.");
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const faixaH = Math.max(70, Math.round(canvas.height * 0.11));

    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.fillRect(0, canvas.height - faixaH, canvas.width, faixaH);

    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.max(18, Math.round(canvas.width * 0.025))}px sans-serif`;

    const agora = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(new Date());

    ctx.fillText(
        String(falecido || "Falecido(a)").slice(0, 70),
        18,
        canvas.height - Math.round(faixaH * 0.55),
    );

    ctx.font = `${Math.max(14, Math.round(canvas.width * 0.018))}px sans-serif`;
    ctx.fillText(
        agora,
        18,
        canvas.height - Math.round(faixaH * 0.18),
    );

    const gerar = (quality: number) =>
        new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (blob) =>
                    blob
                        ? resolve(blob)
                        : reject(new Error("Falha ao gerar a foto.")),
                "image/jpeg",
                quality,
            );
        });

    let blob = await gerar(0.82);

    if (blob.size > 900 * 1024) {
        blob = await gerar(0.68);
    }

    return blob;
}

export default function ModalAvaliacaoAtendimento({
    aberto,
    onFechar,
    atendimentoId,
    falecido,
    tipo,
    onAtualizado,
}: {
    aberto: boolean;
    onFechar: () => void;
    atendimentoId: string;
    falecido: string;
    tipo: TipoAvaliacao;
    onAtualizado?: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [dados, setDados] = useState<any>(null);

    const [responsavel, setResponsavel] = useState("");
    const [parentesco, setParentesco] = useState("");
    const [conclusao, setConclusao] = useState("");

    const [respostas, setRespostas] = useState<Record<number, Resposta>>({});
    const [registros, setRegistros] = useState<RegistroFoto[]>([]);
    const [registrosRemover, setRegistrosRemover] = useState<number[]>([]);

    const [cameraAberta, setCameraAberta] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraErro, setCameraErro] = useState("");

    const [viewport, setViewport] =
        useState<VisualViewportState | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const responsavelRef = useRef<HTMLInputElement>(null);
    const parentescoRef = useRef<HTMLSelectElement>(null);
    const perguntaRefs = useRef<Record<number, HTMLElement | null>>({});

    const avaliacao = dados?.avaliacao ?? dados?.visita ?? null;
    const perguntas: Pergunta[] = Array.isArray(dados?.perguntas)
        ? dados.perguntas
        : [];

    const concluida = String(avaliacao?.status ?? "") === "visitado";

    const perguntasAplicaveis = useMemo(
        () => perguntas.filter((p) => p.aplicavel),
        [perguntas],
    );

    const progresso = useMemo(() => {
        const total = perguntasAplicaveis.length;

        const completas = perguntasAplicaveis.filter(
            (p) => !!respostas[p.numero]?.nota,
        ).length;

        return { completas, total };
    }, [perguntasAplicaveis, respostas]);

    const pararCamera = useCallback(() => {
        for (const track of streamRef.current?.getTracks() ?? []) {
            track.stop();
        }

        streamRef.current = null;
        setCameraAberta(false);
        setCameraLoading(false);
    }, []);

    useEffect(() => {
        if (!aberto) {
            pararCamera();
        }

        return () => {
            pararCamera();
        };
    }, [aberto, pararCamera]);

    useEffect(() => {
        if (!aberto || typeof window === "undefined") return;

        const html = document.documentElement;
        const body = document.body;

        const oldHtmlOverflow = html.style.overflow;
        const oldBodyOverflow = body.style.overflow;
        const oldBodyOverscroll = body.style.overscrollBehavior;
        const oldBodyTouchAction = body.style.touchAction;

        const updateViewport = () => {
            const vv = window.visualViewport;

            setViewport({
                width: Math.max(
                    1,
                    Math.round(vv?.width ?? window.innerWidth),
                ),
                height: Math.max(
                    1,
                    Math.round(vv?.height ?? window.innerHeight),
                ),
                offsetTop: Math.max(
                    0,
                    Math.round(vv?.offsetTop ?? 0),
                ),
                offsetLeft: Math.max(
                    0,
                    Math.round(vv?.offsetLeft ?? 0),
                ),
            });
        };

        updateViewport();

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
        body.style.touchAction = "none";

        const vv = window.visualViewport;

        vv?.addEventListener("resize", updateViewport);
        vv?.addEventListener("scroll", updateViewport);
        window.addEventListener("resize", updateViewport);
        window.addEventListener("orientationchange", updateViewport);

        return () => {
            vv?.removeEventListener("resize", updateViewport);
            vv?.removeEventListener("scroll", updateViewport);
            window.removeEventListener("resize", updateViewport);
            window.removeEventListener(
                "orientationchange",
                updateViewport,
            );

            html.style.overflow = oldHtmlOverflow;
            body.style.overflow = oldBodyOverflow;
            body.style.overscrollBehavior = oldBodyOverscroll;
            body.style.touchAction = oldBodyTouchAction;

            setViewport(null);
        };
    }, [aberto]);

    const carregar = useCallback(async () => {
        if (!aberto || !atendimentoId) return;

        setLoading(true);
        setErro("");

        try {
            const data = await obterAvaliacaoAtendimento(
                atendimentoId,
                tipo,
            );

            setDados(data);

            const av = data?.avaliacao ?? data?.visita ?? null;

            setResponsavel(
                String(av?.com_quem_conversou ?? ""),
            );
            setParentesco(
                String(av?.grau_parentesco ?? ""),
            );
            setConclusao(
                String(av?.observacao_geral ?? ""),
            );

            const next: Record<number, Resposta> = {};

            for (const p of data?.perguntas ?? []) {
                next[Number(p.numero)] = {
                    nota: "",
                    observacao: "",
                };
            }

            for (const r of data?.respostas ?? []) {
                const numero = Number(r?.pergunta_numero);

                if (!numero) continue;

                next[numero] = {
                    nota: String(r?.nota ?? "") as Resposta["nota"],
                    observacao: String(r?.observacao ?? ""),
                };
            }

            setRespostas(next);

            setRegistros((prev) => {
                for (const item of prev) {
                    if (item.fotoPreview.startsWith("blob:")) {
                        URL.revokeObjectURL(item.fotoPreview);
                    }
                }

                return (data?.registros ?? []).map((item: any) => ({
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
            setErro(
                e?.message || "Não foi possível carregar a avaliação.",
            );
        } finally {
            setLoading(false);
        }
    }, [aberto, atendimentoId, tipo]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const levarAoCampo = useCallback(
        (element: HTMLElement | null) => {
            if (!element) return;

            requestAnimationFrame(() => {
                element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                });

                window.setTimeout(() => {
                    const focusable =
                        element.matches(
                            "input, select, textarea, button",
                        )
                            ? element
                            : element.querySelector<HTMLElement>(
                                "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
                            );

                    focusable?.focus({
                        preventScroll: true,
                    });
                }, 350);
            });
        },
        [],
    );

    function updateResposta(
        numero: number,
        patch: Partial<Resposta>,
    ) {
        setRespostas((prev) => ({
            ...prev,
            [numero]: {
                nota: prev[numero]?.nota ?? "",
                observacao: prev[numero]?.observacao ?? "",
                ...patch,
            },
        }));
    }

    async function iniciar() {
        setSaving(true);
        setErro("");

        try {
            let localizacao:
                | {
                    latitude: number;
                    longitude: number;
                    precisao_m?: number | null;
                }
                | undefined;

            if (tipo === "visita") {
                localizacao = await getLocalizacao();
            }

            await iniciarAvaliacao(
                atendimentoId,
                tipo,
                localizacao,
            );

            await carregar();
            onAtualizado?.();
        } catch (e: any) {
            setErro(
                e?.message || "Não foi possível iniciar a avaliação.",
            );
        } finally {
            setSaving(false);
        }
    }

    function validarConclusao() {
        if (!responsavel.trim()) {
            levarAoCampo(responsavelRef.current);
            throw new Error("Informe o responsável.");
        }

        if (!parentesco) {
            levarAoCampo(parentescoRef.current);
            throw new Error("Informe o grau de parentesco.");
        }

        for (const p of perguntasAplicaveis) {
            if (!respostas[p.numero]?.nota) {
                levarAoCampo(
                    perguntaRefs.current[p.numero] ?? null,
                );

                throw new Error(
                    `Selecione uma nota para ${p.titulo}.`,
                );
            }
        }
    }

    function montarForm(finalizar: boolean) {
        if (!avaliacao?.id) {
            throw new Error("Avaliação ainda não foi iniciada.");
        }

        const payload = {
            avaliacao_id: avaliacao.id,
            visita_id: avaliacao.id,
            atendimento_id: atendimentoId,
            finalizar,

            responsavel: responsavel.trim(),
            grau_parentesco: parentesco,
            observacao_geral: conclusao.trim(),

            respostas: perguntas.map((p) => ({
                pergunta_numero: p.numero,
                pergunta_codigo: p.codigo,
                nota: respostas[p.numero]?.nota || null,
                observacao:
                    respostas[p.numero]?.observacao?.trim() || "",
            })),

            registros_existentes: registros
                .filter((item) => item.id)
                .map((item) => ({
                    id: item.id,
                    legenda: item.legenda.trim(),
                })),

            registros_remover: registrosRemover,

            registros_novos: registros
                .filter((item) => item.fotoBlob)
                .map((item) => ({
                    local_id: item.localId,
                    legenda: item.legenda.trim(),
                })),
        };

        const form = new FormData();
        form.append("payload", JSON.stringify(payload));

        for (const item of registros) {
            if (!item.fotoBlob) continue;

            form.append(
                `registro_${item.localId}`,
                item.fotoBlob,
                `avaliacao-${atendimentoId}-${item.localId}.jpg`,
            );
        }

        return form;
    }

    async function salvar(finalizar: boolean) {
        setSaving(true);
        setErro("");

        try {
            if (finalizar) {
                validarConclusao();
            }

            const form = montarForm(finalizar);

            await salvarAvaliacao(
                tipo,
                finalizar ? "finalizar" : "salvar_rascunho",
                form,
            );

            await carregar();
            onAtualizado?.();

            if (finalizar) {
                window.setTimeout(() => {
                    onFechar();
                }, 250);
            }
        } catch (e: any) {
            setErro(
                e?.message || "Não foi possível salvar a avaliação.",
            );
        } finally {
            setSaving(false);
        }
    }

    async function abrirCamera() {
        if (concluida) return;

        pararCamera();
        setCameraAberta(true);
        setCameraErro("");
        setCameraLoading(true);

        try {
            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getUserMedia
            ) {
                throw new Error(
                    "A câmera não está disponível neste aparelho.",
                );
            }

            const stream =
                await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: {
                            ideal: "environment",
                        },
                        width: {
                            ideal: 1280,
                        },
                        height: {
                            ideal: 960,
                        },
                    },
                    audio: false,
                });

            streamRef.current = stream;

            requestAnimationFrame(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;

                    void videoRef.current
                        .play()
                        .catch(() => undefined);
                }
            });
        } catch (e: any) {
            setCameraErro(
                e?.message ||
                "Não foi possível abrir a câmera.",
            );
        } finally {
            setCameraLoading(false);
        }
    }

    async function capturarFoto() {
        if (!videoRef.current) return;

        setCameraLoading(true);
        setCameraErro("");

        try {
            const blob = await fotoComCarimbo(
                videoRef.current,
                falecido,
            );

            const preview = URL.createObjectURL(blob);

            setRegistros((prev) => [
                ...prev,
                {
                    localId:
                        `novo-${Date.now()}-` +
                        Math.random()
                            .toString(36)
                            .slice(2),
                    fotoBlob: blob,
                    fotoPreview: preview,
                    fotoUrl: "",
                    legenda: "",
                },
            ]);

            pararCamera();
        } catch (e: any) {
            setCameraErro(
                e?.message || "Falha ao capturar a foto.",
            );
        } finally {
            setCameraLoading(false);
        }
    }

    function removerRegistro(localId: string) {
        setRegistros((prev) => {
            const item = prev.find(
                (x) => x.localId === localId,
            );

            if (
                item?.fotoPreview &&
                item.fotoPreview.startsWith("blob:")
            ) {
                URL.revokeObjectURL(item.fotoPreview);
            }

            if (item?.id) {
                setRegistrosRemover((ids) =>
                    ids.includes(item.id!)
                        ? ids
                        : [...ids, item.id!],
                );
            }

            return prev.filter(
                (x) => x.localId !== localId,
            );
        });
    }

    if (!aberto) return null;

    return (
        <div
            className="fixed z-[80] flex items-center justify-center overflow-hidden bg-black/50 p-3 sm:p-4"
            style={{
                top: viewport?.offsetTop ?? 0,
                left: viewport?.offsetLeft ?? 0,
                width: viewport
                    ? `${viewport.width}px`
                    : "100vw",
                height: viewport
                    ? `${viewport.height}px`
                    : "100dvh",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onFechar();
                }
            }}
        >
            <div
                className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#232B3F]"
                style={{
                    maxHeight: viewport
                        ? `${Math.max(1, viewport.height - 24)}px`
                        : "calc(100dvh - 1.5rem)",
                }}
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b p-4 sm:p-5">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                            {tituloTipo(tipo)}
                        </h2>

                        <p className="mt-1 text-sm text-slate-600 dark:text-[#AEB9CF]">
                            Falecido(a):{" "}
                            <strong>{falecido || "—"}</strong>
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onFechar}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-[#1C2334]"
                    >
                        Fechar
                    </button>
                </div>

                <div
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5"
                    style={{
                        WebkitOverflowScrolling: "touch",
                        overscrollBehaviorY: "contain",
                        touchAction: "pan-y",
                    }}
                >
                    {erro ? (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            {erro}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="py-10 text-center text-sm text-slate-500 dark:text-[#AEB9CF]">
                            Carregando avaliação...
                        </div>
                    ) : !dados ? null : !avaliacao ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-[#F2CB3F]/40 dark:bg-[#F2CB3F]/15">
                            <button
                                type="button"
                                onClick={() => void iniciar()}
                                disabled={saving}
                                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                                {saving
                                    ? "Iniciando..."
                                    : tipo === "visita"
                                        ? "Iniciar Visita"
                                        : "Iniciar Pós-Atendimento"}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3 dark:border-white/12">
                                <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-[#AEB9CF]">
                                        Início
                                    </div>
                                    <div className="mt-1 text-sm font-medium">
                                        {formatarDataHora(
                                            avaliacao.inicio_em,
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-[#AEB9CF]">
                                        Avaliador
                                    </div>
                                    <div className="mt-1 text-sm font-medium">
                                        {avaliacao.avaliador_nome ||
                                            avaliacao.visitante_nome ||
                                            "—"}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-[#AEB9CF]">
                                        Progresso
                                    </div>
                                    <div className="mt-1 text-sm font-medium">
                                        {progresso.completas} de{" "}
                                        {progresso.total} perguntas
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-white/12">
                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Responsável{" "}
                                        <span className="text-red-600 dark:text-[#FF9C92]">
                                            *
                                        </span>
                                    </span>

                                    <input
                                        ref={responsavelRef}
                                        value={responsavel}
                                        onChange={(e) =>
                                            setResponsavel(
                                                e.target.value,
                                            )
                                        }
                                        disabled={concluida}
                                        maxLength={180}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
                                        placeholder="Nome do responsável"
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-sm font-medium">
                                        Grau de parentesco{" "}
                                        <span className="text-red-600 dark:text-[#FF9C92]">
                                            *
                                        </span>
                                    </span>

                                    <select
                                        ref={parentescoRef}
                                        value={parentesco}
                                        onChange={(e) =>
                                            setParentesco(
                                                e.target.value,
                                            )
                                        }
                                        disabled={concluida}
                                        className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
                                    >
                                        <option value="">
                                            Selecione...
                                        </option>

                                        {PARENTESCOS.map((item) => (
                                            <option
                                                key={item}
                                                value={item}
                                            >
                                                {item}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="space-y-4">
                                {perguntasAplicaveis.map(
                                    (pergunta) => {
                                        const resp =
                                            respostas[
                                            pergunta.numero
                                            ] ?? {
                                                nota: "",
                                                observacao: "",
                                            };

                                        return (
                                            <section
                                                key={
                                                    pergunta.codigo ??
                                                    pergunta.numero
                                                }
                                                ref={(el) => {
                                                    perguntaRefs.current[
                                                        pergunta.numero
                                                    ] = el;
                                                }}
                                                className="rounded-xl border border-slate-200 p-4 dark:border-white/12"
                                            >
                                                <div className="flex gap-3">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                                                        {
                                                            pergunta.numero
                                                        }
                                                    </div>

                                                    <div>
                                                        <h3 className="font-semibold text-slate-950 dark:text-white">
                                                            {
                                                                pergunta.titulo
                                                            }
                                                        </h3>

                                                        <p className="mt-1 text-sm text-slate-600 dark:text-[#AEB9CF]">
                                                            {
                                                                pergunta.descricao
                                                            }
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-4">
                                                    <label className="block">
                                                        <span className="text-sm font-medium">
                                                            Nota{" "}
                                                            <span className="text-red-600 dark:text-[#FF9C92]">
                                                                *
                                                            </span>
                                                        </span>

                                                        <select
                                                            value={
                                                                resp.nota
                                                            }
                                                            onChange={(
                                                                e,
                                                            ) =>
                                                                updateResposta(
                                                                    pergunta.numero,
                                                                    {
                                                                        nota: e
                                                                            .target
                                                                            .value as Resposta["nota"],
                                                                    },
                                                                )
                                                            }
                                                            disabled={
                                                                concluida
                                                            }
                                                            className="mt-1 w-full rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
                                                        >
                                                            <option value="">
                                                                Selecione a nota...
                                                            </option>

                                                            {NOTAS.map(
                                                                (
                                                                    nota,
                                                                ) => (
                                                                    <option
                                                                        key={
                                                                            nota.value
                                                                        }
                                                                        value={
                                                                            nota.value
                                                                        }
                                                                    >
                                                                        {
                                                                            nota.label
                                                                        }
                                                                    </option>
                                                                ),
                                                            )}
                                                        </select>
                                                    </label>

                                                    <label className="block">
                                                        <span className="text-sm font-medium">
                                                            Observação
                                                        </span>

                                                        <textarea
                                                            value={
                                                                resp.observacao
                                                            }
                                                            onChange={(
                                                                e,
                                                            ) =>
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
                                                            maxLength={
                                                                2000
                                                            }
                                                            rows={3}
                                                            className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
                                                            placeholder="Observação deste item"
                                                        />
                                                    </label>
                                                </div>
                                            </section>
                                        );
                                    },
                                )}
                            </div>

                            {tipo === "visita" ? (
                                <div className="rounded-xl border border-slate-200 p-4 dark:border-white/12">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold text-slate-950 dark:text-white">
                                                Registros
                                            </h3>

                                            <p className="mt-1 text-sm text-slate-600 dark:text-[#AEB9CF]">
                                                Você pode adicionar fotos
                                                da avaliação e uma legenda
                                                em cada registro.
                                            </p>
                                        </div>

                                        {!concluida ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void abrirCamera()
                                                }
                                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-[#3D6A99] dark:hover:bg-[#355D86]"
                                            >
                                                Adicionar registro
                                            </button>
                                        ) : null}
                                    </div>

                                    {registros.length > 0 ? (
                                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                            {registros.map(
                                                (item, index) => (
                                                    <div
                                                        key={
                                                            item.localId
                                                        }
                                                        className="rounded-xl border border-slate-200 p-3 dark:border-white/12"
                                                    >
                                                        <img
                                                            src={
                                                                item.fotoPreview ||
                                                                item.fotoUrl
                                                            }
                                                            alt={`Registro ${index + 1}`}
                                                            className="max-h-72 w-full rounded-lg bg-black object-contain"
                                                        />

                                                        <label className="mt-3 block">
                                                            <span className="text-sm font-medium">
                                                                Legenda
                                                            </span>

                                                            <textarea
                                                                value={
                                                                    item.legenda
                                                                }
                                                                onChange={(
                                                                    e,
                                                                ) =>
                                                                    setRegistros(
                                                                        (
                                                                            prev,
                                                                        ) =>
                                                                            prev.map(
                                                                                (
                                                                                    x,
                                                                                ) =>
                                                                                    x.localId ===
                                                                                        item.localId
                                                                                        ? {
                                                                                            ...x,
                                                                                            legenda:
                                                                                                e
                                                                                                    .target
                                                                                                    .value,
                                                                                        }
                                                                                        : x,
                                                                            ),
                                                                    )
                                                                }
                                                                disabled={
                                                                    concluida
                                                                }
                                                                maxLength={
                                                                    500
                                                                }
                                                                rows={2}
                                                                className="mt-1 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
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
                                                                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-[#FF9C92]/40 dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
                                                                >
                                                                    Remover
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-4 rounded-lg border border-dashed p-5 text-center text-sm text-slate-500 dark:text-[#AEB9CF]">
                                            Nenhum registro adicionado.
                                        </div>
                                    )}
                                </div>

                            ) : null}

                            <label className="block rounded-xl border border-slate-200 p-4 dark:border-white/12">
                                <span className="text-sm font-medium">
                                    Conclusão
                                </span>

                                <textarea
                                    value={conclusao}
                                    onChange={(e) =>
                                        setConclusao(
                                            e.target.value,
                                        )
                                    }
                                    disabled={concluida}
                                    maxLength={4000}
                                    rows={5}
                                    className="mt-2 w-full resize-y rounded-lg border px-3 py-2 text-base sm:text-sm disabled:bg-slate-50 dark:disabled:bg-[#1C2334]"
                                    placeholder="Registre a conclusão geral da avaliação..."
                                />
                            </label>

                            {!concluida ? (
                                <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void salvar(false)
                                        }
                                        disabled={saving}
                                        className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-[#1C2334]"
                                    >
                                        Salvar rascunho
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            void salvar(true)
                                        }
                                        disabled={saving}
                                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#355D86]"
                                    >
                                        {saving
                                            ? "Salvando..."
                                            : "Concluir avaliação"}
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]">
                                    Avaliação concluída.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {cameraAberta ? (
                <div
                    className="fixed z-[100] flex items-center justify-center overflow-hidden bg-black/80 p-3"
                    style={{
                        top: viewport?.offsetTop ?? 0,
                        left: viewport?.offsetLeft ?? 0,
                        width: viewport
                            ? `${viewport.width}px`
                            : "100vw",
                        height: viewport
                            ? `${viewport.height}px`
                            : "100dvh",
                    }}
                >
                    <div
                        className="w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-[#232B3F]"
                        style={{
                            maxHeight: viewport
                                ? `${Math.max(1, viewport.height - 24)}px`
                                : "calc(100dvh - 1.5rem)",
                            WebkitOverflowScrolling: "touch",
                            overscrollBehaviorY: "contain",
                            touchAction: "pan-y",
                        }}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <h3 className="font-semibold">
                                Novo registro fotográfico
                            </h3>

                            <button
                                type="button"
                                onClick={pararCamera}
                                className="rounded-lg border px-3 py-2 text-sm"
                            >
                                Fechar
                            </button>
                        </div>

                        {cameraErro ? (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                                {cameraErro}
                            </div>
                        ) : null}

                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            className="mt-4 max-h-[65dvh] w-full rounded-xl bg-black object-contain"
                        />

                        <button
                            type="button"
                            onClick={() =>
                                void capturarFoto()
                            }
                            disabled={cameraLoading}
                            className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50 dark:bg-[#3D6A99]"
                        >
                            {cameraLoading
                                ? "Aguarde..."
                                : "Capturar foto"}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
