export interface CSVContact {
  email: string;
  name: string;
}

export function parseCSV(text: string): CSVContact[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const firstRow = lines[0].toLowerCase();
  const isHeader = firstRow.includes('email') || firstRow.includes('name');
  const dataLines = isHeader ? lines.slice(1) : lines;

  let emailCol = 0;
  let nameCol = 1;

  if (isHeader) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const eIdx = headers.findIndex(h => h === 'email' || h === 'e-mail');
    const nIdx = headers.findIndex(h => h === 'name' || h === 'full_name' || h === 'fullname');
    if (eIdx !== -1) emailCol = eIdx;
    if (nIdx !== -1) nameCol = nIdx;
  }

  const result: CSVContact[] = [];
  for (const line of dataLines) {
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const email = cols[emailCol];
    const name = cols[nameCol] || '';
    if (email && email.includes('@')) {
      result.push({ email: email.toLowerCase(), name });
    }
  }
  return result;
}
