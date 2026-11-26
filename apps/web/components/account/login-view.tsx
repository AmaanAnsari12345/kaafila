"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasSupabase, webConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Notice } from "@/components/ui/field";

export function LoginView() {
  const { status, signInWithEmail, signInWithGoogle, signInDev, error: authError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devName, setDevName] = useState("aarav");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed_in") router.replace("/drive");
  }, [status, router]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto grid max-w-md gap-4 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Sign in to KAAFILA</h1>
        <p className="mt-1 text-sm text-muted-foreground">Drive together. Your location is shared only with convoys you join.</p>
      </div>
      {hasSupabase ? (
        <Card className="grid gap-3">
          <Button variant="outline" onClick={() => run(signInWithGoogle)}>
            Continue with Google
          </Button>
          <div className="text-center text-xs text-muted-foreground">or</div>
          {sent ? (
            <Notice tone="ok">Check {email} for a sign-in link.</Notice>
          ) : (
            <>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
              </Field>
              <Button onClick={() => run(async () => (await signInWithEmail(email), setSent(true)))} disabled={!email.includes("@")}>
                <Mail className="h-4 w-4" /> Email me a sign-in link
              </Button>
            </>
          )}
        </Card>
      ) : null}
      {webConfig.devAuth ? (
        <Card className="grid gap-3 border-amber-400/30">
          <p className="text-sm font-medium text-amber-200">Development sign-in</p>
          <p className="text-xs text-muted-foreground">
            Works only when the API runs with <code>ALLOW_DEV_TOKEN=true</code> outside production. Use different names in different browsers to test a convoy with several people. The name <code>admin</code> signs in as an administrator.
          </p>
          <Field label="Name">
            <Input value={devName} onChange={(e) => setDevName(e.target.value)} maxLength={24} />
          </Field>
          <Button variant="secondary" onClick={() => run(() => signInDev(devName))}>
            Sign in as {devName || "driver"}
          </Button>
        </Card>
      ) : null}
      {!hasSupabase && !webConfig.devAuth ? (
        <Notice tone="warn">Sign-in isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_DEV_AUTH=true for local development).</Notice>
      ) : null}
      {error || authError ? <Notice tone="danger">{error ?? authError}</Notice> : null}
      <p className="text-center text-xs text-muted-foreground">You can try the demo convoy without an account on the Drive page.</p>
    </div>
  );
}
