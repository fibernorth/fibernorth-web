import { Metadata } from "next";
import Link from "next/link";
import { Star, Quote } from "lucide-react";
import { getVisibleTestimonials } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "Testimonials",
  description: "What our customers say about FiberNorth Underground.",
};

export default async function TestimonialsPage() {
  const testimonials = await getVisibleTestimonials();

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Customer <span className="text-primary">Reviews</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Don&apos;t take our word for it — hear from homeowners and
            contractors we&apos;ve worked with across Northern Michigan.
          </p>
        </div>

        {testimonials.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Quote className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-muted-foreground">
              Reviews coming soon
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              We&apos;re collecting reviews from our happy customers. Check back
              soon!
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.id}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < testimonial.rating
                          ? "text-secondary fill-secondary"
                          : "text-muted-foreground/20"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-muted-foreground text-sm mb-4 italic">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    {testimonial.location && (
                      <p className="text-xs text-muted-foreground">
                        {testimonial.location}
                      </p>
                    )}
                  </div>
                  {testimonial.projectType && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {testimonial.projectType}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Ready to become our next happy customer?
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
          >
            Get a Free Quote
          </Link>
        </div>
      </div>
    </div>
  );
}
