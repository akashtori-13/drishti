'use client';

import { swr } from '@/lib/cachefirst';

/** Shared measurement-report access: device cache first, web fallback.
 *  Reports are static build artifacts, so any cached copy is authoritative
 *  (Infinity TTL); the background revalidation only heals a corrupt entry.
 */
export interface ReportDoc {
  movers: number;
  variables: number;
  top_sigma: number;
  span_days: number | null;
  variable_flag: boolean;
  known: { name: string; kind: string } | null;
  detail: string;
  spectrum?: Array<{ band: number; wavelength_um: number; flux: number; flux_err: number; mjd: number }>;
  lightcurve?: Array<{ mjd?: number; flux: number; flux_err?: number }>;
  objects?: Array<{ kind: string; sigma: number; x: number; y: number; label: string | null }>;
}

export async function getReport(id: string): Promise<ReportDoc | null> {
  try {
    const r = await swr<ReportDoc>(`sh-report:${id}`, `/reports/${id}.json`, Infinity);
    return r?.data ?? null;
  } catch {
    return null;
  }
}
