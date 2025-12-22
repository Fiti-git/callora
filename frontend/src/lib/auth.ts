import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const API_URL = process.env.API_URL || "http://localhost:4000/api";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Sign in",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            body: JSON.stringify(credentials),
            headers: { "Content-Type": "application/json" },
          });

          const data = await res.json();
          if (res.ok && data.token) {
            return {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              organizationId: data.user.organizationId,
              accessToken: data.token,
            };
          }
        } catch (error) {
          console.error("Login error:", error);
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.organizationId = (user as any).organizationId;
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          organizationId: token.organizationId as string,
          accessToken: token.accessToken as string,
        },
      };
    },
  },
};
