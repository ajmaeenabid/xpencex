# Wallet (BudgetBakers) vs Xpences: feature reference and recommendations

Recorded 2026-11-16 from Wallet by BudgetBakers (Android package `com.droid4you.application.wallet`),
installed on the owner's phone (Xiaomi, Android 16 / HyperOS), free plan, signed in, one Cash account.
Every screen, menu, form and setting was opened and read; nothing was saved in Wallet.
Features marked ★ are Premium (paid) in Wallet.

Use this file in a new chat: section 1 is what Wallet has, section 2 is what Xpences already has,
section 3 is the verdict for every Wallet feature, section 4 is the suggested order of work.

---

## 1. Everything Wallet has

### 1.1 Home (dashboard)
- Two tabs: **Accounts** and **Budgets & Goals**.
- Account cards with each balance; **Add account**, **Account Detail** (balance today, last 30 days %), **Records**.
- Shortcut row (scrolls sideways): **Planned payments**, **Warranties**, **Shopping lists**, **Currency rates**.
- Swipeable tip cards (e.g. "Track your spending: connect Google Pay") and a Premium advert.
- **Customisable dashboard**: "Add more cards" opens a card picker with 8 groups. Each card has a ⋮ menu and a
  "vs past period" percentage. The picker previews cards with made-up data.
  - **Balance**: Actual Balance ("Do I have more money than before?"), Balance Trend (line chart), ★ Balance by
    Currencies, Balance by Accounts.
  - **Outlook**: Balance Forecast ("Will I have enough money to pay my bills?"), Upcoming Planned Payments,
    ★ Planned Payments by Category, Planned Payments Timeline.
  - **Cash-flow**: Cash Flow ("Am I spending less than I make?"), ★ Period to Period Comparison (vs previous period
    and the same period last year), Cash Flow Trend ("In which periods was I saving more or less?").
  - **Spending**: Expenses structure ("Where does my money go?", last 30 days), ★ Spending by Categories or Labels,
    The Nature of Spending ("must / need / want").
  - **Credit**: ★ Recurring Debts (loan, mortgage, leasing), Debt to Income Ratio, Utilization by Credit Cards /
    Overdrafts, Credit Limits Utilization.
  - **Reports**: ★ Cash Flow Table ("Am I spending too much?"), Income & Expenses Book (per category group).
  - **Assets**: ★ Financial Assets ("What % of my financial assets are invested?").
  - **Others**: Last records overview, Unknown records ("Categorize unknown records"), Wallet Dashboard
    (past 30 days and the next 7 days).

### 1.2 Adding a record (+ button)
- The + button offers **New record** and **Templates** ("Create first template").
- Type: **Income / Expense / Transfer**.
- Amount with a **built-in calculator keypad** (÷ × − + =), currency, **Account**, **Category**, **Templates** button.
- "More details" side panel: **Note**, **Description**, **Labels**, **Payee**, **Date**, **Time**,
  **Payment type** (Cash, Debit card, Credit card, Bank transfer, Voucher, Mobile payment, Web payment),
  **Warranty** (link to a warranty), **Status** (Reconciled / Cleared / Uncleared), **Place** (location),
  **Attachments** (add receipt).
- Leaving asks "Do you really want to leave without saving?"

### 1.3 Side menu
| Item | What it does |
|---|---|
| Get Premium | Paid plans |
| **Bank Sync** | Connect a real bank (choose country and bank) to import transactions automatically |
| Home | Dashboard |
| **Accounts** | List and total. Types: Checking, Credit card, Savings (with interest), Investments (stocks, ETF, crypto), Other (life insurance, loan, mortgage) |
| **Records** | All income and expenses, "last 30 days" total (∑), filters |
| **Investments** ("Try") | Investment accounts; moves between current and brokerage accounts; values updated automatically |
| **Statistics** | Full report screens: Balance, Outlook, Cash-flow, Spending, Credit, Reports, Assets (same groups as the dashboard cards) |
| **Planned payments** | Future receivables and bills (see 1.5) |
| **Budgets** | See 1.5 |
| **Debts** | I Lent / I Borrowed, Active / Closed tabs, search |
| **Goals** | Active / Paused / Reached tabs |
| Try our new app ShareCost | Advert for their bill-splitting app |
| **Loyalty cards** | Keep shop loyalty cards in one place, search |
| **Currency rates** | Rate pairs (BDT/USD 124.38, BDT/GBP, BDT/EUR), tap a pair to change it, data from CurrencyLayer |
| **Group sharing** | Share finances with a partner, family or friends; create a group and invite |
| Others | **Dark mode** switch, **Hide Amounts** switch, Invite friends, Follow us, Help (opens their website), Settings |

