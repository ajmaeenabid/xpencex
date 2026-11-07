import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '../../shared/i18n';

/** The greeting and example prompts shown in an empty chat */
export default function ChatWelcome({ firstName, handleSend }: {
  firstName?: string;
  handleSend: (text: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center space-y-8 pb-6">
      <div className="space-y-4">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-vibrant"
        >
          <Sparkles size={26} />
        </motion.div>
        <h3 className="font-bold text-3xl text-foreground tracking-tight">
          {firstName ? t('chat.hiName', { name: firstName }) : t('chat.hi')}
          <br />
          <span className="text-indigo-600 dark:text-indigo-400">{t('chat.howHelp')}</span>
        </h3>
        <p className="text-sm text-muted px-6 leading-relaxed">
          {t('chat.welcomeHint')}
        </p>
      </div>
      <div className="w-full flex flex-col gap-2">
        {[t('chat.hint1'), t('chat.hint2'), t('chat.hint3'), "Payment Tk 450.00 to Foodpanda successful. Fee Tk 0.00. TrxID 9K7ABC12 at 23/10/2026 13:05"].map((hint, i) => (
          <button
            key={i}
            onClick={() => handleSend(hint)}
            className="px-4 py-3 bg-card/60 rounded-2xl text-xs font-semibold text-muted border border-card-border hover:border-indigo-500/60 hover:text-foreground transition-all text-left line-clamp-2"
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
