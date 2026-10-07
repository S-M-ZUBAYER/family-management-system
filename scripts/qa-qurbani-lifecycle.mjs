// Manual integration QA. Uses only the loopback development server's mock user.
// The server's configured database receives clearly labeled synthetic records.
// No writes occur unless --allow-local-qa-writes is explicitly supplied.
import assert from "node:assert/strict";

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const mode = args[0];
const base = new URL(args.includes("--base-url") ? option("--base-url") : "http://localhost:5174");
const familyId = args.includes("--family-id") ? option("--family-id") : "";
const campaignId = args.includes("--campaign-id") ? option("--campaign-id") : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.ok(["seed", "cleanup", "verify", "finalize-seed", "finalize-verify"].includes(mode), "Use seed, cleanup, verify, finalize-seed or finalize-verify.");
assert.ok(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "QA must target a loopback HTTP dev server.");
assert.ok(uuid.test(familyId), "Supply --family-id for the exact QA family.");
assert.ok(mode === "verify" || args.includes("--allow-local-qa-writes"), "Writes require --allow-local-qa-writes.");
assert.ok(["seed", "finalize-seed"].includes(mode) || uuid.test(campaignId), "Supply --campaign-id for this QA fixture.");

let fixtureId = campaignId;
let checks = 0;
async function request(path, method = "GET", body, expected = 200, selectedFamily = familyId, signedIn = true) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Cookie: `${signedIn ? "__sites_local_auth=1; " : ""}fms_active_family=${selectedFamily}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(payload)}`);
  checks += 1;
  return payload;
}
const create = async (kind, data) => (await request("/api/qurbani/records", "POST", { kind, campaignId: fixtureId, data }, 201)).record;
const edit = async (kind, id, data) => (await request("/api/qurbani/records", "PATCH", { kind, campaignId: fixtureId, recordId: id, data })).record;
const remove = (kind, id, expected = 200) => request("/api/qurbani/records", "DELETE", { kind, campaignId: fixtureId, recordId: id }, expected);
const status = (entity, id, value, expected = 200) => request("/api/qurbani/status", "PATCH", { entity, id, status: value }, expected);
const read = () => request("/api/qurbani");
const rows = (payload, key) => payload[key].filter((row) => row.campaign_id === fixtureId);
const find = (payload, key, id) => {
  const row = rows(payload, key).find((value) => value.id === id);
  assert.ok(row, `${key}: ${id} must persist`);
  return row;
};

