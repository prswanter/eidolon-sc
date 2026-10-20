// What the note in place of a photo not sent says (GLOSSARY.md「照片」, DESIGN.md「Chat bubbles ·
// 照片」): why, as the backend names it (`store.PhotoFailure`), in a few words; where the user's
// own image key failed, a link to set their own keys as well. And what the capsule says after her
// reply where the user asked for a photo with this hour's used up.

import { copy } from "@/i18n";

const reasons = copy.conversation.photo.reasons;

/** Why a photo was not sent: the backend's `store.PhotoFailure`. */
export type PhotoFailure = keyof typeof reasons;

function isPhotoFailure(reason: string): reason is PhotoFailure {
  return Object.hasOwn(reasons, reason);
}

/**
 * The note's line on why the photo was not sent, and whether it links to the own keys' settings; a
 * reason it does not know, or none, is told as the image service failing.
 */
export function photoFailureNote(reason: string | null): { reason: string; toOwnKeys: boolean } {
  const failure: PhotoFailure = reason !== null && isPhotoFailure(reason) ? reason : "service_error";
  return { reason: reasons[failure], toOwnKeys: failure === "own_key_failed" };
}

/** 照片用完的胶囊上的话：几点以后可以再要，按制作人的时区写成 HH:MM（一小时以内，不写哪天）。 */
export function photosUsedUpText(retryAt: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(retryAt));
  return copy.conversation.photo.usedUp(time);
}
