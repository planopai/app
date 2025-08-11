'use client';
import { useEffect, useRef, useState } from 'react';
import { Workbox } from 'workbox-window';

export default function SWUpdater() {
    const wbRef = useRef<Workbox | null>(null);
    const [updateReady, setUpdateReady] = useState(false);

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            const wb = new Workbox('/sw.js', { scope: '/' });
            wbRef.current = wb;
            wb.addEventListener('waiting', () => setUpdateReady(true));
            wb.register();
        }
    }, []);

    if (!updateReady) return null;

    return (
        <div
            style={{
                position: 'fixed', insetInline: 16, bottom: 16, zIndex: 9999,
                background: '#22334f', color: '#fff', padding: '10px 12px',
                borderRadius: 12, display: 'flex', gap: 8, alignItems: 'center',
                boxShadow: '0 6px 24px rgba(0,0,0,.25)', fontFamily: 'Nunito, sans-serif'
            }}
        >
            <span>Nova versão disponível.</span>
            <button
                onClick={async () => {
                    const wb = wbRef.current;
                    if (!wb) return;
                    wb.addEventListener('controlling', () => window.location.reload());
                    await wb.messageSkipWaiting();
                }}
                style={{
                    marginLeft: 'auto',
                    background: '#059de0', color: '#fff',
                    border: 'none', borderRadius: 10, padding: '8px 10px',
                    fontWeight: 700, cursor: 'pointer'
                }}
            >
                Atualizar
            </button>
        </div>
    );
}
