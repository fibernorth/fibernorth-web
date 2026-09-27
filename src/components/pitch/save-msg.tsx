"use client";

/** A save result: red for anything not saved, green for saved. */
export function SaveMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  const bad = !/^(Saved|Loaded)|code copied/.test(msg);
  return (
    <p className={bad ? "rounded-md bg-red-600/20 border border-red-500/60 px-2 py-1.5 text-sm font-semibold text-red-200" : "text-sm text-emerald-300"}>
      {msg}
    </p>
  );
}
