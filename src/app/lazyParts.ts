import { lazy } from 'react';

// Parts of the app that download on their own, so the first screen shows sooner.
// Show them inside <LazyPart> (src/shared/components/LazyPart.tsx).
const loaders = {
  chat: () => import('../features/chat/ChatPage'),
  reports: () => import('../features/reports/ReportsPage'),
  spendingCharts: () => import('../features/reports/SpendingCharts'),
  calculator: () => import('../features/calculator/CalculatorSheet'),
  admin: () => import('../features/admin/AdminPanel'),
};

export const ChatPage = lazy(loaders.chat);
export const ReportsPage = lazy(loaders.reports);
export const SpendingCharts = lazy(loaders.spendingCharts);
export const CalculatorSheet = lazy(loaders.calculator);
export const AdminPanel = lazy(loaders.admin);

/**
 * Downloads every part quietly in the background, a few seconds after the app opens.
 * The service worker then keeps them, so every tab opens instantly and works offline.
 */
export function warmUp() {
  for (const load of Object.values(loaders)) load().catch(() => { /* tried again when the part is opened */ });
}
