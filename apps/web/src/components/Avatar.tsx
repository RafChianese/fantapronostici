import React, { useMemo } from "react";
import type { AvatarConfig } from "../lib/api";

const SKIN: Record<string, string> = {
  light: "#F6D2B8",
  tan: "#E5B28C",
  brown: "#C6895E",
  dark: "#8D5A3C",
};
const EYES: Record<string, string> = {
  brown: "#5A3E2B",
  blue: "#2D6CDF",
  green: "#2E8B57",
  gray: "#6B7280",
};
const HAIR: Record<string, string> = {
  black: "#111827",
  brown: "#4B2E1E",
  blonde: "#E7C46B",
  red: "#B45309",
  gray: "#9CA3AF",
};
const OUTFIT: Record<string, string> = {
  black: "#111827",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#16A34A",
  purple: "#7C3AED",
  orange: "#F97316",
  gray: "#6B7280",
};

const DEFAULTS: Required<AvatarConfig> = {
  sex: "male",
  skin: "tan",
  eyes: "brown",
  hairType: "short",
  hairColor: "brown",
  outfitType: "hoodie",
  outfitColor: "blue",
};

function hashToInt(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildDefaultAvatar(userId: string): Required<AvatarConfig> {
  const h = hashToInt(userId);
  const pick = <T,>(arr: T[], idx: number) => arr[idx % arr.length];
  const sexes: Required<AvatarConfig>["sex"][] = ["male", "female"];
  const skins: Required<AvatarConfig>["skin"][] = ["light", "tan", "brown", "dark"];
  const eyes: Required<AvatarConfig>["eyes"][] = ["brown", "blue", "green", "gray"];
  const hairTypes: Required<AvatarConfig>["hairType"][] = ["short", "medium", "long", "curly", "bald"];
  const hairColors: Required<AvatarConfig>["hairColor"][] = ["black", "brown", "blonde", "red", "gray"];
  const outfitTypes: Required<AvatarConfig>["outfitType"][] = ["tshirt", "hoodie", "jersey", "suit"];
  const outfitColors: Required<AvatarConfig>["outfitColor"][] = ["black", "blue", "red", "green", "purple", "orange", "gray"];

  return {
    sex: pick(sexes, h),
    skin: pick(skins, h >> 2),
    eyes: pick(eyes, h >> 4),
    hairType: pick(hairTypes, h >> 6),
    hairColor: pick(hairColors, h >> 8),
    outfitType: pick(outfitTypes, h >> 10),
    outfitColor: pick(outfitColors, h >> 12),
  };
}

export function normalizeAvatar(userId: string, avatarJson?: AvatarConfig | null): Required<AvatarConfig> {
  const base = buildDefaultAvatar(userId);
  return { ...base, ...(avatarJson || {}) };
}

export function UserAvatar({
  userId,
  avatar,
  size = 32,
  className = "",
}: {
  userId: string;
  avatar?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const a = useMemo(() => normalizeAvatar(userId, avatar), [userId, avatar]);
  const skin = SKIN[a.skin] || SKIN[DEFAULTS.skin];
  const eye = EYES[a.eyes] || EYES[DEFAULTS.eyes];
  const hair = HAIR[a.hairColor] || HAIR[DEFAULTS.hairColor];
  const outfit = OUTFIT[a.outfitColor] || OUTFIT[DEFAULTS.outfitColor];

  const hairPath = (() => {
    switch (a.hairType) {
      case "bald":
        return null;
      case "curly":
        return <path d="M18 10c-3-5-11-5-14 0 2-6 12-6 14 0Z" fill={hair} opacity="0.95" />;
      case "long":
        return <path d="M6 11c0-4 3-7 7-7s7 3 7 7c0 2-1 3-1 3s-2-2-6-2-6 2-6 2-1-1-1-3Z" fill={hair} />;
      case "medium":
        return <path d="M6.5 11c.5-4 3.5-6.5 6.5-6.5S19 7 19.5 11c.2 1.7-.4 3-.4 3S17.3 12 13 12s-6.1 2-6.1 2-.6-1.3-.4-3Z" fill={hair} />;
      default:
        return <path d="M7 11c1-4 4-6 6-6s5 2 6 6c.4 1.6-.3 3-.3 3S17 12 13 12s-5.7 2-5.7 2-.7-1.4-.3-3Z" fill={hair} />;
    }
  })();

  const outfitShape = (() => {
    switch (a.outfitType) {
      case "suit":
        return (
          <>
            <path d="M6 28c1-6 5-9 7-9s6 3 7 9" fill={outfit} />
            <path d="M13 19l-2 3 2 6 2-6-2-3Z" fill="#111827" opacity="0.7" />
          </>
        );
      case "jersey":
        return <path d="M6 28c1-6 5-9 7-9s6 3 7 9" fill={outfit} opacity="0.95" />;
      case "tshirt":
        return <path d="M7 28c1-5 4-8 6-8s5 3 6 8" fill={outfit} opacity="0.85" />;
      default:
        return <path d="M6 28c1-6 5-9 7-9s6 3 7 9" fill={outfit} opacity="0.9" />;
    }
  })();

  return (
    <div className={`inline-flex items-center justify-center rounded-full bg-white/70 ring-1 ring-slate-200 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
        <defs>
          <clipPath id="clip">
            <circle cx="13" cy="13" r="12" />
          </clipPath>
        </defs>
        <g clipPath="url(#clip)">
          <rect x="0" y="0" width="26" height="26" fill="#F8FAFC" />
          {outfitShape}
          <circle cx="13" cy="11" r="6.5" fill={skin} />
          {hairPath}
          <circle cx="10.5" cy="11.5" r="0.8" fill={eye} />
          <circle cx="15.5" cy="11.5" r="0.8" fill={eye} />
          <path d="M11 14.5c1.1.8 2.9.8 4 0" stroke="#111827" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" fill="none" />
        </g>
      </svg>
    </div>
  );
}
