// Domain models shared by the UI and the service layer.
// The FastAPI backend returns the same field names.

export type InputType = 'text' | 'url';

/** Processing lifecycle of a check. `completed`, `failed` and `stopped` are terminal. `awaiting_input` waits for the reader, with nothing running. */
export type CheckStatus = 'queued' | 'extracting' | 'awaiting_input' | 'retrieving' | 'assessing' | 'completed' | 'failed' | 'stopped';

export type Verdict = 'supported' | 'contradicted' | 'insufficient_evidence' | 'outdated';

/**
 * `assessed` claims have at least one revision with a verdict.
 * `unavailable` means the evidence provider failed, so no verdict exists.
 */
export type ClaimStatus = 'assessed' | 'unavailable';

export type EvidenceRelation = 'supporting' | 'contradicting' | 'contextual';

export type RevisionKind = 'ai_assessment' | 'human_correction';

/**
 * Whether a cited passage applies to the claim's time period. Judged per revision,
 * separately from the verdict: `outdated` means it may have been true then but no
 * longer applies; `current` means temporally applicable, not guaranteed accurate.
 */
export type Freshness = 'current' | 'outdated' | 'unknown';

export interface FreshnessJudgment {
  status: Freshness;
  /** Required for `outdated`; recommended for `unknown`. */
  reason?: string;
}

/** A text file attached to a text check. Contents are read in the browser. */
export interface SubmittedFile {
  name: string;
  /** Size in bytes of the original file. */
  size: number;
  text: string;
}

export interface CheckedArticle {
  title: string;
  publisher?: string;
  /** YYYY-MM-DD */
  publishedAt?: string;
}

export interface Check {
  id: string;
  title: string;
  inputType: InputType;
  inputText?: string;
  inputUrl?: string;
  /** Text checks only. */
  files?: SubmittedFile[];
  /** Metadata read from the submitted article at `inputUrl`. */
  article?: CheckedArticle;
  status: CheckStatus;
  createdAt: string;
  updatedAt: string;
  /** Set once claims have been extracted. */
  claimCount?: number;
  inputCategory?: 'subjective' | 'advice' | 'prediction' | 'unclear' | 'no_factual_claim' | 'prompt_injection' | 'spam' | 'out_of_scope' | null;
  /** Human-readable failure reason when `status === 'failed'`. */
  errorMessage?: string;
  /** Ids of the two judges this check was started with (see `config.judges`). */
  judgeIds?: string[];
  apiProvider?: ApiProvider | null;
}

/** Editorial rating of a source: good, mixed, or bad. Separate from verdicts and freshness. */
export type SourceTrust = 'green' | 'yellow' | 'red';

export interface SourceEntry {
  domain: string;
  name: string;
  trust: SourceTrust;
  /** One line on what this source is, e.g. "Official website of the Government of Vietnam". */
  about?: string;
  /** File name in public/source-logos. Missing means the UI shows a monogram. */
  logo?: string;
}

export interface EvidenceSnapshot {
  id: string;
  claimId: string;
  sourceTitle: string;
  publisher?: string;
  url: string;
  /** Saved text captured at retrieval time — not a live preview. */
  excerpt: string;
  /** The table a quoted row came from, read from the saved page by code. `quoted` indexes into `rows`. */
  table?: { columns: string[]; rows: string[][]; quoted: number[] } | null;
  /** The quote translated by the judge who chose it. Only the languages it isn't already in. */
  translations?: ModelTranslations | null;
  /** Publication date of the source, when known (YYYY-MM-DD). Unknown stays unknown. */
  publishedAt?: string;
  /** Last update date stated by the source, when known (YYYY-MM-DD). */
  updatedAt?: string;
  retrievedAt: string;
  /** Article preview from page metadata or a source-specific Tavily image; loaded by URL, never copied. */
  imageUrl?: string;
  relation: EvidenceRelation;
}

