"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SERVICES, COMPANY } from "@/lib/constants";
import { Phone, Mail, MapPin, Clock, Loader2, CheckCircle } from "lucide-react";
import type { MapAnnotation } from "@/lib/types";

const MapDrawingTool = dynamic(
  () => import("./map-drawing-tool").then((m) => m.MapDrawingTool),
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
  });
  const [mapAnnotation, setMapAnnotation] = useState<MapAnnotation | null>(null);
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
        body: JSON.stringify({ ...formData, mapAnnotation }),
      });

      if (res.ok) {
        setSubmitted(true);
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
        <h2 className="text-2xl font-bold mb-2">Quote Request Received!</h2>
        <p className="text-muted-foreground">
          We&apos;ll review your project and get back to you within 1 business day.
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
        <h2 className="text-xl font-bold">Request a Quote</h2>

        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
            <input type="text" required value={formData.name} onChange={(e) => updateField("name", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone <span className="text-destructive">*</span></label>
            <input type="tel" required value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
          <input type="email" required value={formData.email} onChange={(e) => updateField("email", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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
            <label className="text-sm font-medium">How did you hear about us?</label>
            <input type="text" value={formData.howHeard} onChange={(e) => updateField("howHeard", e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Google, referral, etc." />
          </div>
        </div>

        {/* Map Drawing Tool */}
        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium">Mark Your Property (Optional)</label>
          <p className="text-xs text-muted-foreground">
            Enter your address above, then use the tools to mark existing wells, septic tanks, utility lines, and draw your desired bore path.
          </p>
          <MapDrawingTool onAnnotationChange={setMapAnnotation} />
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
          {submitting ? "Submitting..." : "Submit Quote Request"}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          We typically respond within 1 business day.
        </p>
      </form>

      {/* Sidebar */}
      <div className="space-y-6">
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
          <h3 className="font-bold mb-2 text-primary">Quick Response</h3>
          <p className="text-sm text-muted-foreground">
            Need something fast? Call us directly. Most jobs can be scheduled within 3 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
