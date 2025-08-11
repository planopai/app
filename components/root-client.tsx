"use client";

import * as React from "react";
import PWAInstallPrompt from "@/components/pwa-install";

export default function RootClient({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <PWAInstallPrompt />
        </>
    );
}
