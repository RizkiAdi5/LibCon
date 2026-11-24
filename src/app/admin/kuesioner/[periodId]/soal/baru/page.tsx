import { redirect } from "next/navigation";
import { loadQuestionEditor } from "../load";
import { QuestionForm } from "../question-form";

export default async function TambahSoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ bagian?: string }>;
}) {
  const [{ periodId }, { bagian }] = await Promise.all([params, searchParams]);
  const { questionnaire, institutionTypes, published } = await loadQuestionEditor(periodId);
  const back = `/admin/kuesioner/${periodId}`;
  if (published || questionnaire.sections.length === 0) redirect(back);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Tambah soal</h1>
        <QuestionForm
          periodId={periodId}
          sections={questionnaire.sections}
          institutionTypes={institutionTypes}
          takenCodes={questionnaire.questions.map((q) => q.code)}
          published={false}
          initial={{
            sectionId: questionnaire.sections.find((s) => s.id === bagian)?.id ?? questionnaire.sections[0].id,
            label: "",
            code: "",
            helpText: "",
            type: "INTEGER",
            isRequired: false,
            hasEvidenceUrl: false,
            institutionTypeIds: [],
            options: [],
            config: {},
          }}
        />
      </div>
    </div>
  );
}
