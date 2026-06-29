import { Word } from '../types';

/**
 * Section / unit model for the learning path.
 *
 * Every letter's words are split into fixed-size **units** (UNIT_SIZE words
 * each, in alphabetical order). Consecutive units are grouped into **sections**
 * (UNITS_PER_SECTION units each), titled like "A1", "A2". A unit's progress is
 * the share of its words flagged `mastered`. A unit unlocks only once the
 * previous unit in the same letter is fully mastered; each letter is
 * independent, so unit 1 of every letter is always available.
 *
 * Everything here is derived from the `words` array + their `mastered` flag —
 * there is no separate persisted unit state.
 */

/** Words per unit (placeholder — tunable). */
export const UNIT_SIZE = 8;
/** Units grouped into one section (placeholder — tunable). */
export const UNITS_PER_SECTION = 5;

export type UnitStatus = 'locked' | 'active' | 'completed';

export interface Unit {
  /** Stable id, e.g. "A-3". */
  id: string;
  letter: string;
  /** 1-based position within the letter. */
  unitNumber: number;
  /** 1-based section this unit belongs to. */
  sectionNumber: number;
  words: Word[];
  masteredCount: number;
  total: number;
  /** mastered / total, rounded. 100 only when every word is mastered. */
  percentage: number;
  status: UnitStatus;
}

export interface Section {
  /** Stable id / display title, e.g. "A1". */
  id: string;
  letter: string;
  sectionNumber: number;
  title: string;
  units: Unit[];
}

/** All words for a letter, alphabetised the same way BrowseView orders them. */
function wordsForLetter(words: Word[], letter: string): Word[] {
  return words
    .filter((w) => w.word.toUpperCase().startsWith(letter))
    .sort((a, b) => a.word.localeCompare(b.word));
}

/** Slice indices [start, end) for a 1-based unit number. */
export function unitWordRange(unitNumber: number): [number, number] {
  const start = (unitNumber - 1) * UNIT_SIZE;
  return [start, start + UNIT_SIZE];
}

/**
 * Build the ordered units for a letter, with mastery stats and lock status.
 * Exactly one unit is `active` (the first incomplete one) unless every unit is
 * complete, in which case none are active.
 */
export function buildUnitsForLetter(words: Word[], letter: string): Unit[] {
  const letterWords = wordsForLetter(words, letter);
  const units: Unit[] = [];
  const unitCount = Math.ceil(letterWords.length / UNIT_SIZE);

  let prevCompleted = true; // unit 1 is always reachable
  for (let i = 0; i < unitCount; i++) {
    const unitNumber = i + 1;
    const [start, end] = unitWordRange(unitNumber);
    const unitWords = letterWords.slice(start, end);
    const total = unitWords.length;
    const masteredCount = unitWords.filter((w) => w.mastered).length;
    const percentage = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
    const completed = total > 0 && masteredCount === total;

    let status: UnitStatus;
    if (completed) status = 'completed';
    else if (prevCompleted) status = 'active';
    else status = 'locked';

    units.push({
      id: `${letter}-${unitNumber}`,
      letter,
      unitNumber,
      sectionNumber: Math.floor(i / UNITS_PER_SECTION) + 1,
      words: unitWords,
      masteredCount,
      total,
      percentage,
      status,
    });

    prevCompleted = completed;
  }

  return units;
}

/** Group a letter's units into sections of UNITS_PER_SECTION. */
export function buildSectionsForLetter(words: Word[], letter: string): Section[] {
  const units = buildUnitsForLetter(words, letter);
  const sections: Section[] = [];

  for (const unit of units) {
    let section = sections[unit.sectionNumber - 1];
    if (!section) {
      section = {
        id: `${letter}${unit.sectionNumber}`,
        letter,
        sectionNumber: unit.sectionNumber,
        title: `Section ${letter}${unit.sectionNumber}`,
        units: [],
      };
      sections[unit.sectionNumber - 1] = section;
    }
    section.units.push(unit);
  }

  return sections.filter(Boolean);
}

/**
 * The unit the user should land on for a letter: the active (first incomplete)
 * unit, or the last unit when everything is mastered. Returns 1 when the letter
 * has no words.
 */
export function findActiveUnitNumber(words: Word[], letter: string): number {
  const units = buildUnitsForLetter(words, letter);
  if (units.length === 0) return 1;
  const active = units.find((u) => u.status === 'active');
  return active?.unitNumber ?? units[units.length - 1].unitNumber;
}
