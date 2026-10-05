"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const OS_API = `${API_BASE}/os_principal.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";
/**
 * AJUSTAR: endpoint de upload de assinatura que o app já usa na Despedida (fase08).
 * Recebe POST multipart com o campo "arquivo" (PNG) e deve devolver o caminho salvo, ex.: { url: "/uploads/assinaturas/xxx.png" }.
 */
const UPLOAD_ASSINATURA_API = `${API_BASE}/upload_assinatura.php`;

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    return json;
}
function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}
function osPost(acao: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && body.set(k, String(v)));
    return apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const hoje = () => new Date().toLocaleDateString("sv-SE");
const inputCls = "w-full rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm font-semibold text-[#313C55] dark:text-white outline-none focus:border-[#00AEEC] dark:focus:border-[#00AEEC]";
const FORMAS = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "TRANSFERENCIA", "CHEQUE", "BOLETO", "OUTRO"];

function Tag({ children, bg = "#EEF1F5" }: { children: React.ReactNode; bg?: string }) {
    return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]" style={{ background: bg }}>{children}</span>;
}
function situacao(l: any) {
    if (l.status === "CONVERTIDA") return <Tag>CONVERTIDA</Tag>;
    if (l.status === "FECHADA") return <Tag bg="#E6F0C9">ASSINADA</Tag>;
    if (l.status === "AGUARDANDO_ASSINATURA") return <Tag bg="#FBEFC4">AGUARDANDO ASSINATURA</Tag>;
    return <Tag bg="#FFF8E1">RASCUNHO</Tag>;
}

/* ====================================================================== */

