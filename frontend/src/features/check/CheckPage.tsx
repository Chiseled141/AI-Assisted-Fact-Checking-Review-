import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import type { CheckNavigationContext } from '../../components/Layout';
import { Loader2, SearchX } from 'lucide-react';
import { checkService, NotFoundError } from '../../services';
import type { ChatMessage, ChatReference, CheckDetail, FollowUpTarget, SubmittedFile } from '../../types/models';
import { isTerminal } from '../../types/models';
import { ProcessingView } from './ProcessingView';
import { ReviewCard, ReviewSummary } from './ReviewCard';
import { FailedView } from './FailedView';
import { ResultsView } from '../results/ResultsView';
import { AssistantMessage, FollowUpExchange, UserMessage } from './ChatMessages';
import { FollowUpActions } from './FollowUpActions';
import { FollowUpBar } from './FollowUpBar';
import { config } from '../../config';
import { t } from '../../lib/i18n';

const POLL_INTERVAL_MS = 600;

type LoadState =
  { kind: 'loading' } | { kind: 'not-found' } | { kind: 'error'; message: string } | { kind: 'ready'; check: CheckDetail };

type ReplySelection = { reference: ChatReference } & (
  | { messageId: string; target?: never }
  | { messageId?: never; target: FollowUpTarget }
);

function answerSelection(message: ChatMessage): ReplySelection {
  const text = message.answer.trim().replace(/\s+/g, ' ');
  return {
    messageId: message.id,
    reference: {
      kind: 'answer',
      title: text.length > 160 ? `${text.slice(0, 157)}…` : text,
      modelName: message.modelName,
    },
  };
}

/** A check as a chat: what the reader sent, ClaimTrace's work and answer, and a box for the next check. Polls while it runs. */
export function CheckPage() {
  const { checkId = '' } = useParams();
  return <CheckView key={checkId} checkId={checkId} />;
}