Also on Home's shortcut row: **Warranties** (keep warranties in one place, search) and **Shopping lists**.

### 1.4 Add account: choose a type
- **Bank Sync**: connect to the bank, transactions sync automatically ("How does it work?").
- **Google Pay Sync** (new): track Google Pay payments automatically.
- **Investments**: stocks, ETFs or crypto, value updated automatically.
- **File Import**: import CSV, Excel, OFX… sent by email, from any source including the bank.
- **Manual Input**: update the account by hand (import or bank connection can be added later).

### 1.5 Forms (fields)
- **Budget**: Name, **Period** (Monthly, …), Amount, Currency, **Categories**, **Accounts** (all or some), **Labels**,
  notifications **Trending Over** ("forecasted spend exceeds the budget") and **Over Budget**.
- **Goal**: Name ("What are you saving for?") with ideas: new vehicle, new home, holiday trip, education,
  emergency fund, health care, party, kids spoiling, charity. Goals can be Active, Paused or Reached.
- **Planned payment**: Income / Expense, Name, Category, Account, Amount, Currency, Payment type, Payee,
  **Frequency** (One-Time or repeating), Date, **Notification**, Note, Labels.
- **Debt (I Lent / I Borrowed)**: first asks "Do you already have this debt record in Wallet?" (Yes, select record /
  No, skip), so a debt can be linked to an existing record.

