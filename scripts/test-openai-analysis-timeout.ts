import assert from "node:assert/strict";
import { waitForRun } from "../server/services/openaiAnalysisService";

async function main() {
  let retrieveCalls = 0;
  const stuckClient = {
    beta: {
      threads: {
        runs: {
          retrieve: async () => {
            retrieveCalls++;
            return { status: "in_progress" };
          }
        }
      }
    }
  };

  await assert.rejects(
    waitForRun(stuckClient as any, "thread-1", "run-1", {
      timeoutMs: 0,
      pollIntervalMs: 0
    }),
    /timed out/,
    "A run that never leaves in_progress must be rejected"
  );
  assert.equal(retrieveCalls, 1, "Timeout should stop polling immediately at the deadline");

  const completedClient = {
    beta: {
      threads: {
        runs: {
          retrieve: async () => ({ status: "completed" })
        }
      }
    }
  };

  const completedRun = await waitForRun(
    completedClient as any,
    "thread-2",
    "run-2",
    { timeoutMs: 0, pollIntervalMs: 0 }
  );
  assert.equal(completedRun.status, "completed", "Completed runs should still return normally");

  console.log("OpenAI analysis timeout regression tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
