import { useI18n } from '../i18n';

/** Opens the privacy policy in the app's language, in a new tab so the app keeps its place */
export default function PrivacyLink() {
  const { t, lang } = useI18n();
  return (
    <a
      href={lang === 'bn' ? '/privacy-bn.html' : '/privacy.html'}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-semibold text-muted underline underline-offset-2 hover:text-foreground transition-colors"
    >
      {t('common.privacyPolicy')}
    </a>
  );
}
