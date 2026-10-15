"use client";

import * as React from "react";

export default function RootClient({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}