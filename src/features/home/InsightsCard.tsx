import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import DetailSheet from '../../shared/components/DetailSheet';
import { Insight } from './insights';
import TapCard, { IconBox } from './TapCard';

const TONE_ICON: Record<Insight['tone'], typeof Info> = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  good: CheckCircle2,
  info: Info,
};

/** Spending tips on Home: the most important one up front, all of them after a tap */
export default function InsightsCard({ insights }: { insights: Insight[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const top = insights[0]; // buildInsights puts the most urgent first
  if (!top) return null;

  return (
    <>
      <TapCard
        Icon={Sparkles}
        label={t('home.insights')}
        headline={top.title}
        chip={insights.length > 1 ? t('home.insightsCount', { count: insights.length }) : t('home.insightsOne')}
        chipTone={top.tone}
        chipIcon={TONE_ICON[top.tone]}
        onOpen={() => setOpen(true)}
      />

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<IconBox Icon={Sparkles} size="lg" />}
        title={t('home.insights')}
        about={t('home.insightsAbout')}
      >
        {insights.map(insight => (
          <div key={insight.id} className="flex items-start gap-3 p-3 rounded-2xl bg-background/50 border border-card-border">
            <IconBox Icon={TONE_ICON[insight.tone]} tone={insight.tone} />
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground">{insight.title}</p>
              <p className="text-xs text-muted font-medium leading-relaxed">{insight.detail}</p>
            </div>
          </div>
        ))}
      </DetailSheet>
    </>
  );
}
