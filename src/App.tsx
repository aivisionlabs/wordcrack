import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Word, WordFlags, UserProfile } from "./types";
import { loadWordsCached, pullWords } from "./data/version";
import {
  getSession,
  onAuthStateChange,
  signUpWithMobileDob,
  signInWithMobileDob,
  signOut,
  updateProfile,
  touchStreak,
} from "./data/auth";
import { setProgressFlags, markWordViewed, initSync, teardownSync } from "./data/sync";
import { getDailyMastered, recordMasteredDelta } from "./data/daily";
import { logger } from "./utils/logger";
import { formatDefinitions, wordMatchesDefinition } from "./utils/wordContent";
import {
  DefinitionsHeading,
  DefinitionsList,
  WordEtymology,
} from "./components/DefinitionsList";
import {
  getContinueState,
  resolveContinueTarget,
  setContinueState,
  type ContinueState,
} from "./data/continue";
import SplashView from "./components/SplashView";
import SignupView from "./components/SignupView";
import SignInView from "./components/SignInView";
import LoadingView from "./components/LoadingView";
import DashboardView from "./components/DashboardView";
import LearningPathView from "./components/LearningPathView";
import BrowseView from "./components/BrowseView";
import MasteredView from "./components/MasteredView";
import ToughNutView from "./components/ToughNutView";
import ProfileView from "./components/ProfileView";
import {
  CoachMarkSpotlight,
  hasSeenCoachMark,
  markCoachMarkSeen,
  type CoachMarkStep,
} from "./components/CoachMarks";
// import TestsView from './components/TestsView'; // Tests temporarily disabled

import {
  Home,
  BookOpen,
  CheckCircle,
  Brain,
  User,
  Search,
  X,
  Volume2,
  ChevronRight,
} from "lucide-react";
import { speakWord } from "./utils/speech";
import { isWordUnseen } from "./utils/wordStatus";

type AppView = "loading" | "splash" | "signup" | "signin" | "app";
type Tab = "Home" | "Browse" | "Mastered" | "Tough Nut" | "Profile";

type AuthErrorLike = { message?: string };

/** Map an auth error to a friendly, user-facing message. */
function authErrorMessage(e: unknown, ctx: "signup" | "signin"): string {
  const msg = (e as AuthErrorLike | null)?.message ?? "";
  const lower = msg.toLowerCase();
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("offline")
  ) {
    return "You appear to be offline. Connect to the internet to continue.";
  }
  if (msg) return msg;
  return ctx === "signup"
    ? "Could not create your account. Please try again."
    : "Could not sign you in. Please try again.";
}

