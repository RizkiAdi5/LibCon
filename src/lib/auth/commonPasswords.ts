/**
 * Daftar password umum yang ditolak (FR-03.06). Daftar kecil yang dikurasi
 * dari password paling sering dipakai di berbagai kebocoran data publik —
 * bukan daftar lengkap. Upgrade ke layanan cek kebocoran (HaveIBeenPwned dkk.)
 * bisa ditambahkan nanti kalau diperlukan.
 */
const COMMON_PASSWORDS = new Set(
  [
    "123456",
    "123456789",
    "12345678",
    "1234567",
    "password",
    "qwerty",
    "qwerty123",
    "111111",
    "123123",
    "abc123",
    "password1",
    "iloveyou",
    "admin",
    "admin123",
    "welcome",
    "welcome1",
    "monkey",
    "dragon",
    "letmein",
    "login",
    "princess",
    "sunshine",
    "master",
    "football",
    "baseball",
    "shadow",
    "michael",
    "jennifer",
    "superman",
    "trustno1",
    "1q2w3e4r",
    "qwertyuiop",
    "1234567890",
    "000000",
    "121212",
    "654321",
    "222222",
    "zaq12wsx",
    "asdfghjkl",
    "passw0rd",
    "password123",
    "indonesia",
    "jakarta",
    "pontianak",
    "perpustakaan",
    "perpustakaan123",
    "sekolah123",
    "p@ssw0rd",
    "p@ssword",
  ].map((p) => p.toLowerCase()),
);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
