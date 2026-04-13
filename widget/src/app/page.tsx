"use client";

import dynamic from "next/dynamic";

const PersistentWidget = dynamic(
  () => import("@/components/widget").then((m) => ({ default: m.PersistentWidget })),
  { ssr: false },
);

export default function WidgetPage() {
  return <PersistentWidget />;
}
