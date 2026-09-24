"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = "https://api.planoassistencialintegrado.com.br/conhecimento.php";

type Department = {
    id: number;
    nome: string;
    slug: string;
    descricao?: string | null;
    ordem: number;
    ativo: number;
    documentos_total?: number;
    documentos_ativos?: number;
};

type Nature = {
    id: number;
    nome: string;
    slug: string;
    descricao?: string | null;
    peso_padrao: number;
    ordem: number;
    ativo: number;
    documentos_total?: number;
    documentos_ativos?: number;
};

type Tag = {
    id?: number;
    nome: string;
    slug?: string;
};

type DocumentStatus = "RASCUNHO" | "PROCESSANDO" | "EM_ANALISE" | "ATIVO" | "SUBSTITUIDO" | "ARQUIVADO";
type ProcessingStatus = "NAO_NECESSARIO" | "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO";
type OriginType = "TEXTO" | "ARQUIVO";

type KnowledgeDocument = {
    id: number;
    departamento_id: number;
    natureza_id: number;
    departamento_nome: string;
    natureza_nome: string;
    titulo: string;
    descricao?: string | null;
    tipo_origem: OriginType;
    conteudo?: string | null;
    texto_extraido?: string | null;
    arquivo_nome_original?: string | null;
    arquivo_path?: string | null;
    arquivo_mime?: string | null;
    arquivo_extensao?: string | null;
    arquivo_tamanho?: number | null;
    total_paginas?: number | null;
    processamento_status: ProcessingStatus;
    processamento_mensagem?: string | null;
    prioridade: number;
    sempre_considerar: number;
    grupo_versao?: string | null;
    versao_numero: number;
    substitui_documento_id?: number | null;
    vigencia_inicio?: string | null;
    vigencia_fim?: string | null;
    status: DocumentStatus;
    aprovado_por?: number | null;
    aprovado_em?: string | null;
    criado_por?: number | null;
    atualizado_por?: number | null;
    created_at: string;
    updated_at: string;
    trechos_total?: number;
    alertas_pendentes?: number;
    tags?: Tag[];
};

type KnowledgeChunk = {
    id: number;
    documento_id: number;
    ordem: number;
    pagina_inicio?: number | null;
    pagina_fim?: number | null;
    secao?: string | null;
    conteudo: string;
    tamanho_caracteres?: number | null;
    ativo: number;
};

type KnowledgeAlert = {
    id: number;
    documento_origem_id: number;
    documento_conflitante_id?: number | null;
    trecho_origem_id?: number | null;
    trecho_conflitante_id?: number | null;
    tipo: string;
    severidade: "INFORMATIVO" | "BAIXO" | "MEDIO" | "ALTO" | "CRITICO" | string;
    titulo: string;
    descricao: string;
    analise?: string | null;
    confianca?: number | null;
    status: "PENDENTE" | "EM_ANALISE" | "RESOLVIDO" | "IGNORADO" | string;
    decisao?: string | null;
    origem_titulo?: string | null;
    origem_departamento?: string | null;
    origem_natureza?: string | null;
    conflitante_titulo?: string | null;
    created_at?: string;
};

type HistoryItem = {
    id: number;
    documento_id?: number | null;
    alerta_id?: number | null;
    usuario_id?: number | null;
    usuario_nome?: string | null;
    acao: string;
    descricao?: string | null;
    documento_titulo?: string | null;
    created_at: string;
};

type Dashboard = {
    documentos_total: number;
    documentos_ativos: number;
    documentos_rascunho: number;
    documentos_em_analise: number;
    documentos_arquivo: number;
    documentos_texto: number;
    departamentos_total?: number;
    naturezas_total?: number;
    trechos_total?: number;
    alertas_total: number;
    alertas_pendentes: number;
    alertas_criticos: number;
    alertas_altos: number;
};

type BootstrapResponse = {
    ok: boolean;
    msg?: string;
    user?: { id?: number; nome?: string; usuario?: string };
    dashboard: Dashboard;
    departamentos: Department[];
    naturezas: Nature[];
    alertas_recentes?: KnowledgeAlert[];
    historico_recente?: HistoryItem[];
    upload?: {
        max_bytes: number;
        max_mb: number;
        extensoes: string[];
        pdf_extractor: boolean;
        docx_extractor: boolean;
    };
};

type DocumentForm = {
    id?: number;
    titulo: string;
    descricao: string;
    departamento_id: string;
    natureza_id: string;
    tipo_origem: OriginType;
    conteudo: string;
    tags: string;
    prioridade: string;
    sempre_considerar: boolean;
    vigencia_inicio: string;
    vigencia_fim: string;
};

const EMPTY_DOCUMENT_FORM: DocumentForm = {
    titulo: "",
    descricao: "",
    departamento_id: "",
    natureza_id: "",
    tipo_origem: "ARQUIVO",
    conteudo: "",
    tags: "",
    prioridade: "100",
    sempre_considerar: false,
    vigencia_inicio: "",
    vigencia_fim: "",
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function numberValue(value: unknown) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function formatBytes(value?: number | null) {
    const size = Number(value || 0);
    if (!size) return "—";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null, withTime = false) {
    if (!value) return "—";
    const d = new Date(value.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("pt-BR", withTime
        ? { dateStyle: "short", timeStyle: "short" }
        : { dateStyle: "short" });
}

function inputDateTime(value?: string | null) {
    if (!value) return "";
    const normalized = value.replace(" ", "T").slice(0, 16);
    return normalized;
}

async function apiJson<T = any>(
    action: string,
    options?: RequestInit,
    params?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
    const search = new URLSearchParams({
        action,
        _: String(Date.now()),
    });

    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
            search.set(key, String(value));
        }
    });

    const response = await fetch(`${API_URL}?${search.toString()}`, {
        credentials: "include",
        cache: "no-store",
        ...options,
        headers: {
            ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
            ...(options?.headers || {}),
        },
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401 || data?.need_login) {
        throw new Error("Sua sessão expirou. Faça login novamente no PAI.");
    }

    if (!response.ok || !data?.ok) {
        const suffix = data?.error_id ? ` (código ${data.error_id})` : "";
        const debug = data?.debug ? ` — ${String(data.debug)}` : "";
        throw new Error(
            `${data?.msg || `Falha na Base de Conhecimento (HTTP ${response.status}).`}${suffix}${debug}`,
        );
    }

    return data as T;
}

