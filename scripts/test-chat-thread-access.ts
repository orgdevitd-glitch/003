import {
  ChatThreadAccessError,
  assertChatThreadAccess,
  registerChatThread,
  revokeChatThreadsForSession
} from "../server/services/chatAssistantService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectDenied(fn: () => void, message: string): void {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof ChatThreadAccessError, message);
}

const firstSession = "session-owner";
const secondSession = "session-other";
const threadId = "thread-private";

registerChatThread(threadId, firstSession);
assertChatThreadAccess(threadId, firstSession);

expectDenied(
  () => assertChatThreadAccess(threadId, secondSession),
  "A different authenticated session must not access the thread"
);
expectDenied(
  () => registerChatThread(threadId, secondSession),
  "A different authenticated session must not claim an owned thread"
);
expectDenied(
  () => assertChatThreadAccess("thread-unknown", firstSession),
  "An unregistered client-supplied thread must be rejected"
);

revokeChatThreadsForSession(firstSession);
expectDenied(
  () => assertChatThreadAccess(threadId, firstSession),
  "Logging out must revoke access to the session's threads"
);

console.log("Chat thread session isolation tests passed.");
