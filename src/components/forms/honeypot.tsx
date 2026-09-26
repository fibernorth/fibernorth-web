import { HONEYPOT_FIELD } from "@/lib/honeypot";

/**
 * A field people never see or reach (off-screen, out of the tab order,
 * hidden from screen readers). Form-filling bots fill it; the server then
 * answers 200 and drops the submission.
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
      <label>
        Leave this empty
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** The honeypot's value from a submitted form ("" for people). */
export function honeypotValue(form: EventTarget | null): string {
  if (!(form instanceof HTMLFormElement)) return "";
  return String(new FormData(form).get(HONEYPOT_FIELD) || "");
}
