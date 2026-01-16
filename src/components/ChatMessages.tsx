import React from "react";
import { ChatMessage } from "../types";

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  streamingContent,
}) => {
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  return (
    <div className="sgr-chat-messages">
      {displayMessages.length === 0 && (
        <div className="sgr-chat-empty">
          <p>Start a conversation by typing a message below.</p>
        </div>
      )}
      {displayMessages.map((message, index) => (
        <div
          key={index}
          className={`sgr-message sgr-message-${message.role}`}
        >
          <div className="sgr-message-header">
            <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
          </div>
          <div className="sgr-message-content">
            {message.role === "assistant" ? (
              <div
                className="sgr-markdown"
                dangerouslySetInnerHTML={{
                  __html: formatMarkdown(message.content),
                }}
              />
            ) : (
              <div className="sgr-message-text">{message.content}</div>
            )}
          </div>
        </div>
      ))}
      {streamingContent && (
        <div className="sgr-message sgr-message-assistant sgr-message-streaming">
          <div className="sgr-message-header">
            <strong>Assistant</strong>
          </div>
          <div className="sgr-message-content">
            <div
              className="sgr-markdown"
              dangerouslySetInnerHTML={{
                __html: formatMarkdown(streamingContent),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Simple markdown formatter (basic implementation)
function formatMarkdown(text: string): string {
  // Escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}
