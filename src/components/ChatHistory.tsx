import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MessageRepository } from "../core/MessageRepository";
import { ChatHistoryMetadata } from "../types";
import { Button } from "./ui/Button";
import { bm25Search } from "../utils/bm25Search";

interface ChatHistoryProps {
  messageRepo: MessageRepository;
  onLoadChat: (filePath: string) => void;
  onDeleteChat: (filePath: string) => Promise<void>;
  onBack: () => void;
  onRefresh?: (refreshFn: () => Promise<void>) => void;
}

interface ChatItem {
  path: string;
  metadata: ChatHistoryMetadata;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messageRepo,
  onLoadChat,
  onDeleteChat,
  onBack,
  onRefresh,
}) => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const chatList = await messageRepo.listChats();
      setChats(chatList);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setLoading(false);
    }
  }, [messageRepo]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Expose refresh function to parent via callback
  useEffect(() => {
    if (onRefresh) {
      onRefresh(loadChats);
    }
  }, [onRefresh, loadChats]);

  // Filter chats using BM25 search
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) {
      return chats;
    }
    return bm25Search(searchQuery, chats, 'title');
  }, [chats, searchQuery]);

  const handleDelete = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation(); // Prevent triggering chat load
    e.preventDefault(); // Prevent default behavior
    try {
      // Check if this is the current chat and handle it
      await onDeleteChat(filePath);
      // Delete the chat file
      await messageRepo.deleteChat(filePath);
      // List will be refreshed automatically via vault events, but refresh manually too
      await loadChats();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  return (
    <div className="sgr-chat-history-view">
      <div className="sgr-chat-history-header">
        <Button variant="ghost" size="sm" onClick={onBack} className="sgr-chat-history-back-button">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12l-4-4 4-4"/>
          </svg>
        </Button>
        <h3>Chat History</h3>
      </div>
      <div className="sgr-chat-history-search">
        <input
          type="text"
          className="sgr-chat-history-search-input"
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="sgr-chat-history-list">
        {loading ? (
          <div className="sgr-chat-history-loading">Loading...</div>
        ) : filteredChats.length === 0 ? (
          <div className="sgr-chat-history-empty">
            {searchQuery ? "No chats found" : "No chat history"}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div 
              key={chat.path} 
              className="sgr-chat-history-item"
              onClick={() => onLoadChat(chat.path)}
            >
              <div className="sgr-chat-history-item-info">
                <div className="sgr-chat-history-item-title">
                  {chat.metadata.title}
                </div>
                <div className="sgr-chat-history-item-meta">
                  {new Date(chat.metadata.lastAccessedAt).toLocaleString()}
                </div>
              </div>
              <button
                className="sgr-chat-history-item-delete"
                onClick={(e) => handleDelete(e, chat.path)}
                title="Delete chat"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4h12M4 4V3a1 1 0 011-1h6a1 1 0 011 1v1M3 4v9a1 1 0 001 1h8a1 1 0 001-1V4M6 7v4M10 7v4"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
