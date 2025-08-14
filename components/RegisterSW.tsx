"use client";

import { useEffect } from "react";

export default function RegisterSW() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then(() => console.log("SW registrado"))
                .catch((err) => console.error("Erro ao registrar SW", err));
        }
    }, []);

    return null;
}