/**
 * One LLM judge's verdict on a claim. An AI revision lists both judges; the judge
 * marked `primary` is the configured one whose verdict the revision shows.
 */
export interface JudgeVerdict {
  /** Display name of the model, e.g. "DeepSeek". */
  judge: string;
  verdict: Verdict;
  /** 0–1. */
  confidence: number;
  /** The judge's overall reasoning for its verdict. */
  review: string;
  /** The review in each language, written by the judge itself. */
  translations?: ModelTranslations | null;
  primary: boolean;
  citations?: {
    evidenceId: string;
    quote?: string | null;
    translations?: ModelTranslations | null;
    relation?: EvidenceRelation | null;
    freshness?: 'current' | 'outdated' | 'unknown' | null;
  }[] | null;
  model?: string | null;
}

/** An image attached by a reviewer, sent to the backend as a base64 data URL. */
export interface Attachment {
  id: string;
  name: string;
  /** MIME type of the stored image. */
  type: string;
  /** Approximate stored size in bytes. */
  size: number;
  dataUrl: string;
}

/** Assets a price chart can show. Must match `MarketAsset` in the backend. */
export type MarketAsset = 'bitcoin' | 'ethereum' | 'gold' | 'silver' | 'oil' | 'usd_vnd' | 'sjc_gold';

/** A date worth marking on a price chart, taken from the checked text. */
export interface PriceEvent {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  text: string;
}

/** The news article behind one price on an SJC chart. */
export interface PriceReport {
  /** YYYY-MM-DD */
  date: string;
  publisher: string;
  title: string;
  url: string;
  /** Exact source wording retained for checking the reported price. Older saved charts may lack it. */
  quote?: string;
  publishedAt?: string | null;
}

/** Prices saved when the claim was checked. Set only for a claim about the price of a tracked asset. */
export interface PriceChartData {
  asset: MarketAsset;
  currency: string;
  /** Who supplied the prices. `news` means a model read them from articles, and each was checked against its article. */
  source: string;
  unit?: 'VND/tael';
  priceType?: 'selling';
  retrievedAt: string;
  /** [UTC midnight in ms, closing price], oldest first. */
  prices: [number, number][];
  events: PriceEvent[];
  /** One for each price, in the same order, when `source` is `news`. */
  reports?: PriceReport[];
}

/** A national statistic for every country over the years, saved when the claim was checked. */
export interface CountryMapData {
  /** `us-states` draws the same panel with US states in place of countries. */
  scope?: 'us-states';
  indicator: 'population' | 'gdp' | 'gdp_per_capita' | 'life_expectancy';
  source: string;
  retrievedAt: string;
  /** The year the map opens on. */
  year: number;
  years: number[];
  /** By the map's country code, plus `world`. One value for each of `years`, null where there is none. */
  values: Record<string, (number | null)[]>;
  /** The countries the claim names. Empty for a claim about the whole world. */
  selected: { code: string; name: string; named: string }[];
}

/** Seats won in an election, as read from the claim's sources and found word for word in them. */
export interface ElectionMapData {
  office: 'president' | 'house' | 'senate';
  year: number;
  retrievedAt: string;
  /** Only states with a verified result. Every other state is drawn as not verified. */
  states: {
    /** The map's code, such as us-oh. */
    code: string;
    name: string;
    winner: string;
    /** Only when the source states it. */
    party?: 'republican' | 'democratic' | null;
    detail?: string | null;
    publisher: string;
    url: string;
    /** Other winners that sources give for this state. */
    others: { winner: string; publisher: string; url: string }[];
  }[];
}

export interface SeatChartData {
  /** The chamber, as the claim writes it. */
  body: string;
  year?: number | null;
  /** The chamber's size. Seats beyond the parties listed are drawn as not listed. */
  total: number;
  totalSource: { publisher: string; url: string };
  retrievedAt: string;
  /** Biggest first. */
  parties: {
    name: string;
    seats: number;
    publisher: string;
    url: string;
    /** Other final counts that sources give for this party. */
    others: { seats: number; publisher: string; url: string }[];
  }[];
}

