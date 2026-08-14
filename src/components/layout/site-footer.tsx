import Link from "next/link";
import { Logo } from "@/components/icons/logo";
import { COMPANY, SERVICES } from "@/lib/constants";
import { Phone, Mail, MapPin } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company */}
          <div className="space-y-4">
            <Logo />
            <p className="text-sm text-muted-foreground">
              {COMPANY.tagline}
            </p>
            <p className="text-xs text-muted-foreground">
              A division of {COMPANY.legalName}
            </p>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Services</h3>
            <ul className="space-y-2">
              {SERVICES.slice(0, 6).map((service) => (
                <li key={service.slug}>
                  <Link
                    href={`/services/${service.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Company</h3>
            <ul className="space-y-2">
              {[
                { href: "/about", label: "About Us" },
                { href: "/projects", label: "Projects" },
                { href: "/fleet", label: "Our Fleet" },
                { href: "/why-trenchless", label: "Why Trenchless?" },
                { href: "/service-area", label: "Service Area" },
                { href: "/testimonials", label: "Testimonials" },
                { href: "/employment", label: "Careers" },
                { href: "/blog", label: "Blog" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Contact</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="h-4 w-4 text-primary" />
                  {COMPANY.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4 text-primary" />
                  {COMPANY.email}
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary mt-0.5" />
                <span>
                  {COMPANY.address}
                  <br />
                  {COMPANY.poBox}
                  <br />
                  {COMPANY.city}, {COMPANY.state} {COMPANY.zip}
                </span>
              </li>
            </ul>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Mon-Fri: 7:00 AM - 2:00 PM
              </p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} KSA Services. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Fully Licensed &amp; Insured</span>
            <span className="text-border">|</span>
            <span>MISS DIG 811 Compliant</span>
            <span className="text-border">|</span>
            <span>Locating Specialist on Staff</span>
            <span className="text-border">|</span>
            <a
              href="https://bore-on.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Proud user of bore-on.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
