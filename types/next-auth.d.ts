import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}

// `next-auth/jwt`'s JWT type is a re-export of `@auth/core/jwt`'s — the
// module @auth/core's own `AuthConfig` callbacks type actually imports
// from — augmented redundantly here since re-export-based augmentation
// has proven unreliable across environments in this project.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
