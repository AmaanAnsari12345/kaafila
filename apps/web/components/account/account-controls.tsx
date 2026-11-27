"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currentPushSubscription, disablePush, enablePush, pushSupported } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Input, Notice } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

const CONFIRM = "DELETE MY ACCOUNT";

export function BackgroundAlertsCard({ notify }: { notify: (t: string, m?: string) => void }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(pushSupported());
    void currentPushSubscription().then((s) => setOn(Boolean(s)));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        notify("Background alerts off");
      } else {
        await enablePush();
        setOn(true);
        await api.post("/notifications/test").catch(() => undefined);
        notify("Background alerts on", "You'll get SOS and critical convoy alerts even when KAAFILA is closed.");
      }
    } catch (err) {
      notify("Couldn't change alerts", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle eyebrow="Safety" title="Background alerts" right={<BellRing className="h-4 w-4 text-primary" />} />
      <p className="text-sm text-muted-foreground">Get a notification when someone in your convoy raises an SOS or reports a breakdown or flat tyre, even if KAAFILA isn't open.</p>
      {!supported ? <Notice tone="warn" className="mt-3">Not supported in this browser. On iPhone, add KAAFILA to your Home Screen first (iOS 16.4+).</Notice> : null}
      <Button className="mt-3" variant={on ? "outline" : "default"} onClick={toggle} disabled={busy || !supported}>
        {busy ? "Working…" : on ? "Turn off on this device" : "Turn on for this device"}
      </Button>
    </Card>
  );
}

export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.del("/users/me", { confirm: typed });
      await signOut();
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card className="border-rose-400/30">
      <CardTitle eyebrow="Danger zone" title="Delete account" right={<Trash2 className="h-4 w-4 text-rose-300" />} />
      <p className="text-sm text-muted-foreground">
        Deletes your profile, cars, location history, devices, posts, chat and SOS records, and cancels subscriptions. Convoys and clubs you run pass to another member. Payment records are kept as tax law requires.
      </p>
      <Button variant="destructive" className="mt-3" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your KAAFILA account?" description="This can't be undone.">
        <div className="grid gap-3">
          <Field label={`Type ${CONFIRM} to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button variant="destructive" disabled={typed !== CONFIRM || busy} onClick={remove}>
            {busy ? "Deleting…" : "Permanently delete"}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
