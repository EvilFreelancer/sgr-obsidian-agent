import React, { useState, useEffect, useRef } from "react";
import { ChatManager } from "../core/ChatManager";
import { ChatMode, CHAT_MODES } from "../constants";
import { FileContext, ChatMessage } from "../types";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
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
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES.AGENT);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; timestamp?: number }>>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hasLoadedLastChat, setHasLoadedLastChat] = useState(false);
  const streamCancelledRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load last chat on mount if no active session exists
  useEffect(() => {
    if (hasLoadedLastChat || !selectedModel) {
      return; // Already loaded or waiting for model selection
    }

    const loadLastChat = async () => {
      // Check if there's already an active session
      const currentSession = chatManager.getCurrentSession();
      if (currentSession && currentSession.messages.length > 1) {
        // Session already exists (has more than just system message), don't load last chat
        setHasLoadedLastChat(true);
        // Update UI with existing session
        const displayMessages = currentSession.messages
          .filter((msg) => msg.role !== "system")
          .map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp,
          }));
        setMessages(displayMessages);
        setMode(currentSession.mode);
        setSelectedModel(currentSession.model);
        return;
      }

      // No active session, try to load last chat
      try {
        const messageRepo = chatManager.getMessageRepository();
        const lastChat = await messageRepo.getLastChat();
        
        if (lastChat) {
          // Load the last chat
          await chatManager.loadSession(lastChat.path);
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
          setHasLoadedLastChat(true);
        } else {
          // No chat history, start new session
          chatManager.startSession(mode, selectedModel);
          setMessages([]);
          setStreamingContent("");
          setHasLoadedLastChat(true);
        }
      } catch (error) {
        console.error("Failed to load last chat:", error);
        // Start new session on error
        chatManager.startSession(mode, selectedModel);
        setMessages([]);
        setStreamingContent("");
        setHasLoadedLastChat(true);
      }
    };

    loadLastChat();
  }, [selectedModel, hasLoadedLastChat, chatManager, mode]);

  // Handle mode/model changes after initial load
  useEffect(() => {
    if (hasLoadedLastChat && selectedModel) {
      const currentSession = chatManager.getCurrentSession();
      // Only start new session if user explicitly changed mode or model
      // and there's no active session with messages
      if (!currentSession || currentSession.messages.length <= 1) {
        chatManager.startSession(mode, selectedModel);
        setMessages([]);
        setStreamingContent("");
      }
    }
  }, [mode, selectedModel, hasLoadedLastChat, chatManager]);

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

    // Auto-save after user message is added
    try {
      await chatManager.autoSaveSession();
    } catch (error) {
      console.error("Failed to auto-save chat:", error);
    }

    try {
      streamCancelledRef.current = false;
      const stream = await chatManager.sendMessage(message);
      let fullContent = "";

      for await (const chunk of stream) {
        if (streamCancelledRef.current) {
          break;
        }
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      // Finalize message if not cancelled
      if (!streamCancelledRef.current && fullContent) {
        chatManager.appendAssistantMessage(fullContent);
        
        // Auto-save after assistant response
        try {
          await chatManager.autoSaveSession();
        } catch (error) {
          console.error("Failed to auto-save chat:", error);
        }

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
      }
      setStreamingContent("");
    } catch (error: any) {
      if (!streamCancelledRef.current) {
        new Notice(`Error: ${error.message || "Failed to send message"}`);
        console.error("Error sending message:", error);
      }
    } finally {
      setIsLoading(false);
      streamCancelledRef.current = false;
    }
  };

  const handleStop = () => {
    if (isLoading) {
      streamCancelledRef.current = true;
      setIsLoading(false);
      setStreamingContent("");
      
      // Save current state
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
      
      // Auto-save after stopping
      chatManager.autoSaveSession().catch((error) => {
        console.error("Failed to auto-save chat:", error);
      });
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

    // Use generated title or prompt for custom title
    const generatedTitle = chatManager.getSessionTitle();
    const defaultTitle = generatedTitle || `Chat ${new Date().toLocaleString()}`;
    const title = prompt("Enter chat title:", defaultTitle);
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
      {showHistory ? (
        <ChatHistory
          messageRepo={chatManager.getMessageRepository()}
          onLoadChat={handleLoadChat}
          onClose={() => setShowHistory(false)}
        />
      ) : (
        <>
          <div className="sgr-chat-messages-container">
            <ChatMessages
              messages={displayMessages}
              streamingContent={streamingContent}
              app={app}
            />
            <div ref={messagesEndRef} />
          </div>
          <div className="sgr-chat-input-container-wrapper">
            <ChatInput
              onSend={handleSend}
              onStop={handleStop}
              disabled={!selectedModel}
              isLoading={isLoading}
              app={app}
              mode={mode}
              onModeChange={handleModeChange}
              baseUrl={baseUrl}
              apiKey={apiKey}
              proxy={proxy}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        </>
      )}
    </div>
  );
};
