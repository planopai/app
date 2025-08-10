"use client";

import React from "react";
import {
    IconChevronLeft,
    IconChevronRight,
    IconDownload,
    IconSettings,
    IconPhoto,
    IconColorSwatch,
    IconCalendar,
    IconClock,
    IconX,
} from "@tabler/icons-react";

/* ==================== Tipos & Constantes ==================== */
type Formato = "vertical";
type ModeloKey =
    | "modelo01" | "modelo02" | "modelo03" | "modelo04"
    | "modelo05" | "modelo06" | "modelo07" | "modelo08"
    | "modelo09"
    | "personalizado";

/** IMAGENS EM public/obituario-modelos/ (same-origin, sem CORS) */
const MODELOS: Record<Exclude<ModeloKey, "personalizado">, string> = {
    modelo01: "/obituario-modelos/MM1.png",
    modelo02: "/obituario-modelos/MM2.png",
    modelo03: "/obituario-modelos/M3.png",
    modelo04: "/obituario-modelos/M4.png",
    modelo05: "/obituario-modelos/F1.png",
    modelo06: "/obituario-modelos/F2.png",
    modelo07: "/obituario-modelos/F3.png",
    modelo08: "/obituario-modelos/F4.png",
    modelo09: "/obituario-modelos/I1.png",
};

const STEPS = [
    "Falecido",
    "Cerimônia",
    "Sepultamento",
    "Nota & Transmissão",
    "Finalização",
] as const;

/* ==================== Utils (datas/horas) ==================== */
const onlyDigits = (s: string) => s.replace(/\D+/g, "");

function maskDateBR(v: string) {
    const d = onlyDigits(v).slice(0, 8);
    const p1 = d.slice(0, 2);
    const p2 = d.slice(2, 4);
    const p3 = d.slice(4, 8);
    return [p1, p2, p3].filter(Boolean).join("/");
}

function maskTime(v: string) {
    const d = onlyDigits(v).slice(0, 4);
    const p1 = d.slice(0, 2);
    const p2 = d.slice(2, 4);
    return [p1, p2].filter(Boolean).join(":");
}

function isoToBR(iso: string) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
}

function brToISO(br: string) {
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateToBR(input: string) {
    if (!input) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return isoToBR(input);
    return maskDateBR(input);
}

/** Normaliza “17:0”, “9:5”, “1700”, etc -> “HH:mm” */
function normalizeHHMM(v: string) {
    const d = onlyDigits(v);
    if (!d) return "";
    let hh = d.slice(0, 2);
    let mm = d.slice(2, 4);
    if (hh.length === 1) hh = "0" + hh;
    if (!mm) mm = "00";
    if (mm.length === 1) mm = mm + "0";
    return `${hh}:${mm}`;
}

/* ==================== Inputs com digitação + picker ==================== */
function SmartDateInput({
    label,
    valueBR,
    onChange,
    required,
    placeholder = "dd/mm/aaaa",
}: {
    label: string;
    valueBR: string;
    onChange: (br: string) => void;
    required?: boolean;
    placeholder?: string;
}) {
    const id = React.useId();
    const hiddenId = `${id}-native`;
    const iso = brToISO(valueBR); // "" se inválido

    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-sm">{label}</label>
            <div className="relative flex items-center gap-2">
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input w-full"
                    placeholder={placeholder}
                    value={valueBR}
                    onChange={(e) => onChange(maskDateBR(e.target.value))}
                    required={required}
                />
                <button
                    type="button"
                    className="absolute right-2 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => (document.getElementById(hiddenId) as HTMLInputElement)?.showPicker?.()}
                    aria-label="Abrir calendário"
                    title="Abrir calendário"
                >
                    <IconCalendar className="size-4" />
                </button>
                {/* Só passamos valor válido (ISO) no input nativo */}
                <input
                    id={hiddenId}
                    type="date"
                    className="sr-only"
                    value={iso || ""}
                    onChange={(e) => onChange(isoToBR(e.target.value))}
                />
            </div>
        </div>
    );
}

