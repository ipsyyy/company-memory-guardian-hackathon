import { createClient } from '@supabase/supabase-js';
import { extractDecisionCandidates, evaluateSimulatedAction } from './core';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
async function company() {
  const { data, error } = await db.from('github_sync_state').select('company_id').eq('repository', 'langchain-ai/langchain').limit(1).single();
  if (error || !data) throw error ?? new Error('Run npm run sync:github first');
  return data.company_id as string;
}
export async function getGuardianOverview() {
  const companyId = await company();
  const { data: rows, error: recordsError } = await db.from('github_records').select('id,title,body,source_url,record_type').eq('company_id', companyId).order('github_updated_at', { ascending: false }).limit(150);
  if (recordsError) throw recordsError;
  const candidates = extractDecisionCandidates(rows ?? []).slice(0, 25);
  const { data: actions, error: actionsError } = await db.from('guardian_actions').select('id,action_description,status,is_simulation,reviewed_by,reviewed_at,created_at,decision_id,conflict_id').eq('company_id', companyId).order('created_at', { ascending: false }).limit(40);
  if (actionsError) throw actionsError;
  const { data: audits, error: auditError } = await db.from('guardian_audit_log').select('id,action_id,event_type,actor,explanation,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100);
  if (auditError) throw auditError;
  const decisionIds = [...new Set((actions ?? []).map(a => a.decision_id).filter(Boolean))];
  const conflictIds = [...new Set((actions ?? []).map(a => a.conflict_id).filter(Boolean))];
  const { data: decisions, error: decisionError } = decisionIds.length ? await db.from('guardian_decisions').select('id,statement,source_url,evidence_type').eq('company_id', companyId).in('id', decisionIds) : { data: [], error: null };
  if (decisionError) throw decisionError;
  const { data: conflicts, error: conflictError } = conflictIds.length ? await db.from('guardian_conflicts').select('id,explanation,evidence_url,is_simulation').eq('company_id', companyId).in('id', conflictIds) : { data: [], error: null };
  if (conflictError) throw conflictError;
  return { repository: 'langchain-ai/langchain', candidates, actions: (actions ?? []).map(a => ({ ...a, decision: (decisions ?? []).find(d => d.id === a.decision_id) ?? null, conflict: (conflicts ?? []).find(c => c.id === a.conflict_id) ?? null, gate: evaluateSimulatedAction({ isSimulation: a.is_simulation, hasUnreviewedConflict: Boolean(a.conflict_id), status: a.status }) })), audits: audits ?? [], limitations: 'Decision candidates are heuristic proposals from public pull requests, not verified organizational decisions. The conflict in the demo scenario is hypothetical and clearly labeled; no real repository action can execute.' };
}
export async function createSimulation(recordId: string) {
  const companyId = await company();
  const { data: row, error: rowError } = await db.from('github_records').select('id,title,body,source_url,record_type').eq('company_id', companyId).eq('id', recordId).single();
  if (rowError || !row) throw new Error('GitHub record not found');
  const candidate = extractDecisionCandidates([row])[0];
  if (!candidate) throw new Error('Select a pull request with a recognizable proposed change');
  const { data: decision, error: de } = await db.from('guardian_decisions').insert({ company_id: companyId, github_record_id: row.id, statement: candidate.statement, rationale: candidate.rationale, source_url: candidate.sourceUrl, confidence: candidate.confidence, evidence_type: 'candidate' }).select('id').single();
  if (de || !decision) throw de ?? new Error('Could not create candidate');
  // Explicit hypothetical conflict: do NOT claim a real later contradictory source exists.
  const { data: conflict, error: ce } = await db.from('guardian_conflicts').insert({ company_id: companyId, decision_id: decision.id, explanation: 'DEMO SIMULATION: An imaginary new requirement challenges this proposed change. This is a hypothetical safety-gate test, NOT a conflict discovered in LangChain GitHub history.', evidence_url: candidate.sourceUrl, confidence: 'low', is_simulation: true }).select('id').single();
  if (ce || !conflict) throw ce ?? new Error('Could not create simulation conflict');
  const { data: action, error: ae } = await db.from('guardian_actions').insert({ company_id: companyId, decision_id: decision.id, conflict_id: conflict.id, action_description: `SIMULATION ONLY: Apply the approach proposed in PR: ${candidate.statement}`, status: 'blocked', is_simulation: true }).select('id,status').single();
  if (ae || !action) throw ae ?? new Error('Could not create blocked action');
  const { error: logError } = await db.from('guardian_audit_log').insert({ company_id: companyId, action_id: action.id, event_type: 'blocked', actor: 'decision-guardian', explanation: 'Simulated action held for human review due to a hypothetical conflict. No external action executed.' });
  if (logError) throw logError;
  return { actionId: action.id, status: action.status, isSimulation: true };
}
export async function reviewSimulation(id: string, verdict: 'approved' | 'rejected', reviewer: string, explanation: string) {
  const companyId = await company();
  // Conditional update prevents two reviews of the same blocked action from both succeeding.
  const { data: action, error } = await db.from('guardian_actions').update({ status: verdict, reviewed_by: reviewer, reviewed_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id).eq('status', 'blocked').eq('is_simulation', true).select('id,status').maybeSingle();
  if (error) throw error;
  if (!action) return { conflict: true, message: 'Action was not found or has already been reviewed.' };
  const { error: logError } = await db.from('guardian_audit_log').insert({ company_id: companyId, action_id: id, event_type: verdict, actor: reviewer, explanation: explanation || 'Reviewed in the demo dashboard; no external action executed.' });
  if (logError) throw logError;
  return { conflict: false, actionId: id, status: verdict, execution: 'No external action executed.' };
}
