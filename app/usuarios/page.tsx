'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Usuario = { id: number; nome: string; usuario: string };

const API_URL = '/api/php/pai_api.php';

// -------- parser robusto --------
async function safeJsonFetch(input: RequestInfo, init?: RequestInit) {
    const r = await fetch(input, { cache: 'no-store', ...init });
    const text = await r.text();

    // remove BOM e espaços fora
    const cleaned = text.replace(/^\uFEFF/, '').trim();

    // se veio HTML (ex.: erro do servidor), tenta extrair um { ... } do texto
    const looksHtml = cleaned.startsWith('<') || cleaned.toLowerCase().startsWith('http');
    let parsed: any = null;

    if (!looksHtml) {
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            // fallback: tenta pegar primeiro bloco { ... }
            const m = cleaned.match(/\{[\s\S]*\}$/m);
            if (m) {
                parsed = JSON.parse(m[0]);
            }
        }
    }

    // se ainda não deu, retorna como erro bruto
    if (parsed == null) {
        throw new Error(`Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? '…' : ''}`);
    }

    // se HTTP não-OK, propaga msg do JSON se tiver
    if (!r.ok || parsed?.erro) {
        throw new Error(parsed?.erro || parsed?.msg || `HTTP ${r.status}`);
    }

    return parsed;
}

export default function UsuariosPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [nome, setNome] = useState('');
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');

    const resetForm = () => { setEditingId(null); setNome(''); setUsuario(''); setSenha(''); };

    const fetchUsuarios = async () => {
        setLoading(true); setError(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`);
            setUsuarios(j as Usuario[]);
        } catch (e: any) {
            setError(e.message || 'Erro inesperado');
            setUsuarios([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsuarios(); }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!nome.trim() || !usuario.trim() || (editingId == null && !senha.trim())) {
            setError(editingId == null ? 'Preencha nome, usuário e senha.' : 'Preencha nome e usuário.');
            return;
        }
        setLoading(true);
        try {
            const action = editingId == null ? 'create_user' : 'update_user';
            await safeJsonFetch(`${API_URL}?action=${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId ?? undefined, nome, usuario, senha }),
            });
            await fetchUsuarios(); resetForm();
        } catch (e: any) {
            setError(e.message || 'Erro inesperado');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (u: Usuario) => { setEditingId(u.id); setNome(u.nome); setUsuario(u.usuario); setSenha(''); };

    const removeUser = async (id: number) => {
        if (!confirm('Excluir este usuário?')) return;
        setLoading(true); setError(null);
        try {
            await safeJsonFetch(`${API_URL}?action=delete_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            await fetchUsuarios();
        } catch (e: any) {
            setError(e.message || 'Erro inesperado');
        } finally {
            setLoading(false);
        }
    };

    const title = useMemo(() => (editingId == null ? 'Novo usuário' : `Editar usuário #${editingId}`), [editingId]);

    return (
        <div className="max-w-6xl mx-auto p-6 font-[var(--font-nunito,_inherit)]">
            <h1 className="text-2xl font-semibold mb-4">Usuários</h1>

            <div className="rounded-2xl shadow p-4 mb-8">
                <h2 className="text-lg font-medium mb-4">{title}</h2>
                {error && <p className="text-red-600 mb-3">{error}</p>}
                <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm mb-1">Nome</label>
                        <input className="w-full border rounded-lg px-3 py-2" value={nome} onChange={e => setNome(e.target.value)} />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm mb-1">Usuário</label>
                        <input className="w-full border rounded-lg px-3 py-2" value={usuario} onChange={e => setUsuario(e.target.value)} />
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm mb-1">
                            Senha {editingId != null && <span className="opacity-60 text-xs">(em branco = manter)</span>}
                        </label>
                        <input className="w-full border rounded-lg px-3 py-2" type="password" value={senha}
                            onChange={e => setSenha(e.target.value)} />
                    </div>
                    <div className="md:col-span-4 flex gap-2">
                        <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" disabled={loading} type="submit">
                            {editingId == null ? 'Adicionar' : 'Salvar alterações'}
                        </button>
                        {editingId != null && (
                            <button className="px-4 py-2 rounded-xl border" onClick={resetForm} type="button" disabled={loading}>
                                Cancelar
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="rounded-2xl shadow overflow-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="bg-gray-50 text-left">
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Nome</th>
                            <th className="px-4 py-3">Usuário</th>
                            <th className="px-4 py-3">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map(u => (
                            <tr key={u.id} className="border-t">
                                <td className="px-4 py-2">{u.id}</td>
                                <td className="px-4 py-2">{u.nome}</td>
                                <td className="px-4 py-2">{u.usuario}</td>
                                <td className="px-4 py-2">
                                    <div className="flex gap-2">
                                        <button className="px-3 py-1 rounded-lg border" onClick={() => startEdit(u)} disabled={loading}>Editar</button>
                                        <button className="px-3 py-1 rounded-lg bg-red-600 text-white" onClick={() => removeUser(u.id)} disabled={loading}>Excluir</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {usuarios.length === 0 && !loading && (
                            <tr><td className="px-4 py-6 text-center text-gray-500" colSpan={4}>Nenhum usuário encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
