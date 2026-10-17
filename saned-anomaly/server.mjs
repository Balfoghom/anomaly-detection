/** Local test adapter. Authentication and hosted access control belong to the application. */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import cases from "./data/cases.json" with { type: "json" };
import report from "./data/evaluation.json" with { type: "json" };
import { assess, model } from "./inference/detector.mjs";

/**
 * Create the small ID-only HTTP adapter used by local demos and integration
 * tests. The adapter deliberately refuses arbitrary payloads and real data.
 */
export function createInferenceServer() {
  return createServer(async (request, response) => {
    const send = (status, data) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(data));
    };
    const path = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && path === "/") {
      return send(200, {
        service: "SANED anomaly detection prototype",
        syntheticOnly: true,
        businessValidation: "Pending Haitham review",
        endpoints: {
          health: "GET /health",
          model: "GET /model",
          cases: "GET /cases",
          assessment: "POST /assess with {\"case_id\":\"SYN-demo-00002\"}",
        },
      });
    }
    if (request.method === "GET" && path === "/health") {
      return send(200, {
        status: "ready",
        modelVersion: model.version,
        syntheticOnly: true,
      });
    }
    if (request.method === "GET" && path === "/model") {
      return send(200, {
        version: model.version,
        algorithm: model.algorithm,
        features: model.features,
        trees: model.trees.length,
        threshold: model.threshold,
        trainingHistories: model.trainCount,
        calibrationHistories: model.calibrationCount,
        artifactSha256: report.artifactSha256,
        validation: report.validation,
      });
    }
    if (request.method === "GET" && path === "/cases") {
      return send(
        200,
        cases.map((caseRecord) => ({
          id: caseRecord.id,
          scenario: caseRecord.family,
          events: caseRecord.events.length,
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
            return send(413, {
              error: "Request too large. Send a synthetic case ID only.",
            });
          }
        }
        const body = JSON.parse(payload);
        const invalidBody =
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== "case_id") ||
          typeof body.case_id !== "string";
        if (invalidBody) {
          return send(400, {
            error: "Expected only {case_id: supplied synthetic ID}.",
          });
        }

        const caseRecord = cases.find(
          (candidate) => candidate.id === body.case_id,
        );
        if (!caseRecord) {
          return send(404, {
            error: "Synthetic case not found. Arbitrary records are not accepted.",
          });
        }
        return send(200, {
          assessmentId: crypto.randomUUID(),
          assessedAt: new Date().toISOString(),
          caseId: caseRecord.id,
          synthetic: true,
          validation: "Business validation pending",
          ...assess(caseRecord),
        });
      } catch {
        return send(400, { error: "Invalid request JSON." });
      }
    }
    return send(404, { error: "Not found. Open / for the available endpoints." });
  });
}

// Start a local server only when this file is run directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SANED_AI_PORT || 8787);
  createInferenceServer().listen(port, "127.0.0.1", () => {
    console.log(
      `SANED inference ready at http://127.0.0.1:${port}. Synthetic IDs only.`,
    );
  });
}
