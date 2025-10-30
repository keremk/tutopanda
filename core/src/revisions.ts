import type { RevisionId } from './types.js';

export function nextRevisionId(current: RevisionId | null | undefined): RevisionId {
  if (!current) {
    return 'rev-0001';
  }
  const match = /^rev-(\d+)$/.exec(current);
  const nextNumber = match ? parseInt(match[1], 10) + 1 : 1;
  const padded = String(nextNumber).padStart(4, '0');
  return `rev-${padded}`;
}
