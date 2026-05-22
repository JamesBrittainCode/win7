"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    const tick = () => setValue(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, []);

  return <>{value}</>;
}

