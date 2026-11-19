"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PanelPageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  return (
    <h1 ref={title} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
