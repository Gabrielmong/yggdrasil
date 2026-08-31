import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/passwords";
import { verifyGoogleIdToken } from "@/lib/googleIdToken";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "google-credential",
      name: "Google",
      credentials: {
        credential: { label: "Google ID token", type: "text" },
      },
      async authorize(creds) {
        const idToken = creds?.credential as string | undefined;
        if (!idToken) return null;

        const identity = await verifyGoogleIdToken(idToken);
        if (!identity) return null;

        // Google has cryptographically verified this email belongs to the
        // caller, so it's safe to link to (or create) the account by email
        // alone. `update: {}` avoids clobbering a name/image the user has
        // since edited themselves.
        const user = await prisma.user.upsert({
          where: { email: identity.email },
          create: { email: identity.email, name: identity.name, image: identity.picture },
          update: {},
        });

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const normalizedEmail = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
