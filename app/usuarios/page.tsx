'use client';

/**
 * Usuários (/usuarios) — contas que entram no app.
 *
 * 27/10/2026 (visual novo, só front; mesmas ações do pai_api.php):
 * - cabeçalho com total e "Novo usuário"; busca por nome ou login; filtro por cargo (com "Sem cargo");
 * - computador em tabela (iniciais, nome, login, cargo, editar); celular em lista;
 * - CARGO no cadastro e na edição (list_cargos + campo "cargo" que o create_user/update_user já aceitavam);
 * - senha com mostrar/ocultar e "Gerar senha" (com copiar); login sem espaços e sem acento;
 * - avisos de login repetido e de usuário sem cargo (sem cargo = nenhuma tela: my_permissions vem só do cargo);
 *   não deixa excluir a própria conta;
 * - excluir com confirmação dentro da janela (sem confirm()); mensagens na tela (sem texto técnico);
 * - janela no padrão do app: diálogo no computador, folha de baixo no celular, portal no <body>, Esc fecha.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    IconAlertTriangle,
    IconCheck,
    IconCopy,
    IconEye,
    IconEyeOff,
    IconKey,
    IconPencil,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconShieldLock,
    IconTrash,
    IconX,
} from '@tabler/icons-react';

type Usuario = { id: number; nome: string; usuario: string; cargo?: string | null };
type Cargo = { id: number; nome: string; slug: string; descricao?: string | null; ativo?: number };
type Eu = { id: number | null; usuario: string | null };

const API_URL = 'https://api.planoassistencialintegrado.com.br/pai_api.php';

/* ============================== API ============================== */

class SessaoExpirada extends Error {}

async function api(acao: string, corpo?: Record<string, unknown>) {
    const r = await fetch(`${API_URL}?action=${acao}${corpo ? '' : `&_=${Date.now()}`}`, {
        cache: 'no-store',
        credentials: 'include', // envia o login (pai_session) ao PHP
        ...(corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
    });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
    const txt = (await r.text()).replace(/^﻿/, '').trim();
    let json: any = null;
    if (!txt.startsWith('<')) {
        try {
            json = JSON.parse(txt);
        } catch {
            const m = txt.match(/\{[\s\S]*\}$/m);
            if (m) {
                try {
                    json = JSON.parse(m[0]);
                } catch {
                    /* segue para o erro abaixo */
                }
            }
        }
    }
    if (json?.need_login) throw new SessaoExpirada('Sessão expirada.');
    if (json == null) throw new Error('O servidor não respondeu como esperado. Tente de novo.');
    if (r.status === 403) throw new Error(json?.msg || 'Seu usuário não tem permissão para esta ação.');
    if (!r.ok || json?.erro) throw new Error((typeof json?.erro === 'string' && json.erro) || json?.msg || 'Não foi possível concluir. Tente de novo.');
    return json;
}

/* ============================== utilidades ============================== */

const semAcento = (s: string) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

/** Login: minúsculas, sem acento e sem espaços (ponto, hífen e sublinhado são aceitos). */
function limparLogin(s: string) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9._-]/g, '');
}

/** Sugestão de login a partir do nome ("Maria das Dores" → "maria"). */
function sugerirLogin(nome: string) {
    return limparLogin(String(nome || '').trim().split(/\s+/)[0] || '');
}

function iniciais(nome: string) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Senha fácil de ditar: sem letras parecidas (l, I, O, 0, 1). */
function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyz';
    const numeros = '23456789';
    const sorteia = (s: string) => s[Math.floor((window.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Math.random() * 1e9) % s.length)];
    let out = '';
    for (let i = 0; i < 5; i++) out += sorteia(letras);
    out = out.charAt(0).toUpperCase() + out.slice(1);
    for (let i = 0; i < 3; i++) out += sorteia(numeros);
    return out;
}

/** Cor fixa por cargo (só para o círculo das iniciais). */
const CORES_AVATAR = [
    'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]',
    'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]',
    'bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]',
    'bg-[#F1E9F7] text-[#5B3A7A] dark:bg-[#B58BD6]/15 dark:text-[#D9C2EC]',
    'bg-[#E6F2EF] text-[#245B4E] dark:bg-[#5FB7A0]/15 dark:text-[#A7DCCD]',
];
function corDoCargo(slug: string | null | undefined, cargos: Cargo[]) {
    if (!slug) return 'bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]';
    const i = cargos.findIndex((c) => c.slug === slug);
    return CORES_AVATAR[(i >= 0 ? i : slug.length) % CORES_AVATAR.length];
}

