import { isClerkAPIResponseError, useSSO } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import * as Sentry from "@sentry/react-native";
import { useState } from "react";
import { Platform } from "react-native";

export type SocialProvider = "google" | "apple";

type FlowResult = {
  createdSessionId: string | null;
  setActive?: (params: { session: string }) => Promise<void>;
};

/**
 * Google uses Clerk's browser SSO flow. Apple uses the native sheet on iOS and the
 * browser SSO flow elsewhere (native Sign in with Apple only exists on iOS).
 * Cancelling either flow resolves with `createdSessionId: null`, which is not an error.
 * On success the session becomes active and the `(auth)` layout redirects into the app.
 */
export function useSocialSignIn() {
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: SocialProvider) => {
    if (pending) return;
    setPending(provider);
    setError(null);
    try {
      const { createdSessionId, setActive }: FlowResult =
        provider === "google"
          ? await startSSOFlow({ strategy: "oauth_google" })
          : Platform.OS === "ios"
            ? await startAppleAuthenticationFlow()
            : await startSSOFlow({ strategy: "oauth_apple" });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: "auth", provider } });
      setError(
        isClerkAPIResponseError(err)
          ? (err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Sign in failed.")
          : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(null);
    }
  };

  return { signIn, pending, error };
}
