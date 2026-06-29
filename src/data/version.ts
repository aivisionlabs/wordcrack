import { Word } from '../types';
import { initialWords } from '../wordsData';
import { supabase } from '../lib/supabase';
import {
  ProgressMap,
  readProgressCache,
  applyPendingToProgress,
} from './sync';

/**
 * Words are split into two halves:
 *  - CONTENT (definitions, examples, …) lives in the global `words` table and is
 *    cached locally under one key (same for every user).
 *  - PROGRESS (mastered / toughNut / viewed) is per-user and lives in localStorage only.
 *
 * Offline-first: `loadWordsCached` returns instantly from cache (or bundled seed),
 * and `pullWords` refreshes word content from Supabase in the background.
 */

export const CONTENT_KEY = 'instagre_words_content';

/** Word content only — the per-user flags are intentionally omitted here. */
type WordContent = Omit<Word, 'mastered' | 'toughNut' | 'viewed'>;

interface WordRow {
  id: string;
  word: string;
  ipa: string;
  part_of_speech: string;
  definitions: string[] | null;
  examples: string[] | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
  etymology: string;
  audio_url: string | null;
  sort_order: number;
  /** @deprecated legacy column — removed after migration 0004 */
  definition?: string;
  secondary_definition?: string | null;
}

type CachedWordContent = WordContent & {
  definition?: string;
  secondaryDefinition?: string;
};

function normalizeDefinitions(raw: CachedWordContent): string[] {
  if (Array.isArray(raw.definitions) && raw.definitions.length) {
    return raw.definitions;
  }
  const legacy = [raw.definition, raw.secondaryDefinition].filter(
    (d): d is string => Boolean(d?.trim()),
  );
  return legacy.length ? legacy : [];
}

function rowToContent(r: WordRow): WordContent {
  const definitions =
    r.definitions?.length
      ? r.definitions
      : [r.definition, r.secondary_definition].filter(
          (d): d is string => Boolean(d?.trim()),
        );

  return {
    id: r.id,
    word: r.word,
    ipa: r.ipa,
    partOfSpeech: r.part_of_speech,
    definitions,
    examples: r.examples ?? [],
    synonyms: r.synonyms ?? [],
    antonyms: r.antonyms ?? [],
    etymology: r.etymology,
    audioUrl: r.audio_url ?? undefined,
  };
}

/** Strip the flags off the bundled seed to use it as fallback content. */
function seedContent(): WordContent[] {
  return initialWords.map(({ mastered: _m, toughNut: _t, ...content }) => content as WordContent);
}

function readContentCache(): WordContent[] | null {
  try {
    const raw = localStorage.getItem(CONTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return (parsed as CachedWordContent[]).map((item) => {
      const { definition: _d, secondaryDefinition: _s, ...rest } = item;
      return { ...rest, definitions: normalizeDefinitions(item) };
    });
  } catch {
    return null;
  }
}

function writeContentCache(content: WordContent[]): void {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(content));
}

/** Combine content + progress into full Word objects (flags default to false). */
function merge(content: WordContent[], progress: ProgressMap): Word[] {
  return content.map((c) => {
    const p = progress[c.id];
    return {
      ...c,
      mastered: p?.mastered ?? false,
      toughNut: p?.toughNut ?? false,
      viewed: p?.viewed ?? false,
    };
  });
}

/**
 * Instant, synchronous read for first paint: cached content (or bundled seed)
 * merged with the cached progress for this user.
 */
export function loadWordsCached(userId: string): Word[] {
  const content = readContentCache() ?? seedContent();
  const progress = applyPendingToProgress(userId, readProgressCache(userId));
  return merge(content, progress);
}

/**
 * Refresh word content from Supabase, re-cache, and merge with local progress.
 * Throws on network errors so the caller can keep showing cached data.
 */
export async function pullWords(userId: string): Promise<Word[]> {
  // PostgREST caps a single response at 1000 rows, so page through the table
  // until we've pulled everything — otherwise only the first letters survive.
  const PAGE = 1000;
  const rows: WordRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .order('sort_order')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as WordRow[]));
    if (data.length < PAGE) break;
  }

  const content =
    rows.length > 0
      ? rows.map(rowToContent)
      : readContentCache() ?? seedContent();
  if (rows.length > 0) writeContentCache(content);

  const progress = applyPendingToProgress(userId, readProgressCache(userId));
  return merge(content, progress);
}
