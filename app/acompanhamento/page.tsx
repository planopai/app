// PAGE INFO ITENS FIX V1 — NÃO INFERE TERCEIRO PELOS CAMPOS MARCADOS COMO NÃO
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrumacaoState,
  MateriaisState,
  Registro,
  Aviso,
} from "./components/types";
import {
  API,
  obrigatorios as obrigatoriosPadrao,
  steps as stepsPadrao,
  wizardStepIndexes as wizardStepIndexesPadrao,
  wizardStepTitles as wizardStepTitlesPadrao,
} from "./components/constants";
import {
  defaultArrumacao,
  defaultMateriais,
  jsonWith401,
  enviarRegistroPHP,
  capitalizeStatus,
  normalizarStatus,
  normalizeMateriaisState,
} from "./components/helpers";

import TabelaAtendimentos from "./components/TabelaAtendimentos";

import Wizard from "./components/Wizard";
import MateriaisModal from "./components/MateriaisModal";
import ArrumacaoModal from "./components/ArrumacaoModal";
import AcaoModal from "./components/AcaoModal";
import InfoModal from "./components/InfoModal";
import SignatureModal from "./components/SignatureModal";
import CompartilharModal from "./components/CompartilharModal";
import Modal from "./components/Modal";
import TelemetriaModal, {
  TipoTele,
  TelemetriaHandle,
} from "./components/TelemetriaModal";
import FotoAcaoModal, { FotoAcaoTipo } from "./components/FotoAcaoModal";

// ✅ modal de conferência antes do fase11
import MateriaisConferenciaModal, {
  MatCheckItem,
  MateriaisConferenciaResult,
} from "./components/MateriaisConferenciaModal";

type TipoAtendimento = "funerario" | "terceiro";

// ✅ endpoint da baixa automática (novo PHP independente)
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

// ✅ endpoint da baixa automática (novo PHP independente)
const URNA_SAIDA_API = `${ENDPOINT}/urna_saida.php`;

// ===== Helpers novos (fase05: URNA / ROUPA / INVOL / INSUMOS) =====
type BaixaTipo = "URNA" | "ROUPA" | "INVOL" | "CORDAO" | "VEU" | "INSUMOS";

function isSim(v: any): boolean {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "sim" || s === "s" || s === "1" || s === "true";
}

function isNao(v: any): boolean {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "não" || s === "nao" || s === "n" || s === "0" || s === "false";
}

function normNoAccLower(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isRoupaPropria(v: any): boolean {
  return normNoAccLower(v) === "roupa propria";
}

type InsumoItem = { produto_id: number; qtd: number };

function parseInsumosFromArrumacaoJson(
  raw: any,
): { deposito_nome: string; itens: InsumoItem[] } | null {
  try {
    if (!raw) return null;
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;

    const deposito_nome = String(
      obj.deposito_nome ?? obj.deposito ?? "",
    ).trim();
    const itensRaw = obj.itens ?? obj.items ?? null;
    if (!itensRaw) return null;

    let itens: InsumoItem[] = [];

    // ✅ formato array
    if (Array.isArray(itensRaw)) {
      itens = itensRaw
        .map((x: any) => ({
          produto_id: Number(x?.produto_id ?? 0) || 0,
          qtd: Math.max(1, Math.floor(Number(x?.qtd ?? 0) || 0)),
        }))
        .filter((x) => x.produto_id > 0 && x.qtd > 0);
    }

    // ✅ formato objeto/dict
    if (!Array.isArray(itensRaw) && typeof itensRaw === "object") {
      itens = Object.entries(itensRaw)
        .map(([k, v]: any) => {
          const pid =
            Number(v?.produto_id ?? 0) ||
            Number(String(k).match(/\d+/)?.[0] ?? 0) ||
            0;
          const qtd = Math.max(1, Math.floor(Number(v?.qtd ?? 0) || 0));
          const checked = v?.checked;
          if (
            checked === false ||
            checked === 0 ||
            checked === "0" ||
            checked === "false"
          )
            return null;
          return pid > 0 ? { produto_id: pid, qtd } : null;
        })
        .filter(Boolean) as InsumoItem[];
    }

    if (!itens.length) return null;
    return { deposito_nome, itens };
  } catch {
    return null;
  }
}


function normalizeRestrictIds(v: any): string[] | null {
  if (v == null || v === "") return null;

  let raw = v;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;

    try {
      const parsed = JSON.parse(s);
      raw = parsed;
    } catch {
      raw = s.split(",");
    }
  }

  if (!Array.isArray(raw)) return null;

  const ids = raw
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  return ids.length ? Array.from(new Set(ids)) : null;
}

function scopeHasAny(scopeIds: string[] | null, ids: string[]): boolean {
  if (!scopeIds) return true;
  return ids.some((id) => scopeIds.includes(id));
}

/* -------------------- utils sessão (IDs de terceiros) -------------------- */
function addTerceiroIdToSession(id: string | number | undefined | null) {
  try {
    if (id == null) return;
    const raw = sessionStorage.getItem("terceiro_ids");
    const arr: Array<string> = raw ? JSON.parse(raw) : [];
    const sid = String(id);
    if (!arr.includes(sid)) {
      arr.push(sid);
      sessionStorage.setItem("terceiro_ids", JSON.stringify(arr));
    }
  } catch { }
}

/* ----------- resolve tipo a partir de um registro existente ----------- */
function resolveTipoFromRegistro(r?: Registro | null): TipoAtendimento {
  if (!r) return "funerario";

  const tipoSalvo = String((r as any)?.tipo_atendimento ?? "")
    .trim()
    .toLowerCase();

  // Um atendimento só é "terceiro" quando isso estiver explicitamente
  // salvo no registro. Os campos Assistência, Tanatopraxia e Ornamentação
  // podem estar todos como "Não" em um atendimento funerário normal.
  return tipoSalvo === "terceiro" ? "terceiro" : "funerario";
}

/* -------------------- Config dinâmico por tipo -------------------- */
function getWizardConfig(tipo: TipoAtendimento) {
  if (tipo === "terceiro") {
    const wizardStepIndexes = [
      // Atendimento (nome + contato + dados do falecido/responsável)
      [0, 1, 27, 28, 29, 30, 31],

      // Velório (local velório + sala + velório online + data/hora início + data/hora fim)
      // 18 local_velorio | 32 sala_velorio | 33 velorio_online | 19 data início | 21 hora início | 20 data fim | 22 hora fim
      [18, 32, 33, 19, 21, 20, 22],

      // Sepultamento (local sepultamento)
      [17],
    ];

    const wizardStepTitles = ["Atendimento", "Velório", "Sepultamento"];
    const obrigatorios: string[] = [];
    return {
      wizardStepIndexes,
      wizardStepTitles,
      obrigatorios,
      steps: stepsPadrao,
    };
  }

  return {
    wizardStepIndexes: wizardStepIndexesPadrao as number[][],
    wizardStepTitles: wizardStepTitlesPadrao as string[],
    obrigatorios: obrigatoriosPadrao as string[],
    steps: stepsPadrao,
  };
}

/* -------------------- Mapas de telemetria -------------------- */
function mapFaseToTipo(fase: string): TipoTele | null {
  if (fase === "fase01") return "remocao";
  if (fase === "fase07") return "para_velorio";
  if (fase === "fase09") return "para_sepultamento";
  return null;
}

// "fase que PARA" a telemetria iniciada por:
const STOP_BY_START: Record<string, string> = {
  fase01: "fase02",
  fase07: "fase08",
  fase09: "fase10",
};

/* =======================================================================
   ✅ MODO OFFLINE (fila local + reenvio automático ao voltar a internet)
   ======================================================================= */
type OfflineQueueItem = {
  qid: string;
  createdAt: number;
  tries: number;
  lastError?: string;
  payload: any;
};

const OFFLINE_QUEUE_KEY = "acomp_offline_queue_v1";

function safeReadQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function safeWriteQueue(items: OfflineQueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch { }
}

function genQid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isOnlineNow() {
  if (typeof window === "undefined") return true;
  return navigator.onLine !== false;
}

function enqueueOffline(payload: any, errMsg?: string) {
  const items = safeReadQueue();
  items.push({
    qid: genQid(),
    createdAt: Date.now(),
    tries: 0,
    lastError: errMsg,
    payload,
  });
  safeWriteQueue(items);
  return items.length;
}

// ✅ tenta resolver nome do falecido
function resolveFalecidoNome(r: any): string {
  return String(
    r?.falecido ??
    r?.nome_falecido ??
    r?.falecido_nome ??
    r?.nome_do_falecido ??
    r?.nome ??
    "",
  ).trim();
}

/* =========================
   ✅ helpers DOM (Wizard inputs)
   (mantidos para campos comuns; URNA META não depende mais deles)
   ========================= */
function readDomValue(id: string): string {
  if (typeof document === "undefined") return "";
  const el = document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  return (el?.value ?? "").toString();
}

/* =========================================================
   ✅ NORMALIZAÇÃO FORTE DO STATUS (igual ao backend)
========================================================= */
function normalizeStatusCode(v: any): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";

  const low = raw.toLowerCase();
  if (low.startsWith("fase")) {
    const num = low.replace(/\D+/g, "");
    if (!num) return low;
    return `fase${num.padStart(2, "0")}`;
  }

  const noAcc = low.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = noAcc.trim();

  const map: Record<string, string> = {
    removendo: "fase01",
    "aguardando procedimento": "fase02",
    preparando: "fase03",
    "aguardando ornamentacao": "fase04",
    ornamentando: "fase05",
    "corpo pronto": "fase06",
    transportando: "fase07",
    "transportando obito p/velorio": "fase07",
    "transportando obito para velorio": "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "sepultamento concluido": "fase10",
    "material recolhido": "fase11",
  };

  if (map[key]) return map[key];

  const helper = normalizarStatus?.(raw);
  return helper ? String(helper) : raw;
}

function getNumeroFase(status: any): number {
  const normalizado = normalizeStatusCode(status);
  const m = String(normalizado || "").match(/^fase(\d+)$/i);
  return m ? Number(m[1]) || 0 : 0;
}

function obrigatoriedadeAtivaNoWizard({
  wizardEditing,
  wizardData,
  wizardIdx,
  registros,
}: {
  wizardEditing: boolean;
  wizardData: Registro;
  wizardIdx: number | null;
  registros: Registro[];
}): boolean {
  if (!wizardEditing) return false;

  const status =
    (wizardData as any)?.status ??
    (typeof wizardIdx === "number" ? (registros[wizardIdx] as any)?.status : "");

  return getNumeroFase(status) >= 2;
}

// ==============================
// ✅ Snapshot do registro original (para comparar no EDITAR)
// ==============================
type RoupaSnapshot = {
  roupa: string;
  roupa_produto_id: number;
  roupa_deposito_nome: string;
  roupa_codigo_barras: string;
  roupa_propria: number;
};

const ROUPA_SCOPE_IDS = [
  "roupa",
  "roupa_produto_id",
  "roupa_deposito_nome",
  "roupa_codigo_barras",
  "roupa_propria",
];

