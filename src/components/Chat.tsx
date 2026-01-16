import React, { useState, useEffect, useRef } from "react";
import { ChatManager } from "../core/ChatManager";
import { ChatMode, CHAT_MODES } from "../constants";
import { FileContext, ChatMessage } from "../types";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatControls } from "./ChatControls";
import { ModelSelector } from "./ModelSelector";
import { ChatHistory } from "./ChatHistory";
import { App, Notice } from "obsidian";

interface ChatProps {
  chatManager: ChatManager;
  app: App;
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  defaultModel: string;
}

export const Chat: React.FC<ChatProps> = ({
  chatManager,
  app,
  baseUrl,
  apiKey,
  proxy,
  defaultModel,
}) => {
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES.ASK);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; timestamp?: number }>>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedModel) {
      chatManager.startSession(mode, selectedModel);
      setMessages([]);
      setStreamingContent("");
    }
  }, [mode, selectedModel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async (message: string, files: FileContext[]) => {
    if (!selectedModel) {
      new Notice("Please select a model first");
      return;
    }

    // Add file contexts to chat manager
    for (const file of files) {
      try {
        await chatManager.addFileContext(file.path);
      } catch (error) {
        console.error("Failed to add file context:", error);
      }
    }

    // Add user message to UI
    const userMessage = { role: "user" as const, content: message, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      const stream = await chatManager.sendMessage(message);
      let fullContent = "";

      for await (const chunk of stream) {
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      // Finalize message
      chatManager.appendAssistantMessage(fullContent);
      const session = chatManager.getCurrentSession();
      if (session) {
        const displayMessages = session.messages
          .filter((msg) => msg.role !== "system")
          .map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp,
          }));
        setMessages(displayMessages);
      }
      setStreamingContent("");
    } catch (error: any) {
      new Notice(`Error: ${error.message || "Failed to send message"}`);
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (newMode: ChatMode) => {
    setMode(newMode);
  };

  const handleNewChat = () => {
    if (selectedModel) {
      chatManager.startSession(mode, selectedModel);
      setMessages([]);
      setStreamingContent("");
    }
  };

  const handleSaveChat = async () => {
    const session = chatManager.getCurrentSession();
    if (!session || session.messages.length === 0) {
      new Notice("No chat to save");
      return;
    }

    const title = prompt("Enter chat title:", `Chat ${new Date().toLocaleString()}`);
    if (!title) return;

    try {
      await chatManager.saveSession(title);
      new Notice("Chat saved successfully");
    } catch (error: any) {
      new Notice(`Failed to save chat: ${error.message}`);
    }
  };

  const handleLoadChat = async (filePath: string) => {
    try {
      await chatManager.loadSession(filePath);
      const session = chatManager.getCurrentSession();
      if (session) {
        const displayMessages = session.messages
          .filter((msg) => msg.role !== "system")
          .map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp,
          }));
        setMessages(displayMessages);
        setMode(session.mode);
        setSelectedModel(session.model);
      }
      new Notice("Chat loaded successfully");
    } catch (error: any) {
      new Notice(`Failed to load chat: ${error.message}`);
    }
  };

  const displayMessages: ChatMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  }));

  return (
    <div className="sgr-chat-container">
      <div className="sgr-chat-header">
        <ModelSelector
          baseUrl={baseUrl}
          apiKey={apiKey}
          proxy={proxy}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
      <ChatControls
        mode={mode}
        onModeChange={handleModeChange}
        onNewChat={handleNewChat}
        onSaveChat={handleSaveChat}
        onLoadHistory={() => setShowHistory(true)}
      />
      <div className="sgr-chat-messages-container">
        <ChatMessages
          messages={displayMessages}
          streamingContent={streamingContent}
        />
        <div ref={messagesEndRef} />
      </div>
      <div className="sgr-chat-input-container-wrapper">
        <ChatInput
          onSend={handleSend}
          disabled={isLoading || !selectedModel}
          app={app}
        />
      </div>
      {showHistory && (
        <ChatHistory
          messageRepo={chatManager.getMessageRepository()}
          onLoadChat={handleLoadChat}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};
