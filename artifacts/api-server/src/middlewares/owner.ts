import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

export async function ownerAccess(req: Request) {
  const { userId } = getAuth(req);
  if (!userId) return { signedIn: false, owner: false };
  const configuredEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return { signedIn: true, owner: false };
  const user = await clerkClient.users.getUser(userId);
  // Never grant access to the first registrant, an unverified email, or a client-supplied role.
  const owner = user.emailAddresses.some(email =>
    email.emailAddress.toLowerCase() === configuredEmail && email.verification?.status === "verified",
  );
  return { signedIn: true, owner };
}

export const requireOwner: RequestHandler = async (req, res, next) => {
  try {
    const access = await ownerAccess(req);
    if (!access.signedIn) {
      res.status(401).json({ error: "Sign in to the owner account." });
      return;
    }
    if (!access.owner) {
      res.status(403).json({ error: "Only the configured, verified owner account can access activity records." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch (err) {
    req.log.error({ err }, "Owner authorization could not be verified");
    res.status(503).json({ error: "Unable to verify owner access. Please try again." });
  }
};
