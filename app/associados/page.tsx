"use client";

/**
 * Associados (/associados) — contratos do plano, beneficiários, mensalidades e acesso ao app do associado.
 *
 * 27/10/2026 (visual novo e organização em partes):
 * - components/logica.ts: tipos, conversões, beneficiários e paginação (o código de antes, só separado);
 * - components/ui.tsx: janela, avisos (no lugar do alert), selos, WhatsApp;
 * - components/ListaContratos.tsx: tabela (computador), lista (celular) e paginação;
 * - components/Detalhe.tsx: detalhe em abas (Resumo, Beneficiários, Mensalidades, Acesso ao app);
 * - components/JanelaAcesso.tsx: criar/atualizar acesso.
 * Servidor: o mesmo associados_geral.php, com as mesmas ações (contracts, filter_options, contract_detail, upsert_access).
 * Filtros passam a valer na hora (antes Cidade/Plano/Situação só depois de "Filtrar").
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import {
    type BeneficiarioApi,
    type Contract,
    type ContractDetail,
    type LocalAuth,
    type PaginationInfo,
    ENDPOINT,
    getBeneficiarioCpf,
    getBeneficiarioTipo,
    isValidEmail,
    isValidTelefoneBR,
    normalizeContractsPayload,
    normalizePaginationObject,
    normalizeSearchText,
    onlyDigits,
    parseXPagination,
    safeJson,
    safeText,
    toUpperTrim,
    useDebounced,
} from "./components/logica";
import { Avisos, avisar, Avatar, BTN_SEC, CAMPO, CARTAO, Chip, Janela, nomeBonito, SeloSituacao, SUAVE } from "./components/ui";
import { ListaContratos, Paginacao } from "./components/ListaContratos";
import { Detalhe } from "./components/Detalhe";
import { JanelaAcesso } from "./components/JanelaAcesso";

export default function AssociadosGeralPage() {
    /* ---------------- busca e filtros (valem na hora) ---------------- */
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query, 350);
    const [appliedCidade, setAppliedCidade] = useState("");
    const [appliedPlano, setAppliedPlano] = useState("");
    const [appliedSituacao, setAppliedSituacao] = useState("");

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [pagination, setPagination] = useState<PaginationInfo | null>(null);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [filterOptions, setFilterOptions] = useState<{ cidades: string[]; planos: string[]; situacoes: string[] }>({ cidades: [], planos: [], situacoes: [] });
    const [loadingFilters, setLoadingFilters] = useState(false);

    /* ---------------- detalhe ---------------- */
    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Contract | null>(null);
    const [detail, setDetail] = useState<ContractDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    /* ---------------- acesso ---------------- */
    const [accessOpen, setAccessOpen] = useState(false);
    const [accessCpf, setAccessCpf] = useState("");
    const [accessEmail, setAccessEmail] = useState("");
    const [accessTelefone, setAccessTelefone] = useState("");
    const [accessTipo, setAccessTipo] = useState<"T" | "D" | "A">("T");
    const [accessNome, setAccessNome] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [accessJaTem, setAccessJaTem] = useState(false);

    const headers = useMemo(() => ({ "Content-Type": "application/json" }) as Record<string, string>, []);
    const listAbortRef = useRef<AbortController | null>(null);
    const listRequestSeqRef = useRef(0);
    const detailAbortRef = useRef<AbortController | null>(null);
    const detailCacheRef = useRef<Map<string, ContractDetail>>(new Map());

    const sessaoExpirada = (res: Response, data: any) => {
        if (res.status === 401 || data?.need_login) {
            window.location.href = "/login";
            return true;
        }
        return false;
    };

    const buildListUrl = useCallback(
        (pageNum: number) => {
            const url = new URL(ENDPOINT);
            url.searchParams.set("op", "contracts");
            url.searchParams.set("page", String(pageNum));
            url.searchParams.set("pageSize", String(pageSize));
            url.searchParams.set("textToSearch", (debouncedQuery || "").trim());
            if (appliedCidade) url.searchParams.set("cidade", appliedCidade);
            if (appliedPlano) url.searchParams.set("plano", appliedPlano);
            if (appliedSituacao) url.searchParams.set("situacaoText", appliedSituacao);
            return url.toString();
        },
        [debouncedQuery, appliedCidade, appliedPlano, appliedSituacao, pageSize],
    );

    const loadContracts = useCallback(
        async (pageNum: number = page) => {
            const requestedPage = Math.max(1, pageNum);
            const requestSeq = ++listRequestSeqRef.current;
            listAbortRef.current?.abort();
            const ac = new AbortController();
            listAbortRef.current = ac;
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(buildListUrl(requestedPage), { method: "GET", credentials: "include", headers, cache: "no-store", signal: ac.signal });
                const data = await safeJson<any>(res);
                if (requestSeq !== listRequestSeqRef.current) return;
                if (sessaoExpirada(res, data)) return;
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Não foi possível carregar os contratos.");
                const nextContracts = normalizeContractsPayload(data);
                setContracts(nextContracts);
                const fromHeader = parseXPagination(res.headers, requestedPage, pageSize);
                const fromBody = normalizePaginationObject(data?.pagination, requestedPage, pageSize);
                const resolved = fromHeader ?? fromBody ?? { pageNumber: requestedPage, pageSize, totalItemCount: nextContracts.length };
                setPagination({ ...resolved, pageNumber: requestedPage });
            } catch (e: any) {
                if (e?.name === "AbortError" || requestSeq !== listRequestSeqRef.current) return;
                setError(e?.message || "Não foi possível carregar os contratos.");
                setContracts([]);
                setPagination(null);
            } finally {
                if (requestSeq === listRequestSeqRef.current) setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [buildListUrl, headers, page, pageSize],
    );

    const loadFilterOptions = useCallback(async () => {
        setLoadingFilters(true);
        try {
            const url = new URL(ENDPOINT);
            url.searchParams.set("op", "filter_options");
            const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store", credentials: "include" });
            const data = await safeJson<any>(res);
            if (sessaoExpirada(res, data)) return;
            if (!res.ok || !data?.ok) throw new Error(data?.error || "Não foi possível carregar as opções dos filtros.");
            setFilterOptions({
                cidades: Array.isArray(data.cidades) ? data.cidades : [],
                planos: Array.isArray(data.planos) ? data.planos : [],
                situacoes: Array.isArray(data.situacoes) ? data.situacoes : [],
            });
        } catch (e: any) {
            avisar("err", e?.message || "Não foi possível carregar as opções dos filtros.");
        } finally {
            setLoadingFilters(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [headers]);

    useEffect(() => {
        void loadFilterOptions();
    }, [loadFilterOptions]);

    /* Um único effect controla pesquisa, filtros, página e tamanho (como antes). */
    const listCriteriaKey = useMemo(
        () => [debouncedQuery.trim(), appliedCidade, appliedPlano, appliedSituacao, pageSize].join("|"),
        [debouncedQuery, appliedCidade, appliedPlano, appliedSituacao, pageSize],
    );
    const previousCriteriaRef = useRef<string | null>(null);
    useEffect(() => {
        const mudou = previousCriteriaRef.current !== listCriteriaKey;
        previousCriteriaRef.current = listCriteriaKey;
        if (mudou && page !== 1) {
            setPage(1);
            return;
        }
        void loadContracts(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, listCriteriaKey]);

    /* Segurança adicional no front para os critérios atuais (igual à tela anterior). */
    const filteredContracts = useMemo(() => {
        const cCity = toUpperTrim(appliedCidade);
        const cPlan = toUpperTrim(appliedPlano);
        const cSit = toUpperTrim(appliedSituacao);
        const queryText = normalizeSearchText(debouncedQuery);
        const queryDigits = onlyDigits(debouncedQuery);
        return contracts.filter((c) => {
            if (queryText || queryDigits) {
                const name = normalizeSearchText(c.nome);
                const cpf = onlyDigits(c.cpf_cnpj || "");
                const contract = String(c.contrato_numero ?? c.contrato ?? "");
                const ok =
                    (queryText && name.includes(queryText)) ||
                    (queryDigits && cpf.includes(queryDigits)) ||
                    (queryDigits && onlyDigits(contract).includes(queryDigits)) ||
                    (queryText && normalizeSearchText(contract).includes(queryText));
                if (!ok) return false;
            }
            if (cCity && toUpperTrim(c.cidade) !== cCity) return false;
            if (cPlan && toUpperTrim(c.cobertura ?? c.plano) !== cPlan) return false;
            if (cSit && toUpperTrim(c.situacao) !== cSit) return false;
            return true;
        });
    }, [contracts, debouncedQuery, appliedCidade, appliedPlano, appliedSituacao]);

    /* ---------------- detalhe ---------------- */
    const fetchDetail = useCallback(
        async (c: Contract) => {
            const cpfDigits = onlyDigits(c.cpf_cnpj || "");
            const idContrato = Number(c.id) || 0;
            const cacheKey = `${idContrato}|${cpfDigits}`;
            const cached = detailCacheRef.current.get(cacheKey);
            if (cached) setDetail(cached);
            detailAbortRef.current?.abort();
            const ac = new AbortController();
            detailAbortRef.current = ac;
            try {
                setLoadingDetail(true);
                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "contract_detail");
                if (idContrato > 0) url.searchParams.set("idContrato", String(idContrato));
                if (cpfDigits) url.searchParams.set("cpf", cpfDigits);
                const res = await fetch(url.toString(), { method: "GET", credentials: "include", headers, cache: "no-store", signal: ac.signal });
                const data = await safeJson<ContractDetail>(res);
                if (sessaoExpirada(res, data)) return;
                if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "Não foi possível carregar o contrato.");
                detailCacheRef.current.set(cacheKey, data);
                setDetail(data);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                avisar("err", e?.message || "Não foi possível carregar o contrato.");
                setDetail(cached ?? null);
            } finally {
                setLoadingDetail(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [headers],
    );

    const openDetail = useCallback(
        async (c: Contract) => {
            setSelected(c);
            setModalOpen(true);
            const cacheKey = `${Number(c.id) || 0}|${onlyDigits(c.cpf_cnpj || "")}`;
            if (!detailCacheRef.current.has(cacheKey)) setDetail(null);
            await fetchDetail(c);
        },
        [fetchDetail],
    );

    const reloadDetail = useCallback(async () => {
        if (!selected) return;
        detailCacheRef.current.delete(`${Number(selected.id) || 0}|${onlyDigits(selected.cpf_cnpj || "")}`);
        await fetchDetail(selected);
    }, [fetchDetail, selected]);

    const applySavedAccessToDetail = useCallback(
        (cpf: string, localAuth: Exclude<LocalAuth, null>) => {
            setDetail((previous) => {
                if (!previous) return previous;
                const isTitular = onlyDigits(selected?.cpf_cnpj || "") === cpf;
                const nextDetail: ContractDetail = {
                    ...previous,
                    local_auth: isTitular ? localAuth : previous.local_auth,
                    beneficiarios: previous.beneficiarios?.map((item) => (getBeneficiarioCpf(item) !== cpf ? item : { ...item, local_auth: localAuth, has_access: true })) ?? previous.beneficiarios,
                    access_map: { ...(previous.access_map ?? {}), [cpf]: localAuth },
                };
                detailCacheRef.current.set(`${Number(selected?.id) || 0}|${onlyDigits(selected?.cpf_cnpj || "")}`, nextDetail);
                return nextDetail;
            });
        },
        [selected?.cpf_cnpj, selected?.id],
    );

    const upsertAccess = useCallback(
        async (payload: { cpf: string; senha: string; email: string; telefone: string }): Promise<boolean> => {
            const cpf = onlyDigits(payload.cpf);
            const tel = onlyDigits(payload.telefone);
            const senha = (payload.senha || "").trim();
            const email = (payload.email || "").trim();
            if (cpf.length !== 11) return avisar("warn", "CPF inválido."), false;
            if (senha.length < 6) return avisar("warn", "A senha precisa ter pelo menos 6 caracteres."), false;
            if (!isValidEmail(email)) return avisar("warn", "Informe um e-mail válido."), false;
            if (!isValidTelefoneBR(tel)) return avisar("warn", "Informe o telefone com DDD."), false;
            try {
                const url = new URL(ENDPOINT);
                url.searchParams.set("op", "upsert_access");
                const res = await fetch(url.toString(), {
                    method: "POST",
                    credentials: "include",
                    headers,
                    body: JSON.stringify({
                        cpf,
                        senha,
                        email,
                        telefone: tel,
                        titular_cpf: onlyDigits(selected?.cpf_cnpj || ""),
                        idContrato: Number(selected?.id) || 0,
                        tipo: accessTipo,
                        nome: accessNome,
                        access_token: accessToken,
                    }),
                    cache: "no-store",
                });
                const data = await safeJson<any>(res);
                if (sessaoExpirada(res, data)) return false;
                if (res.status === 403) throw new Error(data?.msg || data?.error || "Seu usuário não tem permissão para criar acessos.");
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Não foi possível salvar o acesso.");
                const saved: Exclude<LocalAuth, null> = data.local_auth ?? {
                    cpf,
                    email,
                    telefone: tel,
                    email_verificado: 0,
                    telefone_verificado: 0,
                    tentativas: 0,
                    bloqueado_ate: null,
                    ultimo_login: null,
                };
                applySavedAccessToDetail(cpf, saved);
                avisar("ok", data.created ? `Acesso criado para ${accessNome}.` : `Acesso de ${accessNome} atualizado.`);
                void reloadDetail();
                return true;
            } catch (e: any) {
                avisar("err", e?.message || "Não foi possível salvar o acesso.");
                return false;
            }
        },
        [headers, reloadDetail, selected?.cpf_cnpj, selected?.id, accessTipo, accessNome, accessToken, applySavedAccessToDetail],
    );

    const openTitularAccess = useCallback(() => {
        const cpf = onlyDigits(selected?.cpf_cnpj || "");
        const local = detail?.local_auth ?? (cpf ? detail?.access_map?.[cpf] ?? null : null);
        setAccessCpf(cpf);
        setAccessEmail(local?.email || "");
        setAccessTelefone(local?.telefone || selected?.celularTitular || "");
        setAccessTipo("T");
        setAccessNome(nomeBonito(selected?.nome || "Titular"));
        setAccessToken("");
        setAccessJaTem(!!local);
        setAccessOpen(true);
    }, [detail?.local_auth, detail?.access_map, selected?.cpf_cnpj, selected?.nome, selected?.celularTitular]);

    const openDepAccess = useCallback((dep: BeneficiarioApi) => {
        const nome = nomeBonito(safeText(dep?.Nome ?? dep?.nome ?? "Beneficiário"));
        const cpf = getBeneficiarioCpf(dep);
        const tipo = getBeneficiarioTipo(dep);
        if (tipo === "P") return avisar("warn", "Pets não recebem acesso ao app.");
        if (tipo !== "D" && tipo !== "A") return avisar("warn", "Este tipo de beneficiário não recebe acesso ao app.");
        if (cpf.length !== 11) return avisar("warn", "A Unypax não informou o CPF desta pessoa.");
        const local = dep.local_auth ?? null;
        setAccessCpf(cpf);
        setAccessEmail(local?.email || "");
        setAccessTelefone(local?.telefone || dep?.Telefone || dep?.telefone || dep?.celular || "");
        setAccessTipo(tipo);
        setAccessNome(nome);
        setAccessToken(dep.access_token || "");
        setAccessJaTem(!!local);
        setAccessOpen(true);
    }, []);

    /* ---------------- ações da tela ---------------- */
    const temFiltro = Boolean(query.trim() || appliedCidade || appliedPlano || appliedSituacao);
    const limparFiltros = () => {
        setQuery("");
        setAppliedCidade("");
        setAppliedPlano("");
        setAppliedSituacao("");
        setPage(1);
    };
    const atualizarTudo = () => {
        void loadContracts(page);
        void loadFilterOptions();
    };

    const total = pagination?.totalItemCount;
    const totalPaginas = pagination?.pageCount ?? (total ? Math.max(1, Math.ceil(total / pageSize)) : undefined);
    const temProxima = pagination?.hasNextPage ?? (totalPaginas ? page < totalPaginas : contracts.length >= pageSize);

    const tipoAcessoRotulo = accessTipo === "T" ? "Titular" : accessTipo === "D" ? "Dependente" : "Agregado";

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                {/* Cabeçalho */}
                <header className="mb-4 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Associados</h1>
                        <p className={`mt-1 text-[14px] ${SUAVE}`}>
                            Contratos do plano, beneficiários, mensalidades e acesso ao app do associado.
                            {total ? (
                                <>
                                    {" "}
                                    <b className="text-[#313C55] dark:text-white">{total.toLocaleString("pt-BR")}</b> {temFiltro ? "encontrados" : "contratos"}.
                                </>
                            ) : null}
                        </p>
                    </div>
                    <button type="button" onClick={atualizarTudo} disabled={loading} className={`${BTN_SEC} w-11 px-0 sm:w-auto sm:px-3.5`} title="Atualizar a lista">
                        <IconRefresh size={18} className={loading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">Atualizar</span>
                    </button>
                </header>

                {/* Busca e filtros */}
                <div className={`${CARTAO} mb-4 p-3 sm:p-4`}>
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
                        <div className="relative">
                            <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Nome, CPF ou número do contrato"
                                aria-label="Buscar associado"
                                className={`${CAMPO} pl-10 ${query ? "pr-11" : ""}`}
                                autoComplete="off"
                                enterKeyHint="search"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery("")}
                                    aria-label="Limpar busca"
                                    className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                                >
                                    <IconX size={18} />
                                </button>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:contents">
                            <select value={appliedCidade} onChange={(e) => setAppliedCidade(e.target.value)} aria-label="Cidade" className={CAMPO} disabled={loadingFilters && !filterOptions.cidades.length}>
                                <option value="">Cidade: todas</option>
                                {filterOptions.cidades.map((c) => (
                                    <option key={c} value={c}>
                                        {nomeBonito(c)}
                                    </option>
                                ))}
                            </select>
                            <select value={appliedPlano} onChange={(e) => setAppliedPlano(e.target.value)} aria-label="Plano" className={CAMPO} disabled={loadingFilters && !filterOptions.planos.length}>
                                <option value="">Plano: todos</option>
                                {filterOptions.planos.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {filterOptions.situacoes.length ? (
                        <div className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
                            <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
                                <Chip ativo={!appliedSituacao} onClick={() => setAppliedSituacao("")}>
                                    Todas as situações
                                </Chip>
                                {filterOptions.situacoes.map((s) => (
                                    <Chip key={s} ativo={appliedSituacao === s} onClick={() => setAppliedSituacao(appliedSituacao === s ? "" : s)}>
                                        {nomeBonito(s)}
                                    </Chip>
                                ))}
                                {temFiltro ? (
                                    <button
                                        type="button"
                                        onClick={limparFiltros}
                                        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-[#5B6478] hover:bg-[#F1F4F8] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:bg-white/[0.06] dark:hover:text-white"
                                    >
                                        <IconX size={16} />
                                        Limpar filtros
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ) : temFiltro ? (
                        <button type="button" onClick={limparFiltros} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-[#5B6478] hover:bg-[#F1F4F8] dark:text-[#AEB9CF]">
                            <IconX size={16} />
                            Limpar filtros
                        </button>
                    ) : null}
                </div>

                {/* Erro */}
                {error ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="min-w-0 flex-1">{error}</span>
                        <button type="button" onClick={() => void loadContracts(page)} className="min-h-11 shrink-0 rounded-lg px-3 font-extrabold underline underline-offset-4">
                            Tentar de novo
                        </button>
                    </div>
                ) : null}

                {/* Lista */}
                <div className={`${CARTAO} overflow-hidden`}>
                    {!loading && filteredContracts.length === 0 && !error ? (
                        <div className="p-8 text-center">
                            <p className="text-[15px] font-extrabold">Nenhum contrato encontrado.</p>
                            <p className={`mt-1 text-[13px] ${SUAVE}`}>Confira o nome, o CPF ou o número do contrato.</p>
                            {temFiltro ? (
                                <button type="button" onClick={limparFiltros} className={`${BTN_SEC} mt-3`}>
                                    Limpar filtros
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <ListaContratos itens={filteredContracts} carregando={loading} onAbrir={(c) => void openDetail(c)} selecionadoId={modalOpen ? selected?.id : null} />
                    )}
                    {filteredContracts.length > 0 || page > 1 ? (
                        <Paginacao
                            pagina={page}
                            totalPaginas={totalPaginas}
                            total={total}
                            porPagina={pagination?.pageSize ?? pageSize}
                            inicio={pagination?.firstItemOnPage}
                            fim={pagination?.lastItemOnPage}
                            desativado={loading}
                            temProxima={!!temProxima}
                            onIr={(p) => setPage(Math.max(1, totalPaginas ? Math.min(totalPaginas, p) : p))}
                            onPorPagina={(n) => setPageSize(n)}
                        />
                    ) : null}
                </div>
            </div>

            {/* Detalhe do contrato */}
            <Janela
                aberta={modalOpen && !!selected}
                onFechar={() => setModalOpen(false)}
                largura="max-w-4xl"
                topo={selected ? <Avatar nome={String(selected.nome ?? "")} situacao={selected.situacao} tamanho="size-11" /> : null}
                titulo={selected ? nomeBonito(selected.nome) : ""}
                subtitulo={
                    selected ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>Contrato {selected.contrato_numero || selected.contrato || "—"}</span>
                            <span>·</span>
                            <span>{selected.cobertura || selected.plano || "—"}</span>
                            <SeloSituacao situacao={selected.situacao} />
                        </span>
                    ) : null
                }
            >
                {selected ? (
                    <Detalhe
                        contrato={selected}
                        detail={detail}
                        carregando={loadingDetail}
                        onRecarregar={() => void reloadDetail()}
                        onAcessoTitular={openTitularAccess}
                        onAcessoBeneficiario={openDepAccess}
                    />
                ) : null}
            </Janela>

            <JanelaAcesso
                aberta={accessOpen}
                onFechar={() => setAccessOpen(false)}
                nome={accessNome}
                tipo={tipoAcessoRotulo}
                jaTemAcesso={accessJaTem}
                cpfInicial={accessCpf}
                emailInicial={accessEmail}
                telefoneInicial={accessTelefone}
                cpfEditavel={false}
                onSalvar={upsertAccess}
            />

            <Avisos />
        </div>
    );
}
