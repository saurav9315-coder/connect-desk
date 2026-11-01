"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api";
import { X, Users, Loader2, AlertCircle } from "lucide-react";

interface UserSearchItem {
  id: string;
  name: string;
  username: string;
  email: string;
  profileImage: string | null;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (newGroup: any) => void;
}

export function CreateGroupModal({ isOpen, onClose, onGroupCreated }: CreateGroupModalProps) {
  const { accessToken } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<UserSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search users as query changes
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const apiUrl = getApiBaseUrl();
        const res = await fetch(`${apiUrl}/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const json = await res.json();
          const unselected = (json.data.users || []).filter(
            (u: UserSearchItem) => !selectedMembers.some((sm) => sm.id === u.id)
          );
          setSearchResults(unselected);
        }
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, accessToken, selectedMembers]);

  if (!isOpen) return null;

  const handleSelectMember = (user: UserSearchItem) => {
    setSelectedMembers((prev) => [...prev, user]);
    setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
    setSearchQuery("");
  };

  const handleRemoveSelectedMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
          initialMemberIds: selectedMembers.map((m) => m.id),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create group");
      }

      onGroupCreated(json.data.group);
      onClose();
      setName("");
      setDescription("");
      setAvatarUrl("");
      setSelectedMembers([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create group";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-[16px] border border-cyan-400/20 bg-[#0B2345]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(2,6,23,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-5 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#19345A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 flex items-center justify-center text-white shadow-[0_2px_8px_rgba(37,99,235,0.4)]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[#F8FAFC]">Create Group</h2>
              <p className="text-[12px] text-[#94A3B8]">Start a new group chat</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071A33] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-[10px] p-2.5 bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Group Name */}
          <div className="space-y-1">
            <label htmlFor="group-name" className="text-[13px] font-medium text-[#CBD5E1]">Group Name *</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Team"
              disabled={isLoading}
              className="w-full rounded-[10px] bg-[#071A33] border border-[#19345A] focus:border-[#3B82F6] px-3.5 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:ring-1 focus:ring-[#3B82F6] transition-colors"
            />
          </div>

          {/* Group Description */}
          <div className="space-y-1">
            <label htmlFor="group-desc" className="text-[13px] font-medium text-[#CBD5E1]">
              Description <span className="text-[#94A3B8] text-xs">(Optional)</span>
            </label>
            <textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Group topic or description..."
              rows={2}
              disabled={isLoading}
              className="w-full rounded-[10px] bg-[#071A33] border border-[#19345A] focus:border-[#3B82F6] px-3.5 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:ring-1 focus:ring-[#3B82F6] transition-colors resize-none"
            />
          </div>

          {/* Add Initial Members */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[#CBD5E1]">
              Add Members <span className="text-[#94A3B8] text-xs">(Optional)</span>
            </label>
            
            {/* Selected Members Chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-[10px] bg-[#071A33] border border-[#19345A]">
                {selectedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2563EB]/20 border border-[#2563EB]/40 text-[#60A5FA] text-xs"
                  >
                    <span>{m.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSelectedMember(m.id)}
                      className="text-[#60A5FA] hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user to add..."
                disabled={isLoading}
                className="w-full rounded-[10px] bg-[#071A33] border border-[#19345A] focus:border-[#3B82F6] px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:ring-1 focus:ring-[#3B82F6] transition-colors"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#94A3B8]" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="max-h-36 overflow-y-auto rounded-[10px] bg-[#071A33] border border-[#19345A] divide-y divide-[#19345A]">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectMember(u)}
                    className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[#0B2345] transition-colors text-xs cursor-pointer"
                  >
                    <div>
                      <p className="font-medium text-[#F8FAFC]">{u.name}</p>
                      <p className="text-[11px] text-[#94A3B8]">@{u.username}</p>
                    </div>
                    <span className="text-[#3B82F6] font-medium">+ Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#19345A]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-[10px] bg-transparent hover:bg-[#071A33] text-[#94A3B8] hover:text-[#F8FAFC] text-[13px] font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="px-4 py-2 rounded-[10px] bg-gradient-to-b from-[#3B82F6] via-[#2563EB] to-[#1D4ED8] border border-cyan-400/30 text-white text-[13px] font-medium transition-all duration-200 shadow-[0_4px_14px_rgba(37,99,235,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.6),0_0_14px_rgba(56,189,248,0.4)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-1.5 cursor-pointer"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Group</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