/** A figure from one of the claim's sources, found word for word in that source. */
export interface MapDetail {
  /** The `code` of the place it applies to. Missing means the whole event. */
  place?: string | null;
  label: string;
  value: string;
  publisher: string;
  url: string;
}

/** The places a claim names. The shapes they are drawn with live in public/maps. */
export interface LocationMapData {
  map: 'vietnam' | 'world' | 'us';
  places: {
    /** The place's `hc-key` on the map. */
    code: string;
    /** The map's name for it. */
    name: string;
    /** How the claim writes it. */
    named: string;
    /** Places inside it that the claim names, which readers can drill down to. `code` is set where it is known. */
    regions?: { name: string; code?: string }[];
  }[];
  details?: MapDetail[];
  /** How close the map opens, as the extraction model chose. Without it, `region`. */
  zoom?: 'close' | 'region' | 'wide';
}

export interface AssessmentRevision {
  id: string;
  claimId: string;
  /** 1-based, increments with every published revision. */
  version: number;
  kind: RevisionKind;
  verdict: Verdict;
  /** AI explanation, or the reviewer's correction reason. */
  rationale: string;
  /** The rationale in other languages, when the model wrote its own versions. */
  translations?: ModelTranslations | null;
  citedEvidenceIds: string[];
  /** Freshness of each cited snapshot for this revision, keyed by evidence id. Missing = unknown. */
  citationFreshness?: Record<string, FreshnessJudgment>;
  /** Screenshots the reviewer attached to a human correction. */
  attachments?: Attachment[];
  /** AI revisions record which model and prompt produced them. */
  model?: { name: string; promptVersion: string };
  /** AI revisions: each LLM judge's own verdict, so disagreement is visible. */
  judges?: JudgeVerdict[];
  author: string;
  createdAt: string;
}

export interface IncidentMapData {
  city: string;
  district?: string;
  roads: string[];
  position: [longitude: number, latitude: number] | null;
  bounds: [west: number, south: number, east: number, north: number] | null;
  toward?: [longitude: number, latitude: number];
  wholeRoad?: boolean;
  areas?: IncidentMapArea[];
  quote: string;
  publisher: string;
  url: string;
}

export interface IncidentMapArea {
  name: string;
  bounds: NonNullable<IncidentMapData['bounds']>;
  geometry?: { type: 'MultiPolygon'; coordinates: number[][][][] };
  road?: string;
}

export interface PieChartData {
  title: string;
  unit: 'count' | 'percent';
  parts: { name: string; value: number }[];
  derivedRemainder?: boolean;
  publisher: string;
  url: string;
}

export interface BarChartData {
  title: string;
  unit: string;
  points: { name: string; value: number }[];
  publisher: string;
  url: string;
}

export interface RouteMapData {
  title: string;
  stops: { name: string; position: [number, number]; schedule?: string }[];
  straightLineKm: number;
  publisher: string;
  url: string;
}

/** One country's people by age and sex, from a data service, saved when the claim was checked. */
export interface PopulationPyramidData {
  /** Two-letter code. */
  country: string;
  /** How the claim writes the country. */
  named: string;
  year: number;
  source: string;
  retrievedAt: string;
  /** Number of people in each five-year band, youngest first, ending with 80 and over. */
  men: number[];
  women: number[];
}

export interface MatchResultData {
  kind: 'sport' | 'esport';
  teams: [string, string];
  scores: [number, number];
  competition?: string | null;
  stage?: string | null;
  dateLabel?: string | null;
  shootout?: [number, number];
  maps?: { name: string; scores: [number, number] }[];
  moments?: { minute: string; label: string }[];
  publisher: string;
  url: string;
}

