"use client";

import { useEffect, useRef, useState } from "react";
import { SurveyForm } from "@/components/survey/survey-form";
import { formatWibTime } from "@/lib/date";
import type { SurveyDefinition } from "@/lib/surveyDefinition";
import type { Answers } from "@/lib/validation/engine";
import { saveAnswersAction } from "./actions";

type SaveStatus = { kind: "idle" | "saving" | "saved" | "retrying" | "error"; at?: string; message?: string };
const DEBOUNCE_MS = 1000; // FR-07.04
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * FR-07.04: autosave tiap perubahan (debounce 1 dtk), indikator "Tersimpan pukul …",
 * gagal jaringan → coba ulang otomatis dengan jeda bertahap. Satu permintaan
 * simpan berjalan pada satu waktu supaya urutan perubahan terjaga.
 */
export function SurveyFill({
  periodId,
  definition,
  institutionType,
  initialAnswers,
  editable,
  lastSavedAt,
  revisionNotes,
}: {
  periodId: string;
  definition: SurveyDefinition;
  institutionType: { id: string; code: string };
  initialAnswers: Answers;
  editable: boolean;
  lastSavedAt: string | null;
  revisionNotes?: Record<string, string>;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [status, setStatus] = useState<SaveStatus>(lastSavedAt ? { kind: "saved", at: lastSavedAt } : { kind: "idle" });
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const attempt = useRef(0);

  function schedule(delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }

  async function flush() {
    if (inFlight.current || Object.keys(pending.current).length === 0) return;
    const changes = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus({ kind: "saving" });
    try {
      const res = await saveAnswersAction({ periodId, changes });
      if (res.error) {
        // ditolak server (mis. periode ditutup) — tidak dicoba ulang, tampilkan alasannya
        setStatus({ kind: "error", message: res.error });
      } else {
        attempt.current = 0;
        setStatus({ kind: "saved", at: res.savedAt });
      }
    } catch {
      pending.current = { ...changes, ...pending.current }; // perubahan yang lebih baru tetap menang
      attempt.current += 1;
      setStatus({ kind: "retrying" });
      schedule(Math.min(MAX_RETRY_DELAY_MS, 2000 * 2 ** (attempt.current - 1)));
    } finally {
      inFlight.current = false;
      if (Object.keys(pending.current).length > 0 && attempt.current === 0) schedule(DEBOUNCE_MS);
    }
  }

  function onChange(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    pending.current[key] = value;
    schedule(DEBOUNCE_MS);
  }

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    // jangan biarkan peserta menutup halaman dengan perubahan yang belum tersimpan
    const warn = (e: BeforeUnloadEvent) => {
      if (inFlight.current || Object.keys(pending.current).length > 0) e.preventDefault();
    };
    // pindah tab/aplikasi di ponsel: simpan sekarang, jangan tunggu jeda
    const onHide = () => document.visibilityState === "hidden" && void flushRef.current();
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", onHide);
      // navigasi di dalam aplikasi (klik link) tidak memicu beforeunload — simpan perubahan yang tertunda
      clearTimeout(timer.current);
      void flushRef.current();
    };
  }, []);

  return (
    <div className="space-y-4">
      {editable && (
        <p role="status" aria-live="polite" data-testid="save-status" data-saved-at={status.at} className="sticky top-0 z-10 bg-background py-1 text-sm">
          {status.kind === "saving" && <span className="text-muted-foreground">Menyimpan…</span>}
          {status.kind === "saved" && status.at && <span className="text-green-700">Tersimpan pukul {formatWibTime(new Date(status.at))}</span>}
          {status.kind === "retrying" && <span className="text-amber-700">Gagal menyimpan (koneksi terputus?). Mencoba lagi otomatis…</span>}
          {status.kind === "error" && <span className="text-destructive">Tidak tersimpan: {status.message}</span>}
        </p>
      )}
      <SurveyForm definition={definition} institutionType={institutionType} answers={answers} onChange={onChange} disabled={!editable} participant revisionNotes={revisionNotes} />
    </div>
  );
}
