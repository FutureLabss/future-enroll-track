import { describe, it, expect } from 'vitest';
import { parseCSV } from '@/lib/csv';

describe('parseCSV', () => {
  describe('with header row', () => {
    it('parses email and name columns', () => {
      const result = parseCSV('email,name\njohn@example.com,John Smith');
      expect(result).toEqual([{ email: 'john@example.com', name: 'John Smith' }]);
    });

    it('handles name,email column order', () => {
      const result = parseCSV('name,email\nJane Doe,jane@example.com');
      expect(result).toEqual([{ email: 'jane@example.com', name: 'Jane Doe' }]);
    });

    it('parses multiple rows', () => {
      const csv = 'email,name\nalice@test.com,Alice\nbob@test.com,Bob';
      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('alice@test.com');
      expect(result[1].email).toBe('bob@test.com');
    });

    it('lowercases emails', () => {
      const result = parseCSV('email,name\nALICE@TEST.COM,Alice');
      expect(result[0].email).toBe('alice@test.com');
    });

    it('strips quotes from values', () => {
      const result = parseCSV('email,name\n"carol@test.com","Carol Jones"');
      expect(result[0].email).toBe('carol@test.com');
      expect(result[0].name).toBe('Carol Jones');
    });

    it('name is empty string when only email column', () => {
      const result = parseCSV('email\nfoo@bar.com');
      expect(result[0].name).toBe('');
    });

    it('handles full_name as the name column header', () => {
      const result = parseCSV('email,full_name\ndan@test.com,Dan Brown');
      expect(result[0].name).toBe('Dan Brown');
    });
  });

  describe('without header row', () => {
    it('treats first column as email', () => {
      const result = parseCSV('eve@test.com,Eve Adams');
      expect(result[0].email).toBe('eve@test.com');
      expect(result[0].name).toBe('Eve Adams');
    });

    it('accepts a single-column list of emails', () => {
      const result = parseCSV('a@test.com\nb@test.com');
      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('a@test.com');
    });
  });

  describe('filtering', () => {
    it('skips rows with no @ in the email column', () => {
      const result = parseCSV('email,name\nnot-an-email,Name\nreal@test.com,Real');
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('real@test.com');
    });

    it('skips blank lines', () => {
      const result = parseCSV('email\na@test.com\n\nb@test.com\n');
      expect(result).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
      expect(parseCSV('')).toEqual([]);
    });

    it('returns empty array when all rows are invalid', () => {
      expect(parseCSV('email\nnot-valid\nalso-not-valid')).toEqual([]);
    });
  });
});
