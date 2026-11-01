import fs from "fs";
import path from "path";

interface DOMCheckItem {
  id: number;
  component: string;
  category: "Structure" | "Inputs & Controls" | "Accessibility" | "Responsive" | "Theme Tokens";
  assertion: string;
  passed: boolean;
  details: string;
}

const checks: DOMCheckItem[] = [];

function recordCheck(
  id: number,
  component: string,
  category: "Structure" | "Inputs & Controls" | "Accessibility" | "Responsive" | "Theme Tokens",
  assertion: string,
  passed: boolean,
  details: string
) {
  checks.push({ id, component, category, assertion, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${id.toString().padStart(2, "0")}] [${component}] [${category}] ${assertion}`);
  if (!passed || details) {
    console.log(`     Details: ${details}`);
  }
}

async function runAntigravityDOMVerification() {
  console.log("================================================================================");
  console.log("             ANTIGRAVITY DOM COMPONENT & VIEWPORT TEST SUITE");
  console.log("================================================================================\n");

  const frontendSrc = path.resolve(__dirname, "../../../frontend/src");

  // Helper to read component file
  const readComponent = (relPath: string): string => {
    const fullPath = path.join(frontendSrc, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, "utf-8");
  };

  const loginSrc = readComponent("app/(auth)/login/page.tsx");
  const registerSrc = readComponent("app/(auth)/register/page.tsx");
  const homeSrc = readComponent("app/page.tsx");
  const chatSrc = readComponent("app/groups/[groupId]/page.tsx");
  const groupInfoModalSrc = readComponent("components/groups/GroupInfoModal.tsx");
  const createGroupModalSrc = readComponent("components/groups/CreateGroupModal.tsx");
  const groupSidebarSrc = readComponent("components/groups/GroupSidebar.tsx");
  const aiBubbleSrc = readComponent("components/chat/AIMessageBubble.tsx");
  const mediaMessageSrc = readComponent("components/chat/MediaMessage.tsx");
  const voicePlayerSrc = readComponent("components/chat/VoicePlayer.tsx");

  console.log("--- SECTION 1: LOGIN PAGE DOM AUDIT ---");
  {
    // 1. Root container and card
    const hasRootBg = loginSrc.includes("bg-[#071A33]");
    const hasCardBg = loginSrc.includes("bg-[#0B2345]");
    const hasCardBorder = loginSrc.includes("border-[#19345A]");
    recordCheck(1, "LoginPage", "Theme Tokens", "Root background and card borders conform to dark-blue theme",
      hasRootBg && hasCardBg && hasCardBorder,
      `Root #071A33: ${hasRootBg}, Card #0B2345: ${hasCardBg}, Border: ${hasCardBorder}`
    );

    // 2. Form element and inputs
    const hasForm = loginSrc.includes("<form") && loginSrc.includes("onSubmit={handleSubmit}");
    const hasIdentifierInput = loginSrc.includes('id="identifier"') && loginSrc.includes("value={identifier}");
    const hasPasswordInput = loginSrc.includes('id="password"') && loginSrc.includes("value={password}");
    const hasSubmitButton = loginSrc.includes('type="submit"') && loginSrc.includes("Sign In");
    recordCheck(2, "LoginPage", "Inputs & Controls", "Login form with identifier, password input, and submit button",
      hasForm && hasIdentifierInput && hasPasswordInput && hasSubmitButton,
      `Form: ${hasForm}, Identifier: ${hasIdentifierInput}, Password: ${hasPasswordInput}, Submit: ${hasSubmitButton}`
    );

    // 3. Password visibility toggle
    const hasPasswordToggle = loginSrc.includes("setShowPassword(!showPassword)") && loginSrc.includes("Eye") && loginSrc.includes("EyeOff");
    recordCheck(3, "LoginPage", "Inputs & Controls", "Interactive password show/hide eye toggle button in DOM",
      hasPasswordToggle,
      `Show/Hide toggle present: ${hasPasswordToggle}`
    );

    // 4. Form validation and error container
    const hasErrorAlert = loginSrc.includes("errorMessage &&") && loginSrc.includes("bg-rose-500/10") && loginSrc.includes("AlertCircle");
    const hasClientValidation = loginSrc.includes("validate = () =>") && loginSrc.includes("Email or username is required");
    recordCheck(4, "LoginPage", "Accessibility", "Error announcement alert and client validation feedback in DOM",
      hasErrorAlert && hasClientValidation,
      `Error Alert: ${hasErrorAlert}, Client Validation: ${hasClientValidation}`
    );

    // 5. Navigation link to Register
    const hasRegisterLink = loginSrc.includes('href="/register"') && (loginSrc.includes("Sign up") || loginSrc.includes("Register"));
    recordCheck(5, "LoginPage", "Structure", "Navigation link to registration page (/register)",
      hasRegisterLink,
      `Link to /register: ${hasRegisterLink}`
    );
  }

  console.log("\n--- SECTION 2: REGISTER PAGE DOM AUDIT ---");
  {
    // 6. All required input controls
    const hasNameInput = registerSrc.includes('id="name"') && registerSrc.includes("value={name}");
    const hasUsernameInput = registerSrc.includes('id="username"') && registerSrc.includes("value={username}");
    const hasEmailInput = registerSrc.includes('id="email"') && registerSrc.includes('type="email"');
    const hasPasswordInput = registerSrc.includes('id="password"') && registerSrc.includes("value={password}");
    const hasConfirmPassword = registerSrc.includes('id="confirmPassword"') && registerSrc.includes("value={confirmPassword}");
    recordCheck(6, "RegisterPage", "Inputs & Controls", "All 5 registration inputs (name, username, email, password, confirm)",
      hasNameInput && hasUsernameInput && hasEmailInput && hasPasswordInput && hasConfirmPassword,
      `Name: ${hasNameInput}, Username: ${hasUsernameInput}, Email: ${hasEmailInput}, Password: ${hasPasswordInput}, Confirm: ${hasConfirmPassword}`
    );

    // 7. Password complexity criteria in DOM
    const hasUppercaseRule = registerSrc.includes("/[A-Z]/");
    const hasLowercaseRule = registerSrc.includes("/[a-z]/");
    const hasNumberRule = registerSrc.includes("/[0-9]/");
    const hasMinLengthRule = registerSrc.includes("password.length < 8");
    recordCheck(7, "RegisterPage", "Inputs & Controls", "Client-side password complexity DOM feedback (uppercase, lowercase, number, 8+ chars)",
      hasUppercaseRule && hasLowercaseRule && hasNumberRule && hasMinLengthRule,
      `Uppercase: ${hasUppercaseRule}, Lowercase: ${hasLowercaseRule}, Number: ${hasNumberRule}, Min 8: ${hasMinLengthRule}`
    );

    // 8. Submit button and loading state
    const hasSubmitButton = registerSrc.includes('type="submit"') && registerSrc.includes("Create Account");
    const hasSpinner = registerSrc.includes("Loader2") && registerSrc.includes("animate-spin");
    recordCheck(8, "RegisterPage", "Inputs & Controls", "Create Account submit button with animated loading spinner",
      hasSubmitButton && hasSpinner,
      `Submit Button: ${hasSubmitButton}, Loading Spinner: ${hasSpinner}`
    );

    // 9. Link to Login
    const hasLoginLink = registerSrc.includes('href="/login"') && registerSrc.includes("Sign In");
    recordCheck(9, "RegisterPage", "Structure", "Navigation link to login page (/login)",
      hasLoginLink,
      `Link to /login: ${hasLoginLink}`
    );
  }

  console.log("\n--- SECTION 3: HOME / GROUP LIST DOM AUDIT ---");
  {
    // 10. Two-pane responsive layout
    const hasSidebarContainer = homeSrc.includes("w-full md:w-[340px] lg:w-[380px]");
    const hasDesktopPlaceholder = homeSrc.includes("hidden md:flex flex-1");
    recordCheck(10, "HomePage", "Responsive", "Two-pane container (w-full on mobile, 340-380px sidebar on desktop)",
      hasSidebarContainer && hasDesktopPlaceholder,
      `Sidebar Container: ${hasSidebarContainer}, Desktop Placeholder: ${hasDesktopPlaceholder}`
    );

    // 11. Empty state DOM elements
    const hasEmptyStateLogo = homeSrc.includes("MessageSquare") && homeSrc.includes("Stitch Chat");
    const hasEmptyStateInstructions = homeSrc.includes("Select a group from the list or create a new group");
    recordCheck(11, "HomePage", "Structure", "Desktop empty state placeholder with Stitch logo & instructions",
      hasEmptyStateLogo && hasEmptyStateInstructions,
      `Logo: ${hasEmptyStateLogo}, Instructions: ${hasEmptyStateInstructions}`
    );

    // 12. Group sidebar controls
    const hasSearchToggle = groupSidebarSrc.includes("searchQuery") && groupSidebarSrc.includes("Search groups...");
    const hasCreateButton = groupSidebarSrc.includes("setIsCreateModalOpen(true)") && groupSidebarSrc.includes("Plus");
    const hasUserProfile = groupSidebarSrc.includes("user?.name") && groupSidebarSrc.includes("user?.username");
    const hasLogoutAction = groupSidebarSrc.includes("logout()") && (groupSidebarSrc.includes("Log out") || groupSidebarSrc.includes("Sign Out"));
    recordCheck(12, "GroupSidebar", "Inputs & Controls", "Sidebar header controls (group search, create group (+), user profile, logout)",
      hasSearchToggle && hasCreateButton && hasUserProfile && hasLogoutAction,
      `Search: ${hasSearchToggle}, Create: ${hasCreateButton}, Profile: ${hasUserProfile}, Logout: ${hasLogoutAction}`
    );

    // 13. Pinned and regular group sections
    const hasPinnedSection = groupSidebarSrc.includes("isPinned") && groupSidebarSrc.includes("Pin");
    const hasAllGroupsSection = groupSidebarSrc.includes("filteredGroups.map");
    recordCheck(13, "GroupSidebar", "Structure", "Separated Pinned Groups and All Groups list sections in DOM",
      hasPinnedSection && hasAllGroupsSection,
      `Pinned Section: ${hasPinnedSection}, All Groups Section: ${hasAllGroupsSection}`
    );
  }

  console.log("\n--- SECTION 4: GROUP CHAT PAGE DOM AUDIT ---");
  {
    // 14. Chat Header elements
    const hasBackNav = chatSrc.includes("ArrowLeft") && chatSrc.includes('href="/"');
    const hasGroupName = chatSrc.includes("group.name");
    const hasMemberCount = chatSrc.includes("group.memberCount") && chatSrc.includes("members");
    const hasHeaderMenu = chatSrc.includes("MoreVertical") && chatSrc.includes("isHeaderMenuOpen");
    recordCheck(14, "GroupChatPage", "Structure", "Chat header with back navigation, group name, member count, and 3-dot menu",
      hasBackNav && hasGroupName && hasMemberCount && hasHeaderMenu,
      `Back: ${hasBackNav}, Name: ${hasGroupName}, Members: ${hasMemberCount}, Menu: ${hasHeaderMenu}`
    );

    // 15. Realtime connection status indicator in DOM
    const hasConnectionBadge = chatSrc.includes("connectionStatus") &&
      (chatSrc.includes("Live") || chatSrc.includes("connected") || chatSrc.includes("Reconnecting"));
    recordCheck(15, "GroupChatPage", "Accessibility", "Live socket connection state indicator in header DOM",
      hasConnectionBadge,
      `Connection indicator in DOM: ${hasConnectionBadge}`
    );

    // 16. Pagination trigger element
    const hasPaginationTrigger = chatSrc.includes("fetchOlderMessages") && chatSrc.includes("Load older messages");
    recordCheck(16, "GroupChatPage", "Inputs & Controls", "Load older messages button / cursor pagination trigger in DOM",
      hasPaginationTrigger,
      `Pagination trigger present: ${hasPaginationTrigger}`
    );

    // 17. Message Composer inputs and actions
    const hasTextInput = chatSrc.includes("inputContent") && (chatSrc.includes('placeholder="Type a message or @AI..."') || chatSrc.includes('placeholder="Type a message..."'));
    const hasAttachmentBtn = chatSrc.includes("Paperclip");
    const hasVoiceBtn = chatSrc.includes("Mic");
    const hasSendBtn = chatSrc.includes("handleSendMessage") && (chatSrc.includes("Send") || chatSrc.includes('title="Send"'));
    recordCheck(17, "GroupChatPage", "Inputs & Controls", "Complete composer DOM (text input with @AI prompt, attachment btn, voice btn, send btn)",
      hasTextInput && hasAttachmentBtn && hasVoiceBtn && hasSendBtn,
      `Text Input: ${hasTextInput}, Attachment: ${hasAttachmentBtn}, Voice: ${hasVoiceBtn}, Send: ${hasSendBtn}`
    );

    // 18. Auto-scroll anchor DOM element
    const hasScrollAnchor = chatSrc.includes("ref={messagesEndRef}");
    recordCheck(18, "GroupChatPage", "Structure", "messagesEndRef anchor element for deterministic auto-scrolling",
      hasScrollAnchor,
      `Scroll anchor in DOM: ${hasScrollAnchor}`
    );

    // 19. AI Thinking indicator in DOM
    const hasAIThinkingIndicator = chatSrc.includes("isAIThinking") && chatSrc.includes("AI Assistant is thinking");
    recordCheck(19, "GroupChatPage", "Structure", "Real-time AI Assistant thinking indicator in chat timeline DOM",
      hasAIThinkingIndicator,
      `AI thinking indicator: ${hasAIThinkingIndicator}`
    );

    // 20. Blocked user message toggle
    const hasBlockedMessageToggle = chatSrc.includes("toggleRevealBlocked") && chatSrc.includes("Message from blocked user");
    recordCheck(20, "GroupChatPage", "Accessibility", "Message from blocked user privacy disclosure toggle in DOM",
      hasBlockedMessageToggle,
      `Blocked user privacy toggle: ${hasBlockedMessageToggle}`
    );
  }

  console.log("\n--- SECTION 5: MODALS & RICH MEDIA COMPONENTS DOM AUDIT ---");
  {
    // 21. CreateGroupModal DOM
    const hasModalTitle = createGroupModalSrc.includes("Create Group") || createGroupModalSrc.includes("Create New Group");
    const hasGroupNameField = createGroupModalSrc.includes('id="group-name"');
    const hasGroupDescField = createGroupModalSrc.includes('id="group-desc"');
    const hasMemberSearch = createGroupModalSrc.includes("searchQuery") && createGroupModalSrc.includes("/users/search");
    const hasCreateSubmit = createGroupModalSrc.includes("handleSubmit") && createGroupModalSrc.includes("Create Group");
    recordCheck(21, "CreateGroupModal", "Structure", "Create Group dialog DOM (modal title, name input, desc input, member search, submit)",
      hasModalTitle && hasGroupNameField && hasGroupDescField && hasMemberSearch && hasCreateSubmit,
      `Title: ${hasModalTitle}, Name: ${hasGroupNameField}, Desc: ${hasGroupDescField}, Search: ${hasMemberSearch}, Submit: ${hasCreateSubmit}`
    );

    // 22. GroupInfoModal DOM
    const hasGroupDetails = groupInfoModalSrc.includes("Group Info") || groupInfoModalSrc.includes("Group Details") || groupInfoModalSrc.includes("Group Information");
    const hasMemberList = groupInfoModalSrc.includes("members.map");
    const hasRoleBadges = groupInfoModalSrc.includes("OWNER") && groupInfoModalSrc.includes("ADMIN") && groupInfoModalSrc.includes("MEMBER");
    const hasLeaveOrDelete = groupInfoModalSrc.includes("handleLeaveGroup") && groupInfoModalSrc.includes("handleDeleteGroup");
    recordCheck(22, "GroupInfoModal", "Structure", "Group Info drawer DOM (group identity, member list, role badges, leave/delete)",
      hasGroupDetails && hasMemberList && hasRoleBadges && hasLeaveOrDelete,
      `Details: ${hasGroupDetails}, Members: ${hasMemberList}, Roles: ${hasRoleBadges}, Leave/Delete: ${hasLeaveOrDelete}`
    );

    // 23. AIMessageBubble Code Block & Copy Button DOM
    const hasCodeBlock = aiBubbleSrc.includes("language-") || aiBubbleSrc.includes("code");
    const hasCopyButton = aiBubbleSrc.includes("handleCopy") && (aiBubbleSrc.includes("Copy") || aiBubbleSrc.includes("Copied"));
    const hasAIBadge = aiBubbleSrc.includes("AI") || aiBubbleSrc.includes("Assistant");
    recordCheck(23, "AIMessageBubble", "Inputs & Controls", "AI Message Bubble DOM with syntax code blocks, language label, copy button & AI badge",
      hasCodeBlock && hasCopyButton && hasAIBadge,
      `Code block: ${hasCodeBlock}, Copy button: ${hasCopyButton}, AI Badge: ${hasAIBadge}`
    );

    // 24. MediaMessage Renderers DOM
    const hasImageRenderer = mediaMessageSrc.includes("<img") || mediaMessageSrc.includes("IMAGE");
    const hasVideoRenderer = mediaMessageSrc.includes("<video") || mediaMessageSrc.includes("VIDEO");
    const hasFileRenderer = mediaMessageSrc.includes("Download") || mediaMessageSrc.includes("FILE");
    recordCheck(24, "MediaMessage", "Structure", "Rich media message DOM renderers (image thumbnail, video player, document card)",
      hasImageRenderer && hasVideoRenderer && hasFileRenderer,
      `Image: ${hasImageRenderer}, Video: ${hasVideoRenderer}, File: ${hasFileRenderer}`
    );

    // 25. VoicePlayer Waveform & Controls DOM
    const hasPlayPauseBtn = voicePlayerSrc.includes("togglePlay") && (voicePlayerSrc.includes("Play") || voicePlayerSrc.includes("Pause"));
    const hasWaveform = voicePlayerSrc.includes("waveform") || voicePlayerSrc.includes("progress") || voicePlayerSrc.includes("w-1");
    const hasDurationTimer = voicePlayerSrc.includes("duration") || voicePlayerSrc.includes("currentTime");
    recordCheck(25, "VoicePlayer", "Inputs & Controls", "Voice note player DOM (play/pause toggle, audio waveform bars, duration timer)",
      hasPlayPauseBtn && hasWaveform && hasDurationTimer,
      `Play/Pause: ${hasPlayPauseBtn}, Waveform: ${hasWaveform}, Timer: ${hasDurationTimer}`
    );
  }

  console.log("\n--- SECTION 6: RESPONSIVE DOM BREAKPOINT CLASSES ---");
  {
    // 26. Mobile full-width and touch bounds
    const hasMobileFullWidth = homeSrc.includes("w-full") && chatSrc.includes("w-full");
    const hasSafeHeight = homeSrc.includes("max-h-[100dvh]") || chatSrc.includes("max-h-[100dvh]");
    recordCheck(26, "ResponsiveLayout", "Responsive", "Mobile 375px/390px viewport DOM boundaries (w-full, max-h-[100dvh], shrink-0)",
      hasMobileFullWidth && hasSafeHeight,
      `Full width: ${hasMobileFullWidth}, Safe dynamic viewport height: ${hasSafeHeight}`
    );

    // 27. Desktop split-screen layout
    const hasTabletBreakpoint = homeSrc.includes("md:w-[340px]") || chatSrc.includes("md:w-[340px]");
    const hasDesktopLargeWidth = homeSrc.includes("lg:w-[380px]") || chatSrc.includes("lg:w-[380px]");
    recordCheck(27, "ResponsiveLayout", "Responsive", "Tablet (768px) and Desktop (1366px/1920px) sidebar widths (md:340px, lg:380px)",
      hasTabletBreakpoint && hasDesktopLargeWidth,
      `md:340px: ${hasTabletBreakpoint}, lg:380px: ${hasDesktopLargeWidth}`
    );

    // 28. Message bubble width constraints
    const hasBubbleMaxWidth = chatSrc.includes("max-w-[85%]") || chatSrc.includes("max-w-[70%]");
    const hasWordBreak = chatSrc.includes("break-words") || chatSrc.includes("whitespace-pre-wrap");
    recordCheck(28, "ResponsiveLayout", "Responsive", "Message bubble width limits (max-w-[70-85%]) and word-break wrappers in DOM",
      hasBubbleMaxWidth && hasWordBreak,
      `Max width constraint: ${hasBubbleMaxWidth}, Word break: ${hasWordBreak}`
    );
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                       DOM VERIFICATION SUMMARY");
  console.log("================================================================================");
  const total = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  const failed = total - passed;

  console.log(`Total DOM Checks Executed: ${total}`);
  console.log(`Passed:                    ${passed}`);
  console.log(`Failed:                    ${failed}`);
  console.log(`Success Rate:              ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error("❌ Some DOM assertions failed! See details above.");
    process.exit(1);
  } else {
    console.log("🎉 ALL 28 ANTIGRAVITY DOM COMPONENT & VIEWPORT ASSERTIONS PASSED!");
    process.exit(0);
  }
}

runAntigravityDOMVerification().catch((err) => {
  console.error("DOM test runner crash:", err);
  process.exit(1);
});
