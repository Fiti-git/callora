import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      accessToken: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    organizationId: string;
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    organizationId: string;
    accessToken: string;
  }
}
