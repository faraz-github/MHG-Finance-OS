// src/app/api/properties/route.ts
// GET — list properties. POST — create property (SuperAdmin only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  requireRole,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyRow {
  id: string; name: string; address: string | null;
  city: string; state: string; comm: number; capital: number;
  type: string; rooms: number; assets: unknown; image_path: string | null;
  broker_name: string; broker_pct: number; broker_public: boolean;
  created_at: string; updated_at: string;
}

function serializeProperty(
  p: Awaited<ReturnType<typeof prisma.property.findUniqueOrThrow>>
): PropertyRow {
  return {
    id: p.id, name: p.name, address: p.address,
    city: p.city, state: p.state,
    comm: p.comm.toNumber(), capital: p.capital.toNumber(),
    type: p.type, rooms: p.rooms, assets: p.assets, image_path: p.image_path,
    broker_name:   p.broker_name ?? '',
    broker_pct:    p.broker_pct.toNumber(),
    broker_public: p.broker_public,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

function handleError(err: unknown): NextResponse<{ error: string }> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError)
    return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025")
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    if (err.code === "P2002")
      return NextResponse.json({ error: "A property with this name already exists." }, { status: 409 });
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";
  try { await assertPermission(role, "properties", "read"); }
  catch (err) { return handleError(err); }

  try {
    let properties;
    if (role === "SuperAdmin") {
      properties = await prisma.property.findMany({ orderBy: { name: "asc" } });
    } else {
      const userId = request.headers.get("x-user-id") ?? "";
      void userId;
      const [bookingProps, expenseProps] = await Promise.all([
        prisma.booking.findMany({ select: { property_id: true }, distinct: ["property_id"] }),
        prisma.dailyExpense.findMany({ select: { property_id: true }, distinct: ["property_id"] }),
      ]);
      const propertyIds = [...new Set([
        ...bookingProps.map((b) => b.property_id),
        ...expenseProps.map((e) => e.property_id),
      ])];
      properties = await prisma.property.findMany({
        where: { id: { in: propertyIds } },
        orderBy: { name: "asc" },
      });
    }
    return NextResponse.json({ data: properties.map(serializeProperty) });
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";
  try { requireRole(role, ["SuperAdmin"]); }
  catch (err) { return handleError(err); }

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const name = body.name;
  if (typeof name !== "string" || name.trim() === "")
    return NextResponse.json({ error: 'Field "name" is required.' }, { status: 422 });

  try {
    const property = await prisma.property.create({
      data: {
        name:    name.trim(),
        address: typeof body.address === "string" ? body.address.trim() : null,
        city:    typeof body.city    === "string" ? body.city.trim()    : "",
        state:   typeof body.state   === "string" ? body.state.trim()   : "",
        comm:    typeof body.comm    === "number"  ? body.comm           : new Prisma.Decimal(25),
        capital: typeof body.capital === "number"  ? body.capital        : new Prisma.Decimal(0),
        type:    typeof body.type    === "string" ? body.type.trim()    : "",
        rooms:   typeof body.rooms   === "number"  ? Math.floor(body.rooms) : 0,
        assets:  Array.isArray(body.assets) ? body.assets : [],
        broker_name:   typeof body.broker_name   === "string"  ? body.broker_name.trim() : null,
        broker_pct:    typeof body.broker_pct    === "number"  ? body.broker_pct         : new Prisma.Decimal(0),
        broker_public: typeof body.broker_public === "boolean" ? body.broker_public       : false,
      },
    });
    return NextResponse.json({ data: serializeProperty(property) }, { status: 201 });
  } catch (err) { return handleError(err); }
}
