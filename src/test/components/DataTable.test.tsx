import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '@/components/shared/DataTable';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'status', header: 'Status' },
];

const data = [
  { name: 'Alice Johnson', email: 'alice@example.com', status: 'active' },
  { name: 'Bob Smith', email: 'bob@example.com', status: 'pending' },
  { name: 'Carol White', email: 'carol@example.com', status: 'active' },
];

describe('DataTable', () => {
  it('renders all rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol White')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows empty message when data is empty', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No students found" />);
    expect(screen.getByText('No students found')).toBeInTheDocument();
  });

  it('shows default empty message', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('filters rows by search input', () => {
    render(<DataTable columns={columns} data={data} searchable />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'alice' } });
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol White')).not.toBeInTheDocument();
  });

  it('filter is case-insensitive', () => {
    render(<DataTable columns={columns} data={data} searchable />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'ALICE' } });
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('shows empty message when search matches nothing', () => {
    render(<DataTable columns={columns} data={data} searchable emptyMessage="No results" />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('does not show search input when searchable is false', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('calls onRowClick with the row item when clicked', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('uses custom render function for cells', () => {
    const customColumns = [
      { key: 'name', header: 'Name', render: (r: any) => <strong data-testid="custom">{r.name.toUpperCase()}</strong> },
    ];
    render(<DataTable columns={customColumns} data={[data[0]]} />);
    expect(screen.getByTestId('custom')).toHaveTextContent('ALICE JOHNSON');
  });

  it('paginates when data exceeds pageSize', () => {
    const big = Array.from({ length: 20 }, (_, i) => ({
      name: `Student ${i + 1}`, email: `s${i + 1}@test.com`, status: 'active',
    }));
    render(<DataTable columns={columns} data={big} pageSize={5} />);
    expect(screen.getByText('Student 1')).toBeInTheDocument();
    expect(screen.queryByText('Student 6')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1–5 of 20/)).toBeInTheDocument();
  });

  it('navigates to next page', () => {
    const big = Array.from({ length: 20 }, (_, i) => ({
      name: `Student ${i + 1}`, email: `s${i + 1}@test.com`, status: 'active',
    }));
    render(<DataTable columns={columns} data={big} pageSize={5} />);
    fireEvent.click(screen.getAllByRole('button').find(b => b.querySelector('svg'))!);
    // After clicking next (second icon button), page 2 should show
    // The prev button is disabled, next is the second button
    const buttons = screen.getAllByRole('button');
    const nextBtn = buttons[buttons.length - 1];
    fireEvent.click(nextBtn);
    expect(screen.getByText('Student 6')).toBeInTheDocument();
  });
});
