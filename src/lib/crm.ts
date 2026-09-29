export const CRM_STATUSES = ['new_lead', 'contacted', 'interested', 'follow_up', 'registered', 'not_interested'] as const;
export const CRM_QUALIFICATIONS = ['cold', 'warm', 'hot'] as const;

export function qualificationForScore(score: number, warmThreshold = 30, hotThreshold = 70) {
  if (score >= hotThreshold) return 'hot' as const;
  if (score >= warmThreshold) return 'warm' as const;
  return 'cold' as const;
}

function parseRow(line: string) {
  const values: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim()); return values;
}

export function parseLeadCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter(line => line.trim());
  const headers = parseRow(lines.shift() || '').map(x => x.toLowerCase());
  return lines.map(line => {
    const values = parseRow(line); const get = (name: string) => values[headers.indexOf(name)] || '';
    return { full_name: get('full_name') || get('name'), email: get('email'), phone: get('phone'), source: get('source') || 'manual', marketing_consent: ['true', 'yes', '1'].includes(get('marketing_consent').toLowerCase()) };
  }).filter(row => row.full_name && (row.email || row.phone));
}
