// components/app-splash.tsx
"use client";
import * as React from "react";

export default function AppSplash() {
    const [hide, setHide] = React.useState(false);
    React.useEffect(() => {
        const done = () => setHide(true);
        if (document.readyState === "complete") done();
        else window.addEventListener("load", done);
        return () => window.removeEventListener("load", done);
    }, []);
    if (hide) return null;

    return (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-white">
            {/* troque pela sua logo */}
            <img src="/icon-192.png" alt="Plano PAI" width={96} height={96} />
        </div>
    );
}
