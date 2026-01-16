import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { App } from "obsidian";

interface ChatMessagesProps {
  messages: ChatMessage[];
  streamingContent?: string;
  app: App;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  streamingContent,
  app,
  scrollContainerRef,
}) => {
  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasAtBottomRef = useRef(true);
  const hasInitialScrolledRef = useRef(false);
  const previousMessagesLengthRef = useRef(0);
  const scrollThreshold = 100; // Distance from bottom to consider "at bottom"
  
  // Don't show streaming content if last message is assistant
  // During streaming, we show streamingContent separately, but once it's added to messages,
  // we should only show the message, not both
  const lastMessage = displayMessages[displayMessages.length - 1];
  const isLastMessageStreaming = lastMessage && 
    lastMessage.role === "assistant" && 
    streamingContent &&
    lastMessage.content === streamingContent;
  
  const shouldShowStreaming = streamingContent && !isLastMessageStreaming;

  // Check if user is at bottom of scroll container
  const isAtBottom = (container: HTMLElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= scrollThreshold;
  };

  // Scroll to bottom without animation
  const scrollToBottom = (container: HTMLElement) => {
    container.scrollTop = container.scrollHeight;
  };

  // Handle user scroll events
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleWheel = () => {
      isUserScrollingRef.current = true;
      wasAtBottomRef.current = isAtBottom(container);
      
      // Clear existing timeout
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
      
      // Reset flag after user stops scrolling
      userScrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        // Check if user scrolled back to bottom
        wasAtBottomRef.current = isAtBottom(container);
      }, 150);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on scrollbar
      const rect = container.getBoundingClientRect();
      const scrollbarWidth = container.offsetWidth - container.clientWidth;
      if (e.clientX >= rect.right - scrollbarWidth) {
        isUserScrollingRef.current = true;
        wasAtBottomRef.current = isAtBottom(container);
      }
    };

    const handleMouseUp = () => {
      if (isUserScrollingRef.current) {
        // Check position after user releases scrollbar
        wasAtBottomRef.current = isAtBottom(container);
        // Reset flag after a short delay
        setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 100);
      }
    };

    const handleTouchStart = () => {
      isUserScrollingRef.current = true;
      wasAtBottomRef.current = isAtBottom(container);
    };

    const handleTouchEnd = () => {
      setTimeout(() => {
        isUserScrollingRef.current = false;
        wasAtBottomRef.current = isAtBottom(container);
      }, 150);
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [scrollContainerRef]);

  // Auto-scroll when messages or streaming content changes
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const messagesLength = displayMessages.length;
    const isFirstLoad = !hasInitialScrolledRef.current && messagesLength > 0;
    const messagesChanged = messagesLength !== previousMessagesLengthRef.current;

    // On first load or when chat is loaded, scroll to bottom immediately
    if (isFirstLoad) {
      requestAnimationFrame(() => {
        scrollToBottom(container);
        wasAtBottomRef.current = true;
        hasInitialScrolledRef.current = true;
      });
      previousMessagesLengthRef.current = messagesLength;
      return;
    }

    // If messages changed significantly (new chat loaded), scroll to bottom
    if (messagesChanged && messagesLength > 0) {
      const previousLength = previousMessagesLengthRef.current;
      const lengthDiff = Math.abs(messagesLength - previousLength);
      
      // Check if this looks like a chat load:
      // - Many messages added at once (more than 1)
      // - Or messages changed significantly (more than 50% change)
      // - Or went from 0 to many messages
      const isChatLoad = 
        (messagesLength > previousLength && lengthDiff > 1) ||
        (previousLength > 0 && lengthDiff > previousLength * 0.5) ||
        (previousLength === 0 && messagesLength > 0);
      
      if (isChatLoad) {
        requestAnimationFrame(() => {
          scrollToBottom(container);
          wasAtBottomRef.current = true;
        });
        previousMessagesLengthRef.current = messagesLength;
        return;
      }
    }

    // Update previous length
    previousMessagesLengthRef.current = messagesLength;

    // If user is not manually scrolling and was at bottom, scroll to bottom
    if (!isUserScrollingRef.current && wasAtBottomRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom(container);
      });
    } else if (!isUserScrollingRef.current) {
      // Update wasAtBottomRef based on current position
      wasAtBottomRef.current = isAtBottom(container);
    }
  }, [messages, streamingContent, scrollContainerRef, displayMessages.length]);

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
            <MarkdownContent
              content={message.content}
              app={app}
              className={message.role === "assistant" ? "sgr-markdown" : "sgr-message-text"}
            />
          </div>
        </div>
      ))}
      {shouldShowStreaming && (
        <div className="sgr-message sgr-message-assistant sgr-message-streaming">
          <div className="sgr-message-header">
            <strong>Assistant</strong>
          </div>
          <div className="sgr-message-content">
            <MarkdownContent
              content={streamingContent}
              app={app}
              className="sgr-markdown"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Component for rendering markdown content with file mentions support
interface MarkdownContentProps {
  content: string;
  app: App;
  className?: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, app, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Preprocess content: replace file mentions and file blocks with placeholders
  const preprocessContent = (text: string): string => {
    // Remove file context blocks [File: ...] and replace with placeholder
    // Pattern: [File: path]\ncontent\n[/File]
    let processed = text.replace(/\[File:\s*([^\]]+)\][\s\S]*?\[\/File\]/g, (match, filePath) => {
      const fileName = filePath.split('/').pop() || filePath;
      return `__FILE_BLOCK_PLACEHOLDER__${filePath}__FILE_BLOCK_PLACEHOLDER__`;
    });

    // Replace @[[filename]] mentions with placeholders
    processed = processed.replace(/@\[\[([^\]]+)\]\]/g, (match, filePath) => {
      return `__FILE_MENTION_PLACEHOLDER__${filePath}__FILE_MENTION_PLACEHOLDER__`;
    });

    return processed;
  };

  // Process rendered content to replace placeholders with clickable file mentions
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Replace file block placeholders
    const fileBlockRegex = /__FILE_BLOCK_PLACEHOLDER__([^_]+)__FILE_BLOCK_PLACEHOLDER__/g;
    let html = container.innerHTML;
    html = html.replace(fileBlockRegex, (match, filePath) => {
      const fileName = filePath.split('/').pop() || filePath;
      const escapedPath = filePath
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      return `<span class="sgr-file-mention" data-file-path="${escapedPath}" style="color: var(--link-color); cursor: pointer; text-decoration: underline;">@${fileName}</span>`;
    });

    // Replace file mention placeholders
    const fileMentionRegex = /__FILE_MENTION_PLACEHOLDER__([^_]+)__FILE_MENTION_PLACEHOLDER__/g;
    html = html.replace(fileMentionRegex, (match, filePath) => {
      const fileName = filePath.split('/').pop() || filePath;
      const escapedPath = filePath
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      return `<span class="sgr-file-mention" data-file-path="${escapedPath}" style="color: var(--link-color); cursor: pointer; text-decoration: underline;">@${fileName}</span>`;
    });

    container.innerHTML = html;

    // Add click handlers for file mentions
    const fileMentions = container.querySelectorAll('.sgr-file-mention');
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

    return () => {
      clickHandlers.forEach(({ element, handler }) => {
        element.removeEventListener('click', handler);
      });
    };
  }, [content, app]);

  const processedContent = preprocessContent(content);

  return (
    <div ref={containerRef} className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
