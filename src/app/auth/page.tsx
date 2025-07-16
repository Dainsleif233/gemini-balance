"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "./actions";

type FormState = {
  error?: string;
  success?: boolean;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export default function AuthPage() {
  const [state, formAction] = useActionState<FormState, FormData>(login, {});
  const [token, setToken] = useState("");
  const [hasAuthCookie, setHasAuthCookie] = useState(false);

  useEffect(() => {
    // On component mount, check if the auth cookie exists.
    if (document.cookie.includes("auth_token=")) {
      setHasAuthCookie(true);
    }

    // If the login action was successful, redirect.
    if (state?.success) {
      window.location.href = "/admin";
    }
  }, [state]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900">
          Admin Access
        </h1>

        {hasAuthCookie ? (
          <div className="text-center">
            <p className="text-gray-700">
              浏览器中存在登录凭证，但无法访问管理后台。
            </p>
            <p className="text-gray-500 text-sm mt-2">
              这通常表明存在服务端配置或环境问题。
            </p>
            <Link
              href="/admin"
              className="mt-4 inline-block w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              重试访问后台
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-6">
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-gray-700"
              >
                Authentication Token
              </label>
              <input
                id="token"
                name="token"
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            {state?.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            <div>
              <SubmitButton disabled={!token} />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
