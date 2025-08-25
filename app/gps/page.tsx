# Arquivos do scaffold
# ├─ prisma / schema.prisma
# ├─ src / lib / prisma.ts
# ├─ src / app / api / users / route.ts
# ├─ src / app / api / vehicles / route.ts
# ├─ src / app / api / trips / start / route.ts
# ├─ src / app / api / trips / [tripId] / track / route.ts
# ├─ src / app / api / trips / [tripId] / stop / route.ts
# ├─ src / app / checkin / page.tsx(Tela 1: seleção usuário / veículo + START / STOP)
# ├─ src / app / layout.tsx(theme base)
# └─ scripts / seed.ts(popular usuários / veículos de exemplo)

// ===============================
// prisma/schema.prisma
// ===============================
/// Ajuste o provedor para **MySQL HostGator**. Em `.env` defina `DATABASE_URL` no formato:
///   mysql://USUARIO:SENHA@HOST:3306/NOMEBANCO
/// Se o provedor exigir SSL, acrescente parâmetros conforme o hostgator informar (ex.: `?sslaccept=require`).

datasource db {
    provider = "mysql"
    url = env("DATABASE_URL")
}

generator client {
    provider = "prisma-client-js"
}

model User {
  id        String @id @default (cuid())
  name      String
  email     String ? @unique
  trips     Trip[]
  createdAt DateTime @default (now())
}

model Vehicle {
  id        String @id @default (cuid())
  label     String
  plate     String ? @unique
  trips     Trip[]
  createdAt DateTime @default (now())
}

model Trip {
  id          String @id @default (cuid())
  userId      String
  vehicleId   String
  startedAt   DateTime
  endedAt     DateTime ?
        startLat    Float ?
            startLng    Float ?
                endLat      Float ?
                    endLng      Float ?
                        distanceKm  Float @default (0)
  avgKmh      Float @default (0)
  maxKmh      Float @default (0)
  isActive    Boolean @default (true)

  user        User @relation(fields: [userId], references: [id])
  vehicle     Vehicle @relation(fields: [vehicleId], references: [id])
  points      TrackPoint[]

    @@index([userId, isActive])
    @@index([startedAt])
}

model TrackPoint {
  id        String @id @default (cuid())
  tripId    String
  ts        DateTime
  lat       Float
  lng       Float
  accuracy  Float ?
        speedKmh  Float ?
            heading   Float ?

                trip      Trip @relation(fields: [tripId], references: [id])

    @@index([tripId, ts])
}

// ===============================
// src/lib/prisma.ts
// ===============================
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ["error", "warn"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ===============================
// src/app/api/users/route.ts
// ===============================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(users);
}

// ===============================
// src/app/api/vehicles/route.ts
// ===============================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const vehicles = await prisma.vehicle.findMany({ orderBy: { label: "asc" } });
    return NextResponse.json(vehicles);
}

// ===============================
// src/app/api/trips/start/route.ts
// ===============================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Body = {
    userId: string;
    vehicleId: string;
    startedAt?: string; // ISO
    firstPoint?: {
        ts: string;
        lat: number;
        lng: number;
        accuracy?: number | null;
        speedKmh?: number | null;
        heading?: number | null;
    } | null;
};

export async function POST(req: Request) {
    const body = (await req.json()) as Body;
    if (!body.userId || !body.vehicleId) {
        return NextResponse.json({ error: "userId e vehicleId são obrigatórios" }, { status: 400 });
    }

    const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();

    const trip = await prisma.trip.create({
        data: {
            userId: body.userId,
            vehicleId: body.vehicleId,
            startedAt,
            isActive: true,
        },
    });

    if (body.firstPoint) {
        const p = body.firstPoint;
        await prisma.trackPoint.create({
            data: {
                tripId: trip.id,
                ts: new Date(p.ts),
                lat: p.lat,
                lng: p.lng,
                accuracy: p.accuracy ?? null,
                speedKmh: p.speedKmh ?? null,
                heading: p.heading ?? null,
            },
        });

        await prisma.trip.update({
            where: { id: trip.id },
            data: { startLat: p.lat, startLng: p.lng },
        });
    }

    return NextResponse.json({ tripId: trip.id });
}

// ===============================
// src/app/api/trips/[tripId]/track/route.ts
// ===============================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (d: number) => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

