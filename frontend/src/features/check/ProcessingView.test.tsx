import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProcessingView } from './ProcessingView';
import { FailedView } from './FailedView';
import { makeCheck, makeClaim } from '../../test/fixtures';
import type { TaskProgress } from '../../types/models';

const startedAt = '2026-11-05T01:00:00+00:00';
const haiku = 'anthropic/claude-haiku-5.5';

function aiTask(fields: Partial<TaskProgress>): TaskProgress {
  return {
    id: 'ai', kind: 'ai', task: 'judging', modelName: 'Claude Haiku 5.5', requestedModel: haiku,
    status: 'running', claimPosition: 1, startedAt, ...fields,
  };
}

describe('Real processing progress', () => {
  it('distinguishes saved claim decisions from unfinished visual details', () => {
    render(<ProcessingView check={makeCheck({ status: 'assessing' })} />);
    expect(screen.getByText('Finishing visual details')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 claims processed')).toBeInTheDocument();
    expect(screen.queryByText('Comparing each claim with its evidence')).not.toBeInTheDocument();
  });

  it('keeps showing claim assessment while any claim has no decision', () => {
    render(<ProcessingView check={makeCheck({
      status: 'assessing',
      claims: [makeClaim(), makeClaim({ id: 'clm_pending', position: 2, current: null, currentVersion: 0 })],
    })} />);
    expect(screen.getByText('Comparing each claim with its evidence')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 claims processed')).toBeInTheDocument();
  });

  it('says a link is being read before any model has been called', () => {
    render(<ProcessingView check={makeCheck({ status: 'extracting', inputType: 'url', claims: [] })} />);
    expect(screen.getByText('Reading the submitted page')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('separates AI models, Tavily and chart data services', () => {
    render(<ProcessingView check={makeCheck({ status: 'retrieving', claims: [], progress: [
      aiTask({ id: 'extract', task: 'extracting', claimPosition: null, status: 'completed', actualModel: haiku, claimCount: 1 }),
      { id: 'search', kind: 'search', task: 'searching', service: 'Tavily', phase: 'reading', searchCount: 2, sourceCount: 3, sourceTarget: 5, status: 'running', claimPosition: 1, startedAt },
      { id: 'data', kind: 'data', task: 'chart_data', service: 'Yahoo Finance', chart: 'price', status: 'running', claimPosition: 1, startedAt },
    ] })} />);
    const ai = screen.getByRole('region', { name: 'AI models' });
    expect(within(ai).getByText('Claude Haiku 5.5')).toBeInTheDocument();
    expect(within(ai).queryByText('Tavily')).not.toBeInTheDocument();
    const search = screen.getByRole('region', { name: 'Source search' });
    expect(within(search).getByText('Tavily')).toBeInTheDocument();
    expect(within(search).getByText('Reading the pages found')).toBeInTheDocument();
    expect(within(search).getByText(/Search 2/)).toHaveTextContent('3 of 5 publishers saved');
    const data = screen.getByRole('region', { name: 'Chart and map data' });
    expect(within(data).getByText('Yahoo Finance')).toBeInTheDocument();
    expect(within(data).getByText('Price chart data')).toBeInTheDocument();
  });

  it('shows the third model finding sources beside the Tavily searches it makes', () => {
    render(<ProcessingView check={makeCheck({ status: 'retrieving', claims: [], progress: [
      aiTask({ id: 'research', task: 'researching', modelName: 'Third model', requestedModel: 'third/model' }),
      { id: 'search', kind: 'search', task: 'searching', service: 'Tavily', phase: 'searching', searchCount: 2, sourceCount: 0, sourceTarget: 5, status: 'running', claimPosition: 1, startedAt },
    ] })} />);
    expect(within(screen.getByRole('region', { name: 'AI models' })).getByText('Finding sources with Tavily')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Source search' })).getByText('Tavily')).toBeInTheDocument();
  });

  it('shows no group for work that has not really started', () => {
    render(<ProcessingView check={makeCheck({ status: 'extracting', claims: [], progress: [aiTask({ id: 'extract', task: 'extracting', claimPosition: null })] })} />);
    expect(screen.getByRole('region', { name: 'AI models' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Source search' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chart and map data' })).not.toBeInTheDocument();
  });

  it('names the model without its requested and answering ids', () => {
    render(<ProcessingView check={makeCheck({ status: 'assessing', progress: [
      aiTask({ id: 'done', status: 'completed', actualModel: haiku, summary: 'The supplied report states the opening date.', verdict: 'supported' }),
    ] })} />);
    expect(screen.getByText('Claude Haiku 5.5')).toBeInTheDocument();
    expect(screen.getByText('The supplied report states the opening date.')).toBeInTheDocument();
    expect(screen.queryByText(/Requested:|Answered by:/)).not.toBeInTheDocument();
    expect(screen.queryByText(haiku)).not.toBeInTheDocument();
  });

  it('keeps a timeout on the model that timed out, and never credits it with an answer', () => {
    render(<ProcessingView check={makeCheck({ status: 'assessing', progress: [
      aiTask({ id: 'slow', modelName: 'Nemotron 3 Ultra', requestedModel: 'nvidia/nemotron', status: 'failed', summary: 'The model timed out. Please try again later.' }),
      aiTask({ id: 'fine', status: 'completed', actualModel: haiku }),
    ] })} />);
    const rows = within(screen.getByRole('region', { name: 'AI models' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Nemotron 3 Ultra');
    expect(rows[0]).toHaveTextContent('The model timed out.');
    expect(rows[1]).not.toHaveTextContent('timed out');
  });
});

describe('A failed check', () => {
  it('names the model that rate-limited extraction', () => {
    render(
      <MemoryRouter>
        <FailedView check={makeCheck({ status: 'failed', claims: [], errorMessage: 'The claims could not be extracted.', progress: [
          aiTask({ id: 'extract', task: 'extracting', claimPosition: null, status: 'failed', summary: 'This model is temporarily rate-limited. Please try again later.' }),
        ] })} />
      </MemoryRouter>,
    );
    const failed = screen.getByRole('region', { name: 'What failed' });
    expect(failed).toHaveTextContent('Claude Haiku 5.5');
    expect(failed).toHaveTextContent('temporarily rate-limited');
    expect(screen.getByRole('alert')).toHaveTextContent('The claims could not be extracted.');
  });
});
