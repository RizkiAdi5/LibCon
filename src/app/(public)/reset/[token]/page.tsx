import { prisma } from "@/lib/db/client";
import { peekAuthToken } from "@/lib/auth/token";
import { getPasswordPolicy } from "@/lib/settings";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await peekAuthToken(prisma, { raw: token, type: "PASSWORD_RESET" });

  if (check.status !== "ok") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">Link sudah kedaluwarsa</h1>
          <p className="text-sm text-muted-foreground">
            Link reset password ini sudah tidak berlaku. Minta link baru dari halaman{" "}
            <a href="/lupa-password" className="underline">
              Lupa password
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  const policy = await getPasswordPolicy();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Buat password baru</h1>
        <ResetPasswordForm token={token} policy={policy} />
      </div>
    </main>
  );
}
