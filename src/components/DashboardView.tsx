import { type ReactNode } from 'react';
import { Word } from '../types';
import { Award, Zap, ChevronRight, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardViewProps {
  words: Word[];
  streak: number;
  continueLetter: string | null;
  onLetterSelect: (letter: string) => void;
}

export default function DashboardView({ words, streak, continueLetter, onLetterSelect }: DashboardViewProps) {
  // Compute overall stats
  const totalWords = words.length;
  const masteredCount = words.filter(w => w.mastered).length;
  const remainingCount = totalWords - masteredCount;
  const overallPercentage = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

  // Let's build alphabet listing. We display A to H physically as detailed in the dashboard.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  // Group letters
  const getLetterStats = (letter: string) => {
    const letterWords = words.filter(w => w.word.toUpperCase().startsWith(letter));
    const total = letterWords.length;
    if (total === 0) return { total: 0, mastered: 0, percentage: 0 };
    
    const mastered = letterWords.filter(w => w.mastered).length;
    const percentage = Math.round((mastered / total) * 100);
    return { total, mastered, percentage };
  };

  const renderProgressRing = (percentage: number) => {
    const circumference = 2 * Math.PI * 13;
    const offset = circumference - (percentage / 100) * circumference;
    let progressColor = 'text-primary';
    let bgRingColor = 'text-gray-200';
    if (percentage > 50) {
      progressColor = 'text-primary';
    } else if (percentage > 0) {
      progressColor = 'text-warning-vibrant';
      bgRingColor = 'text-[#fff3e0]';
    }

    return (
      <div className="relative w-8 h-8 mt-1 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="16" cy="16" r="13"
            className={bgRingColor}
            stroke="currentColor"
            strokeWidth="2.5"
            fill="transparent"
          />
          <circle
            cx="16" cy="16" r="13"
            className={progressColor}
            stroke="currentColor"
            strokeWidth="2.5"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-[8px] font-extrabold text-gray-700 select-none">
          {percentage}%
        </span>
      </div>
    );
  };

  const renderTileFooter = (percentage: number, isContinue: boolean, fallback: ReactNode) => {
    if (isContinue) {
      return (
        <>
          {renderProgressRing(percentage)}
          <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wide text-primary">
            Continue
          </span>
        </>
      );
    }
    return fallback;
  };

  return (
    <div id="dashboard_tab" className="relative h-full flex flex-col bg-white">
      {/* Header — consistent with other views */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="px-2.5 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <span className="font-serif text-white text-base font-black leading-none tracking-tight">
              InstaGRE
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-6 px-5">
      {/* Overall Mastery Card Banner */}
      <section className="bg-primary-container text-white p-6 rounded-2xl shadow-md relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] opacity-10">
          <Award className="w-40 h-40" />
        </div>
        
        <div className="relative z-10 space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[#b3cdff] text-[11px] font-bold tracking-wider uppercase">
                Overall Mastery
              </p>
              <h2 className="font-serif text-[48px] leading-none mt-1">
                {overallPercentage}%
              </h2>
            </div>
            <div className="text-right">
              <span className="bg-success-vibrant text-white text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                ON TRACK
              </span>
              <p className="text-[12px] text-[#b3cdff] font-medium mt-1.5 flex items-center gap-1 justify-end">
                <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Day {streak} Streak
              </p>
            </div>
          </div>

          {/* Progress bar container */}
          <div className="h-3.5 bg-white/10 rounded-full overflow-hidden p-[2px] border border-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallPercentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-white rounded-full bg-gradient-to-r from-white to-[#d6e3ff] shadow-[0_0_8px_rgba(255,255,255,0.4)]"
            />
          </div>

          {/* Specific counts details */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="bg-white/10 p-3 rounded-xl border border-white/5 backdrop-blur-xs">
              <p className="text-[#b3cdff] text-[11px] font-bold tracking-wider uppercase">MASTERED</p>
              <p className="text-[22px] font-serif font-bold leading-tight mt-1">{masteredCount}</p>
            </div>
            <div className="bg-white/10 p-3 rounded-xl border border-white/5 backdrop-blur-xs">
              <p className="text-[#b3cdff] text-[11px] font-bold tracking-wider uppercase">REMAINING</p>
              <p className="text-[22px] font-serif font-bold leading-tight mt-1">{remainingCount}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Alphabet Grid Card */}
      <section className="space-y-4" id="alphabet_section" data-coach="home-alphabet">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-primary">Alphabet Mastery</h3>
          <button 
            onClick={() => onLetterSelect('A')}
            className="text-primary hover:text-primary-container text-xs font-bold tracking-wide uppercase flex items-center gap-0.5 cursor-pointer hover:underline"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Column Grid */}
        <div className="grid grid-cols-4 gap-2.5">
          {alphabet.map((letter) => {
            const stats = getLetterStats(letter);
            const isMastered = stats.total > 0 && stats.percentage === 100;
            const isContinue = continueLetter === letter;

            if (isMastered) {
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => onLetterSelect(letter)}
                  className={`bg-success-soft hover:bg-[#cbf4da] text-success-vibrant border-b-3 border-[#16a34a]/30 rounded-2xl flex flex-col items-center justify-center aspect-square p-2 cursor-pointer transition-all hover:scale-[1.03] duration-150 shadow-xs ${
                    isContinue ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                >
                  <span className="font-serif text-2xl font-bold">{letter}</span>
                  {renderTileFooter(
                    stats.percentage,
                    isContinue,
                    <div className="mt-1.5 text-success-vibrant flex gap-0.5 active:scale-90 duration-100">
                      <Check className="w-5 h-5 stroke-[3px]" />
                    </div>,
                  )}
                </button>
              );
            }

            // Normal Progress Tile
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onLetterSelect(letter)}
                className={`bg-white hover:bg-primary/[0.03] text-[#111827] border border-gray-200/80 border-b-3 border-gray-300 rounded-2xl flex flex-col items-center justify-center aspect-square p-2 cursor-pointer transition-all hover:scale-[1.03] duration-150 active:scale-95 shadow-xs ${
                  isContinue ? 'ring-2 ring-primary ring-offset-2 border-primary/40' : ''
                }`}
              >
                <span className="font-serif text-2xl font-bold">{letter}</span>
                {renderTileFooter(stats.percentage, isContinue, renderProgressRing(stats.percentage))}
              </button>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
}
