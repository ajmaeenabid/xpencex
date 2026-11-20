/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useLayoutEffect, useRef, createContext, useContext } from 'react';
import { onAuthStateChanged, onIdTokenChanged, User } from 'firebase/auth';
import { auth, db } from '../shared/firebase';
import { doc, getDoc, getDocFromCache, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Expense, UserProfile, Deposit } from '../shared/types';
import { processDueRecurring } from '../features/expenses/recurringService';
import { processDueDeposits } from '../features/accounts/accountService';
import { processDueLoansNow } from '../features/accounts/loanService';
import LoginPage from '../features/auth/LoginPage';
import AccessScreen from '../features/auth/AccessScreens';
import { DeviceStatus, openDevice, signOutAndForget, signOutNoteFor } from '../features/auth/deviceService';
import { savedLoginClaims } from '../features/auth/savedLogin';
import PinLock, { useBackgroundLock } from '../features/pin/PinLock';
import { isPinLocked } from '../features/pin/pin';
import BottomNav from '../shared/components/BottomNav';
import HomePage from '../features/home/HomePage';
import ExpensesPage from '../features/expenses/ExpensesPage';
import AddExpensePage from '../features/expenses/AddExpensePage';
import { ButtonTour, ChatPage, ReportsPage, WelcomeSlides, warmUp } from './lazyParts';
import LazyPart from '../shared/components/LazyPart';
import { revealSection } from '../features/search/revealSection';
import type { Place } from '../features/search/searchPlaces';
import { OPEN_EXPENSE_SETTINGS } from '../features/expenses/ExpenseSettings';
import { openSettings } from '../features/settings/settings';
import ProfilePage from '../features/profile/ProfilePage';
import { motion, AnimatePresence } from 'motion/react';
import { useAutoDriveBackup } from '../features/connect/useAutoDriveBackup';
import { isNative } from '../shared/lib/nativeApp';
import { useKeyboardOpen } from '../shared/lib/keyboard';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import UpdateNotice from '../features/download/UpdateNotice';
import { appStartup } from './startup';
import ReminderAsk, { markAsked, wasAsked } from '../features/reminders/ReminderAsk';
import { onReminderTap, remindersAllowed } from '../features/reminders/reminderService';
import { processDueIncome } from '../features/income/incomeService';
import { setErrorScreen } from '../shared/lib/errorReports';
import { SpendingSide, isSpendingTab, lastSpendingSide, rememberSpendingSide } from '../features/spending/spending';
import SidePager, { SidePagerHandle } from '../shared/components/SidePager';
import { cn } from '../shared/lib/utils';
import { handleBack } from '../shared/lib/backButton';

const lightTheme = {
  background: '#FFF8F2',
  text: '#000000',
  card: '#FFFFFF',
};

const darkTheme = {
  background: '#1F1410',
  text: '#FFFFFF',
  card: '#3A2821',
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  theme: typeof lightTheme;
  editIncome: (income: Deposit) => void; // opens an income on the Add screen (from Transactions or an account)
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  isDarkMode: false,
  toggleDarkMode: () => {},
  theme: lightTheme,
  editIncome: () => {},
});

export const useAuth = () => useContext(AuthContext);

