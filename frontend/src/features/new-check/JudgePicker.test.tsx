import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config } from '../../config';
import { JudgePicker } from './JudgePicker';

function Harness() {
  const [ids, setIds] = useState<string[]>([...config.judges.defaultIds]);
  return <JudgePicker value={ids} onChange={setIds} />;
}

describe('JudgePicker', () => {
  it('starts with the default pair and swaps out the older pick when a third judge is chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Judges: GPT Luna + Claude Haiku 5.5' }));
    await user.click(screen.getByRole('checkbox', { name: 'DeepSeek Flash V4.1' }));

    expect(screen.getByRole('button', { name: 'Judges: Claude Haiku 5.5 + DeepSeek Flash V4.1' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'GPT Luna' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Claude Haiku 5.5' })).toBeChecked();
  });

  it('keeps exactly two judges when a selected judge is clicked again', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Judges: GPT Luna + Claude Haiku 5.5' }));
    await user.click(screen.getByRole('checkbox', { name: 'Claude Haiku 5.5' }));

    expect(screen.getByRole('button', { name: 'Judges: GPT Luna + Claude Haiku 5.5' })).toBeInTheDocument();
  });

  it('lists every configured judge, including Qwen and MiniMax', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Judges: GPT Luna + Claude Haiku 5.5' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(config.judges.options.length);
    expect(screen.getByRole('checkbox', { name: 'Qwen3.8 Flash' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'MiniMax M3.1 Flash' })).toBeInTheDocument();
  });
});
