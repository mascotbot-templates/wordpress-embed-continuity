import { SiteFooter, SiteNav } from "@/components/nav";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}>
        <section style={{ maxWidth: 720, marginBottom: 80 }}>
          <h1
            style={{
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              marginBottom: 24,
            }}
          >
            Moves that feel less like a move.
          </h1>
          <p style={{ fontSize: 20, color: "var(--muted)" }}>
            Movers Co. is a family-run crew that's been lifting couches since
            2009. Ask the assistant anything — estimates, timing, pricing, or
            just what to expect on moving day.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <a
              href="/estimate"
              style={{
                padding: "12px 20px",
                background: "var(--fg)",
                color: "white",
                borderRadius: 999,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              Get an estimate →
            </a>
            <a
              href="/services"
              style={{
                padding: "12px 20px",
                border: "1px solid var(--border)",
                borderRadius: 999,
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              See services
            </a>
          </div>
        </section>

        <section style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[
            {
              title: "Local & long-distance",
              body: "From across town to across the country. Same crew. Same care.",
            },
            {
              title: "Transparent pricing",
              body: "Flat quotes after a 2-minute estimate. No surprises on moving day.",
            },
            {
              title: "Fully insured",
              body: "Licensed carriers, every move. Your stuff is protected end-to-end.",
            },
          ].map((card) => (
            <div
              key={card.title}
              style={{
                padding: 24,
                border: "1px solid var(--border)",
                borderRadius: 16,
                background: "white",
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {card.title}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 15 }}>{card.body}</p>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 80, padding: "40px 24px", background: "#fff", border: "1px solid var(--border)", borderRadius: 16 }}>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            Try this
          </p>
          <p style={{ fontSize: 16 }}>
            Click the voice button (bottom-right), say{" "}
            <em>&quot;I need a moving estimate&quot;</em>, and watch the agent take
            you to the estimate page — the page fully reloads, but the
            conversation picks up where it left off.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
