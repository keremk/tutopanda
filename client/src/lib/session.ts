"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export async function getSession() {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: new Headers(headerStore),
  });

  if (!session) {
    throw new Error("Not authenticated");
  }

  return session;
}
