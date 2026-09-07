import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

const COOKIE = "stride_session";
const MAX_AGE = 60 * 60 * 24 * 90;

function secret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set (32+ random chars) in production");
  }
  return "dev-only-insecure-secret-change-me";
}

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

function verify(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = sign(value);
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export async function setSession(userId: number) {
  const jar = await cookies();
  jar.set(COOKIE, sign(String(userId)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUserId(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const value = verify(raw);
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

export interface User {
  id: number;
  email: string;
  name: string;
}

export async function requireUser(): Promise<User> {
  const id = await currentUserId();
  if (id === null) throw new UnauthorizedError();
  const row = getDb().prepare("SELECT id, email, name FROM users WHERE id = ?").get(id) as
    | User
    | undefined;
  if (!row) throw new UnauthorizedError();
  return row;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/** Creates the user (and a default London Marathon profile) on first sign-in. */
export function upsertUser(email: string, name: string): User {
  const d = getDb();
  const existing = d.prepare("SELECT id, email, name FROM users WHERE email = ?").get(email) as
    | User
    | undefined;
  if (existing) return existing;
  const info = d.prepare("INSERT INTO users (email, name) VALUES (?, ?)").run(email, name);
  const id = Number(info.lastInsertRowid);
  d.prepare(
    `INSERT INTO profiles (user_id, race_name, race_date, goal_seconds, onboarded)
     VALUES (?, ?, ?, ?, 0)`,
  ).run(
    id,
    process.env.DEFAULT_RACE_NAME ?? "London Marathon",
    process.env.DEFAULT_RACE_DATE ?? "2027-04-26",
    Number(process.env.DEFAULT_GOAL_SECONDS ?? 3 * 3600 + 30 * 60),
  );
  return { id, email, name };
}
