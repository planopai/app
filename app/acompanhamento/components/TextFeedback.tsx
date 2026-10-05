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
            className={`mt-3 rounded-md px-3 py-2 text-sm ${kind === "success" ? "bg-[#EEF5D6] dark:bg-[#B3CE52]/20 text-[#313C55] dark:text-white" : "bg-[#FDECEA] dark:bg-[#FF9C92]/15 text-[#B42318] dark:text-[#FF9C92]"
                }`}
        >
            {children}
        </div>
    );
}
