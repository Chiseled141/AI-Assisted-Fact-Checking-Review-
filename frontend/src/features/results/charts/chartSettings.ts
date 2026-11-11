// Sizes and colors for each chart and map. Data rules are in backend/config/settings.py.

export const priceChart = { height: 400 };

export const barChart = {
  categoryColors: ['#4338ca', '#0f766e', '#c2410c', '#0369a1', '#be185d', '#a16207', '#7e22ce', '#4d7c0f'],
};

/** A table a quote came from: the quoted row in indigo, its neighbours in grey. Green and red stay with verdicts. */
export const quoteChart = { quotedColor: '#4338ca', otherColor: '#c5c9ce' };

export const populationPyramid = { height: 480, menColor: '#4338ca', womenColor: '#c2410c' };

export const seatChart = {
  /** Parties have no shared colors worldwide, so these go by size. */
  partyColors: ['#c2410c', '#4338ca', '#0f766e', '#a16207', '#be185d', '#0369a1', '#65a30d', '#7c3aed'],
  /** Only for seats that could not be verified in the sources. */
  unreportedColor: '#d1d5db',
};

export const electionMap = {
  height: 400,
  phoneHeight: 240,
  totalStates: 51, // The 50 states and the District of Columbia.
  /** The two US parties keep the colors US readers expect, the one place red and blue mean a party. */
  republicanColor: '#c40401',
  democraticColor: '#0200d0',
  republicanWords: /republican|gop|cộng hòa/,
  democraticWords: /democrat|dân chủ/,
  otherColors: ['#c2410c', '#0f766e', '#a16207', '#be185d'],
  /** Only for states with no verified result. */
  unverifiedColor: '#d1d5db',
};

export const countryMap = {
  /** One color for each country being compared, the first being the map's highlight. */
  compareColors: ['#c2410c', '#4338ca', '#0f766e', '#a16207', '#be185d'],
  islandLabel: { fontSize: '10px', fontWeight: '500', textOutline: '2px #fff' },
};

export const locationMap = {
  /** Hoàng Sa and Trường Sa, when a regional world map shows them as context beside a claim about somewhere else. */
  contextIslandLabel: { fontSize: '9px', fontWeight: '400', textOutline: '1.5px #fff' },
  /** The same two groups when the claim names them, or on a Vietnam map. */
  namedIslandLabel: { fontSize: '12px', fontWeight: '500', textOutline: '2.5px #fff' },
};
