import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import cases from "./data/demo-cases.json" with { type: "json" };
import evaluation from "./data/evaluation.json" with { type: "json" };
import { assess, model } from "./inference/detector.mjs";

/**
 * Build the local ID-only adapter used by the demonstration and endpoint tests.
 * Hosted authentication, persistence, and arbitrary uploads belong to the app.
 */
export function createInferenceServer() {
  return createServer(async (request, response) => {
    const send = (status, data) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(data, null, 2));
    };
    const path = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && path === "/") {
      return send(200, {
        service: "Madar cross-journey detection prototype",
        syntheticOnly: true,
        businessValidation: "Pending Haitham review",
        endpoints: {
          health: "GET /health",
          model: "GET /model",
          cases: "GET /cases",
          assessment: "POST /assess with {\"case_id\":\"CJ-SYN-demo-00001\"}",
        },
      });
    }
    if (request.method === "GET" && path === "/health") {
      return send(200, { status: "ready", modelVersion: model.version, syntheticOnly: true });
    }
    if (request.method === "GET" && path === "/model") {
      return send(200, {
        version: model.version,
        algorithm: model.algorithm,
        features: model.features,
        trees: model.trees.length,
        threshold: model.threshold,
        trainingCases: model.trainCount,
        calibrationCases: model.calibrationCount,
        artifactSha256: evaluation.artifactSha256,
        validation: evaluation.validation,
      });
    }
    if (request.method === "GET" && path === "/cases") {
      return send(
        200,
        cases.map((caseRecord) => ({
          id: caseRecord.id,
          scenario: caseRecord.family,
          events: caseRecord.events.length,
          journeys: [...new Set(caseRecord.events.map((event) => event.journey))],
          synthetic: true,
        })),
      );
    }
    if (request.method === "POST" && path === "/assess") {
      let payload = "";
      try {
        for await (const chunk of request) {
          payload += chunk;
          if (Buffer.byteLength(payload) > 2048) {
            return send(413, { error: "Request too large. Send a bundled synthetic case ID only." });
          }
        }
        const body = JSON.parse(payload);
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== "case_id") ||
          typeof body.case_id !== "string"
        ) {
          return send(400, { error: "Expected only {case_id: supplied synthetic ID}." });
        }
        const caseRecord = cases.find((candidate) => candidate.id === body.case_id);
        if (!caseRecord) {
          return send(404, { error: "Synthetic case not found. Arbitrary records are not accepted." });
        }
        return send(200, {
          assessmentId: crypto.randomUUID(),
          assessedAt: new Date().toISOString(),
          caseId: caseRecord.id,
          synthetic: true,
          businessValidation: "Pending Haitham review",
          ...assess(caseRecord),
        });
      } catch {
        return send(400, { error: "Invalid request JSON." });
      }
    }
    return send(404, { error: "Not found. Open / for the available endpoints." });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MADAR_CROSS_JOURNEY_PORT || 8788);
  createInferenceServer().listen(port, "127.0.0.1", () => {
    console.log(`Madar cross-journey inference ready at http://127.0.0.1:${port}`);
  });
}
