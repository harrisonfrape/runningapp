import type { SessionType, Zone } from "./types";
import { MARATHON_KM, marathonPaceKm } from "./plan";
import { paceString } from "./zones";

/**
 * Everything needed to describe a session, derived once per request and shared
 * by the server and the browser. Pure — no database, so the client can render
 * any day of the plan the moment it is clicked.
 */
export interface SessionContext {
  zones: Zone[];
  thresholdPaceSecPerKm: number;
  goalSeconds: number;
}

export interface ViewDay {
  date: string;
  week: number;
  dayIdx: number;
  phase: string;
  type: SessionType;
  title: string;
  sub: string;
  km: number;
  zone: string;
  adapted: boolean;
  adaptReason: string | null;
  hrCap: number | null;
  done: boolean;
}

export interface Segment {
  name: string;
  detail: string;
  target: string;
  zone: string;
  color: string;
}

export interface SessionTargets {
  zone: string;
  hr: string;
  pace: string;
  duration: string;
}

export function typeColor(t: SessionType): string {
  return (
    {
      rest: "#D8D3C6",
      easy: "#7FB89A",
      recovery: "#B9C7BE",
      hard: "#D97B4F",
      tempo: "#E3B34C",
      long: "#7FB89A",
      marathon: "#E3B34C",
      race: "#C24A3D",
    } as Record<SessionType, string>
  )[t];
}

/** Pace band per session type, all anchored on the athlete's own threshold pace. */
function paceFor(ctx: SessionContext, type: SessionType): string {
  const tp = ctx.thresholdPaceSecPerKm;
  switch (type) {
    case "rest":
      return "—";
    case "easy":
      return `${paceString(tp * 1.19)}–${paceString(tp * 1.34)} /km`;
    case "recovery":
      return `${paceString(tp * 1.35)}+ /km`;
    case "long":
      return `${paceString(tp * 1.2)}–${paceString(tp * 1.3)} /km`;
    case "marathon":
      return `${paceString(ctx.goalSeconds / MARATHON_KM)} /km at pace`;
    case "tempo":
      return `${paceString(tp * 0.98)} /km`;
    case "hard":
      return `${paceString(tp * 0.93)} /km reps`;
    case "tuneup":
      // The plan's own sub-line carries the race target; the band here is just
      // "faster than threshold", which is what a race of this length is.
      return `${paceString(tp * 0.97)} /km or quicker`;
    case "race":
      return `${paceString(ctx.goalSeconds / MARATHON_KM)} /km`;
  }
}

function secPerKmFor(ctx: SessionContext, type: SessionType): number {
  const tp = ctx.thresholdPaceSecPerKm;
  return {
    rest: 0,
    easy: tp * 1.26,
    recovery: tp * 1.38,
    long: tp * 1.25,
    // Half the run at goal pace, half easy.
    marathon: (ctx.goalSeconds / MARATHON_KM) * 0.5 + tp * 1.25 * 0.5,
    tempo: tp * 1.05,
    hard: tp * 1.08,
    tuneup: tp * 0.97,
    race: ctx.goalSeconds / 42.195,
  }[type];
}

export function sessionTargets(ctx: SessionContext, day: ViewDay): SessionTargets {
  const zoneIdx = Number((day.zone.match(/Z(\d)/) || [])[1] ?? 0) - 1;
  const zone = ctx.zones[zoneIdx] ?? null;
  const duration = day.km ? `~${Math.round((day.km * secPerKmFor(ctx, day.type)) / 60)} min` : "—";
  return {
    zone: zone ? `Zone ${zone.key}` : "—",
    hr: day.hrCap
      ? `cap ${day.hrCap} bpm`
      : zone
        ? zone.key === 1
          ? `< ${zone.highHr} bpm`
          : zone.key === 5
            ? `${zone.lowHr}+ bpm`
            : `${zone.lowHr}–${zone.highHr} bpm`
        : "—",
    pace: paceFor(ctx, day.type),
    duration,
  };
}

