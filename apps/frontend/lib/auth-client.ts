import { createAuthClient } from "better-auth/react";

// Talks to the Better Auth server mounted in the backend (:3000).
// Bearer flow: capture the token BA returns on sign-in/up, send it on every call.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () =>
        typeof window !== "undefined"
          ? (localStorage.getItem("bearer_token") ?? "")
          : "",
    },
    onSuccess: (ctx) => {
      const t = ctx.response.headers.get("set-auth-token");
      if (t) localStorage.setItem("bearer_token", t);
    },
  },
});
