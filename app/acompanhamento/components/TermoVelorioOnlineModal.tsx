"use client";

/* =====================================================================
   TermoVelorioOnlineModal.tsx — Termo de Responsabilidade do Velório On-line (09/11/2026)

   Compartilhar → Velório Online → "Assinar Termo": nome completo → CPF → leitura do termo e assinatura →
   Concluir. Depois de assinado o botão vira "Termo" e esta janela mostra quem assinou e quando, com
   Visualizar, Baixar e Compartilhar o PDF.

   Grava pelo informativo.php (acao salvar_assinatura, tipo velorio_online), o mesmo endpoint dos outros
   termos do atendimento. Precisa de internet (o termo é assinado na funerária); sem internet, avisa e
   não perde o que foi preenchido enquanto a janela estiver aberta.
   ===================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import type { Registro } from "./types";
import {
    VERSAO_TERMO_VELORIO,
    carregarAssinaturaTermo,
    dadosTermoVelorio,
    formatarCpf,
    gerarPdfTermoVelorio,
    nomeArquivoTermoVelorio,
    situacaoTermoVelorio,
    textoTermoVelorio,
    type SituacaoTermoVelorio,
} from "./termoVelorioOnline";

const API = "https://api.planoassistencialintegrado.com.br";

type Passo = "nome" | "cpf" | "assinar" | "assinado";

export type TermoVelorioSalvo = {
    assinatura_velorio_online: string;
    assinatura_velorio_online_nome: string;
    assinatura_velorio_online_cpf: string;
    assinatura_velorio_online_em: string;
    assinatura_velorio_online_por: string;
    assinatura_velorio_online_versao: string;
};

const btnPrimario =
    "inline-flex min-h-[46px] w-full items-center justify-center rounded-lg bg-[#313C55] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55]";
const btnSecundario =
    "inline-flex min-h-[46px] w-full items-center justify-center rounded-lg border border-[#039adc] bg-[#eef9ff] px-4 text-sm font-bold text-[#313C55] transition hover:bg-[#dff4ff] disabled:opacity-50 dark:bg-[#1C2334] dark:text-white";
const campo =
    "w-full rounded-lg border border-[#C9D1DE] bg-white px-3 py-3 text-base text-[#313C55] outline-none focus:border-[#313C55] dark:border-white/20 dark:bg-[#1C2334] dark:text-white";

function mascaraCpf(v: string) {
    const d = v.replace(/\D+/g, "").slice(0, 11);
    let out = d.slice(0, 3);
    if (d.length > 3) out += "." + d.slice(3, 6);
    if (d.length > 6) out += "." + d.slice(6, 9);
    if (d.length > 9) out += "-" + d.slice(9, 11);
    return out;
}

/** CPF válido pelos dígitos verificadores (evita CPF digitado errado num documento). */
function cpfValido(v: string) {
    const d = v.replace(/\D+/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dig = (n: number) => {
        let soma = 0;
        for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

function agoraServidor() {
    const n = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
}

export default function TermoVelorioOnlineModal({
    open,
    onClose,
    registro,
    onSaved,
    zIndex,
}: {
    open: boolean;
    onClose: () => void;
    registro?: Registro | null;
    onSaved?: (salvo: TermoVelorioSalvo) => void;
    /** Acima de outra janela (ex.: relatório do Histórico de Sepultamentos). */
    zIndex?: number;
}) {
    const [situacao, setSituacao] = useState<SituacaoTermoVelorio>(() => situacaoTermoVelorio(registro));
    const [passo, setPasso] = useState<Passo>("nome");
    const [nome, setNome] = useState("");
    const [cpf, setCpf] = useState("");
    const [ciente, setCiente] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
    const [assinaturaB64, setAssinaturaB64] = useState<string>("");

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const caixaRef = useRef<HTMLDivElement | null>(null);
    const desenhando = useRef(false);
    const [temTraco, setTemTraco] = useState(false);

    // Ao abrir: termo já assinado abre direto na tela do termo; senão, começa pelo nome.
    useEffect(() => {
        if (!open) return;
        const s = situacaoTermoVelorio(registro);
        setSituacao(s);
        setPasso(s.assinado ? "assinado" : "nome");
        setNome(s.assinado ? s.nome : "");
        setCpf(s.assinado ? mascaraCpf(s.cpf) : "");
        setCiente(false);
        setMsg(null);
        setTemTraco(false);
        setAssinaturaB64("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, registro?.id]);

    // Quadro da assinatura: largura da janela, traço nítido em tela de alta densidade.
    useEffect(() => {
        if (!open || passo !== "assinar") return;
        const c = canvasRef.current;
        const caixa = caixaRef.current;
        if (!c || !caixa) return;
        const w = Math.max(260, caixa.clientWidth);
        const h = 180;
        const ratio = window.devicePixelRatio || 1;
        c.width = Math.round(w * ratio);
        c.height = Math.round(h * ratio);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#000";
        ctx.clearRect(0, 0, w, h);
        setTemTraco(false);
    }, [open, passo]);

    const dadosPreview = useMemo(
        () => dadosTermoVelorio(registro, { nome, cpf, em: agoraServidor(), por: "", versao: VERSAO_TERMO_VELORIO }),
        [registro, nome, cpf],
    );

    function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
        const r = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
        e.currentTarget.setPointerCapture(e.pointerId);
        const ctx = e.currentTarget.getContext("2d");
        if (!ctx) return;
        const { x, y } = ponto(e);
        desenhando.current = true;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.1, y + 0.1);
        ctx.stroke();
        setTemTraco(true);
    }
    function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!desenhando.current) return;
        const ctx = e.currentTarget.getContext("2d");
        if (!ctx) return;
        const { x, y } = ponto(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
        desenhando.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            /* já liberado */
        }
    }
    function limpar() {
        const c = canvasRef.current;
        const ctx = c?.getContext("2d");
        if (c && ctx) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.restore();
        }
        setTemTraco(false);
    }

    function avancarNome() {
        if (nome.trim().split(/\s+/).length < 2) {
            setMsg({ ok: false, texto: "Informe o nome completo (nome e sobrenome)." });
            return;
        }
        setMsg(null);
        setPasso("cpf");
    }
    function avancarCpf() {
        if (!cpfValido(cpf)) {
            setMsg({ ok: false, texto: "CPF inválido. Confira os números." });
            return;
        }
        setMsg(null);
        setPasso("assinar");
    }

    async function concluir() {
        if (!registro?.id) {
            setMsg({ ok: false, texto: "Atendimento não identificado." });
            return;
        }
        if (!ciente) {
            setMsg({ ok: false, texto: "Marque que leu e concorda com o termo." });
            return;
        }
        if (!temTraco || !canvasRef.current) {
            setMsg({ ok: false, texto: "Faça a assinatura no quadro." });
            return;
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setMsg({ ok: false, texto: "Sem internet. Conecte-se para concluir o termo (o que foi preenchido continua aqui)." });
            return;
        }

        const base64 = canvasRef.current.toDataURL("image/png");
        setSalvando(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/informativo.php`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    acao: "salvar_assinatura",
                    id: registro.id,
                    tipo: "velorio_online",
                    base64,
                    nome_assinatura: nome.trim(),
                    cpf_assinatura: cpf.replace(/\D+/g, ""),
                    termo_versao: VERSAO_TERMO_VELORIO,
                }),
            });
            const json = await res.json().catch(() => null);
            if (res.status === 401 || json?.need_login) {
                window.location.href = "/login";
                return;
            }
            if (!res.ok || !json?.sucesso) {
                throw new Error(json?.msg || "Não foi possível salvar o termo.");
            }

            const salvo: TermoVelorioSalvo = {
                assinatura_velorio_online: String(json.url || ""),
                assinatura_velorio_online_nome: nome.trim(),
                assinatura_velorio_online_cpf: cpf.replace(/\D+/g, ""),
                assinatura_velorio_online_em: String(json.em || agoraServidor()),
                assinatura_velorio_online_por: String(json.por || ""),
                assinatura_velorio_online_versao: String(json.versao || VERSAO_TERMO_VELORIO),
            };
            setAssinaturaB64(base64);
            setSituacao(situacaoTermoVelorio(salvo));
            setPasso("assinado");
            setMsg({ ok: true, texto: "Termo assinado e salvo no atendimento." });
            onSaved?.(salvo);
        } catch (e: any) {
            setMsg({ ok: false, texto: e?.message || "Não foi possível salvar o termo." });
        } finally {
            setSalvando(false);
        }
    }

    async function montarPdf(): Promise<{ blob: Blob; nomeArquivo: string } | null> {
        setGerando(true);
        setMsg(null);
        try {
            let assinatura = assinaturaB64;
            if (!assinatura && situacao.url) {
                assinatura = (await carregarAssinaturaTermo(situacao.url)) || "";
                if (assinatura) setAssinaturaB64(assinatura);
            }
            const d = dadosTermoVelorio(registro, situacao);
            const blob = await gerarPdfTermoVelorio(d, assinatura || undefined);
            return { blob, nomeArquivo: nomeArquivoTermoVelorio(d) };
        } catch (e: any) {
            setMsg({ ok: false, texto: e?.message || "Não foi possível gerar o PDF do termo." });
            return null;
        } finally {
            setGerando(false);
        }
    }

    async function visualizar() {
        // Abre a aba antes de gerar (o navegador do celular bloqueia janela aberta depois de esperar).
        const aba = window.open("", "_blank");
        const pdf = await montarPdf();
        if (!pdf) {
            aba?.close();
            return;
        }
        const url = URL.createObjectURL(pdf.blob);
        if (aba) aba.location.href = url;
        else window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function baixar() {
        const pdf = await montarPdf();
        if (!pdf) return;
        const url = URL.createObjectURL(pdf.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = pdf.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }

    async function compartilhar() {
        const pdf = await montarPdf();
        if (!pdf) return;
        const arquivo = new File([pdf.blob], pdf.nomeArquivo, { type: "application/pdf" });
        const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
        if (nav.share && nav.canShare?.({ files: [arquivo] })) {
            try {
                await nav.share({ files: [arquivo], title: "Termo do Velório On-line" });
            } catch {
                /* compartilhamento cancelado */
            }
            return;
        }
        // Computador sem compartilhamento de arquivo: baixa o PDF para anexar no WhatsApp/e-mail.
        await baixar();
        setMsg({ ok: true, texto: "PDF baixado. Anexe o arquivo no WhatsApp ou no e-mail." });
    }

    const nomeFalecido = String((registro as any)?.falecido ?? "").trim();
    const titulo = passo === "assinado" ? "Termo do Velório On-line" : "Assinar Termo";

    return (
        <Modal open={open} onClose={() => !salvando && onClose()} ariaLabel={titulo} maxWidth={560} zIndex={zIndex}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-xl font-semibold leading-tight">{titulo}</h2>
                    <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        {passo === "nome" && "Passo 1 de 3 · Nome completo de quem assina"}
                        {passo === "cpf" && "Passo 2 de 3 · CPF de quem assina"}
                        {passo === "assinar" && "Passo 3 de 3 · Leia o termo e assine"}
                        {passo === "assinado" && "Termo de responsabilidade assinado"}
                    </p>
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-xl leading-none text-[#5B6478] hover:text-foreground dark:text-[#AEB9CF]"
                    onClick={() => !salvando && onClose()}
                    aria-label="Fechar"
                >
                    ×
                </button>
            </div>

            <div className="mt-4 rounded-lg border border-[#E3E8F0] bg-white px-3 py-3 text-center dark:border-white/[0.12] dark:bg-[#232B3F]">
                <div className="break-words text-sm font-bold uppercase tracking-wide">{nomeFalecido || "Atendimento"}</div>
            </div>

            {passo === "nome" && (
                <div className="mt-5 grid gap-3">
                    <label className="text-sm font-semibold" htmlFor="termo-vel-nome">Nome completo</label>
                    <input
                        id="termo-vel-nome"
                        className={campo}
                        value={nome}
                        autoComplete="name"
                        autoFocus
                        onChange={(e) => setNome(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && avancarNome()}
                        placeholder="Nome e sobrenome"
                    />
                    <button type="button" className={btnPrimario} onClick={avancarNome}>Continuar</button>
                </div>
            )}

            {passo === "cpf" && (
                <div className="mt-5 grid gap-3">
                    <label className="text-sm font-semibold" htmlFor="termo-vel-cpf">CPF</label>
                    <input
                        id="termo-vel-cpf"
                        className={campo}
                        value={cpf}
                        inputMode="numeric"
                        autoFocus
                        onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                        onKeyDown={(e) => e.key === "Enter" && avancarCpf()}
                        placeholder="000.000.000-00"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className={btnSecundario} onClick={() => { setMsg(null); setPasso("nome"); }}>Voltar</button>
                        <button type="button" className={btnPrimario} onClick={avancarCpf}>Continuar</button>
                    </div>
                </div>
            )}

            {passo === "assinar" && (
                <div className="mt-5 grid gap-3">
                    <div className="max-h-[34dvh] overflow-y-auto rounded-lg border border-[#E3E8F0] bg-[#F6F8FB] p-3 text-[13px] leading-relaxed text-[#313C55] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-[#D6DCE8]">
                        <div className="mb-2 text-center text-[13px] font-extrabold tracking-wide">TERMO DE RESPONSABILIDADE · VELÓRIO ON-LINE</div>
                        {textoTermoVelorio(dadosPreview).map((p, i) => (
                            <p key={i} className={`mb-2 ${p.startsWith("• ") ? "pl-3" : ""}`}>{p}</p>
                        ))}
                        <p className="mt-3 text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">
                            CONTRATADA: PAI - Plano Assistencial Integrado Ltda · CNPJ 03.726.651/0001-51
                        </p>
                    </div>

                    <label className="flex items-start gap-2 text-sm font-semibold">
                        <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                        <span>Li e concordo com o Termo de Responsabilidade do Velório On-line.</span>
                    </label>

                    <div>
                        <div className="mb-1 flex items-center justify-between text-sm font-semibold">
                            <span>Assinatura de {nome.trim().split(/\s+/)[0] || "quem assina"}</span>
                            <button type="button" className="text-xs font-bold text-[#039adc] underline" onClick={limpar}>Limpar</button>
                        </div>
                        <div ref={caixaRef} className="overflow-hidden rounded-lg border-2 border-dashed border-[#C9D1DE] bg-white">
                            <canvas
                                ref={canvasRef}
                                className="block touch-none"
                                onPointerDown={onDown}
                                onPointerMove={onMove}
                                onPointerUp={onUp}
                                onPointerCancel={onUp}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className={btnSecundario} disabled={salvando} onClick={() => { setMsg(null); setPasso("cpf"); }}>Voltar</button>
                        <button type="button" className={btnPrimario} disabled={salvando || !temTraco || !ciente} onClick={() => void concluir()}>
                            {salvando ? "Salvando…" : "Concluir"}
                        </button>
                    </div>
                </div>
            )}

            {passo === "assinado" && (
                <div className="mt-5 grid gap-3">
                    <div className="rounded-lg border border-[#7BA11A]/40 bg-[#EEF5D6] p-3 text-sm text-[#313C55] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-white">
                        <div className="font-bold">{situacao.nome || "—"}</div>
                        <div className="mt-0.5 text-xs">
                            CPF {formatarCpf(situacao.cpf) || "—"}
                            {situacao.em ? ` · assinado em ${dadosTermoVelorio(registro, situacao).assinadoEm}` : ""}
                            {situacao.por ? ` · coletado por ${situacao.por}` : ""}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <button type="button" className={btnSecundario} disabled={gerando} onClick={() => void visualizar()}>Visualizar</button>
                        <button type="button" className={btnSecundario} disabled={gerando} onClick={() => void baixar()}>Baixar PDF</button>
                        <button type="button" className={btnPrimario} disabled={gerando} onClick={() => void compartilhar()}>
                            {gerando ? "Gerando…" : "Compartilhar"}
                        </button>
                    </div>
                </div>
            )}

            {msg && (
                <div
                    className={`mt-4 rounded-md border px-3 py-2 text-xs ${msg.ok
                        ? "border-[#7BA11A]/50 bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/20 dark:text-white"
                        : "border-[#B42318]/40 bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                        }`}
                    role="status"
                >
                    {msg.texto}
                </div>
            )}
        </Modal>
    );
}
