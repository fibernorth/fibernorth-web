"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { COMPANY } from "@/lib/constants";

const GENERAL_OPTION = "Any / General Labor";

interface ApplicationFormProps {
  positions: string[];
}

export function ApplicationForm({ positions }: ApplicationFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    equipmentExperience: "",
    howHeard: "",
  });
  const [positionsInterested, setPositionsInterested] = useState<string[]>([]);
  const [hasCDL, setHasCDL] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const positionOptions = [...positions, GENERAL_OPTION];

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const togglePosition = (title: string) => {
    setPositionsInterested((prev) =>
      prev.includes(title) ? prev.filter((p) => p !== title) : [...prev, title]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, positionsInterested, hasCDL }),
      });

      if (res.ok) {
        setSubmitted(true);
        sendGAEvent("event", "submit_application", { form: "job_application" });
      } else {
        setSubmitError(
          "Something went wrong sending your application. Please try again, or call us at (231) 264-0757."
        );
      }
    } catch (err) {
      console.error("Submit failed:", err);
      setSubmitError(
        "Something went wrong sending your application. Please try again, or call us at (231) 264-0757."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <CheckCircle className="h-12 w-12 text-accent mx-auto mb-4" />
        <h3 className="text-2xl font-bold mb-2">Application Received!</h3>
        <p className="text-muted-foreground">
          Application received &mdash; we&apos;ll be in touch.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Want to talk sooner? Call us at{" "}
          <a
            href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
            className="text-primary hover:underline"
          >
            {COMPANY.phone}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-lg p-6 sm:p-8 space-y-5 text-left"
    >
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label htmlFor="app-name" className="text-sm font-medium">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="app-name"
            type="text"
            required
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="app-phone" className="text-sm font-medium">
            Phone <span className="text-destructive">*</span>
          </label>
          <input
            id="app-phone"
            type="tel"
            required
            value={formData.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="app-email" className="text-sm font-medium">
          Email <span className="text-destructive">*</span>
        </label>
        <input
          id="app-email"
          type="email"
          required
          value={formData.email}
          onChange={(e) => updateField("email", e.target.value)}
          className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Positions You&apos;re Interested In
        </legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {positionOptions.map((title, i) => (
            <div key={title} className="flex items-center gap-2">
              <input
                id={`app-position-${i}`}
                type="checkbox"
                checked={positionsInterested.includes(title)}
                onChange={() => togglePosition(title)}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor={`app-position-${i}`} className="text-sm">
                {title}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Do you have a CDL?</legend>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <input
              id="app-cdl-yes"
              type="radio"
              name="hasCDL"
              checked={hasCDL === true}
              onChange={() => setHasCDL(true)}
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="app-cdl-yes" className="text-sm">
              Yes
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="app-cdl-no"
              type="radio"
              name="hasCDL"
              checked={hasCDL === false}
              onChange={() => setHasCDL(false)}
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="app-cdl-no" className="text-sm">
              No
            </label>
          </div>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="app-equipment" className="text-sm font-medium">
          What equipment have you run?
        </label>
        <textarea
          id="app-equipment"
          rows={3}
          value={formData.equipmentExperience}
          onChange={(e) => updateField("equipmentExperience", e.target.value)}
          className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="Directional drills, plows, mini excavators, locators, etc."
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="app-how-heard" className="text-sm font-medium">
          How did you hear about us?
        </label>
        <input
          id="app-how-heard"
          type="text"
          value={formData.howHeard}
          onChange={(e) => updateField("howHeard", e.target.value)}
          className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Google, referral, Indeed, etc."
        />
      </div>

      {submitError && (
        <div
          className="bg-destructive/10 text-destructive text-sm p-3 rounded-md"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors text-lg flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {submitting ? "Submitting..." : "Submit Application"}
      </button>
    </form>
  );
}
