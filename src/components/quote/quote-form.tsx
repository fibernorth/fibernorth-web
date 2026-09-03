"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SERVICES, COMPANY } from "@/lib/constants";
import { Phone, Mail, MapPin, Clock, Loader2, CheckCircle } from "lucide-react";
import type { MapAnnotation } from "@/lib/types";

const MapDrawingTool = dynamic(
  () => import("./map-quote-tool").then((m) => m.MapQuoteTool),
  { ssr: false, loading: () => <div className="w-full h-[450px] bg-muted rounded-lg flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading map...</p></div> }
);

export function QuoteForm() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    serviceType: "",
    description: "",
    urgency: "flexible",
    howHeard: "",
    soilType: "",
  });
  const [mapAnnotation, setMapAnnotation] = useState<MapAnnotation | null>(null);
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    dataBase64: string;
  } | null>(null);
  const [attachmentError, setAttachmentError] = useState("");

  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
  ];

  const handleFile = (file: File | undefined) => {
    setAttachmentError("");
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAttachmentError("That file type won't work — use a photo (JPG, PNG) or a PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError("That file is over 10MB. A phone photo of the plan works fine.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      setAttachment({ name: file.name, type: file.type, dataBase64: base64 });
    };
    reader.readAsDataURL(file);
  };
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, mapAnnotation, attachment }),
      });

      if (res.ok) {
        setSubmitted(true);
        sendGAEvent("event", "generate_lead", {
          form: "quote_request",
          service_type: formData.serviceType || "unspecified",
        });
      } else {
        setSubmitError(
          "Something went wrong sending your request. Please try again, or call us at (231) 264-0757."
        );
      }
    } catch (err) {
      console.error("Submit failed:", err);
      setSubmitError(
        "Something went wrong sending your request. Please try again, or call us at (231) 264-0757."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <CheckCircle className="h-12 w-12 text-accent mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Got it. We&apos;re on it.</h2>
        <p className="text-muted-foreground">
          We&apos;ll look over your job and get back to you within 1 business day.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Need something faster? Call us at{" "}
          <a href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`} className="text-primary hover:underline">
            {COMPANY.phone}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-8">
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-xl font-bold">Tell Us About Your Job</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Takes about a minute. Free estimates, no obligation. So you can
            plan: a 100-foot water line runs about $3,000, and most
            residential jobs land in that neighborhood.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
            <input type="text" required value={formData.name} onChange={(e) => updateField("name", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone <span className="text-destructive">*</span></label>
            <input type="tel" required value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <p className="text-xs text-muted-foreground">So we can call you back with your estimate.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
          <input type="email" required value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="name@example.com" className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Property Address / Job Location <span className="text-destructive">*</span></label>
          <input type="text" required value={formData.address} onChange={(e) => updateField("address", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="123 Main St, Traverse City, MI" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Type of Service</label>
          <select value={formData.serviceType} onChange={(e) => updateField("serviceType", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select a service...</option>
            {SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            <option value="other">Other / Not Sure</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Describe Your Project</label>
          <textarea rows={3} value={formData.description} onChange={(e) => updateField("description", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder="Where does the line need to go? How far? Any obstacles?" />
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Timeline</label>
            <select value={formData.urgency} onChange={(e) => updateField("urgency", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="flexible">Flexible</option>
              <option value="soon">Within a month</option>
              <option value="urgent">ASAP</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What&apos;s the ground like, if you know?</label>
            <select value={formData.soilType} onChange={(e) => updateField("soilType", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Not sure — that&apos;s fine</option>
              <option value="sand">Sand</option>
              <option value="sand-gravel">Sand with gravel and stones</option>
              <option value="loam">Topsoil / regular dirt</option>
              <option value="clay">Clay</option>
              <option value="cobble">Lots of rocks or boulders</option>
              <option value="hardpan">Really hard digging (hardpan)</option>
              <option value="muck">Wet, swampy, or muck</option>
              <option value="mixed">It changes across the property</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">How did you hear about us?</label>
          <input type="text" value={formData.howHeard} onChange={(e) => updateField("howHeard", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Google, referral, etc." />
        </div>

        {/* Map Drawing Tool */}
        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium">Map Your Job (Optional)</label>
          <p className="text-xs text-muted-foreground">
            Find your property, draw the line where you want it, and we&apos;ll see the footage. Mark what&apos;s in the ground and add notes if it helps.
          </p>
          <MapDrawingTool
            onAnnotationChange={setMapAnnotation}
            geocodeAddress={formData.address}
          />
        </div>

        {/* Upload a plan instead */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Or Upload a Plan or Photo (Optional)
          </label>
          <p className="text-xs text-muted-foreground">
            Got a site plan, a sketch on paper, or a photo of the yard? Snap a
            picture and attach it — JPG, PNG, or PDF up to 10MB.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary file:font-medium file:cursor-pointer hover:file:bg-primary/20"
          />
          {attachment && (
            <p className="text-xs text-accent">
              Attached: {attachment.name}{" "}
              <button
                type="button"
                onClick={() => handleFile(undefined)}
                className="underline text-muted-foreground hover:text-foreground"
              >
                remove
              </button>
            </p>
          )}
          {attachmentError && (
            <p className="text-xs text-destructive" role="alert">
              {attachmentError}
            </p>
          )}
        </div>

        {submitError && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md" role="alert">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors text-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {submitting ? "Sending..." : "Get My Free Estimate"}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          We typically respond within 1 business day, and most jobs are
          scheduled within 3 days.
        </p>
      </form>

      {/* Sidebar */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-bold mb-3">What Jobs Cost</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Here&apos;s a real example to work from: a 100-foot water line,
            well to house, runs about{" "}
            <span className="text-foreground font-semibold">$3,000</span> — one
            price for drilling, pulling your line through, and cleanup. Longer
            runs cost more. Going deeper doesn&apos;t.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            That number is what it takes to do this right: a drill rig,
            locating gear, and a trained crew — half a million dollars of
            equipment rolling to your driveway.
          </p>
          <p className="text-sm text-muted-foreground">
            If that&apos;s outside the budget, we&apos;d rather say so here
            than in your driveway. Before you decide, look at{" "}
            <Link href="/why-trenchless" className="text-primary hover:underline">
              what trenching really costs
            </Link>{" "}
            once the yard repair is counted.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-bold mb-4">Contact Info</h3>
          <div className="space-y-4">
            <a href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`} className="flex items-center gap-3 text-sm hover:text-primary transition-colors">
              <Phone className="h-4 w-4 text-primary shrink-0" />{COMPANY.phone}
            </a>
            <a href={`mailto:${COMPANY.email}`} className="flex items-center gap-3 text-sm hover:text-primary transition-colors">
              <Mail className="h-4 w-4 text-primary shrink-0" />{COMPANY.email}
            </a>
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{COMPANY.address}<br />{COMPANY.city}, {COMPANY.state} {COMPANY.zip}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />Business Hours
          </h3>
          <div className="space-y-1.5">
            {Object.entries(COMPANY.hours).map(([day, hours]) => (
              <div key={day} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{day}</span>
                <span className={hours === "Closed" ? "text-muted-foreground" : ""}>{hours}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
          <h3 className="font-bold mb-3 text-primary">What Happens Next</h3>
          <ol className="space-y-3">
            {[
              "We get back to you within 1 business day with a free estimate.",
              "MISS DIG marks the existing utilities on your property.",
              "We usually get you scheduled within 3 days of marking.",
              "Most jobs are done in a day or less.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground mt-4 pt-3 border-t border-primary/20">
            In a hurry? Call us directly at{" "}
            <a href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`} className="text-primary font-semibold hover:underline">
              {COMPANY.phone}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
