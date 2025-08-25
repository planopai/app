"use client";
import React from "react";

export default function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="mb-1 block text-sm font-medium">{children}</label>;
}
