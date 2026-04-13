"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const FIELDS = [
  { name: "name", label: "Your name", type: "text", placeholder: "Jane Smith" },
  { name: "email", label: "Email", type: "email", placeholder: "jane@example.com" },
  { name: "phone", label: "Phone", type: "tel", placeholder: "(555) 012-3456" },
  { name: "origin", label: "Moving from", type: "text", placeholder: "Chicago, IL" },
  { name: "destination", label: "Moving to", type: "text", placeholder: "Austin, TX" },
  { name: "moveDate", label: "Move date", type: "date", placeholder: "" },
  { name: "homeSize", label: "Home size", type: "text", placeholder: "2-bedroom apartment" },
  { name: "specialItems", label: "Special items", type: "text", placeholder: "Piano, safe, etc." },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];

declare global {
  interface Window {
    MascotBotWidget?: {
      sendFormEdit: (field: string, value: string) => void;
    };
  }
}

type WidgetMessage =
  | { type: "widget-form-update"; field: string; value: string }
  | { type: "widget-form-submit" };

export function EstimateForm() {
  const [values, setValues] = useState<Record<FieldName, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.name, ""])) as Record<
      FieldName,
      string
    >,
  );
  const [submitted, setSubmitted] = useState(false);
  const editTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const onMessage = (e: Event) => {
      const ce = e as CustomEvent<WidgetMessage>;
      const data = ce.detail;
      if (!data) return;

      if (data.type === "widget-form-update") {
        setValues((prev) => {
          const fieldName = data.field as FieldName;
          if (!(fieldName in prev)) return prev;
          if (prev[fieldName] === data.value) return prev;
          return { ...prev, [fieldName]: data.value };
        });
      } else if (data.type === "widget-form-submit") {
        setSubmitted(true);
      }
    };
    window.addEventListener("mascotbot-widget-message", onMessage);
    return () =>
      window.removeEventListener("mascotbot-widget-message", onMessage);
  }, []);

  const progress = useMemo(() => {
    const filled = FIELDS.filter((f) => values[f.name].trim().length > 0).length;
    return Math.round((filled / FIELDS.length) * 100);
  }, [values]);

  const update = (field: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Debounce the notification to the widget so quick typing doesn't flood it.
    const timers = editTimers.current;
    if (timers[field]) clearTimeout(timers[field]);
    timers[field] = setTimeout(() => {
      window.MascotBotWidget?.sendFormEdit(field, value);
    }, 600);
  };

  if (submitted) {
    return (
      <div
        style={{
          padding: 32,
          border: "1px solid var(--border)",
          borderRadius: 16,
          background: "white",
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          Got it — estimate submitted.
        </h2>
        <p style={{ color: "var(--muted)", marginBottom: 24 }}>
          We'll text {values.phone || "you"} within an hour with a flat quote
          for your move from {values.origin || "origin"} to{" "}
          {values.destination || "destination"}.
        </p>
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          {FIELDS.filter((f) => values[f.name]).map((f) => (
            <div key={f.name} style={{ display: "flex", gap: 12 }}>
              <span
                style={{
                  minWidth: 120,
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                {f.label}
              </span>
              <span>{values[f.name]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      style={{
        padding: 32,
        border: "1px solid var(--border)",
        borderRadius: 16,
        background: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Moving estimate</h2>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {progress}% complete
        </span>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        {FIELDS.map((f) => (
          <label
            key={f.name}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              gridColumn: f.name === "specialItems" ? "1 / -1" : "auto",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {f.label}
            </span>
            <input
              name={f.name}
              type={f.type}
              placeholder={f.placeholder}
              value={values[f.name]}
              onChange={(e) => update(f.name, e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 15,
                background: "white",
              }}
            />
          </label>
        ))}
      </div>

      <button
        type="submit"
        style={{
          marginTop: 24,
          padding: "12px 24px",
          background: "var(--fg)",
          color: "white",
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 15,
          border: "none",
          cursor: "pointer",
        }}
      >
        Submit estimate
      </button>

      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>
        Or ask the voice assistant — it'll fill this in as you speak.
      </p>
    </form>
  );
}
