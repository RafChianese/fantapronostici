import React, { useMemo } from "react";
import { AVATAR_PRESET_IDS, type AvatarPresetId } from "../config/avatars";

export function normalizeAvatarId(avatarId?: string | null): AvatarPresetId {
  const id = String(avatarId || "").trim();
  return (AVATAR_PRESET_IDS as readonly string[]).includes(id) ? (id as AvatarPresetId) : "avatar_01";
}

export function getAvatarSrc(avatarId?: string | null) {
  const id = normalizeAvatarId(avatarId);
  return `/avatars/${id}.png`;
}

export type UserAvatarProps = {
  userId?: string;
  avatarId?: string | null;
  size?: number;
  className?: string;
  mode?: "badge" | "full";
};

/**
 * Preset avatar renderer.
 * - Uses static PNGs in apps/web/public/avatars
 * - Avoids SVG compositing bugs (“mostri”)
 */
export function UserAvatar({ avatarId, size = 40, className = "", mode = "badge" }: UserAvatarProps) {
  const src = useMemo(() => getAvatarSrc(avatarId), [avatarId]);
  const radius = mode === "badge" ? 999 : 18;
  // Badge is typically used in tight UI spots (often masked/cropped), so "cover" is OK.
  // Full-body avatar must not be cropped.
  const objectFit = mode === "full" ? "contain" : "cover";

  return (
    <img
      src={src}
      alt="avatar"
      width={size}
      height={size}
      loading="lazy"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit,
        display: "block",
      }}
    />
  );
}