/* ============================== estilos ============================== */

const CAMPO =
    'h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white';
const ROTULO = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';
const BTN_SEC =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3.5 text-[14px] font-extrabold text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white';
const BTN_PRI =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white transition hover:bg-[#232B40] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]';
const CARTAO = 'rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]';

/* ============================== peças ============================== */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => setOk(true), []);
    return ok ? createPortal(children, document.body) : null;
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition',
                ativo
                    ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]'
                    : 'border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function SeloCargo({ slug, cargos }: { slug?: string | null; cargos: Cargo[] }) {
    const c = cargos.find((x) => x.slug === slug);
    if (!slug)
        return (
            <span className="inline-flex items-center gap-1 rounded-lg border border-[#E4BC30] px-2 py-0.5 text-[12px] font-bold text-[#7A5D00] dark:border-[#F2CB3F]/60 dark:text-[#F2CB3F]">
                <IconAlertTriangle size={13} />
                Sem cargo
            </span>
        );
    return (
        <span className="inline-flex rounded-lg bg-[#E9EFF6] px-2 py-0.5 text-[12px] font-bold text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-[#DDE3EE]">
            {c?.nome || slug}
        </span>
    );
}

function Avatar({ nome, cor }: { nome: string; cor: string }) {
    return <span className={`grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-extrabold ${cor}`}>{iniciais(nome)}</span>;
}

/* ============================== página ============================== */

