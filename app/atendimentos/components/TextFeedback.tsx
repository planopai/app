"use client";
import React from "react";

export default function TextFeedback({
    kind,
    children,
}: {
    kind: "success" | "error";
    children?: React.ReactNode;
}) {
    if (!children) return null;
    return (
        <div
            className={`mt-3 rounded-md px-3 py-2 text-sm ${kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
        >
            {children}
        </div>
    );
}
