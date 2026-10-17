"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useMyProfile } from "@/hooks/use-my-profile";
import { fillText, LEAD_EMAIL_TEMPLATES, fillTemplate } from "@/lib/lead-email-templates";

const input = "w-full h-11 rounded-md border border-border bg-background px-3 text-base";
const SAMPLE = { name: "Sarah Lee", serviceType: "Power", source: "website" };

/**
 * Admin -> My info: the name and phone that go in this person's lead texts,
 * emails and voicemail scripts. Everyone (sales included) edits only their own.
 */
export default function MyInfoPage() {
  const { profile, me, save } = useMyProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (profile && !loaded) {
      setName(profile.name);
      setPhone(profile.phone);
      setLoaded(true);
    }
  }, [profile, loaded]);

  const submit = async () => {
    setBusy(true);
    const err = await save({ name, phone });
    setBusy(false);
    setNote(err ? { ok: false, text: err } : { ok: true, text: "Saved. Your texts, emails and scripts use it now." });
  };

  const preview = { name: name.trim() || me?.name, phone: phone.trim() || undefined };
  const checkin = LEAD_EMAIL_TEMPLATES.find((t) => t.key === "checkin")!;

  if (!profile) {
    return (
      <div className="p-6 text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My info</h1>
        <p className="text-sm text-muted-foreground">
          Goes in your lead texts, emails and voicemail scripts: &quot;this is {(preview.name || "Bill").split(" ")[0]} with FiberNorth
          Underground&quot;, and the number customers call or text back.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Your phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(231) 555-0100" inputMode="tel" className={input} />
          <span className="block text-xs text-muted-foreground">
            {profile.owner
              ? "Leave blank to keep the FiberNorth numbers: (231) 384-0105 for Facebook/Instagram leads, (231) 944-6471 for everyone else."
              : "The number you call and text customers from."}
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Emails go out from {profile.email || "your address"}
          {/@fibernorth\.com$/i.test(profile.email) && !/^(bill|admin|webadmin)@/i.test(profile.email) ? ", replies come to you, and Bill gets a copy." : "."}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="h-11 px-5 rounded-md bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        {note && <p className={note.ok ? "text-sm text-accent" : "text-sm text-destructive"}>{note.text}</p>}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">How it reads</h2>
        <div className="rounded-md border border-border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {fillText("new-first", SAMPLE, { me: preview })}
        </div>
        <div className="rounded-md border border-border p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {fillTemplate(checkin, SAMPLE, { me: preview }).body}
        </div>
      </div>
    </div>
  );
}
