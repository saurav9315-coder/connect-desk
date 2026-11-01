"use client";

import React, { useState } from "react";
import { FileText, Download, Eye, X } from "lucide-react";
import { VoicePlayer } from "./VoicePlayer";
import { getApiBaseUrl } from "@/lib/api";

interface MediaMessageProps {
  type: "TEXT" | "IMAGE" | "VIDEO" | "FILE" | "VOICE" | "AI";
  fileUrl: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  isMe?: boolean;
  accessToken?: string | null;
}

export function MediaMessage({
  type,
  fileUrl,
  fileName,
  fileSize,
  duration,
  isMe = false,
  accessToken,
}: MediaMessageProps) {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  if (!fileUrl) return null;

  // Resolve media URL with authentication token query parameter for protected group media
  const resolveUrl = (url: string, download = false) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;

    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const apiUrl = getApiBaseUrl();
      const baseUrl = apiUrl.replace(/\/api$/, "");
      fullUrl = `${baseUrl}${url}`;
    }

    const separator = fullUrl.includes("?") ? "&" : "?";
    const queryParts: string[] = [];
    if (accessToken) queryParts.push(`token=${encodeURIComponent(accessToken)}`);
    if (download) queryParts.push("download=true");

    return queryParts.length > 0 ? `${fullUrl}${separator}${queryParts.join("&")}` : fullUrl;
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resolvedMediaSrc = resolveUrl(fileUrl);
  const downloadUrl = resolveUrl(fileUrl, true);
  const displayName = fileName || "attachment";

  switch (type) {
    case "IMAGE":
      return (
        <div className="mb-1.5">
          {/* Image Thumbnail with Click-to-preview */}
          <div
            onClick={() => setIsImageModalOpen(true)}
            className="group relative rounded-[12px] overflow-hidden cursor-pointer max-h-72 max-w-sm border border-cyan-400/20 shadow-[0_6px_18px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)] bg-black/30 transition-transform duration-200 hover:scale-[1.01]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedMediaSrc}
              alt={displayName}
              className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="p-2 rounded-full bg-black/60 text-white shadow-md">
                <Eye className="w-4 h-4" />
              </span>
            </div>
          </div>

          {/* Lightbox Modal */}
          {isImageModalOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
              onClick={() => setIsImageModalOpen(false)}
            >
              <div
                className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <a
                    href={downloadUrl}
                    download={displayName}
                    className="p-2 rounded-full bg-black/60 hover:bg-black text-white transition-colors"
                    title="Download Image"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  <button
                    onClick={() => setIsImageModalOpen(false)}
                    className="p-2 rounded-full bg-black/60 hover:bg-black text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedMediaSrc}
                  alt={displayName}
                  className="max-h-[85vh] max-w-full rounded-[10px] object-contain shadow-2xl"
                />
              </div>
            </div>
          )}
        </div>
      );

    case "VIDEO":
      return (
        <div className="mb-1.5 max-w-sm rounded-[10px] overflow-hidden border border-[#19345A] bg-black/40">
          <video
            src={resolvedMediaSrc}
            controls
            className="w-full max-h-72 object-contain"
            preload="metadata"
          />
        </div>
      );

    case "VOICE":
      return (
        <div className="mb-1">
          <VoicePlayer src={resolvedMediaSrc} duration={duration} isMe={isMe} />
        </div>
      );

    case "FILE":
    default:
      return (
        <div
          className={`flex items-center justify-between gap-3 p-3 rounded-[12px] my-1 max-w-sm transition-all duration-200 ${
            isMe
              ? "bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)]"
              : "bg-[#071A33]/80 backdrop-blur-md border border-cyan-400/20 text-[#F8FAFC] shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.08)]"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                isMe
                  ? "bg-white/20 text-white border border-white/30"
                  : "bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white border border-cyan-400/30 shadow-[0_2px_8px_rgba(37,99,235,0.35)]"
              }`}
            >
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate">{displayName}</p>
              {fileSize && (
                <p
                  className={`text-[11px] ${
                    isMe ? "text-white/80" : "text-[#94A3B8]"
                  }`}
                >
                  {formatFileSize(fileSize)}
                </p>
              )}
            </div>
          </div>

          <a
            href={downloadUrl}
            download={displayName}
            className={`p-2 rounded-[10px] transition-all duration-200 shrink-0 hover:scale-105 active:scale-95 ${
              isMe
                ? "hover:bg-white/20 text-white"
                : "hover:bg-[#0B2345] text-[#38BDF8] hover:text-white hover:shadow-[0_0_10px_rgba(56,189,248,0.3)]"
            }`}
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      );
  }
}
