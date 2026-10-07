import type { EstoqueColumnKey } from "../tipos";

// Colunas da tabela de produtos: ordem e larguras.

export const ESTOQUE_COLUMN_ORDER: EstoqueColumnKey[] = [
    "produto",
    "categoria",
    "fabricante",
    "classificacao",
    "qtd",
    "custo",
    "total",
];

export const ESTOQUE_DEFAULT_COLUMN_WIDTHS: Record<EstoqueColumnKey, number> = {
    produto: 270,
    categoria: 130,
    fabricante: 115,
    classificacao: 155,
    qtd: 65,
    custo: 115,
    total: 115,
};

export const ESTOQUE_MIN_COLUMN_WIDTHS: Record<EstoqueColumnKey, number> = {
    produto: 190,
    categoria: 95,
    fabricante: 90,
    classificacao: 115,
    qtd: 58,
    custo: 95,
    total: 95,
};

export const ESTOQUE_COLUMN_STORAGE_KEY = "estoque-produtos-column-widths-v1";
