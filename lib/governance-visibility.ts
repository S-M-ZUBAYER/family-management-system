export function decisionVisibleForPoll(
  decision: { poll_id: string | null },
  visiblePollIds: ReadonlySet<string>,
) {
  return decision.poll_id === null || visiblePollIds.has(decision.poll_id);
}
