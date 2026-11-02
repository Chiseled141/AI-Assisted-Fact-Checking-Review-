import { ArrowUpRight, ChevronDown, FileText } from 'lucide-react';
import type { CheckDetail, SubmittedFile } from '../../types/models';
import { SourceLogo } from '../../components/SourceLogo';
import { formatBytes, formatCalendarDate, safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';
import { findSource } from '../../lib/sources';

const labelClass = 'text-[13px] font-medium text-orange-700';
const sampleNoteClass = 'mt-2 text-[13px] text-ink-muted';

function ArticleSource({ check, url }: { check: CheckDetail; url: string }) {
  const href = safeHref(url);
  const source = findSource(url);
  const { article } = check;
  const title = article?.title ?? (href ? new URL(href).hostname : url);
  return (
    <div>
      <p className={labelClass}>{t('Article checked')}</p>
      <h2 className="mt-1.5 break-words text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-ink-soft">
        {source && <SourceLogo source={source} decorative={Boolean(article?.publisher)} />}
        {article?.publisher && <span className="font-medium text-ink">{article.publisher}</span>}
        {article?.publishedAt && (
          <time dateTime={article.publishedAt}>{formatCalendarDate(article.publishedAt)}</time>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-0.5 font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-4 transition-colors hover:text-indigo-800 hover:decoration-indigo-700"
          >
            {t('Open article')}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('(opens in a new tab)')}</span>
          </a>
        )}
      </div>
      {!check.claimsMatchInput && (
        <p className={sampleNoteClass}>{t('This demo did not read this link. The claims below are sample data.')}</p>
      )}
    </div>
  );
}

function FileSource({ check, files }: { check: CheckDetail; files: SubmittedFile[] }) {
  return (
    <div>
      <p className={labelClass}>{files.length > 1 ? t('Files checked') : t('File checked')}</p>
      <ul className="mt-1.5 space-y-3">
        {files.map((file) => (
          <li key={file.name}>
            <h2 className="flex items-start gap-2 break-words text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink">
              <FileText className="mt-1 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
              <span className="min-w-0">{file.name}</span>
            </h2>
            <p className="mt-1 text-[14px] text-ink-soft">
              {formatBytes(file.size)} · {t('Read in your browser, not uploaded')}
            </p>
            <details className="group mt-2">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[14px] font-medium text-indigo-700 hover:text-indigo-800 [&::-webkit-details-marker]:hidden">
                {t('File contents')}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-white p-4 font-sans text-[14px] leading-[1.6] text-ink-soft">
                {file.text}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      {!check.claimsMatchInput && (
        <p className={sampleNoteClass}>{t('This demo did not read these files. The claims below are sample data.')}</p>
      )}
    </div>
  );
}

/** What was checked, when it was a link or a file. Pasted text needs no such line. */
export function InputSource({ check }: { check: CheckDetail }) {
  const content =
    check.inputType === 'url' && check.inputUrl ? (
      <ArticleSource check={check} url={check.inputUrl} />
    ) : check.files?.length ? (
      <FileSource check={check} files={check.files} />
    ) : null;
  return content && <section className="mb-8">{content}</section>;
}
