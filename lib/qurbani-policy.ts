import type { QurbaniCampaignStatus } from "@/lib/qurbani-types";

export function isFinalizedQurbaniCampaign(status: QurbaniCampaignStatus) {
  return status === "settled" || status === "closed";
}

export function canTransitionQurbaniCampaign(
  current: QurbaniCampaignStatus,
  next: QurbaniCampaignStatus,
) {
  if (current === "closed") return false;
  if (current === "settled") return next === "closed";
  return current !== next;
}

export function canDeleteQurbaniCampaign(status: QurbaniCampaignStatus, hasRecords: boolean) {
  return status === "planning" && !hasRecords;
}
