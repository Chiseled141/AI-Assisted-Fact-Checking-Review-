import { ReplyButton } from '../../components/ReplyButton';
import { t } from '../../lib/i18n';

export function ChartReply({ title, onReply }: { title: string; onReply?: (title: string) => void }) {
  if (!onReply) return null;
  return (
    <div className="ml-auto shrink-0">
      <ReplyButton label={t('Ask about {item}', { item: title })} onClick={() => onReply(title)} />
    </div>
  );
}