function CheckView({ checkId }: { checkId: string }) {
  const reportCheck = useOutletContext<CheckNavigationContext | undefined>()?.reportCheck;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [reply, setReply] = useState<ReplySelection | null>(null);
  const [reviewRequest, setReviewRequest] = useState(0);
  const [modelId, setModelId] = useState<string>(config.judges.followUpDefaultId);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const composerEndRef = useRef<HTMLDivElement>(null);
  // A question waiting for its answer, shown in the chat until the answer is saved.
  const [pending, setPending] = useState<Pick<ChatMessage, 'question' | 'files' | 'reference'> | null>(null);
  // Counts requests from the box below to open the correction dialog.
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [pending, state]);

  useLayoutEffect(() => {
    // Scroll to the composer's normal position after its reply label has been rendered.
    if (reply) composerEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [reply]);

  const load = useCallback(async () => {
    try {
      const check = await checkService.getCheck(checkId);
      reportCheck?.(check);
      setState({ kind: 'ready', check });
      return check;
    } catch (err) {
      setState(
        err instanceof NotFoundError
          ? { kind: 'not-found' }
          : { kind: 'error', message: t('This check could not be loaded. Please try again.') },
      );
      return null;
    }
  }, [checkId, reportCheck]);

  async function ask(question: string, files: SubmittedFile[], modelId: string, selection?: ReplySelection | null) {
    setPending({ question, files, reference: selection?.reference });
    try {
      const target = selection?.target;
      await checkService.askFollowUp(
        checkId, question, files, modelId, selection?.messageId,
        target?.kind === 'chart' ? { ...target, label: selection?.reference.title.slice(0, 300) } : target,
      );
      await load();
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const check = await load();
      // Nothing changes while a check waits for its reader, and answering starts this again.
      if (cancelled || !check || isTerminal(check.status) || check.status === 'awaiting_input') return;
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, attempt]);

  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center px-4 py-24 text-ink-soft" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        {t('Loading check…')}
      </div>
    );
  }

  if (state.kind === 'not-found' || state.kind === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <SearchX className="mx-auto h-10 w-10 text-ink-muted" aria-hidden="true" />
        <h1 className="mt-4 font-extrabold tracking-[-0.025em] text-2xl text-ink">
          {state.kind === 'not-found' ? t('Check not found') : t('Something went wrong')}
        </h1>
        <p className="mt-2 text-ink-soft">
          {state.kind === 'not-found' ? t('This check was not found on the server.') : state.message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {state.kind === 'error' && (
            <button type="button" className="btn-secondary" onClick={() => {
              setState({ kind: 'loading' });
              setAttempt((current) => current + 1);
            }}>
              {t('Try again')}
            </button>
          )}
          <Link to="/" className="btn-primary">
            {t('New check')}
          </Link>
        </div>
      </div>
    );
  }

  function replyToResult(target: FollowUpTarget, reference: Omit<ChatReference, 'kind'>, model?: string) {
    if (model) setModelId(model);
    setReply({ target, reference: { ...reference, kind: target.kind } });
    questionRef.current?.focus({ preventScroll: true });
  }

  const { check } = state;
  const messages = check.messages ?? [];
  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
      {!(check.status === 'completed' && check.claims.length > 0) && (
        <h1 className="sr-only">
          {check.inputText && check.inputText.length <= 1000 ? check.inputText : check.title}
        </h1>
      )}
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6 sm:pt-10">
        <UserMessage check={check} />
        <div className="mt-8">
          <AssistantMessage>
            <ProcessingView check={check} />
            {check.status === 'awaiting_input' && check.review && (
              <ReviewCard key={check.id} checkId={check.id} review={check.review} onAnswered={() => setAttempt((current) => current + 1)} />
            )}
            {check.review?.answer && <ReviewSummary review={check.review} />}
            {(check.status === 'failed' || check.status === 'stopped') && (
              <div className="mt-4">
                <FailedView check={check} />
              </div>
            )}
          </AssistantMessage>
        </div>
      </div>
      {/* Results keep their full width, so charts and sources stay easy to read. */}
      <div id="check-results" className="scroll-mt-24">
        {check.status === 'completed' && <ResultsView check={check} onReload={load} reviewRequest={reviewRequest} onReplyToResult={replyToResult} />}
      </div>
      {(messages.length > 0 || pending) && (
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-6 sm:px-6">
          {messages.map((message) => (
            <FollowUpExchange
              key={message.id}
              message={message}
              actions={
                <FollowUpActions
                  message={message}
                  busy={Boolean(pending)}
                  onReply={() => {
                    setReply(answerSelection(message));
                    questionRef.current?.focus({ preventScroll: true });
                  }}
                  onReview={(reviewer) => ask(t('Review this answer against the sources.'), [], reviewer, answerSelection(message))}
                />
              }
            />
          ))}
          {pending && <FollowUpExchange pending={pending} />}
          <div ref={endRef} />
        </div>
      )}
      <div id="followup-composer" className="sticky bottom-0 z-30 mt-auto scroll-mt-24 bg-gradient-to-t from-page from-60% to-transparent pb-4 pt-8">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <FollowUpBar
            check={check}
            modelId={modelId}
            onModelChange={setModelId}
            questionRef={questionRef}
            busy={Boolean(pending)}
            replyLabel={reply?.reference.title}
            onCancelReply={() => {
              setReply(null);
              questionRef.current?.focus({ preventScroll: true });
            }}
            onAsk={async (question, files, selectedModel) => {
              setReply(null);
              try {
                await ask(question, files, selectedModel, reply);
              } catch (error) {
                setReply((current) => current ?? reply);
                throw error;
              }
            }}
            onReview={() => setReviewRequest((count) => count + 1)}
            onStop={async () => {
              await checkService.stopCheck(checkId);
              await load();
            }}
          />
        </div>
      </div>
      <div ref={composerEndRef} id="followup-composer-end" aria-hidden="true" />
    </div>
  );
}
