"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

interface VoicePlayerProps {
  src: string;
  duration?: number | null;
  isMe?: boolean;
}

export function VoicePlayer({ src, duration: initialDuration, isMe = false }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop playback if another voice message starts playing
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== src && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("chat:audio:play", handleOtherPlay);
      return () => {
        window.removeEventListener("chat:audio:play", handleOtherPlay);
      };
    }
  }, [src, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setHasError(false);
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsPlaying(false);
      setHasError(true);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("chat:audio:play", { detail: { id: src } }));
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setHasError(false);
        })
        .catch((e) => {
          console.error("Audio playback error:", e);
          setIsPlaying(false);
          setHasError(true);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatSec = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-[12px] transition-all duration-200 ${
        isMe
          ? "bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)]"
          : "bg-[#071A33]/80 backdrop-blur-md border border-cyan-400/20 text-[#F8FAFC] shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.08)]"
      }`}
      style={{ minWidth: "200px", maxWidth: "300px" }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button with 3D tactile feedback */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${
          isMe
            ? "bg-white text-[#2563EB] hover:bg-slate-100 shadow-[0_2px_8px_rgba(255,255,255,0.3)]"
            : "bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white hover:brightness-110 border border-cyan-400/30 shadow-[0_2px_8px_rgba(37,99,235,0.4)]"
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Waveform / Progress Slider */}
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        {hasError ? (
          <div className="text-[11px] text-rose-400 flex items-center gap-1 py-1">
            <span>Unable to play audio</span>
          </div>
        ) : (
          <>
            <div className="relative w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-[#19345A] rounded-lg appearance-none cursor-pointer accent-[#60A5FA]"
                style={{
                  background: `linear-gradient(to right, ${isMe ? "#FFFFFF" : "#3B82F6"} ${progressPercent}%, #19345A ${progressPercent}%)`,
                }}
              />
            </div>

            {/* Time display */}
            <div className="flex justify-between items-center text-[10px] text-[#94A3B8]">
              <span>{formatSec(currentTime)}</span>
              <span>{formatSec(duration)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