export default function App() {
  const [view, setView] = useState<AppView>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  const [words, setWords] = useState<Word[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [selectedLetter, setSelectedLetter] = useState<string>("A");
  // Letter shown on the learning path (defaults to the continue letter, but the
  // user can switch it from the progress panel without leaving Home).
  const [pathLetter, setPathLetter] = useState<string>("A");
  const [dailyMastered, setDailyMastered] = useState(0);
  // When set, Browse is scoped to a single unit of `letter` instead of the
  // whole letter (set by tapping a unit on the learning path).
  const [browseScope, setBrowseScope] = useState<{
    letter: string;
    unitNumber: number;
  } | null>(null);
  const [activeCoachMark, setActiveCoachMark] = useState<CoachMarkStep | null>(
    null,
  );
  const [continueTarget, setContinueTarget] = useState<ContinueState | null>(
    null,
  );
  const wordsRef = useRef<Word[]>([]);
  const lastSavedContinueRef = useRef<ContinueState | null>(null);
  const browseCurrentWordIdRef = useRef<string | null>(null);
  const prevTabRef = useRef<Tab>("Home");

  // Search
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWordForModal, setSelectedWordForModal] = useState<Word | null>(
    null,
  );

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  /**
   * Land a user in the app: paint instantly from cache, then refresh from
   * Supabase in the background. `p` is the freshly-fetched profile (or null when
   * we're restoring offline and fall back to the cached profile).
   */
  const enterApp = async (uid: string, p: UserProfile | null) => {
    logger.info("app:boot", "entering app", { userId: uid });

    const cacheKey = `instagre_profile_${uid}`;
    let prof = p;
    if (!prof) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          prof = JSON.parse(raw) as UserProfile;
          logger.debug("app:boot", "restored cached profile");
        }
      } catch {
        logger.warn("app:boot", "corrupt cached profile");
      }
    }
    if (prof) localStorage.setItem(cacheKey, JSON.stringify(prof));

    const cachedWords = loadWordsCached(uid);
    logger.debug("app:boot", "loaded cached words", { count: cachedWords.length });

    const initialContinue = resolveContinueTarget(
      cachedWords,
      getContinueState(uid),
    );
    lastSavedContinueRef.current = initialContinue;

    setUserId(uid);
    setProfile(prof);
    setWords(cachedWords); // instant paint from cache / seed
    setSelectedLetter(initialContinue?.letter ?? "A");
    setPathLetter(initialContinue?.letter ?? "A");
    setBrowseScope(null);
    setDailyMastered(getDailyMastered(uid));
    setContinueTarget(initialContinue);
    setActiveTab("Home");
    setView("app");
    initSync(uid);

    logger.info("app:boot", "app shell rendered", { userId: uid });

    setStreak(touchStreak(uid));
    void pullWords(uid)
      .then((freshWords) => {
        logger.info("app:boot", "refreshed words from server", {
          userId: uid,
          count: freshWords.length,
        });
        setWords(freshWords);
      })
      .catch((e) => {
        logger.warn("app:boot", "failed to refresh words from server", {
          userId: uid,
          error: (e as Error).message,
        });
      });
  };

  // Boot: restore local session if one exists, else show splash/signup.
  useEffect(() => {
    logger.info("app:boot", "app booting up");

    const session = getSession();
    if (session) {
      logger.info("app:boot", "found existing session, entering app");
      void enterApp(session.userId, session.profile);
    } else {
      const started = localStorage.getItem("instagre_has_started") === "true";
      const nextView = started ? "signup" : "splash";
      logger.info("app:boot", "no session found, showing initial view", {
        view: nextView,
      });
      setView(nextView);
    }

    const unsub = onAuthStateChange((s) => {
      if (!s) {
        logger.info("app:auth", "session cleared in another tab, signing out");
        teardownSync();
        setUserId(null);
        setProfile(null);
        setWords([]);
        setView("signin");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissCoachMark = (step: CoachMarkStep) => {
    markCoachMarkSeen(step);
    setActiveCoachMark(null);
  };

  // Home coachmark: first time the user lands on the dashboard.
  useEffect(() => {
    if (view !== "app" || activeTab !== "Home") return;
    if (hasSeenCoachMark("home")) return;
    const timer = window.setTimeout(() => {
      setActiveCoachMark((prev) => (prev === "home" ? prev : "home"));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [view, activeTab]);

  useEffect(() => {
    if (activeCoachMark === "home" && activeTab !== "Home") {
      setActiveCoachMark(null);
    }
  }, [activeTab, activeCoachMark]);

  const handleGetStarted = () => {
    localStorage.setItem("instagre_has_started", "true");
    setView("signup");
  };

  // Async auth handlers — they throw friendly errors that the views display.
  const handleSignup = async (p: UserProfile) => {
    try {
      logger.info("app:handler", "signup handler called");
      const { userId: uid, profile: prof } = await signUpWithMobileDob(p);
      logger.info("app:handler", "signup auth succeeded, entering app");
      await enterApp(uid, prof);
    } catch (e) {
      const errorMsg = authErrorMessage(e, "signup");
      logger.error("app:handler", "signup handler error", {
        error: (e as Error).message,
        userMessage: errorMsg,
      });
      throw new Error(errorMsg);
    }
  };

  const handleSignIn = async (mobile: string, dob: string) => {
    try {
      logger.info("app:handler", "signin handler called");
      const { userId: uid, profile: prof } = await signInWithMobileDob(
        mobile,
        dob,
      );
      logger.info("app:handler", "signin auth succeeded, entering app");
      await enterApp(uid, prof);
    } catch (e) {
      const errorMsg = authErrorMessage(e, "signin");
      logger.error("app:handler", "signin handler error", {
        error: (e as Error).message,
        userMessage: errorMsg,
      });
      throw new Error(errorMsg);
    }
  };

  const handleLogout = () => {
    logger.info("app:handler", "logout handler called", { userId });
    teardownSync();
    signOut();
    setUserId(null);
    setProfile(null);
    setWords([]);
    setView("signin");
    logger.info("app:handler", "logout completed");
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    if (!userId) {
      logger.warn("app:handler", "update profile called without userId");
      return;
    }
    logger.info("app:handler", "profile update initiated", {
      userId,
      fullName: updated.fullName,
    });
    setProfile(updated);
    localStorage.setItem(`instagre_profile_${userId}`, JSON.stringify(updated));
    void updateProfile(userId, updated)
      .then((newProf) => {
        setProfile(newProf);
        logger.info("app:handler", "profile updated successfully", { userId });
      })
      .catch((e) => {
        logger.error("app:handler", "profile update failed", {
          userId,
          error: (e as Error)?.message ?? e,
        });
      });
  };

  // Toggle one or both learning flags for a word (they're independent).
  // Optimistic: update UI immediately, then cache + enqueue the remote sync.
  const handleSetFlags = (wordId: string, flags: Partial<WordFlags>) => {
    const prev = words.find((w) => w.id === wordId);
    const updated = words.map((w) =>
      w.id === wordId ? { ...w, ...flags } : w,
    );
    setWords(updated);
    if (userId) {
      const w = updated.find((x) => x.id === wordId);
      if (w)
        setProgressFlags(userId, wordId, {
          mastered: w.mastered,
          toughNut: w.toughNut,
        });

      // Keep today's mastered count in sync on each mastered on/off transition.
      if (flags.mastered === true && !prev?.mastered) {
        setDailyMastered(recordMasteredDelta(userId, 1));
      } else if (flags.mastered === false && prev?.mastered) {
        setDailyMastered(recordMasteredDelta(userId, -1));
      }
    }

    // Contextual coachmarks after the user's first mastered / tough-nut mark.
    if (
      flags.mastered === true &&
      !prev?.mastered &&
      !hasSeenCoachMark("mastered-tab")
    ) {
      window.setTimeout(() => setActiveCoachMark("mastered-tab"), 780);
    }
    if (
      flags.toughNut === true &&
      !prev?.toughNut &&
      !hasSeenCoachMark("tough-tab")
    ) {
      window.setTimeout(() => setActiveCoachMark("tough-tab"), 780);
    }
  };

  const handleMarkViewed = useCallback(
    (wordId: string) => {
      setWords((prev) => {
        const word = prev.find((w) => w.id === wordId);
        if (!word || word.viewed) return prev;
        if (userId) markWordViewed(userId, wordId);
        return prev.map((w) =>
          w.id === wordId ? { ...w, viewed: true } : w,
        );
      });
    },
    [userId],
  );

  const handleBrowseCurrentWordChange = useCallback((wordId: string | null) => {
    browseCurrentWordIdRef.current = wordId;
  }, []);

  // Mark the visible browse card when leaving the tab (not on landing — that
  // would hide the Unseen pill before the user can see it).
  useEffect(() => {
    const prev = prevTabRef.current;
    if (prev === "Browse" && activeTab !== "Browse") {
      const wordId = browseCurrentWordIdRef.current;
      if (wordId) handleMarkViewed(wordId);
    }
    prevTabRef.current = activeTab;
  }, [activeTab, handleMarkViewed]);

  const selectLetter = (letter: string) => {
    setSelectedLetter(letter);
    setBrowseScope(null); // changing letters always drops any unit scope
  };

  // Tapping a unit on the learning path opens Browse scoped to that unit's
  // words. setSelectedLetter directly (not selectLetter) so the scope survives.
  const navigateToUnit = (letter: string, unitNumber: number) => {
    setSelectedLetter(letter);
    setBrowseScope({ letter, unitNumber });
    setActiveTab("Browse");
  };

  const handlePathSelectLetter = (letter: string) => {
    setPathLetter(letter);
  };

  useEffect(() => {
    if (!userId) {
      setContinueTarget(null);
      return;
    }
    const next = resolveContinueTarget(words, getContinueState(userId));
    setContinueTarget((prev) =>
      prev?.letter === next?.letter && prev?.wordId === next?.wordId ? prev : next,
    );
  }, [userId, words]);

  const handleSaveContinuePosition = useCallback(
    (letter: string, wordId: string) => {
      if (!userId) return;
      const saved = { letter, wordId };

      const lastSaved = lastSavedContinueRef.current;
      const isSameSavedPosition =
        lastSaved?.letter === saved.letter && lastSaved?.wordId === saved.wordId;
      if (!isSameSavedPosition) {
        setContinueState(userId, saved);
        lastSavedContinueRef.current = saved;
      }

      const next = resolveContinueTarget(wordsRef.current, saved);
      setContinueTarget((prev) =>
        prev?.letter === next?.letter && prev?.wordId === next?.wordId ? prev : next,
      );
    },
    [userId],
  );

  // Snapshot resume position when entering a letter — not live-linked to
  // continueTarget, or saving the current card re-triggers restore in a loop.
  const browseResumeWordId = useMemo(() => {
    if (!userId) return null;
    const state = getContinueState(userId);
    if (state?.letter === selectedLetter) return state.wordId;
    return null;
  }, [userId, selectedLetter]);

  const navigateToLetterBrowse = (letter: string) => {
    selectLetter(letter);
    setActiveTab("Browse");
  };

  // Search matches
  const matchedWords =
    searchQuery.trim() === ""
      ? []
      : words.filter(
          (w) =>
            w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
            wordMatchesDefinition(w, searchQuery),
        );

  const masteredTotalCount = words.filter((w) => w.mastered).length;

  // First-time users (no word seen or mastered yet) get the alphabet Dashboard.
  // Once they've started learning any letter, Home becomes the unit path.
  const hasStartedLearning = words.some((w) => w.viewed || w.mastered);

  // -------------------------------------------------- Pre-app screens
  if (view === "loading") return <LoadingView />;
  if (view === "splash")
    return (
      <SplashView
        onGetStarted={handleGetStarted}
        onLogIn={() => {
          localStorage.setItem("instagre_has_started", "true");
          setView("signin");
        }}
      />
    );
  if (view === "signup")
    return (
      <SignupView
        onSignup={handleSignup}
        onGoToSignIn={() => setView("signin")}
        onBack={() => setView("splash")}
      />
    );
  if (view === "signin")
    return (
      <SignInView
        onSignIn={handleSignIn}
        onGoToSignUp={() => setView("signup")}
        onBack={() => setView("splash")}
      />
    );

  // -------------------------------------------------- Main app shell
  const immersive =
    activeTab === "Home" ||
    activeTab === "Browse" ||
    activeTab === "Mastered" ||
    activeTab === "Tough Nut" ||
    activeTab === "Profile";
  const initial = (profile?.fullName?.trim()?.[0] ?? "I").toUpperCase();

  return (
    <div className="bg-[#f3f4f6] min-h-screen text-text-primary font-sans antialiased selection:bg-primary selection:text-white">
      {/* Top App Bar (hidden on the immersive Browse tab) */}
      {!immersive && (
        <header className="fixed top-0 w-full max-w-[600px] h-14 z-50 bg-primary text-white shadow-sm flex items-center justify-between px-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center select-none">
            <div className="px-2.5 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
              <span className="font-serif text-white text-base font-black leading-none tracking-tight">
                InstaGRE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isSearchActive ? (
              <div className="flex items-center bg-white/10 rounded-lg px-2 py-1 max-w-[180px] shrink-0 border border-white/15">
                <input
                  type="text"
                  placeholder="Search vocabulary..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-white outline-hidden placeholder-white/50 w-full"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setIsSearchActive(false);
                    setSearchQuery("");
                  }}
                  className="text-white/60 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchActive(true)}
                className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10"
                title="Search words"
              >
                <Search className="w-4.5 h-4.5" />
              </button>
            )}

            <button
              onClick={() => setActiveTab("Profile")}
              className="w-8 h-8 rounded-full bg-white/15 border border-white/25 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-white/25 transition-colors"
              title="Profile"
            >
              {initial}
            </button>
          </div>
        </header>
      )}

      {/* Main container */}
      <div
        data-app-shell
        className={`max-w-[600px] mx-auto bg-surface flex flex-col pb-16 border-x border-gray-150 relative ${
          immersive ? "h-screen pt-0" : "min-h-screen pt-14"
        }`}
      >
        {/* Search results overlay */}
        {!immersive && isSearchActive && searchQuery.trim() !== "" && (
          <div className="bg-white p-4 absolute top-14 left-0 right-0 z-40 border-b border-gray-200 shadow-xl max-h-[75vh] overflow-y-auto space-y-3">
            <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest block pb-1 border-b">
              Matched Items in Dictionary ({matchedWords.length})
            </span>

            {matchedWords.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400 italic">
                No results match "{searchQuery}". Try another pattern!
              </div>
            ) : (
              <div className="space-y-2">
                {matchedWords.map((word) => (
                  <div
                    key={word.id}
                    onClick={() => {
                      handleMarkViewed(word.id);
                      setSelectedWordForModal({ ...word, viewed: true });
                      setIsSearchActive(false);
                      setSearchQuery("");
                    }}
                    className="p-3 border rounded-xl border-gray-100 hover:bg-gray-50 cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-serif font-black text-gray-800 text-sm">
                          {word.word}
                        </span>
                        <span className="text-gray-400 italic">
                          ({word.ipa})
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                        {formatDefinitions(word.definitions)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {isWordUnseen(word) && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-gray-100 text-gray-500">
                          Unseen
                        </span>
                      )}
                      {word.mastered && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-success-soft text-success-vibrant">
                          Mastered
                        </span>
                      )}
                      {word.toughNut && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-warning-soft text-warning-vibrant inline-flex items-center gap-1">
                          Tough <Brain className="w-3 h-3" />
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Views */}
        <main className={immersive ? "flex-1 min-h-0" : "flex-1 p-4"}>
          {activeTab === "Home" &&
            (hasStartedLearning ? (
              <LearningPathView
                words={words}
                activeLetter={pathLetter}
                dailyMastered={dailyMastered}
                onSelectLetter={handlePathSelectLetter}
                onStartUnit={navigateToUnit}
              />
            ) : (
              <DashboardView
                words={words}
                streak={streak}
                continueLetter={continueTarget?.letter ?? null}
                onLetterSelect={navigateToLetterBrowse}
              />
            ))}

          {activeTab === "Browse" && (
            <BrowseView
              words={words}
              selectedLetter={selectedLetter}
              unitNumber={
                browseScope?.letter === selectedLetter
                  ? browseScope.unitNumber
                  : null
              }
              resumeWordId={browseResumeWordId}
              onSetSelectedLetter={selectLetter}
              onClearUnitScope={() => setBrowseScope(null)}
              onGoHome={() => {
                setBrowseScope(null);
                setActiveTab("Home");
              }}
              onSetFlags={handleSetFlags}
              onMarkViewed={handleMarkViewed}
              onCurrentWordChange={handleBrowseCurrentWordChange}
              onSaveContinuePosition={handleSaveContinuePosition}
            />
          )}

          {activeTab === "Mastered" && (
            <MasteredView
              words={words}
              selectedLetter={selectedLetter}
              onSetSelectedLetter={selectLetter}
              onSetFlags={handleSetFlags}
              onNavigateToBrowseLetter={navigateToLetterBrowse}
            />
          )}

          {activeTab === "Tough Nut" && (
            <ToughNutView words={words} onSetFlags={handleSetFlags} />
          )}

          {activeTab === "Profile" && profile && (
            <ProfileView
              profile={profile}
              words={words}
              streak={streak}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
            />
          )}

          {/* Tests tab temporarily disabled
          {activeTab === 'Tests' && (
            <TestsView words={words} onUpdateStatus={handleUpdateStatus} initialSelectedMode={null} />
          )} */}
        </main>

        {/* Bottom navigation */}
        <nav
          id="global_navigation_bar"
          className="fixed bottom-0 w-full max-w-[600px] h-16 z-50 border-t border-gray-150 bg-surface flex justify-around items-center px-2 left-1/2 -translate-x-1/2"
        >
          {(
            [
              { tab: "Home", label: "Home", Icon: Home },
              { tab: "Browse", label: "Browse", Icon: BookOpen },
              { tab: "Mastered", label: "Mastered", Icon: CheckCircle },
              { tab: "Tough Nut", label: "Tough Nut", Icon: Brain },
              { tab: "Profile", label: "Profile", Icon: User },
            ] as const
          ).map(({ tab, label, Icon }) => {
            const isActive = activeTab === tab;
            const showBadge =
              !isActive &&
              ((tab === "Mastered" && masteredTotalCount > 0) ||
                (tab === "Tough Nut" && words.some((w) => w.toughNut)));
            return (
              <button
                key={tab}
                type="button"
                data-nav-tab={tab}
                data-coach-nav={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex flex-col items-center justify-center p-1 cursor-pointer transition-all ${
                  isActive
                    ? "text-primary"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {showBadge && (
                  <span
                    className={`absolute top-1 right-2 w-2 h-2 rounded-full ${
                      tab === "Mastered"
                        ? "bg-success-vibrant"
                        : "bg-warning-vibrant"
                    }`}
                  />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-wider uppercase mt-1">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Word details modal (from search) */}
      {selectedWordForModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 space-y-5 relative">
            <button
              onClick={() => setSelectedWordForModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2 pt-2">
              <div className="flex justify-center gap-1.5">
                {isWordUnseen(selectedWordForModal) && (
                    <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider bg-gray-100 text-gray-500">
                      Unseen
                    </span>
                  )}
                {selectedWordForModal.mastered && (
                  <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider bg-success-soft text-success-vibrant">
                    Mastered ✓
                  </span>
                )}
                {selectedWordForModal.toughNut && (
                  <span className="text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider bg-warning-soft text-warning-vibrant inline-flex items-center gap-1">
                    Tough Nut <Brain className="w-3 h-3" />
                  </span>
                )}
              </div>
              <h2 className="font-serif text-3xl font-black text-gray-900 leading-none">
                {selectedWordForModal.word}
              </h2>
              <div className="flex justify-center items-center gap-1.5 text-xs text-gray-400 italic">
                <span>{selectedWordForModal.ipa}</span>
                <span className="text-[9px] font-extrabold text-primary bg-primary/10 px-1.5 rounded uppercase">
                  {selectedWordForModal.partOfSpeech}
                </span>
              </div>
            </div>

            <div className="flex justify-center select-none pt-1">
              <button
                type="button"
                onClick={() => speakWord(selectedWordForModal.word)}
                className="bg-primary/10 hover:bg-primary/20 text-primary p-3 rounded-full flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-transform"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <DefinitionsHeading count={selectedWordForModal.definitions.length} />
              <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                <DefinitionsList
                  definitions={selectedWordForModal.definitions}
                  variant="detail"
                />
              </div>
            </div>

            <WordEtymology
              etymology={selectedWordForModal.etymology}
              className="text-xs [&_p]:text-xs"
            />

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="grid grid-cols-2 gap-2 font-bold text-[10px] uppercase text-center leading-none">
                <button
                  type="button"
                  onClick={() => {
                    const next = {
                      ...selectedWordForModal,
                      mastered: !selectedWordForModal.mastered,
                    };
                    handleSetFlags(selectedWordForModal.id, {
                      mastered: next.mastered,
                    });
                    setSelectedWordForModal(next);
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer ${
                    selectedWordForModal.mastered
                      ? "bg-success-soft border-success-vibrant text-success-vibrant"
                      : "bg-white border-gray-150 text-success-vibrant hover:bg-success-soft/20"
                  }`}
                >
                  {selectedWordForModal.mastered
                    ? "Mastered ✓"
                    : "Mark Mastered"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = {
                      ...selectedWordForModal,
                      toughNut: !selectedWordForModal.toughNut,
                    };
                    handleSetFlags(selectedWordForModal.id, {
                      toughNut: next.toughNut,
                    });
                    setSelectedWordForModal(next);
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer inline-flex items-center justify-center gap-1 ${
                    selectedWordForModal.toughNut
                      ? "bg-warning-soft border-warning-vibrant text-warning-vibrant"
                      : "bg-white border-gray-150 text-warning-vibrant hover:bg-warning-soft/20"
                  }`}
                >
                  {selectedWordForModal.toughNut ? (
                    <>
                      Tough Nut <Brain className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    "Mark Tough"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual first-run coachmarks */}
      {activeCoachMark === "home" &&
        (hasStartedLearning ? (
          <CoachMarkSpotlight
            target="[data-coach='path-active-unit']"
            title="Start your next unit"
            body="Words are grouped into bite-sized units. Tap the highlighted unit to start learning — finish it to unlock the next one."
            placement="bottom"
            onDismiss={() => dismissCoachMark("home")}
          />
        ) : (
          <CoachMarkSpotlight
            target="[data-coach='home-alphabet']"
            title="Pick a letter to start"
            body="Tap any letter to browse vocabulary flashcards. Your progress is tracked per letter — green means you've mastered them all."
            placement="bottom"
            onDismiss={() => dismissCoachMark("home")}
          />
        ))}
      {activeCoachMark === "mastered-tab" && (
        <CoachMarkSpotlight
          target="[data-coach-nav='Mastered']"
          title="Mastered words live here"
          body="Every word you mark with ✓ is saved in the Mastered tab so you can review them anytime."
          placement="top"
          onDismiss={() => dismissCoachMark("mastered-tab")}
        />
      )}
      {activeCoachMark === "tough-tab" && (
        <CoachMarkSpotlight
          target="[data-coach-nav='Tough Nut']"
          title="Drill your Tough Nuts"
          body="Words you flag as Tough Nut go to this tab perfect for words you want to revisit and drill."
          placement="top"
          icon={<Brain className="w-5 h-5" />}
          onDismiss={() => dismissCoachMark("tough-tab")}
        />
      )}
    </div>
  );
}
