"use client";

import React from "react";

// ---------------------------------------------------------------------------
// 1. Realistic 3D Sphere Component
// ---------------------------------------------------------------------------
export function Sphere3D({
  size = 50,
  className = "",
  style = {},
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="w-full h-full overflow-visible drop-shadow-[0_12px_24px_rgba(2,6,23,0.85)]"
      >
        <defs>
          {/* Radial 3D Sphere Lighting */}
          <radialGradient
            id={`sphereGrad-${id}`}
            cx="32%"
            cy="28%"
            r="68%"
            fx="28%"
            fy="24%"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="12%" stopColor="#BAE6FD" />
            <stop offset="28%" stopColor="#38BDF8" />
            <stop offset="52%" stopColor="#2563EB" />
            <stop offset="78%" stopColor="#1E3A8A" />
            <stop offset="94%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#071A33" />
          </radialGradient>

          {/* Ambient Rim Light from opposite side */}
          <radialGradient
            id={`sphereRim-${id}`}
            cx="72%"
            cy="76%"
            r="45%"
          >
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#1D4ED8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Specular Top Glint */}
          <filter id={`glintBlur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Ambient shadow underneath */}
        <ellipse
          cx="50"
          cy="92"
          rx="38"
          ry="7"
          fill="#020617"
          opacity="0.55"
        />

        {/* Main 3D Sphere Body */}
        <circle cx="50" cy="50" r="42" fill={`url(#sphereGrad-${id})`} />

        {/* Ambient Rim Reflection */}
        <circle cx="50" cy="50" r="42" fill={`url(#sphereRim-${id})`} />

        {/* Primary Specular Glint Reflection */}
        <ellipse
          cx="34"
          cy="30"
          rx="12"
          ry="7"
          transform="rotate(-30 34 30)"
          fill="#FFFFFF"
          opacity="0.75"
          filter={`url(#glintBlur-${id})`}
        />

        {/* Crisp Pinpoint Light Spark */}
        <circle cx="31" cy="27" r="2.5" fill="#FFFFFF" opacity="0.9" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Realistic 3D Transparent Glass Cube Component
// ---------------------------------------------------------------------------
export function GlassCube3D({
  size = 64,
  className = "",
  style = {},
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="w-full h-full overflow-visible drop-shadow-[0_16px_32px_rgba(2,6,23,0.9)]"
      >
        <defs>
          {/* Top Face Glass Gradient */}
          <linearGradient id={`cubeTop-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.2" />
          </linearGradient>

          {/* Left Face Glass Gradient */}
          <linearGradient id={`cubeLeft-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#2563EB" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.6" />
          </linearGradient>

          {/* Right Face Glass Gradient */}
          <linearGradient id={`cubeRight-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#1E40AF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0B1E3B" stopOpacity="0.75" />
          </linearGradient>

          {/* Neon Edge Glow Filter */}
          <filter id={`edgeGlow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Drop Shadow Under Cube */}
        <ellipse cx="60" cy="106" rx="42" ry="9" fill="#020617" opacity="0.6" />

        {/* Internal Refraction Wireframe Lines (Behind transparent faces) */}
        <line
          x1="60"
          y1="60"
          x2="60"
          y2="95"
          stroke="#38BDF8"
          strokeOpacity="0.25"
          strokeDasharray="3 3"
          strokeWidth="1.2"
        />
        <line
          x1="60"
          y1="60"
          x2="28"
          y2="42"
          stroke="#38BDF8"
          strokeOpacity="0.25"
          strokeDasharray="3 3"
          strokeWidth="1.2"
        />
        <line
          x1="60"
          y1="60"
          x2="92"
          y2="42"
          stroke="#38BDF8"
          strokeOpacity="0.25"
          strokeDasharray="3 3"
          strokeWidth="1.2"
        />

        {/* Left Isometric Glass Face */}
        <polygon
          points="28,42 60,60 60,95 28,78"
          fill={`url(#cubeLeft-${id})`}
          stroke="#38BDF8"
          strokeOpacity="0.7"
          strokeWidth="1.2"
          filter={`url(#edgeGlow-${id})`}
        />

        {/* Right Isometric Glass Face */}
        <polygon
          points="60,60 92,42 92,78 60,95"
          fill={`url(#cubeRight-${id})`}
          stroke="#38BDF8"
          strokeOpacity="0.7"
          strokeWidth="1.2"
          filter={`url(#edgeGlow-${id})`}
        />

        {/* Top Isometric Glass Face */}
        <polygon
          points="60,25 92,42 60,60 28,42"
          fill={`url(#cubeTop-${id})`}
          stroke="#E0F2FE"
          strokeOpacity="0.85"
          strokeWidth="1.4"
          filter={`url(#edgeGlow-${id})`}
        />

        {/* Specular Highlight along Front Ridge */}
        <line
          x1="60"
          y1="60"
          x2="60"
          y2="95"
          stroke="#FFFFFF"
          strokeOpacity="0.6"
          strokeWidth="1.4"
        />

        {/* Glowing Vertices */}
        <circle cx="60" cy="25" r="2" fill="#FFFFFF" opacity="0.9" />
        <circle cx="92" cy="42" r="1.8" fill="#7DD3FC" opacity="0.8" />
        <circle cx="28" cy="42" r="1.8" fill="#7DD3FC" opacity="0.8" />
        <circle cx="60" cy="60" r="2.2" fill="#FFFFFF" opacity="0.9" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Multi-Faceted 3D Origami Paper Plane on the Left
// ---------------------------------------------------------------------------
export function PaperPlane3D({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: 150, height: 130, ...style }}
    >
      {/* Soft Ambient Cyan Backlight Glow */}
      <div className="absolute inset-0 bg-[#38BDF8]/20 blur-2xl rounded-full scale-125 opacity-70" />

      <svg
        viewBox="0 0 160 140"
        width="150"
        height="130"
        className="relative w-full h-full overflow-visible drop-shadow-[0_18px_36px_rgba(2,6,23,0.9)]"
      >
        <defs>
          {/* Main Top Wing Gradient */}
          <linearGradient id={`planeMainWing-${id}`} x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="35%" stopColor="#38BDF8" />
            <stop offset="75%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>

          {/* Under/Left Wing Gradient */}
          <linearGradient id={`planeLeftWing-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="60%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>

          {/* Fuselage Spine Fold Shadow */}
          <linearGradient id={`planeFuselage-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="70%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#071A33" />
          </linearGradient>

          {/* Neon Vapor Contrail Gradient */}
          <linearGradient id={`trailGrad-${id}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#2563EB" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>

          <filter id={`trailGlow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Ground Shadow Under Paper Plane */}
        <ellipse cx="78" cy="126" rx="55" ry="10" fill="#020617" opacity="0.65" />

        {/* Neon Vapor Trail Streaming Behind the Paper Plane */}
        <path
          d="M 32 74 C 18 86, 6 100, 2 122"
          fill="none"
          stroke={`url(#trailGrad-${id})`}
          strokeWidth="3"
          strokeLinecap="round"
          filter={`url(#trailGlow-${id})`}
        />
        <path
          d="M 44 80 C 30 94, 20 108, 14 125"
          fill="none"
          stroke={`url(#trailGrad-${id})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Fuselage / Lower Keel Shaded Facet */}
        <polygon
          points="148,22 32,74 68,90"
          fill={`url(#planeFuselage-${id})`}
          stroke="#1E3A8A"
          strokeWidth="0.8"
        />

        {/* Under Left Wing Facet */}
        <polygon
          points="148,22 32,74 16,38"
          fill={`url(#planeLeftWing-${id})`}
          stroke="#38BDF8"
          strokeOpacity="0.4"
          strokeWidth="1"
        />

        {/* Main Upper Right Wing Facet (Dominant Facing Viewer) */}
        <polygon
          points="148,22 32,74 116,108"
          fill={`url(#planeMainWing-${id})`}
          stroke="#38BDF8"
          strokeOpacity="0.8"
          strokeWidth="1.2"
        />

        {/* Fold Ridge Specular Line Highlight */}
        <line
          x1="148"
          y1="22"
          x2="32"
          y2="74"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeOpacity="0.85"
        />

        {/* Leading Edge Specular Highlight */}
        <line
          x1="148"
          y1="22"
          x2="116"
          y2="108"
          stroke="#BAE6FD"
          strokeWidth="1.4"
          strokeOpacity="0.75"
        />

        {/* Sparkling Tip Glint */}
        <circle cx="148" cy="22" r="3" fill="#FFFFFF" opacity="0.95" />
        <circle cx="148" cy="22" r="6" fill="#38BDF8" opacity="0.5" filter={`url(#trailGlow-${id})`} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Floating 3D Group Icon on the Right
// ---------------------------------------------------------------------------
export function GroupIcon3D({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: 145, height: 135, ...style }}
    >
      {/* Soft Cyan/Indigo Backlight Aura */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#2563EB]/25 via-[#38BDF8]/25 to-[#6366F1]/20 blur-2xl rounded-full scale-125 opacity-75" />

      <svg
        viewBox="0 0 150 140"
        width="145"
        height="135"
        className="relative w-full h-full overflow-visible drop-shadow-[0_20px_40px_rgba(2,6,23,0.92)]"
      >
        <defs>
          {/* Frosted Glass Disc Base */}
          <linearGradient id={`discBase-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#0B2345" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#071A33" stopOpacity="0.95" />
          </linearGradient>

          {/* Disc Neon Border Rim */}
          <linearGradient id={`discBorder-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#38BDF8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.4" />
          </linearGradient>

          {/* 3D Primary Front Avatar Lighting */}
          <radialGradient id={`avatarFront-${id}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="15%" stopColor="#7DD3FC" />
            <stop offset="45%" stopColor="#38BDF8" />
            <stop offset="75%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </radialGradient>

          {/* Secondary Avatar Lighting */}
          <radialGradient id={`avatarBack-${id}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="35%" stopColor="#3B82F6" />
            <stop offset="75%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>

          <filter id={`groupGlow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse cx="75" cy="124" rx="55" ry="11" fill="#020617" opacity="0.65" />

        {/* 3D Glass Base Pedestal Disc */}
        <ellipse
          cx="75"
          cy="78"
          rx="58"
          ry="44"
          fill={`url(#discBase-${id})`}
          stroke={`url(#discBorder-${id})`}
          strokeWidth="1.8"
          filter={`url(#groupGlow-${id})`}
        />

        {/* Disc Top Specular Crescent Rim */}
        <path
          d="M 22 74 C 32 44, 118 44, 128 74"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />

        {/* 1. Left Secondary Avatar (Layered Behind) */}
        <g opacity="0.75">
          <circle cx="50" cy="58" r="14" fill={`url(#avatarBack-${id})`} />
          <path
            d="M 32 84 C 32 72, 68 72, 68 84"
            fill={`url(#avatarBack-${id})`}
          />
        </g>

        {/* 2. Right Secondary Avatar (Layered Behind) */}
        <g opacity="0.75">
          <circle cx="100" cy="58" r="14" fill={`url(#avatarBack-${id})`} />
          <path
            d="M 82 84 C 82 72, 118 72, 118 84"
            fill={`url(#avatarBack-${id})`}
          />
        </g>

        {/* 3. Front Center Avatar (Dominant 3D Hero) */}
        <g filter={`url(#groupGlow-${id})`}>
          {/* Head Sphere */}
          <circle
            cx="75"
            cy="52"
            r="17"
            fill={`url(#avatarFront-${id})`}
            stroke="#FFFFFF"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          {/* Specular Glint on Head */}
          <ellipse
            cx="69"
            cy="46"
            rx="5"
            ry="3"
            transform="rotate(-25 69 46)"
            fill="#FFFFFF"
            opacity="0.85"
          />
          {/* Shoulders / Bust */}
          <path
            d="M 52 86 C 52 70, 98 70, 98 86 C 98 90, 52 90, 52 86 Z"
            fill={`url(#avatarFront-${id})`}
            stroke="#38BDF8"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
        </g>

        {/* Floating 3D Online / Active Green-Cyan Status Pearl */}
        <circle cx="104" cy="40" r="5" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="1.2" />
        <circle cx="104" cy="40" r="8" fill="#38BDF8" opacity="0.4" filter={`url(#groupGlow-${id})`} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Glowing 3D Chat Bubble at the Top
// ---------------------------------------------------------------------------
export function GlowingChatBubbleTop({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: 130, height: 110, ...style }}
    >
      {/* Radiant Cyan Ambient Glow */}
      <div className="absolute inset-0 bg-[#38BDF8]/25 blur-2xl rounded-full scale-125 opacity-80" />

      <svg
        viewBox="0 0 140 120"
        width="130"
        height="110"
        className="relative w-full h-full overflow-visible drop-shadow-[0_20px_45px_rgba(2,6,23,0.95)]"
      >
        <defs>
          {/* Volumetric 3D Speech Bubble Radial Shading */}
          <radialGradient
            id={`bubbleBody-${id}`}
            cx="35%"
            cy="30%"
            r="68%"
            fx="30%"
            fy="25%"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="14%" stopColor="#7DD3FC" />
            <stop offset="35%" stopColor="#38BDF8" />
            <stop offset="65%" stopColor="#2563EB" />
            <stop offset="88%" stopColor="#1E3A8A" />
            <stop offset="100%" stopColor="#0B2345" />
          </radialGradient>

          {/* Specular Curved Highlight */}
          <linearGradient id={`bubbleSheen-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Neon Border Rim */}
          <linearGradient id={`bubbleBorder-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.5" />
          </linearGradient>

          <filter id={`bubbleGlow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse cx="68" cy="108" rx="46" ry="8" fill="#020617" opacity="0.6" />

        {/* 3D Speech Bubble Path with Tail */}
        <path
          d="M 26 24 C 26 12, 38 6, 70 6 C 102 6, 114 12, 114 24 C 114 50, 102 66, 70 66 C 60 66, 52 70, 42 80 C 44 72, 43 67, 38 66 C 30 65, 26 50, 26 24 Z"
          fill={`url(#bubbleBody-${id})`}
          stroke={`url(#bubbleBorder-${id})`}
          strokeWidth="1.8"
          filter={`url(#bubbleGlow-${id})`}
        />

        {/* Upper Specular Glass Dome Sheen */}
        <path
          d="M 32 20 C 40 12, 60 10, 80 10 C 95 10, 104 14, 108 20 C 98 14, 76 13, 56 15 C 42 16, 36 19, 32 20 Z"
          fill={`url(#bubbleSheen-${id})`}
        />

        {/* 3 Glowing 3D Message Indicator Dots */}
        <circle cx="52" cy="36" r="5" fill="#FFFFFF" opacity="0.95" />
        <circle cx="52" cy="36" r="7" fill="#7DD3FC" opacity="0.45" />

        <circle cx="70" cy="36" r="5" fill="#FFFFFF" opacity="0.95" />
        <circle cx="70" cy="36" r="7" fill="#7DD3FC" opacity="0.45" />

        <circle cx="88" cy="36" r="5" fill="#FFFFFF" opacity="0.95" />
        <circle cx="88" cy="36" r="7" fill="#7DD3FC" opacity="0.45" />

        {/* Small Specular Sparkle */}
        <circle cx="34" cy="18" r="2.5" fill="#FFFFFF" opacity="0.9" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Mini Floating Chat Bubble Illustration
// ---------------------------------------------------------------------------
export function MiniChatBubble3D({
  type = "dots",
  size = 54,
  className = "",
  style = {},
}: {
  type?: "dots" | "check";
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{ width: size, height: size * 0.85, ...style }}
    >
      <svg
        viewBox="0 0 80 68"
        width={size}
        height={size * 0.85}
        className="w-full h-full overflow-visible drop-shadow-[0_10px_20px_rgba(2,6,23,0.85)]"
      >
        <defs>
          <radialGradient id={`miniGrad-${id}`} cx="35%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="20%" stopColor="#7DD3FC" />
            <stop offset="60%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </radialGradient>
        </defs>

        {/* Mini Bubble Path */}
        <path
          d="M 12 16 C 12 8, 22 4, 40 4 C 58 4, 68 8, 68 16 C 68 34, 58 44, 40 44 C 34 44, 28 47, 22 54 C 23 49, 23 45, 19 44 C 14 43, 12 34, 12 16 Z"
          fill={`url(#miniGrad-${id})`}
          stroke="#38BDF8"
          strokeWidth="1.2"
          strokeOpacity="0.8"
        />

        {/* Specular Top Sheen */}
        <path
          d="M 18 13 C 24 8, 40 7, 56 8 C 62 9, 64 12, 64 13 C 58 9, 40 8, 26 9 C 20 10, 18 12, 18 13 Z"
          fill="#FFFFFF"
          opacity="0.65"
        />

        {/* Content Inside Mini Bubble */}
        {type === "dots" ? (
          <>
            <circle cx="28" cy="24" r="3" fill="#FFFFFF" opacity="0.9" />
            <circle cx="40" cy="24" r="3" fill="#FFFFFF" opacity="0.9" />
            <circle cx="52" cy="24" r="3" fill="#FFFFFF" opacity="0.9" />
          </>
        ) : (
          <path
            d="M 28 24 L 36 32 L 52 16"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Curved Neon-Blue Orbital Lines & Cosmic Trails
// ---------------------------------------------------------------------------
export function OrbitalLines3D() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
      <svg
        className="w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          {/* Main Sweeping Orbital Gradient */}
          <linearGradient id="orbitLineGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset="20%" stopColor="#38BDF8" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#2563EB" stopOpacity="0.4" />
            <stop offset="80%" stopColor="#60A5FA" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>

          {/* Secondary Counter Orbit Gradient */}
          <linearGradient id="orbitLineGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0" />
            <stop offset="30%" stopColor="#38BDF8" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#1D4ED8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>

          {/* Lower Elliptical Ring Gradient */}
          <linearGradient id="orbitRingGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.1" />
            <stop offset="45%" stopColor="#38BDF8" stopOpacity="0.65" />
            <stop offset="55%" stopColor="#93C5FD" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.1" />
          </linearGradient>

          <filter id="neonBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Major Orbit Track 1: Sweeps from top-left, curves around top bubble, loops down past right group */}
        <path
          d="M -100 240 C 250 80, 520 70, 720 130 C 960 200, 1280 340, 1540 680"
          stroke="url(#orbitLineGrad1)"
          strokeWidth="1.8"
          strokeDasharray="6 4"
          filter="url(#neonBlur)"
        />

        {/* Major Orbit Track 2: Tilted 3D perspective ellipse looping around the center card */}
        <ellipse
          cx="720"
          cy="460"
          rx="580"
          ry="220"
          transform="rotate(-12 720 460)"
          stroke="url(#orbitRingGrad)"
          strokeWidth="1.6"
          filter="url(#neonBlur)"
        />

        {/* Secondary Delicate Arc 3: Sweeps through lower left beneath paper plane */}
        <path
          d="M 50 680 C 260 540, 500 590, 720 660 C 940 730, 1180 720, 1400 580"
          stroke="url(#orbitLineGrad2)"
          strokeWidth="1.4"
          filter="url(#neonBlur)"
        />

        {/* Glowing Satellites / Starlight Glints Along the Orbits */}
        <g filter="url(#neonBlur)">
          <circle cx="340" cy="180" r="3.5" fill="#FFFFFF" />
          <circle cx="340" cy="180" r="8" fill="#38BDF8" opacity="0.6" />

          <circle cx="1060" cy="220" r="3" fill="#FFFFFF" />
          <circle cx="1060" cy="220" r="7" fill="#38BDF8" opacity="0.5" />

          <circle cx="280" cy="520" r="2.8" fill="#FFFFFF" />
          <circle cx="280" cy="520" r="6" fill="#60A5FA" opacity="0.5" />

          <circle cx="1180" cy="580" r="3" fill="#FFFFFF" />
          <circle cx="1180" cy="580" r="7" fill="#38BDF8" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Master 3D Background Environment Assembly
// ---------------------------------------------------------------------------
export function AuthBackground3D() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
      {/* ------------------------------------------------------------- */}
      {/* A. Soft Blue Ambient Lighting & Subtle Radial Reflections     */}
      {/* ------------------------------------------------------------- */}
      {/* Deep Center Radial Bloom */}
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[550px] bg-gradient-to-b from-[#2563EB]/15 via-[#38BDF8]/10 to-transparent blur-[120px] rounded-full" />

      {/* Top Center Chat Bubble Ambient Glow */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[420px] h-[220px] bg-[#38BDF8]/15 blur-[90px] rounded-full" />

      {/* Left Paper Plane Ambient Glow */}
      <div className="absolute top-[42%] left-[8%] w-[380px] h-[340px] bg-[#2563EB]/18 blur-[100px] rounded-full" />

      {/* Right Group Icon Ambient Glow */}
      <div className="absolute top-[40%] right-[8%] w-[380px] h-[340px] bg-[#38BDF8]/16 blur-[100px] rounded-full" />

      {/* Subtle Bottom Light Reflection Floor Grounding */}
      <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#0B2345]/50 via-transparent to-transparent pointer-events-none" />

      {/* ------------------------------------------------------------- */}
      {/* B. Curved Neon-Blue Orbital Lines                             */}
      {/* ------------------------------------------------------------- */}
      <OrbitalLines3D />

      {/* ------------------------------------------------------------- */}
      {/* C. 3D Floating Elements (Positioned per Reference Composition)*/}
      {/* ------------------------------------------------------------- */}

      {/* 1. Glowing 3D Chat Bubble at the Top */}
      <div className="absolute top-6 sm:top-10 md:top-14 left-1/2 -translate-x-1/2 z-10 animate-float-slow">
        <GlowingChatBubbleTop />
      </div>

      {/* 2. 3D Paper Plane on the Left */}
      <div className="hidden md:block absolute left-4 lg:left-12 xl:left-24 top-[38%] -translate-y-1/2 z-10 animate-float-slow">
        <PaperPlane3D />
      </div>

      {/* 3. Floating 3D Group Icon on the Right */}
      <div className="hidden md:block absolute right-4 lg:left-auto lg:right-12 xl:right-24 top-[40%] -translate-y-1/2 z-10 animate-float-delayed">
        <GroupIcon3D />
      </div>

      {/* 4. Floating 3D Spheres (Multiple Sizes & Depths) */}
      {/* Sphere 1: Large Glossy Blue Sphere (Top-Right of Card) */}
      <div className="hidden sm:block absolute right-[10%] lg:right-[18%] top-[14%] z-10 animate-float-slow">
        <Sphere3D size={64} />
      </div>

      {/* Sphere 2: Medium Glossy Blue Sphere (Bottom-Left) */}
      <div className="hidden sm:block absolute left-[8%] lg:left-[16%] bottom-[14%] z-10 animate-float-reverse">
        <Sphere3D size={48} />
      </div>

      {/* Sphere 3: Small Glossy Blue Sphere (Upper-Left near Plane) */}
      <div className="hidden lg:block absolute left-[22%] top-[18%] z-10 animate-float-delayed">
        <Sphere3D size={32} />
      </div>

      {/* Sphere 4: Mini Blue Pearl Sphere (Lower-Right) */}
      <div className="hidden lg:block absolute right-[22%] bottom-[20%] z-10 animate-float-slow">
        <Sphere3D size={24} />
      </div>

      {/* 5. Transparent Blue 3D Cubes */}
      {/* Cube 1: Upper-Left Isometric Glass Cube */}
      <div className="hidden lg:block absolute left-[6%] top-[22%] z-10 animate-float-delayed">
        <GlassCube3D size={66} />
      </div>

      {/* Cube 2: Lower-Right Isometric Glass Cube */}
      <div className="hidden lg:block absolute right-[7%] bottom-[16%] z-10 animate-float-reverse">
        <GlassCube3D size={52} />
      </div>

      {/* 6. Small Floating Chat Bubble Illustrations */}
      {/* Mini Bubble 1: Floating with dots near the lower left */}
      <div className="hidden md:block absolute left-[18%] top-[56%] z-10 animate-float-delayed">
        <MiniChatBubble3D type="dots" size={56} />
      </div>

      {/* Mini Bubble 2: Floating with checkmark near upper right */}
      <div className="hidden md:block absolute right-[17%] top-[58%] z-10 animate-float-slow">
        <MiniChatBubble3D type="check" size={50} />
      </div>
    </div>
  );
}

