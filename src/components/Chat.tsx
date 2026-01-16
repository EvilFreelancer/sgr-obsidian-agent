import React, { useState, useEffect, useCallback } from "react";
import { ChatManager } from "../core/ChatManager";
import { ChatMessage, FileContext } from "../types";
import { ChatMode, CHAT_MODES } from "../constants";
import { App } from "obsidian";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatControls } from "./ChatControls";
import { ModelSelector } from "./ModelSelector";
import { ChatHistory } from "./ChatHistory";

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
  const [model, setModel] = useState<string>(defaultModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Update messages when session changes
  const updateMessagesFromSession = useCallback(() => {
    const session = chatManager.getCurrentSession();
    if (session) {
      setMessages(session.messages);
    } else {
      setMessages([]);
    }
  }, [chatManager]);

  // Initialize session on mount
  useEffect(() => {
    const session = chatManager.getCurrentSession();
    if (!session) {
      // Start new session if none exists
      const initialModel = model || defaultModel;
      if (initialModel) {
        chatManager.startSession(mode, initialModel);
        updateMessagesFromSession();
      }
    } else {
      // Update state from existing session
      updateMessagesFromSession();
      setMode(session.mode);
      setModel(session.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    chatManager.clearSession();
    const newModel = model || defaultModel;
    if (newModel) {
      chatManager.startSession(mode, newModel);
      updateMessagesFromSession();
      setStreamingContent("");
      setIsStreaming(false);
    }
  }, [chatManager, mode, model, defaultModel, updateMessagesFromSession]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: ChatMode) => {
    setMode(newMode);
    const currentModel = model || defaultModel;
    if (currentModel) {
      chatManager.clearSession();
      chatManager.startSession(newMode, currentModel);
      updateMessagesFromSession();
      setStreamingContent("");
      setIsStreaming(false);
    }
  }, [chatManager, model, defaultModel, updateMessagesFromSession]);

  // Handle model change
  const handleModelChange = useCallback((newModel: string) => {
    setModel(newModel);
    const session = chatManager.getCurrentSession();
    if (session) {
      // Update session with new model
      chatManager.clearSession();
      chatManager.startSession(session.mode, newModel);
      updateMessagesFromSession();
    }
  }, [chatManager, updateMessagesFromSession]);

  // Handle send message
  const handleSend = useCallback(async (message: string, files: FileContext[]) => {
    const currentModel = model || defaultModel;
    if (!currentModel) {
      return;
    }

    // Ensure session exists
    let session = chatManager.getCurrentSession();
    if (!session) {
      chatManager.startSession(mode, currentModel);
      session = chatManager.getCurrentSession();
    }

    if (!session) {
      return;
    }

    // Add file contexts
    for (const file of files) {
      try {
        await chatManager.addFileContext(file.path);
      } catch (error) {
        console.error("Failed to add file context:", error);
      }
    }

    setIsStreaming(true);
    setStreamingContent("");

    try {
      const stream = await chatManager.sendMessage(message);
      
      // Process stream - accumulate content in streamingContent
      // ChatManager already updates session via appendAssistantMessage
      let accumulatedContent = "";
      for await (const chunk of stream) {
        accumulatedContent += chunk;
        setStreamingContent(accumulatedContent);
        chatManager.appendAssistantMessage(chunk);
      }

      // Update messages after streaming completes and clear streaming content
      updateMessagesFromSession();
      setStreamingContent("");
    } catch (error) {
      console.error("Failed to send message:", error);
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
    }
  }, [chatManager, mode, model, defaultModel, updateMessagesFromSession]);

  // Handle stop streaming
  const handleStop = useCallback(() => {
    setIsStreaming(false);
    setStreamingContent("");
  }, []);

  // Handle save chat
  const handleSaveChat = useCallback(async () => {
    try {
      await chatManager.saveSession();
      updateMessagesFromSession();
    } catch (error) {
      console.error("Failed to save chat:", error);
    }
  }, [chatManager, updateMessagesFromSession]);

  // Handle load chat from history
  const handleLoadChat = useCallback(async (filePath: string) => {
    try {
      await chatManager.loadSession(filePath);
      updateMessagesFromSession();
      const session = chatManager.getCurrentSession();
      if (session) {
        setMode(session.mode);
        setModel(session.model);
      }
      setShowHistory(false);
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
  }, [chatManager, updateMessagesFromSession]);

  return (
    <div className="sgr-chat">
      <ModelSelector
        baseUrl={baseUrl}
        apiKey={apiKey}
        proxy={proxy}
        selectedModel={model}
        onModelChange={handleModelChange}
      />
      <ChatControls
        mode={mode}
        onModeChange={handleModeChange}
        onNewChat={handleNewChat}
        onSaveChat={handleSaveChat}
        onLoadHistory={() => setShowHistory(true)}
      />
      <div className="sgr-chat-messages-container">
        <ChatMessages
          messages={messages}
          streamingContent={streamingContent}
          app={app}
        />
      </div>
      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        disabled={isStreaming}
        isLoading={isStreaming}
        app={app}
        mode={mode}
        onModeChange={handleModeChange}
        baseUrl={baseUrl}
        apiKey={apiKey}
        proxy={proxy}
        selectedModel={model}
        onModelChange={handleModelChange}
      />
      {showHistory && (
        <div className="sgr-chat-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="sgr-chat-history-modal" onClick={(e) => e.stopPropagation()}>
            <ChatHistory
              messageRepo={chatManager.getMessageRepository()}
              onLoadChat={handleLoadChat}
              onClose={() => setShowHistory(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
