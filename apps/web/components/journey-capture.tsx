"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttribution, recordJourneyEvent } from "../lib/attribution";

export function JourneyCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(search);
    captureAttribution(pathname, params);
    const key = "vl-page-event:" + pathname + "?" + search;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void recordJourneyEvent("page_view");
  }, [pathname, search]);

  return null;
}
