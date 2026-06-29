/**
 * "Mastered today" counter — the headline number on the learning path's daily
 * task chip (e.g. 12 / 20). Local-only, keyed by user id, and reset whenever the
 * stored date is no longer today. Mirrors the streak storage pattern in auth.ts.
 */

/** Words to master in a day (placeholder — tunable). */
export const DAILY_GOAL = 20;

interface DailyRecord {
  date: string; // yyyy-mm-dd
  masteredToday: number;
}

const dailyKey = (userId: string) => `instagre_daily_${userId}`;
const todayStr = (): string => new Date().toISOString().slice(0, 10);

function readDaily(userId: string): DailyRecord {
  try {
    const raw = localStorage.getItem(dailyKey(userId));
    if (raw) {
      const rec = JSON.parse(raw) as DailyRecord;
      if (rec.date === todayStr() && typeof rec.masteredToday === 'number') {
        return rec;
      }
    }
  } catch {
    /* ignore corrupt cache */
  }
  return { date: todayStr(), masteredToday: 0 };
}

function writeDaily(userId: string, rec: DailyRecord): void {
  try {
    localStorage.setItem(dailyKey(userId), JSON.stringify(rec));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Words mastered today (0 if the stored day has rolled over). */
export function getDailyMastered(userId: string): number {
  return readDaily(userId).masteredToday;
}

/**
 * Adjust today's mastered count by +1 (a word just became mastered) or -1 (a
 * word was un-mastered). Clamped at 0 and returns the new value.
 */
export function recordMasteredDelta(userId: string, delta: 1 | -1): number {
  const rec = readDaily(userId);
  const next: DailyRecord = {
    date: todayStr(),
    masteredToday: Math.max(0, rec.masteredToday + delta),
  };
  writeDaily(userId, next);
  return next.masteredToday;
}
