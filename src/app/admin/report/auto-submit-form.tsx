"use client";

import type { ReactNode } from "react";

/** FR-11.01: hasil report langsung diperbarui saat filter diubah (tombol Terapkan tetap ada tanpa JS). */
export function AutoSubmitForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form className={className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}