function scrubRoupaNoEditar(payload: any, original: RoupaSnapshot | null) {
  if (!original) return;

  const rNow = String(payload.roupa ?? "").trim();
  const rOrig = String(original.roupa ?? "").trim();

  const pidNow = Number(payload.roupa_produto_id ?? 0) || 0;
  const pidOrig = Number(original.roupa_produto_id ?? 0) || 0;

  const depNow = String(payload.roupa_deposito_nome ?? "").trim();
  const depOrig = String(original.roupa_deposito_nome ?? "").trim();

  const cbNow = String(payload.roupa_codigo_barras ?? "").trim();
  const cbOrig = String(original.roupa_codigo_barras ?? "").trim();

  const propNow = Number(payload.roupa_propria ?? 0) ? 1 : 0;
  const propOrig = Number(original.roupa_propria ?? 0) ? 1 : 0;

  const mudou =
    rNow !== rOrig ||
    pidNow !== pidOrig ||
    depNow !== depOrig ||
    cbNow !== cbOrig ||
    propNow !== propOrig;

  // ✅ se não mudou -> NÃO MANDA roupa nenhuma no payload do editar
  if (!mudou) {
    delete payload.roupa;
    delete payload.roupa_produto_id;
    delete payload.roupa_deposito_nome;
    delete payload.roupa_codigo_barras;
    delete payload.roupa_propria;
    return;
  }

  // ✅ mudou e virou ROUPA PRÓPRIA
  if (rNow && isRoupaPropria(rNow)) {
    payload.roupa = "ROUPA PRÓPRIA";
    payload.roupa_propria = 1;
    payload.roupa_produto_id = null;
    payload.roupa_deposito_nome = null;
    payload.roupa_codigo_barras = null;
    return;
  }

  // ✅ mudou e não é própria: exige combo completo (front safety)
  if (rNow) {
    const pid = Number(payload.roupa_produto_id ?? 0) || 0;
    const dep = String(payload.roupa_deposito_nome ?? "").trim();
    if (pid <= 0) {
      throw new Error(
        'Roupa: selecione uma roupa da lista (estoque) ou use "ROUPA PRÓPRIA".',
      );
    }
    if (!dep) {
      throw new Error(
        "Roupa: selecione o local de saída (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
      );
    }
  }
}

