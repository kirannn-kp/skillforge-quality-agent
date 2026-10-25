// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checklist, MeasurementChart, PlaceholderAvatarRenderer } from '../src/components';
import { initialState } from '../server/engine';
import { checklist } from '../shared/domain';
import { scenarios } from '../shared/scenarios';

afterEach(cleanup);
describe('accessible key UI components', () => {
  it('shows missing checks without implying an approval exists', () => {
    render(<Checklist items={checklist(initialState())} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0/13')).toBeVisible();
    expect(screen.getByText('Human approval received')).toBeVisible();
  });
  it('exposes actual measurement values in the chart accessible description', () => {
    render(<MeasurementChart data={scenarios['Q-2048'].measurements} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/37, 39, 38, 40, 62, 68, 71, 66 N/);
  });
  it.each(['upper', 'lower'] as const)('marks actual %s limit violations, not fixed sample positions', direction => {
    const data = { ...scenarios['Q-2048'].measurements, limitDirection: direction, values: [51, 50, 49, 52, 48, 50, 51, 49] };
    const { container } = render(<MeasurementChart data={data} />);
    expect(screen.getByText(`50 N ${direction} limit`)).toBeVisible();
    expect([...container.querySelectorAll('circle')].map(circle => circle.getAttribute('class')))
      .toEqual(direction === 'upper' ?
        ['anomaly-dot', 'normal-dot', 'normal-dot', 'anomaly-dot', 'normal-dot', 'normal-dot', 'anomaly-dot', 'normal-dot'] :
        ['normal-dot', 'normal-dot', 'anomaly-dot', 'normal-dot', 'anomaly-dot', 'normal-dot', 'normal-dot', 'anomaly-dot']);
  });
  it('labels the avatar as a placeholder with its current state', () => {
    render(<PlaceholderAvatarRenderer status="Waiting for approval" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Not a live avatar/);
    expect(screen.getByText(/Placeholder avatar/)).toBeVisible();
  });
});
