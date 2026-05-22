import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@/components/shared/StatusBadge';

describe('StatusBadge', () => {
  const knownStatuses = ['pending', 'active', 'overdue', 'completed', 'paid', 'cancelled', 'draft'];

  it.each(knownStatuses)('renders "%s" status text', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('applies success style for active status', () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText('active');
    expect(badge.className).toMatch(/success/);
  });

  it('applies success style for paid status', () => {
    render(<StatusBadge status="paid" />);
    expect(screen.getByText('paid').className).toMatch(/success/);
  });

  it('applies warning style for pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('pending').className).toMatch(/warning/);
  });

  it('applies destructive style for overdue status', () => {
    render(<StatusBadge status="overdue" />);
    expect(screen.getByText('overdue').className).toMatch(/destructive/);
  });

  it('renders unknown status without crashing', () => {
    render(<StatusBadge status="unknown_status" />);
    expect(screen.getByText('unknown_status')).toBeInTheDocument();
  });
});