async function postJson<T = any>(action: string, payload: Record<string, unknown>) {
    return apiJson<T>(action, { method: "POST", body: JSON.stringify(payload) });
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "sky" | "emerald" | "amber" | "red" | "violet" }) {
    const tones = {
        slate: "bg-slate-100 text-slate-700 ring-slate-200",
        sky: "bg-sky-50 text-sky-700 ring-sky-200",
        emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        amber: "bg-amber-50 text-amber-800 ring-amber-200",
        red: "bg-red-50 text-red-700 ring-red-200",
        violet: "bg-violet-50 text-violet-700 ring-violet-200",
    };
    return <span className={cx("inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset", tones[tone])}>{children}</span>;
}

function statusTone(status: string): "slate" | "sky" | "emerald" | "amber" | "red" | "violet" {
    switch (status) {
        case "ATIVO": return "emerald";
        case "EM_ANALISE":
        case "PROCESSANDO": return "sky";
        case "RASCUNHO": return "amber";
        case "ARQUIVADO":
        case "SUBSTITUIDO": return "slate";
        case "ERRO": return "red";
        default: return "slate";
    }
}

function Icon({ name, className = "h-5 w-5" }: { name: "plus" | "search" | "book" | "upload" | "alert" | "settings" | "file" | "x" | "edit" | "refresh" | "check" | "archive" | "copy" | "chevron" | "menu"; className?: string }) {
    const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
    const paths: Record<string, React.ReactNode> = {
        plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
        search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
        book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z" /></>,
        upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
        alert: <><path d="M12 3 2.5 20h19Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
        settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.37.34.7.64.94.3.24.67.38 1.06.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.66Z" /></>,
        file: <><path d="M6 2h8l4 4v16H6Z" /><path d="M14 2v5h5" /></>,
        x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
        edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
        refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18 9a7 7 0 0 0-12-3l-2 2" /><path d="M6 15a7 7 0 0 0 12 3l2-2" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        archive: <><path d="M3 5h18v4H3Z" /><path d="M5 9v11h14V9" /><path d="M10 13h4" /></>,
        copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
        chevron: <path d="m9 18 6-6-6-6" />,
        menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>,
    };
    return <svg {...common}>{paths[name]}</svg>;
}

function Modal({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={cx("max-h-[94vh] w-full overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200", wide ? "max-w-5xl" : "max-w-2xl")}>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <h2 className="text-base font-semibold text-slate-950">{title}</h2>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950" aria-label="Fechar">
                        <Icon name="x" className="h-5 w-5" />
                    </button>
                </div>
                <div className="max-h-[calc(94vh-65px)] overflow-y-auto p-5">{children}</div>
            </div>
        </div>
    );
}

function StatCard({ label, value, note, tone = "slate" }: { label: string; value: number; note?: string; tone?: "slate" | "red" | "amber" | "emerald" | "sky" }) {
    const styles = {
        slate: "bg-white",
        red: "bg-red-50/70",
        amber: "bg-amber-50/70",
        emerald: "bg-emerald-50/70",
        sky: "bg-sky-50/70",
    };
    return (
        <div className={cx("rounded-2xl border border-slate-200 p-4 shadow-sm", styles[tone])}>
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{numberValue(value).toLocaleString("pt-BR")}</div>
            {note ? <div className="mt-1 text-[11px] text-slate-500">{note}</div> : null}
        </div>
    );
}