export type ChartKey = 'priceChart' | 'locationMap' | 'incidentMap' | 'countryMap' | 'populationPyramid' | 'seatChart' | 'electionMap' | 'pieChart' | 'barChart' | 'routeMap' | 'matchResult';
export type StockMarket = 'us' | 'cn' | 'jp' | 'hk' | 'in' | 'vn';

export type FollowUpTarget = { claimId: string } & (
  | { kind: 'source' | 'judge'; key: string }
  | { kind: 'chart'; key: ChartKey; label?: string }
);

export interface Claim {
  id: string;
  checkId: string;
  position: number;
  text: string;
  /** Short noun phrase for the overall statement (e.g. "the March 2024 opening"). */
  topic?: string;
  /** Time period the claim refers to, when known (e.g. "March 2024"). */
  timeContext?: string;
  status: ClaimStatus;
  /** Ordered; citation number `[n]` is index + 1. */
  evidenceIds: string[];
  /** Version of the latest revision (0 when none exists). */
  currentVersion: number;
  current: AssessmentRevision | null;
  /** Provider error shown when `status === 'unavailable'`. */
  unavailableReason?: string;
  priceChart?: PriceChartData;
  stockHeatmapMarkets?: StockMarket[] | null;
  locationMap?: LocationMapData;
  incidentMap?: IncidentMapData;
  countryMap?: CountryMapData;
  populationPyramid?: PopulationPyramidData;
  seatChart?: SeatChartData;
  pieChart?: PieChartData;
  barChart?: BarChartData;
  routeMap?: RouteMapData;
  matchResult?: MatchResultData;
  electionMap?: ElectionMapData;
  /** The claim in other languages, written by the extraction model. Only the languages it isn't already in. */
  translations?: ModelTranslations | null;
  /** The question this claim was written from by the research model. The reader never stated the claim. */
  rephrasedFrom?: string | null;
}

export type ModelTranslations = Partial<Record<'en' | 'vi', string>>;

/**
 * One call the check has really made, with its status and finished public explanation.
 * Never contains a model's private thinking stream. Written in backend/src/claimtrace/core/pipeline/progress.py.
 */
export interface TaskProgress {
  id: string;
  /** Who is doing the work: an AI model, Tavily, or a chart data service. */
  kind: 'ai' | 'search' | 'data';
  task:
    | 'extracting' | 'judging' | 'reading_seats' | 'reading_prices' | 'reading_figures' | 'reading_pie' | 'reading_states' | 'reading_election' | 'rephrasing' | 'researching' | 'researching_chart'
    | 'reading_bar' | 'reading_route' | 'reading_incident_location' | 'reading_match' | 'searching' | 'chart_sources' | 'chart_data' | 'reviewing' | 'clarifying';
  status: 'running' | 'completed' | 'failed';
  /** AI tasks. `modelName` and `requestedModel` are what was asked for; `actualModel` is what the provider says answered. */
  modelName?: string | null;
  requestedModel?: string | null;
  actualModel?: string | null;
  actualModelName?: string | null;
  /** Tavily and chart data tasks. */
  service?: string | null;
  chart?: string | null;
  phase?: 'searching' | 'reading' | null;
  searchCount?: number | null;
  sourceCount?: number | null;
  sourceTarget?: number | null;
  /** How many states an election map has verified so far. */
  stateCount?: number | null;
  startedAt: string;
  finishedAt?: string | null;
  claimPosition?: number | null;
  claimCount?: number | null;
  summary?: string | null;
  /** The summary in other languages, written by the model itself. */
  translations?: ModelTranslations | null;
  verdict?: Verdict | null;
}

/** A claim checked before that says the same as what is being typed. Found by text alone, without a model. */
export interface EarlierClaim {
  checkId: string;
  claimId: string;
  position: number;
  text: string;
  verdict: Verdict;
  checkedAt: string;
  similarity: number;
}

/** The newest finished check of the same link. */
export interface EarlierLink {
  checkId: string;
  title: string;
  claimCount: number;
  checkedAt: string;
}

