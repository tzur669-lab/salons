import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

function LoadingCard() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(168deg, var(--pink) 0%, var(--rose-soft) 55%, var(--background) 100%)" }}
    >
      <span className="inline-block rounded-full animate-pulse" style={{ width: 14, height: 14, background: "var(--rose)" }} />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
