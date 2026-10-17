import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import cases from "../data/demo-cases.json" with { type: "json" };
import { createInferenceServer } from "../server.mjs";

test("local adapter documents itself and serves fitted inference", async (context) => {
  const server = createInferenceServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = await (await fetch(base)).json();
  assert.equal(root.syntheticOnly, true);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const proof = cases.find((caseRecord) => caseRecord.family === "coordinated_claim_sequence");
  const response = await fetch(`${base}/assess`, {
    method: "POST",
    body: JSON.stringify({ case_id: proof.id }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.modelFlagged, true);
  assert.equal(result.ruleFlagged, false);
  assert.equal((await fetch(`${base}/assess`, {
    method: "POST",
    body: JSON.stringify({ case_id: "REAL-001" }),
  })).status, 404);
});
