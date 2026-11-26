"use client";

import { useEffect, useState } from "react";
import { Download, HeartPulse } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, SignInPrompt } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Input, Notice, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";

interface ProfileForm {
  displayName: string;
  handle: string;
  bio: string;
  homeCity: string;
  countryCode: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodGroup: string;
  medicalNotes: string;
  upiVpa: string;
}

const EMPTY: ProfileForm = { displayName: "", handle: "", bio: "", homeCity: "", countryCode: "", phone: "", emergencyContactName: "", emergencyContactPhone: "", bloodGroup: "", medicalNotes: "", upiVpa: "" };

export function ProfileEditor() {
  const { status, refreshMe } = useAuth();
  const { notify, view } = useToast();
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "signed_in") return;
    api
      .get<Partial<Record<keyof ProfileForm, string | null>>>("/users/me")
      .then((me) => setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, me[k as keyof ProfileForm] ?? ""])) as unknown as ProfileForm))
      .catch((e) => setError(errorMessage(e)));
  }, [status]);

  if (status === "signed_out") return <SignInPrompt what="edit your profile" />;

  const set = (k: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Send only non-empty fields; validation rejects empty strings for patterned fields.
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, k === "countryCode" ? v.toUpperCase() : v.trim()]));
      await api.patch("/users/me", body);
      await refreshMe();
      notify("Profile saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    try {
      const data = await api.get<unknown>("/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kaafila-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify("Export failed", errorMessage(err));
    }
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader eyebrow="Account" title="Profile & safety card" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card>
        <CardTitle title="Public profile" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name">
            <Input value={form.displayName} onChange={set("displayName")} maxLength={80} />
          </Field>
          <Field label="Handle" hint="3–24 lowercase letters, numbers or _">
            <Input value={form.handle} onChange={set("handle")} maxLength={24} />
          </Field>
          <Field label="Home city">
            <Input value={form.homeCity} onChange={set("homeCity")} maxLength={80} />
          </Field>
          <Field label="Country code" hint="Two letters, e.g. IN">
            <Input value={form.countryCode} onChange={set("countryCode")} maxLength={2} className="uppercase" />
          </Field>
          <Field label="Bio" className="sm:col-span-2">
            <Textarea value={form.bio} onChange={set("bio")} maxLength={300} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardTitle eyebrow="Kitty" title="Get paid back" />
        <Field label="UPI ID" hint="Shown to convoy members who owe you, as a one-tap UPI payment link.">
          <Input value={form.upiVpa} onChange={set("upiVpa")} placeholder="name@bank" maxLength={120} />
        </Field>
      </Card>
      <Card>
        <CardTitle eyebrow="Shared only during an SOS" title="Safety card" right={<HeartPulse className="h-4 w-4 text-rose-300" />} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} maxLength={30} inputMode="tel" />
          </Field>
          <Field label="Blood group">
            <Select value={form.bloodGroup} onChange={set("bloodGroup")}>
              <option value="">Not set</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Emergency contact name">
            <Input value={form.emergencyContactName} onChange={set("emergencyContactName")} maxLength={80} />
          </Field>
          <Field label="Emergency contact phone">
            <Input value={form.emergencyContactPhone} onChange={set("emergencyContactPhone")} maxLength={30} inputMode="tel" />
          </Field>
          <Field label="Medical notes (allergies, conditions)" className="sm:col-span-2">
            <Textarea value={form.medicalNotes} onChange={set("medicalNotes")} maxLength={300} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Your convoy sees this only when you raise an SOS, so helpers know who to call and what to tell paramedics.</p>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button variant="outline" onClick={exportData}>
          <Download className="h-4 w-4" /> Download my data
        </Button>
      </div>
      {view}
    </div>
  );
}
