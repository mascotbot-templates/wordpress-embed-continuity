import { SiteFooter, SiteNav } from "@/components/nav";

export default function About() {
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
          About us
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", marginBottom: 16 }}>
          Movers Co. started in a 2009 Ford Transit with two brothers, a dolly,
          and an ill-advised amount of optimism. Fifteen years later, we've done
          just over 8,000 moves across the Midwest and built a reputation for
          actually answering the phone.
        </p>
        <p style={{ fontSize: 18, color: "var(--muted)" }}>
          We believe moving shouldn't be the worst day of your year. Ask the
          assistant how we do it differently.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