export default function KnowledgeBasePage() {
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [natures, setNatures] = useState<Nature[]>([]);
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [documentsTotal, setDocumentsTotal] = useState(0);
    const [alerts, setAlerts] = useState<KnowledgeAlert[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [uploadInfo, setUploadInfo] = useState<BootstrapResponse["upload"]>();

    const [tab, setTab] = useState<"documentos" | "alertas" | "configuracoes">("documentos");
    const [search, setSearch] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [natureFilter, setNatureFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [documentModal, setDocumentModal] = useState(false);
    const [documentForm, setDocumentForm] = useState<DocumentForm>(EMPTY_DOCUMENT_FORM);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const [detailModal, setDetailModal] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument | null>(null);
    const [selectedChunks, setSelectedChunks] = useState<KnowledgeChunk[]>([]);
    const [selectedAlerts, setSelectedAlerts] = useState<KnowledgeAlert[]>([]);
    const [selectedHistory, setSelectedHistory] = useState<HistoryItem[]>([]);

    const [departmentModal, setDepartmentModal] = useState(false);
    const [departmentForm, setDepartmentForm] = useState({ id: 0, nome: "", descricao: "", ordem: "100", ativo: true });
    const [natureModal, setNatureModal] = useState(false);
    const [natureForm, setNatureForm] = useState({ id: 0, nome: "", descricao: "", peso_padrao: "100", ordem: "100", ativo: true });

    const activeDepartments = useMemo(() => departments.filter((x) => Number(x.ativo) === 1), [departments]);
    const activeNatures = useMemo(() => natures.filter((x) => Number(x.ativo) === 1), [natures]);

    const flash = useCallback((message: string, type: "success" | "error" = "success") => {
        if (type === "success") {
            setSuccess(message);
            setError("");
            window.setTimeout(() => setSuccess(""), 4000);
        } else {
            setError(message);
            setSuccess("");
        }
    }, []);

    const loadBootstrap = useCallback(async () => {
        const data = await apiJson<BootstrapResponse>("bootstrap");
        setDashboard(data.dashboard || null);
        setDepartments(Array.isArray(data.departamentos) ? data.departamentos : []);
        setNatures(Array.isArray(data.naturezas) ? data.naturezas : []);
        setAlerts(Array.isArray(data.alertas_recentes) ? data.alertas_recentes : []);
        setHistory(Array.isArray(data.historico_recente) ? data.historico_recente : []);
        setUploadInfo(data.upload);
    }, []);

    const loadDocuments = useCallback(async () => {
        const params = new URLSearchParams({ action: "documentos", limite: "100", _: String(Date.now()) });
        if (search.trim()) params.set("q", search.trim());
        if (departmentFilter) params.set("departamento_id", departmentFilter);
        if (natureFilter) params.set("natureza_id", natureFilter);
        if (statusFilter) params.set("status", statusFilter);
        const data = await apiJson<any>("documentos", undefined, {
            limite: 100,
            q: search.trim() || undefined,
            departamento_id: departmentFilter || undefined,
            natureza_id: natureFilter || undefined,
            status: statusFilter || undefined,
        });
        setDocuments(Array.isArray(data.items) ? data.items : []);
        setDocumentsTotal(numberValue(data.total));
    }, [search, departmentFilter, natureFilter, statusFilter]);

    const loadAlerts = useCallback(async () => {
        const data = await apiJson<{ ok: boolean; items: KnowledgeAlert[] }>("alertas");
        setAlerts(Array.isArray(data.items) ? data.items : []);
    }, []);

    const refreshAll = useCallback(async () => {
        setError("");
        await Promise.all([loadBootstrap(), loadDocuments()]);
    }, [loadBootstrap, loadDocuments]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            try {
                await Promise.all([loadBootstrap(), loadDocuments()]);
            } catch (err) {
                if (mounted) setError(err instanceof Error ? err.message : "Falha ao carregar a Base de Conhecimento.");
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const timer = window.setTimeout(() => {
            loadDocuments().catch((err) => setError(err instanceof Error ? err.message : "Falha na consulta."));
        }, 300);
        return () => window.clearTimeout(timer);
    }, [search, departmentFilter, natureFilter, statusFilter, loadDocuments]);

    function startNewDocument() {
        setSelectedFile(null);
        setDocumentForm({
            ...EMPTY_DOCUMENT_FORM,
            departamento_id: activeDepartments[0] ? String(activeDepartments[0].id) : "",
            natureza_id: activeNatures[0] ? String(activeNatures[0].id) : "",
        });
        setDocumentModal(true);
    }

    async function openDocument(id: number) {
        setDetailModal(true);
        setDetailLoading(true);
        setSelectedDocument(null);
        setSelectedChunks([]);
        setSelectedAlerts([]);
        setSelectedHistory([]);
        try {
            const data = await apiJson<any>("documento", undefined, { id });
            setSelectedDocument(data.documento || null);
            setSelectedChunks(Array.isArray(data.trechos) ? data.trechos : []);
            setSelectedAlerts(Array.isArray(data.alertas) ? data.alertas : []);
            setSelectedHistory(Array.isArray(data.historico) ? data.historico : []);
        } catch (err) {
            setDetailModal(false);
            flash(err instanceof Error ? err.message : "Documento não encontrado.", "error");
        } finally {
            setDetailLoading(false);
        }
    }

    function editSelectedDocument() {
        if (!selectedDocument) return;
        setDocumentForm({
            id: selectedDocument.id,
            titulo: selectedDocument.titulo || "",
            descricao: selectedDocument.descricao || "",
            departamento_id: String(selectedDocument.departamento_id),
            natureza_id: String(selectedDocument.natureza_id),
            tipo_origem: selectedDocument.tipo_origem,
            conteudo: selectedDocument.conteudo || "",
            tags: (selectedDocument.tags || []).map((x) => x.nome).join(", "),
            prioridade: String(selectedDocument.prioridade ?? 100),
            sempre_considerar: Number(selectedDocument.sempre_considerar) === 1,
            vigencia_inicio: inputDateTime(selectedDocument.vigencia_inicio),
            vigencia_fim: inputDateTime(selectedDocument.vigencia_fim),
        });
        setSelectedFile(null);
        setDetailModal(false);
        setDocumentModal(true);
    }

    async function saveDocument(event: FormEvent) {
        event.preventDefault();
        setWorking(true);
        setError("");
        try {
            if (!documentForm.departamento_id || !documentForm.natureza_id) throw new Error("Selecione departamento e natureza.");
            if (!documentForm.titulo.trim()) throw new Error("Informe o título.");
            if (documentForm.tipo_origem === "TEXTO" && !documentForm.conteudo.trim()) throw new Error("Informe o conteúdo do conhecimento.");
            if (documentForm.tipo_origem === "ARQUIVO" && !documentForm.id && !selectedFile) throw new Error("Selecione o arquivo que deseja enviar.");

            const payload: Record<string, unknown> = {
                ...(documentForm.id ? { id: documentForm.id } : {}),
                titulo: documentForm.titulo.trim(),
                descricao: documentForm.descricao.trim(),
                departamento_id: Number(documentForm.departamento_id),
                natureza_id: Number(documentForm.natureza_id),
                prioridade: Number(documentForm.prioridade || 100),
                sempre_considerar: documentForm.sempre_considerar,
                tags: documentForm.tags.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean),
                vigencia_inicio: documentForm.vigencia_inicio || null,
                vigencia_fim: documentForm.vigencia_fim || null,
            };
            if (!documentForm.id) payload.tipo_origem = documentForm.tipo_origem;
            if (documentForm.tipo_origem === "TEXTO") payload.conteudo = documentForm.conteudo;

            const action = documentForm.id ? "editar-documento" : "criar-documento";
            const saved = await postJson<any>(action, payload);
            const documentId = Number(saved.documento?.id || documentForm.id || 0);
            if (!documentId) throw new Error("O servidor não devolveu o ID do conhecimento.");

            if (documentForm.tipo_origem === "ARQUIVO" && selectedFile) {
                const form = new FormData();
                form.append("documento_id", String(documentId));
                form.append("arquivo", selectedFile, selectedFile.name);
                await apiJson("upload", { method: "POST", body: form });
            }

            setDocumentModal(false);
            setSelectedFile(null);
            flash(documentForm.id ? "Conhecimento atualizado." : "Conhecimento criado com sucesso.");
            await refreshAll();
            if (!documentForm.id && documentForm.tipo_origem === "ARQUIVO") await openDocument(documentId);
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível salvar o conhecimento.", "error");
        } finally {
            setWorking(false);
        }
    }

    async function documentAction(action: string, id: number, successMessage: string) {
        if (working) return;
        setWorking(true);
        try {
            const data = await postJson<any>(action, { id });
            flash(data.msg || successMessage);
            await refreshAll();
            if (detailModal) await openDocument(id);
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível concluir a ação.", "error");
        } finally {
            setWorking(false);
        }
    }

    async function createNewVersion(id: number) {
        if (working) return;
        setWorking(true);
        try {
            const data = await postJson<any>("nova-versao", { id });
            const next = data.documento as KnowledgeDocument;
            flash("Nova versão criada como rascunho.");
            await refreshAll();
            setDetailModal(false);
            if (next?.id) await openDocument(next.id);
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível criar nova versão.", "error");
        } finally {
            setWorking(false);
        }
    }

    async function analyzeConflicts(id: number) {
        if (working) return;
        setWorking(true);
        try {
            const data = await postJson<any>("analisar-conflitos", { id });
            flash(`${numberValue(data.resultado?.alertas_criados)} alerta(s) identificado(s) na análise atual.`);
            await Promise.all([refreshAll(), loadAlerts(), openDocument(id)]);
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível analisar os conflitos.", "error");
        } finally {
            setWorking(false);
        }
    }

    async function resolveAlert(alert: KnowledgeAlert, status: "RESOLVIDO" | "IGNORADO") {
        const decision = window.prompt(status === "RESOLVIDO" ? "Registre a decisão tomada:" : "Informe, se desejar, o motivo para ignorar este alerta:", "") ?? "";
        setWorking(true);
        try {
            await postJson("resolver-alerta", { id: alert.id, status, decisao: decision });
            flash(status === "RESOLVIDO" ? "Alerta resolvido." : "Alerta ignorado.");
            await Promise.all([loadBootstrap(), loadAlerts(), loadDocuments()]);
            if (selectedDocument) await openDocument(selectedDocument.id);
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível atualizar o alerta.", "error");
        } finally {
            setWorking(false);
        }
    }

    async function saveDepartment(event: FormEvent) {
        event.preventDefault();
        setWorking(true);
        try {
            await postJson("salvar-departamento", {
                id: departmentForm.id,
                nome: departmentForm.nome,
                descricao: departmentForm.descricao,
                ordem: Number(departmentForm.ordem || 100),
                ativo: departmentForm.ativo,
            });
            setDepartmentModal(false);
            flash(departmentForm.id ? "Departamento atualizado." : "Departamento criado.");
            await loadBootstrap();
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível salvar o departamento.", "error");
        } finally { setWorking(false); }
    }

    async function saveNature(event: FormEvent) {
        event.preventDefault();
        setWorking(true);
        try {
            await postJson("salvar-natureza", {
                id: natureForm.id,
                nome: natureForm.nome,
                descricao: natureForm.descricao,
                peso_padrao: Number(natureForm.peso_padrao || 100),
                ordem: Number(natureForm.ordem || 100),
                ativo: natureForm.ativo,
            });
            setNatureModal(false);
            flash(natureForm.id ? "Natureza atualizada." : "Natureza criada.");
            await loadBootstrap();
        } catch (err) {
            flash(err instanceof Error ? err.message : "Não foi possível salvar a natureza.", "error");
        } finally { setWorking(false); }
    }

    function editDepartment(item: Department) {
        setDepartmentForm({ id: item.id, nome: item.nome, descricao: item.descricao || "", ordem: String(item.ordem ?? 100), ativo: Number(item.ativo) === 1 });
        setDepartmentModal(true);
    }

    function editNature(item: Nature) {
        setNatureForm({ id: item.id, nome: item.nome, descricao: item.descricao || "", peso_padrao: String(item.peso_padrao ?? 100), ordem: String(item.ordem ?? 100), ativo: Number(item.ativo) === 1 });
        setNatureModal(true);
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-50 p-6">
                <div className="mx-auto max-w-7xl animate-pulse space-y-4">
                    <div className="h-10 w-80 rounded-xl bg-slate-200" />
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><div className="h-28 rounded-2xl bg-white" /><div className="h-28 rounded-2xl bg-white" /><div className="h-28 rounded-2xl bg-white" /><div className="h-28 rounded-2xl bg-white" /></div>
                    <div className="h-96 rounded-3xl bg-white" />
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-8 lg:py-7">
                <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm"><Icon name="book" /></div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Base de Conhecimento</h1>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Organize regras, procedimentos, manuais e conhecimentos que serão utilizados pela Aurora.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => refreshAll().catch((err) => flash(err.message, "error"))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><Icon name="refresh" className="h-4 w-4" />Atualizar</button>
                        <button type="button" onClick={startNewDocument} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"><Icon name="plus" className="h-4 w-4" />Adicionar conhecimento</button>
                    </div>
                </header>

                {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
                {success ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

                <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <StatCard label="Documentos" value={dashboard?.documentos_total || 0} note={`${dashboard?.documentos_ativos || 0} ativos`} />
                    <StatCard label="Ativos" value={dashboard?.documentos_ativos || 0} tone="emerald" />
                    <StatCard label="Em análise" value={dashboard?.documentos_em_analise || 0} tone="sky" />
                    <StatCard label="Rascunhos" value={dashboard?.documentos_rascunho || 0} tone="amber" />
                    <StatCard label="Alertas" value={dashboard?.alertas_pendentes || 0} tone={(dashboard?.alertas_pendentes || 0) > 0 ? "amber" : "slate"} note={`${dashboard?.alertas_criticos || 0} críticos`} />
                    <StatCard label="Arquivos" value={dashboard?.documentos_arquivo || 0} note={`${dashboard?.documentos_texto || 0} textos`} />
                </section>

                <section className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 pt-4 sm:px-5">
                            <div className="flex gap-1 overflow-x-auto">
                                {([
                                    ["documentos", "Conhecimentos"],
                                    ["alertas", `Alertas${dashboard?.alertas_pendentes ? ` (${dashboard.alertas_pendentes})` : ""}`],
                                    ["configuracoes", "Departamentos e naturezas"],
                                ] as const).map(([key, label]) => (
                                    <button key={key} type="button" onClick={() => { setTab(key); if (key === "alertas") loadAlerts().catch(() => null); }} className={cx("whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition", tab === key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800")}>{label}</button>
                                ))}
                            </div>
                        </div>

                        {tab === "documentos" ? (
                            <div>
                                <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_170px] sm:px-5">
                                    <label className="relative block">
                                        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar título, descrição ou conteúdo..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                                    </label>
                                    <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">
                                        <option value="">Todos departamentos</option>
                                        {departments.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                                    </select>
                                    <select value={natureFilter} onChange={(e) => setNatureFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">
                                        <option value="">Todas naturezas</option>
                                        {natures.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                                    </select>
                                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400">
                                        <option value="">Todos os status</option>
                                        <option value="ATIVO">Ativo</option>
                                        <option value="EM_ANALISE">Em análise</option>
                                        <option value="RASCUNHO">Rascunho</option>
                                        <option value="PROCESSANDO">Processando</option>
                                        <option value="SUBSTITUIDO">Substituído</option>
                                        <option value="ARQUIVADO">Arquivado</option>
                                    </select>
                                </div>

                                <div className="px-4 py-3 text-xs text-slate-500 sm:px-5">{documentsTotal.toLocaleString("pt-BR")} conhecimento(s)</div>

                                <div className="divide-y divide-slate-100">
                                    {documents.length ? documents.map((doc) => (
                                        <button key={doc.id} type="button" onClick={() => openDocument(doc.id)} className="group flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5">
                                            <div className={cx("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", doc.tipo_origem === "ARQUIVO" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700")}><Icon name={doc.tipo_origem === "ARQUIVO" ? "file" : "book"} className="h-5 w-5" /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold text-slate-950">{doc.titulo}</span>
                                                    <Badge tone={statusTone(doc.status)}>{doc.status.replaceAll("_", " ")}</Badge>
                                                    {numberValue(doc.alertas_pendentes) > 0 ? <Badge tone="red">{doc.alertas_pendentes} alerta(s)</Badge> : null}
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                                                    <span>{doc.departamento_nome}</span><span>•</span><span>{doc.natureza_nome}</span><span>•</span><span>v{doc.versao_numero}</span><span>•</span><span>{doc.tipo_origem === "ARQUIVO" ? (doc.arquivo_nome_original || "Arquivo") : "Texto"}</span>
                                                </div>
                                                {doc.descricao ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{doc.descricao}</p> : null}
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {(doc.tags || []).slice(0, 6).map((tag) => <span key={`${doc.id}-${tag.nome}`} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600">#{tag.nome}</span>)}
                                                </div>
                                            </div>
                                            <div className="hidden shrink-0 text-right text-[11px] text-slate-400 sm:block"><div>{doc.trechos_total || 0} trechos</div><div className="mt-1">{formatDate(doc.updated_at)}</div></div>
                                            <Icon name="chevron" className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                                        </button>
                                    )) : <div className="px-5 py-16 text-center text-sm text-slate-500">Nenhum conhecimento encontrado com os filtros atuais.</div>}
                                </div>
                            </div>
                        ) : null}

                        {tab === "alertas" ? (
                            <div className="divide-y divide-slate-100">
                                {alerts.length ? alerts.map((alert) => (
                                    <div key={alert.id} className="p-4 sm:p-5">
                                        <div className="flex items-start gap-3">
                                            <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", alert.severidade === "CRITICO" ? "bg-red-100 text-red-700" : alert.severidade === "ALTO" ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700")}><Icon name="alert" className="h-5 w-5" /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-slate-950">{alert.titulo}</div><Badge tone={alert.severidade === "CRITICO" ? "red" : "amber"}>{alert.severidade}</Badge><Badge>{alert.tipo.replaceAll("_", " ")}</Badge></div>
                                                <p className="mt-1 text-sm leading-6 text-slate-600">{alert.descricao}</p>
                                                {alert.analise ? <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{alert.analise}</p> : null}
                                                <div className="mt-2 text-xs text-slate-500">Origem: <button type="button" className="font-semibold text-sky-700 hover:underline" onClick={() => openDocument(alert.documento_origem_id)}>{alert.origem_titulo || `Documento #${alert.documento_origem_id}`}</button>{alert.conflitante_titulo ? <> · Potencial conflito: <span className="font-medium text-slate-700">{alert.conflitante_titulo}</span></> : null}</div>
                                                {alert.status === "PENDENTE" || alert.status === "EM_ANALISE" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working} onClick={() => resolveAlert(alert, "RESOLVIDO")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolver</button><button type="button" disabled={working} onClick={() => resolveAlert(alert, "IGNORADO")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Ignorar</button></div> : <div className="mt-3"><Badge tone="slate">{alert.status}</Badge></div>}
                                            </div>
                                        </div>
                                    </div>
                                )) : <div className="px-5 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="check" /></div><div className="mt-3 font-semibold text-slate-900">Nenhum alerta encontrado</div><div className="mt-1 text-sm text-slate-500">A base não possui alertas registrados neste momento.</div></div>}
                            </div>
                        ) : null}

                        {tab === "configuracoes" ? (
                            <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200">
                                    <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><div className="font-semibold text-slate-950">Departamentos</div><div className="mt-0.5 text-xs text-slate-500">Áreas principais em que a Aurora atua.</div></div><button type="button" onClick={() => { setDepartmentForm({ id: 0, nome: "", descricao: "", ordem: "100", ativo: true }); setDepartmentModal(true); }} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">+ Novo</button></div>
                                    <div className="divide-y divide-slate-100">{departments.map((dep) => <button key={dep.id} type="button" onClick={() => editDepartment(dep)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{dep.nome}</span>{Number(dep.ativo) !== 1 ? <Badge>Inativo</Badge> : null}</div><div className="mt-1 line-clamp-1 text-xs text-slate-500">{dep.descricao || "Sem descrição"}</div></div><div className="text-right text-[11px] text-slate-400"><div>{numberValue(dep.documentos_total)} documentos</div><div>{numberValue(dep.documentos_ativos)} ativos</div></div><Icon name="edit" className="h-4 w-4 text-slate-400" /></button>)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200">
                                    <div className="flex items-center justify-between border-b border-slate-200 p-4"><div><div className="font-semibold text-slate-950">Naturezas</div><div className="mt-0.5 text-xs text-slate-500">Regra, procedimento, manual, conhecimento e futuras categorias.</div></div><button type="button" onClick={() => { setNatureForm({ id: 0, nome: "", descricao: "", peso_padrao: "100", ordem: "100", ativo: true }); setNatureModal(true); }} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">+ Nova</button></div>
                                    <div className="divide-y divide-slate-100">{natures.map((nat) => <button key={nat.id} type="button" onClick={() => editNature(nat)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{nat.nome}</span>{Number(nat.ativo) !== 1 ? <Badge>Inativa</Badge> : null}</div><div className="mt-1 line-clamp-1 text-xs text-slate-500">{nat.descricao || "Sem descrição"}</div></div><div className="text-right text-[11px] text-slate-400"><div>Peso {nat.peso_padrao}</div><div>{numberValue(nat.documentos_total)} documentos</div></div><Icon name="edit" className="h-4 w-4 text-slate-400" /></button>)}</div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between"><div className="font-semibold text-slate-950">Departamentos</div><button type="button" onClick={() => setTab("configuracoes")} className="text-xs font-semibold text-sky-700 hover:underline">Gerenciar</button></div>
                            <div className="mt-3 space-y-2">{activeDepartments.slice(0, 8).map((dep) => <button key={dep.id} type="button" onClick={() => { setDepartmentFilter(String(dep.id)); setTab("documentos"); }} className={cx("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition", departmentFilter === String(dep.id) ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100")}><span className="font-semibold">{dep.nome}</span><span className={cx("text-xs", departmentFilter === String(dep.id) ? "text-slate-300" : "text-slate-400")}>{numberValue(dep.documentos_ativos)}</span></button>)}</div>
                        </div>

                        <div className={cx("rounded-3xl border p-4 shadow-sm", (dashboard?.alertas_pendentes || 0) > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white")}>
                            <div className="flex items-start gap-3"><div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", (dashboard?.alertas_pendentes || 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700")}><Icon name={(dashboard?.alertas_pendentes || 0) > 0 ? "alert" : "check"} className="h-5 w-5" /></div><div><div className="font-semibold text-slate-950">Central de alertas</div><div className="mt-1 text-xs leading-5 text-slate-600">{dashboard?.alertas_pendentes ? `${dashboard.alertas_pendentes} alerta(s) aguardando revisão. ${dashboard.alertas_criticos || 0} classificado(s) como crítico(s).` : "Nenhum alerta pendente na Base de Conhecimento."}</div>{dashboard?.alertas_pendentes ? <button type="button" onClick={() => { setTab("alertas"); loadAlerts().catch(() => null); }} className="mt-3 text-xs font-bold text-amber-800 hover:underline">Revisar alertas</button> : null}</div></div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="font-semibold text-slate-950">Processamento de arquivos</div>
                            <div className="mt-3 space-y-2 text-xs text-slate-600">
                                <div className="flex justify-between gap-3"><span>Tamanho máximo</span><strong className="text-slate-900">{uploadInfo?.max_mb ?? 25} MB</strong></div>
                                <div className="flex justify-between gap-3"><span>PDF</span><Badge tone={uploadInfo?.pdf_extractor ? "emerald" : "amber"}>{uploadInfo?.pdf_extractor ? "Extração disponível" : "Requer extrator"}</Badge></div>
                                <div className="flex justify-between gap-3"><span>DOCX</span><Badge tone={uploadInfo?.docx_extractor ? "emerald" : "amber"}>{uploadInfo?.docx_extractor ? "Extração disponível" : "Requer ZipArchive"}</Badge></div>
                                <div className="pt-1 text-[11px] text-slate-400">Formatos: {(uploadInfo?.extensoes || ["pdf", "txt", "md", "docx"]).join(", ").toUpperCase()}</div>
                            </div>
                        </div>

                        {history.length ? <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="font-semibold text-slate-950">Atividade recente</div><div className="mt-3 space-y-3">{history.slice(0, 6).map((item) => <div key={item.id} className="border-l-2 border-slate-200 pl-3"><div className="text-xs font-medium text-slate-700">{item.descricao || item.acao.replaceAll("_", " ")}</div><div className="mt-0.5 text-[10px] text-slate-400">{item.usuario_nome || "Sistema"} · {formatDate(item.created_at, true)}</div></div>)}</div></div> : null}
                    </aside>
                </section>
            </div>

            <Modal open={documentModal} title={documentForm.id ? "Editar conhecimento" : "Adicionar conhecimento"} onClose={() => !working && setDocumentModal(false)} wide>
                <form onSubmit={saveDocument} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Título *</span><input value={documentForm.titulo} onChange={(e) => setDocumentForm((v) => ({ ...v, titulo: e.target.value }))} maxLength={255} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Ex.: Regras de ações de um atendimento" /></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Departamento *</span><select value={documentForm.departamento_id} onChange={(e) => setDocumentForm((v) => ({ ...v, departamento_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"><option value="">Selecione</option>{activeDepartments.map((dep) => <option key={dep.id} value={dep.id}>{dep.nome}</option>)}</select></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Natureza *</span><select value={documentForm.natureza_id} onChange={(e) => setDocumentForm((v) => ({ ...v, natureza_id: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400"><option value="">Selecione</option>{activeNatures.map((nat) => <option key={nat.id} value={nat.id}>{nat.nome}</option>)}</select></label>
                        <label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Descrição</span><textarea value={documentForm.descricao} onChange={(e) => setDocumentForm((v) => ({ ...v, descricao: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Explique resumidamente o objetivo deste conhecimento." /></label>
                    </div>

                    {!documentForm.id ? <div><div className="mb-2 text-xs font-semibold text-slate-700">Origem *</div><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setDocumentForm((v) => ({ ...v, tipo_origem: "ARQUIVO" }))} className={cx("rounded-2xl border p-4 text-left transition", documentForm.tipo_origem === "ARQUIVO" ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 hover:bg-slate-50")}><div className="flex items-center gap-2 font-semibold text-slate-900"><Icon name="upload" className="h-4 w-4" />Arquivo</div><div className="mt-1 text-xs leading-5 text-slate-500">PDF, TXT, Markdown ou DOCX. O servidor extrairá e dividirá o conteúdo em trechos.</div></button><button type="button" onClick={() => { setSelectedFile(null); setDocumentForm((v) => ({ ...v, tipo_origem: "TEXTO" })); }} className={cx("rounded-2xl border p-4 text-left transition", documentForm.tipo_origem === "TEXTO" ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:bg-slate-50")}><div className="flex items-center gap-2 font-semibold text-slate-900"><Icon name="book" className="h-4 w-4" />Texto</div><div className="mt-1 text-xs leading-5 text-slate-500">Cadastre diretamente uma regra, procedimento ou conhecimento escrito.</div></button></div></div> : null}

                    {documentForm.tipo_origem === "ARQUIVO" ? (
                        <div>
                            <div className="mb-1.5 text-xs font-semibold text-slate-700">Arquivo {documentForm.id ? "(opcional para substituir/reprocessar)" : "*"}</div>
                            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                            <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-sky-400 hover:bg-sky-50/50"><Icon name="upload" className="h-6 w-6 text-slate-500" /><div className="mt-2 text-sm font-semibold text-slate-800">{selectedFile ? selectedFile.name : "Clique para selecionar o arquivo"}</div><div className="mt-1 text-xs text-slate-500">{selectedFile ? `${formatBytes(selectedFile.size)} · ${selectedFile.type || "arquivo"}` : `Até ${uploadInfo?.max_mb ?? 25} MB · ${(uploadInfo?.extensoes || ["pdf", "txt", "md", "docx"]).join(", ").toUpperCase()}`}</div></button>
                        </div>
                    ) : (
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Conteúdo *</span><textarea value={documentForm.conteudo} onChange={(e) => setDocumentForm((v) => ({ ...v, conteudo: e.target.value }))} rows={12} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" placeholder="Digite aqui o conhecimento, regra ou procedimento que a Aurora deverá considerar..." /></label>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Tags</span><input value={documentForm.tags} onChange={(e) => setDocumentForm((v) => ({ ...v, tags: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" placeholder="atendimento, remoção, veículo, confirmação" /><span className="mt-1 block text-[11px] text-slate-400">Separe por vírgulas. Elas ajudam na organização e recuperação futura.</span></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Prioridade</span><input type="number" min={0} max={10000} value={documentForm.prioridade} onChange={(e) => setDocumentForm((v) => ({ ...v, prioridade: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" /></label>
                        <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 px-3 py-3"><input type="checkbox" checked={documentForm.sempre_considerar} onChange={(e) => setDocumentForm((v) => ({ ...v, sempre_considerar: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" /><span><span className="block text-xs font-semibold text-slate-700">Sempre considerar</span><span className="block text-[10px] text-slate-400">Use apenas para conhecimento realmente global.</span></span></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Vigência inicial</span><input type="datetime-local" value={documentForm.vigencia_inicio} onChange={(e) => setDocumentForm((v) => ({ ...v, vigencia_inicio: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" /></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Vigência final</span><input type="datetime-local" value={documentForm.vigencia_fim} onChange={(e) => setDocumentForm((v) => ({ ...v, vigencia_fim: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" /></label>
                    </div>

                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={working} onClick={() => setDocumentModal(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancelar</button><button type="submit" disabled={working} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">{working ? "Salvando..." : documentForm.id ? "Salvar alterações" : "Criar conhecimento"}</button></div>
                </form>
            </Modal>

            <Modal open={detailModal} title="Detalhes do conhecimento" onClose={() => setDetailModal(false)} wide>
                {detailLoading ? <div className="py-16 text-center text-sm text-slate-500">Carregando conhecimento...</div> : selectedDocument ? (
                    <div className="space-y-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-slate-950">{selectedDocument.titulo}</h3><Badge tone={statusTone(selectedDocument.status)}>{selectedDocument.status.replaceAll("_", " ")}</Badge>{selectedDocument.alertas_pendentes ? <Badge tone="red">{selectedDocument.alertas_pendentes} alerta(s)</Badge> : null}</div><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><span>{selectedDocument.departamento_nome}</span><span>•</span><span>{selectedDocument.natureza_nome}</span><span>•</span><span>Versão {selectedDocument.versao_numero}</span><span>•</span><span>Prioridade {selectedDocument.prioridade}</span></div>{selectedDocument.descricao ? <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{selectedDocument.descricao}</p> : null}</div>
                            <div className="flex flex-wrap gap-2"><button type="button" onClick={editSelectedDocument} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Icon name="edit" className="h-4 w-4" />Editar</button><button type="button" disabled={working} onClick={() => analyzeConflicts(selectedDocument.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"><Icon name="alert" className="h-4 w-4" />Analisar conflitos</button></div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400">Origem</div><div className="mt-1 text-sm font-semibold text-slate-900">{selectedDocument.tipo_origem}</div></div>
                            <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400">Processamento</div><div className="mt-1"><Badge tone={statusTone(selectedDocument.processamento_status)}>{selectedDocument.processamento_status.replaceAll("_", " ")}</Badge></div></div>
                            <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400">Trechos</div><div className="mt-1 text-sm font-semibold text-slate-900">{selectedDocument.trechos_total || selectedChunks.length}</div></div>
                            <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400">Atualizado</div><div className="mt-1 text-sm font-semibold text-slate-900">{formatDate(selectedDocument.updated_at, true)}</div></div>
                        </div>

                        {selectedDocument.tipo_origem === "ARQUIVO" ? <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon name="file" /></div><div className="min-w-0 flex-1"><div className="font-semibold text-slate-900">{selectedDocument.arquivo_nome_original || "Arquivo enviado"}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>{formatBytes(selectedDocument.arquivo_tamanho)}</span>{selectedDocument.total_paginas ? <span>{selectedDocument.total_paginas} páginas</span> : null}{selectedDocument.arquivo_extensao ? <span>{selectedDocument.arquivo_extensao.toUpperCase()}</span> : null}</div>{selectedDocument.processamento_mensagem ? <div className="mt-2 text-xs text-amber-700">{selectedDocument.processamento_mensagem}</div> : null}</div>{selectedDocument.processamento_status === "ERRO" || selectedDocument.processamento_status === "PENDENTE" ? <button type="button" disabled={working} onClick={() => documentAction("reprocessar", selectedDocument.id, "Documento reprocessado.")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Reprocessar</button> : null}</div></div> : null}

                        {(selectedDocument.tags || []).length ? <div className="flex flex-wrap gap-2">{selectedDocument.tags!.map((tag) => <span key={tag.nome} className="rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">#{tag.nome}</span>)}</div> : null}

                        {selectedDocument.tipo_origem === "TEXTO" && selectedDocument.conteudo ? <div><div className="mb-2 text-sm font-semibold text-slate-900">Conteúdo</div><div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selectedDocument.conteudo}</div></div> : null}

                        <div className="flex flex-wrap gap-2 border-y border-slate-100 py-4">
                            {selectedDocument.status !== "ATIVO" && selectedDocument.status !== "ARQUIVADO" ? <button type="button" disabled={working} onClick={() => documentAction("publicar", selectedDocument.id, "Conhecimento publicado.")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Icon name="check" className="h-4 w-4" />Publicar</button> : null}
                            {selectedDocument.status === "ARQUIVADO" ? <button type="button" disabled={working} onClick={() => documentAction("reativar", selectedDocument.id, "Conhecimento reativado.")} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Icon name="refresh" className="h-4 w-4" />Reativar</button> : null}
                            {selectedDocument.status !== "ARQUIVADO" ? <button type="button" disabled={working} onClick={() => documentAction("arquivar", selectedDocument.id, "Conhecimento arquivado.")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><Icon name="archive" className="h-4 w-4" />Arquivar</button> : null}
                            <button type="button" disabled={working} onClick={() => createNewVersion(selectedDocument.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><Icon name="copy" className="h-4 w-4" />Nova versão</button>
                        </div>

                        {selectedAlerts.length ? <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon name="alert" className="h-4 w-4 text-amber-600" />Alertas deste conhecimento</div><div className="space-y-2">{selectedAlerts.map((alert) => <div key={alert.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-900">{alert.titulo}</span><Badge tone={alert.severidade === "CRITICO" ? "red" : "amber"}>{alert.severidade}</Badge></div><p className="mt-1 text-xs leading-5 text-slate-600">{alert.descricao}</p>{alert.status === "PENDENTE" || alert.status === "EM_ANALISE" ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => resolveAlert(alert, "RESOLVIDO")} className="text-xs font-semibold text-emerald-700">Resolver</button><button type="button" onClick={() => resolveAlert(alert, "IGNORADO")} className="text-xs font-semibold text-slate-600">Ignorar</button></div> : null}</div>)}</div></div> : null}

                        {selectedChunks.length ? <details className="rounded-2xl border border-slate-200"><summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-900">Trechos processados ({selectedChunks.length})</summary><div className="max-h-[500px] divide-y divide-slate-100 overflow-y-auto border-t border-slate-200">{selectedChunks.map((chunk) => <div key={chunk.id} className="p-4"><div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-400"><span>Trecho {chunk.ordem}</span>{chunk.pagina_inicio ? <span>• pág. {chunk.pagina_inicio}{chunk.pagina_fim && chunk.pagina_fim !== chunk.pagina_inicio ? `–${chunk.pagina_fim}` : ""}</span> : null}{chunk.secao ? <span>• {chunk.secao}</span> : null}</div><div className="whitespace-pre-wrap text-xs leading-5 text-slate-600">{chunk.conteudo}</div></div>)}</div></details> : null}

                        {selectedHistory.length ? <details className="rounded-2xl border border-slate-200"><summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-900">Histórico e auditoria ({selectedHistory.length})</summary><div className="divide-y divide-slate-100 border-t border-slate-200">{selectedHistory.map((item) => <div key={item.id} className="p-3 text-xs"><div className="font-medium text-slate-700">{item.descricao || item.acao}</div><div className="mt-1 text-[10px] text-slate-400">{item.usuario_nome || "Sistema"} · {formatDate(item.created_at, true)}</div></div>)}</div></details> : null}
                    </div>
                ) : null}
            </Modal>

            <Modal open={departmentModal} title={departmentForm.id ? "Editar departamento" : "Novo departamento"} onClose={() => setDepartmentModal(false)}>
                <form onSubmit={saveDepartment} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-semibold">Nome *</span><input value={departmentForm.nome} onChange={(e) => setDepartmentForm((v) => ({ ...v, nome: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" placeholder="Ex.: RECURSOS HUMANOS" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold">Descrição</span><textarea rows={4} value={departmentForm.descricao} onChange={(e) => setDepartmentForm((v) => ({ ...v, descricao: e.target.value }))} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-sky-400" /></label><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-semibold">Ordem</span><input type="number" value={departmentForm.ordem} onChange={(e) => setDepartmentForm((v) => ({ ...v, ordem: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-3"><input type="checkbox" checked={departmentForm.ativo} onChange={(e) => setDepartmentForm((v) => ({ ...v, ativo: e.target.checked }))} /> <span className="text-sm font-medium">Ativo</span></label></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setDepartmentModal(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={working} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Salvar</button></div></form>
            </Modal>

            <Modal open={natureModal} title={natureForm.id ? "Editar natureza" : "Nova natureza"} onClose={() => setNatureModal(false)}>
                <form onSubmit={saveNature} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-semibold">Nome *</span><input value={natureForm.nome} onChange={(e) => setNatureForm((v) => ({ ...v, nome: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400" placeholder="Ex.: POLÍTICA INTERNA" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold">Descrição</span><textarea rows={4} value={natureForm.descricao} onChange={(e) => setNatureForm((v) => ({ ...v, descricao: e.target.value }))} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-sky-400" /></label><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-semibold">Peso padrão</span><input type="number" min={0} max={10000} value={natureForm.peso_padrao} onChange={(e) => setNatureForm((v) => ({ ...v, peso_padrao: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label><span className="mb-1.5 block text-xs font-semibold">Ordem</span><input type="number" value={natureForm.ordem} onChange={(e) => setNatureForm((v) => ({ ...v, ordem: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3"><input type="checkbox" checked={natureForm.ativo} onChange={(e) => setNatureForm((v) => ({ ...v, ativo: e.target.checked }))} /> <span className="text-sm font-medium">Ativa</span></label><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setNatureModal(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={working} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Salvar</button></div></form>
            </Modal>
        </main>
    );
}
