"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API = "https://api.planoassistencialintegrado.com.br/convenio.php";
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

type SimNao = "" | "Sim" | "Não";
type TipoOS = "" | "PARTICULAR" | "ASSOCIADO" | "PREFEITURA";

type ProdutoRegra = {
  valor: SimNao;
  produto_id: number;
  nome: string;
  codigo_barras: string;
  deposito_nome: string;
  quantidade: number;
};

type Regras = {
  schema_version: 1;
  urna: ProdutoRegra;
  roupa: ProdutoRegra;
  invol: ProdutoRegra;
  veu: ProdutoRegra;
  cordao: ProdutoRegra;
  kit_lanche: { valor: SimNao };
  coroa_flores: ProdutoRegra & { tipo: "" | "Natural" | "Artificial" };
  assistencia: { valor: SimNao };
  tanato: { valor: SimNao };
  ornamentacao: { valor: SimNao; tipo?: "" | "Natural" | "Artificial" };
  realiza_velorio: { valor: SimNao };
  realiza_sepultamento: { valor: SimNao };
};

type Convenio = {
  id: number;
  nome: string;
  slug: string;
  ativo: boolean;
  ordem: number;
  observacao: string;
  regras: Regras;
  versao: number;
  tipo: TipoOS;
  codigo: string;
  codigo_numero: string;
  aditivos_permitidos: string[];
};

type Produto = {
  id: number;
  nome: string;
  codigo_barras?: string;
  valor?: number | null;
};

type ItemPacote = {
  categoria: string;
  produto_id: number;
  produto_nome: string;
  valor_item: string;
};

const inputCls =
  "w-full rounded-lg border border-[#DDE3EC] bg-white px-3 py-2.5 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC] disabled:bg-[#F4F6F9] disabled:text-[#8992A3]";
const labelCls =
  "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7488]";

const categorias = [
  ["URNA", "Urna"],
  ["ROUPA", "Roupa"],
  ["INVOLUCRO", "Invólucro"],
  ["VEU", "Véu"],
  ["CORDAO", "Cordão"],
  ["COROA", "Coroa de flores"],
  ["ORNAMENTACAO", "Ornamentação"],
  ["ASSISTENCIA", "Assistência"],
  ["KIT_LANCHE", "Kit lanche"],
] as const;

function regraProduto(): ProdutoRegra {
  return {
    valor: "",
    produto_id: 0,
    nome: "",
    codigo_barras: "",
    deposito_nome: "",
    quantidade: 1,
  };
}

function regrasVazias(): Regras {
  return {
    schema_version: 1,
    urna: regraProduto(),
    roupa: regraProduto(),
    invol: regraProduto(),
    veu: regraProduto(),
    cordao: regraProduto(),
    kit_lanche: { valor: "" },
    coroa_flores: { ...regraProduto(), tipo: "" },
    assistencia: { valor: "" },
    tanato: { valor: "" },
    ornamentacao: { valor: "", tipo: "" },
    realiza_velorio: { valor: "" },
    realiza_sepultamento: { valor: "" },
  };
}

function convenioNovo(): Convenio {
  return {
    id: 0,
    nome: "",
    slug: "",
    ativo: true,
    ordem: 0,
    observacao: "",
    regras: regrasVazias(),
    versao: 0,
    tipo: "",
    codigo: "",
    codigo_numero: "",
    aditivos_permitidos: [],
  };
}

function normalizeRegras(raw: any): Regras {
  const prod = (x: any): ProdutoRegra => ({
    valor: ["Sim", "Não"].includes(x?.valor) ? x.valor : "",
    produto_id: Number(x?.produto_id || 0),
    nome: String(x?.nome || ""),
    codigo_barras: String(x?.codigo_barras || ""),
    deposito_nome: String(x?.deposito_nome || ""),
    quantidade: Math.max(1, Number(x?.quantidade || 1)),
  });

  return {
    schema_version: 1,
    urna: prod(raw?.urna),
    roupa: prod(raw?.roupa),
    invol: prod(raw?.invol),
    veu: prod(raw?.veu),
    cordao: prod(raw?.cordao),
    kit_lanche: { valor: ["Sim", "Não"].includes(raw?.kit_lanche?.valor) ? raw.kit_lanche.valor : "" },
    coroa_flores: {
      ...prod(raw?.coroa_flores),
      tipo: ["Natural", "Artificial"].includes(raw?.coroa_flores?.tipo) ? raw.coroa_flores.tipo : "",
    },
    assistencia: { valor: ["Sim", "Não"].includes(raw?.assistencia?.valor) ? raw.assistencia.valor : "" },
    tanato: { valor: ["Sim", "Não"].includes(raw?.tanato?.valor) ? raw.tanato.valor : "" },
    ornamentacao: {
      valor: ["Sim", "Não"].includes(raw?.ornamentacao?.valor) ? raw.ornamentacao.valor : "",
      tipo: ["Natural", "Artificial"].includes(raw?.ornamentacao?.tipo) ? raw.ornamentacao.tipo : "",
    },
    realiza_velorio: { valor: ["Sim", "Não"].includes(raw?.realiza_velorio?.valor) ? raw.realiza_velorio.valor : "" },
    realiza_sepultamento: { valor: ["Sim", "Não"].includes(raw?.realiza_sepultamento?.valor) ? raw.realiza_sepultamento.valor : "" },
  };
}