export function coachNoteFor(type: SessionType): string {
  return {
    rest: "Nothing to run today. Rest is where the adaptation happens — the plan counts on it as much as the sessions.",
    easy: "Truly conversational. If you can't hold a chat, you're going too fast — the aerobic gains come from staying in Zone 2, not from pushing the pace.",
    recovery:
      "Slower than feels natural. This run exists to flush the legs and protect the next quality session, nothing more.",
    long: "The cornerstone of the week. Settle in, stay relaxed, and practise fuelling — gels or carbs after the first hour, every 30–40 minutes.",
    marathon:
      "The most race-specific session in the block. Run easy until the pace block, then lock onto goal pace and hold it — this is where you learn what it feels like on tired legs, and where your fuelling gets rehearsed properly.",
    tempo:
      "Comfortably hard, and no harder. The point is time at threshold, not a race — finish knowing you could have held it another kilometre.",
    hard: "Quality day. Finish the last rep feeling like you had one more in the tank — form tall, effort controlled.",
    tuneup:
      "Race it properly — this is the sharpest read on your marathon fitness you'll get before the day, and the result feeds straight into your projection. Warm up thoroughly, start controlled, take the last third hard. The easy days either side of it are already in the plan.",
    race: "Everything you built, on the day. Go out at goal pace and trust the block.",
  }[type];
}

export async function segmentsFor(ctx: SessionContext, day: ViewDay): Promise<Segment[]> {
  const targets = await sessionTargets(ctx, day);
  const tp = ctx.thresholdPaceSecPerKm;
  const z = ctx.zones;

  if (day.type === "rest") {
    return [
      {
        name: "Rest day",
        detail: "Optional 20 min mobility or stretching",
        target: "—",
        zone: "—",
        color: "#3A4A41",
      },
    ];
  }

  if (day.type === "marathon") {
    const mp = marathonPaceKm(day.km);
    const easy = Math.max(0, Math.round((day.km - mp) * 10) / 10);
    return [
      {
        name: "Easy opening",
        detail: `${Math.round(easy * 0.6 * 10) / 10} km relaxed, settle in`,
        target: `${paceString(tp * 1.25)} /km`,
        zone: "Z2",
        color: z[1].color,
      },
      {
        name: "Marathon-pace block",
        detail: `${mp} km at goal pace`,
        target: `${paceString(ctx.goalSeconds / MARATHON_KM)} /km`,
        zone: "Z3",
        color: z[2].color,
      },
      {
        name: "Easy finish",
        detail: `${Math.round(easy * 0.4 * 10) / 10} km, hold form`,
        target: `${paceString(tp * 1.3)} /km`,
        zone: "Z2",
        color: z[1].color,
      },
    ];
  }

  if (day.type === "hard" || day.type === "tempo") {
    const main = day.sub.split(" at ")[0].replace(/\.$/, "");
    return [
      {
        name: "Warm-up",
        detail: "1.5 km very easy, build to steady",
        target: `${paceString(tp * 1.3)} /km`,
        zone: "Z1–Z2",
        color: z[0].color,
      },
      {
        name: main,
        detail:
          day.type === "hard" ? "At 5K effort, relaxed form" : "Continuous at threshold effort",
        target: targets.pace,
        zone: "Z4",
        color: z[3].color,
      },
      ...(day.type === "hard"
        ? [
            {
              name: "Recoveries",
              detail: "2 min jog between reps",
              target: "Easy jog",
              zone: "Z1",
              color: z[0].color,
            },
          ]
        : []),
      {
        name: "Cool-down",
        detail: "1 km easy",
        target: `${paceString(tp * 1.35)} /km`,
        zone: "Z1",
        color: z[0].color,
      },
    ];
  }

  return [
    {
      name: "Main run",
      detail: day.sub,
      target: targets.pace,
      zone: day.zone,
      color:
        day.type === "recovery" ? z[0].color : day.type === "race" ? z[2].color : z[1].color,
    },
  ];
}

/** The full day-detail payload the "Today's workout" screen renders. */
export async function workoutFor(ctx: SessionContext, day: ViewDay) {
  const t = await sessionTargets(ctx, day);
  return {
    title: day.title,
    adapted: day.adapted,
    adaptReason: day.adaptReason ?? "",
    km: day.km ? day.km.toFixed(1) : "—",
    duration: t.duration,
    zone: t.zone,
    hr: t.hr,
    pace: t.pace,
    coachNote: coachNoteFor(day.type),
    segments: await segmentsFor(ctx, day),
  };
}
