"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { AuthBackground3D } from "./AuthBackground3D";

interface AuthCard3DProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthCard3D({ title, subtitle, children }: AuthCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [supportsTilt, setSupportsTilt] = useState(false);

  useEffect(() => {
    // Only enable 3D mouse tilt if device is not touch and user doesn't prefer reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setSupportsTilt(!prefersReducedMotion && !isTouchDevice);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!supportsTilt || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate normalized rotation (-4.5 deg to +4.5 deg)
    const xPct = mouseX / width;
    const yPct = mouseY / height;

    const rotateX = (yPct - 0.5) * -9; // Inverted so pushing top rotates forward
    const rotateY = (xPct - 0.5) * 9;

    setTilt({ x: parseFloat(rotateX.toFixed(2)), y: parseFloat(rotateY.toFixed(2)) });
    setGlare({ x: parseFloat((xPct * 100).toFixed(1)), y: parseFloat((yPct * 100).toFixed(1)) });
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 50, y: 50 });
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto bg-[#071A33] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      {/* ------------------------------------------------------------- */}
      {/* 1. Exact 3D Background Environment Scene (SVG + CSS 3D Depth) */}
      {/* ------------------------------------------------------------- */}
      <AuthBackground3D />

      {/* ------------------------------------------------------------- */}
      {/* 2. Main Interactive 3D Glassmorphic Card                      */}
      {/* ------------------------------------------------------------- */}
      <div
        className="relative z-10 w-full max-w-sm sm:max-w-md my-auto pt-14 sm:pt-16 pb-8"
        style={{ perspective: "1000px" }}
      >
        {/* Soft Ambient Cyan-Blue Neon Backlight behind Card */}
        <div className="absolute -inset-3 rounded-[32px] bg-gradient-to-tr from-[#2563EB]/25 via-[#38BDF8]/20 to-[#6366F1]/20 blur-2xl opacity-75 pointer-events-none" />

        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative rounded-[24px] p-6 sm:p-8 bg-[#0B2345]/85 backdrop-blur-2xl border border-cyan-400/25 shadow-[0_25px_60px_-15px_rgba(2,6,23,0.92),0_0_35px_rgba(37,99,235,0.22),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all duration-300"
          style={{
            transform: supportsTilt
              ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
              : "none",
            transformStyle: "preserve-3d",
            transition: isHovering
              ? "transform 0.08s ease-out"
              : "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          {/* Dynamic Specular Glass Glare Sheen Overlay */}
          {supportsTilt && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[24px] transition-opacity duration-300"
              style={{
                opacity: isHovering ? 0.6 : 0,
                background: `radial-gradient(550px circle at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, 0.12), transparent 45%)`,
              }}
            />
          )}

          {/* Top Edge Specular Rim Light */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] rounded-t-[24px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* Bottom Edge Subtle Accent Glow */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] rounded-b-[24px] bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent" />

          {/* Header: 3D Logo Icon, Brand Title & Subtitle */}
          <div className="flex flex-col items-center text-center gap-2 mb-6">
            {/* 3D Glowing App Icon Badge */}
            <div className="relative group cursor-default">
              {/* Outer soft colored glow pulse */}
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#2563EB] via-[#38BDF8] to-[#60A5FA] opacity-75 blur-[8px] transition duration-500 group-hover:opacity-100 group-hover:blur-[12px]" />

              {/* 3D Physical Icon Box */}
              <div className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] p-[1.5px] shadow-[0_8px_20px_rgba(37,99,235,0.45),inset_0_2px_2px_rgba(255,255,255,0.4)] flex items-center justify-center transform transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-0.5">
                <div className="w-full h-full rounded-[14px] bg-[#071A33]/30 backdrop-blur-sm flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
                </div>
              </div>
            </div>

            {/* Brand Title with Specular Gradient */}
            <h1 className="text-[23px] sm:text-[25px] font-bold tracking-tight bg-gradient-to-r from-white via-[#F8FAFC] to-[#CBD5E1] bg-clip-text text-transparent mt-1">
              {title}
            </h1>

            {/* Subtitle */}
            <p className="text-[13px] text-[#94A3B8] font-normal leading-tight">
              {subtitle}
            </p>
          </div>

          {/* Card Body: Form Fields & Actions */}
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
