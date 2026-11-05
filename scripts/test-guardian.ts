import { config } from 'dotenv';
config({ path: '.env.local', override: true, quiet: true });
async function main() {
  const { extractDecisionCandidates, evaluateSimulatedAction } = await import('../src/lib/guardian/core');
  const { getGuardianOverview, createSimulation, reviewSimulation } = await import('../src/lib/guardian/store');
  const sample = extractDecisionCandidates([{ id: 'x', title: 'fix(core): replace parser', body: 'We chose this because it avoids crashes', source_url: 'https://github.com/langchain-ai/langchain/pull/1', record_type: 'pull_request' }]);
  if (sample.length !== 1 || sample[0].evidenceType !== 'candidate') throw new Error('Decision extraction failed');
  if (evaluateSimulatedAction({ isSimulation: true, hasUnreviewedConflict: true, status: 'blocked' }).allowed) throw new Error('Blocked simulation passed gate');
  if (evaluateSimulatedAction({ isSimulation: true, hasUnreviewedConflict: true, status: 'rejected' }).allowed) throw new Error('Rejected simulation passed gate');
  if (!evaluateSimulatedAction({ isSimulation: true, hasUnreviewedConflict: true, status: 'approved' }).allowed) throw new Error('Approved simulation did not pass gate');
  if (evaluateSimulatedAction({ isSimulation: false, hasUnreviewedConflict: false, status: 'approved' }).allowed) throw new Error('Real action incorrectly allowed');
  const before = await getGuardianOverview();
  if (!before.candidates.length) throw new Error('No PR decision candidates in synchronized GitHub records');
  const created = await createSimulation(before.candidates[0].recordId);
  if (created.status !== 'blocked') throw new Error('New simulation was not blocked');
  const blocked = await getGuardianOverview();
  const pending = blocked.actions.find(a => a.id === created.actionId);
  if (!pending || pending.gate.allowed || !pending.conflict?.is_simulation) throw new Error('Conflict gate or simulation labeling failed');
  const reviewed = await reviewSimulation(created.actionId, 'approved', 'automated-test', 'Test review; no external action executed');
  if (reviewed.conflict || reviewed.status !== 'approved') throw new Error('Approval failed');
  const repeat = await reviewSimulation(created.actionId, 'rejected', 'automated-test', 'Should not succeed');
  if (!repeat.conflict) throw new Error('Second review should have been rejected');
  const after = await getGuardianOverview();
  const action = after.actions.find(a => a.id === created.actionId);
  if (!action || !action.gate.allowed || !after.audits.some(a => a.action_id === created.actionId && a.event_type === 'blocked') || !after.audits.some(a => a.action_id === created.actionId && a.event_type === 'approved')) throw new Error('Final gate/audit verification failed');
  console.log(JSON.stringify({ realDecisionCandidates: before.candidates.length, simulatedAction: created.actionId, initiallyBlocked: true, approvedForSimulation: true, duplicateReviewPrevented: true, auditEventsVerified: true, realWorldExecutionAllowed: false }, null, 2));
  console.log('Decision Guardian test passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
