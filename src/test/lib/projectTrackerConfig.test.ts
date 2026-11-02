import { expect, it } from 'vitest';
import { projectTrackerCallback } from '@/config/projectTracker';
it.each(['', 'invalid', 'https://user:pass@tracker.example.com', 'https://tracker.example.com?redirect=evil', 'javascript:alert(1)', 'http://tracker.example.com', 'https://tracker.example.com/path'])('rejects unsafe or missing configuration: %s', value => {
  expect(() => projectTrackerCallback(value)).toThrow();
});
