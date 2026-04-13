import { SiteFooter, SiteNav } from "@/components/nav";

const services = [
  { title: "Local moves", body: "Same-day and next-day. 1-bed to 4-bed homes." },
  { title: "Long-distance", body: "Multi-state, direct-route. Tracked the whole way." },
  { title: "Packing & unpacking", body: "Full-service or box-drop-off. You choose." },
  { title: "Storage", body: "Climate-controlled units, month-to-month." },
  { title: "Office moves", body: "After-hours and weekend slots for zero downtime." },
  { title: "Piano & specialty", body: "Uprights, grands, safes, pool tables. The heavy stuff." },
];

export default function Services() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 32,
          }}
        >
          Services
        </h1>
        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {services.map((s) => (
            <div
              key={s.title}
              style={{
                padding: 24,
                border: "1px solid var(--border)",
                borderRadius: 16,
                background: "white",
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {s.title}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 15 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
