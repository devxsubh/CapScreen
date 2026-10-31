import type { CurrentUser } from "../../http/currentUser";
import { badRequest, notFound } from "../../http/httpError";
import { compareStartupsWithSharedOwners } from "./portfolioCompare.service";
import {
  seedEntityScreeningReview,
  syncEntityReviewStatusesToTabular,
  syncPortfolioMonitoringReview,
} from "./portfolioGrid.service";
import { getLatestDigest, runPortfolioRescreen } from "./rescreen.service";
import type { ScreeningResult } from "../../types/screening";
import * as startupsRepository from "../startups/startups.repository";
import * as tabularReviewsRepository from "../tabularReviews/tabularReviews.repository";

/** Portfolio monitoring: one grid across all startups, background re-screens and their digest. */

export async function syncGrid(user: CurrentUser) {
  return syncPortfolioMonitoringReview(user);
}

/** The id of the user's portfolio grid, building it on first use. */
export async function portfolioReviewId(user: CurrentUser): Promise<string> {
  let review = await tabularReviewsRepository.findPortfolioReview(user.userId);
  if (!review) {
    await syncPortfolioMonitoringReview(user);
    review = await tabularReviewsRepository.findPortfolioReview(user.userId);
  }
  if (!review) throw notFound("Portfolio review not found");
  return String(review._id);
}

export async function rescreen(user: CurrentUser) {
  return runPortfolioRescreen({ ownerId: user.userId, userEmail: user.userEmail });
}

export async function latestDigest() {
  const digest = (await getLatestDigest()) as Record<string, unknown> | null;
  if (!digest) return null;
  return {
    id: String(digest._id),
    generatedAt: digest.generatedAt,
    rescreenedCount: digest.rescreenedCount,
    newFlagCount: digest.newFlagCount,
    newReviewCount: digest.newReviewCount,
    changes: digest.changes,
    summaryText: digest.summaryText,
  };
}

/** Opens a grid of one startup's screened entities, with any review decisions already made. */
export async function createEntityReviewGrid(startupId: string, user: CurrentUser): Promise<string> {
  const startup = await startupsRepository.findOwned(startupId, user.userId);
  if (!startup) throw notFound("Startup not found");
  if (!startup.lastScreeningResult) {
    throw badRequest("No screening result — run a screen on this startup first");
  }
  const { reviewId } = await seedEntityScreeningReview({
    userId: user.userId,
    userEmail: user.userEmail,
    startupId,
    startupName: startup.name as string,
    screeningResult: startup.lastScreeningResult as ScreeningResult,
  });
  await syncEntityReviewStatusesToTabular(startupId, reviewId);
  return reviewId;
}

export async function compare(startupIds: string[], userId: string) {
  if (startupIds.length < 2) throw badRequest("Provide at least two startup ids via ids=");
  return compareStartupsWithSharedOwners(startupIds, userId);
}
