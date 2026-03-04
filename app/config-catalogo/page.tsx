"use client";

import React, { useCallback, useEffect, useState } from "react";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/catalogo_api.php";

type Menu = {
    id: number;
    nome: string;
    ordem: number;
    ativo: number;
};

type Submenu = {
    id: number;
    menu_id: number;
    nome: string;
    ordem: number;
    ativo: number;
};

type Regra = {
    id: number;
    menu_id: number;
    submenu_id?: number | null;
    categoria_id?: number | null;
    classificacao_id?: number | null;
    produto_id?: number | null;
    categoria_nome?: string;
    classificacao_nome?: string;
    produto_nome?: string;
    ativo: number;
};

type Categoria = {
    id: number;
    nome: string;
};

type Classificacao = {
    id: number;
    nome: string;
};

export default function CatalogoAdminPage() {
    const [loading, setLoading] = useState(false);

    const [menus, setMenus] = useState<Menu[]>([]);
    const [submenus, setSubmenus] = useState<Submenu[]>([]);
    const [regras, setRegras] = useState<Regra[]>([]);

    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);

    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const apiGet = async (params: string) => {
        const r = await fetch(`${API_URL}?${params}`, {
            credentials: "include",
            cache: "no-store",
        });

        const j = await r.json();

        if (j.need_login) {
            window.location.href = "/login";
            return null;
        }

        if (!j.ok) {
            throw new Error(j.msg || "Erro");
        }

        return j;
    };

    const apiPost = async (body: any) => {
        const r = await fetch(API_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const j = await r.json();

        if (j.need_login) {
            window.location.href = "/login";
            return null;
        }

        if (!j.ok) {
            throw new Error(j.msg || "Erro");
        }

        return j;
    };

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const res = await apiGet("init=1");

            setMenus(res.menus || []);
            setSubmenus(res.submenus || []);
            setRegras(res.regras || []);
            setCategorias(res.categorias || []);
            setClassificacoes(res.classificacoes || []);
        } catch (e: any) {
            setMsg({ ok: false, text: e.message });
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const criarMenu = async () => {
        const nome = prompt("Nome do menu");
        if (!nome) return;

        await apiPost({
            action: "menu_criar",
            nome,
            ordem: menus.length + 1,
        });

        load();
    };

    const criarSubmenu = async (menu_id: number) => {
        const nome = prompt("Nome da subcategoria");
        if (!nome) return;

        await apiPost({
            action: "submenu_criar",
            menu_id,
            nome,
            ordem: 0,
        });

        load();
    };

    const adicionarRegraCategoria = async (menu_id: number) => {
        const categoria_id = prompt("ID da categoria");
        if (!categoria_id) return;

        const classificacao_id = prompt("ID da subcategoria (opcional)");

        await apiPost({
            action: "regra_adicionar",
            menu_id,
            categoria_id: Number(categoria_id),
            classificacao_id: classificacao_id
                ? Number(classificacao_id)
                : null,
        });

        load();
    };

    const adicionarRegraProduto = async (menu_id: number) => {
        const produto_id = prompt("ID do produto");
        if (!produto_id) return;

        await apiPost({
            action: "regra_adicionar",
            menu_id,
            produto_id: Number(produto_id),
        });

        load();
    };

    const excluirRegra = async (id: number) => {
        if (!confirm("Excluir regra?")) return;

        await apiPost({
            action: "regra_excluir",
            regra_id: id,
        });

        load();
    };

    const toggleRegra = async (r: Regra) => {
        await apiPost({
            action: "regra_toggle",
            regra_id: r.id,
            ativo: r.ativo ? 0 : 1,
        });

        load();
    };

    return (
        <div className="p-6">

            <h1 className="text-2xl font-semibold mb-4">
                Configuração do Catálogo
            </h1>

            {msg && (
                <div
                    className={`mb-4 p-3 border rounded ${msg.ok
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                        }`}
                >
                    {msg.text}
                </div>
            )}

            <div className="mb-4">
                <button
                    onClick={criarMenu}
                    className="bg-blue-600 text-white px-3 py-2 rounded"
                >
                    + Novo Menu
                </button>
            </div>

            {loading ? (
                <div>Carregando...</div>
            ) : (
                menus.map((menu) => {
                    const subs = submenus.filter(
                        (s) => s.menu_id === menu.id
                    );

                    const regrasMenu = regras.filter(
                        (r) => r.menu_id === menu.id
                    );

                    return (
                        <div
                            key={menu.id}
                            className="border rounded p-4 mb-4"
                        >
                            <div className="flex justify-between mb-3">

                                <div>
                                    <h2 className="font-semibold">
                                        {menu.nome}
                                    </h2>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        className="border px-2 py-1 text-sm"
                                        onClick={() =>
                                            criarSubmenu(menu.id)
                                        }
                                    >
                                        + Submenu
                                    </button>

                                    <button
                                        className="border px-2 py-1 text-sm"
                                        onClick={() =>
                                            adicionarRegraCategoria(menu.id)
                                        }
                                    >
                                        + Regra Categoria
                                    </button>

                                    <button
                                        className="border px-2 py-1 text-sm"
                                        onClick={() =>
                                            adicionarRegraProduto(menu.id)
                                        }
                                    >
                                        + Regra Produto
                                    </button>
                                </div>
                            </div>

                            {subs.length > 0 && (
                                <div className="mb-3">
                                    <div className="text-sm text-gray-500 mb-1">
                                        Submenus
                                    </div>

                                    {subs.map((s) => (
                                        <div
                                            key={s.id}
                                            className="text-sm border p-2 mb-1"
                                        >
                                            {s.nome}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div>
                                <div className="text-sm text-gray-500 mb-1">
                                    Regras
                                </div>

                                {regrasMenu.length === 0 && (
                                    <div className="text-xs text-gray-400">
                                        Nenhuma regra
                                    </div>
                                )}

                                {regrasMenu.map((r) => (
                                    <div
                                        key={r.id}
                                        className="flex justify-between border p-2 mb-1 text-sm"
                                    >
                                        <div>

                                            {r.produto_nome && (
                                                <div>
                                                    Produto: {r.produto_nome}
                                                </div>
                                            )}

                                            {r.categoria_nome && (
                                                <div>
                                                    Categoria: {r.categoria_nome}
                                                    {r.classificacao_nome &&
                                                        ` / ${r.classificacao_nome}`}
                                                </div>
                                            )}

                                        </div>

                                        <div className="flex gap-2">

                                            <button
                                                className="border px-2"
                                                onClick={() => toggleRegra(r)}
                                            >
                                                {r.ativo ? "Desativar" : "Ativar"}
                                            </button>

                                            <button
                                                className="border px-2"
                                                onClick={() =>
                                                    excluirRegra(r.id)
                                                }
                                            >
                                                Excluir
                                            </button>

                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}