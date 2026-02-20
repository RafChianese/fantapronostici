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

// Eyebrows default to hair color if not set.
const BROWS: Record<string, string> = HAIR;
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
  eyebrowsColor: "brown",
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
    eyebrowsColor: pick(hairColors, h >> 9),
    outfitType: pick(outfitTypes, h >> 10),
    outfitColor: pick(outfitColors, h >> 12),
  };
}

export function normalizeAvatar(userId: string, avatarJson?: AvatarConfig | null): Required<AvatarConfig> {
  const base = buildDefaultAvatar(userId);
  const merged = { ...base, ...(avatarJson || {}) } as any;
  // Backward compatibility: if eyebrowsColor missing, use hairColor
  if (!merged.eyebrowsColor) merged.eyebrowsColor = merged.hairColor;
  return merged as Required<AvatarConfig>;
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
  const brows = (BROWS as any)[(a as any).eyebrowsColor] || hair;
  const outfit = OUTFIT[a.outfitColor] || OUTFIT[DEFAULTS.outfitColor];

  const hairPath = (() => {
    switch (a.hairType) {
      case "bald":
        return null;
      case "curly":
        return (
          <path
            d="M8 14c-1-2 0-6 5-6s6 3 5 6c.6-1.7.2-6.7-5-6.7S7.3 12.3 8 14Z"
            fill={hair}
            opacity="0.98"
          />
        );
      case "long":
        return <path d="M7.5 14c-1-5 2-8 5.5-8s6.5 3 5.5 8c-.3 1.7-1.2 2.8-1.2 2.8s-1.8-2.1-4.3-2.1-4.3 2.1-4.3 2.1S7.8 15.7 7.5 14Z" fill={hair} />;
      case "medium":
        return <path d="M8 14c.2-4 2.4-6.8 5-6.8S18.8 10 18 14c-.2 1.2-.6 2-1 2.6-.7-.6-2.1-1.5-4-1.5s-3.3.9-4 1.5c-.4-.6-.8-1.4-1-2.6Z" fill={hair} />;
      default:
        return <path d="M8 14c.7-3.7 3-6 5-6s4.3 2.3 5 6c.3 1.5-.2 2.7-.7 3.6-.8-.7-2.3-1.6-4.3-1.6s-3.5.9-4.3 1.6c-.5-.9-1-2.1-.7-3.6Z" fill={hair} />;
    }
  })();

  const outfitShape = (() => {
    switch (a.outfitType) {
      case "suit":
        return (
          <>
            <path d="M6.5 28c1.2-6.7 4.9-10.2 6.5-10.2S18.3 21.3 19.5 28" fill={outfit} />
            <path d="M13 18.2l-2.2 3.2 2.2 6.8 2.2-6.8-2.2-3.2Z" fill="#111827" opacity="0.75" />
          </>
        );
      case "jersey":
        return (
          <>
            <path d="M6.7 28c1.1-6.2 5-9.6 6.3-9.6S18 21.8 19.3 28" fill={outfit} opacity="0.98" />
            <path d="M10.2 19.8h5.6" stroke="#F8FAFC" strokeWidth="1" opacity="0.7" strokeLinecap="round" />
          </>
        );
      case "tshirt":
        return <path d="M7.2 28c1.1-5.4 4.2-8.3 5.8-8.3s4.7 2.9 5.8 8.3" fill={outfit} opacity="0.88" />;
      default:
        return <path d="M6.7 28c1.2-6.2 4.9-9.6 6.3-9.6S18 21.8 19.3 28" fill={outfit} opacity="0.92" />;
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

          {/* Ground */}
          <ellipse cx="13" cy="25" rx="7" ry="1.8" fill="#E5E7EB" opacity="0.9" />

          {/* Body */}
          {outfitShape}

          {/* Legs */}
          <path d="M10.2 28v-4.2c0-1.2 1.1-2.1 2.8-2.1s2.8.9 2.8 2.1V28" fill={skin} opacity="0.95" />
          <path d="M9.2 28c.2-1.4 1.2-2.4 2.4-2.4h2.8c1.2 0 2.2 1 2.4 2.4" stroke="#111827" strokeWidth="0.5" opacity="0.15" />

          {/* Head */}
          <circle cx="13" cy="10.5" r="6.1" fill={skin} />
          {hairPath}

          {/* Eyebrows */}
          <path d="M9.7 10.2c.7-.7 1.6-1 2.5-.7" stroke={brows} strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
          <path d="M16.3 10.2c-.7-.7-1.6-1-2.5-.7" stroke={brows} strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />

          {/* Eyes */}
          <circle cx="10.6" cy="11.5" r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx="15.4" cy="11.5" r="1.1" fill="#FFFFFF" opacity="0.95" />
          <circle cx="10.6" cy="11.6" r="0.6" fill={eye} />
          <circle cx="15.4" cy="11.6" r="0.6" fill={eye} />

          {/* Mouth */}
          <path d="M11.1 14.6c1.2.9 2.6.9 3.8 0" stroke="#111827" strokeWidth="0.8" strokeLinecap="round" opacity="0.55" fill="none" />
        </g>
      </svg>
    </div>
  );
}
