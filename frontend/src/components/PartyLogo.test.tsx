import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PartyLogo } from './PartyLogo';

it('falls back to the chart colour if a party image fails to load', () => {
  const { container } = render(<PartyLogo party={{ country: 'CA', id: 'ca-test', name: 'Test', aliases: [], asset: 'test.png' }} color="#4338ca" />);
  const image = container.querySelector('img');
  expect(image).not.toBeNull();
  fireEvent.error(image!);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[style]')).toHaveStyle({ backgroundColor: '#4338ca' });
});
