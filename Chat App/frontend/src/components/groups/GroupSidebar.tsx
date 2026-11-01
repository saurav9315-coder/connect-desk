"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
import {
  MessageSquare,
  Search,
  Plus,
  Pin,
  Loader2,
  LogOut,
  X,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

export interface GroupItem {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  userRole: "OWNER" | "ADMIN" | "MEMBER";
  memberCount: number;
  isPinned?: boolean;
  pinnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroupSidebarProps {
  selectedGroupId?: string | null;
  onSelectGroup?: (groupId: string) => void;
}

export function GroupSidebar({ selectedGroupId, onSelectGroup }: GroupSidebarProps) {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [pinLoadingId, setPinLoadingId] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        const rawGroups: GroupItem[] = json.data?.groups || [];
        // Deduplicate groups by ID to guarantee unique React keys
        const uniqueGroups = Array.from(new Map(rawGroups.map((g) => [g.id, g])).values());
        // Sort: pinned first
        uniqueGroups.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
          }
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setGroups(uniqueGroups);
      }
    } catch (e) {
      console.error("Failed to load groups:", e);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      fetchGroups();
    }
  }, [accessToken, fetchGroups]);

  const handleTogglePin = async (e: React.MouseEvent, groupId: string, currentlyPinned?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!accessToken || pinLoadingId) return;

    setPinLoadingId(groupId);
    try {
      const apiUrl = getApiBaseUrl();
      const method = currentlyPinned ? "DELETE" : "POST";
      const res = await fetch(`${apiUrl}/groups/${groupId}/pin`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error("Failed to update pin state");

      setGroups((prev) => {
        const updated = prev.map((g) => {
          if (g.id === groupId) {
            return {
              ...g,
              isPinned: !currentlyPinned,
              pinnedAt: !currentlyPinned ? new Date().toISOString() : null,
            };
          }
          return g;
        });

        // Re-sort: pinned first
        updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
          }
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        return updated;
      });
    } catch (err) {
      console.error("Pin toggle error:", err);
    } finally {
      setPinLoadingId(null);
    }
  };

  const handleGroupClick = (groupId: string) => {
    if (onSelectGroup) {
      onSelectGroup(groupId);
    } else {
      router.push(`/groups/${groupId}`);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-[#071A33] text-[#F8FAFC] select-none border-r border-[#19345A]">
      {/* Header per PRD Section 8: App name, User avatar, Search icon, Create group button */}
      <div className="p-3.5 border-b border-[#19345A] bg-[#071A33] shrink-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between">
          {/* App Name & 3D Liquid Glass Logo */}
          <div className="flex items-center gap-2.5">
            <div className="relative group cursor-pointer">
              {/* Subtle cyber neon glow */}
              <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#38BDF8] opacity-50 blur-[5px] group-hover:opacity-90 group-hover:blur-[8px] transition-all duration-300" />
              <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 shadow-[0_4px_12px_rgba(37,99,235,0.45),inset_0_1px_1px_rgba(255,255,255,0.4)] flex items-center justify-center text-white transition-transform duration-200 group-hover:scale-105 group-hover:-translate-y-0.5">
                <MessageSquare className="w-4 h-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
              </div>
            </div>
            <span className="text-[18px] font-bold tracking-tight text-[#F8FAFC]">
              ConnectDesk
            </span>
          </div>

          {/* Action Icons: Search, Create Group, User Avatar */}
          <div className="flex items-center gap-1">
            {/* Search Icon */}
            <button
              type="button"
              onClick={() => {
                setShowSearchInput(!showSearchInput);
                if (showSearchInput) setSearchQuery("");
              }}
              className={`p-2 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                showSearchInput ? "bg-[#0B2345] text-[#38BDF8] shadow-[0_0_10px_rgba(56,189,248,0.25)] border border-cyan-400/20" : ""
              }`}
              title="Search groups"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Create Group Button */}
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="p-2 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] hover:shadow-[0_0_12px_rgba(56,189,248,0.2)] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              title="Create group"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* User Avatar with 3D Dimensional Border & Dropdown */}
            <div className="relative ml-1">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-8 h-8 rounded-full bg-[#0B2345] border border-cyan-400/25 text-[#60A5FA] flex items-center justify-center text-xs font-bold uppercase overflow-hidden cursor-pointer shadow-[0_3px_8px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(255,255,255,0.25)] hover:border-[#38BDF8] hover:shadow-[0_0_12px_rgba(56,189,248,0.35),inset_0_1px_2px_rgba(255,255,255,0.3)] transition-all duration-200 hover:scale-105 active:scale-95"
                title={user?.name || "Account"}
              >
                {user?.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user?.name ? user.name.slice(0, 2).toUpperCase() : "ME"
                )}
              </button>

              {isUserMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-10 z-50 w-52 rounded-[14px] bg-[#0B2345]/95 backdrop-blur-xl border border-cyan-400/20 p-2 shadow-[0_16px_36px_rgba(2,6,23,0.7),0_0_20px_rgba(56,189,248,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)] space-y-1 animate-in fade-in">
                    <div className="px-3 py-2 border-b border-[#19345A]">
                      <p className="text-[13px] font-semibold text-[#F8FAFC] truncate">{user?.name}</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">@{user?.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full px-3 py-2 rounded-[10px] hover:bg-rose-500/10 text-rose-300 text-[13px] flex items-center gap-2 transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expandable Simple Search Bar with Glass Depth */}
        {showSearchInput && (
          <div className="mt-2.5 relative animate-in fade-in">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups..."
              autoFocus
              className="w-full rounded-[10px] bg-[#0B2345]/85 backdrop-blur-md border border-[#19345A] focus:border-[#38BDF8] pl-8 pr-8 py-1.5 text-[13px] text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:ring-1 focus:ring-[#38BDF8]/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] focus:shadow-[0_0_14px_rgba(56,189,248,0.22)] transition-all duration-200"
            />
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Group rows per PRD Section 8 */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#19345A]/50">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-[#0B2345]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-[#0B2345] rounded w-24" />
                  <div className="h-3 bg-[#0B2345] rounded w-36" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-6 text-center text-[#94A3B8] space-y-2">
            <p className="text-[13px]">
              {searchQuery ? "No groups match your search" : "No groups yet"}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 text-white text-xs font-medium shadow-[0_4px_12px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.55),0_0_12px_rgba(56,189,248,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Group</span>
              </button>
            )}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            return (
              <div
                key={group.id}
                onClick={() => handleGroupClick(group.id)}
                className={`group relative flex items-center gap-3 px-3.5 py-3 cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-[#0B2345]/90 backdrop-blur-md text-[#F8FAFC] shadow-[0_4px_16px_rgba(2,6,23,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] -translate-y-0.5"
                    : "hover:bg-[#0B2345]/60 hover:-translate-y-0.5 text-[#CBD5E1] hover:shadow-[0_4px_14px_rgba(2,6,23,0.35)]"
                }`}
              >
                {/* Active neon indicator bar */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#38BDF8] to-[#2563EB] shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
                )}

                {/* Group Avatar (3D Dimensional Border & Depth) */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#0B2345] border border-cyan-400/20 shadow-[0_4px_10px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center font-bold text-white text-sm overflow-hidden group-hover:border-cyan-400/40 group-hover:scale-[1.03] transition-all duration-200">
                    {group.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                    ) : (
                      group.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                </div>

                {/* Group Info: Name, Last Message / Preview, Time, Pin Icon */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-[15px] font-semibold text-[#F8FAFC] truncate">
                      {group.name}
                    </h3>
                    <span className="text-[11px] text-[#94A3B8] shrink-0">
                      {formatTime(group.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-[13px] text-[#94A3B8] truncate">
                      {group.description || `${group.memberCount} members`}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Pinned Icon (Subtle Neon Blue) */}
                      {group.isPinned && (
                        <Pin className="w-3.5 h-3.5 text-[#38BDF8] fill-current drop-shadow-[0_0_4px_rgba(56,189,248,0.4)]" />
                      )}

                      {/* Quick Pin toggle button on hover */}
                      <button
                        type="button"
                        onClick={(e) => handleTogglePin(e, group.id, group.isPinned)}
                        disabled={pinLoadingId === group.id}
                        className={`p-1 rounded-[6px] transition-all duration-200 ${
                          group.isPinned
                            ? "opacity-0 group-hover:opacity-100 hover:text-white"
                            : "opacity-0 group-hover:opacity-100 hover:text-[#38BDF8] hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]"
                        }`}
                        title={group.isPinned ? "Unpin group" : "Pin group"}
                      >
                        {pinLoadingId === group.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#94A3B8]" />
                        ) : (
                          <Pin className={`w-3 h-3 ${group.isPinned ? "text-[#38BDF8]" : "text-[#94A3B8]"}`} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGroupCreated={(newGroup) => {
          fetchGroups();
          if (newGroup?.id) {
            handleGroupClick(newGroup.id);
          }
        }}
      />
    </div>
  );
}
