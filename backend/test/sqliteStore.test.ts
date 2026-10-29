import assert from "node:assert/strict";
import { before, test } from "node:test";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/lib/infra/db";
import { DocChunk, EntityReview, Startup } from "../src/models";
import { useTempDatabase } from "./helpers";

useTempDatabase();
before(() => EntityReview.init());

test("create, query and update through mongoose", async () => {
  const s = await Startup.create({ name: "Acme Inc", ownerId: "local-user" });
  await Startup.create({ name: "Beta Corp", ownerId: "local-user", deletedAt: new Date() });

  const live = await Startup.find({ ownerId: "local-user", deletedAt: null }).lean();
  assert.deepEqual(live.map((x) => x.name), ["Acme Inc"]);

  const byRegex = (await Startup.findOne({ name: { $regex: "^acme", $options: "i" } }).lean()) as { _id: unknown } | null;
  assert.equal(String(byRegex?._id), String(s._id));

  await Startup.updateOne({ _id: s._id }, { $set: { portfolioReviewStatus: "escalated" } });
  const updated = (await Startup.findById(s._id).lean()) as { portfolioReviewStatus?: string } | null;
  assert.equal(updated?.portfolioReviewStatus, "escalated");

  // The Startup model hides soft-deleted rows unless the filter mentions deletedAt.
  assert.equal(await Startup.countDocuments({ name: { $in: ["Acme Inc", "Beta Corp"] } }), 1);
  assert.equal(await Startup.countDocuments({ deletedAt: { $ne: null } }), 1);
});

test("unique indexes are enforced", async () => {
  const startupId = new mongoose.Types.ObjectId();
  const review = { startupId, entityName: "Ivan", status: "pending", reviewedBy: "u", reviewedByEmail: "u@x" };
  await EntityReview.create(review);
  await assert.rejects(EntityReview.create(review), /duplicate key/i);
});

test("upsert seeds the document from the filter", async () => {
  const startupId = new mongoose.Types.ObjectId();
  await EntityReview.findOneAndUpdate(
    { startupId, entityName: "Johan" },
    { $set: { status: "cleared", reviewedBy: "u", reviewedByEmail: "u@x" } },
    { upsert: true, new: true },
  );
  const doc = (await EntityReview.findOne({ startupId, entityName: "Johan" }).lean()) as { status?: string } | null;
  assert.equal(doc?.status, "cleared");
});

test("$vectorSearch ranks by cosine similarity within the filter", async () => {
  const startupId = new mongoose.Types.ObjectId();
  const otherStartup = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const base = { documentId, filename: "a.pdf", mimeType: "application/pdf" };
  await DocChunk.insertMany([
    { ...base, startupId, chunkIndex: 0, chunkText: "near", embedding: [1, 0] },
    { ...base, startupId, chunkIndex: 1, chunkText: "far", embedding: [0, 1] },
    { ...base, startupId: otherStartup, chunkIndex: 0, chunkText: "other", embedding: [1, 0] },
  ]);

  const hits = await DocChunk.aggregate<{ chunkText: string }>([
    {
      $vectorSearch: {
        index: "rag_vector_index",
        path: "embedding",
        queryVector: [0.9, 0.1],
        numCandidates: 10,
        limit: 2,
        filter: { startupId },
      },
    } as mongoose.PipelineStage,
    { $project: { chunkText: 1 } },
  ]);
  assert.deepEqual(hits.map((h) => h.chunkText), ["near", "far"]);
});

test("data survives closing and reopening the file", async () => {
  await Startup.create({ name: "Persisted Ltd", ownerId: "local-user" });
  await disconnectDb();
  await connectDb();
  const found = await Startup.findOne({ name: "Persisted Ltd" }).lean();
  assert.ok(found);
});
