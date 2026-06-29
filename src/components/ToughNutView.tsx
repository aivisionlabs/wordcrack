import { useState, useEffect, useRef, type PointerEvent } from "react";
import { Word, WordFlags } from "../types";
import { speakWord } from "../utils/speech";
import {
  Volume2,
  CheckCircle,
  ChevronUp,
  BookOpen,
  Smile,
  Brain,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  CoachMarkSpotlight,
  hasSeenCoachMark,
  markCoachMarkSeen,
} from "./CoachMarks";
import {
  DefinitionsHeading,
  DefinitionsList,
  WordEtymology,
} from "./DefinitionsList";
import { formatDefinitions } from "../utils/wordContent";

interface ToughNutViewProps {
  words: Word[];
  onSetFlags: (wordId: string, flags: Partial<WordFlags>) => void;
}

/** Bold every occurrence of the headword (and inflections) inside a sentence. */
function highlightWord(sentence: string, target: string) {
  const regex = new RegExp(`(${target}\\w*)`, "gi");
  return sentence.split(regex).map((part, i) =>
    regex.test(part) ? (
      <span key={i} className="font-bold text-text-primary">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function ToughNutView({ words, onSetFlags }: ToughNutViewProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"up" | "down">("up");
  const [showDrillCoachMark, setShowDrillCoachMark] = useState(false);
  const drillCoachInitRef = useRef(false);

  // Same back-face gesture disambiguation as BrowseView: tell a navigation
  // flick apart from a content scroll inside the flipped card.
  const backGesture = useRef<{
    y: number;
    scrollTop: number;
    time: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const toughWords = words
    .filter((w) => w.toughNut)
    .sort((a, b) => a.word.localeCompare(b.word));

  const total = toughWords.length;

  // When a word drops out of the list (un-flagged) the list shrinks; clamp the
  // focus so it never points past the end and the next word slides in.
  useEffect(() => {
    if (total > 0 && focusIndex >= total) setFocusIndex(total - 1);
  }, [total, focusIndex]);

  useEffect(() => {
    if (
      total === 0 ||
      hasSeenCoachMark("tough-nut-drill") ||
      drillCoachInitRef.current
    )
      return;
    drillCoachInitRef.current = true;
    const timer = window.setTimeout(() => setShowDrillCoachMark(true), 500);
    return () => window.clearTimeout(timer);
  }, [total]);

  const dismissDrillCoachMark = () => {
    markCoachMarkSeen("tough-nut-drill");
    setShowDrillCoachMark(false);
  };

  const current = toughWords[focusIndex];

  const goTo = (dir: "up" | "down") => {
    if (total === 0) return;
    if (showDrillCoachMark) dismissDrillCoachMark();
    setSwipeDir(dir);
    setIsFlipped(false);
    setFocusIndex((prev) =>
      dir === "up" ? (prev + 1) % total : (prev - 1 + total) % total,
    );
  };

  // Explicitly retiring a word from the Tough Nut list removes the flag, so the
  // word leaves the stack and the next one slides into the current index.
  const markNotTough = (word: Word) => {
    if (showDrillCoachMark) dismissDrillCoachMark();
    setSwipeDir("up");
    setIsFlipped(false);
    onSetFlags(word.id, { toughNut: false });
  };

  // Mastered is independent — toggling it keeps the word here (it can be both).
  const toggleMastered = (word: Word) =>
    onSetFlags(word.id, { mastered: !word.mastered });

  const getBackScroller = (root: HTMLElement) =>
    root.querySelector<HTMLElement>("[data-back-scroll]");

  const handleBackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const scroller = getBackScroller(e.currentTarget);
    backGesture.current = {
      y: e.clientY,
      scrollTop: scroller?.scrollTop ?? 0,
      time: e.timeStamp,
    };
    suppressClick.current = false;
  };

  const handleBackPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = backGesture.current;
    backGesture.current = null;
    if (!g) return;

    const scroller = getBackScroller(e.currentTarget);
    const scrolled = Math.abs((scroller?.scrollTop ?? 0) - g.scrollTop) > 4;
    const dy = g.y - e.clientY; // positive => moved up
    const dt = e.timeStamp - g.time;
    const velocity = dt > 0 ? dy / dt : 0;
    const isFlick = Math.abs(velocity) > 0.4 || Math.abs(dy) > 70;

    if (!scrolled && isFlick) {
      suppressClick.current = true;
      goTo(dy > 0 ? "up" : "down");
    }
  };

  const handleBackClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setIsFlipped(false);
  };

  return (
    <div
      id="tough_nut_tab"
      className="relative flex flex-col bg-white h-full"
    >
      {/* Header — same style as Mastered */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="px-2.5 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <span className="font-serif text-white text-base font-black leading-none tracking-tight">
              InstaGRE
            </span>
          </div>

          <div className="text-sm font-bold text-text-primary">
            {total === 0 ? "No Tough Nuts" : `${total} Tough Nut${total !== 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- Card stage */}
      {total === 0 || !current ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-400 gap-2">
          <Smile className="w-12 h-12 stroke-1 text-gray-300" />
          <p className="text-sm font-bold text-gray-700">No Tough Nuts left!</p>
          <p className="text-xs text-gray-500 max-w-xs">
            Flag tricky words in Browse using{" "}
            <Brain className="w-3 h-3 inline-block" /> and they'll show up here
            for focused drilling.
          </p>
        </div>
      ) : (
        <div
          data-coach="tough-nut-drill"
          className="flex-1 relative [perspective:1600px] overflow-hidden"
        >
          <AnimatePresence mode="wait" custom={swipeDir}>
            <motion.div
              key={current.id}
              custom={swipeDir}
              initial={{ opacity: 0, y: swipeDir === "up" ? 120 : -120 }}
              animate={{ opacity: 1, y: 0, rotateY: isFlipped ? 180 : 0 }}
              exit={{
                opacity: 0,
                y: swipeDir === "up" ? -120 : 120,
                rotateY: 0,
                transition: {
                  y: { type: "spring", damping: 26, stiffness: 170 },
                  opacity: { duration: 0.2 },
                  rotateY: { duration: 0 },
                },
              }}
              transition={{ type: "spring", damping: 26, stiffness: 170 }}
              drag={isFlipped ? false : "y"}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                const isSwipeGesture = Math.abs(info.velocity.y) > 300;
                const isLargeDrag = Math.abs(info.offset.y) > 100;
                if (isSwipeGesture || isLargeDrag) {
                  if (info.offset.y < 0 || info.velocity.y < 0) goTo("up");
                  else goTo("down");
                }
              }}
              className="absolute inset-0 [transform-style:preserve-3d]"
            >
              {/* ============================== FRONT FACE */}
              <div
                onClick={() => setIsFlipped(true)}
                className={`absolute inset-0 [backface-visibility:hidden] bg-white flex flex-col px-7 pt-6 pb-5 cursor-pointer ${
                  isFlipped ? "pointer-events-none" : ""
                }`}
              >
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <span className="text-[8px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border bg-warning-soft text-warning-vibrant border-warning-vibrant/20 inline-flex items-center gap-1">
                      Tough Nut <Brain className="w-3 h-3" />
                    </span>
                    {current.mastered && (
                      <span className="text-[8px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border bg-success-soft text-success-vibrant border-success-vibrant/20">
                        Mastered ✓
                      </span>
                    )}
                  </div>

                  <h2 className="font-serif text-[52px] leading-[1.05] font-black text-text-primary tracking-tight select-none">
                    {current.word}
                  </h2>

                  <div className="flex items-center gap-3">
                    <span className="text-base text-gray-400 italic font-sans">
                      {current.ipa}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(current.word);
                      }}
                      className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
                      title="Hear pronunciation"
                    >
                      <Volume2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  <span className="text-[11px] font-bold tracking-widest uppercase text-gray-500 border border-gray-200 rounded-full px-3.5 py-1">
                    {current.partOfSpeech}
                  </span>

                  <p className="text-sm text-gray-600 line-clamp-2 max-w-[300px] mt-2 font-medium">
                    {formatDefinitions(current.definitions)}
                  </p>
                </div>

                {/* Floating status actions */}
                <div className="absolute right-5 bottom-10 flex flex-col items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMastered(current);
                    }}
                    className={`w-11 h-11 rounded-full border-2 shadow-md flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
                      current.mastered
                        ? "bg-success-vibrant/90 border-success-vibrant text-white"
                        : "bg-white/70 border-success-vibrant/70 text-success-vibrant hover:bg-success-vibrant hover:text-white"
                    }`}
                    title={
                      current.mastered ? "Unmark Mastered" : "Mark as Mastered"
                    }
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotTough(current);
                      }}
                      className="w-11 h-11 rounded-full border-2 border-warning-vibrant bg-warning-vibrant/90 text-white shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:bg-warning-vibrant"
                      title="Mark as Not Tough"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] font-bold tracking-wider uppercase text-gray-400 leading-none text-center">
                      Not
                      <br />
                      Tough
                    </span>
                  </div>
                </div>

                {/* Swipe hint */}
                <div className="flex flex-col items-center gap-0.5 select-none pointer-events-none">
                  <span className="text-[9px] text-gray-400">
                    Word {focusIndex + 1} of {total}
                  </span>
                  <ChevronUp className="w-3 h-3 text-gray-200" />
                </div>
              </div>

              {/* ============================== BACK FACE */}
              <div
                onClick={handleBackClick}
                onPointerDown={handleBackPointerDown}
                onPointerUp={handleBackPointerUp}
                onPointerCancel={() => {
                  backGesture.current = null;
                }}
                className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-white flex flex-col cursor-pointer [touch-action:pan-y] ${
                  isFlipped ? "" : "pointer-events-none"
                }`}
              >
                {/* Header */}
                <div className="bg-warning-vibrant text-white px-7 pt-7 pb-6 shrink-0 relative overflow-hidden">
                  <BookOpen className="absolute -right-2 -bottom-3 w-28 h-28 text-white/5 -rotate-12 pointer-events-none" />
                  <div className="flex items-start justify-between relative z-10">
                    <div className="space-y-2">
                      <span className="inline-block text-[10px] font-extrabold uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full">
                        {current.partOfSpeech}
                      </span>
                      <h3 className="font-serif text-[40px] leading-none font-black">
                        {current.word}
                      </h3>
                      <p className="text-sm text-white/80 italic font-sans">
                        {current.ipa}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(current.word);
                      }}
                      className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Hear pronunciation"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable detail body */}
                <div
                  data-back-scroll
                  className="flex-1 overflow-y-auto px-7 py-5 space-y-5"
                >
                  <section className="space-y-2">
                    <DefinitionsHeading count={current.definitions.length} />
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {formatDefinitions(current.definitions)}
                    </p>
                  </section>

                  <WordEtymology etymology={current.etymology} />

                  {current.examples.length > 0 && (
                    <section className="space-y-2">
                      <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-text-secondary">
                        Example Sentences
                      </h5>
                      <div className="space-y-2">
                        {current.examples.map((ex, i) => (
                          <p
                            key={i}
                            className="text-sm italic text-text-secondary leading-relaxed bg-gray-50 border-l-2 border-warning-vibrant rounded-r-lg pl-3 pr-3 py-2.5"
                          >
                            “{highlightWord(ex, current.word)}”
                          </p>
                        ))}
                      </div>
                    </section>
                  )}

                  <div className="grid grid-cols-2 gap-5">
                    <section className="space-y-2">
                      <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-text-secondary">
                        Synonyms
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {current.synonyms.map((s) => (
                          <span
                            key={s}
                            className="bg-gray-100 text-text-secondary text-xs font-medium px-2.5 py-1 rounded-md uppercase tracking-wide"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </section>
                    <section className="space-y-2">
                      <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-text-secondary">
                        Antonyms
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {current.antonyms.map((a) => (
                          <span
                            key={a}
                            className="bg-gray-100 text-text-secondary text-xs font-medium px-2.5 py-1 rounded-md uppercase tracking-wide"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>

                {/* Floating status actions (mirrors the front face) */}
                <div
                  className="absolute right-5 bottom-10 z-20 flex flex-col items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMastered(current);
                    }}
                    className={`w-11 h-11 rounded-full border-2 shadow-md flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
                      current.mastered
                        ? "bg-success-vibrant/90 border-success-vibrant text-white"
                        : "bg-white/70 border-success-vibrant/70 text-success-vibrant hover:bg-success-vibrant hover:text-white"
                    }`}
                    title={
                      current.mastered ? "Unmark Mastered" : "Mark as Mastered"
                    }
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotTough(current);
                      }}
                      className="w-11 h-11 rounded-full border-2 border-warning-vibrant bg-warning-vibrant/90 text-white shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:bg-warning-vibrant"
                      title="Mark as Not Tough"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] font-bold tracking-wider uppercase text-gray-400 leading-none text-center">
                      Not
                      <br />
                      Tough
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {showDrillCoachMark && (
        <CoachMarkSpotlight
          target="[data-coach='tough-nut-drill']"
          title={`Tough Nuts (${total})`}
          body="Swipe to drill. A word only leaves this list when you explicitly mark it Not Tough."
          placement="bottom"
          icon={<Brain className="w-5 h-5" />}
          onDismiss={dismissDrillCoachMark}
        />
      )}
    </div>
  );
}
