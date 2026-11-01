"use client";

import React, { useState } from "react";
import { Sparkles, Copy, Check, Clock, Bot } from "lucide-react";

interface AIMessageBubbleProps {
  content: string;
  createdAt: string;
}

export function AIMessageBubble({ content, createdAt }: AIMessageBubbleProps) {
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex items-start gap-2.5 my-2 max-w-[85%] sm:max-w-[70%] group">
      {/* AI Bot Avatar with 3D Dimensional Border */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)] text-white">
        <Bot className="w-4 h-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
      </div>

      <div className="flex flex-col items-start min-w-0 flex-1">
        {/* AI Label */}
        <div className="flex items-center gap-1.5 mb-1 pl-0.5">
          <span className="text-[12px] font-semibold text-[#38BDF8] flex items-center gap-1 drop-shadow-[0_0_6px_rgba(56,189,248,0.35)]">
            <Sparkles className="w-3 h-3 text-[#38BDF8]" />
            AI Assistant
          </span>
        </div>

        {/* Bubble Surface: 3D Liquid Glass with Cyber Neon Accent */}
        <div className="w-full bg-[#0B2345]/90 backdrop-blur-md border border-cyan-400/20 rounded-[16px] rounded-tl-sm px-4 py-3 shadow-[0_8px_24px_rgba(2,6,23,0.55),0_0_15px_rgba(56,189,248,0.08),inset_0_1px_1px_rgba(255,255,255,0.15)] text-[#F8FAFC] text-[15px] space-y-2.5">
          <MarkdownRenderer content={content} />

          {/* Timestamp */}
          <div className="flex items-center justify-end gap-1 pt-1 text-[11px] text-[#94A3B8]">
            <Clock className="w-2.5 h-2.5" />
            <span>{formatTime(createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Markdown & Code Renderer (Display-only)
// -------------------------------------------------------------

function MarkdownRenderer({ content }: { content: string }) {
  // Split content by code blocks: ```lang\ncode\n```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Extract language and code
          const firstLineEnd = part.indexOf("\n");
          let language = "code";
          let code = "";

          if (firstLineEnd !== -1) {
            language = part.slice(3, firstLineEnd).trim() || "code";
            code = part.slice(firstLineEnd + 1, -3).replace(/\n$/, "");
          } else {
            code = part.slice(3, -3);
          }

          return <CodeBlock key={index} code={code} language={language} />;
        }

        return <TextMarkdownBlock key={index} text={part} />;
      })}
    </div>
  );
}

// -------------------------------------------------------------
// Syntax-Highlighted Code Block with One-Click Copy Button
// -------------------------------------------------------------

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="rounded-[10px] overflow-hidden border border-[#19345A] bg-[#071A33] my-2 text-xs">
      {/* Code Header with Language and Copy */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#081D38] border-b border-[#19345A] text-[11px] text-[#94A3B8]">
        <span className="font-mono uppercase">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[#F8FAFC] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <pre className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed text-[#F8FAFC]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// -------------------------------------------------------------
// Formatted Text Renderer (Lists, Bold, Italics, Paragraphs)
// -------------------------------------------------------------

function TextMarkdownBlock({ text }: { text: string }) {
  if (!text.trim()) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Bullet point
        if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
          const itemText = trimmed.slice(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#3B82F6] font-bold mt-1 text-xs">•</span>
              <p className="flex-1">{formatInline(itemText)}</p>
            </div>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#60A5FA] font-medium text-xs mt-0.5">{numMatch[1]}.</span>
              <p className="flex-1">{formatInline(numMatch[2])}</p>
            </div>
          );
        }

        // Header ###
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-semibold text-[15px] text-[#F8FAFC] pt-1">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }

        // Header ##
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-bold text-[16px] text-[#F8FAFC] pt-1.5">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }

        return <p key={idx}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(text: string): React.ReactNode {
  // Parse inline bold **text** and `code`
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith("`") && seg.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-[#071A33] border border-[#19345A] text-[#60A5FA] font-mono text-xs"
        >
          {seg.slice(1, -1)}
        </code>
      );
    }
    return seg;
  });
}
