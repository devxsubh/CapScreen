"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";
import { CheckCircle2, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile } from "@/app/lib/capScreenApi";
import {
  PASSWORD_REQUIREMENTS,
  validatePasswordClient,
} from "@/lib/passwordPolicy";

export default function SignupPage() {
    const router = useRouter();
    const { isAuthenticated, authLoading, refreshUser } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [name, setName] = useState("");
    const [organisation, setOrganisation] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [verificationRequired, setVerificationRequired] = useState(false);
    const [signupEmail, setSignupEmail] = useState("");

    useEffect(() => {
        if (!authLoading && isAuthenticated && !success) {
            router.replace("/assistant");
        }
    }, [authLoading, isAuthenticated, router, success]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        const passwordError = validatePasswordClient(password);
        if (passwordError) {
            setError(passwordError);
            setLoading(false);
            return;
        }

        try {
            const trimmedName = name.trim();
            const trimmedOrg = organisation.trim();
            const result = await signUp({
                email,
                password,
                ...(trimmedName && { displayName: trimmedName }),
                ...(trimmedOrg && { organisation: trimmedOrg }),
            });

            if (result.emailVerificationRequired) {
                setSignupEmail(email);
                setVerificationRequired(true);
                setSuccess(true);
                return;
            }

            await refreshUser();

            if (trimmedName || trimmedOrg) {
                try {
                    await updateUserProfile({
                        ...(trimmedName && { displayName: trimmedName }),
                        ...(trimmedOrg && { organisation: trimmedOrg }),
                    });
                } catch (profileError) {
                    console.error(
                        "[signup] failed to persist profile fields",
                        profileError,
                    );
                }
            }
            setSuccess(true);
            setTimeout(() => {
                router.push("/assistant");
            }, 2000);
        } catch (error: unknown) {
            setError(
                error instanceof Error
                    ? error.message
                    : "An error occurred during signup",
            );
        } finally {
            setLoading(false);
        }
    };

    // Success View
    if (success) {
        return (
            <div className="min-h-dvh bg-neutral-50 flex flex-col items-center px-6 pt-24 md:pt-28 pb-10">
                <SiteLogo size="md" className="md:text-4xl" asLink />
                <div className="w-full max-w-md mt-10 md:mt-12">
                    <div className="bg-white border border-neutral-200 rounded-2xl p-8 md:p-10 shadow-sm">
                        {verificationRequired ? (
                            <>
                                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50">
                                    <Mail
                                        className="h-6 w-6 text-neutral-700"
                                        strokeWidth={1.5}
                                    />
                                </div>
                                <h1 className="font-serif text-3xl text-neutral-900 tracking-tight">
                                    Check your email
                                </h1>
                                <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                                    We sent a verification link to finish setting
                                    up your account. Open it from your inbox, then
                                    sign in here.
                                </p>
                                <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                                        Sent to
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-neutral-900 break-all">
                                        {signupEmail}
                                    </p>
                                </div>
                                <ul className="mt-6 space-y-2 border-t border-neutral-100 pt-6 text-sm text-neutral-600">
                                    <li>
                                        Didn&apos;t get it? Check spam or
                                        promotions — delivery can take a minute.
                                    </li>
                                    <li>
                                        After verifying, use the same email and
                                        password on the sign-in page.
                                    </li>
                                </ul>
                                <Button
                                    asChild
                                    className="mt-8 w-full bg-black hover:bg-neutral-800 text-white"
                                >
                                    <Link href="/login">Go to sign in</Link>
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50">
                                    <CheckCircle2
                                        className="h-6 w-6 text-neutral-700"
                                        strokeWidth={1.5}
                                    />
                                </div>
                                <h1 className="font-serif text-3xl text-neutral-900 tracking-tight">
                                    Account created
                                </h1>
                                <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                                    Redirecting you to the assistant…
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Default Signup Form View
    return (
        <div className="min-h-dvh bg-white flex items-start justify-center px-6 pt-32 md:pt-40 pb-10 relative">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="md" className="md:text-4xl" asLink />
            </div>
            <div className="w-full max-w-md">
                <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-left text-2xl font-serif">
                            Create Account
                        </h2>
                        <div className="bg-gray-100 p-1 rounded-md flex text-xs font-medium">
                            <Link
                                href="/login"
                                className="px-3 py-1 text-gray-500 hover:text-gray-900"
                            >
                                Log in
                            </Link>
                            <span className="px-3 py-1 bg-white rounded-sm shadow-sm text-gray-900">
                                Sign up
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <label
                                htmlFor="name"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Name{" "}
                                <span className="text-gray-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <Input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="organisation"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Organisation{" "}
                                <span className="text-gray-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <Input
                                id="organisation"
                                type="text"
                                value={organisation}
                                onChange={(e) =>
                                    setOrganisation(e.target.value)
                                }
                                placeholder="Your organisation"
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Email
                            </label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Password
                            </label>
                            <PasswordInput
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Create a strong password"
                                required
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="confirmPassword"
                                className="block text-sm font-medium text-gray-700 mb-2"
                            >
                                Confirm Password
                            </label>
                            <PasswordInput
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder="Confirm your password"
                                required
                                className="w-full"
                            />
                        </div>

                        {error && (
                            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                                {error}
                            </div>
                        )}

                        <p className="text-xs text-gray-500">{PASSWORD_REQUIREMENTS}</p>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-black hover:bg-gray-900 text-white"
                        >
                            {loading ? "Creating account..." : "Sign up"}
                        </Button>
                    </form>

                    {/* Terms and Privacy */}
                    <div className="mt-4 text-center text-xs text-gray-500">
                        By signing up, you agree to our{" "}
                        <Link
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
                        >
                            Terms of Use
                        </Link>{" "}
                        and{" "}
                        <Link
                            href="#"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
                        >
                            Privacy Policy
                        </Link>
                    </div>
                </div>
                <p className="text-center text-xs text-gray-500 leading-relaxed px-2">
                    Authentication is required for access to cap-table screening
                    data. Create an account to screen startups under your
                    organisation.
                </p>
            </div>
        </div>
    );
}
