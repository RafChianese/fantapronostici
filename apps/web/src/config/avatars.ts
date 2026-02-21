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

export type AvatarPresetId = (typeof AVATAR_PRESET_IDS)[number];

export const AVATARS: Array<{ id: AvatarPresetId; src: string; label: string }> = AVATAR_PRESET_IDS.map((id) => ({
  id,
  src: `/avatars/${id}.png`,
  label: id.replace("avatar_", "Avatar "),
}));