function normalizeConvenio(x: any): Convenio {
  return {
    id: Number(x?.id || 0),
    nome: String(x?.nome || ""),
    slug: String(x?.slug || ""),
    ativo: x?.ativo !== false,
    ordem: Number(x?.ordem || 0),
    observacao: String(x?.observacao || ""),
    regras: normalizeRegras(x?.regras || {}),
    versao: Number(x?.versao || 0),
    tipo: String(x?.tipo || "") as TipoOS,
    codigo: String(x?.codigo || ""),
    codigo_numero: String(x?.codigo_numero || ""),
    aditivos_permitidos: Array.isArray(x?.aditivos_permitidos) ? x.aditivos_permitidos : [],
  };
}

async function api(action: string, params: Record<string, any> = {}, method: "GET" | "POST" = "GET") {
  let res: Response;

  if (method === "GET") {
    const u = new URL(API);
    u.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    });
    u.searchParams.set("_", String(Date.now()));
    res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
  } else {
    res = await fetch(API, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
  }

  const json = await res.json().catch(() => null);

  if (res.status === 401 || json?.code === "NEED_LOGIN") {
    window.location.href = LOGIN_URL;
    throw new Error("Sessão expirada.");
  }
  if (!res.ok || json?.erro) throw new Error(json?.msg || `Falha na requisição (${res.status}).`);

  return json?.data ?? json?.dados ?? null;
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (s?: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const num = (s: any) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const decBR = (v: any) =>
  v === null || v === undefined || v === ""
    ? ""
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Botao({ children, primario, perigo, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean; perigo?: boolean }) {
  const cls = perigo ? "bg-[#B42318] text-white" : primario ? "bg-[#313C55] text-white" : "border border-[#DDE3EC] bg-white text-[#313C55]";
  return <button type="button" {...p} className={`rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${cls} ${p.className || ""}`}>{children}</button>;
}

function Alerta({ tipo, children }: { tipo: "erro" | "ok"; children: React.ReactNode }) {
  return <div className={`mb-4 rounded-xl border p-3 text-sm ${tipo === "erro" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{children}</div>;
}

function SimNao({ value, onChange }: { value: SimNao; onChange: (v: SimNao) => void }) {
  return <div className="inline-flex overflow-hidden rounded-lg border border-[#DDE3EC]">{(["Sim", "Não"] as SimNao[]).map((v) => <button key={v} type="button" onClick={() => onChange(v)} className={`px-4 py-2 text-sm font-bold ${value === v ? "bg-[#313C55] text-white" : "bg-white text-[#6B7488]"}`}>{v}</button>)}</div>;
}

function ProdutoPicker({ value, onChange }: { value: { produto_id: number; nome: string }; onChange: (p: Produto) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const d = await api("product_search", { q, limit: 40 });
        setRows(Array.isArray(d) ? d : []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, q]);

  return <div className="relative">
    <button type="button" className={`${inputCls} text-left`} onClick={() => setOpen(!open)}>{value.produto_id ? `${value.nome || "Produto"} · #${value.produto_id}` : "Selecionar produto..."}</button>
    {open && <div className="absolute z-50 mt-1 w-full min-w-[340px] rounded-xl border border-[#DDE3EC] bg-white p-3 shadow-xl">
      <input autoFocus className={inputCls} placeholder="Buscar produto..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-64 overflow-y-auto">
        {loading && <div className="p-3 text-sm text-[#6B7488]">Buscando...</div>}
        {!loading && rows.map((p) => <button key={p.id} type="button" onClick={() => { onChange(p); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#F4F6F9]"><div className="text-sm font-bold">{p.nome}</div><div className="text-xs text-[#6B7488]">#{p.id}{p.codigo_barras ? ` · ${p.codigo_barras}` : ""}{p.valor != null ? ` · ${brl(p.valor)}` : ""}</div></button>)}
      </div>
    </div>}
  </div>;
}

function RegraProduto({ titulo, value, onChange, tipo = false }: { titulo: string; value: ProdutoRegra & { tipo?: "" | "Natural" | "Artificial" }; onChange: (v: any) => void; tipo?: boolean }) {
  return <section className="rounded-xl border border-[#DDE3EC] bg-white p-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold">{titulo}</h3><p className="text-xs text-[#6B7488]">Cobertura e produto padrão.</p></div><SimNao value={value.valor} onChange={(v) => onChange(v === "Não" ? { ...regraProduto(), valor: "Não", ...(tipo ? { tipo: "" } : {}) } : { ...value, valor: v })} /></div>
    {value.valor === "Sim" && <div className="mt-4 space-y-3 border-t border-[#EEF1F5] pt-4">
      {tipo && <label className="block"><span className={labelCls}>Tipo</span><select className={inputCls} value={value.tipo || ""} onChange={(e) => onChange({ ...value, tipo: e.target.value })}><option value="">Selecione...</option><option value="Natural">Natural</option><option value="Artificial">Artificial</option></select></label>}
      <div><span className={labelCls}>Produto padrão</span><ProdutoPicker value={value} onChange={(p) => onChange({ ...value, produto_id: p.id, nome: p.nome, codigo_barras: p.codigo_barras || "" })} /></div>
      <label className="block"><span className={labelCls}>Quantidade padrão</span><input type="number" min={1} className={inputCls} value={value.quantidade} onChange={(e) => onChange({ ...value, quantidade: Math.max(1, Number(e.target.value) || 1) })} /></label>
    </div>}
  </section>;
}

function RegraBool({ titulo, value, onChange, tipo = false }: { titulo: string; value: { valor: SimNao; tipo?: "" | "Natural" | "Artificial" }; onChange: (v: any) => void; tipo?: boolean }) {
  return <section className="rounded-xl border border-[#DDE3EC] bg-white p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">{titulo}</h3><SimNao value={value.valor} onChange={(v) => onChange({ ...value, valor: v, ...(v !== "Sim" && tipo ? { tipo: "" } : {}) })} /></div>{tipo && value.valor === "Sim" && <label className="mt-4 block border-t border-[#EEF1F5] pt-4"><span className={labelCls}>Tipo</span><select className={inputCls} value={value.tipo || ""} onChange={(e) => onChange({ ...value, tipo: e.target.value })}><option value="">Selecione...</option><option value="Natural">Natural</option><option value="Artificial">Artificial</option></select></label>}</section>;
}

function ValoresPrefeitura({ convenio }: { convenio: Convenio }) {
  const [dados, setDados] = useState<any>(null);
  const [nome, setNome] = useState("1. Atendimento funerário padrão");
  const [vigencia, setVigencia] = useState(hoje());
  const [itens, setItens] = useState<ItemPacote[]>([]);
  const [precos, setPrecos] = useState({ TRANSLADO_KM: "", TANATOPRAXIA: "" });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const d = await api("packages_list", { codigo: convenio.codigo });
      setDados(d || {});
      if (d?.vigente?.nome) setNome(d.vigente.nome);
      setItens(Array.isArray(d?.vigente?.itens) ? d.vigente.itens.map((i: any) => ({ categoria: String(i.categoria), produto_id: Number(i.produto_id), produto_nome: String(i.produto_nome || ""), valor_item: decBR(i.valor_item) })) : []);
      setPrecos({ TRANSLADO_KM: decBR(d?.precos_avulsos?.TRANSLADO_KM), TANATOPRAXIA: decBR(d?.precos_avulsos?.TANATOPRAXIA) });
    } catch (e: any) { setErro(e?.message || "Não foi possível carregar os valores."); }
    finally { setLoading(false); }
  }, [convenio.codigo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const total = itens.reduce((s, i) => s + num(i.valor_item), 0);
  const invalido = itens.length === 0 || itens.some((i) => !i.categoria || !i.produto_id || num(i.valor_item) <= 0);

  const salvar = async () => {
    if (invalido || salvando) return;
    setSalvando(true); setErro(""); setMsg("");
    try {
      await api("package_save", { codigo: convenio.codigo, nome, vigente_desde: vigencia, itens: itens.map((i) => ({ categoria: i.categoria, produto_id: i.produto_id, valor_item: num(i.valor_item) })) }, "POST");
      for (const chave of ["TRANSLADO_KM", "TANATOPRAXIA"] as const) if (precos[chave] !== "") await api("rule_save", { codigo: convenio.codigo, chave, valor: num(precos[chave]), vigente_desde: vigencia }, "POST");
      setMsg(`Nova versão salva com vigência em ${dataBR(vigencia)}.`); await carregar();
    } catch (e: any) { setErro(e?.message || "Não foi possível salvar."); }
    finally { setSalvando(false); }
  };

  if (loading) return <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">Carregando valores...</div>;

  return <>
    {erro && <Alerta tipo="erro">{erro}</Alerta>}{msg && <Alerta tipo="ok">{msg}</Alerta>}
    <div className="mb-4 flex flex-wrap justify-end gap-2"><Botao onClick={() => { setNome("Novo pacote"); setVigencia(hoje()); setItens([]); }}>+ Criar pacote</Botao><Botao onClick={() => void carregar()}>Descartar</Botao><Botao primario disabled={invalido || salvando} onClick={() => void salvar()}>{salvando ? "Salvando..." : "Salvar nova versão"}</Botao></div>
    <section className="rounded-xl border border-[#DDE3EC] bg-white p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]"><label><span className={labelCls}>Nome do pacote</span><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></label><label><span className={labelCls}>Vigente a partir de</span><input type="date" className={inputCls} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label></div>
      <div className="mt-4 hidden grid-cols-[170px_minmax(0,1fr)_145px_34px] gap-2 md:grid"><span className={labelCls}>Categoria</span><span className={labelCls}>Produto padrão incluso</span><span className={`${labelCls} text-right`}>Valor no contrato</span><span /></div>
      <div className="space-y-2">{itens.map((item, idx) => <div key={`${item.categoria}-${idx}`} className="grid gap-2 rounded-lg border border-[#EEF1F5] p-2 md:grid-cols-[170px_minmax(0,1fr)_145px_34px] md:items-center md:border-0 md:p-0">
        <select className={inputCls} value={item.categoria} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, categoria: e.target.value } : x))}><option value="">Selecione...</option>{categorias.map(([c, r]) => <option key={c} value={c}>{r}</option>)}</select>
        <ProdutoPicker value={{ produto_id: item.produto_id, nome: item.produto_nome }} onChange={(p) => setItens(itens.map((x, i) => i === idx ? { ...x, produto_id: p.id, produto_nome: p.nome } : x))} />
        <input inputMode="decimal" className={`${inputCls} text-right`} placeholder="0,00" value={item.valor_item} onChange={(e) => setItens(itens.map((x, i) => i === idx ? { ...x, valor_item: e.target.value } : x))} />
        <button type="button" className="h-10 rounded-lg border border-[#DDE3EC] bg-white font-bold text-red-600" onClick={() => setItens(itens.filter((_, i) => i !== idx))}>×</button>
      </div>)}</div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><Botao onClick={() => setItens([...itens, { categoria: "", produto_id: 0, produto_nome: "", valor_item: "" }])}>+ Adicionar item</Botao><p className="mt-3 max-w-2xl text-xs leading-5 text-[#6B7488]">Troca de modelo: diferença = preço escolhido − valor do item no contrato. Item fora do pacote vai inteiro para a Dif.Prf.</p></div><div className="text-right"><div className={labelCls}>Valor do pacote = soma dos itens</div><div className="text-3xl font-extrabold">{brl(total)}</div></div></div>
    </section>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-[#DDE3EC] bg-white p-5"><h2 className="mb-4 text-lg font-extrabold">Serviços com preço de contrato</h2><div className="mb-3 flex items-center gap-3"><div className="flex-1"><b>2. Translado</b><div className="text-xs text-[#6B7488]">por km · sem limite</div></div><input inputMode="decimal" className={`${inputCls} w-36 text-right`} value={precos.TRANSLADO_KM} onChange={(e) => setPrecos({ ...precos, TRANSLADO_KM: e.target.value })} /></div><div className="mb-3 flex items-center gap-3"><div className="flex-1"><b>3. Tanatopraxia</b><div className="text-xs text-[#6B7488]">por atendimento</div></div><input inputMode="decimal" className={`${inputCls} w-36 text-right`} value={precos.TANATOPRAXIA} onChange={(e) => setPrecos({ ...precos, TANATOPRAXIA: e.target.value })} /></div><p className="text-xs leading-5 text-[#6B7488]">Avançada e embalsamamento: a família paga a diferença sobre a tanatopraxia autorizada.</p></section>
      <section className="rounded-xl border border-[#DDE3EC] bg-white p-5"><h2 className="mb-4 text-lg font-extrabold">Versões</h2>{(dados?.versoes || []).length === 0 && <div className="text-sm text-[#6B7488]">Nenhuma versão cadastrada.</div>}{(dados?.versoes || []).map((v: any) => <div key={v.id} className="flex justify-between gap-3 border-b border-[#EEF1F5] py-2 text-sm last:border-b-0"><span><b>{dataBR(v.vigente_desde)}</b> · {brl(v.valor)}{v.id === dados?.vigente?.id ? " — vigente" : v.vigente_desde > hoje() ? " — agendada" : ""}</span><span className="truncate text-xs text-[#6B7488]">{v.nome}</span></div>)}</section>
    </div>
  </>;
}

function ValoresPlano({ convenio }: { convenio: Convenio }) {
  const [vigencia, setVigencia] = useState(hoje());
  const [v, setV] = useState({ TETO_URNA: "", TRANSLADO_KM_COBERTO: "", ilimitado: false, TANATOPRAXIA_COBERTA: "0" });
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const d = await api("rules_list", { codigo: convenio.codigo });
      const m: Record<string, any> = {}; (d?.vigentes || []).forEach((x: any) => (m[x.chave] = x));
      setV({ TETO_URNA: decBR(m.TETO_URNA?.valor), TRANSLADO_KM_COBERTO: m.TRANSLADO_KM_COBERTO?.valor == null ? "" : String(m.TRANSLADO_KM_COBERTO.valor), ilimitado: !!m.TRANSLADO_KM_COBERTO && m.TRANSLADO_KM_COBERTO.valor === null, TANATOPRAXIA_COBERTA: String(Number(m.TANATOPRAXIA_COBERTA?.valor || 0)) });
      setHistorico(Array.isArray(d?.historico) ? d.historico : []);
    } catch (e: any) { setErro(e?.message || "Não foi possível carregar o plano."); }
    finally { setLoading(false); }
  }, [convenio.codigo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    setSalvando(true); setErro(""); setMsg("");
    try {
      await api("rule_save", { codigo: convenio.codigo, chave: "TETO_URNA", valor: num(v.TETO_URNA), vigente_desde: vigencia }, "POST");
      await api("rule_save", { codigo: convenio.codigo, chave: "TRANSLADO_KM_COBERTO", valor: v.ilimitado ? "ilimitado" : num(v.TRANSLADO_KM_COBERTO), vigente_desde: vigencia }, "POST");
      await api("rule_save", { codigo: convenio.codigo, chave: "TANATOPRAXIA_COBERTA", valor: Number(v.TANATOPRAXIA_COBERTA), vigente_desde: vigencia }, "POST");
      setMsg(`Nova versão salva para ${dataBR(vigencia)}.`); await carregar();
    } catch (e: any) { setErro(e?.message || "Não foi possível salvar."); }
    finally { setSalvando(false); }
  };

  if (loading) return <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">Carregando plano...</div>;

  return <>{erro && <Alerta tipo="erro">{erro}</Alerta>}{msg && <Alerta tipo="ok">{msg}</Alerta>}<div className="mb-4 flex justify-end"><Botao primario disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando..." : "Salvar nova versão"}</Botao></div><section className="rounded-xl border border-[#DDE3EC] bg-white p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label><span className={labelCls}>Vigente a partir de</span><input type="date" className={inputCls} value={vigencia} onChange={(e) => setVigencia(e.target.value)} /></label><label><span className={labelCls}>Teto da urna</span><input inputMode="decimal" className={inputCls} value={v.TETO_URNA} onChange={(e) => setV({ ...v, TETO_URNA: e.target.value })} /></label><div><span className={labelCls}>Km translado coberto</span><div className="flex gap-2"><input inputMode="decimal" className={inputCls} disabled={v.ilimitado} value={v.TRANSLADO_KM_COBERTO} onChange={(e) => setV({ ...v, TRANSLADO_KM_COBERTO: e.target.value })} /><label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={v.ilimitado} onChange={(e) => setV({ ...v, ilimitado: e.target.checked })} />ilimitado</label></div></div><label><span className={labelCls}>Tanatopraxia coberta</span><select className={inputCls} value={v.TANATOPRAXIA_COBERTA} onChange={(e) => setV({ ...v, TANATOPRAXIA_COBERTA: e.target.value })}><option value="0">Não</option><option value="1">Sim</option></select></label></div></section><section className="mt-4 rounded-xl border border-[#DDE3EC] bg-white p-5"><h2 className="mb-4 text-lg font-extrabold">Histórico</h2>{historico.length === 0 && <div className="text-sm text-[#6B7488]">Nenhuma versão cadastrada.</div>}{historico.map((h: any) => <div key={h.id} className="grid gap-2 border-b border-[#EEF1F5] py-2 text-sm last:border-0 md:grid-cols-[180px_150px_1fr]"><b>{h.chave}</b><span>{dataBR(h.vigente_desde)}</span><span>{h.valor === null ? "Ilimitado" : h.chave === "TETO_URNA" ? brl(h.valor) : String(h.valor)}</span></div>)}</section></>;
}

function Configuracao({ form, setForm, onSalvo }: { form: Convenio; setForm: React.Dispatch<React.SetStateAction<Convenio>>; onSalvo: (c: Convenio, msg: string) => void }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const salvarCadastro = async () => {
    if (!form.nome.trim()) { setErro("Informe o nome do convênio."); return; }
    setSalvando(true); setErro(""); setMsg("");
    try {
      const d = await api("save", { id: form.id, nome: form.nome, ativo: form.ativo, ordem: form.ordem, observacao: form.observacao, versao: form.versao, regras: form.regras }, "POST");
      const c = normalizeConvenio(d); setForm(c); setMsg("Cadastro e coberturas salvos."); onSalvo(c, "Cadastro e coberturas salvos.");
    } catch (e: any) { setErro(e?.message || "Não foi possível salvar."); }
    finally { setSalvando(false); }
  };

  const salvarOS = async () => {
    if (!form.id || !form.tipo) return;
    setSalvando(true); setErro(""); setMsg("");
    try {
      const d = await api("os_define", { id: form.id, tipo: form.tipo, codigo_numero: form.codigo_numero, aditivos: form.aditivos_permitidos }, "POST");
      const c = normalizeConvenio(d); setForm(c); setMsg("Dados da OS salvos."); onSalvo(c, "Dados da OS salvos.");
    } catch (e: any) { setErro(e?.message || "Não foi possível salvar os dados da OS."); }
    finally { setSalvando(false); }
  };

  const updateProd = (key: "urna" | "roupa" | "invol" | "veu" | "cordao", v: ProdutoRegra) => setForm((f) => ({ ...f, regras: { ...f.regras, [key]: v } }));

  return <div className="space-y-4">{erro && <Alerta tipo="erro">{erro}</Alerta>}{msg && <Alerta tipo="ok">{msg}</Alerta>}<section className="rounded-xl border border-[#DDE3EC] bg-white p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Cadastro do convênio</h2><p className="text-xs text-[#6B7488]">Nome, status, observação e coberturas.</p></div><Botao primario disabled={salvando || !form.nome.trim()} onClick={() => void salvarCadastro()}>{salvando ? "Salvando..." : "Salvar cadastro e coberturas"}</Botao></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_150px]"><label><span className={labelCls}>Nome</span><input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label><label><span className={labelCls}>Ordem</span><input type="number" className={inputCls} value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 0 })} /></label><label><span className={labelCls}>Status</span><select className={inputCls} value={form.ativo ? "1" : "0"} onChange={(e) => setForm({ ...form, ativo: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></select></label></div><label className="mt-3 block"><span className={labelCls}>Observação</span><textarea className={inputCls} rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></label></section>
  <section className="rounded-xl border border-[#DDE3EC] bg-white p-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">Como entra na OS</h2><p className="text-xs text-[#6B7488]">Depois de definido, o tipo fica travado.</p></div><Botao primario disabled={salvando || !form.id || !form.tipo} onClick={() => void salvarOS()}>Salvar dados da OS</Botao></div><div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]"><label><span className={labelCls}>Tipo</span><select className={inputCls} value={form.tipo} disabled={!!form.codigo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoOS })}><option value="">Não definido</option><option value="PARTICULAR">Particular</option><option value="ASSOCIADO">Plano de associado</option><option value="PREFEITURA">Prefeitura</option></select></label><div>{form.tipo === "PREFEITURA" && <label><span className={labelCls}>Código no número da OS (3 letras)</span><input className={inputCls} maxLength={3} value={form.codigo_numero} onChange={(e) => setForm({ ...form, codigo_numero: e.target.value.replace(/[^A-Za-z]/g, "") })} placeholder="Bar" /></label>}{form.tipo === "ASSOCIADO" && <div><span className={labelCls}>Aditivos possíveis</span><div className="flex flex-wrap gap-4 text-sm font-semibold">{["TRANSLADO", "TANATOPRAXIA"].map((a) => <label key={a}><input type="checkbox" className="mr-1" checked={form.aditivos_permitidos.includes(a)} onChange={(e) => setForm({ ...form, aditivos_permitidos: e.target.checked ? [...form.aditivos_permitidos, a] : form.aditivos_permitidos.filter((x) => x !== a) })} />{a === "TRANSLADO" ? "Translado" : "Tanatopraxia"}</label>)}</div></div>}{form.codigo && <div className="mt-2 text-xs text-[#6B7488]">Código interno: <b>{form.codigo}</b></div>}</div></div></section>
  <div><h2 className="mb-2 text-lg font-extrabold">Itens e coberturas</h2><div className="grid gap-4 lg:grid-cols-2"><RegraProduto titulo="Urna" value={form.regras.urna} onChange={(v) => updateProd("urna", v)} /><RegraProduto titulo="Roupa" value={form.regras.roupa} onChange={(v) => updateProd("roupa", v)} /><RegraProduto titulo="Invólucro" value={form.regras.invol} onChange={(v) => updateProd("invol", v)} /><RegraProduto titulo="Véu" value={form.regras.veu} onChange={(v) => updateProd("veu", v)} /><RegraProduto titulo="Cordão" value={form.regras.cordao} onChange={(v) => updateProd("cordao", v)} /><RegraProduto titulo="Coroa de flores" value={form.regras.coroa_flores} tipo onChange={(v) => setForm({ ...form, regras: { ...form.regras, coroa_flores: v } })} /><RegraBool titulo="Kit lanche" value={form.regras.kit_lanche} onChange={(v) => setForm({ ...form, regras: { ...form.regras, kit_lanche: v } })} /><RegraBool titulo="Assistência" value={form.regras.assistencia} onChange={(v) => setForm({ ...form, regras: { ...form.regras, assistencia: v } })} /><RegraBool titulo="Tanatopraxia" value={form.regras.tanato} onChange={(v) => setForm({ ...form, regras: { ...form.regras, tanato: v } })} /><RegraBool titulo="Ornamentação" value={form.regras.ornamentacao} tipo onChange={(v) => setForm({ ...form, regras: { ...form.regras, ornamentacao: v } })} /><RegraBool titulo="Realiza velório" value={form.regras.realiza_velorio} onChange={(v) => setForm({ ...form, regras: { ...form.regras, realiza_velorio: v } })} /><RegraBool titulo="Realiza sepultamento" value={form.regras.realiza_sepultamento} onChange={(v) => setForm({ ...form, regras: { ...form.regras, realiza_sepultamento: v } })} /></div></div>
  </div>;
}

export default function ConveniosPage() {
  const [lista, setLista] = useState<Convenio[]>([]);
  const [form, setForm] = useState<Convenio>(convenioNovo());
  const [aba, setAba] = useState<"valores" | "config">("valores");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async (preferirId?: number) => {
    setLoading(true); setErro("");
    try {
      const d = await api("list", { include_inactive: 1 });
      const rows = Array.isArray(d) ? d.map(normalizeConvenio) : [];
      setLista(rows);
      const alvo = (preferirId && rows.find((x) => x.id === preferirId)) || rows.find((x) => x.id === form.id) || rows.find((x) => x.tipo === "PREFEITURA" && x.ativo) || rows.find((x) => x.tipo === "ASSOCIADO" && x.ativo) || rows[0];
      setForm(alvo || convenioNovo());
    } catch (e: any) { setErro(e?.message || "Não foi possível carregar os convênios."); }
    finally { setLoading(false); }
  }, [form.id]);

  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const prefeituras = lista.filter((c) => c.tipo === "PREFEITURA");
  const planos = lista.filter((c) => c.tipo === "ASSOCIADO");
  const outros = lista.filter((c) => !["PREFEITURA", "ASSOCIADO"].includes(c.tipo));
  const selecionar = (c: Convenio) => { setForm(c); setAba(c.tipo && c.tipo !== "PARTICULAR" ? "valores" : "config"); setErro(""); setMsg(""); };

  return <main className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-6"><div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="text-sm text-[#6B7488]">Financeiro › Rotina de valores e regras dos convênios{form.codigo ? ` · código ${form.tipo === "PREFEITURA" ? `Prf.${form.codigo_numero || form.codigo}` : form.codigo}` : ""}</div><h1 className="text-2xl font-extrabold">Convênios{form.id ? ` · ${form.nome}` : ""}</h1></div><div className="flex flex-wrap gap-2"><a href="/os/financeiro" className="rounded-lg border border-[#DDE3EC] bg-white px-4 py-2.5 text-sm font-bold">Voltar ao financeiro</a><Botao onClick={() => { setForm(convenioNovo()); setAba("config"); setMsg(""); setErro(""); }}>+ Novo convênio</Botao></div></div>
    {erro && <Alerta tipo="erro">{erro}</Alerta>}{msg && <Alerta tipo="ok">{msg}</Alerta>}
    {loading ? <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">Carregando...</div> : <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-[#DDE3EC] bg-white p-4 lg:sticky lg:top-4 lg:self-start">
        <div className={labelCls}>Prefeituras</div><div className="mb-5 space-y-1">{prefeituras.map((c) => <button key={c.id} type="button" onClick={() => selecionar(c)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold ${form.id === c.id ? "border-l-4 border-[#00AEEC] bg-[#E7F4FB]" : "hover:bg-[#F4F6F9]"}`}>Prefeitura de {c.nome.replace(/^Prefeitura( Municipal)?( de| da| do)?\s+/i, "")}</button>)}</div>
        <div className={labelCls}>Planos de associado</div><div className="mb-5 space-y-1">{planos.map((c) => <button key={c.id} type="button" onClick={() => selecionar(c)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold ${form.id === c.id ? "border-l-4 border-[#00AEEC] bg-[#E7F4FB]" : "hover:bg-[#F4F6F9]"}`}>{c.nome}</button>)}</div>
        <div className={labelCls}>Sem tipo / outros</div><div className="space-y-1">{outros.map((c) => <button key={c.id} type="button" onClick={() => selecionar(c)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold ${form.id === c.id ? "border-l-4 border-[#00AEEC] bg-[#E7F4FB]" : "hover:bg-[#F4F6F9]"}`}>{c.nome}</button>)}</div>
      </aside>
      <div className="min-w-0"><div className="mb-4 flex flex-wrap gap-2"><button type="button" disabled={!form.id || !form.tipo || form.tipo === "PARTICULAR"} onClick={() => setAba("valores")} className={`rounded-lg px-4 py-2 text-sm font-bold ${aba === "valores" ? "bg-[#313C55] text-white" : "border border-[#DDE3EC] bg-white"} disabled:opacity-40`}>Valores e versões</button><button type="button" onClick={() => setAba("config")} className={`rounded-lg px-4 py-2 text-sm font-bold ${aba === "config" ? "bg-[#313C55] text-white" : "border border-[#DDE3EC] bg-white"}`}>Cadastro e coberturas</button></div>
        {aba === "config" && <Configuracao form={form} setForm={setForm} onSalvo={async (c, m) => { setMsg(m); await carregar(c.id); }} />}
        {aba === "valores" && !form.id && <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">Salve o convênio primeiro.</div>}
        {aba === "valores" && form.id > 0 && !form.tipo && <div className="rounded-xl border border-[#F2CB3F] bg-[#FFF8E1] p-4 text-sm">Defina como este convênio entra na OS na aba <b>Cadastro e coberturas</b>.</div>}
        {aba === "valores" && form.tipo === "PARTICULAR" && <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">Particular não possui pacote de Prefeitura nem regras de Plano Associado.</div>}
        {aba === "valores" && form.tipo === "PREFEITURA" && form.codigo && <ValoresPrefeitura key={`${form.id}-${form.codigo}`} convenio={form} />}
        {aba === "valores" && form.tipo === "ASSOCIADO" && form.codigo && <ValoresPlano key={`${form.id}-${form.codigo}`} convenio={form} />}
      </div>
    </div>}
  </div></main>;
}
