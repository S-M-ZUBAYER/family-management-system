export type WelfareDocumentEntityType = "fund" | "contribution" | "expense" | "request";

export function canDeleteWelfareDocument(entityType: WelfareDocumentEntityType, parentStatus: string | null) {
  if (entityType === "fund") return parentStatus === "active" || parentStatus === "paused";
  if (entityType === "contribution" || entityType === "expense") return parentStatus === "pending";
  return parentStatus === "submitted";
}
