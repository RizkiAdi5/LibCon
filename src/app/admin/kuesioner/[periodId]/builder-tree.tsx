"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmAction } from "@/components/confirm-action";
import { deleteQuestionAction, deleteSectionAction, duplicateAction, reorderAction, saveSectionAction } from "../actions";
import { IconOnly } from "@/components/action-icon";

export type TreeQuestion = { id: string; code: string; label: string; typeLabel: string; isRequired: boolean; appliesTo: string };
export type TreeSection = {
  id: string;
  title: string;
  description: string;
  evidenceLabel: string;
  evidenceRequired: boolean;
  questions: TreeQuestion[];
};

function Sortable({ id, disabled, label, children }: { id: string; disabled: boolean; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-start gap-2">
      {!disabled && (
        <button type="button" {...attributes} {...listeners} aria-label={`Seret untuk mengurutkan ${label}`} className="cursor-grab px-1 text-muted-foreground">
          ⠿
        </button>
      )}
      <div className="flex-1">{children}</div>
    </li>
  );
}

/** Daftar yang bisa diurutkan; urutan baru langsung disimpan (FR-06.01). */
function SortableList<T extends { id: string }>({
  items,
  locked,
  onReorder,
  labelOf,
  render,
}: {
  items: T[];
  locked: boolean;
  onReorder: (ids: string[]) => Promise<{ error?: string }>;
  labelOf: (item: T) => string;
  render: (item: T) => ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.findIndex((i) => i.id === active.id), order.findIndex((i) => i.id === over.id));
    setOrder(next);
    startTransition(async () => {
      const result = await onReorder(next.map((i) => i.id));
      if (result.error) {
        setOrder(previous);
        setError(result.error);
      } else setError(undefined);
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <ul className="space-y-2">
          {order.map((item) => (
            <Sortable key={item.id} id={item.id} disabled={locked} label={labelOf(item)}>
              {render(item)}
            </Sortable>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function DuplicateButton({ periodId, kind, id, label }: { periodId: string; kind: "section" | "question"; id: string; label: string }) {
  return (
    <form action={duplicateAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-sm underline" aria-label={label}>
        Duplikat
      </button>
    </form>
  );
}

export function SectionFields({ section, published }: { section?: TreeSection; published: boolean }) {
  const p = section?.id ?? "new";
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`title-${p}`}>Judul bagian</Label>
        <Input id={`title-${p}`} name="title" defaultValue={section?.title} readOnly={published && !!section} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`description-${p}`}>Deskripsi bagian</Label>
        <textarea id={`description-${p}`} name="description" defaultValue={section?.description} className="min-h-12 w-full rounded-md border p-2 text-sm" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`evidence-${p}`}>Petunjuk link bukti dukung bagian (format folder dari pusat)</Label>
        <textarea id={`evidence-${p}`} name="evidenceLabel" defaultValue={section?.evidenceLabel} className="min-h-12 w-full rounded-md border p-2 text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="evidenceRequired" defaultChecked={section?.evidenceRequired} disabled={published && !!section} />
        Link bukti dukung bagian ini wajib diisi
      </label>
    </>
  );
}

export function BuilderTree({
  periodId,
  sections,
  published,
}: {
  periodId: string;
  sections: TreeSection[];
  published: boolean;
}) {
  return (
    <SortableList
      // key: urutan/isi baru dari server (setelah simpan/hapus) me-reset state lokal
      key={sections.map((s) => s.id + s.questions.length).join()}
      items={sections}
      locked={published}
      labelOf={(s) => s.title}
      onReorder={(ids) => reorderAction(periodId, "section", ids)}
      render={(section) => (
        <section className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
              {section.evidenceLabel && (
                <p className="text-sm">
                  Bukti dukung{section.evidenceRequired ? " (wajib)" : ""}: {section.evidenceLabel}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <details>
                <summary className="cursor-pointer text-sm underline">Ubah bagian</summary>
                <form action={saveSectionAction} className="mt-2 w-80 space-y-2 rounded-md border p-3">
                  <input type="hidden" name="periodId" value={periodId} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <SectionFields section={section} published={published} />
                  <Button type="submit" size="sm">
                    Simpan bagian
                  </Button>
                </form>
              </details>
              {!published && <DuplicateButton periodId={periodId} kind="section" id={section.id} label={`Duplikat bagian ${section.title}`} />}
              {!published && (
                <ConfirmAction
                  action={deleteSectionAction}
                  fields={{ periodId, sectionId: section.id }}
                  label="Hapus bagian"
                  confirmLabel={`Ya, hapus ${section.title}`}
                  impact={`Bagian ini dan ${section.questions.length} soal di dalamnya dihapus dari kuesioner.`}
                />
              )}
            </div>
          </div>

          {section.questions.length === 0 && <p className="text-sm text-muted-foreground">Belum ada soal.</p>}
          <SortableList
            items={section.questions}
            locked={published}
            labelOf={(q) => q.code}
            onReorder={(ids) => reorderAction(periodId, "question", ids)}
            render={(q) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-sm">
                <div>
                  <code className="text-xs">{q.code}</code> · {q.label}
                  <span className="text-muted-foreground">
                    {" "}
                    — {q.typeLabel}
                    {q.isRequired ? ", wajib" : ""}, berlaku: {q.appliesTo}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/admin/kuesioner/${periodId}/soal/${q.id}`} className="inline-flex items-center gap-1 hover:underline">
                    <IconOnly label={published ? "Lihat" : "Ubah"} text={published ? "Lihat / ubah teks bantuan" : "Ubah"} className="size-3.5" />
                  </Link>
                  {!published && <DuplicateButton periodId={periodId} kind="question" id={q.id} label={`Duplikat ${q.code}`} />}
                  {!published && (
                    <ConfirmAction
                      action={deleteQuestionAction}
                      fields={{ periodId, questionId: q.id }}
                      label="Hapus"
                      confirmLabel={`Ya, hapus ${q.code}`}
                      impact="Soal ini dihapus dari kuesioner."
                    />
                  )}
                </div>
              </div>
            )}
          />
          {!published && (
            <Link href={`/admin/kuesioner/${periodId}/soal/baru?bagian=${section.id}`} className="inline-block text-sm underline">
              + Tambah soal di {section.title}
            </Link>
          )}
        </section>
      )}
    />
  );
}