export async function POST(_req: Request, { params }: { params: { tripId: string } }) {
    const body = await _req.json();
    const { points } = body as { points: Array<{ ts: string; lat: number; lng: number; accuracy?: number | null; speedKmh?: number | null; heading?: number | null; }> };
    if (!Array.isArray(points) || points.length === 0) return NextResponse.json({ ok: true });

    // Insere em lote
    await prisma.trackPoint.createMany({
        data: points.map(p => ({
            tripId: params.tripId,
            ts: new Date(p.ts), lat: p.lat, lng: p.lng,
            accuracy: p.accuracy ?? null, speedKmh: p.speedKmh ?? null, heading: p.heading ?? null,
        }))
    });

    // Recalcular estatísticas incrementalmente (rápido: pega último ponto salvo e agrega)
    const lastTwo = await prisma.trackPoint.findMany({
        where: { tripId: params.tripId },
        orderBy: { ts: "desc" },
        take: 2,
    });

    let addKm = 0;
    if (lastTwo.length === 2) {
        addKm = haversineKm(lastTwo[0].lat, lastTwo[0].lng, lastTwo[1].lat, lastTwo[1].lng);
    }

    const trip = await prisma.trip.findUnique({ where: { id: params.tripId } });
    if (!trip) return NextResponse.json({ error: "Trip não encontrada" }, { status: 404 });

    const maxKmhNew = Math.max(
        trip.maxKmh,
        ...points.map(p => (p.speedKmh ?? 0))
    );

    const lastTs = new Date(points[points.length - 1].ts);
    const durationH = Math.max((((trip.endedAt ?? lastTs).getTime() - trip.startedAt.getTime()) / 3600000), 1 / 3600);
    const distanceKm = trip.distanceKm + addKm;
    const avgKmh = distanceKm / durationH;

    await prisma.trip.update({
        where: { id: params.tripId },
        data: {
            distanceKm,
            maxKmh: maxKmhNew,
            avgKmh,
        }
    });

    return NextResponse.json({ ok: true });
}

// ===============================
// src/app/api/trips/[tripId]/stop/route.ts
// ===============================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { tripId: string } }) {
    const body = await req.json();
    const { endedAt, lastPoint } = body as {
        endedAt?: string;
        lastPoint?: { ts: string; lat: number; lng: number; accuracy?: number | null; speedKmh?: number | null; heading?: number | null } | null;
    };

    if (lastPoint) {
        await prisma.trackPoint.create({
            data: {
                tripId: params.tripId,
                ts: new Date(lastPoint.ts),
                lat: lastPoint.lat,
                lng: lastPoint.lng,
                accuracy: lastPoint.accuracy ?? null,
                speedKmh: lastPoint.speedKmh ?? null,
                heading: lastPoint.heading ?? null,
            }
        });
    }

    // define A/B a partir do primeiro e último pontos
    const first = await prisma.trackPoint.findFirst({ where: { tripId: params.tripId }, orderBy: { ts: "asc" } });
    const last = await prisma.trackPoint.findFirst({ where: { tripId: params.tripId }, orderBy: { ts: "desc" } });

    await prisma.trip.update({
        where: { id: params.tripId },
        data: {
            isActive: false,
            endedAt: endedAt ? new Date(endedAt) : new Date(),
            startLat: first?.lat ?? null,
            startLng: first?.lng ?? null,
            endLat: last?.lat ?? null,
            endLng: last?.lng ?? null,
        }
    });

    return NextResponse.json({ ok: true });
}

// ===============================
// src/app/checkin/page.tsx
// ===============================
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Play, Square } from "lucide-react";

// Reaproveite seu MapRealtime/HUD se quiser, mas aqui temos um layout simples para MVP

type User = { id: string; name: string };
type Vehicle = { id: string; label: string };

