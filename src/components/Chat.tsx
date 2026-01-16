import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChatManager } from "../core/ChatManager";
import { ChatMessage, FileContext } from "../types";
import { ChatMode, CHAT_MODES } from "../constants";
import { App } from "obsidian";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

interface ChatProps {
  chatManager: ChatManager;
  app: App;
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  defaultModel: string;
  defaultMode: ChatMode;
  onModeChange: (mode: ChatMode) => Promise<void>;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}

export const Chat: React.FC<ChatProps> = ({
  chatManager,
  app,
  baseUrl,
  apiKey,
  proxy,
  defaultModel,
  defaultMode,
  onModeChange: onModeChangeSettings,
  onOpenSettings,
  onOpenHistory,
}) => {
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const [model, setModel] = useState<string>(defaultModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingStoppedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      const initialMode = mode || defaultMode;
      if (initialModel) {
        chatManager.startSession(initialMode, initialModel);
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
  const handleModeChange = useCallback(async (newMode: ChatMode) => {
    setMode(newMode);
    const currentModel = model || defaultModel;
    if (currentModel) {
      chatManager.clearSession();
      chatManager.startSession(newMode, currentModel);
      updateMessagesFromSession();
      setStreamingContent("");
      setIsStreaming(false);
    }
    // Save mode to settings
    await onModeChangeSettings(newMode);
  }, [chatManager, model, defaultModel, updateMessagesFromSession, onModeChangeSettings]);

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
    isStreamingStoppedRef.current = false;

    let lastUpdateTime = Date.now();
    const updateInterval = 500; // Update file every 500ms

    try {
      const stream = await chatManager.sendMessage(message);
      
      // Process stream - accumulate content in streamingContent
      // ChatManager already updates session via appendAssistantMessage
      let accumulatedContent = "";
      for await (const chunk of stream) {
        if (isStreamingStoppedRef.current) {
          // Stream was stopped, break the loop
          break;
        }
        
        accumulatedContent += chunk;
        setStreamingContent(accumulatedContent);
        chatManager.appendAssistantMessage(chunk);

        // Update file periodically during streaming
        const now = Date.now();
        if (now - lastUpdateTime >= updateInterval) {
          try {
            await chatManager.updateChatFile();
            lastUpdateTime = now;
          } catch (error) {
            console.error("Failed to update chat file during streaming:", error);
          }
        }
      }

      // Update file after streaming completes (or was stopped)
      try {
        await chatManager.updateChatFile();
      } catch (error) {
        console.error("Failed to update chat file after streaming:", error);
      }

      // Update messages after streaming completes and clear streaming content
      updateMessagesFromSession();
      setStreamingContent("");
    } catch (error) {
      console.error("Failed to send message:", error);
      setStreamingContent("");
      // Try to save what we have
      try {
        await chatManager.updateChatFile();
      } catch (saveError) {
        console.error("Failed to update chat file on error:", saveError);
      }
    } finally {
      setIsStreaming(false);
      isStreamingStoppedRef.current = false;
    }
  }, [chatManager, mode, model, defaultModel, updateMessagesFromSession]);

  // Handle stop streaming
  const handleStop = useCallback(async () => {
    isStreamingStoppedRef.current = true;
    setIsStreaming(false);
    // Save current state when stopping stream
    try {
      await chatManager.updateChatFile();
    } catch (error) {
      console.error("Failed to update chat file on stop:", error);
    }
    setStreamingContent("");
  }, [chatManager]);

  // Handle save chat
  const handleSaveChat = useCallback(async () => {
    try {
      await chatManager.saveSession();
      updateMessagesFromSession();
    } catch (error) {
      console.error("Failed to save chat:", error);
    }
  }, [chatManager, updateMessagesFromSession]);


  return (
    <div className="sgr-chat">
      <div className="sgr-chat-top-bar">
        <button
          className="sgr-top-bar-button sgr-new-chat-button"
          onClick={handleNewChat}
          title="New Chat"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="sgr-top-bar-right">
          <button
            className="sgr-top-bar-button sgr-history-button"
            onClick={onOpenHistory}
            title="History"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2C4.69 2 2 4.69 2 8s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10.5c-2.48 0-4.5-2.02-4.5-4.5S5.52 3.5 8 3.5 12.5 5.52 12.5 8 10.48 12.5 8 12.5z" />
              <path d="M8.5 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <button
            className="sgr-top-bar-button sgr-settings-button"
            onClick={onOpenSettings}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>
      <div className="sgr-chat-messages-container" ref={scrollContainerRef}>
        <ChatMessages
          messages={messages}
          streamingContent={streamingContent}
          app={app}
          scrollContainerRef={scrollContainerRef}
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
    </div>
  );
};
