"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GroupsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#071A33] flex items-center justify-center" />
  );
}
