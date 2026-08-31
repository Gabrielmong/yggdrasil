"use client";

import { useRef } from "react";
import Script from "next/script";
import { signIn } from "next-auth/react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; width?: number }
          ) => void;
        };
      };
    };
  }
}

/** Renders Google's own branded "Sign in with Google" button and signs the
 * resulting ID token in via the `google-credential` Auth.js provider. */
export default function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  function handleScriptLoad() {
    if (!window.google || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      callback: async (response) => {
        const result = await signIn("google-credential", {
          credential: response.credential,
          redirect: false,
          callbackUrl: "/bookshelf",
        });
        if (result?.error) {
          onError("Could not sign in with Google. Please try again.");
        } else if (result?.url) {
          window.location.href = result.url;
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      width: 328,
    });
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={handleScriptLoad} />
      <div ref={buttonRef} />
    </>
  );
}
