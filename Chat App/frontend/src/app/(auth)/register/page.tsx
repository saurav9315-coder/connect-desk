"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle, Eye, EyeOff, User, AtSign, Mail, Lock, UserPlus } from "lucide-react";
import { AuthCard3D } from "@/components/auth/AuthCard3D";

export default function RegisterPage() {
  const { user, register, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect if already authenticated
  useEffect(() => {
    if (!isAuthLoading && user) {
      router.push("/");
    }
  }, [user, isAuthLoading, router]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Full name is required";
    } else if (name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (name.trim().length > 50) {
      newErrors.name = "Name cannot exceed 50 characters";
    }

    if (!username.trim()) {
      newErrors.username = "Username is required";
    } else if (username.trim().length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (username.trim().length > 30) {
      newErrors.username = "Username cannot exceed 30 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      newErrors.username = "Username can only contain letters, numbers, and underscores";
    }

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please provide a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters long";
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = "Password must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = "Password must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = "Password must contain at least one number";
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Confirm password is required";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isLoading) return;
    if (!validate()) return;

    setIsLoading(true);
    try {
      await register(name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please check your inputs.";
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#071A33] flex flex-col items-center justify-center text-[#94A3B8] gap-3 select-none">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-[#2563EB]/20 animate-ping absolute inset-0" />
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#38BDF8] flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.4)] relative z-10">
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          </div>
        </div>
        <span className="text-[13px] font-medium tracking-wide text-[#CBD5E1]">Checking session...</span>
      </div>
    );
  }

  return (
    <AuthCard3D title="ConnectDesk" subtitle="Create your account">
      {errorMessage && (
        <div className="mb-4 rounded-[12px] p-3.5 bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5 shadow-[0_4px_14px_rgba(244,63,94,0.18)] animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Full Name */}
        <div className="space-y-1">
          <label htmlFor="name" className="text-[13px] font-medium text-[#CBD5E1] block">
            Full Name
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#38BDF8] transition-colors">
              <User className="w-4 h-4" />
            </div>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              disabled={isLoading}
              placeholder="Alex Rivera"
              autoComplete="name"
              className={`w-full rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border ${
                errors.name
                  ? "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "border-[#19345A] group-hover:border-cyan-400/50 focus:border-[#38BDF8]"
              } pl-10 pr-3.5 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:shadow-[0_0_18px_rgba(56,189,248,0.25)] transition-all duration-200`}
            />
          </div>
          {errors.name && <p className="text-[11px] text-rose-400 pl-1">{errors.name}</p>}
        </div>

        {/* Username */}
        <div className="space-y-1">
          <label htmlFor="username" className="text-[13px] font-medium text-[#CBD5E1] block">
            Username
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#38BDF8] transition-colors">
              <AtSign className="w-4 h-4" />
            </div>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errors.username) setErrors((prev) => ({ ...prev, username: "" }));
              }}
              disabled={isLoading}
              placeholder="alexrivera"
              autoComplete="username"
              className={`w-full rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border ${
                errors.username
                  ? "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "border-[#19345A] group-hover:border-cyan-400/50 focus:border-[#38BDF8]"
              } pl-10 pr-3.5 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:shadow-[0_0_18px_rgba(56,189,248,0.25)] transition-all duration-200`}
            />
          </div>
          {errors.username && <p className="text-[11px] text-rose-400 pl-1">{errors.username}</p>}
        </div>

        {/* Email Address */}
        <div className="space-y-1">
          <label htmlFor="email" className="text-[13px] font-medium text-[#CBD5E1] block">
            Email Address
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#38BDF8] transition-colors">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
              }}
              disabled={isLoading}
              placeholder="alex@example.com"
              autoComplete="email"
              className={`w-full rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border ${
                errors.email
                  ? "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "border-[#19345A] group-hover:border-cyan-400/50 focus:border-[#38BDF8]"
              } pl-10 pr-3.5 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:shadow-[0_0_18px_rgba(56,189,248,0.25)] transition-all duration-200`}
            />
          </div>
          {errors.email && <p className="text-[11px] text-rose-400 pl-1">{errors.email}</p>}
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-[13px] font-medium text-[#CBD5E1] block">
            Password
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#38BDF8] transition-colors">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
              }}
              disabled={isLoading}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              autoComplete="new-password"
              className={`w-full rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border ${
                errors.password
                  ? "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "border-[#19345A] group-hover:border-cyan-400/50 focus:border-[#38BDF8]"
              } pl-10 pr-11 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:shadow-[0_0_18px_rgba(56,189,248,0.25)] transition-all duration-200`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#94A3B8] hover:text-[#38BDF8] transition-colors cursor-pointer"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-[11px] text-rose-400 pl-1">{errors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="text-[13px] font-medium text-[#CBD5E1] block">
            Confirm Password
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8] group-focus-within:text-[#38BDF8] transition-colors">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }}
              disabled={isLoading}
              placeholder="Re-enter password"
              autoComplete="new-password"
              className={`w-full rounded-[12px] bg-[#071A33]/80 backdrop-blur-md border ${
                errors.confirmPassword
                  ? "border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
                  : "border-[#19345A] group-hover:border-cyan-400/50 focus:border-[#38BDF8]"
              } pl-10 pr-11 py-2 text-[14px] text-[#F8FAFC] placeholder-[#94A3B8]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:shadow-[0_0_18px_rgba(56,189,248,0.25)] transition-all duration-200`}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-[11px] text-rose-400 pl-1">{errors.confirmPassword}</p>
          )}
        </div>

        {/* 3D Tactile Register Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="relative group w-full mt-3 py-2.5 px-4 rounded-[12px] bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#1D4ED8] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(37,99,235,0.45),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.6),0_0_15px_rgba(56,189,248,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* Top specular button shine */}
          <div className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-t-[12px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create Account</span>
              <UserPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </>
          )}
        </button>
      </form>

      {/* Login Link */}
      <div className="pt-4 mt-3 border-t border-[#19345A]/60 text-center text-[13px] text-[#94A3B8]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[#38BDF8] hover:text-[#60A5FA] transition-colors hover:underline"
        >
          Sign In
        </Link>
      </div>
    </AuthCard3D>
  );
}