function SmartTimeInput({
    label,
    value,
    onChange,
    required,
    placeholder = "hh:mm",
}: {
    label: string;
    value: string;
    onChange: (hhmm: string) => void;
    required?: boolean;
    placeholder?: string;
}) {
    const id = React.useId();
    const hiddenId = `${id}-native`;
    const safeTime = /^\d{2}:\d{2}$/.test(value) ? value : ""; // evita “17:0” no input time

    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-sm">{label}</label>
            <div className="relative flex items-center gap-2">
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input w-full"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(maskTime(e.target.value))}
                    required={required}
                />
                <button
                    type="button"
                    className="absolute right-2 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => (document.getElementById(hiddenId) as HTMLInputElement)?.showPicker?.()}
                    aria-label="Abrir seletor de hora"
                    title="Abrir seletor de hora"
                >
                    <IconClock className="size-4" />
                </button>
                <input
                    id={hiddenId}
                    type="time"
                    className="sr-only"
                    value={safeTime}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </div>
    );
}

/* ==================== Página ==================== */
export default function ObituarioPage() {
    const [step, setStep] = React.useState(0);
    const stepsTotal = STEPS.length;
    const isFirst = step === 0;
    const isLast = step === stepsTotal - 1;

    // estado do formulário
    const [form, setForm] = React.useState({
        foto_falecido: null as File | null,
        foto_preto_branco: false,
        nome: "",
        data_nascimento: "",
        data_falecimento: "",
        local_cerimonia: "",
        data_cerimonia: "",
        velorio_inicio: "",
        velorio_fim: "",
        fim_data_cerimonia: "",
        data_sepultamento: "",
        hora_sepultamento: "",
        local_sepultamento: "",
        nota_pesar: "",
        transmissao_inicio_data: "",
        transmissao_inicio_hora: "",
        transmissao_fim_data: "",
        transmissao_fim_hora: "",
        formato: "vertical" as Formato,
        modelo_fundo: "modelo01" as ModeloKey,
        fundo_personalizado: null as File | null,
    });

    const [previewSrc, setPreviewSrc] = React.useState<string>("");
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [fontName, setFontName] = React.useState<string>(
        typeof window !== "undefined" ? localStorage.getItem("fontName") || "Nunito" : "Nunito",
    );
    const [fontColor, setFontColor] = React.useState<string>(
        typeof window !== "undefined" ? localStorage.getItem("fontColor") || "#111827" : "#111827",
    );

    React.useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("fontName", fontName); }, [fontName]);
    React.useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("fontColor", fontColor); }, [fontColor]);

    const modelosOptions = React.useMemo(
        () =>
        ([
            { value: "modelo01", label: "Masculino 01" },
            { value: "modelo02", label: "Masculino 02" },
            { value: "modelo03", label: "Masculino 03" },
            { value: "modelo04", label: "Masculino 04" },
            { value: "modelo05", label: "Feminino 01" },
            { value: "modelo06", label: "Feminino 02" },
            { value: "modelo07", label: "Feminino 03" },
            { value: "modelo08", label: "Feminino 04" },
            { value: "modelo09", label: "Infantil 01" },
            { value: "personalizado", label: "Enviar Modelo" },
        ] as { value: ModeloKey; label: string }[]),
        [],
    );

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm((f) => ({ ...f, [k]: v }));

    // preview da foto selecionada
    const [fotoPreview, setFotoPreview] = React.useState<string>("");
    React.useEffect(() => {
        if (!form.foto_falecido) {
            setFotoPreview("");
            return;
        }
        const url = URL.createObjectURL(form.foto_falecido);
        setFotoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [form.foto_falecido]);

    function handlePrev() { if (!isFirst) setStep((s) => s - 1); }
    function handleNext() { if (!isLast) setStep((s) => s + 1); }

    async function generate() {
        try {
            setPreviewSrc("");

            // escolhe fundo
            let bgUrl = MODELOS["modelo01"];
            if (form.modelo_fundo === "personalizado") {
                if (!form.fundo_personalizado) {
                    alert("Envie um modelo de fundo personalizado.");
                    return;
                }
                bgUrl = await fileToDataURL(form.fundo_personalizado);
            } else {
                bgUrl = MODELOS[form.modelo_fundo as keyof typeof MODELOS] ?? MODELOS["modelo01"];
            }

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas não suportado.");

            if (form.formato === "vertical") { canvas.width = 1080; canvas.height = 1920; }
            else { canvas.width = 928; canvas.height = 824; }

            // fundo branco antes do bg (evita “tela preta”)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // carrega e desenha fundo
            const bg = await loadImage(bgUrl);
            ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

            // fontes
            const _fontName = fontName || "Nunito";
            const _fontColor = fontColor || "#111827";
            const fontSizeName = form.formato === "vertical" ? 48 : 40;
            const fontSizeDetails = form.formato === "vertical" ? 32 : 26;
            const fontSizeNote = form.formato === "vertical" ? 30 : 24;

            // Nome
            ctx.fillStyle = _fontColor;
            ctx.textAlign = "center";
            ctx.font = `${fontSizeName}px ${_fontName}`;
            ctx.fillText(form.nome, canvas.width / 2, form.formato === "vertical" ? 1000 : 80);

            // Datas Nasc/Fal
            ctx.font = `${fontSizeDetails}px ${_fontName}`;
            if (form.formato === "vertical") {
                ctx.fillText(`${normalizeDateToBR(form.data_nascimento)}`, canvas.width / 2 - 180, 1120);
                ctx.fillText(`${normalizeDateToBR(form.data_falecimento)}`, canvas.width / 2 + 200, 1120);
            } else {
                ctx.fillText(`${normalizeDateToBR(form.data_nascimento)}`, canvas.width / 2 - 110, 140);
                ctx.fillText(`${normalizeDateToBR(form.data_falecimento)}`, canvas.width / 2 + 120, 140);
            }

            // Foto circular
            if (form.foto_falecido) {
                const imgURL = URL.createObjectURL(form.foto_falecido);
                const img = await loadImage(imgURL);
                const radius = form.formato === "vertical" ? 270 : 130;
                const x = form.formato === "vertical" ? canvas.width / 2 : 150;
                const y = form.formato === "vertical" ? 620 : 345;

                const buff = document.createElement("canvas");
                buff.width = buff.height = radius * 2;
                const bctx = buff.getContext("2d")!;
                bctx.save();
                bctx.beginPath();
                bctx.arc(radius, radius, radius, 0, Math.PI * 2);
                bctx.clip();
                bctx.drawImage(img, 0, 0, radius * 2, radius * 2);

                if (form.foto_preto_branco) {
                    const id = bctx.getImageData(0, 0, buff.width, buff.height);
                    const d = id.data;
                    for (let i = 0; i < d.length; i += 4) {
                        const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
                        d[i] = avg; d[i + 1] = avg; d[i + 2] = avg;
                    }
                    bctx.putImageData(id, 0, 0);
                }

                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(buff, x - radius, y - radius);
                ctx.restore();

                URL.revokeObjectURL(imgURL);
            }

            // Nota de pesar
            ctx.textAlign = "center";
            ctx.font = `${fontSizeNote}px ${_fontName}`;
            ctx.fillStyle = _fontColor;

            const maxLineWidth = form.formato === "vertical" ? 800 : 400;
            const lineHeight = 34;
            const startY = form.formato === "vertical" ? 200 : 270;
            if (form.nota_pesar) {
                if (form.formato === "vertical") drawWrapText(ctx, form.nota_pesar, canvas.width / 2, startY, maxLineWidth, lineHeight, "center");
                else drawWrapText(ctx, form.nota_pesar, canvas.width - 50, startY, maxLineWidth, lineHeight, "right");
            }

            // Bloco velório / cerimônia
            ctx.font = `${fontSizeNote}px ${_fontName}`;
            ctx.fillStyle = _fontColor;
            const dataCerimonia = normalizeDateToBR(form.data_cerimonia);
            const fimDataCer = normalizeDateToBR(form.fim_data_cerimonia);
            const dataSep = normalizeDateToBR(form.data_sepultamento);

            const velorioInicio = form.velorio_inicio ? normalizeHHMM(form.velorio_inicio) : "";
            const velorioFim = form.velorio_fim ? normalizeHHMM(form.velorio_fim) : "";
            const horaSep = form.hora_sepultamento ? normalizeHHMM(form.hora_sepultamento) : "";

            if (form.formato === "vertical") {
                ctx.textAlign = "left";
                ctx.fillText(`Horário de Início: ${velorioInicio}`, 110, 1360);
                ctx.fillText(`Data: ${dataCerimonia}`, 110, 1390);
                ctx.fillText(`Horário de Término: ${velorioFim}`, 110, 1420);
                ctx.fillText(`Data: ${fimDataCer}`, 110, 1450);
                ctx.fillText(`Local: ${form.local_cerimonia}`, 110, 1480);

                ctx.textAlign = "left";
                ctx.fillText(`Data: ${dataSep}`, canvas.width - 970, 1610);
                ctx.fillText(`Hora: ${horaSep}`, canvas.width - 970, 1640);
                ctx.fillText(`Local: ${form.local_sepultamento}`, canvas.width - 970, 1670);
            } else {
                ctx.textAlign = "left";
                ctx.fillText(`Horário de Início: ${velorioInicio}`, 48, 602);
                ctx.fillText(`Data: ${dataCerimonia}`, 48, 632);
                ctx.fillText(`Horário de Término: ${velorioFim}`, 48, 662);
                ctx.fillText(`Data: ${fimDataCer}`, 48, 692);
                ctx.fillText(`Local: ${form.local_cerimonia}`, 48, 722);

                ctx.textAlign = "right";
                ctx.fillText(`Data: ${dataSep}`, canvas.width - 50, 602);
                ctx.fillText(`Hora: ${horaSep}`, canvas.width - 50, 632);
                ctx.fillText(`Local: ${form.local_sepultamento}`, canvas.width - 50, 662);
            }

            // Transmissão (rodapé)
            const tInicioData = normalizeDateToBR(form.transmissao_inicio_data);
            const tInicioHora = form.transmissao_inicio_hora ? normalizeHHMM(form.transmissao_inicio_hora) : "";
            const tFimData = normalizeDateToBR(form.transmissao_fim_data);
            const tFimHora = form.transmissao_fim_hora ? normalizeHHMM(form.transmissao_fim_hora) : "";

            if (tInicioData && tInicioHora) {
                ctx.textAlign = "center";
                let baseY = form.formato === "vertical" ? 1750 : 760;
                ctx.fillText(`Transmissão Online: Informações e senha com familiares`, canvas.width / 2, baseY);
                baseY += 34;
                let linha = `Início: ${tInicioData} ${tInicioHora}`;
                if (tFimData && tFimHora) {
                    linha += ` | Fim: ${tFimData} ${tFimHora}`;
                }
                ctx.fillText(linha, canvas.width / 2, baseY);
            }

            setPreviewSrc(canvas.toDataURL("image/jpeg", 0.92));
        } catch (err) {
            console.error(err);
            alert("Não foi possível gerar a arte. Verifique os campos e tente novamente.");
        }
    }

    function download() {
        if (!previewSrc) return;
        const a = document.createElement("a");
        a.href = previewSrc;
        a.download = "obituario.jpg";
        a.click();
    }

    /* ==================== UI ==================== */
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {/* estilos rápidos */}
            <style>{`
        .input { border: 1px solid hsl(var(--border, 214 32% 91%)); background: hsl(var(--card, 0 0% 100%));
                 padding: .6rem .75rem; border-radius: .75rem; outline: none; width: 100%; }
        .input:focus { box-shadow: 0 0 0 4px rgba(59,130,246,.2); border-color: rgb(59,130,246); }
        .btn { border: 1px solid hsl(var(--border, 214 32% 91%)); padding: .55rem .8rem; border-radius: .75rem; font-weight: 600; }
        .btn-primary { color: white; background: rgb(59,130,246); border-color: rgb(59,130,246); }
        .btn-primary:hover { filter: brightness(.95) }
        .card { border: 1px solid hsl(var(--border, 214 32% 91%)); background: hsl(var(--card, 0 0% 100%)/.7);
                backdrop-filter: blur(6px); border-radius: 1rem; box-shadow: 0 10px 20px rgba(0,0,0,.04); }
        .step-dot { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; font-size: .8rem; }
        /* Stepper responsivo: rolagem horizontal no mobile */
        .stepper { display: flex; gap: .75rem; overflow-x: auto; padding-bottom: .25rem; scroll-snap-type: x mandatory; }
        .stepper > * { scroll-snap-align: start; flex: 0 0 auto; }
        .step-label { max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        @media (min-width: 640px) { .step-label { max-width: 180px; } }
      `}</style>

            {/* Header + progress */}
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Gerar Obituário</h1>
                <p className="mt-1 text-sm text-muted-foreground">Preencha as etapas, gere a arte e faça o download.</p>
            </header>

            {/* Stepper */}
            <div className="mb-6">
                <div className="stepper">
                    {STEPS.map((label, i) => {
                        const active = i === step;
                        const done = i < step;
                        return (
                            <div key={label} className="flex items-center gap-2">
                                <div className={`step-dot ${active ? "bg-blue-600 text-white" : done ? "bg-blue-100 text-blue-700" : "bg-muted text-foreground/60"}`} aria-current={active ? "step" : undefined}>
                                    {i + 1}
                                </div>
                                <div className={`step-label text-sm ${active ? "font-semibold" : "text-muted-foreground"}`}>{label}</div>
                                {i < STEPS.length - 1 && <div className="h-px w-10 bg-muted" />}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${((step + 1) / stepsTotal) * 100}%` }} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* FORM CARD */}
                <div className="card p-4 sm:p-6">
                    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                        {/* STEP 1 */}
                        {step === 0 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Falecido</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Foto do Falecido</label>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div className="flex items-center gap-3">
                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                                                    <IconPhoto className="size-4" />
                                                    <span>Selecionar imagem</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        required
                                                        className="hidden"
                                                        onChange={(e) => set("foto_falecido", e.target.files?.[0] ?? null)}
                                                    />
                                                </label>
                                                {form.foto_falecido && (
                                                    <button
                                                        type="button"
                                                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                        onClick={() => set("foto_falecido", null)}
                                                    >
                                                        Remover
                                                    </button>
                                                )}
                                            </div>

                                            {/* Preview da imagem (miniatura) */}
                                            {fotoPreview ? (
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={fotoPreview}
                                                        alt="Pré-visualização da foto"
                                                        className="h-12 w-12 rounded-md object-cover border"
                                                    />
                                                    <div className="text-xs text-muted-foreground max-w-[160px] truncate">
                                                        {form.foto_falecido?.name}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground">Nenhuma imagem selecionada</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Nome</label>
                                        <input
                                            className="input"
                                            placeholder="Nome completo"
                                            required
                                            value={form.nome}
                                            onChange={(e) => set("nome", e.target.value)}
                                        />
                                    </div>

                                    <SmartDateInput
                                        label="Data de Nascimento"
                                        valueBR={form.data_nascimento}
                                        onChange={(v) => set("data_nascimento", v)}
                                        required
                                    />
                                    <SmartDateInput
                                        label="Data de Falecimento"
                                        valueBR={form.data_falecimento}
                                        onChange={(v) => set("data_falecimento", v)}
                                        required
                                    />
                                </div>

                                <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={form.foto_preto_branco}
                                        onChange={(e) => set("foto_preto_branco", e.target.checked)}
                                    />
                                    Converter foto para Preto/Branco
                                </label>
                            </fieldset>
                        )}

                        {/* STEP 2 */}
                        {step === 1 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Velório e Cerimônia</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Local da Cerimônia</label>
                                        <input
                                            className="input"
                                            required
                                            value={form.local_cerimonia}
                                            onChange={(e) => set("local_cerimonia", e.target.value)}
                                            placeholder="Ex: Memorial Senhor do Bonfim"
                                        />
                                    </div>

                                    <SmartDateInput
                                        label="Início (Data)"
                                        valueBR={form.data_cerimonia}
                                        onChange={(v) => set("data_cerimonia", v)}
                                        required
                                    />
                                    <SmartTimeInput
                                        label="Velório - Início"
                                        value={form.velorio_inicio}
                                        onChange={(v) => set("velorio_inicio", v)}
                                        required
                                    />
                                    <SmartTimeInput
                                        label="Velório - Fim"
                                        value={form.velorio_fim}
                                        onChange={(v) => set("velorio_fim", v)}
                                        required
                                    />
                                    <SmartDateInput
                                        label="Fim (Data)"
                                        valueBR={form.fim_data_cerimonia}
                                        onChange={(v) => set("fim_data_cerimonia", v)}
                                        required
                                    />
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 3 */}
                        {step === 2 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Informações do Sepultamento</legend>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <SmartDateInput
                                        label="Data do Sepultamento"
                                        valueBR={form.data_sepultamento}
                                        onChange={(v) => set("data_sepultamento", v)}
                                        required
                                    />
                                    <SmartTimeInput
                                        label="Hora do Sepultamento"
                                        value={form.hora_sepultamento}
                                        onChange={(v) => set("hora_sepultamento", v)}
                                        required
                                    />
                                    <div className="sm:col-span-2">
                                        <label className="mb-1 block text-sm">Local do Sepultamento</label>
                                        <input
                                            className="input"
                                            required
                                            value={form.local_sepultamento}
                                            onChange={(e) => set("local_sepultamento", e.target.value)}
                                            placeholder="Ex: Cemitério Municipal"
                                        />
                                    </div>
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 4 */}
                        {step === 3 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Nota de Pesar e Transmissão</legend>

                                <div>
                                    <label className="mb-1 block text-sm">Nota de Pesar</label>
                                    <textarea
                                        className="input"
                                        rows={4}
                                        required
                                        value={form.nota_pesar}
                                        onChange={(e) => set("nota_pesar", e.target.value)}
                                        placeholder="Escreva uma mensagem..."
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <SmartDateInput
                                        label="Transmissão - Início (Data)"
                                        valueBR={form.transmissao_inicio_data}
                                        onChange={(v) => set("transmissao_inicio_data", v)}
                                    />
                                    <SmartTimeInput
                                        label="Transmissão - Início (Hora)"
                                        value={form.transmissao_inicio_hora}
                                        onChange={(v) => set("transmissao_inicio_hora", v)}
                                    />
                                    <SmartDateInput
                                        label="Transmissão - Fim (Data)"
                                        valueBR={form.transmissao_fim_data}
                                        onChange={(v) => set("transmissao_fim_data", v)}
                                    />
                                    <SmartTimeInput
                                        label="Transmissão - Fim (Hora)"
                                        value={form.transmissao_fim_hora}
                                        onChange={(v) => set("transmissao_fim_hora", v)}
                                    />
                                </div>
                            </fieldset>
                        )}

                        {/* STEP 5 */}
                        {step === 4 && (
                            <fieldset className="space-y-4">
                                <legend className="mb-2 text-lg font-semibold">Configurações Finais</legend>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-sm">Formato</label>
                                        <select
                                            className="input"
                                            value={form.formato}
                                            onChange={(e) => set("formato", e.target.value as Formato)}
                                        >
                                            <option value="vertical">Redes Sociais (1080×1920)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm">Modelo de Fundo</label>
                                        <select
                                            className="input"
                                            value={form.modelo_fundo}
                                            onChange={(e) => set("modelo_fundo", e.target.value as ModeloKey)}
                                        >
                                            {Object.entries(MODELOS).map(([k]) => (
                                                <option key={k} value={k}>{k.replace("modelo", "Modelo ")}</option>
                                            ))}
                                            <option value="personalizado">Enviar Modelo</option>
                                        </select>
                                    </div>

                                    {form.modelo_fundo === "personalizado" && (
                                        <div className="sm:col-span-2">
                                            <label className="mb-1 block text-sm">Enviar Fundo Personalizado</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="input"
                                                onChange={(e) => set("fundo_personalizado", e.target.files?.[0] ?? null)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </fieldset>
                        )}

                        {/* AÇÕES DO WIZARD */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    disabled={isFirst}
                                    className="btn inline-flex items-center gap-2"
                                >
                                    <IconChevronLeft className="size-4" />
                                    Anterior
                                </button>

                                {!isLast && (
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        className="btn btn-primary inline-flex items-center gap-2"
                                    >
                                        Próximo
                                        <IconChevronRight className="size-4" />
                                    </button>
                                )}

                                {isLast && (
                                    <button
                                        type="button"
                                        onClick={generate}
                                        className="btn btn-primary inline-flex items-center gap-2"
                                    >
                                        Gerar Obituário
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setSettingsOpen(true)}
                                className="btn inline-flex items-center gap-2"
                                title="Configurações"
                            >
                                <IconSettings className="size-4" />
                                Configurações
                            </button>
                        </div>
                    </form>
                </div>

                {/* PREVIEW CARD */}
                <div className="card p-4 sm:p-6">
                    <h2 className="mb-3 text-lg font-semibold">Pré-visualização do Obituário</h2>

                    {previewSrc ? (
                        <>
                            <img
                                src={previewSrc}
                                alt="Pré-visualização do obituário"
                                className="mx-auto block w-full max-w-[420px] rounded-md border object-contain"
                            />
                            <div className="mt-4 flex justify-center">
                                <button onClick={download} className="btn btn-primary inline-flex items-center gap-2">
                                    <IconDownload className="size-4" />
                                    Baixar Obituário
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                            Gere a arte para visualizar aqui.
                        </div>
                    )}
                </div>
            </div>

            {/* SETTINGS MODAL */}
            {settingsOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Configurações</h3>
                            <button className="rounded-md p-1 hover:bg-muted" onClick={() => setSettingsOpen(false)}>
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm">
                                Fonte
                                <select
                                    className="input mt-1"
                                    value={fontName}
                                    onChange={(e) => setFontName(e.target.value)}
                                >
                                    <option value="Nunito">Nunito</option>
                                    <option value="Roboto">Roboto</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                </select>
                            </label>

                            <label className="block text-sm">
                                Cor da Fonte
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="inline-flex size-9 items-center justify-center rounded-md border">
                                        <IconColorSwatch className="size-5 opacity-70" />
                                    </span>
                                    <input
                                        type="color"
                                        className="h-10 w-full cursor-pointer rounded-md border bg-transparent p-1"
                                        value={fontColor}
                                        onChange={(e) => setFontColor(e.target.value)}
                                    />
                                </div>
                            </label>

                            <div className="pt-2">
                                <button onClick={() => setSettingsOpen(false)} className="btn btn-primary w-full">
                                    Aplicar Configurações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ==================== Helpers ==================== */
function drawWrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    align: "center" | "left" | "right" = "center",
) {
    const words = text.split(" ");
    let line = "";
    ctx.textAlign = align;
    for (let i = 0; i < words.length; i++) {
        const test = line + words[i] + " ";
        const w = ctx.measureText(test).width;
        if (w > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + " ";
            y += lineHeight;
        } else {
            line = test;
        }
    }
    ctx.fillText(line, x, y);
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // same-origin (caminhos de /public) NÃO precisa de crossOrigin
        const isAbsolute = /^https?:\/\//i.test(src);
        if (isAbsolute && !src.startsWith(location.origin)) {
            img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}

function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}
