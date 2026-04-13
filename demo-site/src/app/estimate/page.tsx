import { SiteFooter, SiteNav } from "@/components/nav";
import { EstimateForm } from "@/components/estimate-form";

export default function Estimate() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "64px 24px" }}>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 16,
          }}
        >
          Get your estimate
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", marginBottom: 32 }}>
          Tell us the basics. Fill it yourself, or just talk — the voice
          assistant will fill the form as you speak.
        </p>
        <EstimateForm />
      </main>
      <SiteFooter />
    </>
  );
}
