"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./ui";

/** Charts load after the page's first paint: they are below the headline figures and not needed to read or act on a page. */
const fallback = () => <div className="chart-card" role="status" aria-label="Loading chart…" aria-busy="true"><Skeleton h={20} w="35%" /><Skeleton h={200} /></div>;

export const GroupedBars = dynamic(() => import("./charts").then((m) => m.GroupedBars), { loading: fallback });
export const SimpleBars = dynamic(() => import("./charts").then((m) => m.SimpleBars), { loading: fallback });
export const HBars = dynamic(() => import("./charts").then((m) => m.HBars), { loading: fallback });
export const RangeBars = dynamic(() => import("./charts").then((m) => m.RangeBars), { loading: fallback });
export const SpendLine = dynamic(() => import("./charts").then((m) => m.SpendLine), { loading: fallback });
