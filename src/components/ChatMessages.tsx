import React, { useEffect, useRef } from "react";
import { ChatMessage } from "../types";
import { App } from "obsidian";

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent?: string;
  app: App;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  streamingContent,
  app,
}) => {
  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Don't show streaming content if last message is assistant
  // During streaming, we show streamingContent separately, but once it's added to messages,
  // we should only show the message, not both
  const lastMessage = displayMessages[displayMessages.length - 1];
  const isLastMessageStreaming = lastMessage && 
    lastMessage.role === "assistant" && 
    streamingContent &&
    lastMessage.content === streamingContent;
  
  const shouldShowStreaming = streamingContent && !isLastMessageStreaming;

  useEffect(() => {
    // Add click handlers for file mentions after render
    if (messagesContainerRef.current) {
      const fileMentions = messagesContainerRef.current.querySelectorAll('.sgr-file-mention');
      
      const clickHandlers: Array<{ element: Element; handler: (e: Event) => void }> = [];
      
      fileMentions.forEach((mention) => {
        const filePath = mention.getAttribute('data-file-path');
        if (filePath) {
          const handler = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Normalize file path - add .md extension if not present
            let normalizedPath = filePath;
            if (!normalizedPath.endsWith('.md') && !normalizedPath.includes('.')) {
              normalizedPath = normalizedPath + '.md';
            }
            
            try {
              app.workspace.openLinkText(normalizedPath, '', true);
            } catch (error) {
              console.error('Failed to open file:', normalizedPath, error);
            }
          };
          
          mention.addEventListener('click', handler);
          clickHandlers.push({ element: mention, handler });
        }
      });
      
      // Cleanup: remove event listeners when component unmounts or dependencies change
      return () => {
        clickHandlers.forEach(({ element, handler }) => {
          element.removeEventListener('click', handler);
        });
      };
    }
  }, [messages, streamingContent, app]);

  return (
    <div className="sgr-chat-messages" ref={messagesContainerRef}>
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
                  __html: formatMarkdownWithFileMentions(message.content),
                }}
              />
            ) : (
              <div 
                className="sgr-message-text"
                dangerouslySetInnerHTML={{
                  __html: formatMarkdownWithFileMentions(message.content),
                }}
              />
            )}
          </div>
        </div>
      ))}
      {shouldShowStreaming && (
        <div className="sgr-message sgr-message-assistant sgr-message-streaming">
          <div className="sgr-message-header">
            <strong>Assistant</strong>
          </div>
          <div className="sgr-message-content">
            <div
              className="sgr-markdown"
              dangerouslySetInnerHTML={{
                __html: formatMarkdownWithFileMentions(streamingContent),
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

// Format markdown with clickable file mentions
function formatMarkdownWithFileMentions(text: string): string {
  // First, remove file context blocks [File: ...] and replace with placeholder
  // Pattern: [File: path]\ncontent\n[/File]
  // This must be done before markdown formatting to avoid issues
  const fileBlockPlaceholders: Array<{ placeholder: string; replacement: string }> = [];
  let processedText = text.replace(/\[File:\s*([^\]]+)\][\s\S]*?\[\/File\]/g, (match, filePath) => {
    // Extract just the filename from path
    const fileName = filePath.split('/').pop() || filePath;
    const placeholder = `__FILE_BLOCK_${fileBlockPlaceholders.length}__`;
    // Escape filePath for HTML attribute
    const escapedPath = filePath
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const replacement = `<span class="sgr-file-mention" data-file-path="${escapedPath}" style="color: var(--link-color); cursor: pointer; text-decoration: underline;">@${fileName}</span>`;
    fileBlockPlaceholders.push({ placeholder, replacement });
    return placeholder;
  });
  
  // Format regular markdown
  let html = formatMarkdown(processedText);
  
  // Replace placeholders with actual file links
  fileBlockPlaceholders.forEach(({ placeholder, replacement }) => {
    html = html.replace(placeholder, replacement);
  });
  
  // Then add file mentions as clickable links (without square brackets in display)
  // Pattern: @[[filename]] or @[[path/to/file.md]]
  html = html.replace(/@\[\[([^\]]+)\]\]/g, (match, filePath) => {
    // Extract just the filename from path
    const fileName = filePath.split('/').pop() || filePath;
    // Escape filePath for HTML attribute
    const escapedPath = filePath
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return `<span class="sgr-file-mention" data-file-path="${escapedPath}" style="color: var(--link-color); cursor: pointer; text-decoration: underline;">@${fileName}</span>`;
  });
  
  return html;
}
