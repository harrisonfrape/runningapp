import { NextResponse } from "next/server";
import { UnauthorizedError } from "./session";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[stride]", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
