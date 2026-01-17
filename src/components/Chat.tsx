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
  tavilyApiKey?: string;
  onModeChange: (mode: ChatMode) => Promise<void>;
  onModelChange: (model: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onNewChat?: () => Promise<void>;
  onChatFileCreated?: (filePath: string) => Promise<void>;
}

export const Chat: React.FC<ChatProps> = ({
  chatManager,
  app,
  baseUrl,
  apiKey,
  proxy,
  defaultModel,
  defaultMode,
  tavilyApiKey,
  onModeChange: onModeChangeSettings,
  onModelChange: onModelChangeSettings,
  onOpenSettings,
  onOpenHistory,
  onNewChat,
  onChatFileCreated,
}) => {
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const [model, setModel] = useState<string>(defaultModel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [messagesBeforeEdit, setMessagesBeforeEdit] = useState<ChatMessage[] | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState<boolean>(false);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    chatManager.clearSession();
    const newModel = model || defaultModel;
    if (newModel) {
      chatManager.startSession(mode, newModel);
      updateMessagesFromSession();
      setStreamingContent("");
      setIsStreaming(false);
      // Clear last chat path when starting new chat
      if (onNewChat) {
        await onNewChat();
      }
    }
  }, [chatManager, mode, model, defaultModel, updateMessagesFromSession, onNewChat]);

  // Handle mode change
  const handleModeChange = useCallback(async (newMode: ChatMode) => {
    setMode(newMode);
    
    // Update mode in current session without clearing it
    const session = chatManager.getCurrentSession();
    if (session) {
      // Update mode in existing session (update system message)
      chatManager.updateMode(newMode);
      updateMessagesFromSession();
    } else {
      // If no session exists, start a new one
      const currentModel = model || defaultModel;
      if (currentModel) {
        chatManager.startSession(newMode, currentModel);
        updateMessagesFromSession();
      }
    }
    
    setStreamingContent("");
    setIsStreaming(false);
    
    // Save mode to settings
    await onModeChangeSettings(newMode);
  }, [chatManager, model, defaultModel, updateMessagesFromSession, onModeChangeSettings]);

  // Handle model change
  const handleModelChange = useCallback(async (newModel: string) => {
    setModel(newModel);
    // Model is global setting, no need to clear session
    // Just update the state, session will use new model on next message
    // Save model to settings
    await onModelChangeSettings(newModel);
  }, [onModelChangeSettings]);

  // Handle send message
  const handleSend = useCallback(async (message: string, files: FileContext[]) => {
    const currentModel = model || defaultModel;
    if (!currentModel) {
      return;
    }

    // Clear editing state when sending message
    setEditingMessage(null);
    setMessagesBeforeEdit(null);

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
      const stream = await chatManager.sendMessage(message, currentModel, mode, enableWebSearch);
      
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
        // Save last chat path after file is created/updated
        const currentChatFilePath = chatManager.getCurrentChatFilePath();
        if (currentChatFilePath && onChatFileCreated) {
          await onChatFileCreated(currentChatFilePath);
        }
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
        // Save last chat path after file is created/updated
        const currentChatFilePath = chatManager.getCurrentChatFilePath();
        if (currentChatFilePath && onChatFileCreated) {
          await onChatFileCreated(currentChatFilePath);
        }
      } catch (saveError) {
        console.error("Failed to update chat file on error:", saveError);
      }
    } finally {
      setIsStreaming(false);
      isStreamingStoppedRef.current = false;
    }
  }, [chatManager, mode, model, defaultModel, updateMessagesFromSession, onChatFileCreated]);

  // Handle stop streaming
  const handleStop = useCallback(async () => {
    isStreamingStoppedRef.current = true;
    setIsStreaming(false);
    // Save current state when stopping stream
    try {
      await chatManager.updateChatFile();
      // Save last chat path after file is created/updated
      const currentChatFilePath = chatManager.getCurrentChatFilePath();
      if (currentChatFilePath && onChatFileCreated) {
        await onChatFileCreated(currentChatFilePath);
      }
    } catch (error) {
      console.error("Failed to update chat file on stop:", error);
    }
    setStreamingContent("");
  }, [chatManager, onChatFileCreated]);

  // Handle save chat
  const handleSaveChat = useCallback(async () => {
    try {
      await chatManager.saveSession();
      updateMessagesFromSession();
    } catch (error) {
      console.error("Failed to save chat:", error);
    }
  }, [chatManager, updateMessagesFromSession]);

  // Handle edit message
  const handleEditMessage = useCallback((messageIndex: number, content: string) => {
    // Save current messages state before editing
    const session = chatManager.getCurrentSession();
    if (session) {
      setMessagesBeforeEdit([...session.messages]);
    }
    
    // Remove all messages after the selected message
    chatManager.removeMessagesAfterIndex(messageIndex);
    updateMessagesFromSession();
    
    // Clean content from file blocks (keep only @ mentions)
    // Remove [File: path]...[/File] blocks
    const cleanedContent = content.replace(/\[File:\s*[^\]]+\][\s\S]*?\[\/File\]/g, '').trim();
    
    // Set message content in input
    setEditingMessage(cleanedContent);
    setStreamingContent("");
    setIsStreaming(false);
  }, [chatManager, updateMessagesFromSession]);

  // Handle cancel edit
  const handleCancelEdit = useCallback(() => {
    if (messagesBeforeEdit && chatManager.getCurrentSession()) {
      // Restore messages from before edit
      const session = chatManager.getCurrentSession();
      if (session) {
        session.messages = [...messagesBeforeEdit];
        updateMessagesFromSession();
      }
    }
    setEditingMessage(null);
    setMessagesBeforeEdit(null);
  }, [messagesBeforeEdit, chatManager, updateMessagesFromSession]);

  // Handle initial value set (clear editing state)
  const handleInitialValueSet = useCallback(() => {
    setEditingMessage(null);
  }, []);


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
            ⏰
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
          onEditMessage={handleEditMessage}
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
        initialValue={editingMessage || undefined}
        onInitialValueSet={handleInitialValueSet}
        onCancelEdit={editingMessage ? handleCancelEdit : undefined}
        tavilyApiKey={tavilyApiKey}
        enableWebSearch={enableWebSearch}
        onWebSearchToggle={setEnableWebSearch}
      />
    </div>
  );
};
