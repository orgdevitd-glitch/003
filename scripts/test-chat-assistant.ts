import type OpenAI from "openai";
import {
  ChatAssistantDependencies,
  getChatAssistantStatus,
  handleChatAssistantMessage
} from "../server/services/chatAssistantService";

type ChatClient = Pick<OpenAI, "beta">;

const originalEnv = {
  enabled: process.env.CHAT_ASSISTANT_ENABLED,
  assistantId: process.env.CHAT_ASSISTANT_ID,
  apiKey: process.env.OPENAI_API_KEY
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, test: () => void | Promise<void>) {
  console.log(`[CHAT_ASSISTANT_TEST] Running: ${name}...`);
  await test();
  console.log(`[CHAT_ASSISTANT_TEST] ✓ Passed\n`);
}

function configureAssistant() {
  process.env.CHAT_ASSISTANT_ENABLED = "true";
  process.env.CHAT_ASSISTANT_ID = '"asst_test"';
  process.env.OPENAI_API_KEY = "'test-key'";
}

function restoreEnvironment() {
  for (const [name, value] of Object.entries({
    CHAT_ASSISTANT_ENABLED: originalEnv.enabled,
    CHAT_ASSISTANT_ID: originalEnv.assistantId,
    OPENAI_API_KEY: originalEnv.apiKey
  })) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function clientThatMustNotBeUsed(): ChatClient {
  return {
    get beta() {
      throw new Error("OpenAI client must not be used for rejected input");
    }
  } as ChatClient;
}

async function main() {
  try {
    await runTest("reports cleaned configuration without exposing the API key", () => {
      process.env.CHAT_ASSISTANT_ENABLED = "'off'";
      process.env.CHAT_ASSISTANT_ID = ' "asst_configured" ';
      process.env.OPENAI_API_KEY = " 'configured-key' ";

      const status = getChatAssistantStatus();

      assert(status.enabled === false, "quoted false-like values must disable the assistant");
      assert(status.hasAssistantId === true, "quoted assistant IDs must be recognized");
      assert(status.assistantId === "asst_configured", "assistant ID must be normalized");
      assert(status.hasOpenAIKey === true, "configured API key must be reported as present");
      assert(!("apiKey" in status), "status response must not expose the API key");

      process.env.CHAT_ASSISTANT_ID = "assistant-without-prefix";
      assert(getChatAssistantStatus().hasAssistantId === false, "malformed assistant IDs must be rejected");
    });

    await runTest("rejects invalid messages before contacting OpenAI", async () => {
      configureAssistant();
      const dependencies: ChatAssistantDependencies = { client: clientThatMustNotBeUsed() };

      const blank = await handleChatAssistantMessage({ message: "   " }, dependencies);
      const tooLong = await handleChatAssistantMessage({ message: "x".repeat(2001) }, dependencies);

      assert(blank.success === false && blank.error?.includes("пустым"), "blank messages must be rejected");
      assert(tooLong.success === false && tooLong.error?.includes("2000"), "oversized messages must be rejected");
    });

    await runTest("polls a new thread and selects the response from the current run", async () => {
      configureAssistant();
      const waits: number[] = [];
      const sentMessages: Array<{ threadId: string; content: string }> = [];
      const runRequests: Array<{ threadId: string; assistantId: string }> = [];
      let retrieveCount = 0;

      const client = {
        beta: {
          threads: {
            create: async () => ({ id: "thread-new" }),
            messages: {
              create: async (threadId: string, message: { content: string }) => {
                sentMessages.push({ threadId, content: message.content });
                return {};
              },
              list: async () => ({
                data: [
                  {
                    role: "assistant",
                    run_id: "run-stale",
                    content: [{ type: "text", text: { value: "stale answer" } }]
                  },
                  {
                    role: "assistant",
                    run_id: "run-current",
                    content: [
                      { type: "text", text: { value: "current " } },
                      { type: "image_file", image_file: { file_id: "file-1" } },
                      { type: "text", text: { value: "answer" } }
                    ]
                  }
                ]
              })
            },
            runs: {
              create: async (threadId: string, request: { assistant_id: string }) => {
                runRequests.push({ threadId, assistantId: request.assistant_id });
                return { id: "run-current", status: "queued" };
              },
              retrieve: async () => {
                retrieveCount += 1;
                return {
                  id: "run-current",
                  status: retrieveCount === 1 ? "in_progress" : "completed"
                };
              }
            }
          }
        }
      } as unknown as ChatClient;

      const result = await handleChatAssistantMessage(
        { message: "Summarize the project" },
        {
          client,
          wait: async (milliseconds) => {
            waits.push(milliseconds);
          }
        }
      );

      assert(result.success === true, "completed run must return success");
      assert(result.threadId === "thread-new", "new thread ID must be returned to the caller");
      assert(result.answer === "current answer", "only text blocks from the current run must be joined");
      assert(sentMessages.length === 1, "one user message must be sent");
      assert(sentMessages[0].threadId === "thread-new", "message must target the created thread");
      assert(sentMessages[0].content === "Summarize the project", "message content must be preserved");
      assert(runRequests[0].assistantId === "asst_test", "normalized assistant ID must start the run");
      assert(waits.length === 2 && waits.every((value) => value === 800), "queued runs must poll at 800ms intervals");
    });

    await runTest("does not retrieve messages when the run requires unsupported actions", async () => {
      configureAssistant();
      let listedMessages = false;
      const client = {
        beta: {
          threads: {
            create: async () => ({ id: "unused" }),
            messages: {
              create: async () => ({}),
              list: async () => {
                listedMessages = true;
                return { data: [] };
              }
            },
            runs: {
              create: async () => ({
                id: "run-action",
                status: "requires_action",
                required_action: { submit_tool_outputs: { tool_calls: [] } }
              }),
              retrieve: async () => {
                throw new Error("completed runs must not be polled");
              }
            }
          }
        }
      } as unknown as ChatClient;

      const result = await handleChatAssistantMessage(
        { message: "Continue", threadId: "thread-existing" },
        { client }
      );

      assert(result.success === false, "requires_action must fail safely");
      assert(listedMessages === false, "messages must not be read from an incomplete run");
    });

    await runTest("bounds polling attempts without real delays", async () => {
      configureAssistant();
      let retrievals = 0;
      let waits = 0;
      const client = {
        beta: {
          threads: {
            create: async () => ({ id: "thread-timeout" }),
            messages: {
              create: async () => ({}),
              list: async () => ({ data: [] })
            },
            runs: {
              create: async () => ({ id: "run-timeout", status: "queued" }),
              retrieve: async () => {
                retrievals += 1;
                return { id: "run-timeout", status: "in_progress" };
              }
            }
          }
        }
      } as unknown as ChatClient;

      const result = await handleChatAssistantMessage(
        { message: "Wait for completion" },
        {
          client,
          maxPollingAttempts: 2,
          wait: async () => {
            waits += 1;
          }
        }
      );

      assert(result.success === false, "polling timeout must return a safe failure");
      assert(retrievals === 2 && waits === 2, "polling must stop at the configured attempt limit");
    });

    console.log("[CHAT_ASSISTANT_TEST] All chat assistant tests passed.");
  } finally {
    restoreEnvironment();
  }
}

main().catch((error) => {
  console.error("[CHAT_ASSISTANT_TEST] FAILED");
  console.error(error);
  process.exitCode = 1;
});
