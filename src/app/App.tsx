/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, onIdTokenChanged, User } from 'firebase/auth';
import { auth, db } from '../shared/firebase';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { Expense, UserProfile } from '../shared/types';
import { processDueRecurring } from '../features/expenses/recurringService';
import { processDueDeposits } from '../features/accounts/accountService';
import { processDueLoansNow } from '../features/accounts/loanService';
import LoginPage from '../features/auth/LoginPage';
import AccessScreen from '../features/auth/AccessScreens';
import { DeviceStatus, openDevice, signOutAndForget } from '../features/auth/deviceService';
import PinLock, { useBackgroundLock } from '../features/pin/PinLock';
import { isPinLocked } from '../features/pin/pin';
import BottomNav from '../shared/components/BottomNav';
import HomePage from '../features/home/HomePage';
import ExpensesPage from '../features/expenses/ExpensesPage';
import AddExpensePage from '../features/expenses/AddExpensePage';
import ReportsPage from '../features/reports/ReportsPage';
import ChatPage from '../features/chat/ChatPage';
import ChatButton from '../features/chat/ChatButton';
import ProfilePage from '../features/profile/ProfilePage';
import { motion, AnimatePresence } from 'motion/react';

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  isDarkMode: false,
  toggleDarkMode: () => {},
  theme: lightTheme,
});

export const useAuth = () => useContext(AuthContext);

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
  // Bumped by Home's "Manage" links so Profile opens straight into the My Accounts window
  const [openAccountsSignal, setOpenAccountsSignal] = useState(0);
  // Amount handed over by the calculator's "Save as expense"
  const [prefillAmount, setPrefillAmount] = useState<number | null>(null);
  const [prefillPeople, setPrefillPeople] = useState<number | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  // The chat is created on first visit and then kept alive, so a conversation (and a reply still on its way)
  // survives switching tabs. It only starts fresh on "New chat" or when the app is reopened.
  const [chatMounted, setChatMounted] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  // Text shared to the app from another app (Android: long-press an SMS > Share > XpenceX)
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

  useEffect(() => {
    if (activeTab === 'chat') setChatMounted(true);
    else setChatVisible(false);
  }, [activeTab]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const theme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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
      };
      await setDoc(docRef, newProfile);
      setProfile(newProfile);
    }
  };

  const enterApp = async (uid: string) => {
    await fetchProfile(uid).catch(err => console.error('Could not load the profile:', err));
    processDueRecurring(uid).catch(err => console.error('Recurring expenses failed:', err));
    processDueDeposits(uid).catch(err => console.error('Monthly deposits failed:', err));
    // The server also does this every hour; asking now means a missed hour shows up straight away
    processDueLoansNow().catch(err => console.error('Loan installments failed:', err));
  };

  const checkAccess = async (uid: string) => {
    const status = await openDevice();
    if (status === 'approved') await enterApp(uid);
    setAccess(status);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
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
      if (!stopped && status !== 'approved' && status !== 'offline') await signOutAndForget({ removed: true });
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
      else if (status !== 'offline') await signOutAndForget({ removed: true });
    });

    return () => {
      stopped = true;
      unwatch();
      stopTokenWatch();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [access, user, sessionKey]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

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

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return (
        <HomePage
          onViewAll={() => setActiveTab('expenses')}
          onManageAccounts={() => { setActiveTab('profile'); setOpenAccountsSignal(n => n + 1); }}
          onSaveExpense={(amount, people) => { setEditingExpense(null); setPrefillAmount(amount); setPrefillPeople(people ?? null); setActiveTab('add'); }}
        />
      );
      case 'expenses': return <ExpensesPage onEdit={(exp) => { setEditingExpense(exp); setActiveTab('add'); }} />;
      case 'add': return (
        <AddExpensePage
          key={editingExpense?.id || `new-${prefillAmount ?? ''}-${prefillPeople ?? ''}`}
          expense={editingExpense}
          prefillAmount={prefillAmount}
          prefillPeople={prefillPeople}
          onComplete={() => { setEditingExpense(null); setPrefillAmount(null); setPrefillPeople(null); setActiveTab('expenses'); }}
        />
      );
      case 'reports': return <ReportsPage />;
      case 'chat': return null; // rendered below, outside the page transition
      case 'profile': return <ProfilePage openAccountsSignal={openAccountsSignal} />;
      default: return <HomePage onViewAll={() => setActiveTab('expenses')} />;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, isDarkMode, toggleDarkMode, theme }}>
      {pinLocked && <PinLock uid={user.uid} onUnlocked={onPinUnlocked} />}
      <div key={sessionKey} inert={pinLocked} className={`min-h-screen bg-background text-foreground font-sans ${activeTab === 'home' ? 'pb-44' : 'pb-24'} transition-colors duration-300 relative overflow-x-clip`}>
        {/* Decorative background elements */}
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-400/25 rounded-full blur-[120px]" />
          <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-purple-500/10 dark:bg-purple-400/20 rounded-full blur-[100px]" />
          <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] bg-amber-400/15 dark:bg-amber-400/15 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10">
          {/* Show the chat once the previous page has finished animating out */}
          <AnimatePresence mode="wait" onExitComplete={() => { if (activeTab === 'chat') setChatVisible(true); }}>
            {activeTab !== 'chat' && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.02, y: -10 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="max-w-md mx-auto px-4 pt-6"
            >
              {renderContent()}
            </motion.div>
            )}
          </AnimatePresence>
          {chatMounted && user && (
            <motion.div
              initial={false}
              animate={chatVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className={chatVisible ? 'max-w-md mx-auto px-4 pt-6' : 'hidden'}
            >
              <ChatPage
                key={user.uid}
                active={activeTab === 'chat' && chatVisible}
                incomingText={sharedText}
                onIncomingHandled={() => setSharedText(null)}
              />
            </motion.div>
          )}
        </div>
        <AnimatePresence>
          {activeTab === 'home' && <ChatButton key="chat-fab" onOpen={() => setActiveTab('chat')} />}
        </AnimatePresence>
        <BottomNav activeTab={activeTab} setActiveTab={(tab) => { setEditingExpense(null); setPrefillAmount(null); setPrefillPeople(null); setActiveTab(tab); }} />
      </div>
    </AuthContext.Provider>
  );
}

