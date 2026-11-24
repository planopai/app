"use client";

/**
 * Escolha do modelo da Meta por motivo (24/11/2026, modelo C): 1) qual o motivo do contato, 2) a mensagem daquele
 * assunto, 3) conferir os campos com a prévia. Usado na Nova conversa pelo WhatsApp e na conversa com a janela de 24 h
 * fechada (Retomar atendimento). Nomes, assuntos e campos: catalogoModelos.ts. O envio fica com quem usa o componente:
 * ele recebe o estado por onEstado (modelo, parâmetros, texto final e se está pronto para enviar).
 */
import React, { useEffect, useMemo, useState } from "react";
import { msgGet } from "@/components/messenger/api";
import ModeloCampos, { type ModeloMeta } from "@/components/messenger/ModeloCampos";
import { TEMAS_MODELO, infoModelo, ordemModelo, semAcento } from "@/components/messenger/catalogoModelos";

export type EstadoModelo = { modelo: ModeloMeta | null; params: string[]; texto: string; pronto: boolean };

const ICONES: Record<string, React.ReactNode> = {
    pagamento: <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4" />,
    pos: <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />,
    coroas: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2" /></>,
    contrato: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
    servicos: <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />,
    vendas: <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />,
    outros: <><circle cx="12" cy="12" r="9" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
};
const FUNDO: Record<string, string> = {
    pagamento: "bg-[#EEF5D6] text-[#3E5208] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]",
    pos: "bg-[#E3ECF6] text-[#1E3A5C] dark:bg-[#3D6A99]/30 dark:text-[#DDE7F3]",
    coroas: "bg-[#FCE7EF] text-[#8A1F4A] dark:bg-[#FF7AA8]/15 dark:text-[#FFB8CF]",
    contrato: "bg-[#FFF4C2] text-[#5C4600] dark:bg-[#F2CB3F]/20 dark:text-[#F7E39A]",
    servicos: "bg-[#DFF3F0] text-[#0F5A50] dark:bg-[#5FC7B6]/15 dark:text-[#A8E6DC]",
    vendas: "bg-[#FDE8E6] text-[#A3271B] dark:bg-[#FF9C92]/15 dark:text-[#FFB4AB]",
    outros: "bg-[#EEF2F7] text-[#4A5468] dark:bg-white/10 dark:text-[#AEB9CF]",
};

function Icone({ tema, className = "h-[22px] w-[22px]" }: { tema: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONES[tema] || ICONES.outros}
        </svg>
    );
}

function Selo({ categoria }: { categoria?: string }) {
    if (categoria === "MARKETING") return <span className="flex-none rounded-full bg-[#FDE8E6] px-2 py-0.5 text-[11px] font-extrabold text-[#A3271B] dark:bg-[#FF9C92]/15 dark:text-[#FFB4AB]">Marketing</span>;
    if (categoria === "UTILITY") return <span className="flex-none rounded-full bg-[#EEF5D6] px-2 py-0.5 text-[11px] font-extrabold text-[#3E5208] dark:bg-[#B3CE52]/15 dark:text-[#DCEBAA]">Utilidade</span>;
    return null;
}

function realce(txt: string, q: string) {
    if (!q) return txt;
    const i = semAcento(txt).indexOf(semAcento(q));
    if (i < 0) return txt;
    return (
        <>
            {txt.slice(0, i)}
            <mark className="rounded bg-[#F7E39A] text-inherit dark:bg-[#F2CB3F]/35">{txt.slice(i, i + q.length)}</mark>
            {txt.slice(i + q.length)}
        </>
    );
}

