"use client";

import { useState, useTransition, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

interface BetterAuthLoginProps {
  organizationName?: string;
  showOrgWarning?: boolean;
  forceSignUp?: boolean;
  redirectPath?: string;
  className?: string;
}

export default function BetterAuthLogin({
  organizationName,
  showOrgWarning,
  forceSignUp = false,
  redirectPath = "/dashboard",
  className = "max-w-[400px] w-full mx-auto px-10"
}: BetterAuthLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState("");
  const [isSignUp, setIsSignUp] = useState(forceSignUp);
  const [isPending, startTransition] = useTransition();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // After auth — go to ?next= if present, otherwise redirectPath
  const getRedirectTarget = () => {
    if (typeof window === "undefined") return redirectPath;
    const next = new URLSearchParams(window.location.search).get("next");
    return next ? decodeURIComponent(next) : redirectPath;
  };

  const handleAuthSuccess = () => {
    setResult("Success! Redirecting...");
    window.location.href = getRedirectTarget();
  };

  const handleSignIn = async () => {
    try {
      setResult("");
      const { error } = await authClient.signIn.email(
        { email, password },
        { onSuccess: handleAuthSuccess }
      );
      if (error) setResult(`Login failed: ${error.message}`);
    } catch (err) {
      setResult(`Login failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleSignUp = async () => {
    try {
      setResult("");
      const { error } = await authClient.signUp.email(
        { email, password, name },
        { onSuccess: handleAuthSuccess }
      );
      if (error) setResult(`Sign up failed: ${error.message}`);
    } catch (err) {
      setResult(`Sign up failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      void (isSignUp ? handleSignUp() : handleSignIn());
    });
  };

  const getTitle = () => {
    if (!isHydrated) return isSignUp ? "Sign Up" : "Sign In";
    return organizationName
      ? `${isSignUp ? "Join" : "Sign in to"} ${organizationName}`
      : (isSignUp ? "Sign Up" : "Sign In");
  };

  const getSubtitle = () => {
    if (showOrgWarning && organizationName) {
      return `Create your account to set up the "${organizationName}" organization.`;
    }
    return isSignUp
      ? "Create a new account below."
      : "Enter your credentials below to sign in.";
  };

  return (
    <div className={className}>
      {showOrgWarning && organizationName && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Organization Not Found</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>The organization "{organizationName}" doesn't exist yet. Sign up to create it!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-center text-2xl font-bold mb-2">{getTitle()}</h1>
      <p className="py-6 text-gray-600 text-center">{getSubtitle()}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="name" type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              suppressHydrationWarning
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="email" type="email" value={email} required
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            suppressHydrationWarning
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            id="password" type="password" value={password} required
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            suppressHydrationWarning
          />
        </div>

        <button
          type="submit" disabled={isPending}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          suppressHydrationWarning
        >
          {isPending ? "..." : (isSignUp ? "Create Account" : "Sign In")}
        </button>
      </form>

      {!forceSignUp && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setResult(""); }}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </div>
      )}

      {result && (
        <div className={`mt-4 p-3 rounded text-sm ${
          result.includes("Success")
            ? "bg-green-100 text-green-700 border border-green-200"
            : result.includes("failed") || result.includes("Error")
            ? "bg-red-100 text-red-700 border border-red-200"
            : "bg-blue-100 text-blue-700 border border-blue-200"
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}