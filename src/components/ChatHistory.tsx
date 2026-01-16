import React, { useState, useEffect } from "react";
import { MessageRepository } from "../core/MessageRepository";
import { ChatHistoryMetadata } from "../types";
import { Button } from "./ui/Button";

interface ChatHistoryProps {
  messageRepo: MessageRepository;
  onLoadChat: (filePath: string) => void;
  onClose: () => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messageRepo,
  onLoadChat,
  onClose,
}) => {
  const [chats, setChats] = useState<Array<{ path: string; metadata: ChatHistoryMetadata }>>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="sgr-chat-history-overlay" onClick={onClose}>
      <div className="sgr-chat-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sgr-chat-history-header">
          <h3>Chat History</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="sgr-chat-history-list">
          {loading ? (
            <div className="sgr-chat-history-loading">Loading...</div>
          ) : chats.length === 0 ? (
            <div className="sgr-chat-history-empty">No chat history</div>
          ) : (
            chats.map((chat) => (
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
    </div>
  );
};
