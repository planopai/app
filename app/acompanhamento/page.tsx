"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrumacaoState, MateriaisState, Registro, Aviso } from "./components/types";
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
} from "./components/helpers";

import TabelaAtendimentos from "./components/TabelaAtendimentos";
import AvisosBox from "./components/AvisosBox";
import Wizard from "./components/Wizard";
import MateriaisModal from "./components/MateriaisModal";
import ArrumacaoModal from "./components/ArrumacaoModal";
import AcaoModal from "./components/AcaoModal";
import InfoModal from "./components/InfoModal";
import SignatureModal from "./components/SignatureModal";
import Modal from "./components/Modal";

type TipoAtendimento = "funerario" | "terceiro";

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
    if ((r as any)?.tipo_atendimento === "terceiro") return "terceiro";
    const asst = (r.assistencia || "").toString().toLowerCase();
    const tan = (r.tanato || "").toString().toLowerCase();
    const orn = (r.ornamentacao || "").toString().toLowerCase();
    if (asst === "não" && tan === "não" && orn === "não") return "terceiro";
    return "funerario";
}

/* -------------------- Config dinâmico por tipo -------------------- */
function getWizardConfig(tipo: TipoAtendimento) {
    // índices conforme constants.ts (comentários de lá)
    // Padrao:
    // [ [0,1,2,3,17], [4,5,6,7,8,9,10,18], [11,12,13,19], [14,15,16,20] ]
    if (tipo === "terceiro") {
        const wizardStepIndexes = [
            // Atendimento enxuto
            [0, 1, 17],
            // (SEM Itens)
            // Velório
            [11, 12, 13, 19],
            // Sepultamento
            [14, 15, 16, 20],
        ];
        const wizardStepTitles = ["Atendimento", "Velório", "Sepultamento"];
        const obrigatorios: string[] = []; // nada obrigatório
        return { wizardStepIndexes, wizardStepTitles, obrigatorios, steps: stepsPadrao };
    }
    // Funerário normal
    return {
        wizardStepIndexes: wizardStepIndexesPadrao as number[][],
        wizardStepTitles: wizardStepTitlesPadrao as string[],
        obrigatorios: obrigatoriosPadrao as string[],
        steps: stepsPadrao,
    };
}

