import { useEffect, useRef, useState } from "react";
import { Word } from "../types";
import {
  buildSectionsForLetter,
  findActiveUnitNumber,
  type Unit,
} from "../data/units";
import { DAILY_GOAL } from "../data/daily";
import { BookOpen, Check, Lock, Play, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import LetterSelectorModal from "./LetterSelectorModal";

interface LearningPathViewProps {
  words: Word[];
  activeLetter: string;
  dailyMastered: number;
  onSelectLetter: (letter: string) => void;
  onStartUnit: (letter: string, unitNumber: number) => void;
}

/** Horizontal offset (px) that gives the column its gentle serpentine sway. */
function nodeOffset(globalIndex: number): number {
  return Math.sin(globalIndex * 0.9) * 56;
}

export default function LearningPathView({
  words,
  activeLetter,
  dailyMastered,
  onSelectLetter,
  onStartUnit,
}: LearningPathViewProps) {
  const [showLetters, setShowLetters] = useState(false);
  const [lockedHint, setLockedHint] = useState<number | null>(null);
  const activeNodeRef = useRef<HTMLDivElement | null>(null);
  const hintTimer = useRef<number | null>(null);

  const sections = buildSectionsForLetter(words, activeLetter);
  const activeUnitNumber = findActiveUnitNumber(words, activeLetter);
  const totalUnits = sections.reduce((n, s) => n + s.units.length, 0);

  const activeSection = sections.find((s) =>
    s.units.some((u) => u.unitNumber === activeUnitNumber),
  );

  // Bring the active unit into view when the letter (or its active unit) changes.
  useEffect(() => {
    const node = activeNodeRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "auto" });
  }, [activeLetter, activeUnitNumber]);

  useEffect(
    () => () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
    },
    [],
  );

  const handleUnitClick = (unit: Unit) => {
    if (unit.status === "locked") {
      setLockedHint(unit.unitNumber);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setLockedHint(null), 1900);
      return;
    }
    onStartUnit(activeLetter, unit.unitNumber);
  };

  const masteredInLetter = sections.reduce(
    (n, s) => n + s.units.reduce((m, u) => m + u.masteredCount, 0),
    0,
  );
  const wordsInLetter = sections.reduce(
    (n, s) => n + s.units.reduce((m, u) => m + u.total, 0),
    0,
  );
  const goalReached = dailyMastered >= DAILY_GOAL;

  // Running index across every unit so the sway is continuous through sections.
  let globalIndex = -1;

  return (
    <div
      id="learning_path_tab"
      className="relative h-full flex flex-col bg-surface"
    >
      {/* ---------------------------------------------------- Consistent header */}
      <header className="shrink-0 z-20 bg-primary text-white px-4 h-14 flex items-center">
        <div className="px-2.5 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
          <span className="font-serif text-primary text-base font-black leading-none tracking-tight">
            InstaGRE
          </span>
        </div>
      </header>

      {/* ---------------------------------------------------- Scrollable path */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Current-letter badge + active section */}
        <div
          className="flex items-center gap-3 pl-7 pr-5 pt-5 pb-2"
          data-coach="path-letter"
        >
          <button
            type="button"
            onClick={() => setShowLetters(true)}
            className="relative w-12 h-12 rounded-full border-2 border-primary text-primary font-serif text-2xl font-bold flex items-center justify-center bg-white shadow-sm cursor-pointer shrink-0"
            title="Switch letter"
          >
            {activeLetter}
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-sm ring-2 ring-surface">
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
          </button>
          <div className="min-w-0">
            <span className="inline-block text-sm font-bold text-text-primary border border-gray-200 rounded-lg px-3 py-1 bg-white">
              {activeSection ? activeSection.title : `Section ${activeLetter}1`}
            </span>
            {wordsInLetter > 0 && (
              <p className="text-[11px] font-semibold text-text-secondary mt-1.5 pl-0.5">
                {masteredInLetter} / {wordsInLetter} words mastered ·{" "}
                {totalUnits} units
              </p>
            )}
          </div>
        </div>

        {totalUnits === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-8 py-20 text-gray-400 gap-2">
            <BookOpen className="w-12 h-12 stroke-1" />
            <p className="text-sm">No words for letter “{activeLetter}” yet.</p>
            <button
              type="button"
              onClick={() => setShowLetters(true)}
              className="text-primary font-bold text-sm hover:underline cursor-pointer mt-1"
            >
              Pick another letter
            </button>
          </div>
        ) : (
          <div className="pb-10 pt-2">
            {sections.map((section) => (
              <div key={section.id}>
                {/* Section divider */}
                <div className="flex items-center gap-3 px-6 py-4">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-text-secondary">
                    {section.title}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* The winding track of unit nodes */}
                <div className="relative">
                  {/* Centre track line behind the nodes */}
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-gray-200/70 rounded-full" />

                  <div className="relative flex flex-col items-center gap-6 py-3">
                    {section.units.map((unit) => {
                      globalIndex += 1;
                      const offset = nodeOffset(globalIndex);
                      const isActive = unit.status === "active";
                      const isCompleted = unit.status === "completed";
                      const isLocked = unit.status === "locked";
                      // Place the label opposite the sway direction so it never
                      // overlaps the centre track.
                      const labelLeft = offset <= 0;

                      return (
                        <div
                          key={unit.id}
                          ref={isActive ? activeNodeRef : undefined}
                          className="flex justify-center w-full"
                          style={{ transform: `translateX(${offset}px)` }}
                        >
                          {/* Node-sized wrapper so the label anchors to the
                              circle (left-full/right-full) instead of the row. */}
                          <div className="relative flex items-center justify-center w-[68px] h-[68px]">
                            {/* Pulsing halo for the active unit */}
                            {isActive && (
                              <motion.span
                                className="absolute w-[78px] h-[78px] rounded-full bg-primary/25"
                                animate={{
                                  scale: [1, 1.35, 1],
                                  opacity: [0.6, 0, 0.6],
                                }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            )}

                            <button
                              type="button"
                              data-coach={
                                isActive ? "path-active-unit" : undefined
                              }
                              onClick={() => handleUnitClick(unit)}
                              className={`relative w-[68px] h-[68px] rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer ${
                                isCompleted
                                  ? "bg-success-vibrant text-white shadow-[0_5px_0_#15803d]"
                                  : isActive
                                    ? "bg-primary text-white shadow-[0_5px_0_#1557b0] ring-4 ring-white"
                                    : "bg-gray-200 text-gray-400 shadow-[0_4px_0_#d1d5db]"
                              }`}
                              title={
                                isLocked
                                  ? `Locked — finish Unit ${unit.unitNumber - 1} first`
                                  : `Unit ${unit.unitNumber} · ${unit.percentage}%`
                              }
                            >
                              {isCompleted ? (
                                <Check className="w-7 h-7 stroke-[3]" />
                              ) : isActive ? (
                                unit.masteredCount > 0 ? (
                                  <BookOpen className="w-6 h-6" />
                                ) : (
                                  <Play className="w-7 h-7 fill-white" />
                                )
                              ) : (
                                <Lock className="w-6 h-6" />
                              )}
                            </button>

                            {/* Unit label beside the node */}
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 w-24 pointer-events-none ${
                                labelLeft
                                  ? "left-full ml-3 text-left"
                                  : "right-full mr-3 text-right"
                              }`}
                            >
                              <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-secondary leading-none">
                                Unit {unit.unitNumber}
                              </p>
                              <p
                                className={`text-lg font-bold leading-tight ${
                                  isLocked
                                    ? "text-gray-400"
                                    : "text-text-primary"
                                }`}
                              >
                                {unit.percentage}%
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Locked-unit hint toast */}
      <AnimatePresence>
        {lockedHint !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 bg-text-primary text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" />
            Finish Unit {lockedHint - 1} to unlock this
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress-by-letter panel (doubles as the letter switcher) */}
      <AnimatePresence>
        {showLetters && (
          <LetterSelectorModal
            show={showLetters}
            onClose={() => setShowLetters(false)}
            selectedLetter={activeLetter}
            onSelectLetter={(letter) => {
              onSelectLetter(letter);
              setShowLetters(false);
            }}
            words={words}
            disableWhen="none"
            heading="Your Progress"
            subheading="Mastery for each letter"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
