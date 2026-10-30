// ILLUSTRATIVE DEMO DATA.
// Every place, organisation, publication, figure, and excerpt below is fictional.
// Marlow City and its sources do not exist; URLs use the reserved example.org domain.
// No quotation here is attributed to a real publisher.

import type { EvidenceRelation, FreshnessJudgment, InputType, Verdict } from '../types/models';

export interface FixtureEvidence {
  key: string;
  sourceTitle: string;
  publisher?: string;
  url: string;
  excerpt: string;
  /** Fictional publication date (YYYY-MM-DD). */
  publishedAt: string;
  updatedAt?: string;
  relation: EvidenceRelation;
}

export interface FixtureRevision {
  kind: 'ai_assessment' | 'human_correction';
  verdict: Verdict;
  rationale: string;
  cites: string[];
  /** Freshness of cited snapshots for this revision, keyed by evidence key. */
  freshness?: Record<string, FreshnessJudgment>;
  author: string;
  /** Minutes after the check was created. */
  offsetMinutes: number;
}

export interface FixtureClaim {
  key: string;
  text: string;
  /** Time period the claim refers to. Freshness is judged against this. */
  timeContext: string;
  evidence: FixtureEvidence[];
  revisions: FixtureRevision[];
  /** In the partial-failure scenario this claim's provider call fails. */
  failsInPartialScenario?: boolean;
}

export const FIXTURE_MODEL = { name: 'fixture-assessor (simulated)', promptVersion: 'assess-v3' };

export const FIXTURE_TOPIC = 'Marlow City Harbor Line (fictional)';

export const fixtureClaims: FixtureClaim[] = [
  {
    key: 'opening',
    text: 'The Harbor Line light rail in Marlow City opened to passengers in March 2024.',
    timeContext: 'March 2024',
    evidence: [
      {
        key: 'mcta-release',
        publishedAt: '2024-03-18',
        sourceTitle: 'Harbor Line opens to passengers',
        publisher: 'Marlow City Transit Authority (fictional)',
        url: 'https://example.org/mcta/news/harbor-line-opening',
        excerpt:
          'Revenue service on the Harbor Line began on 18 March 2024, with trains running every eight minutes between Quayside and Northgate.',
        relation: 'supporting',
      },
      {
        key: 'ledger-opening',
        publishedAt: '2024-03-18',
        sourceTitle: 'Crowds ride first Harbor Line trains',
        publisher: 'The Marlow Ledger (fictional)',
        url: 'https://example.org/marlow-ledger/2024/03/harbor-line-first-day',
        excerpt:
          'Riders queued at Quayside station on Monday morning as the first public Harbor Line service departed shortly after 6 a.m.',
        relation: 'supporting',
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale:
          'Two independent sources place the start of passenger service in March 2024, and neither conflicts on the date.',
        cites: ['mcta-release', 'ledger-opening'],
        freshness: { 'mcta-release': { status: 'current' }, 'ledger-opening': { status: 'current' } },
        author: 'ClaimTrace assessment model (simulated)',
        offsetMinutes: 1,
      },
    ],
  },
  {
    key: 'ridership',
    text: 'Harbor Line ridership reached 50,000 daily trips within its first six months.',
    timeContext: 'March–September 2024 (first six months)',
    evidence: [
      {
        key: 'ridership-report',
        publishedAt: '2024-10-07',
        sourceTitle: 'Six-month ridership summary, Harbor Line',
        publisher: 'Marlow City Transit Authority (fictional)',
        url: 'https://example.org/mcta/reports/harbor-line-six-month-ridership',
        excerpt:
          'Average weekday boardings for September 2024 were 31,400. Weekend averages were lower, at roughly 18,000 boardings per day.',
        relation: 'contradicting',
      },
      {
        key: 'ledger-target',
        publishedAt: '2023-11-14',
        sourceTitle: 'What the Harbor Line promised, and when',
        publisher: 'The Marlow Ledger (fictional)',
        url: 'https://example.org/marlow-ledger/2023/11/harbor-line-targets',
        excerpt:
          'Planning documents set a long-term goal of 50,000 daily trips, which officials expected to reach by the end of the decade.',
        relation: 'contextual',
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'contradicted',
        rationale:
          'The transit authority reports about 31,400 average weekday boardings at six months. The 50,000 figure appears to be a long-term planning target, not an achieved number.',
        cites: ['ridership-report', 'ledger-target'],
        freshness: {
          'ridership-report': { status: 'current' },
          'ledger-target': {
            status: 'unknown',
            reason: 'The 2023 article does not say whether the 50,000 target was later revised.',
          },
        },
        author: 'ClaimTrace assessment model (simulated)',
        offsetMinutes: 1,
      },
    ],
  },
  {
    key: 'budget',
    text: 'The Harbor Line was completed under its original budget of $1.2 billion.',
    timeContext: 'Completion and final accounting (2024–2025)',
    evidence: [
      {
        key: 'mcta-budget',
        publishedAt: '2024-03-20',
        updatedAt: '2024-04-02',
        sourceTitle: 'Harbor Line delivered on schedule',
        publisher: 'Marlow City Transit Authority (fictional)',
        url: 'https://example.org/mcta/news/harbor-line-delivered',
        excerpt: 'The Harbor Line was delivered on schedule and within the approved programme budget.',
        relation: 'supporting',
      },
      {
        key: 'audit',
        publishedAt: '2025-02-12',
        sourceTitle: 'Capital projects audit, fiscal year 2024',
        publisher: 'Marlow City Auditor’s Office (fictional)',
        url: 'https://example.org/marlow-auditor/fy2024-capital-projects',
        excerpt:
          'The Harbor Line’s original approved budget was $1.2 billion. After two scope amendments, the approved programme budget rose to $1.38 billion; final reported cost was $1.34 billion.',
        relation: 'contradicting',
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale: 'The transit authority states the line was delivered within the approved programme budget.',
        cites: ['mcta-budget'],
        freshness: { 'mcta-budget': { status: 'current' } },
        author: 'ClaimTrace assessment model (simulated)',
        offsetMinutes: 1,
      },
      {
        kind: 'human_correction',
        verdict: 'contradicted',
        rationale:
          '“Within the approved programme budget” refers to the amended $1.38B budget. The audit shows the final cost ($1.34B) exceeded the original $1.2B budget the claim refers to.',
        cites: ['audit', 'mcta-budget'],
        freshness: {
          audit: { status: 'current' },
          'mcta-budget': {
            status: 'outdated',
            reason:
              'This March 2024 release predates the February 2025 audit, which reports the budget amendments and final cost.',
          },
        },
        author: 'Demo reviewer',
        offsetMinutes: 42,
      },
    ],
  },
  {
    key: 'congestion',
    text: 'City officials say the Harbor Line reduced downtown traffic congestion by a third.',
    timeContext: 'Present (as of this check)',
    failsInPartialScenario: true,
    evidence: [
      {
        key: 'council-minutes',
        publishedAt: '2024-10-22',
        sourceTitle: 'City council transport committee minutes, October 2024',
        publisher: 'Marlow City Council (fictional)',
        url: 'https://example.org/marlow-council/minutes/2024-10-transport',
        excerpt:
          'Members discussed anecdotal reports of lighter downtown traffic. Staff noted that a traffic count study is scheduled for spring 2025 and no figures are yet available.',
        relation: 'contextual',
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'insufficient_evidence',
        rationale:
          'No source quotes officials giving a one-third figure. Council minutes say traffic data is not yet available, so the claim cannot be confirmed or refuted.',
        cites: ['council-minutes'],
        freshness: {
          'council-minutes': {
            status: 'outdated',
            reason:
              'October 2024 minutes say no traffic figures were available yet and a study was due in spring 2025, so that status may no longer apply today.',
          },
        },
        author: 'ClaimTrace assessment model (simulated)',
        offsetMinutes: 1,
      },
    ],
  },
];