export interface EarlierChecks {
  claims: EarlierClaim[];
  link: EarlierLink | null;
}

/** A follow-up question about a finished check, and the answer from the selected model, with optional web search. */
export interface ChatReference {
  kind: 'judge' | 'chart' | 'source' | 'answer';
  title: string;
  url?: string | null;
  modelName?: string | null;
}

export interface ChatMessage {
  id: string;
  question: string;
  files?: SubmittedFile[];
  answer: string;
  sources?: { title: string; url: string }[];
  reference?: ChatReference | null;
  modelName?: string | null;
  createdAt: string;
}

export interface ReviewQuestion {
  /** The position of the claim in `CheckReview.claims`. */
  claim: number;
  question: string;
  options: string[];
}

export interface ReviewAnswer {
  /** A single selection from an older review, or null. */
  claim: number | null;
  /** Positions to check. An omitted list with no other selection means every claim. */
  selectedClaims?: number[] | null;
  /** A null answer checks that claim as written. */
  answers: { claim: number; answer: string | null }[];
  /** What to check instead of the listed claims, in the reader's own words. */
  typedClaim?: string | null;
}

/** What a check asks the reader before it searches. */
export interface CheckReview {
  claims: { position: number; text: string }[];
  /** Whether the reader picks which claims to check. */
  choose: boolean;
  questions: ReviewQuestion[];
  answer?: ReviewAnswer | null;
}

export interface CheckDetail extends Check {
  inputSuggestions?: string[] | null;
  claims: Claim[];
  progress?: TaskProgress[];
  messages?: ChatMessage[];
  review?: CheckReview | null;
}

export interface CorrectionRequest {
  verdict: Verdict;
  reason: string;
  /** Must be a subset of the claim's attached evidence snapshots. */
  evidenceIds: string[];
  /** Optional screenshots supporting the correction. */
  attachments?: Attachment[];
  /** Freshness judgments for cited snapshots, keyed by evidence id. */
  citationFreshness?: Record<string, FreshnessJudgment>;
  /** Version the reviewer saw; a mismatch is rejected as a conflict. */
  expectedVersion: number;
}

export interface CreateCheckInput {
  inputType: InputType;
  text?: string;
  url?: string;
  /** Text checks only; may stand in for typed text. */
  files?: SubmittedFile[];
  /** Two judge ids from `config.judges`; defaults to `config.judges.defaultIds`. */
  judgeIds?: string[];
}

export interface ListChecksParams {
  query?: string;
  status?: 'all' | 'processing' | 'completed' | 'failed';
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const PROCESSING_STAGES = ['queued', 'extracting', 'retrieving', 'assessing', 'completed'] as const;

export function isDeclinedInput(category: Check['inputCategory']): boolean {
  return category === 'prompt_injection' || category === 'spam' || category === 'out_of_scope';
}

export function isTerminal(status: CheckStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'stopped';
}

/** The signed-in user. Matches `AccountOut` in backend/src/claimtrace/api/schemas.py. */
export interface Account {
  id: string;
  username: string;
  avatar?: string | null;
  preferredSourceLanguage?: 'vi' | 'en' | null;
  preferredSearchModelId?: string | null;
  searchInstructions?: string | null;
  searchOptions?: SearchOptions;
  apiProvider?: ApiProvider | null;
  hasApiKey?: boolean;
}

/** OpenAI-compatible Chat Completions endpoint. Credentials never appear in responses or stored check data. */
export interface ApiProvider {
  baseUrl: string;
  model: string;
  judgeModels: [string, string];
  supportsJsonMode: boolean;
}

/** A reader's search limits. `null` keeps the server's setting. */
export interface SearchOptions {
  sourcesPerClaim: number | null;
  searchesPerClaim: number | null;
  searchOutsideList: boolean | null;
  searchDepth: 'basic' | 'advanced' | null;
  claimsPerCheck: number | null;
  blockedDomains: string[] | null;
}