export default function AcompanhamentoPage() {
    // Tabela
    const [registros, setRegistros] = useState<Registro[]>([]);

    // Avisos
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // Tipo do cadastro atual
    const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("funerario");

    // Wizard
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardTitle, setWizardTitle] = useState("Novo Registro");
    const [wizardEditing, setWizardEditing] = useState(false);
    const [wizardIdx, setWizardIdx] = useState<number | null>(null);
    const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState<Registro>({});
    const [wizardMsg, setWizardMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [wizardSubmitting, setWizardSubmitting] = useState(false);

    // selects
    const [assistenciaVal, setAssistenciaVal] = useState<string>("");
    const [tanatoVal, setTanatoVal] = useState<string>("");

    // Materiais
    const [materiaisOpen, setMateriaisOpen] = useState(false);
    const [materiais, setMateriais] = useState<MateriaisState>(defaultMateriais());

    // Arrumação
    const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
    const [arrumacao, setArrumacao] = useState<ArrumacaoState>(defaultArrumacao());

    // Ações (por ID)
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoId, setAcaoId] = useState<Registro["id"] | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [acaoSubmitting, setAcaoSubmitting] = useState(false);

    // Info — agora por ID (evita desindexar com polling)
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoId, setInfoId] = useState<Registro["id"] | null>(null);

    // Assinatura
    const [signOpen, setSignOpen] = useState(false);
    const [signTipo, setSignTipo] = useState<"recebimento" | "requisicao">("recebimento");
    const [signIdx, setSignIdx] = useState<number | null>(null);

    // Modal: escolha do tipo ao clicar em "Novo Registro"
    const [chooseTipoOpen, setChooseTipoOpen] = useState(false);

    /* -------------------- Config corrente por tipo -------------------- */
    const {
        wizardStepIndexes: wizardStepIndexesForTipo,
        wizardStepTitles: wizardStepTitlesForTipo,
        obrigatorios: obrigatoriosForTipo,
        steps: stepsForTipo,
    } = useMemo(() => getWizardConfig(tipoAtendimento), [tipoAtendimento]);

    /* -------------------- Fetch helpers -------------------- */

    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/informativo.php?listar=1&_nocache=${Date.now()}`, {
                cache: "no-store",
                headers: {
                    Pragma: "no-cache",
                    Expires: "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
                credentials: "include",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
                    id: it?.id != null ? String(it.id) : it.id,
                    status: normalizarStatus(it?.status) ?? it?.status,
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/avisos.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
            });
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
            const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensagem: val }),
            });
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso adicionado!", ok: true });
                if (avisoInputRef.current) avisoInputRef.current.value = "";
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao adicionar!", ok: false });
            }
        } catch (e: any) {
            setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, mensagem }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao editar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao editar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const excluirAviso = useCallback(
        async (id: number | string) => {
            if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, excluir: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso excluído!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao excluir!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao excluir!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const finalizarAviso = useCallback(
        async (id: number | string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, finalizar: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao finalizar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    /* -------------------- Ciclos -------------------- */

    useEffect(() => {
        fetchRegistros();
        fetchAvisos();
    }, [fetchRegistros, fetchAvisos]);

    useEffect(() => {
        const intReg = setInterval(fetchRegistros, 10000);
        const intAv = setInterval(fetchAvisos, 3000);

        const onVis = () => {
            if (!document.hidden) fetchRegistros();
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            clearInterval(intReg);
            clearInterval(intAv);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [fetchRegistros, fetchAvisos]);

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setWizardOpen(false);
                setAcaoOpen(false);
                setInfoOpen(false);
                setMateriaisOpen(false);
                setArrumacaoOpen(false);
                setSignOpen(false);
                setChooseTipoOpen(false);
            }
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, []);

    /* -------------------- Parsers locais -------------------- */

    const parseMateriaisFromRegistro = (r: Registro): MateriaisState => {
        if (r.materiais_json) {
            try {
                const parsed = JSON.parse(String(r.materiais_json));
                const base = defaultMateriais();
                Object.keys(base).forEach((k) => {
                    const qtdCol = (r as any)[`materiais_${k}_qtd`];
                    const parsedItem = (parsed as any)?.[k];
                    (base as any)[k] = {
                        checked: !!parsedItem?.checked || Number(qtdCol) > 0 || !!parsedItem?.qtd,
                        qtd: Number(parsedItem?.qtd ?? (qtdCol != null ? qtdCol : 0)),
                    };
                });
                return base;
            } catch {
                // segue fallback
            }
        }
        const base = defaultMateriais();
        Object.keys(base).forEach((k) => {
            const qtdCol = (r as any)[`materiais_${k}_qtd`];
            const qtd = Number(qtdCol ?? 0);
            (base as any)[k] = { checked: qtd > 0, qtd };
        });
        return base;
    };

    const parseArrumacaoFromRegistro = (r: Registro): ArrumacaoState => {
        if (r.arrumacao_json) {
            try {
                const parsed = JSON.parse(String(r.arrumacao_json));
                return { ...defaultArrumacao(), ...parsed };
            } catch {
                // ignore
            }
        }
        return defaultArrumacao();
    };

    /* -------------------- Aberturas -------------------- */

    // Modal que pergunta o tipo
    const abrirNovoRegistro = useCallback(() => {
        setChooseTipoOpen(true);
    }, []);

    const iniciarNovoRegistro = useCallback((tipo: TipoAtendimento) => {
        setChooseTipoOpen(false);
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
            empty.assistencia = "Não";
            empty.tanato = "Não";
            empty.ornamentacao = "Não";
            (empty as any).tipo_atendimento = "terceiro";
        } else {
            (empty as any).tipo_atendimento = "funerario";
        }

        setWizardData(empty);
        setMateriais(defaultMateriais());
        setArrumacao(defaultArrumacao());
        setAssistenciaVal(String(empty.assistencia || ""));
        setTanatoVal(String(empty.tanato || ""));
        setWizardOpen(true);
    }, []);

    const abrirWizard = useCallback(
        (tipo: "novo" | "editar", idx: number | null = null, grupoStep: number | null = null) => {
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

                // ajusta o "tipo" de edição conforme o registro
                setTipoAtendimento(resolveTipoFromRegistro(r));

                const data: Registro = {};
                (stepsPadrao as any).forEach((s: any) => {
                    (data as any)[s.id] = (r as any)[s.id] ?? "";
                });
                data.id = r.id;

                const mats = parseMateriaisFromRegistro(r);
                setMateriais(mats);
                (data as any).materiais = mats;

                const arr = parseArrumacaoFromRegistro(r);
                setArrumacao(arr);
                (data as any).arrumacao = arr;

                setWizardData(data);
                setAssistenciaVal(String((r.assistencia ?? "") as string));
                setTanatoVal(String((r.tanato ?? "") as string));
            } else {
                // novo (quando vier direto deste caminho)
                iniciarNovoRegistro(tipoAtendimento);
                return;
            }

            setWizardOpen(true);
        },
        [registros, iniciarNovoRegistro, tipoAtendimento]
    );

    const salvarGrupoWizard = useCallback((): Registro | null => {
        const grupo = wizardStepIndexesForTipo[wizardStep];
        const next: Registro = { ...wizardData };

        for (const idx of grupo) {
            const s = (stepsForTipo as any)[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as
                | HTMLInputElement
                | HTMLTextAreaElement
                | null;
            const v = (el?.value ?? "").trim();

            if (obrigatoriosForTipo.includes(s.id) && !v) {
                el?.focus();
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return null;
            }
            (next as any)[s.id] = v;
        }

        if (wizardData.id != null) next.id = wizardData.id;

        (next as any).materiais = materiais;
        (next as any).arrumacao = arrumacao;
        (next as any).tipo_atendimento = tipoAtendimento;

        setWizardData(next);
        return next;
    }, [
        wizardData,
        wizardStep,
        materiais,
        arrumacao,
        wizardStepIndexesForTipo,
        stepsForTipo,
        obrigatoriosForTipo,
        tipoAtendimento,
    ]);

    const concluirWizard = useCallback(async () => {
        if (wizardSubmitting) return;
        const dataAtualizada = salvarGrupoWizard();
        if (!dataAtualizada) return;

        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexesForTipo[wizardRestrictGroup];
            const ids = grupo.map((i) => (stepsForTipo as any)[i].id);
            grupoObrigatorios = ids.filter((id) => obrigatoriosForTipo.includes(id));
        } else {
            grupoObrigatorios = obrigatoriosForTipo;
        }

        for (const id of grupoObrigatorios) {
            if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        try {
            setWizardSubmitting(true);
            const payload = { ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" };
            const json = await enviarRegistroPHP(payload);
            if (json?.sucesso) {
                setWizardMsg({ text: "Registro salvo!", ok: true });
                // se for terceiro, guarda o id na sessão
                if ((dataAtualizada as any).tipo_atendimento === "terceiro") {
                    const novoId = json?.id ?? json?.novo_id ?? json?.last_id ?? dataAtualizada.id ?? null;
                    addTerceiroIdToSession(novoId);
                }
                fetchRegistros();
                setTimeout(() => setWizardOpen(false), 950);
            } else {
                setWizardMsg({ text: json?.erro || "Erro ao salvar!", ok: false });
            }
        } catch (e: any) {
            setWizardMsg({ text: e?.message || "Erro ao salvar!", ok: false });
        } finally {
            setWizardSubmitting(false);
        }
    }, [
        salvarGrupoWizard,
        wizardRestrictGroup,
        wizardEditing,
        fetchRegistros,
        wizardSubmitting,
        obrigatoriosForTipo,
        wizardStepIndexesForTipo,
        stepsForTipo,
    ]);

    /* -------------------- Ações (status) -------------------- */

    const abrirPopupAcaoPorId = useCallback((id: Registro["id"]) => {
        setAcaoMsg(null);
        setAcaoId(id != null ? String(id) : null);
        setAcaoSubmitting(false);
        setAcaoOpen(true);
    }, []);

    const registrarAcao = useCallback(
        async (acao: string) => {
            if (acaoSubmitting) return;
            if (acaoId == null) return;

            const ok = window.confirm("Deseja confirmar essa ação?");
            if (!ok) return;

            setAcaoSubmitting(true);
            try {
                const json = await enviarRegistroPHP({
                    acao: "atualizar_status",
                    id: acaoId,
                    status: acao,
                });

                if (json?.sucesso) {
                    setAcaoMsg({ text: `Status alterado para "${capitalizeStatus(acao)}"`, ok: true });
                    await fetchRegistros();
                    setAcaoOpen(false);
                } else {
                    setAcaoMsg({ text: json?.erro || "Erro ao atualizar status.", ok: false });
                }
            } catch (e: any) {
                setAcaoMsg({ text: e?.message || "Erro ao atualizar status.", ok: false });
            } finally {
                setAcaoSubmitting(false);
            }
        },
        [acaoId, fetchRegistros, acaoSubmitting]
    );

    /* -------------------- Info por ID (estável) -------------------- */

    const registroInfo = useMemo(
        () => (infoId != null ? registros.find((x) => String(x.id) === String(infoId)) ?? null : null),
        [registros, infoId]
    );

    const infoIdxResolved = useMemo(() => {
        if (infoId == null) return null;
        const idx = registros.findIndex((x) => String(x.id) === String(infoId));
        return idx >= 0 ? idx : null;
    }, [registros, infoId]);

    const abrirInfoPorId = useCallback((id: Registro["id"]) => {
        setInfoId(id != null ? String(id) : null);
        setInfoOpen(true);
    }, []);

    const abrirWizardFromInfo = useCallback(
        (tipo: "novo" | "editar", _idx: number | null = null, grupoStep: number | null = null) => {
            const idx = infoIdxResolved;
            if (idx != null) {
                // Ajusta tipo pela linha selecionada
                setTipoAtendimento(resolveTipoFromRegistro(registros[idx]));
                abrirWizard(tipo, idx, grupoStep);
            }
        },
        [infoIdxResolved, abrirWizard, registros]
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
        [infoIdxResolved]
    );

    /* -------------------- Assinatura (fora do Info) -------------------- */
    const abrirAssinatura = useCallback((idx: number, tipo: "recebimento" | "requisicao") => {
        setSignIdx(idx);
        setSignTipo(tipo);
        setSignOpen(true);
    }, []);

    /* -------------------- Resumos -------------------- */
    const materiaisSelecionadosResumo = useMemo(() => {
        const list: string[] = [];
        const mats = wizardData.materiais || materiais;
        Object.keys(mats || {}).forEach((key) => {
            const it = (mats as any)[key];
            if (it?.checked) {
                const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                list.push(`${label} (${it.qtd})`);
            }
        });
        return list.join(" • ");
    }, [wizardData.materiais, materiais]);

    const arrumacaoSelecionadaResumo = useMemo(() => {
        const mapa: { key: keyof ArrumacaoState; label: string }[] = [
            { key: "luvas", label: "Luvas" },
            { key: "palha", label: "Palha" },
            { key: "tamponamento", label: "Tamponamento" },
            { key: "maquiagem", label: "Maquiagem" },
            { key: "algodao", label: "Algodão" },
            { key: "cordao", label: "Cordão" },
            { key: "barba", label: "Barba" },
        ];
        const arr = wizardData.arrumacao || arrumacao;
        return mapa
            .filter((o) => (arr as any)[o.key])
            .map((o) => o.label)
            .join(" • ");
    }, [wizardData.arrumacao, arrumacao]);

    /* -------------------- Render -------------------- */
    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Gestão de Atendimentos</h1>
                    <p className="text-sm text-muted-foreground">
                        Cadastre, acompanhe e atualize o status dos atendimentos.
                    </p>
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
            />

            <AvisosBox
                avisos={avisos}
                avisoMsg={avisoMsg}
                setAvisoMsg={setAvisoMsg}
                enviarAviso={enviarAviso}
                editarAviso={editarAviso}
                excluirAviso={excluirAviso}
                finalizarAviso={finalizarAviso}
                avisoInputRef={avisoInputRef}
            />

            {/* Modal de escolha: tipo do novo registro */}
            <Modal open={chooseTipoOpen} onClose={() => setChooseTipoOpen(false)} ariaLabel="Escolher tipo" maxWidth={420}>
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
            />

            <AcaoModal
                open={acaoOpen}
                setOpen={setAcaoOpen}
                registros={registros}
                acaoId={acaoId}
                registrarAcao={registrarAcao}
                acaoMsg={acaoMsg}
                acaoSubmitting={acaoSubmitting}
            />

            <InfoModal
                open={infoOpen}
                setOpen={setInfoOpen}
                infoIdx={infoIdxResolved}
                abrirWizard={abrirWizardFromInfo}
                abrirAssinatura={(idx, tipo) => abrirAssinaturaFromInfo(idx, tipo)}
                registro={registroInfo}
            />

            <SignatureModal
                open={signOpen}
                onClose={() => setSignOpen(false)}
                registro={signIdx != null ? registros[signIdx] : undefined}
                tipo={signTipo}
                onSaved={() => {
                    fetchRegistros();
                }}
            />
        </div>
    );
}
