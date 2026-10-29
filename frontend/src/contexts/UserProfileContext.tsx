"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { desktop } from "@/lib/desktop";

interface UserProfile {
    displayName: string | null;
    organisation: string | null;
}

const LOCAL_PROFILE: UserProfile = { displayName: "You", organisation: "This computer" };

const UserProfileContext = createContext<{ profile: UserProfile } | undefined>(undefined);

/** Name and organisation of the signed-in account, from the desktop shell. */
export function UserProfileProvider({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<UserProfile>(LOCAL_PROFILE);

    useEffect(() => {
        const account = desktop()?.user;
        if (!account) return;
        setProfile({
            displayName: account.displayName ?? account.email.split("@")[0],
            organisation: account.organisation ?? LOCAL_PROFILE.organisation,
        });
    }, []);

    return <UserProfileContext.Provider value={{ profile }}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
    const context = useContext(UserProfileContext);
    if (context === undefined) {
        throw new Error("useUserProfile must be used within a UserProfileProvider");
    }
    return context;
}
