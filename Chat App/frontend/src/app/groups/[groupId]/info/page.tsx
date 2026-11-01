"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api";
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  UserPlus,
  Trash2,
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

export default function GroupInfoDedicatedPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const resolvedParams = use(params);
  const groupId = resolvedParams.groupId;

  const { user, accessToken, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  // Active member menu
  const [activeMenuMemberId, setActiveMenuMemberId] = useState<string | null>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

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
        throw new Error("Failed to load group details");
      }
    } catch (e: any) {
      setError(e.message || "Error loading group");
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
    if (accessToken) {
      fetchGroupDetails();
      fetchBlockedUsers();
    }
  }, [accessToken, fetchGroupDetails, fetchBlockedUsers]);

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
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
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
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    } finally {
      setActiveMenuMemberId(null);
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: "ADMIN" | "MEMBER") => {
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
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setActiveMenuMemberId(null);
    }
  };

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

      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to delete group");
      setIsDeleting(false);
    }
  };

  const isOwner = group?.currentUserRole === "OWNER";
  const isAdmin = isOwner || group?.currentUserRole === "ADMIN";

  return (
    <div className="min-h-screen bg-[#071A33] text-[#F8FAFC] flex flex-col">
      {/* Top Header */}
      <header className="border-b border-[#19345A] bg-[#071A33] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}`}
            className="p-1.5 rounded-[10px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0B2345] transition-colors"
            title="Back to chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-[18px] font-semibold text-[#F8FAFC]">Group Info</h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
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
          <div className="py-20 flex flex-col items-center justify-center space-y-2">
            <Loader2 className="w-7 h-7 animate-spin text-[#3B82F6]" />
            <p className="text-[13px] text-[#94A3B8]">Loading group details...</p>
          </div>
        ) : group ? (
          <div className="space-y-4">
            {/* Identity Card */}
            <div className="flex flex-col items-center text-center p-5 rounded-[12px] bg-[#0B2345] border border-[#19345A] space-y-2">
              <div className="w-16 h-16 rounded-full bg-[#071A33] border border-[#19345A] flex items-center justify-center font-bold text-white text-lg overflow-hidden shadow-sm">
                {group.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.avatarUrl} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                  group.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-[#F8FAFC]">{group.name}</h2>
                <p className="text-[12px] text-[#94A3B8] mt-0.5">
                  {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                </p>
                {group.description && (
                  <p className="text-[13px] text-[#CBD5E1] mt-2 max-w-sm">
                    {group.description}
                  </p>
                )}
              </div>
            </div>

            {/* Member Management Section */}
            <div className="rounded-[12px] bg-[#0B2345] border border-[#19345A] p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#19345A]">
                <span className="text-[14px] font-semibold text-[#F8FAFC]">Members</span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddMember(!showAddMember)}
                    className="text-[13px] font-medium text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>

              {/* Add Member inline search */}
              {showAddMember && (
                <div className="p-3 rounded-[10px] bg-[#071A33] border border-[#19345A] space-y-2 animate-in fade-in">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users by name or username..."
                      className="w-full rounded-[8px] bg-[#0B2345] border border-[#19345A] px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:border-[#3B82F6]"
                    />
                    {isSearching && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#94A3B8] absolute right-3 top-2.5" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto divide-y divide-[#19345A] rounded-[8px] bg-[#0B2345] border border-[#19345A]">
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
                            className="px-2.5 py-1 rounded bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] transition-colors cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Members List */}
              <div className="divide-y divide-[#19345A]">
                {group.members.map((m) => {
                  const isTargetMe = m.userId === user?.id;
                  const isTargetBlocked = blockedUserIds.includes(m.userId);

                  return (
                    <div
                      key={m.id}
                      className="py-2.5 flex items-center justify-between hover:bg-[#071A33]/40 px-2 rounded-[8px] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#071A33] border border-[#19345A] flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                          {m.user.profileImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.user.profileImage} alt={m.user.name} className="w-full h-full object-cover" />
                          ) : (
                            m.user.name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[14px] font-medium text-[#F8FAFC] truncate">
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
                          <p className="text-[12px] text-[#94A3B8] truncate">@{m.user.username}</p>
                        </div>
                      </div>

                      {!isTargetMe && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMenuMemberId(activeMenuMemberId === m.userId ? null : m.userId)
                            }
                            className="p-1.5 rounded-[8px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#071A33] transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {activeMenuMemberId === m.userId && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setActiveMenuMemberId(null)}
                              />
                              <div className="absolute right-0 top-7 z-50 w-44 rounded-[10px] bg-[#071A33] border border-[#19345A] p-1 shadow-xl space-y-0.5 text-xs">
                                {isOwner && m.role !== "OWNER" && (
                                  <>
                                    {m.role === "MEMBER" ? (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRole(m.userId, "ADMIN")}
                                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#0B2345] text-[#CBD5E1] hover:text-white flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Shield className="w-3.5 h-3.5 text-[#3B82F6]" />
                                        <span>Make Admin</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRole(m.userId, "MEMBER")}
                                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#0B2345] text-[#CBD5E1] hover:text-white flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Remove Admin</span>
                                      </button>
                                    )}
                                  </>
                                )}

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

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    setBlockTarget({
                                      user: { id: m.userId, name: m.user.name, username: m.user.username },
                                      isBlocked: isTargetBlocked,
                                    });
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#0B2345] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5 cursor-pointer"
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

            {/* Owner Action: Delete Group */}
            {isOwner && (
              <div className="pt-2">
                {showDeleteConfirm ? (
                  <div className="p-3 rounded-[12px] bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs">
                    <p className="font-semibold text-rose-300">Delete this group permanently?</p>
                    <p className="text-[#94A3B8]">All messages and files will be deleted.</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 rounded-[8px] bg-[#071A33] text-[#94A3B8] hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteGroup}
                        disabled={isDeleting}
                        className="px-3.5 py-1.5 rounded-[8px] bg-rose-600 text-white font-medium hover:bg-rose-500 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 px-4 rounded-[10px] bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-[13px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Delete Group</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Block User Dialog per PRD Section 15 */}
        {blockTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-xs rounded-[12px] bg-[#0B2345] border border-[#19345A] p-4 text-[#F8FAFC] space-y-3 shadow-2xl">
              <h3 className="text-[15px] font-semibold">
                {blockTarget.isBlocked ? "Unblock this user?" : "Block this user?"}
              </h3>
              <p className="text-[13px] text-[#94A3B8]">
                {blockTarget.isBlocked
                  ? `You will see messages sent by @${blockTarget.user.username}.`
                  : `Messages from @${blockTarget.user.username} will be collapsed.`}
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
      </main>
    </div>
  );
}
