import React, { useState, useEffect, useMemo } from "react";
import { MessageRepository } from "../core/MessageRepository";
import { ChatHistoryMetadata } from "../types";
import { Button } from "./ui/Button";
import { bm25Search } from "../utils/bm25Search";

interface ChatHistoryProps {
  messageRepo: MessageRepository;
  onLoadChat: (filePath: string) => void;
  onClose: () => void;
}

interface ChatItem {
  path: string;
  metadata: ChatHistoryMetadata;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messageRepo,
  onLoadChat,
  onClose,
}) => {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    setLoading(true);
    try {
      const chatList = await messageRepo.listChats();
      setChats(chatList);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter chats using BM25 search
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) {
      return chats;
    }
    return bm25Search(searchQuery, chats, 'title');
  }, [chats, searchQuery]);

  const handleDelete = async (filePath: string) => {
    if (confirm("Are you sure you want to delete this chat?")) {
      try {
        await messageRepo.deleteChat(filePath);
        await loadChats();
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    }
  };

  return (
    <div className="sgr-chat-history-view">
      <div className="sgr-chat-history-header">
        <h3>Chat History</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ×
        </Button>
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
            <div key={chat.path} className="sgr-chat-history-item">
              <div className="sgr-chat-history-item-info">
                <div className="sgr-chat-history-item-title">
                  {chat.metadata.title}
                </div>
                <div className="sgr-chat-history-item-meta">
                  {new Date(chat.metadata.lastAccessedAt).toLocaleString()} • {chat.metadata.model} • {chat.metadata.mode}
                </div>
              </div>
              <div className="sgr-chat-history-item-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onLoadChat(chat.path);
                    onClose();
                  }}
                >
                  Load
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(chat.path)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