export default function SeletorModelo({ conversaId, telefone, onEstado, compacto = false }: {
    conversaId?: number; telefone?: string; onEstado: (e: EstadoModelo) => void; compacto?: boolean;
}) {
    const [modelos, setModelos] = useState<ModeloMeta[] | null>(null);
    const [erro, setErro] = useState("");
    const [passo, setPasso] = useState<1 | 2 | 3>(1);
    const [tema, setTema] = useState("");
    const [modelo, setModelo] = useState<ModeloMeta | null>(null);
    const [params, setParams] = useState<string[]>([]);
    const [busca, setBusca] = useState("");

    useEffect(() => {
        msgGet<ModeloMeta[]>("modelos")
            .then((l) => setModelos(l.filter((m) => m.categoria !== "AUTHENTICATION").sort((a, b) => ordemModelo(a.nome) - ordemModelo(b.nome))))
            .catch((e) => { setModelos([]); setErro(e.message); });
    }, []);

    const porTema = useMemo(() => {
        const g: Record<string, ModeloMeta[]> = {};
        (modelos || []).forEach((m) => (g[infoModelo(m.nome).tema] ||= []).push(m));
        return g;
    }, [modelos]);
    const achados = useMemo(() => {
        const q = semAcento(busca.trim());
        if (!q) return [];
        return (modelos || []).filter((m) => {
            const i = infoModelo(m.nome);
            const tn = TEMAS_MODELO.find((t) => t.id === i.tema)?.nome || "";
            return semAcento(`${i.titulo} ${i.desc} ${m.corpo} ${tn} ${m.nome}`).includes(q);
        });
    }, [modelos, busca]);

    const texto = modelo ? modelo.corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : "";
    const pronto = !!modelo && params.length >= modelo.parametros && params.slice(0, modelo.parametros).every((p) => (p || "").trim() !== "");
    useEffect(() => { onEstado({ modelo: passo === 3 ? modelo : null, params, texto, pronto: passo === 3 && pronto }); }, [modelo, params, texto, pronto, passo]); // eslint-disable-line react-hooks/exhaustive-deps

    function escolher(m: ModeloMeta) {
        setModelo(m);
        setParams(Array(m.parametros).fill(""));
        setTema(infoModelo(m.nome).tema);
        setPasso(3);
    }

    if (erro) return <div className="text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">{erro}</div>;
    if (!modelos) return <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Carregando os modelos…</div>;
    if (!modelos.length) return <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Nenhum modelo aprovado na Meta.</div>;

    const temaAtual = TEMAS_MODELO.find((t) => t.id === tema);
    const passos: [string, 1 | 2 | 3][] = [["Motivo", 1], ["Mensagem", 2], ["Conferir", 3]];
    const linha = "flex w-full items-center gap-3 rounded-[14px] border-[1.5px] px-3 py-2.5 text-left";

    const itemModelo = (m: ModeloMeta, q: string, comTema: boolean) => {
        const i = infoModelo(m.nome);
        const sel = modelo && modelo.nome === m.nome && modelo.idioma === m.idioma;
        return (
            <button key={`${m.nome}|${m.idioma}`} type="button" onClick={() => escolher(m)}
                className={`${linha} ${sel ? "border-[#3D6A99] bg-[#E3ECF6] dark:bg-[#3D6A99]/30" : "border-transparent bg-[#F4F6FA] hover:border-[#DCE2EC] dark:bg-[#1C2334] dark:hover:border-white/15"}`}>
                <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-extrabold">{realce(i.titulo, q)}</b>
                    <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{realce(i.desc, q)}</span>
                    <span className="mt-0.5 block text-[11.5px] font-bold text-[#7A859B] dark:text-[#8FA3C2]">
                        {comTema ? `${TEMAS_MODELO.find((t) => t.id === i.tema)?.nome} · ` : ""}{m.parametros ? `${m.parametros} campo${m.parametros > 1 ? "s" : ""}` : "sem campos"}
                    </span>
                </span>
                <Selo categoria={m.categoria} />
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-3">
            {/* passos */}
            <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-extrabold text-[#7A859B] dark:text-[#8FA3C2]" aria-label="Passos">
                {passos.map(([n, p], k) => (
                    <React.Fragment key={p}>
                        {k > 0 && <span aria-hidden="true">›</span>}
                        <button type="button" disabled={p >= passo} onClick={() => { setPasso(p); if (p === 1) setBusca(""); }}
                            className={`flex items-center gap-1.5 disabled:cursor-default ${passo === p ? "text-[#1F2638] dark:text-white" : ""}`}>
                            <i className={`grid h-6 w-6 place-items-center rounded-full text-[12px] not-italic ${passo === p ? "bg-[#F2CB3F] text-[#313C55]" : passo > p ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "bg-[#EEF2F7] dark:bg-white/10"}`}>{passo > p ? "✓" : p}</i>
                            {n}
                        </button>
                    </React.Fragment>
                ))}
            </nav>

            {passo === 1 && (
                <>
                    <p className="m-0 text-[17px] font-black">Qual o motivo do contato?</p>
                    <div className={`grid gap-2.5 ${compacto ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
                        {TEMAS_MODELO.filter((t) => porTema[t.id]?.length).map((t) => (
                            <button key={t.id} type="button" onClick={() => { setTema(t.id); setPasso(2); }}
                                className={`flex min-w-0 items-start gap-3 rounded-[18px] border-[1.5px] bg-[#F4F6FA] p-3 text-left hover:border-[#3D6A99] dark:bg-[#1C2334] ${t.marketing ? "border-dashed border-[#DCE2EC] dark:border-white/20" : "border-[#DCE2EC] dark:border-white/12"}`}>
                                <span className={`grid h-11 w-11 flex-none place-items-center rounded-[13px] ${FUNDO[t.id]}`}><Icone tema={t.id} /></span>
                                <span className="min-w-0 flex-1">
                                    <b className="flex items-center gap-2 text-[15px] font-black">{t.nome}<span className="ml-auto text-[11.5px] font-black text-[#7A859B] dark:text-[#8FA3C2]">{porTema[t.id].length}</span></b>
                                    <span className="mt-0.5 block text-[12.5px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">
                                        {t.desc}{t.marketing && <span className="font-extrabold text-[#A3271B] dark:text-[#FFB4AB]"> · marketing, mais caro</span>}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <label className="flex h-11 items-center gap-2.5 rounded-[14px] border-[1.5px] border-[#DCE2EC] bg-[#F4F6FA] px-3.5 focus-within:border-[#3D6A99] dark:border-white/12 dark:bg-[#1C2334]">
                        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] flex-none text-[#7A859B]" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Já sabe qual? Busque: pix, documento, coroa…" aria-label="Buscar modelo" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                    </label>
                    {busca.trim() && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{achados.length} mensage{achados.length === 1 ? "m" : "ns"} encontrada{achados.length === 1 ? "" : "s"}</span>
                            {achados.map((m) => itemModelo(m, busca.trim(), true))}
                        </div>
                    )}
                </>
            )}

            {passo === 2 && temaAtual && (
                <>
                    <div className="flex items-center gap-3">
                        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${FUNDO[temaAtual.id]}`}><Icone tema={temaAtual.id} className="h-5 w-5" /></span>
                        <div className="min-w-0">
                            <b className="block text-[16px] font-black">{temaAtual.nome}</b>
                            <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">Escolha a mensagem{temaAtual.marketing ? " · marketing, mais cara" : ""}.</span>
                        </div>
                        <button type="button" onClick={() => setPasso(1)} className="ml-auto text-[13px] font-extrabold text-[#3D6A99] dark:text-[#8FB8E6]">Trocar motivo</button>
                    </div>
                    <div className="flex flex-col gap-1.5">{(porTema[temaAtual.id] || []).map((m) => itemModelo(m, "", false))}</div>
                </>
            )}

            {passo === 3 && modelo && (
                <>
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <b className="block text-[16px] font-black">{infoModelo(modelo.nome).titulo}</b>
                            <span className="flex items-center gap-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{TEMAS_MODELO.find((t) => t.id === infoModelo(modelo.nome).tema)?.nome}<Selo categoria={modelo.categoria} /></span>
                        </div>
                        <button type="button" onClick={() => setPasso(2)} className="text-[13px] font-extrabold text-[#3D6A99] dark:text-[#8FB8E6]">Trocar mensagem</button>
                    </div>
                    {modelo.parametros > 0 && (
                        <ModeloCampos modelo={modelo} conversaId={conversaId} telefone={telefone} params={params} onParams={setParams} compacto={compacto} rotulos={infoModelo(modelo.nome).campos} />
                    )}
                    <div>
                        <span className="text-xs font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">Como a pessoa vai receber</span>
                        <div className="mt-1 rounded-2xl bg-[#E9E3D9] p-3 dark:bg-[#0B141A]">
                            <p className="m-0 ml-auto max-w-[96%] whitespace-pre-wrap break-words rounded-[12px_12px_4px_12px] bg-[#D9FDD3] px-3 py-2.5 text-[14.5px] leading-snug text-[#111B21] dark:bg-[#005C4B] dark:text-[#E9EDEF]">{texto}</p>
                        </div>
                        {!pronto && modelo.parametros > 0 && <span className="mt-1.5 block text-[12.5px] font-bold text-[#8A6A00] dark:text-[#F2CB3F]">Preencha os campos vazios para enviar.</span>}
                    </div>
                </>
            )}
        </div>
    );
}
