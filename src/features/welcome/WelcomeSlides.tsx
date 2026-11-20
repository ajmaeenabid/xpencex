import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Utensils } from 'lucide-react';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { logoSvg } from '../../shared/brand/logoSvg';
import { GoogleG, DriveLogo, SheetsLogo, CalendarLogo } from '../../shared/components/GoogleLogos';
import { haptic } from '../../shared/components/BottomNav';
import './welcome.css';
import { CHOICE_ON } from '../../shared/lib/choice';

// The welcome a brand-new account sees once, right after its first sign-in (the profile's `welcome` note).
// Seven slides with small animations; Next and Skip all on each, Get started on the last.
// The figures on the slides (Rahim, ৳250, 23 days...) are made-up examples for the pictures.

const COUNT = 7;
const LOGO = logoSvg();
const TITLES: TKey[] = ['welcome.s1Title', 'welcome.s2Title', 'welcome.s3Title', 'welcome.s4Title', 'welcome.s5Title', 'welcome.s6Title', 'welcome.s7Title'];
const TEXTS: TKey[] = ['welcome.s1Text', 'welcome.s2Text', 'welcome.s3Text', 'welcome.s4Text', 'welcome.s5Text', 'welcome.s6Text', 'welcome.s7Text'];

export default function WelcomeSlides({ onDone }: { onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [index, setIndex] = useState(0);
  const last = index === COUNT - 1;

  const next = () => { haptic(); setIndex(i => Math.min(i + 1, COUNT - 1)); };
  const finish = () => { haptic(); onDone(); };

  return (
    <div className="welcome fixed inset-0 z-[180] bg-background flex flex-col" role="dialog" aria-modal="true" aria-label={t('welcome.s1Title')}>
      {/* Language switch, on the first slide only */}
      <div className="h-14 shrink-0 flex items-center justify-end gap-1.5 px-4">
        {index === 0 && (['en', 'bn'] as const).map(code => (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={cn('px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors',
              lang === code ? CHOICE_ON : 'bg-card border-card-border text-foreground')}
          >
            {code === 'en' ? 'English' : 'বাংলা'}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-0 w-full max-w-md mx-auto overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.section
            key={index}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn('absolute inset-0 grid grid-rows-[1fr_auto] px-6', `s${index + 1}`)}
            aria-live="polite"
          >
            <div className="relative grid place-items-center min-h-0">
              <Art index={index} />
            </div>
            <div className="text-center space-y-2 pb-2">
              <h2 className="text-[27px] leading-tight font-bold text-foreground text-balance">{t(TITLES[index])}</h2>
              <p className="text-[16.5px] leading-relaxed text-muted font-medium text-pretty">{t(TEXTS[index])}</p>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-4 pb-6 space-y-4">
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: COUNT }, (_, i) => (
            <i key={i} className={cn('h-[7px] rounded-full transition-all duration-300', i === index ? 'w-5 bg-indigo-600' : 'w-[7px] bg-slate-200')} />
          ))}
        </div>
        {last ? (
          <button onClick={finish} className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white text-base font-bold">{t('welcome.start')}</button>
        ) : (
          <div className="flex gap-2.5">
            <button onClick={finish} className="flex-1 py-3.5 rounded-2xl bg-card border border-card-border text-foreground text-base font-bold">{t('welcome.skip')}</button>
            <button onClick={next} className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white text-base font-bold">{t('welcome.next')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The animated picture of each slide */
function Art({ index }: { index: number }) {
  const { t } = useI18n();
  switch (index) {
    case 0: return (
      <>
        <div className="s1-logo" dangerouslySetInnerHTML={{ __html: LOGO }} />
        <div className="w-coin c1">৳</div><div className="w-coin c2">৳</div><div className="w-coin c3">৳</div>
      </>
    );
    case 1: return (
      <div className="w-full grid gap-3">
        <div className="s2-bubble">{t('welcome.msg')}</div>
        <div className="s2-ways">
          <span className="w-chip">{t('welcome.type')}</span><span className="w-chip">{t('welcome.speak')}</span><span className="w-chip">{t('welcome.sms')}</span>
        </div>
        <div className="s2-dots"><i /><i /><i /></div>
        <div className="w-card s2-exp">
          <div className="w-[38px] h-[38px] rounded-xl bg-indigo-100 grid place-items-center text-indigo-600"><Utensils size={20} /></div>
          <div><b className="block text-base text-foreground">{t('welcome.lunch')}</b><small className="text-muted text-[13px]">{t('welcome.food')}</small></div>
          <div className="font-bold text-lg text-foreground">৳250</div>
          <div className="s2-ok">✓ {t('welcome.saved')}</div>
        </div>
      </div>
    );
    case 2: return <Accounts />;
    case 3: return (
      <div className="w-full grid gap-4 justify-items-center">
        <div className="relative w-60 flex justify-between">
          <Person initial={t('welcome.you').charAt(0)} name={t('welcome.you')} color="#E8602B" />
          <Person initial={t('welcome.friend').charAt(0)} name={t('welcome.friend')} color="#3B6EA8" />
          <div className="w-coin s4-coin">৳</div>
          <span className="w-chip s4-lent absolute left-1/2 -top-1.5 -translate-x-1/2">{t('welcome.lent')}</span>
        </div>
        <div className="w-card s4-cal w-[230px] grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-3">
          <div className="w-10 rounded-[9px] overflow-hidden text-center border border-card-border">
            <i className="block not-italic bg-purple-500 text-white text-[11px] font-bold py-0.5">{t('welcome.dec')}</i>
            <b className="block text-lg py-0.5 text-foreground">10</b>
          </div>
          <span className="text-sm leading-snug"><b className="text-foreground">{t('welcome.installment')}</b><br /><small className="text-muted">{t('welcome.onTime')}</small></span>
          <div className="s4-tick w-[26px] h-[26px] rounded-full bg-[#2E8B57] text-white grid place-items-center font-bold">✓</div>
        </div>
      </div>
    );
    case 4: return <SaveTogether />;
    case 5: return (
      <div className="w-full grid gap-3">
        <div className="flex gap-3">
          <div className="w-card flex-[1.3] h-[120px] flex items-end gap-[7px] p-3">
            {[45, 70, 35, 90, 60].map((h, i) => <i key={i} className="s6-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />)}
          </div>
          <div className="w-card flex-1 grid place-items-center p-2">
            <svg width="96" height="96" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="30" fill="none" stroke="var(--color-slate-200)" strokeWidth="12" />
              <circle className="s6-seg" cx="40" cy="40" r="30" fill="none" stroke="var(--color-indigo-600)" strokeWidth="12" strokeDasharray="188" strokeDashoffset="85" transform="rotate(-90 40 40)" />
              <circle className="s6-seg" cx="40" cy="40" r="30" fill="none" stroke="var(--color-purple-500)" strokeWidth="12" strokeDasharray="188" strokeDashoffset="150" transform="rotate(100 40 40)" />
            </svg>
          </div>
        </div>
        <div className="flex gap-2 justify-between items-center">
          <div className="w-card s6-lasts px-3 py-2 text-sm font-semibold text-foreground">{t('welcome.lasts')}</div>
          <div className="flex gap-1.5">
            <span className="s6-thumb w-[34px] h-[34px] rounded-full grid place-items-center bg-[#DFF3E7]">👍</span>
            <span className="s6-thumb w-[34px] h-[34px] rounded-full grid place-items-center bg-[#FFE1E7]">👎</span>
          </div>
        </div>
      </div>
    );
    default: return <Safe />;
  }
}

function Person({ initial, name, color }: { initial: string; name: string; color: string }) {
  return (
    <div className="grid justify-items-center gap-1 text-sm font-semibold text-foreground">
      <div className="w-[54px] h-[54px] rounded-full grid place-items-center text-white text-xl font-bold" style={{ background: color }}>{initial}</div>
      {name}
    </div>
  );
}

function Accounts() {
  const { t } = useI18n();
  const [total, setTotal] = useState(0);
  // The total counts up once the three cards are in
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + 1000;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 700));
      setTotal(Math.round(19700 * k));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const rows: [string, string, string][] = [['৳', t('welcome.cash'), '৳1,200'], ['b', 'bKash', '৳3,500'], ['B', t('welcome.bank'), '৳15,000']];
  const colors = ['#2E8B57', '#E2136E', '#3B6EA8'];
  return (
    <div className="w-full grid gap-[9px]">
      {rows.map(([mark, name, amount], i) => (
        <div key={name} className="w-card s3-acc">
          <div className="w-[34px] h-[34px] rounded-[11px] grid place-items-center text-white font-bold text-sm" style={{ background: colors[i] }}>{mark}</div>
          <span className="flex-1 text-base font-semibold text-foreground">{name}</span>
          <b className="text-base tabular-nums text-foreground">{amount}</b>
        </div>
      ))}
      <div className="s3-total flex justify-between pt-2.5 px-1.5 border-t-2 border-dashed border-card-border text-lg font-bold text-foreground">
        <span>{t('welcome.total')}</span><b className="text-indigo-600 tabular-nums">৳{total.toLocaleString('en-US')}</b>
      </div>
    </div>
  );
}

function SaveTogether() {
  const { t } = useI18n();
  // The samity turn goes round the circle, then stops on "you"
  const order = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const timers = order.map((_, k) => window.setTimeout(() => setStep(k), 400 + k * 160));
    return () => timers.forEach(clearTimeout);
  }, []);
  const done = step === order.length - 1;
  return (
    <div className="flex gap-[26px] items-end">
      <div className="grid justify-items-center gap-2 text-sm font-semibold text-foreground">
        <div className="relative w-[92px] h-[116px] border-[3px] border-t-0 border-muted rounded-[10px_10px_26px_26px] overflow-hidden bg-card">
          <div className="absolute -left-1.5 -right-1.5 top-0 h-2.5 bg-muted rounded" />
          <div className="s5-fill absolute inset-x-0 bottom-0 h-[64%] bg-gradient-to-b from-indigo-300 to-purple-500" />
          <div className="w-coin s5-jarcoin">৳</div>
        </div>
        <span>{t('welcome.eidFund')}</span>
        <span className="text-indigo-600 text-base font-bold">64%</span>
      </div>
      <div className="grid justify-items-center gap-2 text-sm font-semibold text-foreground">
        <div className="s5-ring relative w-[116px] h-[116px]">
          {[0, 60, 120, 180, 240, 300].map((a, i) => (
            <i key={a} style={{ ['--a' as string]: `${a}deg` }} className={cn(done && order[step] === i && 'you', !done && step >= 0 && order[step] === i && 'hit')} />
          ))}
          <b className={cn('absolute inset-0 grid place-items-center text-[13px] text-center leading-tight text-indigo-600 transition-opacity duration-300 px-6', done ? 'opacity-100' : 'opacity-0')}>{t('welcome.yourTurn')}</b>
        </div>
        <span>{t('welcome.samity')}</span>
        <span className="text-base">&nbsp;</span>
      </div>
    </div>
  );
}

function Safe() {
  const { t } = useI18n();
  const apps = [<GoogleG key="g" size={24} />, <DriveLogo key="d" size={24} />, <SheetsLogo key="s" size={24} />, <CalendarLogo key="c" size={24} />];
  return (
    <div className="grid gap-[18px] justify-items-center">
      <div className="flex gap-3.5 items-center">
        <svg width="62" height="76" viewBox="0 0 74 90" aria-hidden="true">
          <defs><linearGradient id="welcome-lock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB083" /><stop offset="1" stopColor="#EE5578" /></linearGradient></defs>
          <path className="s7-shackle" d="M20 42V26a17 17 0 0 1 34 0v16" fill="none" stroke="var(--muted)" strokeWidth="8" strokeLinecap="round" />
          <rect x="8" y="40" width="58" height="46" rx="12" fill="url(#welcome-lock)" />
          <circle cx="37" cy="60" r="6" fill="#fff" /><rect x="34.5" y="62" width="5" height="12" rx="2.5" fill="#fff" />
        </svg>
        <div className="relative w-[190px] h-[190px] grid place-items-center">
          <div className="absolute inset-[17px] rounded-full border-2 border-dashed border-card-border" />
          <svg width="96" height="74" viewBox="0 0 104 80" aria-hidden="true">
            <path d="M28 66h52a20 20 0 0 0 2-40 28 28 0 0 0-53-6A22 22 0 0 0 28 66z" fill="var(--card)" stroke="var(--muted)" strokeWidth="4" />
            <g className="s7-arrow"><path d="M52 58V34M42 44l10-10 10 10" fill="none" stroke="#E8602B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g>
          </svg>
          <div className="s7-spin">
            {apps.map((logo, k) => <div key={k} className="s7-app" style={{ ['--a' as string]: `${k * 90}deg` }}><span>{logo}</span></div>)}
          </div>
        </div>
      </div>
      <div className="s7-chips flex flex-wrap gap-1.5 justify-center max-w-[270px]">
        <span className="w-chip">{t('welcome.offline')}</span><span className="w-chip">{t('welcome.driveBackup')}</span><span className="w-chip">{t('welcome.pinLock')}</span>
      </div>
    </div>
  );
}
