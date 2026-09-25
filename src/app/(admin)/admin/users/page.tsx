"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCog, Plus, Loader2, Trash2, KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/context/auth-provider";
import {
  listAdminUsers,
  createAdminUser,
  removeAdminUser,
  resetAdminPassword,
  sendAdminPasswordResetEmail,
  type AdminUser,
} from "@/actions/users";

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function AdminUsersPage() {
  const { getIdToken, user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      setUsers(await listAdminUsers(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await createAdminUser(form, token);
      setNotice(
        r.existing
          ? `${form.email} already had an account, so it was made an admin and kept its own password. Use the envelope button to email them a reset link if they need one.`
          : ""
      );
      setForm({ name: "", email: "", password: "" });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the user");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`Remove ${u.email}? They lose admin access right away.`)) return;
    setBusy(u.uid);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await removeAdminUser(u.uid, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the user");
    } finally {
      setBusy("");
    }
  };

  const emailReset = async (u: AdminUser) => {
    if (!window.confirm(`Email a password-reset link to ${u.email}?`)) return;
    setBusy(u.uid);
    setError("");
    setNotice("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      const r = await sendAdminPasswordResetEmail(u.uid, token);
      setNotice(`Reset link sent to ${r.email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the reset link");
    } finally {
      setBusy("");
    }
  };

  const reset = async (u: AdminUser) => {
    const pw = window.prompt(`New password for ${u.email} (8+ characters):`);
    if (!pw) return;
    setBusy(u.uid);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) throw new Error("Session expired, sign in again");
      await resetAdminPassword(u.uid, pw, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Users</h1>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Everyone here can sign in at fibernorth.com/login and use the whole admin,
        including leads and quotes. Give them the password in person or by text,
        not email.
      </p>

      {error && (
        <div
          role="alert"
          className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm"
        >
          {error}
        </div>
      )}

      {notice && (
        <div className="border border-border bg-muted/40 rounded-lg p-4 text-sm">{notice}</div>
      )}

      {adding && (
        <form onSubmit={add} className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="Chris"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputCls}
                placeholder="chris@fibernorth.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Temporary password *</label>
              <input
                type="text"
                required
                minLength={8}
                title="Used only for a brand-new account; an existing account keeps its password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className={inputCls}
                placeholder="at least 8 characters"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {users.map((u) => (
            <div key={u.uid} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {u.name || u.email}
                  {u.uid === me?.uid && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                  {u.disabled && (
                    <span className="ml-2 text-xs text-destructive">disabled</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {u.email}
                  {u.lastSignIn
                    ? ` · last sign-in ${new Date(u.lastSignIn).toLocaleDateString()}`
                    : " · never signed in"}
                  {u.builtIn ? " · owner" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => emailReset(u)}
                  disabled={busy === u.uid}
                  title="Email reset link"
                  className="p-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-4 w-4" />
                </button>
                {(!u.builtIn || u.uid === me?.uid) && (
                <button
                  onClick={() => reset(u)}
                  disabled={busy === u.uid}
                  title="Reset password"
                  className="p-2 text-muted-foreground hover:text-foreground"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                )}
                {!u.builtIn && u.uid !== me?.uid && (
                  <button
                    onClick={() => remove(u)}
                    disabled={busy === u.uid}
                    title="Remove"
                    className="p-2 text-muted-foreground hover:text-destructive"
                  >
                    {busy === u.uid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
