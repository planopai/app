"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, CONVENIO_API, ESTOQUE_API, LOGIN_URL, apiJson } from "./api";
import * as T from "./tipos";
import type { SimNao, ProdutoRegra, BooleanRegra, CoroaRegra, RegrasConvenio, Convenio, EstoqueRow } from "./tipos";
import { getProdutoId, regraProduto, DEP_URNA, DEP_ROUPA, DEP_INVOL, DEP_VEU, DEP_CORDAO, DEP_COROA } from "./tipos";

export default function SimNaoSelect({
    value,
    onChange,
    disabled,
}: {
    value: SimNao;
    onChange: (value: SimNao) => void;
    disabled?: boolean;
}) {
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as SimNao)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        >
            <option value="">Não definido</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
        </select>
    );
}
