import OpenAI from "openai";
import { cleanEnv, isEnabled, isValidAssistantId } from "./envHelper";

export interface ChatAssistantMessageInput {
  message: string;
  threadId?: string;
}

export interface ChatAssistantMessageResponse {
  success: boolean;
  answer?: string;
  threadId?: string;
  error?: string;
}

export function getChatAssistantStatus() {
  const enabled = isEnabled(process.env.CHAT_ASSISTANT_ENABLED);
  const assistantId = cleanEnv(process.env.CHAT_ASSISTANT_ID) || null;
  const apiKey = cleanEnv(process.env.OPENAI_API_KEY);
  const hasAssistantId = !!assistantId && isValidAssistantId(assistantId);

  return {
    success: true,
    enabled,
    hasOpenAIKey: !!apiKey,
    hasAssistantId,
    assistantId
  };
}

export async function handleChatAssistantMessage(input: ChatAssistantMessageInput): Promise<ChatAssistantMessageResponse> {
  const status = getChatAssistantStatus();

  console.log("[ChatAssistant-Diagnose] Checking environment variables configuration:");
  console.log(`- CHAT_ASSISTANT_ENABLED: ${status.enabled}`);
  console.log(`- hasOpenAIKey: ${status.hasOpenAIKey}`);
  console.log(`- hasAssistantId: ${status.hasAssistantId}`);
  console.log(`- assistantId: "${status.assistantId}"`);

  if (!status.enabled) {
    console.warn("[ChatAssistant] HandleMessage called but assistant is disabled.");
    return {
      success: false,
      error: "Чат-ассистент временно отключен."
    };
  }

  if (!status.hasAssistantId) {
    const rawId = process.env.CHAT_ASSISTANT_ID;
    if (!cleanEnv(rawId)) {
      console.error("[ChatAssistant] CHAT_ASSISTANT_ID is missing or cleared.");
    } else {
      console.error(`[ChatAssistant] CHAT_ASSISTANT_ID is invalid (must start with "asst_"): "${rawId}"`);
    }
    return {
      success: false,
      error: "Помощник временно недоступен. Обратитесь к администратору."
    };
  }

  if (!status.hasOpenAIKey) {
    console.error("[ChatAssistant] OPENAI_API_KEY is missing or cleared.");
    return {
      success: false,
      error: "Помощник временно недоступен. Обратитесь к администратору."
    };
  }

  // Validate message
  if (!input.message || typeof input.message !== "string" || input.message.trim().length === 0) {
    return {
      success: false,
      error: "Сообщение не может быть пустым."
    };
  }

  if (input.message.length > 2000) {
    return {
      success: false,
      error: "Сообщение слишком длинное (максимум 2000 символов)."
    };
  }

  try {
    const openai = new OpenAI({ apiKey: cleanEnv(process.env.OPENAI_API_KEY) });

    // Thread creation or recovery
    let threadId = input.threadId?.trim();
    if (!threadId) {
      console.log("[ChatAssistant] No threadId provided. Creating a new thread...");
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      console.log(`[ChatAssistant] New thread created successfully: ${threadId}`);
    } else {
      console.log(`[ChatAssistant] Appending to existing thread: ${threadId}`);
    }

    // Add user message to the thread
    console.log("[ChatAssistant] Sending user message to OpenAI...");
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: input.message,
    });

    // Start a run using the configured assistantId
    console.log(`[ChatAssistant] Running thread ${threadId} with assistant ${status.assistantId}...`);
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: status.assistantId!,
    });

    console.log(`[ChatAssistant] Run started. ID: ${run.id}. Status: ${run.status}`);

    // Polling mechanics
    let attempts = 0;
    while (["queued", "in_progress", "cancelling"].includes(run.status)) {
      attempts++;
      if (attempts > 50) { // Limit polling for ~40 seconds maximum
        throw new Error("Timeout waiting for Assistant response");
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });
    }

    console.log(`[ChatAssistant] Run completed polling. End Status: ${run.status}`);

    if (run.status === "requires_action") {
      console.error(`[ChatAssistant] Run requires action/tools. Tool calls:`, run.required_action?.submit_tool_outputs?.tool_calls);
      return {
        success: false,
        error: "Помощник временно недоступен. Попробуйте позже или обратитесь к администратору."
      };
    }

    if (run.status !== "completed") {
      console.error(`[ChatAssistant] OpenAI run status was: ${run.status}. Code/Error:`, run.last_error);
      return {
        success: false,
        error: "Помощник временно недоступен. Попробуйте позже или обратитесь к администратору."
      };
    }

    // Retrieve messages
    console.log("[ChatAssistant] Retrieving response messages...");
    const messages = await openai.beta.threads.messages.list(threadId);

    const resultMessage = messages.data.find(
      (m) => m.role === "assistant" && m.run_id === run.id
    ) || messages.data.find(
      (m) => m.role === "assistant"
    );

    let answerText = "";
    if (resultMessage?.content) {
      for (const block of resultMessage.content) {
        if (block.type === "text") {
          answerText += block.text.value;
        }
      }
    }

    // If answer is empty or has a fallback error
    if (!answerText.trim()) {
      console.error("[ChatAssistant] OpenAI responded with empty message content or unsupported block types");
      return {
        success: false,
        error: "Не удалось получить ответ от ассистента."
      };
    }

    console.log("[ChatAssistant] Successfully retrieved assistant answer text.");
    return {
      success: true,
      answer: answerText,
      threadId: threadId
    };

  } catch (error: any) {
    console.error("[ChatAssistant] Caught exception during execution:", error);
    // Be precise about well-known OpenAI error codes
    if (error.status === 401) {
      console.error("[ChatAssistant] Authentication failed. Please check your OPENAI_API_KEY.");
    } else if (error.status === 404) {
      console.error("[ChatAssistant] Resource not found. Verify if the threadId or assistant_id is correct.");
    } else if (error.status === 429) {
      console.error("[ChatAssistant] Rate limited by OpenAI.");
    }
    return {
      success: false,
      error: "Помощник временно недоступен. Попробуйте позже или обратитесь к администратору."
    };
  }
}
