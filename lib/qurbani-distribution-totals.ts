import type { QurbaniDistribution } from "@/lib/qurbani-types";

type DistributionAmount = Pick<QurbaniDistribution, "weight_kg" | "package_count" | "collected_at">;

export function qurbaniDistributionTotals(records: DistributionAmount[]) {
  let allocatedHundredths = 0;
  let collectedHundredths = 0;
  let allocatedPackages = 0;
  let collectedPackages = 0;

  for (const record of records) {
    const weight = Number(record.weight_kg);
    const amount = Number.isFinite(weight) ? Math.round(weight * 100) : 0;
    allocatedHundredths += amount;
    allocatedPackages += record.package_count;
    if (record.collected_at) {
      collectedHundredths += amount;
      collectedPackages += record.package_count;
    }
  }

  return {
    allocatedKg: allocatedHundredths / 100,
    collectedKg: collectedHundredths / 100,
    pendingKg: (allocatedHundredths - collectedHundredths) / 100,
    allocatedPackages,
    collectedPackages,
    pendingPackages: allocatedPackages - collectedPackages,
  };
}