export const PARTIAL_FAILURE_REASON =
  'The evidence provider timed out for this claim (simulated). No verdict was produced.';

export const FAILED_CHECK_REASON =
  'Evidence retrieval failed because the search provider was unreachable (simulated outage). No claims were assessed.';

export const STALE_CONFLICT_AUTHOR = 'Another reviewer (simulated)';

export interface ExampleInput {
  id: string;
  label: string;
  inputType: InputType;
  value: string;
}

export const exampleInputs: ExampleInput[] = [
  {
    id: 'transit-text',
    label: 'Transit news',
    inputType: 'text',
    value:
      'Marlow City’s Harbor Line light rail opened to passengers in March 2024. Ridership reached 50,000 daily trips within its first six months, and the line was completed under its original budget of $1.2 billion. City officials say it has reduced downtown traffic congestion by a third.',
  },
  {
    id: 'news-url',
    label: 'News URL',
    inputType: 'url',
    value: 'https://example.org/marlow-ledger/2024/10/harbor-line-six-months',
  },
  {
    id: 'budget-text',
    label: 'Budget claim',
    inputType: 'text',
    value:
      'The Harbor Line was finished under budget, costing less than the $1.2 billion originally approved by the city council.',
  },
];

export interface SeedCheck {
  id: string;
  inputType: InputType;
  value: string;
  scenario: 'completed' | 'partial_failure' | 'failed' | 'stale_conflict';
  /** How long ago the check was created, in hours. */
  hoursAgo: number;
}

export const seedChecks: SeedCheck[] = [
  { id: 'chk_demo_transit', inputType: 'text', value: exampleInputs[0].value, scenario: 'completed', hoursAgo: 2 },
  { id: 'chk_demo_url', inputType: 'url', value: exampleInputs[1].value, scenario: 'partial_failure', hoursAgo: 5 },
  {
    id: 'chk_demo_conflict',
    inputType: 'text',
    value: 'Marlow’s new light rail line was delivered under its $1.2 billion budget and now carries 50,000 riders a day.',
    scenario: 'stale_conflict',
    hoursAgo: 9,
  },
  {
    id: 'chk_demo_failed',
    inputType: 'url',
    value: 'https://example.org/marlow-ledger/2024/09/council-transport-update',
    scenario: 'failed',
    hoursAgo: 26,
  },
  { id: 'chk_demo_budget', inputType: 'text', value: exampleInputs[2].value, scenario: 'completed', hoursAgo: 30 },
  {
    id: 'chk_demo_opening',
    inputType: 'text',
    value: 'Passenger service on Marlow City’s Harbor Line began in spring 2024, ahead of the summer festival season.',
    scenario: 'completed',
    hoursAgo: 52,
  },
  {
    id: 'chk_demo_blog',
    inputType: 'url',
    value: 'https://example.org/blog/marlow-commute-diaries/harbor-line-review',
    scenario: 'completed',
    hoursAgo: 80,
  },
];
