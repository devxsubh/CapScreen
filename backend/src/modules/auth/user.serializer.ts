import type { UserDocument } from "../../models";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null | undefined;
  organisation: string | null | undefined;
  emailVerified: boolean;
};

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    organisation: user.organisation,
    emailVerified: Boolean(user.confirmed),
  };
}
