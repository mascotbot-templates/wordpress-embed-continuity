// IMPORTANT: all links are plain <a href>, NOT Next.js <Link>. This enforces
// real page reloads, matching how the widget will behave on a real WordPress
// site. Every click hard-navigates — and the conversation survives.

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/estimate", label: "Get Estimate" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "rgba(250, 248, 245, 0.92)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <nav
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <a
          href="/"
          style={{
            fontWeight: 700,
            fontSize: 20,
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          Movers Co.
        </a>
        <ul
          style={{
            display: "flex",
            gap: 20,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {links.slice(1).map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                style={{ textDecoration: "none", color: "var(--muted)" }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        marginTop: 80,
        padding: "32px 24px",
        color: "var(--muted)",
        fontSize: 14,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        © 2026 Movers Co. (demo). WordPress-simulating multi-page site. All
        navigation uses real page reloads — watch the conversation continue.
      </div>
    </footer>
  );
}
