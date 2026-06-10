"use client";

import React from "react";
import type { Registro } from "./types";

export default function EnviarPortalFamilia({
    registro,
}: {
    registro?: Registro | null;
}) {
    return (
        <button
            type="button"
            className="w-full rounded-md border px-3 py-2 text-sm text-left opacity-60"
            disabled
            title="Funcionalidade em desenvolvimento"
        >
            Enviar Portal da Família
        </button>
    );
}