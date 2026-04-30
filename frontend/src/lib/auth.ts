import { NextAuthOptions, Provider } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";

const API_URL = process.env.API_URL || "http://localhost:4000/api";

// Optional SSO providers — only included when their client id/secret are set
// in the environment. SSO is opt-in: missing env vars must NOT crash boot.
const ssoProviders: Provider[] = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  ssoProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  ssoProviders.push(
    AzureADProvider({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID || "common",
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...ssoProviders,
    CredentialsProvider({
      name: "Sign in",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Step-2 fields — present when completing the 2FA flow.
        challengeToken: { label: "Challenge", type: "text" },
        twoFAToken: { label: "TOTP", type: "text" },
        recoveryCode: { label: "Recovery code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        try {
          // Step 2 — finish a 2FA challenge.
          if (credentials.challengeToken) {
            const res = await fetch(`${API_URL}/auth/2fa/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                challengeToken: credentials.challengeToken,
                token: credentials.twoFAToken || undefined,
                recoveryCode: credentials.recoveryCode || undefined,
              }),
            });
            const data = await res.json();
            if (res.ok && data.token) {
              return {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                organizationId: data.user.organizationId,
                role: data.user.role,
                accessToken: data.token,
              };
            }
            return null;
          }

          // Step 1 — email + password.
          if (!credentials.email || !credentials.password) return null;
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();
          if (res.ok && data.token) {
            return {
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              organizationId: data.user.organizationId,
              role: data.user.role,
              accessToken: data.token,
            };
          }
          // 2FA needed — bubble the challenge back through an Error so the
          // client can inspect `Error.message` and route to /login/2fa.
          if (res.status === 200 && data.requires2FA && data.challengeToken) {
            throw new Error(`REQUIRES_2FA:${data.challengeToken}`);
          }
          if (res.status === 403 && data.error === "EMAIL_NOT_VERIFIED") {
            throw new Error("EMAIL_NOT_VERIFIED");
          }
        } catch (error: any) {
          if (
            typeof error?.message === "string" &&
            (error.message.startsWith("REQUIRES_2FA") ||
              error.message === "EMAIL_NOT_VERIFIED")
          ) {
            // Re-throw so NextAuth surfaces the message in the URL/error param.
            throw error;
          }
          console.error("Login error:", error);
        }
        return null;
      },
    }),
  ],
  callbacks: {
    /**
     * When NextAuth completes a Google/Microsoft OAuth flow it has the raw
     * provider id_token in `account.id_token`. We swap it for a Callora
     * tenant access JWT via the backend `/api/auth/sso/exchange` route, then
     * stash the result on the user object so the `jwt` callback below can
     * persist it on the session token.
     */
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      const provider =
        account.provider === "google"
          ? "GOOGLE"
          : account.provider === "azure-ad"
          ? "MICROSOFT"
          : null;
      if (!provider) return true;
      const idToken = (account as any).id_token as string | undefined;
      if (!idToken) {
        console.error("SSO signIn: missing id_token on account");
        return false;
      }
      try {
        const res = await fetch(`${API_URL}/auth/sso/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, idToken }),
        });
        const data = await res.json();
        if (!res.ok || !data?.token) {
          console.error("SSO exchange failed:", res.status, data);
          return false;
        }
        // Mutate the user object so jwt callback below picks it up.
        (user as any).id = data.user.id;
        (user as any).accessToken = data.token;
        (user as any).organizationId = data.user.organizationId;
        (user as any).role = data.user.role;
        (user as any).email = data.user.email;
        return true;
      } catch (err) {
        console.error("SSO exchange error:", err);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.organizationId = (user as any).organizationId;
        token.role = (user as any).role;
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
          role: token.role as string,
          accessToken: token.accessToken as string,
        },
      };
    },
  },
};
