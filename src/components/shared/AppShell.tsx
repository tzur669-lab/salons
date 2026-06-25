"use client";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "./Navbar";
import { BackButton } from "./BackButton";
import { PhoneInput } from "./PhoneInput";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, needsPhone, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <span
          className="inline-block rounded-full animate-pulse"
          style={{ width: 14, height: 14, background: "var(--rose)" }}
        />
      </div>
    );
  }

  return (
    <>
      <Navbar />
      {/* extra bottom padding on mobile clears the fixed bottom tab bar */}
      <main className="max-w-3xl mx-auto px-5 pb-28 md:pb-10">
        <BackButton />
        {children}
      </main>
      {needsPhone && user && (
        <PhoneInput uid={user.uid} onDone={() => window.location.reload()} />
      )}
    </>
  );
}