export default function AcompanhamentoPage() {
  // Tabela
  const [registros, setRegistros] = useState<Registro[]>([]);

  // Avisos
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [avisoMsg, setAvisoMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const avisoInputRef = useRef<HTMLInputElement>(null);

  // Tipo do cadastro atual
  const [tipoAtendimento, setTipoAtendimento] =
    useState<TipoAtendimento>("funerario");

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTitle, setWizardTitle] = useState("Novo Registro");
  const [wizardEditing, setWizardEditing] = useState(false);
  const [wizardIdx, setWizardIdx] = useState<number | null>(null);
  const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(
    null,
  );
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState<Registro>({});
  const [wizardMsg, setWizardMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  // ✅ snapshot do registro original (para não revalidar / não reenviar roupa no EDITAR)
  const wizardOriginalRoupaRef = useRef<RoupaSnapshot | null>(null);

  // selects
  const [assistenciaVal, setAssistenciaVal] = useState<string>("");
  const [tanatoVal, setTanatoVal] = useState<string>("");

  // Materiais
  const [materiaisOpen, setMateriaisOpen] = useState(false);
  const [materiais, setMateriais] =
    useState<MateriaisState>(defaultMateriais());

  // Arrumação
  const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
  const [arrumacao, setArrumacao] =
    useState<ArrumacaoState>(defaultArrumacao());

  // Ações (por ID)
  const [acaoOpen, setAcaoOpen] = useState(false);
  const [acaoId, setAcaoId] = useState<Registro["id"] | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [acaoSubmitting, setAcaoSubmitting] = useState(false);

  // Foto obrigatória antes de confirmar fase06/fase08
  const [fotoAcaoOpen, setFotoAcaoOpen] = useState(false);
  const [fotoAcaoId, setFotoAcaoId] = useState<Registro["id"] | null>(null);
  const [fotoAcaoFase, setFotoAcaoFase] = useState<string>("fase06");
  const [fotoAcaoTipo, setFotoAcaoTipo] = useState<FotoAcaoTipo | null>(null);

  // Conferência de materiais antes do fase11
  const [matCheckOpen, setMatCheckOpen] = useState(false);
  const [matCheckItens, setMatCheckItens] = useState<MatCheckItem[]>([]);
  const [matCheckReturnToAcao, setMatCheckReturnToAcao] = useState(false);

  // contexto da conferência
  const [matCheckRegistroId, setMatCheckRegistroId] = useState<
    Registro["id"] | null
  >(null);
  const [matCheckFalecidoNome, setMatCheckFalecidoNome] = useState<string>("");

  const [matCheckSaving, setMatCheckSaving] = useState(false);

  // Info
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoId, setInfoId] = useState<Registro["id"] | null>(null);

  // Compartilhar
  const [shareOpen, setShareOpen] = useState(false);
  const [shareId, setShareId] = useState<Registro["id"] | null>(null);

  // Assinatura
  const [signOpen, setSignOpen] = useState(false);
  const [signTipo, setSignTipo] = useState<"recebimento" | "requisicao">(
    "recebimento",
  );
  const [signIdx, setSignIdx] = useState<number | null>(null);

  // Modal: escolher tipo no novo registro
  const [chooseTipoOpen, setChooseTipoOpen] = useState(false);

  // Telemetria
  const teleRef = useRef<TelemetriaHandle>(null);
  const [teleOpen, setTeleOpen] = useState(false);
  const [teleFase, setTeleFase] = useState<string>("fase01");
  const [teleTipo, setTeleTipo] = useState<TipoTele>("remocao");
  const [teleRegistroId, setTeleRegistroId] = useState<Registro["id"] | null>(
    null,
  );

  const [teleActive, setTeleActive] = useState(false);
  const [teleStartFase, setTeleStartFase] = useState<string | null>(null);

  // ✅ refs para evitar estado atrasado no momento de encerrar a telemetria
  const teleActiveRef = useRef(false);
  const teleStartFaseRef = useRef<string | null>(null);
  const teleRegistroIdRef = useRef<Registro["id"] | null>(null);

  const definirTeleRegistroId = useCallback(
    (id: Registro["id"] | null | undefined) => {
      const normalized = id != null ? String(id) : null;
      teleRegistroIdRef.current = normalized;
      setTeleRegistroId(normalized);
    },
    [],
  );

  const marcarTeleAtiva = useCallback((fase: string) => {
    teleActiveRef.current = true;
    teleStartFaseRef.current = fase;
    setTeleActive(true);
    setTeleStartFase(fase);
  }, []);

  const limparTeleAtiva = useCallback(() => {
    teleActiveRef.current = false;
    teleStartFaseRef.current = null;
    setTeleActive(false);
    setTeleStartFase(null);
  }, []);


  /* -------------------- Config por tipo -------------------- */
  const {
    wizardStepIndexes: wizardStepIndexesForTipo,
    wizardStepTitles: wizardStepTitlesForTipo,
    obrigatorios: obrigatoriosBaseForTipo,
    steps: stepsForTipo,
  } = useMemo(() => getWizardConfig(tipoAtendimento), [tipoAtendimento]);

  const obrigatoriosForTipo = useMemo(() => {
    const ativo = obrigatoriedadeAtivaNoWizard({
      wizardEditing,
      wizardData,
      wizardIdx,
      registros,
    });

    return ativo ? obrigatoriosBaseForTipo : [];
  }, [
    obrigatoriosBaseForTipo,
    wizardEditing,
    wizardData,
    wizardIdx,
    registros,
  ]);

  /* ===========================
     ✅ OFFLINE: Flush da fila
     =========================== */
  const flushingRef = useRef(false);

  const fetchRegistros = useCallback(async () => {
    try {
      const r = await fetch(
        `${ENDPOINT}/informativo.php?listar=1&_nocache=${Date.now()}`,
        {
          cache: "no-store",
          credentials: "include",
        },
      );

      if (r.status === 401) return;

      const data = await r.json().catch(() => null);
      if (data?.need_login) return;

      const sane: Registro[] = Array.isArray(data)
        ? data.map((it: any) => ({
          ...it,
          id: it?.id != null ? String(it.id) : it.id,
          status: normalizarStatus(it?.status) ?? it?.status,

          // ✅ NOVOS DADOS DO FALECIDO / RESPONSÁVEL
          data_nascimento: String(it?.data_nascimento ?? ""),
          data_falecimento: String(it?.data_falecimento ?? ""),
          foto_falecido: String(it?.foto_falecido ?? ""),
          nome_responsavel: String(it?.nome_responsavel ?? ""),
          cpf_responsavel: String(it?.cpf_responsavel ?? ""),

          // ✅ VELÓRIO (sala + online)
          sala_velorio: String(it?.sala_velorio ?? ""),
          velorio_online: String(it?.velorio_online ?? ""),

          // ✅ URNA
          urna_deposito_nome: String(it?.urna_deposito_nome ?? ""),
          urna_produto_id: Number(it?.urna_produto_id ?? 0) || 0,
          urna_codigo_barras: String(it?.urna_codigo_barras ?? ""),

          // ✅ ROUPA
          roupa_deposito_nome: String(it?.roupa_deposito_nome ?? ""),
          roupa_produto_id: Number(it?.roupa_produto_id ?? 0) || 0,
          roupa_codigo_barras: String(it?.roupa_codigo_barras ?? ""),
          roupa_propria: Number(it?.roupa_propria ?? 0) || 0,

          // ✅ INVOL
          invol_deposito_nome: String(it?.invol_deposito_nome ?? ""),
          invol_produto_id: Number(it?.invol_produto_id ?? 0) || 0,
          invol_codigo_barras: String(it?.invol_codigo_barras ?? ""),
          invol_item: String(it?.invol_item ?? ""),

          // ✅ VÉU
          veu_deposito_nome: String(it?.veu_deposito_nome ?? ""),
          veu_produto_id: Number(it?.veu_produto_id ?? 0) || 0,
          veu_codigo_barras: String(it?.veu_codigo_barras ?? ""),
          veu_item: String(it?.veu_item ?? ""),

          // ✅ CORDÃO
          cordao_deposito_nome: String(it?.cordao_deposito_nome ?? ""),
          cordao_produto_id: Number(it?.cordao_produto_id ?? 0) || 0,
          cordao_codigo_barras: String(it?.cordao_codigo_barras ?? ""),
          cordao_item: String(it?.cordao_item ?? ""),

          // ✅ INSUMOS (novo formato dentro do arrumacao_json)
          arrumacao_json: String(it?.arrumacao_json ?? ""),

          // ✅ FOTOS OBRIGATÓRIAS DAS AÇÕES
          foto_fim_ornamentacao_url: String(
            it?.foto_fim_ornamentacao_url ?? "",
          ),
          foto_fim_ornamentacao_path: String(
            it?.foto_fim_ornamentacao_path ?? "",
          ),
          foto_fim_ornamentacao_em: String(
            it?.foto_fim_ornamentacao_em ?? "",
          ),
          foto_fim_ornamentacao_usuario: String(
            it?.foto_fim_ornamentacao_usuario ?? "",
          ),
          foto_entrega_corpo_url: String(it?.foto_entrega_corpo_url ?? ""),
          foto_entrega_corpo_path: String(it?.foto_entrega_corpo_path ?? ""),
          foto_entrega_corpo_em: String(it?.foto_entrega_corpo_em ?? ""),
          foto_entrega_corpo_usuario: String(
            it?.foto_entrega_corpo_usuario ?? "",
          ),
        }))
        : [];

      setRegistros(sane);
    } catch {
      setRegistros([]);
    }
  }, []);

  const fetchRegistrosSafe = useCallback(async () => {
    await fetchRegistros();
  }, [fetchRegistros]);

  const flushOfflineQueue = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!isOnlineNow()) return;
    if (flushingRef.current) return;

    const items = safeReadQueue();
    if (!items.length) return;

    flushingRef.current = true;
    try {
      let queue = [...items].sort((a, b) => a.createdAt - b.createdAt);

      for (const item of queue) {
        try {
          const json = await enviarRegistroPHP(item.payload);

          if (json?.sucesso) {
            try {
              const acao = String(item.payload?.acao ?? "");
              const tipoAt = String(item.payload?.tipo_atendimento ?? "");
              if (acao === "novo" && tipoAt === "terceiro") {
                const novoId =
                  json?.id ?? json?.novo_id ?? json?.last_id ?? null;
                addTerceiroIdToSession(novoId);
              }
            } catch { }

            // ✅ enviado com sucesso -> remove da fila
            const after = safeReadQueue().filter((x) => x.qid !== item.qid);
            safeWriteQueue(after);
          } else {
            const msg =
              typeof json?.msg === "string" && json.msg.trim()
                ? json.msg
                : typeof json?.erro === "string"
                  ? json.erro
                  : "";

            // ✅ ERROS "PERMANENTES" (validação) -> remove da fila para não ficar tentando pra sempre
            const isValidation =
              msg.includes("Selecione uma roupa da lista") ||
              msg.includes("Selecione uma urna da lista") ||
              msg.includes("Selecione um INVOL da lista") ||
              msg.includes("Depósito inválido") ||
              msg.includes("Dados inválidos") ||
              msg.includes("Campo obrigatório após Corpo na Clínica") ||
              msg.includes("Confirmação obrigatória") ||
              msg.includes("Apenas Tanatopraxista");

            if (isValidation) {
              const after = safeReadQueue().filter((x) => x.qid !== item.qid);
              safeWriteQueue(after);

              // opcional: log pra você ver o que foi descartado
              console.warn(
                "Removido da fila offline (validação):",
                item.payload,
                msg,
              );

              // ✅ segue para o próximo item da fila (não trava tudo)
              continue;
            }

            // ❗ Erro "temporário" -> mantém na fila e para (pra não martelar o servidor)
            const after = safeReadQueue().map((x) =>
              x.qid === item.qid
                ? {
                  ...x,
                  tries: (x.tries ?? 0) + 1,
                  lastError: msg || "Erro ao enviar (offline queue).",
                }
                : x,
            );
            safeWriteQueue(after);
            break;
          }
        } catch (e: any) {
          const after = safeReadQueue().map((x) =>
            x.qid === item.qid
              ? {
                ...x,
                tries: (x.tries ?? 0) + 1,
                lastError: e?.message || "Falha ao enviar (offline queue).",
              }
              : x,
          );
          safeWriteQueue(after);
          break;
        }
      }

      await fetchRegistrosSafe();
    } finally {
      flushingRef.current = false;
    }
  }, [fetchRegistrosSafe]);

  /* -------------------- Avisos -------------------- */
  const fetchAvisos = useCallback(async () => {
    try {
      const r = await fetch(
        `${ENDPOINT}/avisos.php?listar=1&_nocache=${Date.now()}`,
        {
          credentials: "include",
        },
      );
      if (r.status === 401) return;
      const data = await r.json().catch(() => null);
      if (data?.need_login) return;
      setAvisos(Array.isArray(data) ? data : []);
    } catch {
      setAvisos([]);
    }
  }, []);

  const enviarAviso = useCallback(async () => {
    const val = (avisoInputRef.current?.value ?? "").trim();
    if (!val) {
      setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
      return;
    }
    try {
      const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensagem: val }),
      });
      if (res?.sucesso) {
        setAvisoMsg({ text: "Aviso adicionado!", ok: true });
        if (avisoInputRef.current) avisoInputRef.current.value = "";
        fetchAvisos();
      } else {
        setAvisoMsg({
          text: res?.erro || res?.msg || "Erro ao adicionar!",
          ok: false,
        });
      }
    } catch (e: any) {
      setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
    }
  }, [fetchAvisos]);

  const editarAviso = useCallback(
    async (id: number | string, mensagem: string) => {
      try {
        const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, mensagem }),
        });
        if (res?.sucesso) {
          setAvisoMsg({ text: "Aviso atualizado!", ok: true });
          fetchAvisos();
        } else {
          setAvisoMsg({
            text: res?.erro || res?.msg || "Erro ao editar!",
            ok: false,
          });
        }
      } catch (e: any) {
        setAvisoMsg({ text: e?.message || "Erro ao editar!", ok: false });
      }
    },
    [fetchAvisos],
  );

  const excluirAviso = useCallback(
    async (id: number | string) => {
      if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;
      try {
        const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, excluir: true }),
        });
        if (res?.sucesso) {
          setAvisoMsg({ text: "Aviso excluído!", ok: true });
          fetchAvisos();
        } else {
          setAvisoMsg({
            text: res?.erro || res?.msg || "Erro ao excluir!",
            ok: false,
          });
        }
      } catch (e: any) {
        setAvisoMsg({ text: e?.message || "Erro ao excluir!", ok: false });
      }
    },
    [fetchAvisos],
  );

  const finalizarAviso = useCallback(
    async (id: number | string) => {
      try {
        const res = await jsonWith401(`${ENDPOINT}/avisos.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, finalizar: true }),
        });
        if (res?.sucesso) {
          setAvisoMsg({ text: "Aviso finalizado!", ok: true });
          fetchAvisos();
        } else {
          setAvisoMsg({
            text: res?.erro || res?.msg || "Erro ao finalizar!",
            ok: false,
          });
        }
      } catch (e: any) {
        setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
      }
    },
    [fetchAvisos],
  );

  /* -------------------- Ciclos -------------------- */
  useEffect(() => {
    fetchRegistros();
    fetchAvisos();
    flushOfflineQueue();
  }, [fetchRegistros, fetchAvisos, flushOfflineQueue]);

  useEffect(() => {
    const intReg = setInterval(fetchRegistros, 10000);
    const intAv = setInterval(fetchAvisos, 3000);
    const intFlush = setInterval(() => flushOfflineQueue(), 20000);

    const onVis = () => {
      if (!document.hidden) {
        fetchRegistros();
        flushOfflineQueue();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const onOnline = () => flushOfflineQueue();
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(intReg);
      clearInterval(intAv);
      clearInterval(intFlush);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [fetchRegistros, fetchAvisos, flushOfflineQueue]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWizardOpen(false);
        setAcaoOpen(false);
        setInfoOpen(false);
        setShareOpen(false);
        setMateriaisOpen(false);
        setArrumacaoOpen(false);
        setSignOpen(false);
        setChooseTipoOpen(false);
        setTeleOpen(false);
        setMatCheckOpen(false);
        setFotoAcaoOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  /* -------------------- Parsers locais -------------------- */
  const parseMateriaisFromRegistro = (r: Registro): MateriaisState => {
    if ((r as any)?.materiais_json) {
      try {
        const parsed = JSON.parse(String((r as any).materiais_json));
        return normalizeMateriaisState(parsed);
      } catch { }
    }

    const out: MateriaisState = {};
    try {
      for (const [k, v] of Object.entries(r as any)) {
        if (!k.startsWith("materiais_") || !k.endsWith("_qtd")) continue;
        const qtd = Math.max(0, Math.floor(Number(v ?? 0)));
        if (qtd <= 0) continue;

        const nomeBase = k.replace(/^materiais_/, "").replace(/_qtd$/, "");
        out[nomeBase] = {
          checked: true,
          qtd,
          nome: nomeBase.replace(/_/g, " "),
        } as any;
      }
    } catch { }

    return out;
  };

  const parseArrumacaoFromRegistro = (r: Registro): ArrumacaoState => {
    const base = defaultArrumacao();

    if ((r as any).arrumacao_json) {
      try {
        const parsed = JSON.parse(String((r as any).arrumacao_json));
        Object.assign(base, parsed);
      } catch { }
    }

    (Object.keys(base) as Array<keyof ArrumacaoState>).forEach((k) => {
      const col = (r as any)[k];
      if (col == null) return;

      if (typeof col === "boolean") base[k] = col;
      else if (typeof col === "number") base[k] = col === 1;
      else if (typeof col === "string") {
        const s = col.trim().toLowerCase();
        base[k] = s === "1" || s === "true" || s === "sim" || s === "s";
      } else base[k] = !!col;
    });

    return base;
  };

  /* -------------------- salvar conferência no backend -------------------- */
  const salvarConferenciaNoPHP = useCallback(
    async (data: {
      registro_id: string | number | null | undefined;
      falecido_nome: string;
      observacao: string;
      itens: Array<{
        key: string;
        nome: string;
        qtd: number;
        ok: 0 | 1;
        nao_conforme: 0 | 1;
      }>;
    }) => {
      const registro_id =
        data.registro_id != null ? String(data.registro_id) : "";
      if (!registro_id)
        throw new Error(
          "Não foi possível identificar o atendimento (registro_id).",
        );

      const r = await fetch(
        `${ENDPOINT}/materiais_admin.php?op=conferencia_create&_nocache=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            registro_id,
            falecido_nome: String(data.falecido_nome || "").trim(),
            observacao: String(data.observacao || "").trim(),
            itens: Array.isArray(data.itens) ? data.itens : [],
          }),
        },
      );

      if (r.status === 401)
        throw new Error("Sessão expirada. Faça login novamente.");
      const json = await r.json().catch(() => null);
      if (!json) throw new Error("Resposta inválida do servidor.");
      if (json?.need_login)
        throw new Error("Sessão expirada. Faça login novamente.");
      if (!r.ok || json?.erro)
        throw new Error(json?.msg || "Erro ao salvar conferência.");

      return json;
    },
    [],
  );

  /* --------------------
     ✅ baixa automática da urna (fase05)
     -------------------- */
  const baixarItensFase05 = useCallback(
    async (payload: {
      registro_id: string;
      tipo: BaixaTipo;
      deposito_nome?: string;
      itens?: Array<{ produto_id: number; qtd: number }>;
    }) => {
      const r = await fetch(`${URNA_SAIDA_API}?_nocache=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (r.status === 401)
        throw new Error("Sessão expirada. Faça login novamente.");
      const j = await r.json().catch(() => null);
      if (!j)
        throw new Error(
          `Resposta inválida do servidor (baixa ${payload.tipo}).`,
        );
      if (j?.need_login)
        throw new Error("Sessão expirada. Faça login novamente.");
      if (!r.ok || j?.ok === false)
        throw new Error(
          j?.msg ||
          `Falha ao dar baixa automática (${payload.tipo}) na fase05.`,
        );
      return j;
    },
    [],
  );

  /* -------------------- Aberturas -------------------- */
  const abrirNovoRegistro = useCallback(() => setChooseTipoOpen(true), []);

  const iniciarNovoRegistro = useCallback((tipo: TipoAtendimento) => {
    setChooseTipoOpen(false);
    wizardOriginalRoupaRef.current = null;

    setTipoAtendimento(tipo);

    setWizardSubmitting(false);
    setWizardEditing(false);
    setWizardIdx(null);
    setWizardRestrictGroup(null);
    setWizardStep(0);
    setWizardMsg(null);
    setWizardTitle("Novo Registro");

    const empty: Registro = {};
    (stepsPadrao as any).forEach((s: any) => ((empty as any)[s.id] = ""));

    if (tipo === "terceiro") {
      (empty as any).assistencia = "Não";
      (empty as any).tanato = "Não";
      (empty as any).ornamentacao = "Não";
      (empty as any).tipo_atendimento = "terceiro";
    } else {
      (empty as any).tipo_atendimento = "funerario";
    }

    // ✅ defaults de meta urna
    (empty as any).urna_deposito_nome = "MEMORIAL";
    (empty as any).urna_produto_id = 0;
    (empty as any).urna_codigo_barras = "";

    // ✅ defaults de meta roupa
    (empty as any).roupa_deposito_nome = "";
    (empty as any).roupa_produto_id = 0;
    (empty as any).roupa_codigo_barras = "";
    (empty as any).roupa_propria = 0;

    // ✅ defaults de meta invol
    (empty as any).invol_deposito_nome = "";
    (empty as any).invol_produto_id = 0;
    (empty as any).invol_codigo_barras = "";

    // ✅ defaults de meta VÉU
    (empty as any).veu_deposito_nome = "";
    (empty as any).veu_produto_id = 0;
    (empty as any).veu_codigo_barras = "";
    (empty as any).veu_item = "";

    // ✅ defaults de meta CORDÃO
    (empty as any).cordao_deposito_nome = "";
    (empty as any).cordao_produto_id = 0;
    (empty as any).cordao_codigo_barras = "";
    (empty as any).cordao_item = "";

    // ✅ Velório (sala + online)
    (empty as any).sala_velorio = "";
    (empty as any).velorio_online = "";

    // ✅ insumos tanato (novo formato) - começa vazio
    (empty as any).arrumacao_json = "";

    // ✅ materiais de assistência (novo formato) - começa vazio
    (empty as any).materiais_json = "";

    setWizardData(empty);
    setMateriais(defaultMateriais());
    setArrumacao(defaultArrumacao());
    setAssistenciaVal(String((empty as any).assistencia || ""));
    setTanatoVal(String((empty as any).tanato || ""));
    setWizardOpen(true);
  }, []);

  const abrirWizard = useCallback(
    (
      tipo: "novo" | "editar",
      idx: number | null = null,
      grupoStep: number | null = null,
    ) => {
      setWizardSubmitting(false);
      const editing = tipo === "editar";
      setWizardEditing(editing);
      setWizardIdx(idx);
      setWizardRestrictGroup(grupoStep);
      setWizardStep(grupoStep ?? 0);
      setWizardMsg(null);
      setWizardTitle(editing ? "Editar Registro" : "Novo Registro");

      if (editing && idx !== null && registros[idx]) {
        const r = registros[idx];
        setTipoAtendimento(resolveTipoFromRegistro(r));

        const data: Registro = {};
        (stepsPadrao as any).forEach((s: any) => {
          (data as any)[s.id] = (r as any)[s.id] ?? "";
        });
        (data as any).id = (r as any).id;
        (data as any).status = normalizeStatusCode((r as any).status ?? "");

        // ✅ Velório (sala + online) no wizardData
        (data as any).sala_velorio = String((r as any).sala_velorio ?? "");
        (data as any).velorio_online = String((r as any).velorio_online ?? "");

        // ✅ metas da urna no wizardData
        (data as any).urna_deposito_nome = String(
          (r as any).urna_deposito_nome ?? "",
        );
        (data as any).urna_produto_id =
          Number((r as any).urna_produto_id ?? 0) || 0;
        (data as any).urna_codigo_barras = String(
          (r as any).urna_codigo_barras ?? "",
        );

        // ✅ metas da ROUPA no wizardData
        (data as any).roupa_deposito_nome = String(
          (r as any).roupa_deposito_nome ?? "",
        );
        (data as any).roupa_produto_id =
          Number((r as any).roupa_produto_id ?? 0) || 0;
        (data as any).roupa_codigo_barras = String(
          (r as any).roupa_codigo_barras ?? "",
        );
        (data as any).roupa_propria =
          Number((r as any).roupa_propria ?? 0) || 0;

        // ✅ snapshot original de ROUPA (para comparar no salvar do EDITAR)
        wizardOriginalRoupaRef.current = {
          roupa: String((r as any).roupa ?? ""),
          roupa_produto_id: Number((r as any).roupa_produto_id ?? 0) || 0,
          roupa_deposito_nome: String((r as any).roupa_deposito_nome ?? ""),
          roupa_codigo_barras: String((r as any).roupa_codigo_barras ?? ""),
          roupa_propria: Number((r as any).roupa_propria ?? 0) || 0,
        };

        // ✅ metas do INVOL no wizardData
        (data as any).invol_deposito_nome = String(
          (r as any).invol_deposito_nome ?? "",
        );
        (data as any).invol_produto_id =
          Number((r as any).invol_produto_id ?? 0) || 0;
        (data as any).invol_codigo_barras = String(
          (r as any).invol_codigo_barras ?? "",
        );
        // ✅ texto do INVOL (para aparecer no combobox ao reabrir)
        (data as any).invol_item = String((r as any).invol_item ?? "");

        // ✅ metas do VÉU no wizardData
        (data as any).veu_deposito_nome = String(
          (r as any).veu_deposito_nome ?? "",
        );
        (data as any).veu_produto_id =
          Number((r as any).veu_produto_id ?? 0) || 0;
        (data as any).veu_codigo_barras = String(
          (r as any).veu_codigo_barras ?? "",
        );
        (data as any).veu_item = String((r as any).veu_item ?? "");

        // ✅ metas do CORDÃO no wizardData
        (data as any).cordao_deposito_nome = String(
          (r as any).cordao_deposito_nome ?? "",
        );
        (data as any).cordao_produto_id =
          Number((r as any).cordao_produto_id ?? 0) || 0;
        (data as any).cordao_codigo_barras = String(
          (r as any).cordao_codigo_barras ?? "",
        );
        (data as any).cordao_item = String((r as any).cordao_item ?? "");

        // ✅ insumos tanato (novo formato dentro do arrumacao_json)
        (data as any).arrumacao_json = String((r as any).arrumacao_json ?? "");

        const mats = parseMateriaisFromRegistro(r);
        setMateriais(mats);
        (data as any).materiais = mats;
        (data as any).materiais_json = String((r as any).materiais_json ?? "");

        const arr = parseArrumacaoFromRegistro(r);
        setArrumacao(arr);
        (data as any).arrumacao = arr;

        setWizardData(data);
        setAssistenciaVal(String((r as any).assistencia ?? ""));
        setTanatoVal(String((r as any).tanato ?? ""));
        setWizardOpen(true);
        return;
      }

      iniciarNovoRegistro(tipoAtendimento);
    },
    [registros, iniciarNovoRegistro, tipoAtendimento],
  );

  const salvarGrupoWizard = useCallback((): Registro | null => {
    const grupo = wizardStepIndexesForTipo[wizardStep];
    const next: any = { ...wizardData };

    // ✅ Se o usuário acabou de salvar um modal interno (Materiais/Arrumação),
    // o próximo salvar do Wizard deve respeitar esse escopo menor.
    // Isso impede que a aba Itens inteira seja validada ao salvar apenas
    // materiais_json ou arrumacao_json.
    const modalRestrictIdsForSave = normalizeRestrictIds(
      (wizardData as any)?._wizard_modal_restrict_ids,
    );

    const deveValidarCampoObrigatorio = (id: string) =>
      !modalRestrictIdsForSave || modalRestrictIdsForSave.includes(id);

    for (const idx of grupo) {
      const s = (stepsForTipo as any)[idx] as any;

      // ✅ Para campos async (combobox/autocomplete), pega do state (wizardData), não do DOM
      const isAsyncField =
        s?.type === "async_urna" ||
        s?.type === "async_roupa" ||
        s?.type === "async_invol" ||
        s?.type === "async_veu" ||
        s?.type === "async_cordao";

      let v = "";

      if (isAsyncField) {
        v = String((wizardData as any)?.[s.id] ?? "").trim();
      } else {
        const el = document.getElementById("wizard-" + s.id) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
          | null;

        v = (el?.value ?? "").trim();

        if (deveValidarCampoObrigatorio(s.id) && obrigatoriosForTipo.includes(s.id) && !v) {
          el?.focus?.();
          setWizardMsg({
            text: "Preencha todos campos obrigatórios.",
            ok: false,
          });
          return null;
        }
      }

      // valida obrigatórios também para async
      if (deveValidarCampoObrigatorio(s.id) && obrigatoriosForTipo.includes(s.id) && !v) {
        setWizardMsg({
          text: "Preencha todos campos obrigatórios.",
          ok: false,
        });
        return null;
      }

      next[s.id] = v;
    }

    if ((wizardData as any).id != null) next.id = (wizardData as any).id;

    next.materiais = materiais;
    next.arrumacao = arrumacao;
    next.tipo_atendimento = tipoAtendimento;

    // ✅ garante que os materiais dinâmicos sejam enviados ao PHP.
    // O front usa `materiais`, mas o backend salva `materiais_json`.
    // Quando o MateriaisModal já gerou o JSON normalizado, preserva esse valor.
    try {
      const jsonDoModal = String(next?.materiais_json ?? "").trim();
      if (modalRestrictIdsForSave?.includes("materiais_json") && jsonDoModal) {
        next.materiais_json = jsonDoModal;
      } else {
        next.materiais_json = JSON.stringify(materiais || {});
      }
    } catch {
      next.materiais_json = "{}";
    }

    // ✅ VELÓRIO: sala selecionada e velório online
    // - Se não houver sala marcada, limpa velorio_online para não mandar informação solta.
    // - Se houver sala, mantém somente valores válidos ("Sim" ou "Não"); o Wizard também valida visualmente.
    const salaVelorio = String(next?.sala_velorio ?? "").trim();
    const velorioOnline = String(next?.velorio_online ?? "").trim();

    if (!salaVelorio) {
      next.sala_velorio = "";
      next.velorio_online = "";
    } else {
      next.sala_velorio = salaVelorio;
      next.velorio_online =
        velorioOnline === "Sim" || velorioOnline === "Não" ? velorioOnline : "";
    }

    // ✅ URNA META: não usa DOM. Mantém o que está no wizardData.
    // Urna vazia significa que o usuário marcou "Não" no Wizard.
    const urnaTxt = String(next?.urna ?? "").trim();
    const pid = Number(next?.urna_produto_id ?? 0) || 0;

    if (urnaTxt === "") {
      next.urna = "";
      next.urna_deposito_nome = "";
      next.urna_produto_id = 0;
      next.urna_codigo_barras = "";
    } else if (pid > 0) {
      const dep = String(next?.urna_deposito_nome ?? "MEMORIAL")
        .trim()
        .toUpperCase();
      next.urna_deposito_nome = dep === "FUNERARIA" ? "FUNERARIA" : "MEMORIAL";
      next.urna_codigo_barras = String(next?.urna_codigo_barras ?? "").trim();
    } else {
      // Se houver texto sem seleção real do estoque, mantém pid 0 para a validação bloquear.
      next.urna_produto_id = 0;
      next.urna_codigo_barras = String(next?.urna_codigo_barras ?? "").trim();
      next.urna_deposito_nome =
        String(next?.urna_deposito_nome ?? "MEMORIAL")
          .trim()
          .toUpperCase() === "FUNERARIA"
          ? "FUNERARIA"
          : "MEMORIAL";
    }

    // ✅ ROUPA META: mesma lógica da URNA (não depende do DOM)
    const roupaTxt = String(next?.roupa ?? "").trim();
    const roupaPropriaFlag = Number((next as any)?.roupa_propria ?? 0) ? 1 : 0;

    if (roupaTxt === "") {
      // sem roupa -> limpa metas e flag
      next.roupa_produto_id = 0;
      next.roupa_codigo_barras = "";
      next.roupa_deposito_nome = "";
      (next as any).roupa_propria = 0;
    } else if (isRoupaPropria(roupaTxt)) {
      // roupa própria não usa estoque
      next.roupa = "ROUPA PRÓPRIA";
      next.roupa_produto_id = 0;
      next.roupa_codigo_barras = "";
      next.roupa_deposito_nome = "";
      (next as any).roupa_propria = 1;
    } else {
      // roupa do estoque: zera o flag antigo de roupa própria
      (next as any).roupa_propria = 0;
      // roupa do estoque -> mantém pid/cb/dep do wizardData
      const roupaPid = Number(next?.roupa_produto_id ?? 0) || 0;

      // normaliza depósito permitido
      const depRaw = String(next?.roupa_deposito_nome ?? "")
        .trim()
        .toUpperCase();
      const depOk =
        depRaw === "ARMARIO SANDRO" ||
          depRaw === "ARMARIO ILDO" ||
          depRaw === "FUNERARIA"
          ? depRaw
          : "ARMARIO SANDRO";

      next.roupa_deposito_nome = depOk;
      next.roupa_codigo_barras = String(next?.roupa_codigo_barras ?? "").trim();

      // se digitou mas não selecionou item do estoque, mantém 0 (wizard/PHP validam)
      next.roupa_produto_id = roupaPid > 0 ? roupaPid : 0;

      // não é própria -> garante flag zerado
      (next as any).roupa_propria = 0;
    }

    // ✅ INVOL META: só vale quando invol === "Sim"
    const involFlag = String(next?.invol ?? "").trim();
    if (!isSim(involFlag)) {
      next.invol_produto_id = 0;
      next.invol_codigo_barras = "";
      next.invol_deposito_nome = "";
      // esse campo é só “UI”, mas evita sujeira:
      next.invol_item = "";
    } else {
      const involPid = Number(next?.invol_produto_id ?? 0) || 0;

      // normaliza depósito permitido
      const depRaw = String(next?.invol_deposito_nome ?? "")
        .trim()
        .toUpperCase();
      const depOk =
        depRaw === "ARMARIO ILDO" ? "ARMARIO ILDO" : "ARMARIO SANDRO";

      next.invol_deposito_nome = depOk;
      next.invol_codigo_barras = String(next?.invol_codigo_barras ?? "").trim();
      next.invol_produto_id = involPid > 0 ? involPid : 0;
    }

    // ✅ VÉU META: só vale quando veu === "Sim"
    const veuFlag = String(next?.veu ?? "").trim();
    if (!isSim(veuFlag)) {
      next.veu_produto_id = 0;
      next.veu_codigo_barras = "";
      next.veu_deposito_nome = "";
      next.veu_item = "";
    } else {
      const veuPid = Number(next?.veu_produto_id ?? 0) || 0;

      const depRaw = String(next?.veu_deposito_nome ?? "")
        .trim()
        .toUpperCase();
      const depOk =
        depRaw === "ARMARIO ILDO" || depRaw === "FUNERARIA"
          ? depRaw
          : "ARMARIO SANDRO";

      next.veu_deposito_nome = depOk;
      next.veu_codigo_barras = String(next?.veu_codigo_barras ?? "").trim();
      next.veu_produto_id = veuPid > 0 ? veuPid : 0;
    }

    // ✅ CORDÃO META: só vale quando cordao === "Sim"
    const cordaoFlag = String(next?.cordao ?? "").trim();
    if (!isSim(cordaoFlag)) {
      next.cordao_produto_id = 0;
      next.cordao_codigo_barras = "";
      next.cordao_deposito_nome = "";
      next.cordao_item = "";
    } else {
      const cordaoPid = Number(next?.cordao_produto_id ?? 0) || 0;

      const depRaw = String(next?.cordao_deposito_nome ?? "")
        .trim()
        .toUpperCase();
      const depOk =
        depRaw === "ARMARIO ILDO" || depRaw === "FUNERARIA"
          ? depRaw
          : "ARMARIO SANDRO";

      next.cordao_deposito_nome = depOk;
      next.cordao_codigo_barras = String(
        next?.cordao_codigo_barras ?? "",
      ).trim();
      next.cordao_produto_id = cordaoPid > 0 ? cordaoPid : 0;
    }

    // ✅ preservar INSUMOS dentro do arrumacao_json (merge booleans + insumos)
    try {
      const prevStr = String(next.arrumacao_json ?? "");
      let prevObj: any = {};
      try {
        prevObj = prevStr ? JSON.parse(prevStr) : {};
      } catch {
        prevObj = {};
      }

      const bools =
        next.arrumacao && typeof next.arrumacao === "object"
          ? next.arrumacao
          : arrumacao;

      // mantém deposito_nome/itens e atualiza booleans
      const merged = { ...(prevObj || {}), ...(bools || {}) };

      next.arrumacao_json = JSON.stringify(merged);
    } catch {
      next.arrumacao_json = "";
    }

    setWizardData(next);
    return next as Registro;
  }, [
    wizardStepIndexesForTipo,
    wizardStep,
    wizardData,
    materiais,
    arrumacao,
    stepsForTipo,
    obrigatoriosForTipo,
    tipoAtendimento,
  ]);

  const concluirWizard = useCallback(async () => {
    if (wizardSubmitting) return;

    const dataAtualizada: any = salvarGrupoWizard();
    if (!dataAtualizada) return;

    // ✅ Prioridade de escopo:
    // 1) Escopo vindo dos modais internos: Materiais/Arrumação.
    // 2) Escopo da aba editada no InfoModal.
    // 3) Edição completa.
    const modalRestrictIds = normalizeRestrictIds(
      dataAtualizada?._wizard_modal_restrict_ids,
    );

    const groupRestrictIds =
      typeof wizardRestrictGroup === "number"
        ? (wizardStepIndexesForTipo[wizardRestrictGroup] || [])
          .map((i) => (stepsForTipo as any)[i]?.id)
          .filter(Boolean)
        : null;

    const wizardRestrictIds = modalRestrictIds || groupRestrictIds;

    const escopoTemAlgum = (ids: string[]) => scopeHasAny(wizardRestrictIds, ids);

    let grupoObrigatorios: string[];
    if (wizardRestrictIds) {
      grupoObrigatorios = wizardRestrictIds.filter((id) => obrigatoriosForTipo.includes(id));
    } else {
      grupoObrigatorios = obrigatoriosForTipo;
    }

    for (const id of grupoObrigatorios) {
      if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
        setWizardMsg({
          text: "Preencha todos campos obrigatórios.",
          ok: false,
        });
        return;
      }
    }

    const obrigatoriedadeAtiva = obrigatoriosForTipo.length > 0;

    // ✅ validação extra (front): se escolheu sala do velório, Velório Online é obrigatório.
    const salaVelorio = String(dataAtualizada?.sala_velorio ?? "").trim();
    const velorioOnline = String(dataAtualizada?.velorio_online ?? "").trim();
    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["local_velorio", "sala_velorio", "velorio_online"]) &&
      salaVelorio &&
      velorioOnline !== "Sim" &&
      velorioOnline !== "Não"
    ) {
      setWizardMsg({
        text: 'Selecione "Sim" ou "Não" em Velório Online.',
        ok: false,
      });
      return;
    }

    // ✅ validação extra (front): se urna tem texto, precisa ter produto_id
    const urnaTxt = String(dataAtualizada?.urna ?? "").trim();
    // ✅ validação extra (front): ROUPA (se não for própria)
    const roupaTxt = String(dataAtualizada?.roupa ?? "").trim();
    const roupaPid = Number(dataAtualizada?.roupa_produto_id ?? 0) || 0;
    const roupaDep = String(dataAtualizada?.roupa_deposito_nome ?? "").trim();

    // ✅ no EDITAR: só valida roupa se ela mudou em relação ao original
    const origRoupa = wizardOriginalRoupaRef.current;

    const roupaMudou = wizardEditing
      ? String(roupaTxt).trim() !== String(origRoupa?.roupa ?? "").trim() ||
      (Number(roupaPid) || 0) !==
      (Number(origRoupa?.roupa_produto_id ?? 0) || 0) ||
      String(roupaDep).trim() !==
      String(origRoupa?.roupa_deposito_nome ?? "").trim() ||
      String((dataAtualizada as any)?.roupa_codigo_barras ?? "").trim() !==
      String(origRoupa?.roupa_codigo_barras ?? "").trim() ||
      (Number((dataAtualizada as any)?.roupa_propria ?? 0) ? 1 : 0) !==
      (Number(origRoupa?.roupa_propria ?? 0) ? 1 : 0)
      : true;

    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["roupa", "roupa_produto_id", "roupa_deposito_nome", "roupa_codigo_barras"]) &&
      roupaMudou &&
      roupaTxt !== "" &&
      !isRoupaPropria(roupaTxt)
    ) {
      if (roupaPid <= 0) {
        setWizardMsg({
          text: 'Selecione uma roupa da lista (produto do estoque) ou use "ROUPA PRÓPRIA".',
          ok: false,
        });
        return;
      }
      if (!roupaDep) {
        setWizardMsg({
          text: "Selecione o local de saída da roupa (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
          ok: false,
        });
        return;
      }
    }

    // ✅ validação extra (front):
    const involVal = dataAtualizada?.invol ?? "";
    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["invol", "invol_item", "invol_produto_id", "invol_deposito_nome"]) &&
      isSim(involVal)
    ) {
      const involPid = Number(dataAtualizada?.invol_produto_id ?? 0) || 0;
      const involDep = String(dataAtualizada?.invol_deposito_nome ?? "").trim();
      if (involPid <= 0) {
        setWizardMsg({
          text: "Selecione um INVOL da lista (produto do estoque).",
          ok: false,
        });
        return;
      }
      if (!involDep) {
        setWizardMsg({
          text: "Selecione o local do INVOL (ARMARIO SANDRO ou ARMARIO ILDO).",
          ok: false,
        });
        return;
      }
    }

    // ✅ validação extra (front): VÉU
    const veuVal = dataAtualizada?.veu ?? "";
    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["veu", "veu_item", "veu_produto_id", "veu_deposito_nome"]) &&
      isSim(veuVal)
    ) {
      const veuPid = Number(dataAtualizada?.veu_produto_id ?? 0) || 0;
      const veuDep = String(dataAtualizada?.veu_deposito_nome ?? "").trim();
      if (veuPid <= 0) {
        setWizardMsg({
          text: "Selecione um VÉU da lista (produto do estoque).",
          ok: false,
        });
        return;
      }
      if (!veuDep) {
        setWizardMsg({
          text: "Selecione o local do VÉU (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
          ok: false,
        });
        return;
      }
    }

    // ✅ validação extra (front): CORDÃO
    const cordaoVal = dataAtualizada?.cordao ?? "";
    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["cordao", "cordao_item", "cordao_produto_id", "cordao_deposito_nome"]) &&
      isSim(cordaoVal)
    ) {
      const cordaoPid = Number(dataAtualizada?.cordao_produto_id ?? 0) || 0;
      const cordaoDep = String(
        dataAtualizada?.cordao_deposito_nome ?? "",
      ).trim();
      if (cordaoPid <= 0) {
        setWizardMsg({
          text: "Selecione um CORDÃO da lista (produto do estoque).",
          ok: false,
        });
        return;
      }
      if (!cordaoDep) {
        setWizardMsg({
          text: "Selecione o local do CORDÃO (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
          ok: false,
        });
        return;
      }
    }

    // ✅ validação extra (front): INSUMOS TANATO (arrumacao_json novo)
    const ins = parseInsumosFromArrumacaoJson(dataAtualizada?.arrumacao_json);
    if (escopoTemAlgum(["arrumacao", "arrumacao_json"]) && ins && (!ins.deposito_nome || ins.itens.length === 0)) {
      setWizardMsg({
        text: "Insumos Tanatopraxia: selecione o depósito e informe itens com quantidade (>=1).",
        ok: false,
      });
      return;
    }

    const urnaPid = Number(dataAtualizada?.urna_produto_id ?? 0) || 0;
    if (
      obrigatoriedadeAtiva &&
      escopoTemAlgum(["urna", "urna_produto_id", "urna_deposito_nome"]) &&
      urnaTxt !== "" &&
      urnaPid <= 0
    ) {
      setWizardMsg({
        text: "Selecione uma urna da lista (produto do estoque).",
        ok: false,
      });
      return;
    }

    const aplicarEscopoNoPayload = (payload: any) => {
      if (payload.acao === "editar" && wizardRestrictIds) {
        let restrictIds = Array.from(new Set(wizardRestrictIds.map((id) => String(id))));

        // ✅ Correção: ao editar a aba de Itens para trocar somente a URNA,
        // a mesma aba também costuma conter "roupa" no escopo.
        // Como scrubRoupaNoEditar remove roupa do payload quando ela NÃO mudou,
        // o PHP recebia _wizard_restrict_ids com "roupa" mas sem o campo "roupa",
        // e retornava: "Campo obrigatório após Corpo na Clínica: Roupa."
        // Se a roupa não foi alterada, ela também precisa sair do escopo enviado ao backend.
        if (wizardEditing && !roupaMudou) {
          restrictIds = restrictIds.filter((id) => !ROUPA_SCOPE_IDS.includes(id));
        }

        payload._wizard_restrict_ids = restrictIds;
      }

      // Esses campos são marcadores internos do front. O PHP só precisa de _wizard_restrict_ids.
      delete payload._wizard_modal_restrict_ids;
      delete payload._wizard_modal_scope;

      return payload;
    };

    if (!isOnlineNow()) {
      try {
        setWizardSubmitting(true);
        const payload: any = {
          ...dataAtualizada,
          acao: wizardEditing ? "editar" : "novo",
        };

        aplicarEscopoNoPayload(payload);

        if (payload.acao === "editar") {
          // ✅ remove roupa do payload se não mudou
          scrubRoupaNoEditar(payload, wizardOriginalRoupaRef.current);
        }

        enqueueOffline(payload, "offline");

        setWizardMsg({
          text: "Sem internet: registro salvo offline e será enviado automaticamente quando a conexão voltar.",
          ok: true,
        });
        setTimeout(() => setWizardOpen(false), 950);
      } catch (e: any) {
        setWizardMsg({
          text: e?.message || "Não foi possível salvar offline.",
          ok: false,
        });
      } finally {
        setWizardSubmitting(false);
      }
      return;
    }

    try {
      setWizardSubmitting(true);
      const payload: any = {
        ...dataAtualizada,
        acao: wizardEditing ? "editar" : "novo",
      };

      aplicarEscopoNoPayload(payload);

      if (payload.acao === "editar") {
        // ✅ remove roupa do payload se não mudou
        scrubRoupaNoEditar(payload, wizardOriginalRoupaRef.current);
      }

      // ===== blindagem final da roupa antes do envio =====
      const roupaFinalTxt = String(payload.roupa ?? "").trim();

      if (isRoupaPropria(roupaFinalTxt)) {
        payload.roupa = "ROUPA PRÓPRIA";
        payload.roupa_propria = 1;
        payload.roupa_produto_id = 0;
        payload.roupa_deposito_nome = "";
        payload.roupa_codigo_barras = "";
      } else if (roupaFinalTxt !== "") {
        payload.roupa_propria = 0;
      }

      const json = await enviarRegistroPHP(payload);

      if (json?.sucesso) {
        setWizardMsg({ text: "Registro salvo!", ok: true });

        if ((dataAtualizada as any).tipo_atendimento === "terceiro") {
          const novoId =
            json?.id ??
            json?.novo_id ??
            json?.last_id ??
            (dataAtualizada as any).id ??
            null;
          addTerceiroIdToSession(novoId);
        }

        fetchRegistros();
        setTimeout(() => setWizardOpen(false), 950);
      } else {
        setWizardMsg({
          text: json?.erro || json?.msg || "Erro ao salvar!",
          ok: false,
        });
      }
    } catch (e: any) {
      const msg = String(e?.message || "");

      // ✅ só enfileira offline se for falha de rede / fetch (não validação)
      const isNetwork =
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("ERR_NETWORK") ||
        msg.includes("Load failed") ||
        (msg.includes("fetch") && msg.includes("failed"));

      if (isNetwork) {
        const payload: any = {
          ...dataAtualizada,
          acao: wizardEditing ? "editar" : "novo",
        };

        aplicarEscopoNoPayload(payload);
        if (payload.acao === "editar") {
          try {
            scrubRoupaNoEditar(payload, wizardOriginalRoupaRef.current);
          } catch {
            // se scrub lançar erro aqui, ignora e mantém payload original para não travar o offline
          }
        }
        enqueueOffline(payload, msg);
        setWizardMsg({
          text: "Falha de conexão: registro guardado offline e será enviado automaticamente quando a conexão voltar.",
          ok: true,
        });
        setTimeout(() => setWizardOpen(false), 950);
      } else {
        // ❗ erro real do servidor (ex.: validação 400) -> não enfileira
        setWizardMsg({
          text: msg || "Erro ao salvar!",
          ok: false,
        });
      }
    } finally {
      setWizardSubmitting(false);
      flushOfflineQueue();
    }
  }, [
    salvarGrupoWizard,
    wizardSubmitting,
    wizardRestrictGroup,
    wizardStepIndexesForTipo,
    stepsForTipo,
    obrigatoriosForTipo,
    wizardEditing,
    fetchRegistros,
    flushOfflineQueue,
  ]);

  /* -------------------- Ações (status) -------------------- */
  const abrirPopupAcaoPorId = useCallback((id: Registro["id"]) => {
    setAcaoMsg(null);
    setAcaoId(id != null ? String(id) : null);
    setAcaoSubmitting(false);
    setAcaoOpen(true);
  }, []);

  const registrarAcao = useCallback(
    async (
      acao: string,
      opts?: {
        skipMaterialCheck?: boolean;
        skipConfirm?: boolean;
        extra?: Record<string, any>;
      },
    ): Promise<boolean> => {
      if (acaoSubmitting) return false;
      if (acaoId == null) return false;

      const statusCode = normalizeStatusCode(acao);
      const needsBackendConfirm =
        statusCode === "fase03" || statusCode === "fase04";
      const extraPayload =
        opts?.extra && typeof opts.extra === "object" ? opts.extra : {};

      // ✅ trava fase05 quando um item marcado como utilizado estiver sem metas válidas, além de exigir conexão
      if (statusCode === "fase05") {
        const reg = registros.find(
          (x) => String(x.id) === String(acaoId),
        ) as any;

        // URNA: valida apenas quando o atendimento possui urna selecionada.
        const urnaTxt = String(reg?.urna ?? "").trim();
        if (urnaTxt !== "") {
          const urnaPid = Number(reg?.urna_produto_id ?? 0) || 0;
          if (urnaPid <= 0) {
            setAcaoMsg({
              ok: false,
              text: "Urna: selecione uma urna válida na lista do estoque.",
            });
            return false;
          }
        }

        // ✅ ROUPA (se não for própria)
        const roupaTxt = String(reg?.roupa ?? "").trim();
        const roupaPropria = Number(reg?.roupa_propria ?? 0) ? 1 : 0;

        // Só valida como "roupa de estoque" quando:
        // - tem texto de roupa
        // - e NÃO é roupa própria (nem pelo texto, nem pela flag)
        const precisaValidarRoupaEstoque =
          roupaTxt !== "" && !isRoupaPropria(roupaTxt) && roupaPropria !== 1;

        if (precisaValidarRoupaEstoque) {
          const roupaPid = Number(reg?.roupa_produto_id ?? 0) || 0;
          const roupaDep = String(reg?.roupa_deposito_nome ?? "").trim();

          if (roupaPid <= 0) {
            setAcaoMsg({
              ok: false,
              text: 'Roupa: selecione uma roupa da lista (estoque) ou use "ROUPA PRÓPRIA".',
            });
            return false;
          }

          if (!roupaDep) {
            setAcaoMsg({
              ok: false,
              text: "Roupa: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
            });
            return false;
          }
        }

        // 3) INVOL (se invol = Sim)
        if (isSim(reg?.invol)) {
          const involPid = Number(reg?.invol_produto_id ?? 0) || 0;
          const involDep = String(reg?.invol_deposito_nome ?? "").trim();
          if (involPid <= 0) {
            setAcaoMsg({
              ok: false,
              text: "Invol: selecione um INVOL da lista (estoque).",
            });
            return false;
          }
          if (!involDep) {
            setAcaoMsg({
              ok: false,
              text: "Invol: selecione o local (ARMARIO SANDRO ou ARMARIO ILDO).",
            });
            return false;
          }
        }

        // ✅ VÉU (se veu = Sim)
        if (isSim(reg?.veu)) {
          const veuPid = Number(reg?.veu_produto_id ?? 0) || 0;
          const veuDep = String(reg?.veu_deposito_nome ?? "").trim();
          if (veuPid <= 0) {
            setAcaoMsg({
              ok: false,
              text: "Véu: selecione um VÉU da lista (estoque).",
            });
            return false;
          }
          if (!veuDep) {
            setAcaoMsg({
              ok: false,
              text: "Véu: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
            });
            return false;
          }
        }

        // ✅ CORDÃO (se cordao = Sim)
        if (isSim(reg?.cordao)) {
          const cordaoPid = Number(reg?.cordao_produto_id ?? 0) || 0;
          const cordaoDep = String(reg?.cordao_deposito_nome ?? "").trim();
          if (cordaoPid <= 0) {
            setAcaoMsg({
              ok: false,
              text: "Cordão: selecione um CORDÃO da lista (estoque).",
            });
            return false;
          }
          if (!cordaoDep) {
            setAcaoMsg({
              ok: false,
              text: "Cordão: selecione o local (ARMARIO SANDRO, ARMARIO ILDO ou FUNERARIA).",
            });
            return false;
          }
        }

        // INSUMOS TANATO (se arrumacao_json tiver itens)
        const ins = parseInsumosFromArrumacaoJson(reg?.arrumacao_json);
        if (ins && (!ins.deposito_nome || ins.itens.length === 0)) {
          setAcaoMsg({
            ok: false,
            text: "Insumos Tanatopraxia: selecione depósito e itens com quantidade (>=1).",
          });
          return false;
        }
      }

      // conferência antes do fase11
      if (statusCode === "fase11" && !opts?.skipMaterialCheck) {
        const reg = registros.find((x) => String(x.id) === String(acaoId));
        const mats = reg ? parseMateriaisFromRegistro(reg) : {};

        const itens: MatCheckItem[] = Object.entries(mats || {})
          .map(([k, it]: any) => ({
            key: String(k),
            nome: String(it?.nome || k),
            qtd: Number(it?.qtd ?? 0),
            checked: !!it?.checked,
          }))
          .filter((x) => x.checked && x.qtd > 0)
          .map((x: any) => ({ key: x.key, nome: x.nome, qtd: x.qtd }));

        setMatCheckItens(itens);
        setMatCheckRegistroId(
          reg?.id != null ? String(reg.id) : String(acaoId),
        );
        setMatCheckFalecidoNome(reg ? resolveFalecidoNome(reg) : "");

        setMatCheckReturnToAcao(true);
        setAcaoOpen(false);
        setMatCheckOpen(true);
        return false;
      }

      if (!opts?.skipConfirm) {
        const ok = window.confirm("Deseja confirmar essa ação?");
        if (!ok) return false;
      }

      // Offline (exceto fase05)
      if (!isOnlineNow()) {
        try {
          setAcaoSubmitting(true);
          enqueueOffline(
            {
              acao: "atualizar_status",
              id: acaoId,
              status: statusCode || acao,
              ...extraPayload,
              ...(needsBackendConfirm ? { confirmar: true } : {}),
            },
            "offline",
          );
          setAcaoMsg({
            text: "Sem internet: ação guardada offline e será enviada automaticamente quando a conexão voltar.",
            ok: true,
          });
          setAcaoOpen(false);
          return true;
        } finally {
          setAcaoSubmitting(false);
        }
      }

      // ✅ fase05: dá baixa apenas nos itens realmente selecionados antes de mudar o status
      if (statusCode === "fase05") {
        try {
          setAcaoSubmitting(true);

          const reg = registros.find(
            (x) => String(x.id) === String(acaoId),
          ) as any;
          const registro_id = String(acaoId);

          // 1) URNA, somente quando houver urna selecionada.
          const urnaTxt = String(reg?.urna ?? "").trim();
          const urnaPid = Number(reg?.urna_produto_id ?? 0) || 0;
          if (urnaTxt !== "" && urnaPid > 0) {
            await baixarItensFase05({ registro_id, tipo: "URNA" });
          }

          // 2) ROUPA (se não for própria)
          const roupaTxt = String(reg?.roupa ?? "").trim();
          if (roupaTxt !== "" && !isRoupaPropria(roupaTxt)) {
            await baixarItensFase05({ registro_id, tipo: "ROUPA" });
          }

          // 3) INVOL
          if (isSim(reg?.invol)) {
            await baixarItensFase05({ registro_id, tipo: "INVOL" });
          }

          // 4) VÉU
          if (isSim(reg?.veu)) {
            await baixarItensFase05({ registro_id, tipo: "VEU" });
          }

          // 5) CORDÃO
          if (isSim(reg?.cordao)) {
            await baixarItensFase05({ registro_id, tipo: "CORDAO" });
          }

          // 6) INSUMOS
          const ins = parseInsumosFromArrumacaoJson(reg?.arrumacao_json);
          if (ins && ins.itens.length > 0) {
            await baixarItensFase05({
              registro_id,
              tipo: "INSUMOS",
              deposito_nome: ins.deposito_nome,
              itens: ins.itens,
            });
          }
        } catch (e: any) {
          setAcaoSubmitting(false);
          setAcaoMsg({
            ok: false,
            text: e?.message || "Falha ao dar baixa automática (fase05).",
          });
          return false;
        }
      }

      setAcaoSubmitting(true);
      try {
        const json = await enviarRegistroPHP({
          acao: "atualizar_status",
          id: acaoId,
          status: statusCode || acao,
          ...extraPayload,
          ...(needsBackendConfirm ? { confirmar: true } : {}),
        });

        if (json?.sucesso) {
          setAcaoMsg({
            text: `Status alterado para "${capitalizeStatus(statusCode || acao)}"`,
            ok: true,
          });

          const faseAtual = statusCode || acao;
          const faseInicioTele = teleStartFaseRef.current ?? teleStartFase;
          const teleEstaAtiva = teleActiveRef.current || teleActive;

          const faseEncerraTelemetria =
            faseAtual === "fase02" ||
            faseAtual === "fase08" ||
            faseAtual === "fase10";

          const deveEncerrarPorFluxo =
            teleEstaAtiva &&
            faseInicioTele &&
            STOP_BY_START[faseInicioTele] &&
            STOP_BY_START[faseInicioTele] === faseAtual;

          if (deveEncerrarPorFluxo || faseEncerraTelemetria) {
            console.log("[TELEMETRIA] tentando encerrar", {
              faseAtual,
              faseInicioTele,
              teleEstaAtiva,
              deveEncerrarPorFluxo,
            });

            const salvo = await teleRef.current?.stopAndSave();

            console.log("[TELEMETRIA] retorno stopAndSave", salvo);

            limparTeleAtiva();
          }

          await fetchRegistros();
          setAcaoOpen(false);
          return true;
        }

        setAcaoMsg({
          text: String(json?.msg || json?.erro || "Erro ao atualizar status."),
          ok: false,
        });
        return false;
      } catch (e: any) {
        const msg = String(e?.message || "");

        const isNetwork =
          msg.includes("Failed to fetch") ||
          msg.includes("NetworkError") ||
          msg.includes("ERR_NETWORK") ||
          msg.includes("Load failed") ||
          (msg.includes("fetch") && msg.includes("failed"));

        if (isNetwork) {
          enqueueOffline(
            {
              acao: "atualizar_status",
              id: acaoId,
              status: statusCode || acao,
              ...extraPayload,
              ...(needsBackendConfirm ? { confirmar: true } : {}),
            },
            msg,
          );
          setAcaoMsg({
            text: "Falha de conexão: ação guardada offline e será enviada automaticamente quando a conexão voltar.",
            ok: true,
          });
          setAcaoOpen(false);
          return true;
        }

        setAcaoMsg({ text: msg || "Erro ao atualizar status.", ok: false });
        return false;
      } finally {
        setAcaoSubmitting(false);
        flushOfflineQueue();
      }
    },
    [
      acaoSubmitting,
      acaoId,
      registros,
      teleActive,
      teleStartFase,
      fetchRegistros,
      flushOfflineQueue,
      baixarItensFase05,
      limparTeleAtiva,
    ],
  );

  const confirmarAcaoSilenciosa = useCallback(
    async (fase: string) => {
      const id = teleRegistroIdRef.current ?? teleRegistroId ?? acaoId;
      if (id == null) return;

      const statusCode = normalizeStatusCode(fase);
      const needsBackendConfirm =
        statusCode === "fase03" || statusCode === "fase04";

      if (!isOnlineNow()) {
        enqueueOffline(
          {
            acao: "atualizar_status",
            id,
            status: statusCode || fase,
            ...(needsBackendConfirm ? { confirmar: true } : {}),
          },
          "offline",
        );
        return;
      }

      try {
        await enviarRegistroPHP({
          acao: "atualizar_status",
          id,
          status: statusCode || fase,
          ...(needsBackendConfirm ? { confirmar: true } : {}),
        });

        await fetchRegistros();
      } catch (e: any) {
        enqueueOffline(
          {
            acao: "atualizar_status",
            id,
            status: statusCode || fase,
            ...(needsBackendConfirm ? { confirmar: true } : {}),
          },
          e?.message,
        );
      } finally {
        flushOfflineQueue();
      }
    },
    [teleRegistroId, acaoId, fetchRegistros, flushOfflineQueue],
  );

  /* -------------------- Info por ID -------------------- */
  const registroInfo = useMemo(
    () =>
      infoId != null
        ? (registros.find((x) => String(x.id) === String(infoId)) ?? null)
        : null,
    [registros, infoId],
  );

  // Os títulos do modal Info pertencem ao registro que está aberto.
  // Isso evita herdar o tipo do último cadastro/wizard acessado.
  const wizardStepTitlesInfo = useMemo(() => {
    const tipoDoRegistro = resolveTipoFromRegistro(registroInfo);
    return getWizardConfig(tipoDoRegistro).wizardStepTitles;
  }, [registroInfo]);

  const registroCompartilhar = useMemo(
    () =>
      shareId != null
        ? (registros.find((x) => String(x.id) === String(shareId)) ?? null)
        : null,
    [registros, shareId],
  );

  const infoIdxResolved = useMemo(() => {
    if (infoId == null) return null;
    const idx = registros.findIndex((x) => String(x.id) === String(infoId));
    return idx >= 0 ? idx : null;
  }, [registros, infoId]);

  const abrirInfoPorId = useCallback(
    (id: Registro["id"]) => {
      const normalizedId = id != null ? String(id) : null;

      const registro =
        normalizedId != null
          ? (registros.find((item) => String(item.id) === normalizedId) ?? null)
          : null;

      setTipoAtendimento(resolveTipoFromRegistro(registro));
      setInfoId(normalizedId);
      setInfoOpen(true);
    },
    [registros],
  );

  const abrirCompartilharPorId = useCallback((id: Registro["id"]) => {
    setShareId(id != null ? String(id) : null);
    setShareOpen(true);
  }, []);

  const abrirWizardFromInfo = useCallback(
    (
      tipo: "novo" | "editar",
      _idx: number | null = null,
      grupoStep: number | null = null,
    ) => {
      const idx = infoIdxResolved;
      if (idx != null) {
        setTipoAtendimento(resolveTipoFromRegistro(registros[idx]));
        abrirWizard(tipo, idx, grupoStep);
      }
    },
    [infoIdxResolved, abrirWizard, registros],
  );

  const abrirAssinaturaFromInfo = useCallback(
    (_idx: number, tipo: "recebimento" | "requisicao") => {
      const idx = infoIdxResolved;
      if (idx != null) {
        setSignIdx(idx);
        setSignTipo(tipo);
        setSignOpen(true);
      }
    },
    [infoIdxResolved],
  );

  /* -------------------- Foto obrigatória fase06/fase08 -------------------- */
  const handleFotoAcaoRequired = useCallback(
    (
      id: Registro["id"] | null | undefined,
      fase: string,
      tipo: FotoAcaoTipo,
    ) => {
      const normalizedId = id != null ? String(id) : null;

      setAcaoMsg(null);
      setAcaoId(normalizedId);
      setFotoAcaoId(normalizedId);
      setFotoAcaoFase(fase);
      setFotoAcaoTipo(tipo);

      // fecha o modal de ações e abre o modal da câmera
      setAcaoOpen(false);
      setFotoAcaoOpen(true);
    },
    [],
  );

  /* -------------------- Telemetria -------------------- */
  const handleVeiculoRequired = useCallback(
    (id: Registro["id"] | null | undefined, fase: string) => {
      const normalizedId = id != null ? String(id) : null;
      const tipo = mapFaseToTipo(fase);

      if (!tipo) {
        setAcaoId(normalizedId);
        registrarAcao(fase);
        return;
      }

      setAcaoId(normalizedId);
      definirTeleRegistroId(normalizedId);
      setTeleFase(fase);
      setTeleTipo(tipo);
      setTeleOpen(true);
      setAcaoOpen(false);
    },
    [registrarAcao, definirTeleRegistroId],
  );

  /* -------------------- Resumos -------------------- */
  const materiaisSelecionadosResumo = useMemo(() => {
    const matsPrefer = (wizardData as any)?.materiais;
    const mats: any =
      matsPrefer &&
        typeof matsPrefer === "object" &&
        Object.keys(matsPrefer).length > 0
        ? matsPrefer
        : materiais;

    const list = Object.values(mats || {})
      .filter((it: any) => it?.checked && Number(it?.qtd ?? 0) > 0)
      .map(
        (it: any) => `${String(it?.nome || "Item")} (${Number(it?.qtd ?? 1)})`,
      );

    return list.length ? list.join(" • ") : "Nenhum material selecionado";
  }, [wizardData, materiais]);

  const arrumacaoSelecionadaResumo = useMemo(() => {
    const mapa: { key: keyof ArrumacaoState; label: string }[] = [
      { key: "luvas", label: "Luvas" },
      { key: "palha", label: "Palha" },
      { key: "tamponamento", label: "Tamponamento" },
      { key: "maquiagem", label: "Maquiagem" },
      { key: "algodao", label: "Algodão" },
      { key: "cordao", label: "Cordão" },
      { key: "barba", label: "Barba" },
      { key: "ta32", label: "TA-32" },
      { key: "fluido_cavitario", label: "Fluído Cavitário" },
      { key: "formol", label: "Formol" },
      { key: "mascara", label: "Máscara" },
    ];
    const arr = (wizardData as any).arrumacao || arrumacao;
    return mapa
      .filter((o) => !!(arr as any)?.[o.key])
      .map((o) => o.label)
      .join(" • ");
  }, [wizardData, arrumacao]);

  const findRegistroById = useCallback(
    (id: Registro["id"] | null): Registro | undefined =>
      id == null
        ? undefined
        : registros.find((x) => String(x.id) === String(id)),
    [registros],
  );

  /* -------------------- Render -------------------- */
  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Atendimentos</h1>
        </div>
        <button
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={abrirNovoRegistro}
        >
          Novo Registro
        </button>
      </header>

      <TabelaAtendimentos
        registros={registros}
        onAcao={(id) => abrirPopupAcaoPorId(id)}
        onInfo={(id) => abrirInfoPorId(id)}
        onCompartilhar={(id) => abrirCompartilharPorId(id)}
      />

      <Modal
        open={chooseTipoOpen}
        onClose={() => setChooseTipoOpen(false)}
        ariaLabel="Escolher tipo"
        maxWidth={420}
      >
        <h3 className="text-lg font-semibold">Qual tipo de atendimento?</h3>
        <div className="mt-4 grid gap-2">
          <button
            className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
            onClick={() => iniciarNovoRegistro("funerario")}
          >
            Atendimento Funerário
          </button>
          <button
            className="w-full rounded-md border px-3 py-2 text-sm text-left hover:bg-muted"
            onClick={() => iniciarNovoRegistro("terceiro")}
          >
            Serviço de Outra Empresa
          </button>
        </div>
      </Modal>

      <Wizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        wizardTitle={wizardTitle}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        wizardRestrictGroup={wizardRestrictGroup}
        wizardData={wizardData}
        setWizardData={setWizardData}
        obrigatorios={obrigatoriosForTipo}
        steps={stepsForTipo as any}
        wizardStepIndexes={wizardStepIndexesForTipo}
        wizardStepTitles={wizardStepTitlesForTipo}
        assistenciaVal={assistenciaVal}
        setAssistenciaVal={setAssistenciaVal}
        tanatoVal={tanatoVal}
        setTanatoVal={setTanatoVal}
        materiaisSelecionadosResumo={materiaisSelecionadosResumo}
        arrumacaoSelecionadaResumo={arrumacaoSelecionadaResumo}
        setMateriaisOpen={setMateriaisOpen}
        setArrumacaoOpen={setArrumacaoOpen}
        salvarGrupoWizard={salvarGrupoWizard}
        concluirWizard={concluirWizard}
        wizardSubmitting={wizardSubmitting}
      />

      <MateriaisModal
        open={materiaisOpen}
        setOpen={setMateriaisOpen}
        materiais={materiais}
        setMateriais={setMateriais}
        setWizardData={setWizardData}
      />
      <ArrumacaoModal
        open={arrumacaoOpen}
        setOpen={setArrumacaoOpen}
        arrumacao={arrumacao}
        setArrumacao={setArrumacao}
        setWizardData={setWizardData}
        wizardData={wizardData} // ✅ ESSENCIAL
      />

      <AcaoModal
        open={acaoOpen}
        setOpen={setAcaoOpen}
        registros={registros}
        acaoId={acaoId}
        registrarAcao={registrarAcao}
        acaoMsg={acaoMsg}
        acaoSubmitting={acaoSubmitting}
        onVeiculoRequired={handleVeiculoRequired}
        onFotoAcaoRequired={handleFotoAcaoRequired}
      />

      <FotoAcaoModal
        open={fotoAcaoOpen}
        onClose={() => setFotoAcaoOpen(false)}
        registro={findRegistroById(fotoAcaoId)}
        registroId={fotoAcaoId}
        fase={fotoAcaoFase}
        tipo={fotoAcaoTipo}
        onSaved={async ({ id, fase }) => {
          setAcaoId(id != null ? String(id) : null);
          setFotoAcaoOpen(false);

          // A foto já foi salva; agora confirma a etapa sem perguntar de novo.
          await registrarAcao(fase, { skipConfirm: true });
          await fetchRegistros();
        }}
      />

      <MateriaisConferenciaModal
        open={matCheckOpen}
        itens={matCheckItens}
        onClose={() => {
          setMatCheckOpen(false);
          setMatCheckSaving(false);
          if (matCheckReturnToAcao) setAcaoOpen(true);
          setMatCheckReturnToAcao(false);
        }}
        onConfirm={async (result?: MateriaisConferenciaResult) => {
          if (!result) return;
          try {
            setMatCheckSaving(true);

            const registro_id = matCheckRegistroId ?? acaoId;
            if (!registro_id)
              throw new Error(
                "Não foi possível identificar o atendimento (registro_id).",
              );

            let nomeFinal = (matCheckFalecidoNome || "").trim();
            if (!nomeFinal) {
              const reg = registros.find(
                (x) => String(x.id) === String(registro_id),
              );
              nomeFinal = reg ? resolveFalecidoNome(reg) : "";
            }

            await salvarConferenciaNoPHP({
              registro_id,
              falecido_nome: nomeFinal,
              observacao: result.observacao,
              itens: (result.itens || []).map((it) => ({
                key: String(it.key),
                nome: String(it.nome),
                qtd: Number(it.qtd ?? 0),
                ok: it.ok ? 1 : 0,
                nao_conforme: it.naoConforme ? 1 : 0,
              })),
            });

            setMatCheckOpen(false);
            setMatCheckReturnToAcao(false);
            setMatCheckSaving(false);

            await registrarAcao("fase11", {
              skipMaterialCheck: true,
              skipConfirm: true,
            });
          } catch (e: any) {
            setMatCheckSaving(false);
            alert(e?.message || "Erro ao salvar conferência de materiais.");
          }
        }}
      />

      <InfoModal
        open={infoOpen}
        setOpen={setInfoOpen}
        infoIdx={infoIdxResolved}
        abrirWizard={abrirWizardFromInfo}
        abrirAssinatura={(idx, tipo) => abrirAssinaturaFromInfo(idx, tipo)}
        registro={registroInfo}
        wizardStepTitles={wizardStepTitlesInfo}
      />

      <CompartilharModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        registro={registroCompartilhar}
      />

      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        registro={signIdx != null ? registros[signIdx] : undefined}
        tipo={signTipo}
        onSaved={() => fetchRegistros()}
      />

      <TelemetriaModal
        ref={teleRef}
        open={teleOpen}
        onClose={() => {
          setTeleOpen(false);
          fetchRegistros();
        }}
        registro={findRegistroById(teleRegistroId)}
        fase={teleFase}
        tipo={teleTipo}
        onConfirmAcao={confirmarAcaoSilenciosa}
        onStarted={({ fase }) => {
          marcarTeleAtiva(fase);
        }}
        onSaved={() => {
          limparTeleAtiva();
          fetchRegistros();
        }}
      />

      {matCheckSaving ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4">
          <div className="rounded-xl bg-background p-4 shadow-xl border">
            <div className="text-sm font-medium">Salvando conferência...</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Aguarde um instante.
            </div>
          </div>
        </div>
      ) : null}

      {wizardMsg ? (
        <div className="mt-4">
          <div
            className={`rounded-lg border p-3 text-sm ${wizardMsg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
              }`}
          >
            {wizardMsg.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
