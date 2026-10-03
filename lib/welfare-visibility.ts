export function canMemberSeeWelfareContribution(
  record: { fund_id: string; contributor_user_id: string | null; status: string },
  visibleFundIds: ReadonlySet<string>,
  userId: string,
) {
  return record.contributor_user_id === userId || (visibleFundIds.has(record.fund_id) && record.status === "approved");
}

export function canMemberSeeWelfareExpense(
  record: { fund_id: string; status: string },
  visibleFundIds: ReadonlySet<string>,
) {
  return visibleFundIds.has(record.fund_id) && (record.status === "approved" || record.status === "paid");
}

export function canMemberSeeWelfareRequest(
  record: { fund_id: string | null; requester_user_id: string; visibility: string; status: string },
  visibleFundIds: ReadonlySet<string>,
  userId: string,
) {
  return record.requester_user_id === userId || (
    record.visibility === "family" &&
    (record.status === "approved" || record.status === "disbursed") &&
    (!record.fund_id || visibleFundIds.has(record.fund_id))
  );
}

export function canMemberSeeWelfareDocument(
  document: { visibility: string; uploaded_by_user_id: string },
  parentVisible: boolean,
  userId: string,
) {
  return parentVisible && (document.visibility === "family" || document.uploaded_by_user_id === userId);
}
