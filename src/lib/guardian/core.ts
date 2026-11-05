export type Candidate = { recordId: string; title: string; statement: string; rationale: string | null; sourceUrl: string; confidence: 'low' | 'medium'; evidenceType: 'candidate' };
export type RecordInput = { id: string; title: string; body: string | null; source_url: string; record_type: string };
const reasoning = /\b(because|due to|trade.?off|instead of|rationale|we decided|we chose|the reason|to avoid|in order to)\b/i;
const proposal = /\b(propos(?:e|ed|al)|implement|change|fix|remove|replace|support|deprecat|migrat|decid|choos|switch)\b/i;
export function extractDecisionCandidates(rows: RecordInput[]): Candidate[] {
  return rows.filter(r => r.record_type === 'pull_request' && proposal.test(`${r.title} ${r.body ?? ''}`))
    .map(r => ({ recordId: r.id, title: r.title, statement: r.title.slice(0, 300), rationale: reasoning.test(r.body ?? '') ? (r.body ?? '').slice(0, 900) : null, sourceUrl: r.source_url, confidence: (reasoning.test(r.body ?? '') ? 'medium' : 'low') as 'medium' | 'low', evidenceType: 'candidate' as const }));
}
export function evaluateSimulatedAction(input: { isSimulation: boolean; hasUnreviewedConflict: boolean; status: 'blocked' | 'approved' | 'rejected' }) {
  if (!input.isSimulation) return { allowed: false, reason: 'Real-world execution is not supported.' };
  if (input.status === 'rejected') return { allowed: false, reason: 'Reviewer rejected this simulated action.' };
  if (input.hasUnreviewedConflict && input.status !== 'approved') return { allowed: false, reason: 'Human review required: potentially conflicting evidence.' };
  return { allowed: input.status === 'approved', reason: input.status === 'approved' ? 'Approved for simulation only; no external action executed.' : 'Approval required.' };
}
