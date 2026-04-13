import { SiteFooter, SiteNav } from "@/components/nav";

export default function Contact() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "64px 24px" }}>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 24,
          }}
        >
          Contact
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", marginBottom: 32 }}>
          Call, email, or just use the voice assistant — it can get your move on
          the books faster than any form.
        </p>
        <div style={{ display: "grid", gap: 16, fontSize: 16 }}>
          <div>
            <strong style={{ display: "block", color: "var(--muted)", fontSize: 13 }}>
              Phone
            </strong>
            (555) 012-3456
          </div>
          <div>
            <strong style={{ display: "block", color: "var(--muted)", fontSize: 13 }}>
              Email
            </strong>
            hello@movers.example
          </div>
          <div>
            <strong style={{ display: "block", color: "var(--muted)", fontSize: 13 }}>
              Hours
            </strong>
            Mon–Sat, 8am–7pm
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
