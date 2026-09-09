"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { sendGAEvent } from "@next/third-parties/google";
import { COMPANY } from "@/lib/constants";

// Lightweight lead forms for the non-boring service lines (business internet,
// campgrounds). They post to the same /api/quote pipeline as the bore quote
// form — extra answers get composed into the description field so nothing new
// has to exist in Firestore rules or the admin.

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
}

interface LeadFormConfig {
  /** Stored as the quote's serviceType so the admin list shows the lead type */
  serviceType: string;
  /** GA event label */
  gaForm: string;
  heading: string;
  subheading: string;
  /** Field whose value becomes the contact name */
  nameKey: string;
  /** Field whose value becomes the address */
  addressKey: string;
  fields: FieldDef[];
  checkboxes?: { label: string; options: string[] };
  successTitle: string;
  successBody: string;
}

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export function LeadForm({ config }: { config: LeadFormConfig }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggle = (option: string) =>
    setChecked((prev) =>
      prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev, option]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const descLines = config.fields
      .filter(
        (f) =>
          !["phone", "email"].includes(f.key) &&
          f.key !== config.nameKey &&
          f.key !== config.addressKey &&
          (values[f.key] || "").trim()
      )
      .map((f) => `${f.label}: ${values[f.key].trim()}`);
    if (checked.length > 0 && config.checkboxes) {
      descLines.push(`${config.checkboxes.label}: ${checked.join(", ")}`);
    }

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: (values[config.nameKey] || "").trim(),
          phone: (values.phone || "").trim(),
          email: (values.email || "").trim(),
          address: (values[config.addressKey] || "").trim(),
          serviceType: config.serviceType,
          description: descLines.join("\n"),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        sendGAEvent("event", "generate_lead", {
          form: config.gaForm,
          service_type: config.serviceType,
        });
      } else {
        setError(
          `Something went wrong sending your request. Please try again, or call us at ${COMPANY.phone}.`
        );
      }
    } catch {
      setError(
        `Something went wrong sending your request. Please try again, or call us at ${COMPANY.phone}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <CheckCircle className="h-12 w-12 text-accent mx-auto mb-4" />
        <h3 className="text-2xl font-bold mb-2">{config.successTitle}</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          {config.successBody}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-xl p-6 sm:p-8 space-y-5"
    >
      <div>
        <h3 className="text-xl font-bold">{config.heading}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{config.subheading}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {config.fields
          .filter((f) => f.type !== "textarea")
          .map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium">
                {f.label}{" "}
                {f.required && <span className="text-destructive">*</span>}
              </label>
              {f.type === "select" ? (
                <select
                  required={f.required}
                  value={values[f.key] || ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select...</option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type || "text"}
                  required={f.required}
                  value={values[f.key] || ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className={inputCls}
                />
              )}
            </div>
          ))}
      </div>

      {config.checkboxes && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{config.checkboxes.label}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {config.checkboxes.options.map((o) => (
              <label
                key={o}
                className="flex items-center gap-2.5 text-sm text-muted-foreground cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked.includes(o)}
                  onChange={() => toggle(o)}
                  className="h-4 w-4"
                />
                {o}
              </label>
            ))}
          </div>
        </div>
      )}

      {config.fields
        .filter((f) => f.type === "textarea")
        .map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm font-medium">
              {f.label}{" "}
              {f.required && <span className="text-destructive">*</span>}
            </label>
            <textarea
              required={f.required}
              value={values[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
        ))}

      {error && (
        <div
          role="alert"
          className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg p-4 text-sm"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Send It
      </button>
    </form>
  );
}

export function InternetLeadForm() {
  return (
    <LeadForm
      config={{
        serviceType: "Business Internet",
        gaForm: "internet_lead",
        heading: "Free Carrier Check",
        subheading:
          "Takes a minute. We come back with every carrier that serves your address and what they charge. No obligation.",
        nameKey: "contactName",
        addressKey: "serviceAddress",
        fields: [
          { key: "businessName", label: "Business Name", required: true },
          { key: "contactName", label: "Your Name", required: true },
          { key: "phone", label: "Phone", type: "tel", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          {
            key: "serviceAddress",
            label: "Service Address",
            required: true,
            placeholder: "Where the internet needs to be",
          },
          {
            key: "currentSetup",
            label: "Current Provider & Monthly Bill",
            placeholder: "Spectrum, about $250/mo (best guess is fine)",
          },
          {
            key: "notes",
            label: "Anything Else",
            type: "textarea",
            placeholder:
              "Outages costing you money? Copper lines on an elevator or fire panel? More than one location?",
          },
        ],
        checkboxes: {
          label: "What are you after?",
          options: [
            "Dedicated fiber internet",
            "Business phones",
            "Copper phone line replacement",
            "Backup connection",
            "Multiple locations",
            "Not sure yet",
          ],
        },
        successTitle: "Got it. We're on it.",
        successBody:
          "We'll check every carrier for your address and get back to you within a business day with real numbers.",
      }}
    />
  );
}

export function CampgroundLeadForm() {
  return (
    <LeadForm
      config={{
        serviceType: "Campground",
        gaForm: "campground_lead",
        heading: "Tell Us About Your Park",
        subheading:
          "Takes a minute. The walk-through and the plan are free, and the work happens in your off season.",
        nameKey: "contactName",
        addressKey: "address",
        fields: [
          { key: "campgroundName", label: "Campground Name", required: true },
          { key: "contactName", label: "Your Name", required: true },
          { key: "phone", label: "Phone", type: "tel", required: true },
          { key: "email", label: "Email", type: "email", required: true },
          { key: "address", label: "Campground Address", required: true },
          {
            key: "sites",
            label: "Number of Sites",
            placeholder: "Rough count is fine",
          },
          {
            key: "currentInternet",
            label: "What Feeds the Park Now",
            placeholder: "Who's the internet from, and who runs the WiFi?",
          },
          {
            key: "timing",
            label: "When Do You Want to Talk?",
            type: "select",
            options: [
              "This fall",
              "This winter",
              "Before next season",
              "Just looking",
            ],
          },
          {
            key: "painPoint",
            label: "What Do the Complaints Sound Like?",
            type: "textarea",
            placeholder:
              "Front desk hears about it every weekend? Reviews mention it? Certain loops worse than others?",
          },
        ],
        successTitle: "Got it. We're on it.",
        successBody:
          "We'll take a look at your park and reach out to set up a walk. Fall is walking season — the work itself waits for your off season.",
      }}
    />
  );
}
