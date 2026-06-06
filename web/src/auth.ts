import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_EMAILS = new Set([
  "asaifuddin18@gmail.com",
]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/sign-in",
    error:  "/sign-in",   // redirect errors back to sign-in
  },
  callbacks: {
    signIn({ user }) {
      // Reject anyone not on the allowlist
      return ALLOWED_EMAILS.has(user.email ?? "") || "/sign-in?error=AccessDenied";
    },
  },
});
