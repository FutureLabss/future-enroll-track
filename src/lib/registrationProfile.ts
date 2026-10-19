export const V2_REQUIRED_PROFILE_FIELDS = [
  'surname', 'first_name', 'date_of_birth', 'sex', 'pwd_status',
  'state_of_residence', 'residential_address', 'highest_educational_qualification',
];

export function missingProfileDefinitions(fields: { key: string }[], profileVersion: number, flowVersion: number) {
  if (flowVersion !== 2 || profileVersion < 2) return [];
  const configured = new Set(fields.map(field => field.key));
  return V2_REQUIRED_PROFILE_FIELDS.filter(key => !configured.has(key));
}
