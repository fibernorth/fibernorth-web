import { Metadata } from "next";
import { QuoteForm } from "@/components/quote/quote-form";

export const metadata: Metadata = {
  title: "Contact & Get a Quote",
  description:
    "Get a free estimate for directional drilling and trenchless installations in Northern Michigan. Call (231) 264-0757 or fill out our quote form.",
};

export default function ContactPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Get a <span className="text-primary">Free Quote</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Tell us about your project. Most jobs are scheduled within 3 days
            and completed in a single day.
          </p>
        </div>

        <QuoteForm />
      </div>
    </div>
  );
}
