import { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How FiberNorth Underground collects, uses, and protects the information you share with us — quote requests, job applications, and site analytics.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-black tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Effective September 2026 · FiberNorth Underground, a division of{" "}
          {COMPANY.legalName}
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              The short version
            </h2>
            <p>
              We collect the information you give us to quote and do your job,
              we use standard analytics to understand how people find us, and
              we don&apos;t sell your information to anyone. Questions? Call{" "}
              {COMPANY.phone} or email {COMPANY.email}.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              What we collect
            </h2>
            <p className="mb-2">
              <strong className="text-foreground">Quote requests.</strong> When
              you ask for an estimate, we collect what you enter: your name,
              phone number, email, the job address, a description of the
              project, and anything optional you add — markings on the property
              map or an uploaded photo, sketch, or site plan.
            </p>
            <p className="mb-2">
              <strong className="text-foreground">Job applications.</strong>{" "}
              When you apply for work with us, we collect the contact and
              experience information you submit.
            </p>
            <p>
              <strong className="text-foreground">Site analytics.</strong> Like
              most websites, we use Google Analytics to see which pages people
              visit and how they found us, and Google Ads conversion tracking
              to know when our advertising works. These tools use cookies and
              collect device information (browser type, approximate location,
              pages viewed). They do not tell us who you are.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              How we use it
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To contact you about your quote and schedule your job</li>
              <li>To plan the work — the map markings and uploads exist so we can see your property before we quote it</li>
              <li>To consider your job application</li>
              <li>To measure our advertising and improve the website</li>
            </ul>
            <p className="mt-2">
              We do not sell, rent, or trade your personal information. Ever.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Who else touches the data
            </h2>
            <p className="mb-2">
              Your information is stored and processed by service providers we
              use to run the business:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-foreground">Google</strong> — website
                hosting, data storage (Firebase), Google Maps for the property
                map, Google Analytics, and Google Ads measurement
              </li>
              <li>
                <strong className="text-foreground">
                  Notification services
                </strong>{" "}
                — when you submit a quote request, our team is alerted by
                email, text message, and our internal Slack workspace so we can
                respond quickly
              </li>
            </ul>
            <p className="mt-2">
              These providers process data on our behalf and under their own
              security obligations. We share information beyond that only if
              the law requires it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Cookies and choices
            </h2>
            <p className="mb-2">
              Analytics and advertising cookies are the only kind we use. You
              can block or clear cookies in your browser settings, install
              Google&apos;s{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                className="text-primary hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                Analytics opt-out
              </a>
              , or adjust ad personalization at{" "}
              <a
                href="https://adssettings.google.com"
                className="text-primary hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                adssettings.google.com
              </a>
              . The website works fine without cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Keeping and deleting
            </h2>
            <p>
              We keep quote and job records as long as we need them to serve
              you and meet our business and legal obligations. If you want the
              information from a quote request deleted, call or email us and
              we&apos;ll take care of it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">Security</h2>
            <p>
              The site runs over HTTPS, form data goes into access-controlled
              storage, and uploads are private — not publicly listable. No
              system is perfect, but we treat your information the way
              we&apos;d want ours treated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">Children</h2>
            <p>
              Our services and website are for adults. We don&apos;t knowingly
              collect information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Changes and contact
            </h2>
            <p>
              If this policy changes, the new version will be posted here with
              a new effective date. Questions or requests:{" "}
              <a
                href={`tel:+1${COMPANY.phone.replace(/[^0-9]/g, "")}`}
                className="text-primary hover:underline"
              >
                {COMPANY.phone}
              </a>{" "}
              ·{" "}
              <a
                href={`mailto:${COMPANY.email}`}
                className="text-primary hover:underline"
              >
                {COMPANY.email}
              </a>{" "}
              · {COMPANY.address}, {COMPANY.city}, {COMPANY.state}{" "}
              {COMPANY.zip}.
            </p>
          </section>

          <p className="text-sm">
            Looking for a quote instead?{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Head back to the estimate form.
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
