"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api";
import {
  X,
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  UserPlus,
  Trash2,
  LogOut,
  Loader2,
  AlertCircle,
  MoreVertical,
  Check,
} from "lucide-react";

interface MemberItem {
  id: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    profileImage: string | null;
  };
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  currentUserRole: "OWNER" | "ADMIN" | "MEMBER";
  memberCount: number;
  members: MemberItem[];
}

interface UserSearchResult {
  id: string;
  name: string;
  username: string;
  email: string;
  profileImage: string | null;
}

interface GroupInfoModalProps {
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onGroupUpdated?: () => void;
}

export function GroupInfoModal({ groupId, isOpen, onClose, onGroupUpdated }: GroupInfoModalProps) {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Add Member State
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Block User Dialog State per PRD Section 15
  const [blockTarget, setBlockTarget] = useState<{
    user: { id: string; name: string; username: string };
    isBlocked: boolean;
  } | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [isBlockingLoading, setIsBlockingLoading] = useState(false);

  // Delete Group State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Group State (Owner only)
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  // Leave Group State (Non-owner)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Active member menu
  const [activeMenuMemberId, setActiveMenuMemberId] = useState<string | null>(null);

  const handleStartEditGroup = () => {
    if (!group) return;
    setEditName(group.name);
    setEditAvatarUrl(group.avatarUrl || "");
    setIsEditingGroup(true);
  };

  const handleSaveGroup = async () => {
    if (!editName.trim()) {
      setError("Group name cannot be empty");
      return;
    }
    setIsSavingGroup(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          image: editAvatarUrl.trim() || undefined,
          avatarUrl: editAvatarUrl.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error?.message || "Failed to update group");
      }

      showNotification("Group updated successfully");
      setIsEditingGroup(false);
      fetchGroupDetails();
      onGroupUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to update group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleLeaveGroup = async () => {
    setIsLeaving(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || json.error?.message || "Failed to leave group");
      }

      onClose();
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to leave group");
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  const fetchGroupDetails = useCallback(async () => {
    if (!accessToken || !groupId) return;
    setIsLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        setGroup(json.data.group);
      } else {
        throw new Error("Failed to load group info");
      }
    } catch (e: any) {
      setError(e.message || "Error fetching group details");
    } finally {
      setIsLoading(false);
    }
  }, [groupId, accessToken]);

  const fetchBlockedUsers = useCallback(async () => {
    if (!accessToken) return;
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/users/blocked`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        const ids = (json.data?.blockedUsers || []).map((u: any) => u.id);
        setBlockedUserIds(ids);
      }
    } catch {
      // Ignored
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen) {
      fetchGroupDetails();
      fetchBlockedUsers();
    }
  }, [isOpen, fetchGroupDetails, fetchBlockedUsers]);

  // Search users to add
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
          const currentMemberIds = group?.members.map((m) => m.userId) || [];
          const notInGroup = (json.data.users || []).filter(
            (u: UserSearchResult) => !currentMemberIds.includes(u.id)
          );
          setSearchResults(notInGroup);
        }
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, accessToken, group]);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleAddMember = async (targetUserId: string) => {
    setIsAddingMember(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to add member");

      showNotification("Member added");
      setSearchQuery("");
      setSearchResults([]);
      setShowAddMember(false);
      fetchGroupDetails();
      onGroupUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    setActionLoadingId(targetUserId);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/members/${targetUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to remove member");

      showNotification("Member removed");
      fetchGroupDetails();
      onGroupUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    } finally {
      setActionLoadingId(null);
      setActiveMenuMemberId(null);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: "ADMIN" | "MEMBER") => {
    setActionLoadingId(targetUserId);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}/members/${targetUserId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to update role");

      showNotification(`Role updated to ${newRole}`);
      fetchGroupDetails();
      onGroupUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setActionLoadingId(null);
      setActiveMenuMemberId(null);
    }
  };

  // Block / Unblock handler per PRD Section 15
  const handleConfirmBlockToggle = async () => {
    if (!blockTarget || !accessToken || isBlockingLoading) return;
    setIsBlockingLoading(true);
    try {
      const apiUrl = getApiBaseUrl();
      const method = blockTarget.isBlocked ? "DELETE" : "POST";
      const res = await fetch(`${apiUrl}/users/block/${blockTarget.user.id}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to update block status");

      if (blockTarget.isBlocked) {
        setBlockedUserIds((prev) => prev.filter((id) => id !== blockTarget.user.id));
        showNotification(`Unblocked @${blockTarget.user.username}`);
      } else {
        setBlockedUserIds((prev) => [...prev, blockTarget.user.id]);
        showNotification(`Blocked @${blockTarget.user.username}`);
      }
      setBlockTarget(null);
    } catch (err: any) {
      setError(err.message || "Error blocking user");
    } finally {
      setIsBlockingLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    setIsDeleting(true);
    try {
      const apiUrl = getApiBaseUrl();
      const res = await fetch(`${apiUrl}/groups/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to delete group");

      onClose();
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to delete group");
      setIsDeleting(false);
    }
  };

  const isOwner = group?.currentUserRole === "OWNER";
  const isAdmin = isOwner || group?.currentUserRole === "ADMIN";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-[16px] border border-cyan-400/20 bg-[#0B2345]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(2,6,23,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-5 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#19345A]">
          <h2 className="text-[16px] font-semibold text-[#F8FAFC]">Group Info</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071A33] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="rounded-[10px] p-2.5 bg-blue-500/10 border border-blue-500/20 text-xs text-[#60A5FA] flex items-center gap-2">
            <Check className="w-4 h-4 text-[#3B82F6] shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {error && (
          <div className="rounded-[10px] p-2.5 bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" />
            <p className="text-xs text-[#94A3B8]">Loading group details...</p>
          </div>
        ) : group ? (
          <div className="space-y-4">
            {/* Group Identity Card */}
            <div className="p-3 rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border border-[#19345A] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] space-y-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#0B2345] border border-cyan-400/25 shadow-[0_4px_10px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center font-bold text-white text-base overflow-hidden shrink-0">
                  {group.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                  ) : (
                    group.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[#F8FAFC] truncate">{group.name}</h3>
                  <p className="text-[12px] text-[#94A3B8]">
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </p>
                  {group.description && (
                    <p className="text-[12px] text-[#CBD5E1] mt-1 break-words line-clamp-2">
                      {group.description}
                    </p>
                  )}
                </div>
                {isOwner && !isEditingGroup && (
                  <button
                    type="button"
                    onClick={handleStartEditGroup}
                    className="px-2.5 py-1 text-xs font-medium rounded bg-[#0B2345] border border-[#19345A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#102A4E] transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>

              {/* Edit Group Form (Owner only) */}
              {isOwner && isEditingGroup && (
                <div className="pt-2 border-t border-[#19345A] space-y-2.5">
                  <div>
                    <label className="text-[11px] text-[#94A3B8] block mb-1">Group Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Group name"
                      className="w-full px-2.5 py-1.5 text-xs bg-[#0B2345] border border-[#19345A] rounded text-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#94A3B8] block mb-1">Group Image URL</label>
                    <input
                      type="text"
                      value={editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className="w-full px-2.5 py-1.5 text-xs bg-[#0B2345] border border-[#19345A] rounded text-[#F8FAFC] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingGroup(false)}
                      className="px-2.5 py-1 rounded bg-[#0B2345] text-xs text-[#94A3B8] hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGroup}
                      disabled={isSavingGroup}
                      className="px-3 py-1 rounded bg-[#2563EB] text-xs text-white font-medium hover:bg-[#1D4ED8] disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingGroup ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Member Management Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#CBD5E1]">Members</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>

              {/* Add Member inline panel */}
              {showAddMember && (
                <div className="p-2.5 rounded-[10px] bg-[#071A33] border border-[#19345A] space-y-2 animate-in fade-in">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users to add..."
                      className="w-full rounded-[8px] bg-[#0B2345] border border-[#19345A] px-3 py-1.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:border-[#3B82F6]"
                    />
                    {isSearching && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#94A3B8] absolute right-2.5 top-2" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-32 overflow-y-auto divide-y divide-[#19345A] rounded-[8px] bg-[#0B2345] border border-[#19345A]">
                      {searchResults.map((u) => (
                        <div key={u.id} className="p-2 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-medium text-[#F8FAFC]">{u.name}</p>
                            <p className="text-[10px] text-[#94A3B8]">@{u.username}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddMember(u.id)}
                            disabled={isAddingMember}
                            className="px-2 py-1 rounded bg-[#2563EB] text-white text-[11px] font-medium hover:bg-[#1D4ED8] transition-colors cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Member Rows */}
              <div className="divide-y divide-[#19345A] rounded-[10px] bg-[#071A33] border border-[#19345A] overflow-hidden max-h-56 overflow-y-auto">
                {group.members.map((m) => {
                  const isTargetMe = m.userId === user?.id;
                  const isTargetBlocked = blockedUserIds.includes(m.userId);

                  return (
                    <div
                      key={m.id}
                      className="p-2.5 flex items-center justify-between hover:bg-[#0B2345]/50 transition-colors"
                    >
                      {/* Avatar & User Details */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#0B2345] border border-[#19345A] flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                          {m.user.profileImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.user.profileImage} alt={m.user.name} className="w-full h-full object-cover" />
                          ) : (
                            m.user.name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-medium text-[#F8FAFC] truncate">
                              {m.user.name} {isTargetMe && <span className="text-[#94A3B8]">(You)</span>}
                            </p>
                            {m.role === "OWNER" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Owner
                              </span>
                            )}
                            {m.role === "ADMIN" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2563EB]/15 text-[#60A5FA] border border-[#2563EB]/30">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#94A3B8] truncate">@{m.user.username}</p>
                        </div>
                      </div>

                      {/* Action Menu for Member */}
                      {!isTargetMe && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMenuMemberId(activeMenuMemberId === m.userId ? null : m.userId)
                            }
                            className="p-1 rounded text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {activeMenuMemberId === m.userId && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setActiveMenuMemberId(null)}
                              />
                              <div className="absolute right-0 top-6 z-50 w-44 rounded-[10px] bg-[#0B2345] border border-[#19345A] p-1 shadow-xl space-y-0.5 animate-in fade-in text-xs">
                                {/* Admin controls */}
                                {isOwner && m.role !== "OWNER" && (
                                  <>
                                    {m.role === "MEMBER" ? (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRole(m.userId, "ADMIN")}
                                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#071A33] text-[#CBD5E1] hover:text-white flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Shield className="w-3.5 h-3.5 text-[#3B82F6]" />
                                        <span>Make Admin</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRole(m.userId, "MEMBER")}
                                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#071A33] text-[#CBD5E1] hover:text-white flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Remove Admin</span>
                                      </button>
                                    )}
                                  </>
                                )}

                                {/* Remove Member */}
                                {isAdmin && m.role !== "OWNER" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(m.userId)}
                                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-500/10 text-rose-300 flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Remove Member</span>
                                  </button>
                                )}

                                {/* Block / Unblock User per PRD Section 15 */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    setBlockTarget({
                                      user: { id: m.userId, name: m.user.name, username: m.user.username },
                                      isBlocked: isTargetBlocked,
                                    });
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#071A33] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isTargetBlocked ? (
                                    <>
                                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Unblock User</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="w-3.5 h-3.5 text-rose-400" />
                                      <span>Block User</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Owner Controls: Delete Group */}
            {isOwner && (
              <div className="pt-2 border-t border-[#19345A]">
                {showDeleteConfirm ? (
                  <div className="p-3 rounded-[10px] bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs">
                    <p className="font-semibold text-rose-300">Delete this group permanently?</p>
                    <p className="text-[#94A3B8]">All messages and files will be deleted.</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-2.5 py-1 rounded bg-[#071A33] text-[#94A3B8] hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteGroup}
                        disabled={isDeleting}
                        className="px-3 py-1 rounded bg-rose-600 text-white font-medium hover:bg-rose-500 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 px-3 rounded-[10px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Delete Group</span>
                  </button>
                )}
              </div>
            )}

            {/* Non-Owner Controls: Leave Group */}
            {!isOwner && (
              <div className="pt-2 border-t border-[#19345A]">
                {showLeaveConfirm ? (
                  <div className="p-3 rounded-[10px] bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs">
                    <p className="font-semibold text-rose-300">Leave this group?</p>
                    <p className="text-[#94A3B8]">You will need an invitation from an admin or owner to rejoin.</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setShowLeaveConfirm(false)}
                        className="px-2.5 py-1 rounded bg-[#071A33] text-[#94A3B8] hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleLeaveGroup}
                        disabled={isLeaving}
                        className="px-3 py-1 rounded bg-rose-600 text-white font-medium hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                      >
                        {isLeaving ? "Leaving..." : "Leave Group"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLeaveConfirm(true)}
                    className="w-full py-2 px-3 rounded-[10px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Leave Group</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Simple Block User Confirmation Dialog per PRD Section 15 */}
        {blockTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-xs rounded-[12px] bg-[#0B2345] border border-[#19345A] p-4 text-[#F8FAFC] space-y-3 shadow-2xl">
              <h3 className="text-[15px] font-semibold">
                {blockTarget.isBlocked ? "Unblock this user?" : "Block this user?"}
              </h3>
              <p className="text-[13px] text-[#94A3B8]">
                {blockTarget.isBlocked
                  ? `You will see messages sent by @${blockTarget.user.username}.`
                  : `Messages from @${blockTarget.user.username} will be collapsed in groups.`}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBlockTarget(null)}
                  disabled={isBlockingLoading}
                  className="px-3 py-1.5 rounded-[10px] text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBlockToggle}
                  disabled={isBlockingLoading}
                  className={`px-3 py-1.5 rounded-[10px] text-[13px] font-medium text-white transition-colors cursor-pointer ${
                    blockTarget.isBlocked
                      ? "bg-[#2563EB] hover:bg-[#1D4ED8]"
                      : "bg-rose-600 hover:bg-rose-500"
                  }`}
                >
                  {isBlockingLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : blockTarget.isBlocked ? (
                    "Unblock"
                  ) : (
                    "Block"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