/** The tabs that stay ready once opened (the chat keeps itself; "Add" starts fresh each time) */
const KEPT_PAGES = ['home', 'expenses', 'reports', 'profile'];
/** A short fade only: sliding or zooming whole pages costs too much on phones */
const PAGE_FADE = { duration: 0.18, ease: 'easeOut' } as const;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Whether this device may use the account. Nothing loads until it is 'approved'.
  const [access, setAccess] = useState<DeviceStatus | null>(null);
  // Bumped to reload every screen's data after this device's pass had to be renewed
  const [sessionKey, setSessionKey] = useState(0);
  const onPinUnlocked = useBackgroundLock();
  const [activeTab, setActiveTab] = useState('home');
  // Spending (Expenses and Reports in one bottom bar tab): remember the side last shown, and swipe between them
  useEffect(() => { if (isSpendingTab(activeTab)) rememberSpendingSide(activeTab); }, [activeTab]);
  // Expenses and Reports sit side by side and slide (src/shared/components/SidePager.tsx, chosen 2026-11-20).
  // The page's own switch slides first; the tab changes once the move has finished.
  const spendingPager = useRef<SidePagerHandle>(null);
  const slideSpending = (side: SpendingSide) => {
    if (spendingPager.current && isSpendingTab(activeTab)) spendingPager.current.slideTo(side === 'reports' ? 1 : 0);
    else setActiveTab(side);
  };
  const openExpenseSettings = () => { setActiveTab('expenses'); window.setTimeout(() => window.dispatchEvent(new Event(OPEN_EXPENSE_SETTINGS)), 120); };
  // Bumped by Home's "Manage" links so Profile opens straight into the My Accounts window.
  // Reset to 0 on any bottom-bar tab change, so a later visit to Profile shows its rows instead.
  const [openAccountsSignal, setOpenAccountsSignal] = useState(0);
  // Amount handed over by the calculator's "Save as expense"
  const [prefillAmount, setPrefillAmount] = useState<number | null>(null);
  const [prefillPeople, setPrefillPeople] = useState<number | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Deposit | null>(null);
  const editIncome = (income: Deposit) => { setEditingExpense(null); setEditingIncome(income); setActiveTab('add'); };
  // The chat is created on first visit and then kept alive, so a conversation (and a reply still on its way)
  // survives switching tabs. It only starts fresh on "New chat" or when the app is reopened.
  const [chatMounted, setChatMounted] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  // The bottom bar and the chat button step aside while the keyboard is open, so they never cover what is typed
  const keyboardOpen = useKeyboardOpen();
  // Text shared to the app from another app (Android: long-press an SMS > Share > Xpences)
  // Typed in Home's search, then Ask: waits in the chat's message box (not sent)
  const [chatDraft, setChatDraft] = useState<string | null>(null);
  const [sharedText, setSharedText] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('shared_text') || params.get('shared_title') || '').trim() || null;
    } catch {
      return null;
    }
  });

  // Open the chat for a shared SMS, and clear it from the address bar so a refresh doesn't repeat it
  useEffect(() => {
    if (!sharedText) return;
    window.history.replaceState(null, '', window.location.pathname);
    setActiveTab('chat');
  }, []);

  // In the phone app, "Share to Xpences" arrives from Android instead of in the address
  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;
    import('@capgo/capacitor-share-target').then(({ CapacitorShareTarget }) =>
      CapacitorShareTarget.addListener('shareReceived', (event) => {
        const text = (event.texts || []).join(' ').trim() || (event.title || '').trim();
        if (!text) return;
        setSharedText(text);
        setActiveTab('chat');
      }),
    ).then(h => { handle = h; }).catch(err => console.error('Share listener failed:', err));
    return () => { handle?.remove(); };
  }, []);

  useEffect(() => {
    setErrorScreen(activeTab); // so an error report says which screen it happened on
    if (activeTab === 'chat') setChatMounted(true);
    setChatVisible(activeTab === 'chat');
  }, [activeTab]);

  // Pages stay ready once opened, so moving between tabs is instant: no waiting for the old page to
  // leave, no rebuilding, no reloading data. "Add" starts fresh each time, so it is not kept.
  const [visited, setVisited] = useState<string[]>(['home']);
  useEffect(() => {
    if (KEPT_PAGES.includes(activeTab)) setVisited(v => (v.includes(activeTab) ? v : [...v, activeTab]));
  }, [activeTab]);

  // Each tab remembers how far down it was scrolled
  const scrollByTab = useRef<Record<string, number>>({});
  const tabNow = useRef(activeTab);
  useEffect(() => {
    const remember = () => { scrollByTab.current[tabNow.current] = window.scrollY; };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, []);
  useLayoutEffect(() => {
    tabNow.current = activeTab;
    window.scrollTo(0, activeTab === 'add' ? 0 : scrollByTab.current[activeTab] ?? 0);
  }, [activeTab]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const theme = isDarkMode ? darkTheme : lightTheme;

  // Everything before Home (loading, sign-in, waiting for approval, the PIN lock) is always light.
  // The person's light/dark choice applies from Home on, where its switch is.
  const beforeHome = loading || !user || access !== 'approved' || isPinLocked(user.uid) || profile?.welcome === 'slides';
  const showDark = isDarkMode && !beforeHome;

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', showDark);
    // Phone app: light clock and battery icons on the dark theme, dark ones on the light theme
    if (isNative()) {
      SystemBars.setStyle({ style: showDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
        .catch(err => console.error('Could not set the status bar style:', err));
    }
  }, [showDark]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const fetchProfile = async (uid: string) => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setProfile(docSnap.data() as UserProfile);
    } else {
      // Create default profile
      const newProfile: UserProfile = {
        uid,
        email: auth.currentUser?.email || '',
        name: auth.currentUser?.displayName || '',
        currency: 'BDT',
        monthlyBudget: 5000,
        welcome: 'slides', // a brand-new account: show the welcome slides, then the button tour
      };
      await setDoc(docRef, newProfile);
      setProfile(newProfile);
    }
  };

  const enterApp = async (uid: string) => {
    await fetchProfile(uid).catch(err => console.error('Could not load the profile:', err));
    processDueRecurring(uid).catch(err => console.error('Recurring expenses failed:', err));
    processDueDeposits(uid).catch(err => console.error('Monthly deposits failed:', err));
    processDueIncome(uid).catch(err => console.error('Monthly income failed:', err));
    // The server also does this every hour; asking now means a missed hour shows up straight away
    processDueLoansNow().catch(err => console.error('Loan installments failed:', err));
  };

  const checkAccess = async (uid: string) => {
    const status = await openDevice();
    if (status === 'paused') return signOutAndForget({ note: 'paused' });
    if (status === 'approved') await enterApp(uid);
    setAccess(status);
  };

  /** The profile saved on this phone, shown at once; enterApp then brings the fresh copy */
  const showSavedProfile = async (uid: string) => {
    try {
      const snap = await getDocFromCache(doc(db, 'users', uid));
      if (snap.exists()) setProfile(snap.data() as UserProfile);
    } catch {
      // Not saved on this phone yet: enterApp loads it
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fast start: a phone approved before carries its pass in the saved login, so Home opens straight
        // away from the data saved here while the server confirms in the background. If the server says the
        // phone was removed, it is signed out, as the watcher below does. firestore.rules check every read anyway.
        if (savedLoginClaims(user.toJSON(), user.uid)?.deviceId) {
          await showSavedProfile(user.uid);
          setAccess('approved');
          setLoading(false);
          openDevice()
            .then(async (status) => {
              if (status === 'approved') await enterApp(user.uid);
              else if (status !== 'offline') await signOutAndForget({ note: signOutNoteFor(status) });
            })
            .catch(err => console.error('Background device check failed:', err));
          return;
        }
        await checkAccess(user.uid);
      } else {
        setAccess(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Once in, watch for this device being removed, so it is signed out straight away
  useEffect(() => {
    if (access !== 'approved' || !user) return;
    let stopped = false;
    let unwatch = () => {};
    let lastCheck = Date.now();

    const verify = async () => {
      lastCheck = Date.now();
      const status = await openDevice();
      if (!stopped && status !== 'approved' && status !== 'offline') await signOutAndForget({ note: signOutNoteFor(status) });
    };

    user.getIdTokenResult().then(({ claims }) => {
      if (stopped || typeof claims.deviceId !== 'string') return;
      unwatch = onSnapshot(
        doc(db, 'devices', claims.deviceId),
        snap => { if (!snap.metadata.fromCache && !snap.exists()) verify(); },
        verify,
      );
    }).catch(err => console.error('Could not watch this device:', err));

    const onVisible = () => { if (!document.hidden && Date.now() - lastCheck > 60_000) verify(); };
    document.addEventListener('visibilitychange', onVisible);

    // If a refreshed login ever comes back without this device's pass, get it again and reload the screens
    const stopTokenWatch = onIdTokenChanged(auth, async (current) => {
      if (!current) return;
      const { claims } = await current.getIdTokenResult();
      if (claims.deviceId) return;
      const status = await openDevice();
      if (stopped) return;
      if (status === 'approved') setSessionKey(n => n + 1);
      else if (status !== 'offline') await signOutAndForget({ note: signOutNoteFor(status) });
    });

    return () => {
      stopped = true;
      unwatch();
      stopTokenWatch();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [access, user, sessionKey]);

  // Once in, download the parts that load on their own, so every tab opens instantly and works offline
  useEffect(() => {
    if (access !== 'approved') return;
    const timer = window.setTimeout(warmUp, 3000);
    return () => window.clearTimeout(timer);
  }, [access]);

  // Reminders: a new person is asked right after the button tour; people who had the app before get
  // Android's question on their next open (both once per phone)
  const [askReminders, setAskReminders] = useState(false);
  useEffect(() => {
    if (access !== 'approved' || !user || !profile || profile.welcome === 'slides' || profile.welcome === 'tour' || askReminders) return;
    if (wasAsked(user.uid)) return;
    markAsked(user.uid);
    remindersAllowed(true);
  }, [access, user, profile?.welcome]);
  useEffect(() => {
    let stop = () => {};
    onReminderTap(tab => setActiveTab(tab)).then(s => { stop = s; });
    return () => stop();
  }, []);
  // The home screen widget opens the app with xpences://add or xpences://home
  useEffect(() => {
    if (!isNative()) return;
    const openLink = (url?: string) => {
      const tab = url?.match(/^xpences:\/\/(add|home)/)?.[1];
      if (tab) { setEditingExpense(null); setEditingIncome(null); setActiveTab(tab); }
    };
    let handle: { remove: () => Promise<void> } | null = null;
    import('@capacitor/app').then(async ({ App: CapApp }) => {
      openLink((await CapApp.getLaunchUrl())?.url);
      handle = await CapApp.addListener('appUrlOpen', e => openLink(e.url));
    }).catch(err => console.error('Widget link listener failed:', err));
    return () => { handle?.remove(); };
  }, []);

  // The phone's back button (chosen 2026-11-20): it closes the newest open window (src/shared/lib/backButton.ts).
  // With nothing open it goes to Home, and from Home it puts the app in the background, keeping its place.
  const tabForBack = useRef(activeTab);
  tabForBack.current = activeTab;
  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;
    import('@capacitor/app').then(async ({ App: CapApp }) => {
      handle = await CapApp.addListener('backButton', () => {
        if (handleBack()) return;
        if (tabForBack.current !== 'home') {
          setEditingExpense(null); setEditingIncome(null); setPrefillAmount(null); setPrefillPeople(null);
          setActiveTab('home');
        } else {
          CapApp.minimizeApp().catch(err => console.error('Could not put the app in the background:', err));
        }
      });
    }).catch(err => console.error('Back button listener failed:', err));
    return () => { handle?.remove(); };
  }, []);

  /** Moves a new account on from the welcome slides to the tour, and from the tour to done */
  const finishWelcome = (next: 'tour' | 'done') => {
    if (next === 'done' && user && !wasAsked(user.uid)) setAskReminders(true);
    setProfile(p => (p ? { ...p, welcome: next } : p));
    if (user) updateDoc(doc(db, 'users', user.uid), { welcome: next }).catch(err => console.error('Could not save the welcome step:', err));
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  // The opening animation stays on screen until this, so a slow sign-in check never shows a spinner
  useEffect(() => { if (!loading) appStartup.markReady(); }, [loading]);

  // Backs up to Google Drive by itself when the person turned that on (Profile > Connected apps)
  useAutoDriveBackup(access === 'approved' ? user?.uid : undefined, profile?.driveBackup, refreshProfile);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background transition-colors duration-300">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (access !== 'approved') {
    return <AccessScreen status={access || 'offline'} recheck={() => checkAccess(user.uid)} />;
  }

  // Checked on every render, so nothing shows for even a moment on a locked phone
  const pinLocked = isPinLocked(user.uid);

  // Home's search and the chat's "open a screen" card: open the tab, then find and light up the card
  const goToPlace = (place: Place) => {
    setEditingExpense(null); setEditingIncome(null); setPrefillAmount(null); setPrefillPeople(null);
    setActiveTab(place.tab);
    // A card in the Expenses side panel: open the panel once the page is there, then find the card
    if (place.panel) window.setTimeout(() => window.dispatchEvent(new Event(OPEN_EXPENSE_SETTINGS)), 120);
    // A setting in the Settings window on Profile: open the window (on the right page), then find the row there
    if (place.settings) window.setTimeout(() => openSettings(place.settings === true ? undefined : place.settings), 120);
    if (place.section) revealSection(`${place.settings ? 'settings' : place.tab}:${place.section}`, !!place.open);
  };

  const renderPage = (tab: string) => {
    switch (tab) {
      case 'home': return (
        <HomePage
          onViewAll={() => setActiveTab('expenses')}
          onManageAccounts={() => { setActiveTab('profile'); setOpenAccountsSignal(n => n + 1); }}
          onSaveExpense={(amount, people) => { setEditingExpense(null); setPrefillAmount(amount); setPrefillPeople(people ?? null); setActiveTab('add'); }}
          onGoTo={goToPlace}
          onAskAi={text => { setChatDraft(text); setActiveTab('chat'); }}
        />
      );
      case 'expenses': return <ExpensesPage onEdit={(exp) => { setEditingExpense(exp); setActiveTab('add'); }} onSide={slideSpending} />;
      case 'add': return (
        <AddExpensePage
          key={editingExpense?.id || editingIncome?.id || `new-${prefillAmount ?? ''}-${prefillPeople ?? ''}`}
          expense={editingExpense}
          income={editingIncome}
          prefillAmount={prefillAmount}
          prefillPeople={prefillPeople}
          onComplete={() => { setEditingExpense(null); setEditingIncome(null); setPrefillAmount(null); setPrefillPeople(null); setActiveTab('expenses'); }}
        />
      );
      case 'reports': return <LazyPart><ReportsPage onSide={slideSpending} onOpenPanel={openExpenseSettings} /></LazyPart>;
      case 'chat': return null; // rendered below, outside the page transition
      case 'profile': return <ProfilePage openAccountsSignal={openAccountsSignal} />;
      default: return <HomePage onViewAll={() => setActiveTab('expenses')} />;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, isDarkMode, toggleDarkMode, theme, editIncome }}>
      {pinLocked && <PinLock uid={user.uid} onUnlocked={onPinUnlocked} />}
      {/* Brand-new accounts: the welcome slides once, then the button tour on Home */}
      {!pinLocked && profile?.welcome === 'slides' && (
        <LazyPart fallback={null}>
          <WelcomeSlides onDone={() => { setActiveTab('home'); finishWelcome('tour'); }} />
        </LazyPart>
      )}
      {askReminders && user && <ReminderAsk uid={user.uid} onDone={() => setAskReminders(false)} />}
      {!pinLocked && profile?.welcome === 'tour' && activeTab === 'home' && !keyboardOpen && (
        <LazyPart fallback={null}>
          <ButtonTour onDone={() => finishWelcome('done')} />
        </LazyPart>
      )}
      <div key={sessionKey} inert={pinLocked} className={`min-h-screen bg-background text-foreground font-sans pb-24 transition-colors duration-300 relative overflow-x-clip`}>
        {/* The soft colour glows behind everything are drawn by body::before in index.css */}
        <div className="relative z-10">
          {/* Opened pages stay ready and are only shown or hidden, with a quick fade (see KEPT_PAGES).
              Expenses and Reports are one page holding both, side by side. */}
          {[...new Set(visited.map(tab => (isSpendingTab(tab) ? 'spending' : tab)))].map(page => {
            const shown = page === 'spending' ? isSpendingTab(activeTab) : activeTab === page;
            return (
              <motion.div
                key={page}
                initial={{ opacity: 0 }}
                animate={{ opacity: shown ? 1 : 0 }}
                transition={PAGE_FADE}
                className={shown ? cn('max-w-md mx-auto pt-6', page !== 'spending' && 'px-4') : 'hidden'}
              >
                {page === 'spending' ? (
                  <SidePager
                    ref={spendingPager}
                    side={(isSpendingTab(activeTab) ? activeTab : lastSpendingSide()) === 'reports' ? 1 : 0}
                    onSettle={side => setActiveTab(side ? 'reports' : 'expenses')}
                    enabled={isSpendingTab(activeTab)}
                    scrollOf={side => scrollByTab.current[side ? 'reports' : 'expenses'] ?? 0}
                    paneClassName="px-4"
                  >
                    {[renderPage('expenses'), renderPage('reports')]}
                  </SidePager>
                ) : renderPage(page)}
              </motion.div>
            );
          })}
          {activeTab === 'add' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE_FADE} className="max-w-md mx-auto px-4 pt-6">
              {renderPage('add')}
            </motion.div>
          )}
          {chatMounted && user && (
            <motion.div
              initial={false}
              animate={{ opacity: chatVisible ? 1 : 0 }}
              transition={PAGE_FADE}
              className={chatVisible ? 'max-w-md mx-auto px-4 pt-6' : 'hidden'}
            >
              <LazyPart>
                <ChatPage
                  key={user.uid}
                  active={activeTab === 'chat' && chatVisible}
                  incomingText={sharedText}
                  onIncomingHandled={() => setSharedText(null)}
                  draftText={chatDraft}
                  onDraftHandled={() => setChatDraft(null)}
                  onOpenExpense={(exp) => { setEditingExpense(exp); setActiveTab('add'); }}
                  onGoTo={goToPlace}
                />
              </LazyPart>
            </motion.div>
          )}
        </div>
        {!keyboardOpen && <BottomNav activeTab={activeTab} setActiveTab={(tab) => { setEditingExpense(null); setEditingIncome(null); setPrefillAmount(null); setPrefillPeople(null); setOpenAccountsSignal(0);
          // The Spending tab opens on the side used last; tapping it again stays where it is
          setActiveTab(tab === 'expenses' ? (isSpendingTab(activeTab) ? activeTab : lastSpendingSide()) : tab); }} />}
        <UpdateNotice />
      </div>
    </AuthContext.Provider>
  );
}