export default function CheckinPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [userId, setUserId] = useState<string>("");
    const [vehicleId, setVehicleId] = useState<string>("");
    const [tripId, setTripId] = useState<string | null>(null);

    const { isTracking, startTracking, stopTracking, lastPosition, path, stats } = useGeolocation({ enableHighAccuracy: true, maxAge: 2000, timeout: 15000 });

    useEffect(() => {
        fetch("/api/users").then(r => r.json()).then(setUsers);
        fetch("/api/vehicles").then(r => r.json()).then(setVehicles);
    }, []);

    // Envio de pontos em lote simples (a cada 2s)
    useEffect(() => {
        if (!tripId || !isTracking) return;
        const t = setInterval(() => {
            const p = lastPosition;
            if (!p) return;
            const payload = {
                points: [{
                    ts: new Date(p.timestamp).toISOString(),
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                    accuracy: p.coords.accuracy ?? null,
                    speedKmh: typeof p.coords.speed === "number" ? Math.max(0, p.coords.speed * 3.6) : null,
                    heading: p.coords.heading ?? null,
                }]
            };
            fetch(`/api/trips/${tripId}/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        }, 2000);
        return () => clearInterval(t);
    }, [tripId, isTracking, lastPosition]);

    const canStart = userId && vehicleId && !isTracking && !tripId;
    const canStop = !!tripId && isTracking;

    const handleStart = async () => {
        if (!userId || !vehicleId) return;
        // tenta capturar firstPoint
        const p = lastPosition;
        const firstPoint = p ? {
            ts: new Date(p.timestamp).toISOString(),
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy ?? null,
            speedKmh: typeof p.coords.speed === "number" ? Math.max(0, p.coords.speed * 3.6) : null,
            heading: p.coords.heading ?? null,
        } : null;

        const res = await fetch('/api/trips/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, vehicleId, firstPoint }) });
        const data = await res.json();
        if (data.tripId) {
            setTripId(data.tripId);
            startTracking();
        }
    };

    const handleStop = async () => {
        if (!tripId) return;
        const p = lastPosition;
        const lastPoint = p ? {
            ts: new Date(p.timestamp).toISOString(),
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy ?? null,
            speedKmh: typeof p.coords.speed === "number" ? Math.max(0, p.coords.speed * 3.6) : null,
            heading: p.coords.heading ?? null,
        } : null;

        await fetch(`/api/trips/${tripId}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lastPoint }) });
        stopTracking();
        setTripId(null);
    };

    return (
        <main className="mx-auto max-w-4xl p-4">
            <h1 className="mb-4 text-2xl font-bold tracking-tight">Selecionar Usuário & Veículo</h1>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                    <div className="mb-2 text-sm font-semibold">Usuário</div>
                    <select className="w-full rounded-md border p-2" value={userId} onChange={e => setUserId(e.target.value)}>
                        <option value="">Selecione...</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>
                <div className="rounded-xl border p-4">
                    <div className="mb-2 text-sm font-semibold">Veículo</div>
                    <select className="w-full rounded-md border p-2" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                        <option value="">Selecione...</option>
                        {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
                <button disabled={!canStart} onClick={handleStart} className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 bg-emerald-500/10 px-5 py-3 text-emerald-800 enabled:hover:bg-emerald-500/20 disabled:opacity-50">
                    <Play className="h-5 w-5" /> START
                </button>
                <button disabled={!canStop} onClick={handleStop} className="inline-flex items-center gap-2 rounded-xl border border-rose-600 bg-rose-500/10 px-5 py-3 text-rose-800 enabled:hover:bg-rose-500/20 disabled:opacity-50">
                    <Square className="h-5 w-5" /> STOP
                </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <Info label="Velocidade" value={Number.isFinite(stats.lastKmh) ? `${stats.lastKmh.toFixed(1)} km/h` : '—'} />
                <Info label="Pico" value={Number.isFinite(stats.lastKmh) ? `${Math.max(stats.lastKmh, stats.avgKmh).toFixed(1)} km/h` : '—'} />
                <Info label="Média" value={Number.isFinite(stats.avgKmh) ? `${stats.avgKmh.toFixed(1)} km/h` : '—'} />
                <Info label="Distância" value={`${stats.distanceKm.toFixed(3)} km`} />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">Dica: mantenha a tela ativa e use HTTPS para melhor estabilidade.</p>
        </main>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-mono">{value}</div>
        </div>
    );
}

// ===============================
// src/app/layout.tsx (mínimo para tipografia base)
// ===============================
import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR">
            <body className="bg-white text-slate-900">{children}</body>
        </html>
    );
}

// ===============================
// scripts/seed.ts (opcional)
// ===============================
import { prisma } from "../src/lib/prisma";

async function main() {
    const users = ["Ana", "Bruno", "Carlos", "Daniela"].map(name => ({ name }));
    const vehicles = ["Fiorino Branca", "Kombi Azul", "Uno Vermelho"].map(label => ({ label }));
    await prisma.user.createMany({ data: users, skipDuplicates: true });
    await prisma.vehicle.createMany({ data: vehicles, skipDuplicates: true });
}

main().then(() => { console.log("Seed ok"); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
