"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { GroupSidebar } from "@/components/groups/GroupSidebar";
import { MessageSquare, Loader2 } from "lucide-react";

export default function HomePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#071A33] flex flex-col items-center justify-center text-[#94A3B8] gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
        <span className="text-[13px]">Loading ConnectDesk...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen max-h-[100dvh] bg-[#071A33] text-[#F8FAFC] overflow-hidden">
      {/* AREA 1: Group List (Full width on mobile, 340-380px on desktop) */}
      <div className="w-full md:w-[340px] lg:w-[380px] shrink-0 h-full flex flex-col">
        <GroupSidebar selectedGroupId={null} />
      </div>

      {/* AREA 2: Desktop placeholder when no group is selected */}
      <div className="hidden md:flex flex-1 flex-col h-full items-center justify-center bg-[#081D38] text-center p-8 select-none">
        <div className="max-w-xs space-y-4 flex flex-col items-center">
          {/* 3D Floating Liquid Glass Chat Icon */}
          <div className="relative group cursor-default animate-float-slow">
            {/* Outer subtle cyber neon glow */}
            <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-tr from-[#2563EB] via-[#38BDF8] to-[#60A5FA] opacity-35 blur-[10px] group-hover:opacity-70 group-hover:blur-[14px] transition-all duration-500" />
            
            {/* 3D Physical Liquid Glass Container */}
            <div className="relative w-16 h-16 rounded-2xl bg-[#0B2345]/90 border border-cyan-400/30 backdrop-blur-md shadow-[0_12px_28px_rgba(2,6,23,0.7),0_0_20px_rgba(56,189,248,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)] flex items-center justify-center text-[#38BDF8] transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-1">
              {/* Specular top rim light */}
              <div className="pointer-events-none absolute inset-x-2 top-0 h-[1.5px] rounded-t-2xl bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <MessageSquare className="w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
            </div>
          </div>

          <div>
            <h2 className="text-[19px] font-semibold text-[#F8FAFC] tracking-tight">ConnectDesk</h2>
            <p className="text-[13px] text-[#94A3B8] mt-1.5 leading-relaxed">
              Select a group from the list or create a new group to start messaging.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
