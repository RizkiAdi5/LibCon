import { hash, verify } from "@node-rs/argon2";

/** argon2id, parameter default @node-rs/argon2 (OWASP-recommended). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password);
}
