import { prisma } from "@/lib/db/client";
import { peekAuthToken } from "@/lib/auth/token";
import { getPasswordPolicy } from "@/lib/settings";
import { ActivationForm } from "./activation-form";
import { ResendActivationForm } from "./resend-activation-form";

export default async function AktivasiPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await peekAuthToken(prisma, { raw: token, type: "ACTIVATION" });

  if (check.status !== "ok") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">Link sudah kedaluwarsa</h1>
          <p className="text-sm text-muted-foreground">
            Link aktivasi ini sudah tidak berlaku. Minta link baru di bawah.
          </p>
          <ResendActivationForm token={token} />
        </div>
      </main>
    );
  }

  const [user, policy] = await Promise.all([
    prisma.user.findUnique({ where: { id: check.userId }, include: { institution: true } }),
    getPasswordPolicy(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">
          Aktivasi akun {user?.institution?.libraryName ?? user?.fullName}
        </h1>
        <p className="text-sm text-muted-foreground">Username: {user?.username}</p>
        <ActivationForm token={token} policy={policy} />
      </div>
    </main>
  );
}