export default function UsuariosPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [eu, setEu] = useState<Eu>({ id: null, usuario: null });
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const [busca, setBusca] = useState('');
    const [filtroCargo, setFiltroCargo] = useState<string>('todos'); // 'todos' | '__sem__' | slug

    // janela
    const [aberta, setAberta] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [nome, setNome] = useState('');
    const [login, setLogin] = useState('');
    const [loginTocado, setLoginTocado] = useState(false);
    const [cargo, setCargo] = useState('');
    const [senha, setSenha] = useState('');
    const [verSenha, setVerSenha] = useState(false);
    const [trocarSenha, setTrocarSenha] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [confirmarExclusao, setConfirmarExclusao] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const nomeRef = useRef<HTMLInputElement>(null);

    const irParaLogin = () => {
        window.location.href = '/login';
    };

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErroLista(null);
        try {
            const [lista, listaCargos, quem] = await Promise.all([
                api('list_users'),
                api('list_cargos').catch(() => []),
                api('whoami').catch(() => null),
            ]);
            setUsuarios(Array.isArray(lista) ? lista.map((u: any) => ({ id: Number(u.id), nome: String(u.nome ?? ''), usuario: String(u.usuario ?? ''), cargo: u.cargo || null })) : []);
            setCargos(Array.isArray(listaCargos) ? listaCargos : []);
            if (quem) setEu({ id: quem.id != null ? Number(quem.id) : null, usuario: quem.usuario ?? null });
        } catch (e: any) {
            if (e instanceof SessaoExpirada) return irParaLogin();
            setErroLista(e?.message || 'Não foi possível carregar os usuários.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 3500);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ---- lista filtrada ---- */
    const contagem = useMemo(() => {
        const m = new Map<string, number>();
        let sem = 0;
        for (const u of usuarios) {
            if (!u.cargo) sem++;
            else m.set(u.cargo, (m.get(u.cargo) || 0) + 1);
        }
        return { porCargo: m, sem };
    }, [usuarios]);

    const filtrados = useMemo(() => {
        const q = semAcento(busca);
        return usuarios
            .filter((u) => {
                if (filtroCargo === '__sem__' && u.cargo) return false;
                if (filtroCargo !== 'todos' && filtroCargo !== '__sem__' && u.cargo !== filtroCargo) return false;
                if (q && !semAcento(`${u.nome} ${u.usuario}`).includes(q)) return false;
                return true;
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    }, [usuarios, busca, filtroCargo]);

    // Cargos com usuários primeiro na lista de filtros (os vazios não aparecem como chip).
    const cargosComGente = useMemo(() => cargos.filter((c) => (contagem.porCargo.get(c.slug) || 0) > 0), [cargos, contagem]);
    // Cargo salvo no usuário que não existe mais na lista de cargos ativos.
    const cargosOrfaos = useMemo(() => Array.from(contagem.porCargo.keys()).filter((s) => !cargos.some((c) => c.slug === s)), [contagem, cargos]);

    /* ---- janela ---- */
    const abrirNovo = () => {
        setEditId(null);
        setNome('');
        setLogin('');
        setLoginTocado(false);
        setCargo('');
        setSenha(gerarSenha());
        setVerSenha(true);
        setTrocarSenha(true);
        setErroForm(null);
        setConfirmarExclusao(false);
        setAberta(true);
    };

    const abrirEdicao = (u: Usuario) => {
        setEditId(u.id);
        setNome(u.nome);
        setLogin(u.usuario);
        setLoginTocado(true);
        setCargo(u.cargo || '');
        setSenha('');
        setVerSenha(false);
        setTrocarSenha(false);
        setErroForm(null);
        setConfirmarExclusao(false);
        setAberta(true);
    };

    const fechar = useCallback(() => {
        if (salvando) return;
        setAberta(false);
    }, [salvando]);

    useEffect(() => {
        if (!aberta) return;
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = 'hidden';
        const esc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') fechar();
        };
        window.addEventListener('keydown', esc);
        const t = window.setTimeout(() => nomeRef.current?.focus(), 60);
        return () => {
            html.style.overflow = antes;
            window.removeEventListener('keydown', esc);
            window.clearTimeout(t);
        };
    }, [aberta, fechar]);

    const loginRepetido = useMemo(() => {
        const l = limparLogin(login);
        return !!l && usuarios.some((u) => u.id !== editId && limparLogin(u.usuario) === l);
    }, [login, usuarios, editId]);

    const souEu = editId != null && editId === eu.id;

    const salvar = async () => {
        setErroForm(null);
        const n = nome.trim().replace(/\s+/g, ' ');
        const l = limparLogin(login);
        if (!n) return setErroForm('Preencha o nome.');
        if (!l) return setErroForm('Preencha o login.');
        if (loginRepetido) return setErroForm(`Já existe um usuário com o login "${l}".`);
        if (editId == null && senha.trim().length < 6) return setErroForm('A senha precisa ter pelo menos 6 caracteres.');
        if (editId != null && trocarSenha && senha.trim() && senha.trim().length < 6) return setErroForm('A nova senha precisa ter pelo menos 6 caracteres.');

        setSalvando(true);
        try {
            const corpo: Record<string, unknown> = { nome: n, usuario: l, cargo, senha: trocarSenha ? senha.trim() : '' };
            if (editId != null) corpo.id = editId;
            await api(editId == null ? 'create_user' : 'update_user', corpo);
            setAberta(false);
            setAviso(editId == null ? `Usuário ${n} criado.` : `Alterações de ${n} salvas.`);
            await carregar();
        } catch (e: any) {
            if (e instanceof SessaoExpirada) return irParaLogin();
            setErroForm(e?.message || 'Não foi possível salvar.');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async () => {
        if (editId == null || souEu) return;
        setSalvando(true);
        setErroForm(null);
        try {
            await api('delete_user', { id: editId });
            setAberta(false);
            setAviso(`Usuário ${nome} excluído.`);
            await carregar();
        } catch (e: any) {
            if (e instanceof SessaoExpirada) return irParaLogin();
            setErroForm(e?.message || 'Não foi possível excluir.');
        } finally {
            setSalvando(false);
            setConfirmarExclusao(false);
        }
    };

    const copiarSenha = async () => {
        try {
            await navigator.clipboard.writeText(senha);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 1600);
        } catch {
            /* sem área de transferência */
        }
    };

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                {/* Cabeçalho */}
                <header className="mb-4 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Usuários</h1>
                        <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Contas que entram no app. As telas que cada pessoa vê vêm do cargo, definido em{' '}
                            <a href="/permissoes" className="font-bold text-[#3D6A99] underline underline-offset-4 dark:text-[#A9BED6]">
                                Permissões
                            </a>
                            .
                        </p>
                    </div>
                    <button type="button" onClick={() => void carregar()} disabled={carregando} className={`${BTN_SEC} w-11 px-0`} aria-label="Atualizar" title="Atualizar">
                        <IconRefresh size={18} className={carregando ? 'animate-spin' : ''} />
                    </button>
                    <button type="button" onClick={abrirNovo} className={BTN_PRI}>
                        <IconPlus size={18} stroke={2.2} />
                        <span className="hidden sm:inline">Novo usuário</span>
                        <span className="sm:hidden">Novo</span>
                    </button>
                </header>

                {/* Mensagens */}
                {erroLista ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="min-w-0 flex-1">{erroLista}</span>
                        <button type="button" onClick={() => void carregar()} className="min-h-11 shrink-0 rounded-lg px-3 font-extrabold underline underline-offset-4">
                            Tentar de novo
                        </button>
                    </div>
                ) : null}
                {aviso ? (
                    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#7BA11A]/50 bg-[#EEF5D6] px-4 py-3 text-[14px] font-semibold text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">
                        <IconCheck size={18} />
                        {aviso}
                    </div>
                ) : null}

                {/* Busca e filtros */}
                <div className={`${CARTAO} mb-4 p-3 sm:p-4`}>
                    <div className="relative">
                        <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                        <input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar por nome ou login"
                            aria-label="Buscar usuários"
                            className={`${CAMPO} pl-10 ${busca ? 'pr-11' : ''}`}
                            autoComplete="off"
                        />
                        {busca ? (
                            <button
                                type="button"
                                onClick={() => setBusca('')}
                                aria-label="Limpar busca"
                                className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                            >
                                <IconX size={18} />
                            </button>
                        ) : null}
                    </div>
                    {usuarios.length > 0 ? (
                        <div className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
                            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                                <Chip ativo={filtroCargo === 'todos'} onClick={() => setFiltroCargo('todos')}>
                                    Todos <span className="opacity-70">{usuarios.length}</span>
                                </Chip>
                                {cargosComGente.map((c) => (
                                    <Chip key={c.slug} ativo={filtroCargo === c.slug} onClick={() => setFiltroCargo(c.slug)}>
                                        {c.nome} <span className="opacity-70">{contagem.porCargo.get(c.slug)}</span>
                                    </Chip>
                                ))}
                                {cargosOrfaos.map((s) => (
                                    <Chip key={s} ativo={filtroCargo === s} onClick={() => setFiltroCargo(s)}>
                                        {s} <span className="opacity-70">{contagem.porCargo.get(s)}</span>
                                    </Chip>
                                ))}
                                {contagem.sem > 0 ? (
                                    <Chip ativo={filtroCargo === '__sem__'} onClick={() => setFiltroCargo('__sem__')}>
                                        <IconAlertTriangle size={15} className="text-[#C79A00] dark:text-[#F2CB3F]" />
                                        Sem cargo <span className="opacity-70">{contagem.sem}</span>
                                    </Chip>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Lista */}
                <div className={`${CARTAO} overflow-hidden`}>
                    <div className="border-b border-[#E3E8F0] px-4 py-3 text-[15px] font-extrabold dark:border-white/[0.08]">
                        {carregando && usuarios.length === 0
                            ? 'Carregando…'
                            : `${filtrados.length} ${filtrados.length === 1 ? 'usuário' : 'usuários'}`}
                        {filtrados.length !== usuarios.length && usuarios.length ? (
                            <span className="ml-1 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">de {usuarios.length}</span>
                        ) : null}
                    </div>

                    {carregando && usuarios.length === 0 ? (
                        <ul aria-hidden="true">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <li key={i} className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3 last:border-b-0 dark:border-white/[0.06]">
                                    <span className="size-10 animate-pulse rounded-full bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                    <span className="h-4 w-1/3 animate-pulse rounded bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                </li>
                            ))}
                        </ul>
                    ) : filtrados.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-[15px] font-extrabold">{usuarios.length ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}</p>
                            {busca || filtroCargo !== 'todos' ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBusca('');
                                        setFiltroCargo('todos');
                                    }}
                                    className={`${BTN_SEC} mt-3`}
                                >
                                    Limpar busca e filtro
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            {/* Computador */}
                            <table className="hidden w-full text-left lg:table">
                                <thead>
                                    <tr className="border-b border-[#E3E8F0] text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:text-[#AEB9CF]">
                                        <th className="py-2.5 pl-4 pr-4">Nome</th>
                                        <th className="py-2.5 pr-4">Login</th>
                                        <th className="py-2.5 pr-4">Cargo</th>
                                        <th className="w-28 py-2.5 pr-4" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtrados.map((u) => (
                                        <tr
                                            key={u.id}
                                            onClick={() => abrirEdicao(u)}
                                            className="cursor-pointer border-b border-[#EEF1F6] transition last:border-b-0 hover:bg-[#F6F8FB] dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                                        >
                                            <td className="py-2.5 pl-4 pr-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar nome={u.nome} cor={corDoCargo(u.cargo, cargos)} />
                                                    <span className="text-[15px] font-extrabold">{u.nome}</span>
                                                    {u.id === eu.id ? (
                                                        <span className="rounded-md bg-[#F2CB3F] px-1.5 py-0.5 text-[11px] font-extrabold text-[#313C55]">Você</span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4 font-mono text-[14px] text-[#4A5368] dark:text-[#C8CFDC]">{u.usuario}</td>
                                            <td className="py-2.5 pr-4">
                                                <SeloCargo slug={u.cargo} cargos={cargos} />
                                            </td>
                                            <td className="py-2.5 pr-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        abrirEdicao(u);
                                                    }}
                                                    className={BTN_SEC}
                                                    aria-label={`Editar ${u.nome}`}
                                                >
                                                    <IconPencil size={17} />
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Celular e tablet */}
                            <ul className="lg:hidden">
                                {filtrados.map((u) => (
                                    <li key={u.id} className="border-b border-[#EEF1F6] last:border-b-0 dark:border-white/[0.06]">
                                        <button type="button" onClick={() => abrirEdicao(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                                            <Avatar nome={u.nome} cor={corDoCargo(u.cargo, cargos)} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-[15px] font-extrabold">{u.nome}</span>
                                                    {u.id === eu.id ? (
                                                        <span className="shrink-0 rounded-md bg-[#F2CB3F] px-1.5 py-0.5 text-[11px] font-extrabold text-[#313C55]">Você</span>
                                                    ) : null}
                                                </span>
                                                <span className="mt-0.5 flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{u.usuario}</span>
                                                    <SeloCargo slug={u.cargo} cargos={cargos} />
                                                </span>
                                            </span>
                                            <IconPencil size={18} className="shrink-0 text-[#98A1B3]" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {/* ============================== Janela ============================== */}
            {aberta ? (
                <NoCorpo>
                    <div
                        data-pai-overlay
                        role="dialog"
                        aria-modal="true"
                        aria-label={editId == null ? 'Novo usuário' : 'Editar usuário'}
                        className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) fechar();
                        }}
                    >
                        <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl">
                            <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                                {editId != null ? <Avatar nome={nome} cor={corDoCargo(cargo || null, cargos)} /> : null}
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate text-[18px] font-extrabold">{editId == null ? 'Novo usuário' : nome || 'Editar usuário'}</h2>
                                    {editId != null ? <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Editar usuário</p> : null}
                                </div>
                                <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                                    <IconX size={20} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
                                <label className="block">
                                    <span className={ROTULO}>Nome completo</span>
                                    <input
                                        ref={nomeRef}
                                        value={nome}
                                        onChange={(e) => {
                                            setNome(e.target.value);
                                            if (!loginTocado && editId == null) setLogin(sugerirLogin(e.target.value));
                                        }}
                                        placeholder="Ex.: Maria das Dores"
                                        className={CAMPO}
                                        autoComplete="off"
                                    />
                                </label>

                                <label className="block">
                                    <span className={ROTULO}>Login</span>
                                    <input
                                        value={login}
                                        onChange={(e) => {
                                            setLoginTocado(true);
                                            setLogin(limparLogin(e.target.value));
                                        }}
                                        placeholder="Ex.: maria"
                                        className={`${CAMPO} font-mono`}
                                        autoComplete="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                    />
                                    {loginRepetido ? (
                                        <span className="mt-1.5 block text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">Já existe um usuário com este login.</span>
                                    ) : (
                                        <span className="mt-1.5 block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">É o que a pessoa digita para entrar. Sem espaços e sem acento.</span>
                                    )}
                                </label>

                                <label className="block">
                                    <span className={ROTULO}>Cargo</span>
                                    <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO}>
                                        <option value="">Sem cargo</option>
                                        {cargos.map((c) => (
                                            <option key={c.slug} value={c.slug}>
                                                {c.nome}
                                            </option>
                                        ))}
                                        {cargo && !cargos.some((c) => c.slug === cargo) ? <option value={cargo}>{cargo} (inativo)</option> : null}
                                    </select>
                                    {!cargo ? (
                                        <span className="mt-1.5 flex items-start gap-1.5 text-[13px] text-[#7A5D00] dark:text-[#F2CB3F]">
                                            <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            Sem cargo, a pessoa entra no app mas não vê nenhuma tela. As telas de cada cargo ficam em Permissões.
                                        </span>
                                    ) : cargos.find((c) => c.slug === cargo)?.descricao ? (
                                        <span className="mt-1.5 block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{cargos.find((c) => c.slug === cargo)?.descricao}</span>
                                    ) : null}
                                </label>

                                {/* Senha */}
                                <div>
                                    <span className={ROTULO}>{editId == null ? 'Senha' : 'Senha'}</span>
                                    {editId != null && !trocarSenha ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTrocarSenha(true);
                                                setSenha(gerarSenha());
                                                setVerSenha(true);
                                            }}
                                            className={`${BTN_SEC} w-full`}
                                        >
                                            <IconKey size={18} />
                                            Trocar a senha
                                        </button>
                                    ) : (
                                        <>
                                            <div className="flex gap-2">
                                                <div className="relative min-w-0 flex-1">
                                                    <input
                                                        type={verSenha ? 'text' : 'password'}
                                                        value={senha}
                                                        onChange={(e) => setSenha(e.target.value)}
                                                        placeholder="Mínimo de 6 caracteres"
                                                        className={`${CAMPO} pr-12 font-mono`}
                                                        autoComplete="new-password"
                                                        autoCapitalize="none"
                                                        spellCheck={false}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setVerSenha((v) => !v)}
                                                        aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                                                        className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                                                    >
                                                        {verSenha ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                                                    </button>
                                                </div>
                                                <button type="button" onClick={copiarSenha} disabled={!senha} className={`${BTN_SEC} w-12 px-0`} aria-label="Copiar senha" title="Copiar senha">
                                                    {copiado ? <IconCheck size={18} /> : <IconCopy size={18} />}
                                                </button>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSenha(gerarSenha());
                                                        setVerSenha(true);
                                                    }}
                                                    className="min-h-11 text-[13px] font-bold text-[#3D6A99] underline underline-offset-4 dark:text-[#A9BED6]"
                                                >
                                                    Gerar outra senha
                                                </button>
                                                {editId != null ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setTrocarSenha(false);
                                                            setSenha('');
                                                        }}
                                                        className="min-h-11 text-[13px] font-bold text-[#5B6478] underline underline-offset-4 dark:text-[#AEB9CF]"
                                                    >
                                                        Manter a senha atual
                                                    </button>
                                                ) : null}
                                            </div>
                                            <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Copie e entregue a senha para a pessoa. Depois de salvar, ela não aparece de novo.</p>
                                        </>
                                    )}
                                </div>

                                {editId != null ? (
                                    <a
                                        href="/permissoes"
                                        className="flex min-h-11 items-center gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-[14px] font-bold text-[#313C55] hover:bg-[#E9EFF6] dark:bg-[#1C2334] dark:text-white dark:hover:bg-white/[0.06]"
                                    >
                                        <IconShieldLock size={18} />
                                        <span className="min-w-0 flex-1">Ver as telas e funções da Aurora em Permissões</span>
                                    </a>
                                ) : null}

                                {erroForm ? (
                                    <div role="alert" className="rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-3.5 py-2.5 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                                        {erroForm}
                                    </div>
                                ) : null}

                                {/* Excluir */}
                                {editId != null ? (
                                    <div className="border-t border-[#E3E8F0] pt-4 dark:border-white/[0.08]">
                                        {souEu ? (
                                            <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Você não pode excluir a própria conta.</p>
                                        ) : confirmarExclusao ? (
                                            <div className="rounded-xl border border-[#F3B8B2] bg-[#FDECEA] p-3 dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10">
                                                <p className="text-[14px] font-semibold text-[#B42318] dark:text-[#FF9C92]">
                                                    Excluir {nome}? A pessoa perde o acesso na hora e as permissões dela são apagadas. Não dá para desfazer.
                                                </p>
                                                <div className="mt-3 flex gap-2">
                                                    <button type="button" onClick={() => setConfirmarExclusao(false)} disabled={salvando} className={`${BTN_SEC} flex-1`}>
                                                        Não excluir
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void excluir()}
                                                        disabled={salvando}
                                                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 text-[14px] font-extrabold text-white hover:bg-[#962016] disabled:opacity-50"
                                                    >
                                                        <IconTrash size={18} />
                                                        Sim, excluir
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmarExclusao(true)}
                                                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[14px] font-bold text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10"
                                            >
                                                <IconTrash size={18} />
                                                Excluir usuário
                                            </button>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex shrink-0 justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-[#1C2334]">
                                <button type="button" onClick={fechar} disabled={salvando} className={`${BTN_SEC} flex-1 lg:flex-none`}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={() => void salvar()} disabled={salvando || loginRepetido} className={`${BTN_PRI} flex-1 lg:flex-none`}>
                                    {salvando ? 'Salvando…' : editId == null ? 'Criar usuário' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </NoCorpo>
            ) : null}
        </div>
    );
}
