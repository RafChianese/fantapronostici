import { z } from "zod";

// Keep in sync with apps/web/src/config/avatars.ts
export const AVATAR_PRESET_IDS = [
  "avatar_01",
  "avatar_02",
  "avatar_03",
  "avatar_04",
  "avatar_05",
  "avatar_06",
  "avatar_07",
  "avatar_08",
  "avatar_09",
  "avatar_10",
] as const;

export const AvatarPresetIdSchema = z.enum(AVATAR_PRESET_IDS);
export type AvatarPresetId = z.infer<typeof AvatarPresetIdSchema>;
