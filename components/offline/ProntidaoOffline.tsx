"use client";

/**
 * components/offline/ProntidaoOffline.tsx (16/11/2026)
 *
 * Painel "Pronto para offline" da tela de Atendimentos:
 * - selo verde / amarelo / vermelho dizendo se o aparelho aguenta ficar sem internet;
 * - quantos registros estão aguardando envio e a hora da última sincronização;
 * - lista do que está na fila, com o motivo quando o servidor recusou;
 * - "Sincronizar agora" e, para etapa recusada, "Dispensar" (com confirmação).
 *
 * Só lê o aparelho (lib/offline/prontidao.ts). Enviar continua com a fila de sempre.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { dismissOfflineAction } from "@/lib/offline/actions";
import { avaliarProntidao, haQuanto, type NivelProntidao, type Pendencia, type Prontidao } from "@/lib/offline/prontidao";
import { pedirArmazenamentoPersistente } from "@/lib/offline/storage";
import { syncOperationalQueue } from "@/lib/offline/sync-engine";

const REAVALIAR_MS = 30 * 1000;

const COR: Record<NivelProntidao, { ponto: string; caixa: string; titulo: string }> = {
  ok: {
    ponto: "bg-[#2E8B57]",
    caixa: "border-[#CFE8D8] bg-[#F1FAF4] dark:border-[#2E5A41] dark:bg-[#17261E]",
    titulo: "Pronto para trabalhar sem internet",
  },
  aviso: {
    ponto: "bg-[#E0A800]",
    caixa: "border-[#F2DFA6] bg-[#FFF9E8] dark:border-[#5C4B1A] dark:bg-[#2A2414]",
    titulo: "Atenção antes de sair",
  },
  erro: {
    ponto: "bg-[#C8402F]",
    caixa: "border-[#F1C7C0] bg-[#FDF2F0] dark:border-[#6A2C24] dark:bg-[#2C1714]",
    titulo: "Não está pronto para ficar sem internet",
  },
};

const SITUACAO: Record<Pendencia["situacao"], string> = {
  aguardando: "Aguardando envio",
  enviando: "Enviando…",
  atencao: "Recusado pelo servidor",
  login: "Aguardando login",
};

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Icone({ nivel }: { nivel: NivelProntidao }) {
  if (nivel === "ok") {
    return (
      <svg viewBox="0 0 24 24" className="mt-0.5 size-[18px] shrink-0 text-[#2E8B57]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={`mt-0.5 size-[18px] shrink-0 ${nivel === "erro" ? "text-[#C8402F]" : "text-[#B98900]"}`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export default function ProntidaoOffline({ onSincronizar }: { onSincronizar?: () => Promise<void> | void }) {
  const [estado, setEstado] = useState<Prontidao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const avaliandoRef = useRef(false);
  const montadoRef = useRef(true);

  const avaliar = useCallback(async () => {
    if (avaliandoRef.current) return;
    avaliandoRef.current = true;
    try {
      const r = await avaliarProntidao();
      if (montadoRef.current) setEstado(r);
    } catch (e) {
      console.warn("[OFFLINE] Não foi possível avaliar o modo offline.", e);
    } finally {
      avaliandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    montadoRef.current = true;
    void pedirArmazenamentoPersistente().finally(() => void avaliar());

    const id = window.setInterval(() => void avaliar(), REAVALIAR_MS);
    const reavaliar = () => void avaliar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void avaliar();
    };
    window.addEventListener("online", reavaliar);
    window.addEventListener("offline", reavaliar);
    window.addEventListener("pai-offline-sync-complete", reavaliar);
    document.addEventListener("visibilitychange", aoVoltar);
    navigator.serviceWorker?.addEventListener?.("controllerchange", reavaliar);

    return () => {
      montadoRef.current = false;
      window.clearInterval(id);
      window.removeEventListener("online", reavaliar);
      window.removeEventListener("offline", reavaliar);
      window.removeEventListener("pai-offline-sync-complete", reavaliar);
      document.removeEventListener("visibilitychange", aoVoltar);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", reavaliar);
    };
  }, [avaliar]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setMsg(null);
    try {
      if (onSincronizar) await onSincronizar();
      else await syncOperationalQueue();
      setMsg("Sincronização concluída.");
    } catch (e: any) {
      setMsg(e?.message || "Não foi possível sincronizar agora.");
    } finally {
      setSincronizando(false);
      void avaliar();
    }
  }, [onSincronizar, avaliar]);

  const dispensar = useCallback(
    async (p: Pendencia) => {
      if (!p.acao) return;
      if (confirmar !== p.chave) {
        setConfirmar(p.chave);
        return;
      }
      setConfirmar(null);
      try {
        await dismissOfflineAction(p.acao);
        window.dispatchEvent(new CustomEvent("pai-offline-sync-complete", { detail: null }));
        setMsg("Registro dispensado neste aparelho.");
      } catch (e: any) {
        setMsg(e?.message || "Não foi possível dispensar.");
      } finally {
        void avaliar();
      }
    },
    [confirmar, avaliar],
  );

  if (!estado) return null;

  const cor = COR[estado.nivel];
  const partes: string[] = [estado.online ? "Com internet" : "Sem internet"];
  if (estado.aguardando > 0) partes.push(`${estado.aguardando} aguardando envio`);
  if (estado.atencao > 0) partes.push(`${estado.atencao} recusado${estado.atencao > 1 ? "s" : ""}`);
  if (estado.ultimaSincronizacao) partes.push(`última sincronização ${haQuanto(estado.ultimaSincronizacao)}`);

  return (
    <section className={`mb-4 rounded-2xl border px-4 py-3 sm:mb-5 ${cor.caixa}`} aria-live="polite">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={aberto}
      >
        <span className={`size-3 shrink-0 rounded-full ${cor.ponto}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-tight">{cor.titulo}</span>
          <span className="mt-0.5 block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{partes.join(" · ")}</span>
        </span>
        <span className="shrink-0 text-[13px] font-bold text-[#3D6A99] dark:text-[#8FB4DA]">{aberto ? "Fechar" : "Detalhes"}</span>
      </button>

      {aberto && (
        <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
          <ul className="space-y-2">
            {estado.itens.map((it) => (
              <li key={it.id} className="flex gap-2.5">
                <Icone nivel={it.nivel} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold leading-snug">{it.titulo}</span>
                  {it.detalhe && <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{it.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>

          {estado.pendencias.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">Fila deste aparelho</p>
              <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-[#1E2638]">
                {estado.pendencias.map((p) => (
                  <li key={p.chave} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold leading-snug">
                        {p.titulo}
                        {p.falecido ? <span className="font-normal text-[#5B6478] dark:text-[#AEB9CF]"> · {p.falecido}</span> : null}
                      </span>
                      <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                        {SITUACAO[p.situacao]}
                        {p.quando ? ` · ${horaCurta(p.quando)}` : ""}
                      </span>
                      {p.erro && (p.situacao === "atencao" || p.situacao === "login") && (
                        <span className="mt-0.5 block text-[12.5px] text-[#B23A2B] dark:text-[#F0A397]">Motivo: {p.erro}</span>
                      )}
                    </span>
                    {p.acao && (
                      <button
                        type="button"
                        onClick={() => void dispensar(p)}
                        className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold ${
                          confirmar === p.chave
                            ? "border-[#C8402F] bg-[#C8402F] text-white"
                            : "border-black/10 text-[#313C55] dark:border-white/15 dark:text-white"
                        }`}
                      >
                        {confirmar === p.chave ? "Confirmar dispensa" : "Dispensar"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {estado.atencao > 0 && (
                <p className="mt-2 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                  Registro recusado não foi lançado no servidor. Confira o atendimento com a gestão; dispensar só tira o aviso deste aparelho.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void sincronizar()}
              disabled={!estado.online || sincronizando}
              className="rounded-xl bg-[#313C55] px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50 dark:bg-[#3D6A99]"
            >
              {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <button
              type="button"
              onClick={() => void avaliar()}
              className="rounded-xl border border-black/10 px-4 py-2.5 text-[14px] font-bold dark:border-white/15"
            >
              Conferir de novo
            </button>
            {estado.itens.some((i) => i.id === "fila" && i.nivel === "erro") && (
              <a href="/login" className="rounded-xl border border-[#C8402F] px-4 py-2.5 text-[14px] font-bold text-[#C8402F]">
                Entrar de novo
              </a>
            )}
          </div>
          {msg && <p className="mt-2 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{msg}</p>}
        </div>
      )}
    </section>
  );
}
