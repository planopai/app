"use client";
import React, { useEffect, useRef, useState } from "react";

export default function EditableText({
    text,
    onSave,
    className,
}: {
    text: string;
    onSave: (t: string) => void;
    className?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(text);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => setVal(text), [text]);

    useEffect(() => {
        if (editing) {
            const t = setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
            return () => clearTimeout(t);
        }
    }, [editing]);

    if (!editing) {
        return (
            <button
                className={`text-left ${className ?? ""}`}
                onClick={() => setEditing(true)}
                title="Clique para editar"
            >
                {text}
            </button>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className ?? ""}`}>
            <input
                ref={inputRef}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(false);
                    if (e.key === "Enter") {
                        if (!val.trim()) return;
                        onSave(val.trim());
                        setEditing(false);
                    }
                }}
                maxLength={255}
                className="min-w-[220px] flex-1 rounded-md border px-2 py-1 text-sm"
            />
            <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => {
                    if (!val.trim()) return;
                    onSave(val.trim());
                    setEditing(false);
                }}
            >
                Salvar
            </button>
            <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => setEditing(false)}
            >
                Cancelar
            </button>
        </div>
    );
}