### 1.6 Settings
- **User profile**: image, first and last name, email, password, Logout.
- **Premium plans**.
- **Automatic tracking**: **Google Pay Sync** ("Use Google Pay as usual: Wallet adds each payment for you. Every
  payment gets a category").
- **General**
  - **Accounts**: manage, change icons, colour, description.
  - **Categories**: 11 groups (Food & Drinks, Shopping, Housing, Transportation, Vehicle, Life & Entertainment,
    Communication & PC, Financial expenses, Investments, Income, Others), icons, colours, **custom subcategories**.
  - **Labels**: define labels for better filtering.
  - **Templates**: saved records to add new ones faster.
  - **Filters**: saved custom filters for Statistics and Records.
  - **Automatic rules**: assign categories and labels automatically and recognise transfers (for synced records).
  - **Currencies**: add currencies, adjust exchange rates.
- **Notifications**: Wallet reminder (20:00 daily, write down expenses), Accounts (limit exceeded), Unconfirmed
  records, Budgets (overspending), Planned payments (upcoming), Debts (due dates), Imports (CSV received), New blog
  posts, Income (significant income), Currency rate updates (automatic).
- **Security**: PIN on startup, Fingerprint on startup.
- **Advanced settings**: Number format (decimals), Active module after launch (which screen opens first),
  **Initial day of the month** (start of the accounting period).
- **Personal data & Privacy**: Privacy Policy, Terms, emails and messages (turn off promotions), data portability,
  **Delete all user data**, **Delete Profile and all data**.
- **About Wallet**.

---

## 2. What Xpences already has (for comparison)

Money records: expenses and income (title, amount, category, date, notes, account, receipt), custom categories,
category budgets and a monthly budget, repeating expenses, monthly income rules, accounts (bank, bKash, Nagad, Rocket,
cash wallet) with balance history, transfers between accounts, loans with automatic installments (AI server),
lend and borrow (dhar/baki) linked to expenses, savings goals / festival funds (with "moved from account"),
samity (rotating savings group), receipts (photos and PDFs, up to 100), MFS fee tracker, wrong-send helper,
regret / worth-it tag, student runway (how long money lasts), insights.

Screens and tools: Home with movable cards, search over every screen ("Ask AI or search"), Expenses list with
search and filter chips, Reports (charts, month compare, by account, fees, regret, monthly, breakdown), PDF report,
CSV export, Google Sheets export, Google Drive backups (automatic), backup file and restore, calculator with
currency conversion (rates from the AI server), home screen widget, 8 automatic reminders plus up to 20 own
reminders, PIN lock and fingerprint, dark mode, hidden balances, English and Bangla, currency choice.

AI: chat in English and Bangla, voice messages, live voice chat, photo / PDF / spreadsheet reading, money SMS
pasted or shared into the app, and an agent that prepares confirm cards for transfers, lend/borrow, edits and
deletes, budgets, categories, repeating expenses, reminders, settings, opening screens, savings goals and samity,
collected in **Agent space** (tasks waiting for Confirm, plus history).

---

## 3. Verdict for every Wallet feature

Legend: **Add** = worth adding soon · **Later** = useful, after the "Add" ones · **Skip** = not worth it for Xpences
(reason given) · **Have** = Xpences already covers it (sometimes better).

### 3.1 Worth adding (strong fit, reasonable work)

| # | Wallet feature | Why it's worth it for Xpences | How it could work in Xpences | Work | Notes |
|---|---|---|---|---|---|
| A1 | **Initial day of the month** (accounting period start) | Many users are paid on the 25th or 1st–10th; "this month" spending and budgets are wrong for them today. Students get allowance on a fixed day. | One setting in Profile (1–28). Every "this month" total, budget and report uses the person's cycle. The AI is told the cycle. | Small–medium (one date helper used everywhere) | Must also apply to budget reminders (80% / 100%) and the widget |
| A2 | **Planned payments + Balance Forecast** ("Will I have enough money to pay my bills?") | Repeating expenses only cover fixed repeats. One-off future bills (school fee on the 10th, rent advance, Eid shopping) and expected income are missing. A forecast fits Xpences' runway card perfectly. | "Upcoming" list: name, amount, date, repeat (once / weekly / monthly), income or expense, account, reminder. A Home card shows the balance curve for the next 30 days and warns when it dips below zero. "Mark as paid" turns it into an expense. The AI can create them from chat ("remind me school fee 3000 on the 10th"). | Medium | New collection: rules, backups, account deletion, privacy policy |
| A3 | **Templates** (quick add) | The fastest way to add "Rickshaw 50", "Lunch 120", "Mobile recharge 100" with one tap, without using the AI's daily quota and while offline. | "Favourites" row on Add: tap to fill title, amount, category and account; long-press to edit. Can be learned from the most repeated entries. | Small | Fits the existing Add screen |
| A4 | **Labels / tags** | Categories answer "what"; labels answer "for which event": "Eid 2027", "Cox's Bazar trip", "Office", "Wedding". Useful for total cost of a trip or event. | Optional labels (up to 3) on expenses and income; filter by label in Expenses and Reports; "spending by label" card. The AI can add labels ("add this to Eid trip"). | Medium | Firestore rule change for the new field |
| A5 | **Automatic rules** (auto-category) | SMS and AI entries sometimes get the wrong category; people correct the same merchant again and again. Rules learned from corrections make it right next time and save AI calls. | "Always put 'Shwapno' in Groceries": made automatically when the user corrects a category twice, or by hand in Settings. Applied to SMS, chat and manual entries before saving. | Medium | Keep rules on the account (sync across devices) |
| A6 | **Period comparison incl. same period last year + Cash Flow trend** | Reports compare this month with last month only. "Am I saving more than last year?" and a savings trend over months are motivating and simple to read. | Add "vs same month last year" to Month compare; a 6- or 12-month bar chart of income vs expenses (saved amount per month). | Small–medium | Uses existing data only |
| A7 | **Goal states and ideas** | Goals in Xpences have no "paused" or "reached" state; finished goals stay in the list. Ideas help people start. | Reached goals move to a "Reached" section (with a small celebration); a Pause switch; idea chips when creating (Eid, laptop, emergency fund, Hajj/Umrah, wedding, admission fee). | Small | No new collection |

### 3.2 Later (useful, but after the above)

| # | Wallet feature | Why later | Suggestion |
|---|---|---|---|
| L1 | **File import (CSV / Excel)** | Helps people switching from other apps or keeping bank statements, but few users have files ready. | Import a CSV with a column-matching step and a preview; duplicates skipped (like SMS refs). Reuse the restore code's "skip what exists" logic. |
| L2 | **Shopping list** | Good Bangladesh fit ("bazar list" with estimated prices, tick items while shopping, total becomes one expense). Not core to tracking. | Simple list per trip with prices; "Save as expense" when done. The AI could make the list from a voice message. |
| L3 | **Warranties** | Xpences already stores receipts; adding a "warranty until" date to a receipt plus a reminder before it ends is cheap and handy (phones, fans, ACs). | Optional date on a receipt; a "Warranties" filter in the receipts gallery; reminder 7 days before. |
| L4 | **Saved filters** | Expenses already has filters; saving a favourite combination is a small convenience. | "Save this filter" chip, max 5. |
| L5 | **Spending by labels card / Nature of spending (need vs want)** | Xpences has the regret / worth-it tag already; a "needs vs wants" split could reuse it. | Only after labels (A4). |
| L6 | **Unknown records** card | Useful if imports or SMS often land in "Other". | Home card "5 entries need a category" opening a quick picker. |
| L7 | **Multi-currency accounts** | Only matters for people abroad or freelancers paid in USD. The calculator already converts. | An account may have its own currency; totals converted with the server's rates. Bigger change to every total. |
| L8 | **Group sharing (family / partner)** | Valuable for families, but a large change to the security rules, privacy policy and every screen. | Consider after Google Play launch, as a separate project. |

### 3.3 Skip (not worth it for Xpences, with reason)

| Wallet feature | Why skip |
|---|---|
| **Bank Sync** | No bank-data service in Bangladesh supports this for free; it needs a paid aggregator and bank agreements. bKash/Nagad SMS sharing already covers most money movement. |
| **Google Pay Sync** | Google Pay is not used for payments in Bangladesh. |
| **Investments (stocks, ETF, crypto) with live values** | Niche for the target users (students, families); live DSE prices need a paid data feed; crypto is legally restricted in Bangladesh. A plain "savings/investment" account type is enough. |
| **Credit card utilisation, credit limits, debt-to-income ratio** | Credit cards are rare among the target users; loans are already tracked with automatic installments. Revisit only if a credit card account type is added. |
| **Loyalty cards** | Not about money tracking; few Bangladeshi shops use cards; adds storage and privacy text. |
| **Record status (Reconciled / Cleared / Uncleared)** | Accountant-level detail; confusing for most users. Agent space already handles "waiting to confirm". |
| **Place / location on records** | New sensitive data (location) for the privacy policy and Google Play Data safety form, small benefit. |
| **Payee field** | The title already holds the shop or person; lend/borrow has its own person field. A separate field adds typing. |
| **Payment type list (debit card, voucher, web payment…)** | In Xpences the account already says how money moved (bKash, Nagad, bank, cash). |
| **Time on each record** | Rarely useful; date is enough (SMS entries keep their time already). |
| **Number format / start screen settings** | Minor; Xpences shows amounts the Bangladeshi way and opens on Home. |
| **Premium paywall, ShareCost, blog-post notifications, Follow us / Invite** | Business features of Wallet, not user features. Xpences is free for family and friends. |

### 3.4 Wallet features Xpences already has (Have)
| Wallet | Xpences |
|---|---|
| Income / Expense / Transfer | Yes (transfer added in stage A) |
| Built-in calculator on Add | Calculator card with currency conversion and "Save as expense" (Add screen itself has no keypad) |
| Categories with icons and colours | Yes, custom categories (no subcategories; subcategories are not recommended: they slow down adding) |
| Budgets with alerts | Monthly + per-category budgets, reminders at 80% and 100% (Wallet's "trending over" forecast alert could be added to A2) |
| Debts I lent / I borrowed, link to a record | Lend and borrow, optionally counted as spending and linked to the expense |
| Goals | Savings goals / festival funds, money moved from accounts |
| Planned repeating payments | Repeating expenses and monthly income (one-off planned payments are A2) |
| Receipts / attachments | Receipts with photos and PDFs, gallery in two places |
| Dashboard cards, rearrangeable | Movable cards on Home, Reports and Profile |
| Statistics / reports | Reports page + PDF + CSV + Google Sheets |
| Currency rates | Calculator rates (every 10 days from the AI server) |
| Daily reminder and other notifications | 8 automatic reminders + own reminders |
| PIN / fingerprint | PIN lock with fingerprint |
| Dark mode, hide amounts | Yes |
| Delete all data / profile | Delete my account (removes everything, confirmed with Google) |
| Backups, export | Backup file, Google Drive automatic backups, Sheets export |

### 3.5 Where Xpences is ahead of Wallet (keep and promote these)
AI chat, voice and live chat in Bangla and English; the agent with confirm cards and Agent space; reading bKash /
Nagad / bank SMS; samity; MFS fee tracker; wrong-send helper; student runway; regret / worth-it tag; loans with
automatic installments; home screen widget; free with no paywall.

---

## 4. Suggested order of work

1. **A1 Initial day of the month**: small and fixes wrong totals for salaried users.
2. **A3 Templates / favourites**: small, makes daily adding fastest, saves AI quota.
3. **A7 Goal states and ideas**: small polish.
4. **A2 Planned payments + balance forecast**: the biggest value; builds on runway and reminders.
5. **A4 Labels**: then L5 (spending by label).
6. **A5 Automatic rules**: once labels and categories settle.
7. **A6 Last-year comparison and savings trend** in Reports.
8. Later list as time allows: L1 import, L2 shopping list, L3 warranties, L4 saved filters, L6 unknown records,
   L7 multi-currency, L8 group sharing.

Each item needs, per the project rules (CLAUDE.md): Firestore rules for any new field or collection, backups and
account deletion for new collections, privacy policy and Data safety updates for new personal data, English and
Bangla text, tests for the logic, and the owner's choices asked before building.
