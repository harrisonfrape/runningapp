import type { Config } from "@netlify/functions";

/**
 * Scheduled trigger for the nightly job. The work itself lives in the app at
 * /api/cron/nightly so that a cron shell, a manual curl and this function all
 * run exactly the same code path.
 */
export default async function handler() {
  const base = process.env.APP_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[stride] nightly: APP_URL and CRON_SECRET must both be set");
    return new Response("not configured", { status: 503 });
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/nightly`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`[stride] nightly ${res.status}: ${body.slice(0, 500)}`);
  return new Response(body, { status: res.status });
}

export const config: Config = { schedule: "0 5 * * *" };