try {
  const initial = await read();
  assert.equal(initial.family.id, familyId);
  assert.equal(initial.permissions.canManage, true);
  await request("/api/qurbani", "GET", undefined, 401, familyId, false);

  if (mode === "finalize-seed") {
    const title = `QA Lifecycle Finalization ${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
    const campaign = (await request("/api/qurbani/campaigns", "POST", { title, year: 2029, status: "planning", sharePrice: "0", targetShares: "1", notes: "Synthetic finalization QA; no real payments. Retain the closed campaign as immutable history." }, 201)).campaign;
    fixtureId = campaign.id;
    const task = await create("task", { title: "QA Finalization retained task", category: "cleanup", status: "completed" });
    console.log(JSON.stringify({ result: "PASS", mode, checks, campaignId: fixtureId, title, taskId: task.id, familyId }));
  } else if (mode === "seed") {
    const title = `QA Lifecycle ${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
    const campaignData = { title, year: 2028, sharePrice: "100.25", targetShares: "7", status: "planning", location: "QA Test Location", notes: "Synthetic QA lifecycle fixture; no real payment or animal purchase.", slaughterDate: "2028-06-01", registrationDeadline: "2028-05-30T09:00:00+06:00" };
    await request("/api/qurbani/campaigns", "POST", { ...campaignData, year: 1999 }, 400);
    const campaign = (await request("/api/qurbani/campaigns", "POST", campaignData, 201)).campaign;
    fixtureId = campaign.id;
    console.log(JSON.stringify({ createdCampaign: fixtureId, title, familyId }));
    campaignData.sharePrice = "250.75";
    const editedCampaign = (await request("/api/qurbani/campaigns", "PATCH", { ...campaignData, campaignId: fixtureId })).campaign;
    assert.equal(Number(editedCampaign.share_price), 250.75);

    const animalData = { tagCode: "QA-LINK-20261007", purchasePrice: "100.25", liveWeightKg: "10.50", estimatedMeatKg: "5.75", purchaseDate: "2028-05-29", transportCost: "2.25", feedCost: "1.50", vendorName: "QA Seller", healthStatus: "fit", status: "purchased" };
    const animal = await create("animal", animalData);
    animalData.purchasePrice = "110.50";
    await edit("animal", animal.id, animalData);
    await status("animal", animal.id, "received");
    animalData.status = "received";

    const participantData = { memberName: "QA Lifecycle Participant", shareCount: "1", animalId: animal.id, status: "confirmed" };
    await request("/api/qurbani/records", "POST", { kind: "participant", campaignId: fixtureId, data: { ...participantData, amountPaid: "10" } }, 400);
    const participant = await create("participant", participantData);
    assert.equal(Number(participant.amount_due), 250.75);
    participantData.shareCount = "1.50";
    participantData.memberName += " Edited";
    const editedParticipant = await edit("participant", participant.id, participantData);
    assert.equal(Number(editedParticipant.amount_due), 376.13);
    assert.equal((await remove("animal", animal.id, 409)).code, "QURBANI_ANIMAL_LINKED");
    participantData.animalId = "";
    await edit("participant", participant.id, participantData);

    const collectionData = { transactionType: "collection", category: "share_payment", participantId: participant.id, animalId: animal.id, amount: "200.50", reference: "QA-LIFECYCLE-COLLECTION", transactionDate: "2028-05-30" };
    const collection = await create("transaction", collectionData);
    assert.equal((await remove("animal", animal.id, 409)).code, "QURBANI_ANIMAL_LINKED");
    const refundData = { ...collectionData, transactionType: "refund", amount: "50.25", reference: "QA-LIFECYCLE-REFUND" };
    const refund = await create("transaction", refundData);
    collectionData.amount = "250.75";
    await edit("transaction", collection.id, collectionData);
    refundData.amount = "25.50";
    await edit("transaction", refund.id, refundData);
    assert.equal(Number(find(await read(), "participants", participant.id).amount_paid), 225.25);
    await remove("participant", participant.id, 409);
    await request("/api/qurbani/records", "POST", { kind: "transaction", campaignId: fixtureId, data: { ...refundData, amount: "300" } }, 409);
    const expenseData = { transactionType: "expense", category: "transport", amount: "50.25", animalId: animal.id, reference: "QA-LIFECYCLE-EXPENSE", transactionDate: "2028-05-30" };
    const expense = await create("transaction", expenseData);
    expenseData.amount = "60.50";
    await edit("transaction", expense.id, expenseData);
    for (const [record, data] of [[collection, collectionData], [refund, refundData], [expense, expenseData]]) {
      await edit("transaction", record.id, { ...data, animalId: "" });
    }

    const scheduleData = { animalId: animal.id, sequenceNo: "1", scheduledAt: "2028-06-01T08:30:00+06:00", location: "QA Yard", butcherTeam: "QA Team" };
    const schedule = await create("schedule", scheduleData);
    assert.equal((await remove("animal", animal.id, 409)).code, "QURBANI_ANIMAL_LINKED");
    scheduleData.sequenceNo = "2";
    scheduleData.scheduledAt = "2028-06-01T09:45:00+06:00";
    await edit("schedule", schedule.id, scheduleData);
    await status("schedule", schedule.id, "delayed");
    await status("schedule", schedule.id, "completed");

    const vendorData = { name: "QA Lifecycle Vendor", vendorType: "transport", agreedAmount: "10.25", paidAmount: "5.75" };
    const taskData = { title: "QA Lifecycle Task", category: "logistics", priority: "high", dueAt: "2028-06-01T07:00:00+06:00", assignedTo: "QA Volunteer" };
    const distributionData = { recipientName: "QA Lifecycle Recipient", recipientType: "family", weightKg: "1.25", packageCount: "2" };
    const [vendor, task, distribution] = await Promise.all([create("vendor", vendorData), create("task", taskData), create("distribution", distributionData)]);
    vendorData.name += " Edited";
    vendorData.agreedAmount = "12.50";
    taskData.title += " Edited";
    taskData.dueAt = "2028-06-01T07:15:00+06:00";
    distributionData.weightKg = "2.75";
    distributionData.packageCount = "3";
    distributionData.collectedAt = "2028-06-01T12:30:00+06:00";
    await Promise.all([edit("vendor", vendor.id, vendorData), edit("task", task.id, taskData), edit("distribution", distribution.id, distributionData)]);
    await Promise.all([status("vendor", vendor.id, "confirmed"), status("task", task.id, "in_progress")]);
    await Promise.all([status("vendor", vendor.id, "completed"), status("task", task.id, "completed")]);

    participantData.animalId = animal.id;
    await edit("participant", participant.id, participantData);
    for (const [record, data] of [[collection, collectionData], [refund, refundData], [expense, expenseData]]) await edit("transaction", record.id, data);
    const unlinked = await create("animal", { tagCode: "QA-UNLINKED-API", purchasePrice: "0" });
    await remove("animal", unlinked.id);
    const uiAnimal = await create("animal", { tagCode: "QA-UNLINKED-UI", purchasePrice: "0" });

    const otherFamily = args.includes("--other-family-id") ? option("--other-family-id") : "";
    if (otherFamily) {
      assert.ok(uuid.test(otherFamily) && otherFamily !== familyId);
      const other = await request("/api/qurbani", "GET", undefined, 200, otherFamily);
      assert.equal(other.family.id, otherFamily);
      assert.ok(!other.campaigns.some((row) => row.id === fixtureId));
      await request("/api/qurbani/records", "PATCH", { kind: "animal", campaignId: fixtureId, recordId: animal.id, data: animalData }, 404, otherFamily);
      await request("/api/qurbani/records", "POST", { kind: "task", campaignId: fixtureId, data: taskData }, 404, otherFamily);
    }
    const persisted = await read();
    assert.equal(find(persisted, "participants", participant.id).animal_id, animal.id);
    assert.equal(Number(find(persisted, "participants", participant.id).amount_paid), 225.25);
    assert.equal(Number(find(persisted, "animals", animal.id).purchase_price), 110.50);
    assert.equal(find(persisted, "schedules", schedule.id).scheduled_at, "2028-06-01T03:45:00+00:00");
    assert.equal(find(persisted, "tasks", task.id).status, "completed");
    assert.equal(Number(find(persisted, "distributions", distribution.id).weight_kg), 2.75);
    console.log(JSON.stringify({ result: "PASS", mode, checks, campaignId: fixtureId, title, familyId, uiAnimalId: uiAnimal.id, rows: Object.fromEntries(["participants", "animals", "transactions", "vendors", "schedules", "tasks", "distributions"].map((key) => [key, rows(persisted, key).length])) }));
  } else {
    const campaign = initial.campaigns.find((row) => row.id === fixtureId);
    assert.ok(campaign?.title.startsWith("QA Lifecycle "), "Only this runner's QA Lifecycle campaign may be targeted.");
    if (mode === "cleanup") {
      assert.equal(campaign.status, "planning", "Finalized QA campaigns are retained by design.");
      const transactions = rows(initial, "transactions").sort((a, b) => Number(b.transaction_type === "refund") - Number(a.transaction_type === "refund"));
      for (const record of transactions) await remove("transaction", record.id);
      for (const [key, kind] of [["participants", "participant"], ["schedules", "schedule"], ["vendors", "vendor"], ["tasks", "task"], ["distributions", "distribution"], ["animals", "animal"]]) {
        for (const record of rows(initial, key)) await remove(kind, record.id);
      }
      await request("/api/qurbani/campaigns", "DELETE", { campaignId: fixtureId });
      const after = await read();
      assert.ok(!after.campaigns.some((row) => row.id === fixtureId));
      for (const key of ["participants", "animals", "transactions", "vendors", "schedules", "tasks", "distributions"]) assert.equal(rows(after, key).length, 0);
      // Cleanup cannot modify any unrelated campaign or retained fixture.
      for (const key of ["campaigns", "participants", "animals", "transactions", "vendors", "schedules", "tasks", "distributions"]) {
        const unrelated = (payload) => payload[key].filter((row) => key === "campaigns" ? row.id !== fixtureId : row.campaign_id !== fixtureId);
        assert.deepEqual(unrelated(after), unrelated(initial), `${key}: unrelated records must remain untouched`);
      }
    } else if (mode === "finalize-verify") {
      assert.ok(["settled", "closed"].includes(campaign.status), "Complete browser settlement/close before running verification.");
      const task = rows(initial, "tasks").find((row) => row.title === "QA Finalization retained task");
      assert.ok(task);
      for (const kind of ["participant", "animal", "transaction", "vendor", "schedule", "task", "distribution"]) {
        await request("/api/qurbani/records", "POST", { kind, campaignId: fixtureId, data: {} }, 409);
        await request("/api/qurbani/records", "PATCH", { kind, campaignId: fixtureId, recordId: task.id, data: {} }, 409);
        await remove(kind, task.id, 409);
      }
      await status("task", task.id, "todo", 409);
      await status("campaign", fixtureId, "planning", 409);
      await request("/api/qurbani/campaigns", "DELETE", { campaignId: fixtureId }, 409);
      await request("/api/qurbani/campaigns", "PATCH", { campaignId: fixtureId, title: "QA forbidden edit", year: 2029, targetShares: "1", sharePrice: "0", status: "closed" }, 409);
      assert.deepEqual(rows(await read(), "tasks"), rows(initial, "tasks"));
    }
    console.log(JSON.stringify({ result: "PASS", mode, checks, campaignId: fixtureId, familyId, status: campaign.status }));
  }
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", mode, checks, campaignId: fixtureId || null, familyId, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
