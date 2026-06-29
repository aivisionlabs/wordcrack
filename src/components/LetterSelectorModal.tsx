import { X } from "lucide-react";
import { motion } from "motion/react";
import { Word } from "../types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function letterStats(words: Word[], letter: string) {
  const inLetter = words.filter((w) =>
    w.word.toUpperCase().startsWith(letter),
  );
  if (inLetter.length === 0) return { count: 0, mastered: 0, pct: 0 };
  const mastered = inLetter.filter((w) => w.mastered).length;
  return {
    count: inLetter.length,
    mastered,
    pct: Math.round((mastered / inLetter.length) * 100),
  };
}

interface LetterSelectorModalProps {
  show: boolean;
  onClose: () => void;
  selectedLetter: string;
  onSelectLetter: (letter: string) => void;
  words: Word[];
  /**
   * Disable tiles with no dictionary words (Browse), no mastered words
   * (Mastered), or never (the learning-path progress panel).
   */
  disableWhen?: "no-words" | "no-mastered" | "none";
  heading?: string;
  subheading?: string;
}

export default function LetterSelectorModal({
  show,
  onClose,
  selectedLetter,
  onSelectLetter,
  words,
  disableWhen = "no-words",
  heading = "Alphabet Navigation",
  subheading = "Select a letter to explore words",
}: LetterSelectorModalProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 bg-white/80 backdrop-blur-md flex flex-col"
    >
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Close letter selector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="text-center px-6">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-gray-400">
          {heading}
        </p>
        <h3 className="font-sans text-lg font-semibold text-text-primary mt-1">
          {subheading}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
          {ALPHABET.map((letter) => {
            const { count, mastered, pct } = letterStats(words, letter);
            const isSelected = selectedLetter === letter;
            const isEmpty =
              disableWhen === "none"
                ? false
                : disableWhen === "no-mastered"
                  ? mastered === 0
                  : count === 0;
            return (
              <button
                key={letter}
                type="button"
                disabled={isEmpty}
                onClick={() => {
                  onSelectLetter(letter);
                  onClose();
                }}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary text-white shadow-md"
                    : isEmpty
                      ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                      : "bg-white border border-gray-150 text-text-primary hover:border-primary hover:scale-[1.03]"
                }`}
              >
                <span className="font-serif text-2xl font-bold leading-none">
                  {letter}
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    isSelected ? "text-white/80" : "text-gray-400"
                  }`}
                >
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
