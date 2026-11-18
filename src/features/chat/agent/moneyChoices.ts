// What the savings goal and samity cards last used: whether money went through an account, and which one.
// Kept on this phone only, like the Lend and borrow form's choices, so each card starts the way it was last used.

export type MoneyPlace = 'goal' | 'samity';
export interface MoveChoice {
  moveAccount: boolean;
  accountId?: string;
}

const KEY: Record<MoneyPlace, string> = { goal: 'xpences-agent-goal-account', samity: 'xpences-agent-samity-account' };

export function loadMoveChoice(place: MoneyPlace): MoveChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY[place]) || '{}');
    return { moveAccount: saved.moveAccount === true, ...(typeof saved.accountId === 'string' && { accountId: saved.accountId }) };
  } catch {
    return { moveAccount: false }; // storage blocked or damaged: start unticked
  }
}

export function saveMoveChoice(place: MoneyPlace, choice: MoveChoice) {
  try {
    localStorage.setItem(KEY[place], JSON.stringify({ moveAccount: choice.moveAccount, accountId: choice.accountId }));
  } catch { /* storage blocked: nothing to remember */ }
}