export default function MinhasOSPage() {
    const [f, setF] = useState({ data_inicio: hoje().slice(0, 8) + "01", data_fim: hoje(), tipo: "" });
    const [dados, setDados] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [loading, setLoading] = useState(true);
    const [aberta, setAberta] = useState<number | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");
        try {
            setDados((await osGet("minhas_os", f)).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar suas OS.");
        } finally {
            setLoading(false);
        }
    }, [f]);
    useEffect(() => { void carregar(); }, [carregar]);

    const lista: any[] = dados?.os || [];
    const emAberto = lista.filter((l) => l.status === "ABERTA").length;
    const assinadas = lista.filter((l) => l.status === "FECHADA");

    return (
        <main className="min-h-screen bg-[#F4F6F9] dark:bg-[#161C2A] p-6 text-[#313C55] dark:text-white">
            <div className="mb-5">
                <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Você vê apenas as OS que abriu</div>
                <h1 className="text-2xl font-extrabold">Minhas OS</h1>
            </div>

            <div className="mb-4 flex flex-col gap-3 lg:flex-row">
                {[
                    { r: "Em aberto", v: String(emAberto), s: "rascunhos a finalizar", c: "#F2CB3F" },
                    { r: "Assinadas no período", v: String(assinadas.length), s: brl(assinadas.reduce((a, l) => a + (Number(l.valor_total) || 0), 0)), c: "#B3CE52" },
                    { r: "Convertidas", v: String(lista.filter((l) => l.status === "CONVERTIDA").length), s: "Particular → Prefeitura", c: "#C9CFD9" },
                ].map((k) => (
                    <div key={k.r} className="flex-1 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4" style={{ borderTop: `4px solid ${k.c}` }}>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">{k.r}</div>
                        <div className="mt-1 text-2xl font-extrabold">{k.v}</div>
                        <div className="text-xs text-[#6B7488] dark:text-[#AEB9CF]">{k.s}</div>
                    </div>
                ))}
            </div>

            <div className="mb-4 grid gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4 md:grid-cols-[160px_160px_1fr] md:items-end">
                <input type="date" className={inputCls} value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value })} />
                <input type="date" className={inputCls} value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} />
                <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="">Todos os tipos</option><option value="PRT">Particular</option><option value="SOC">Associado</option><option value="DIF_SOC">Dif.Soc</option>
                    <option value="PRF">Prefeitura</option><option value="DIF_PRF">Dif.Prf</option><option value="COR">Coroa</option>
                </select>
            </div>

            {erro && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

            <div className="overflow-x-auto rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]">
                <table className="w-full text-sm">
                    <thead><tr className="border-b border-[#E1E5EC] dark:border-white/[0.12] text-left text-[11px] uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">
                        <th className="px-3 py-3">OS / falecido</th><th className="px-3">Tipo</th><th className="px-3">Situação</th><th className="px-3 text-right">Total</th><th className="px-3">Acompanhamento</th><th></th>
                    </tr></thead>
                    <tbody>
                        {!loading && lista.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[#6B7488] dark:text-[#AEB9CF]">Nenhuma OS no período.</td></tr>}
                        {lista.map((l) => (
                            <tr key={l.os_id} className={`border-b border-[#E1E5EC] dark:border-white/[0.12] ${l.status === "ABERTA" ? "bg-[#FFF8E1] dark:bg-[#F2CB3F]/10" : ""}`}>
                                <td className="px-3 py-3"><b>{l.numero_os}</b><div className="text-xs text-[#6B7488] dark:text-[#AEB9CF]">{l.falecido || "—"}</div></td>
                                <td className="px-3 text-xs">{l.tipo_rotulo}</td>
                                <td className="px-3">{situacao(l)}</td>
                                <td className="whitespace-nowrap px-3 text-right">{brl(l.valor_total)}</td>
                                <td className="px-3 text-xs text-[#6B7488] dark:text-[#AEB9CF]">
                                    {l.status === "ABERTA" ? <b className="text-[#313C55] dark:text-white">Confirmar valores e colher assinatura</b>
                                        : l.saldo ? `saldo ${brl(l.saldo)} (financeiro)` : l.nota_promissoria ? `NP ${brl(l.nota_promissoria.valor)}` : "—"}
                                </td>
                                <td className="px-3 text-right">
                                    <button type="button" onClick={() => setAberta(l.os_id)} className={`rounded-lg px-4 py-2 text-sm font-bold ${l.status === "ABERTA" ? "bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]" : "border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]"}`}>
                                        {l.status === "ABERTA" ? "Continuar" : "Abrir"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {aberta && <OSAgente osId={aberta} onFechar={() => { setAberta(null); void carregar(); }} />}
        </main>
    );
}

/* ====================================================================== */
/* OS do agente: itens (valor e desconto), confirmação e assinatura com pagamento no ato */

function OSAgente({ osId, onFechar }: { osId: number; onFechar: () => void }) {
    const [d, setD] = useState<any>(null);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [edit, setEdit] = useState<any>(null);         // {item, modo: 'valor'|'pct'|'reais', v}
    const [assinar, setAssinar] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setD((await osGet("listar", { os_id: osId })).dados);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível abrir a OS.");
        }
    }, [osId]);
    useEffect(() => { void carregar(); }, [carregar]);

    const run = async (fn: () => Promise<any>) => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        setMsg("");
        try {
            const r = await fn();
            setMsg(r?.msg || "Salvo.");
            await carregar();
            return true;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível concluir.");
            return false;
        } finally {
            setSalvando(false);
        }
    };

    const os = d?.os;
    const aberta = os?.status === "ABERTA";
    const particular = os?.natureza === "PARTICULAR";
    const confirmada = !!os?.confirmada_em;

    const salvarEdicao = () => run(() => {
        const it = edit.item;
        if (edit.modo === "valor") return osPost("editar_valor_item", { os_item_id: it.id, valor: num(edit.v) });
        if (edit.modo === "pct") return osPost("aplicar_desconto", { os_item_id: it.id, percentual: num(edit.v) });
        return osPost("aplicar_desconto", { os_item_id: it.id, valor_desconto: num(edit.v) });
    }).then((ok) => ok && setEdit(null));

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(49,60,85,0.45)]" onClick={onFechar}>
            <div className="h-full w-full max-w-4xl overflow-y-auto bg-[#F4F6F9] dark:bg-[#161C2A] p-6" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="text-sm text-[#6B7488] dark:text-[#AEB9CF]">Minhas OS</div>
                        <h2 className="text-2xl font-extrabold">OS {os?.numero_os || "…"}</h2>
                    </div>
                    <div className="flex gap-2">
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=visualizar`}>Ver folha</a>
                        <a className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" target="_blank" rel="noreferrer" href={`${OS_API}?documento_os=1&os_id=${osId}&formato=impressao`}>Imprimir</a>
                        <button type="button" className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-bold" onClick={onFechar}>Fechar</button>
                    </div>
                </div>

                {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
                {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

                <div className="mb-4 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-[#E1E5EC] dark:border-white/[0.12] text-left text-[11px] uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">
                            <th className="py-2">Item</th><th className="text-right">Qtd</th><th className="text-right">Tabela</th><th className="text-right">Aplicado</th><th className="text-right">Final</th><th></th>
                        </tr></thead>
                        <tbody>
                            {(d?.itens || []).map((it: any) => (
                                <tr key={it.id} className="border-b border-[#E1E5EC] dark:border-white/[0.12]">
                                    <td className="py-2"><b>{it.produto_nome}</b><div className="text-xs text-[#6B7488] dark:text-[#AEB9CF]">{it.categoria}{it.tipo_item === "DIFERENCA" ? " · diferença" : ""}{Number(it.desconto_percentual) > 0 ? ` · desconto ${it.desconto_percentual}%` : ""}</div></td>
                                    <td className="text-right">{it.quantidade}</td>
                                    <td className="whitespace-nowrap text-right">{Number(it.referencia_apenas) ? "—" : brl(it.valor_unitario_travado)}</td>
                                    <td className="whitespace-nowrap text-right">{Number(it.referencia_apenas) ? "—" : brl(it.valor_unitario_aplicado)}</td>
                                    <td className="whitespace-nowrap text-right font-bold">{Number(it.referencia_apenas) ? "contrato" : brl(it.valor_final)}</td>
                                    <td className="text-right">{aberta && particular && !Number(it.referencia_apenas) && (
                                        <button type="button" className="text-xs font-bold text-[#00AEEC] dark:text-[#66CFF5]" onClick={() => setEdit({ item: it, modo: "pct", v: "" })}>Valor / desconto</button>
                                    )}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-3 flex justify-end text-xl font-extrabold">Total: {brl(os?.valor_total)}</div>
                </div>

                {aberta && particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">{confirmada ? <><b>Valores confirmados.</b> Qualquer alteração desfaz a confirmação.</> : "Confira os itens com a família e confirme os valores antes de assinar."}</div>
                        <div className="flex gap-2">
                            {!confirmada && <button type="button" disabled={salvando} onClick={() => void run(() => osPost("confirmar_os", { os_id: osId }))} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55] disabled:opacity-50">Confirmar valores</button>}
                            {confirmada && <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>}
                        </div>
                    </div>
                )}
                {aberta && !particular && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4">
                        <div className="text-sm">OS de convênio: o responsável assina como ciência{os?.convenio?.startsWith("ASSOCIADO") && !os?.contrato_numero ? " — informe o contrato do titular no atendimento antes." : "."}</div>
                        <button type="button" onClick={() => setAssinar(true)} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">Colher assinatura</button>
                    </div>
                )}

                {edit && (
                    <Modal titulo="Valor e desconto" sub={edit.item.produto_nome} onFechar={() => setEdit(null)}>
                        <div className="mb-3 flex gap-1 rounded-lg bg-[#F4F6F9] dark:bg-[#161C2A] p-1 text-sm font-bold">
                            {[["pct", "Desconto %"], ["reais", "Desconto R$"], ["valor", "Novo valor"]].map(([m, r]) => (
                                <button key={m} type="button" onClick={() => setEdit({ ...edit, modo: m, v: "" })} className={`flex-1 rounded-md py-1.5 ${edit.modo === m ? "bg-white dark:bg-[#232B3F] shadow" : "text-[#6B7488] dark:text-[#AEB9CF]"}`}>{r}</button>
                            ))}
                        </div>
                        <input autoFocus inputMode="decimal" className={inputCls} value={edit.v} placeholder={edit.modo === "pct" ? "ex.: 5" : "ex.: 100,00"} onChange={(e) => setEdit({ ...edit, v: e.target.value })} />
                        <div className="my-3 text-xs text-[#6B7488] dark:text-[#AEB9CF]">Tabela {brl(edit.item.valor_unitario_travado)}. Limite do agente: 8% por item e no total da OS (não soma). Acima disso, só o administrador. Aumentar o valor é livre (aparece "Edit" na folha).</div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] px-4 py-2 text-sm font-bold">Cancelar</button>
                            <button type="button" disabled={salvando || !edit.v} onClick={() => void salvarEdicao()} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55] disabled:opacity-50">Aplicar</button>
                        </div>
                    </Modal>
                )}

                {assinar && os && <AssinaturaModal os={os} particular={particular} onFechar={() => setAssinar(false)} onAssinado={() => { setAssinar(false); setMsg("OS assinada."); void carregar(); }} />}
            </div>
        </div>
    );
}

function AssinaturaModal({ os, particular, onFechar, onAssinado }: { os: any; particular: boolean; onFechar: () => void; onAssinado: () => void }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const desenhando = useRef(false);
    const [temTraco, setTemTraco] = useState(false);
    const [f, setF] = useState({ nome: "", cpf: "", pago: "", forma: "PIX" });
    const [erro, setErro] = useState("");
    const [salvando, setSalvando] = useState(false);

    const total = Number(os.valor_total) || 0;
    const saldo = Math.max(0, total - num(f.pago));

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        return [((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height];
    };
    const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const ctx = canvas.current!.getContext("2d")!;
        ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#313C55";
        const [x, y] = pos(e);
        ctx.beginPath(); ctx.moveTo(x, y);
        desenhando.current = true;
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!desenhando.current) return;
        const ctx = canvas.current!.getContext("2d")!;
        const [x, y] = pos(e);
        ctx.lineTo(x, y); ctx.stroke();
        setTemTraco(true);
    };
    const limpar = () => { canvas.current!.getContext("2d")!.clearRect(0, 0, 600, 180); setTemTraco(false); };

    const enviar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro("");
        try {
            const blob: Blob = await new Promise((ok) => canvas.current!.toBlob((b) => ok(b!), "image/png"));
            const fd = new FormData();
            fd.append("arquivo", blob, `assinatura_os_${os.id}.png`);
            const up = await apiJson(UPLOAD_ASSINATURA_API, { method: "POST", body: fd });
            const caminho = up?.url || up?.dados?.url || up?.caminho;
            if (!caminho) throw new Error("O upload da assinatura não devolveu o caminho do arquivo.");
            await osPost("assinar", {
                os_id: os.id, nome_responsavel: f.nome.trim(), cpf_responsavel: f.cpf, arquivo_assinatura: caminho,
                ...(particular && num(f.pago) > 0 ? { pagamento_valor: num(f.pago), pagamento_forma: f.forma, pagamento_data: hoje() } : {}),
            });
            onAssinado();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível assinar.");
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Modal titulo="Assinatura da OS" sub={`OS ${os.numero_os} · uma assinatura vale para a OS${particular ? ", o pagamento e a nota promissória do saldo" : ""}`} onFechar={onFechar}>
            {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
            <div className="mb-3 grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Nome do responsável" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
                <input className={inputCls} placeholder="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
            </div>
            {particular && (
                <div className="mb-3 rounded-xl border border-[#E1E5EC] dark:border-white/[0.12] p-3">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]">Pagamento no ato (opcional)</div>
                    <div className="grid grid-cols-2 gap-2">
                        <input inputMode="decimal" className={inputCls} placeholder="0,00" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })} />
                        <select className={inputCls} value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value })}>{FORMAS.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select>
                    </div>
                    <div className="mt-2 text-sm">Total {brl(total)} · {saldo > 0 ? <>nota promissória à vista de <b>{brl(saldo)}</b></> : <b>quitada no ato, sem nota promissória</b>}</div>
                </div>
            )}
            <div className="mb-1 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#6B7488] dark:text-[#AEB9CF]"><span>Assine no quadro</span><button type="button" onClick={limpar} className="normal-case text-[#00AEEC] dark:text-[#66CFF5]">Limpar</button></div>
            <canvas ref={canvas} width={600} height={180} className="mb-3 w-full touch-none rounded-lg border border-dashed border-[#C9CFD9] dark:border-white/30 bg-white dark:bg-[#232B3F]"
                    onPointerDown={inicio} onPointerMove={move} onPointerUp={() => (desenhando.current = false)} onPointerLeave={() => (desenhando.current = false)} />
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onFechar} className="rounded-lg border border-[#E1E5EC] dark:border-white/[0.12] px-4 py-2 text-sm font-bold">Cancelar</button>
                <button type="button" disabled={salvando || !temTraco || !f.nome.trim()} onClick={() => void enviar()} className="rounded-lg bg-[#313C55] px-4 py-2 text-sm font-bold text-white dark:bg-[#F2CB3F] dark:text-[#313C55] disabled:opacity-50">{salvando ? "Assinando…" : "Assinar"}</button>
            </div>
        </Modal>
    );
}

function Modal({ titulo, sub, children, onFechar }: { titulo: string; sub?: string; children: React.ReactNode; onFechar: () => void }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(49,60,85,0.45)] p-4" onClick={onFechar}>
            <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#232B3F] p-6 text-[#313C55] dark:text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="text-xl font-extrabold">{titulo}</div>
                {sub && <div className="mb-4 text-sm text-[#6B7488] dark:text-[#AEB9CF]">{sub}</div>}
                {children}
            </div>
        </div>
    );
}
