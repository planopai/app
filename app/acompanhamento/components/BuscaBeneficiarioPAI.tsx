"use client";
import React, { useEffect, useState } from "react";

const URL_API = "https://api.planoassistencialintegrado.com.br/os_principal.php";
export type ContratoPAI = { id: number; contrato: string; titular: string; plano: string; grupo: string; situacao: string; tanato: boolean };
export type PessoaPAI = { nome: string; data_nascimento: string; tipo: string };
export const dataISO = (s: string) => {
  const x = String(s || "").trim();
  const iso = x.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = x.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : "";
};
async function consultar(flag: string, args: Record<string,string>) {
  const url = new URL(URL_API);
  url.searchParams.set(flag, "1");
  Object.entries(args).forEach(([k,v]) => url.searchParams.set(k,v));
  const resp = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
  const json = await resp.json();
  if (!resp.ok || json?.sucesso === false || json?.erro) throw new Error(json?.msg || "Falha na consulta de Associados.");
  return json.dados;
}
export default function BuscaBeneficiarioPAI({ grupo, disabled, contratoSelecionado, onContrato } : {
  grupo: string; disabled?: boolean; contratoSelecionado?: ContratoPAI | null;
  onContrato: (contrato: ContratoPAI | null, pessoas: PessoaPAI[]) => void;
}) {
  const [termo, setTermo] = useState("");
  const [contratos, setContratos] = useState<ContratoPAI[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [emCache, setEmCache] = useState(false);
  useEffect(() => { setTermo(""); setContratos([]); setErro(""); }, [grupo]);
  const buscar = async () => {
    const texto = termo.trim();
    if (texto.length < 3 || carregando) return;
    setErro("");setCarregando(true);setContratos([]);
    try {
      const r = await consultar("pai_assoc_buscar", { busca: texto });
      const lista = (Array.isArray(r?.contratos) ? r.contratos : []).filter((c: ContratoPAI) => c.grupo === grupo);
      setContratos(lista); setEmCache(!!r?.catalog_cached);
      if (!lista.length) setErro("Nenhum contrato encontrado neste plano. Confira os dados do titular ou o número do contrato.");
    } catch(e:any) {setErro(String(e?.message || "Consulta indisponível."));}
    finally {setCarregando(false);}
  };
  const escolher = async (c: ContratoPAI) => {
    setErro("");setCarregando(true);
    try {
      const r = await consultar("pai_assoc_beneficiarios", { contrato: c.contrato });
      const pessoas = (Array.isArray(r?.beneficiarios) ? r.beneficiarios : [])
        .filter((p:PessoaPAI) => p && p.nome && ["T","D","A","TITULAR","DEPENDENTE","AGREGADO"].includes(String(p.tipo).toUpperCase()));
      if (!pessoas.length) throw new Error("Contrato localizado, mas a API não retornou titulares, dependentes ou agregados.");
      onContrato((r?.contrato as ContratoPAI) || c,pessoas);
      setContratos([]);
    } catch(e:any) {setErro(String(e?.message || "Não foi possível consultar os beneficiários."));}
    finally {setCarregando(false);}
  };
  return <div className="mt-3 rounded-xl border border-slate-300 p-3 dark:border-slate-600 sm:col-span-2">
    <label htmlFor="pai-contrato-busca" className="mb-1 block text-sm font-semibold">Localizar contrato do titular</label>
    <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">Busca exata por número do contrato, CPF ou nome completo do titular. Não mostra aproximações.</p>
    {contratoSelecionado && <div className="mb-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <b>Contrato selecionado: {contratoSelecionado.contrato}</b> · {contratoSelecionado.titular} · {contratoSelecionado.plano}<br/>
      Tanatopraxia: {contratoSelecionado.tanato ? "Disponível pelo aditivo" : "Tag não identificada"}
      <button type="button" disabled={disabled||carregando} className="ml-2 font-semibold underline" onClick={() => {onContrato(null,[]);setContratos([]);}}>Trocar contrato</button>
    </div>}
    {!contratoSelecionado && <><div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <input id="pai-contrato-busca" className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900" placeholder="Contrato, CPF ou nome completo" value={termo} onChange={e=>setTermo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void buscar();}}} disabled={disabled||carregando}/>
      <button type="button" className="w-full shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-base font-bold text-white disabled:opacity-50 sm:w-auto" onClick={()=>void buscar()} disabled={disabled||carregando||termo.trim().length<3}>Buscar</button>
    </div>
    {emCache && <p className="mt-1 text-xs text-amber-700">A pesquisa pode usar catálogo com até 10 minutos de cache.</p>}
    {!!contratos.length && <div className="mt-2 max-h-52 overflow-y-auto" aria-label="Contratos encontrados">{contratos.map(c=><button key={c.id||c.contrato} type="button" onClick={()=>void escolher(c)} disabled={disabled||carregando} className="mb-1 block w-full rounded-lg border border-slate-300 p-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"><b>{c.contrato}</b> · {c.titular} · {c.plano} · {c.situacao}</button>)}</div>}
    </>}
    {carregando && <p className="mt-2 text-sm">Consultando…</p>}
    {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
  </div>;
}
