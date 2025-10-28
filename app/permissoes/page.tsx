'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Usuario = { id: number; nome: string; usuario: string };
type Pagina = { key: string; label: string };

const API_URL = '/api/php/pai_api.php';

const DEFAULT_PAGES: Pagina[] = [
    { key: 'dashboard', label: 'Dashboard (Tela Inicial)' },
    { key: 'usuarios', label: 'Usuários' },
    { key: 'permissoes', label: 'Permissões' },
    { key: 'relatorios', label: 'Relatórios' },
    { key: 'financeiro', label: 'Financeiro' },
    { key: 'atendimentos', label: 'Atendimentos' },
];

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [paginas, setPaginas] = useState<Pagina[]>(DEFAULT_PAGES);
    const [userId, setUserId] = useState<number | null>(null);
    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchUsuarios = async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API_URL}?action=list_users`, { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.erro || 'Falha ao listar usuários.');
            setUsuarios(j as Usuario[]);
        } catch (e: any) { setError(e.message || 'Erro ao carregar usuários.'); }
        finally { setLoading(false); }
    };

    const fetchPaginas = async () => {
        try {
            const r = await fetch(`${API_URL}?action=list_pages`, { cache: 'no-store' });
            if (r.ok) {
                const j = (await r.json()) as Pagina[];
                if (Array.isArray(j) && j.length) setPaginas(j);
            }
        } catch { /* usa defaults */ }
    };

    const fetchPerms = async (uid: number) => {
        setLoading(true); setError(null); setMsg(null);
        try {
            const r = await fetch(`${API_URL}?action=list_permissions&user_id=${uid}`, { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.erro || 'Falha ao obter permissões.');
            const set: Record<string, boolean> = {};
            (j as string[]).forEach(k => set[k] = true);
            setAllowed(set);
        } catch (e: any) { setError(e.message || 'Erro ao carregar permissões.'); setAllowed({}); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchUsuarios(); fetchPaginas(); }, []);
    useEffect(() => { if (userId != null) fetchPerms(userId); }, [userId]);

    const toggle = (key: string) => setAllowed(p => ({ ...p, [key]: !p[key] }));

    const save = async () => {
        if (userId == null) return;
        setLoading(true); setMsg(null); setError(null);
        try {
            const selecionadas = Object.entries(allowed).filter(([, v]) => v).map(([k]) => k);
            const r = await fetch(`${API_URL}?action=save_permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, permissions: selecionadas }),
            });
            const j = await r.json();
            if (!r.ok || j?.erro || j?.sucesso === false) throw new Error(j?.msg || j?.erro || 'Falha ao salvar permissões.');
            setMsg('Permissões salvas!');
        } catch (e: any) { setError(e.message || 'Erro ao salvar permissões.'); }
        finally { setLoading(false); }
    };

    const currentUser = useMemo(() => usuarios.find(u => u.id === userId), [userId, usuarios]);

    return (
        <div className="max-w-5xl mx-auto p-6">
            <h1 className="text-2xl font-semibold mb-4">Permissões por usuário</h1>

            <div className="rounded-2xl shadow p-4 mb-6">
                <label className="block text-sm mb-1">Usuário</label>
                <select className="border rounded-lg px-3 py-2 w-full md:w-96"
                    value={userId ?? ''} onChange={e => setUserId(e.target.value ? parseInt(e.target.value) : null)}>
                    <option value="">Selecione...</option>
                    {usuarios.map(u => (
                        <option key={u.id} value={u.id}>
                            #{u.id} – {u.nome} ({u.usuario})
                        </option>
                    ))}
                </select>
            </div>

            {userId != null && (
                <div className="rounded-2xl shadow p-4">
                    <h2 className="text-lg font-medium mb-3">
                        Páginas liberadas para {currentUser?.nome} ({currentUser?.usuario})
                    </h2>

                    {msg && <p className="text-green-700 mb-2">{msg}</p>}
                    {error && <p className="text-red-600 mb-2">{error}</p>}

                    <ul className="grid md:grid-cols-2 gap-2">
                        {paginas.map(p => (
                            <li key={p.key} className="flex items-center gap-2">
                                <input id={`pg-${p.key}`} type="checkbox" checked={!!allowed[p.key]} onChange={() => toggle(p.key)} />
                                <label htmlFor={`pg-${p.key}`}>{p.label}</label>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-4">
                        <button onClick={save} disabled={loading} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50">
                            Salvar permissões
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
