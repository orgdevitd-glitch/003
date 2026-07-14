import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export function ChatAssistantWidget() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history and threadId from sessionStorage on count
  useEffect(() => {
    try {
      const savedMessages = sessionStorage.getItem("chat_assistant_messages");
      const savedThreadId = sessionStorage.getItem("chat_assistant_thread_id");

      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        // Welcome message
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            text: "Здравствуйте. Я помогу разобраться с проектами, показателями и анализом. Напишите вопрос, и я постараюсь ответить по делу.",
            timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }

      if (savedThreadId) {
        setThreadId(savedThreadId);
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
    }
  }, []);

  // Save changes to sessionStorage
  const saveToSession = (newMessages: Message[], newThreadId: string | null) => {
    try {
      sessionStorage.setItem("chat_assistant_messages", JSON.stringify(newMessages));
      if (newThreadId) {
        sessionStorage.setItem("chat_assistant_thread_id", newThreadId);
      }
    } catch (e) {
      console.error("Failed to save session state", e);
    }
  };

  // Scroll to bottom when messages or open state changes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;

    // Optional limitation: 2000 chars
    if (trimmedInput.length > 2000) {
      setError("Сообщение слишком длинное (максимум 2000 символов).");
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmedInput,
      timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    saveToSession(updatedMessages, threadId);

    try {
      const response = await fetch("/api/chat-assistant/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedInput,
          threadId: threadId || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Произошла ошибка при отправке запроса.");
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.answer || "Ответ отсутствует.",
        timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      };

      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      if (data.threadId) {
        setThreadId(data.threadId);
      }
      saveToSession(finalMessages, data.threadId || threadId);

    } catch (err: any) {
      console.error("[ChatAssistantWidget] Error submitting message:", err);
      setError("Помощник временно недоступен. Попробуйте позже или обратитесь к администратору.");
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    const welcomeMsg: Message = {
      id: "welcome",
      role: "assistant",
      text: "Здравствуйте. Я помогу разобраться с проектами, показателями и анализом. Напишите вопрос, и я постараюсь ответить по делу.",
      timestamp: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    };
    setMessages([welcomeMsg]);
    setThreadId(null);
    setError(null);
    sessionStorage.removeItem("chat_assistant_messages");
    sessionStorage.removeItem("chat_assistant_thread_id");
  };

  return (
    <div id="chat-assistant-widget-root" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end print:hidden max-w-[calc(100vw-32px)] sm:max-w-none">
      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="chat-assistant-window"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mb-3 w-[calc(100vw-32px)] sm:w-[380px] h-[520px] max-h-[calc(100vh-100px)] bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-2xl flex flex-col overflow-hidden font-sans pb-safe"
          >
            {/* Header */}
            <div className="bg-[#011] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FBDF4B] text-black flex items-center justify-center font-black text-xs rotate-3">
                  AI
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider leading-none">Помощник</h3>
                  <p className="text-[9px] text-[#FBDF4B] font-bold uppercase tracking-widest mt-1">Мартин</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {messages.length > 1 && (
                  <button 
                    onClick={clearHistory}
                    className="text-[9px] text-gray-400 hover:text-[#FBDF4B] font-bold uppercase tracking-wider px-2 py-1.5 rounded hover:bg-white/5 transition-all cursor-pointer mr-1 focus:outline-none focus:ring-1 focus:ring-[#FBDF4B]"
                    title="Начать новый диалог"
                    aria-label="Начать новый диалог"
                  >
                    Сброс
                  </button>
                )}
                <button
                  id="close-chat-btn"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-[#FBDF4B]"
                  title="Закрыть чат"
                  aria-label="Закрыть чат"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 custom-scrollbar">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "bg-slate-700 text-white rounded-tr-none"
                        : "bg-white text-[#011] border border-gray-100 rounded-tl-none"
                    }`}
                  >
                    <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                    <span
                      className={`text-[9px] block text-right mt-1.5 font-medium ${
                        msg.role === "user" ? "text-gray-300" : "text-gray-400"
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {/* Loader */}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2.5">
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider animate-pulse">Анализ...</span>
                  </div>
                </div>
              )}

              {/* Error block */}
              {error && (
                <div className="bg-red-50 text-red-600 rounded-2xl p-3 border border-red-100/50 flex items-start gap-2 text-xs">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Ошибка</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSend} className="p-3 border-t border-gray-100 bg-white flex gap-2 items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Напишите вопрос по ведению и анализу проекта..."
                className="flex-1 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-100 focus:border-[#FBDF4B] pl-4 pr-3 py-3 rounded-xl text-xs font-medium tracking-wide outline-none transition-all placeholder:text-gray-400/60 focus:outline-none placeholder:font-normal"
                disabled={loading}
                maxLength={2000}
                required
                aria-label="Ввод сообщения"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-11 h-11 bg-[#011] text-white hover:bg-gray-800 disabled:opacity-35 disabled:hover:bg-[#011] rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#FBDF4B]"
                title="Отправить сообщение"
                aria-label="Отправить сообщение"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toggle Button */}
      <button
        id="toggle-chat-widget-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-yellow-400 ${
          isOpen 
            ? "bg-zinc-700 text-white hover:bg-zinc-800 rotate-90" 
            : "bg-[#011] text-[#FBDF4B] hover:bg-gray-800"
        } min-h-[44px]`}
        title={isOpen ? "Закрыть чат-ассистент" : "Открыть чат-ассистент"}
        aria-label={isOpen ? "Закрыть чат-ассистент" : "Открыть чат-ассистент"}
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  );
}
