import React, { useId, useMemo } from "react";
import type { AvatarConfig } from "../lib/api";

/**
 * Avatar v2 (full-body, layered SVG).
 * - Backward compatible: accepts partial config and legacy objects.
 * - Deterministic defaults for users without avatarJson.
 * - Two render modes:
 *   - "badge": optimized for small sizes (head + torso)
 *   - "full": full-body (head + torso + legs)
 */

const SKIN: Record<NonNullable<Required<AvatarConfig>["skin"]>, string> = {
  light: "#F7D7C4",
  tan: "#E7B894",
  brown: "#C98B62",
  dark: "#8A5A3D",
};

const EYES: Record<NonNullable<Required<AvatarConfig>["eyes"]>, string> = {
  brown: "#5B3C2B",
  blue: "#2D6CDF",
  green: "#2E8B57",
  gray: "#6B7280",
};

const HAIR: Record<NonNullable<Required<AvatarConfig>["hairColor"]>, string> = {
  black: "#111827",
  brown: "#4B2E1E",
  blonde: "#E7C46B",
  red: "#B45309",
  gray: "#9CA3AF",
};

const OUTFIT: Record<NonNullable<Required<AvatarConfig>["outfitColor"]>, string> = {
  black: "#111827",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#16A34A",
  purple: "#7C3AED",
  orange: "#F97316",
  gray: "#6B7280",
  teal: "#14B8A6",
  pink: "#EC4899",
};

const ACCENT: Record<NonNullable<Required<AvatarConfig>["outfitAccentColor"]>, string> = {
  white: "#F8FAFC",
  black: "#0B1220",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#16A34A",
  purple: "#7C3AED",
  orange: "#F97316",
  gray: "#6B7280",
  teal: "#14B8A6",
  pink: "#EC4899",
  yellow: "#FACC15",
};

const OUTLINE = "#1F2937";

type RequiredV2 = Required<AvatarConfig> & {
  bodyType: NonNullable<AvatarConfig["bodyType"]>;
  eyebrowsType: NonNullable<AvatarConfig["eyebrowsType"]>;
  eyebrowsColor: NonNullable<AvatarConfig["eyebrowsColor"]>;
  accessoryHat: NonNullable<AvatarConfig["accessoryHat"]>;
  accessoryGlasses: NonNullable<AvatarConfig["accessoryGlasses"]>;
  outfitAccentColor: NonNullable<AvatarConfig["outfitAccentColor"]>;
  jerseyNumber: number;
  jerseyName: string;
  jerseyStyle: NonNullable<AvatarConfig["jerseyStyle"]>;
  version: 2;
};

const DEFAULTS: RequiredV2 = {
  version: 2,
  sex: "male",
  bodyType: "average",
  skin: "tan",
  eyes: "brown",
  hairType: "short",
  hairColor: "brown",
  eyebrowsType: "straight",
  eyebrowsColor: "brown",
  outfitType: "hoodie",
  outfitColor: "blue",
  outfitAccentColor: "white",
  jerseyNumber: 10,
  jerseyName: "FP",
  jerseyStyle: "solid",
  accessoryHat: "none",
  accessoryGlasses: "none",
};

function hashToInt(input: string) {
  // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildDefaultAvatar(userId: string): RequiredV2 {
  const h = hashToInt(userId);
  const pick = <T,>(arr: T[], idx: number) => arr[idx % arr.length];

  const sexes: RequiredV2["sex"][] = ["male", "female"];
  const bodies: RequiredV2["bodyType"][] = ["slim", "average", "athletic"];
  const skins: RequiredV2["skin"][] = ["light", "tan", "brown", "dark"];
  const eyes: RequiredV2["eyes"][] = ["brown", "blue", "green", "gray"];
  const hairTypes: RequiredV2["hairType"][] = ["short", "medium", "long", "curly", "bald"];
  const hairColors: RequiredV2["hairColor"][] = ["black", "brown", "blonde", "red", "gray"];
  const browTypes: RequiredV2["eyebrowsType"][] = ["straight", "arched", "thick"];
  const outfits: RequiredV2["outfitType"][] = ["tshirt", "hoodie", "jersey", "tracksuit", "dress", "suit"];
  const outfitColors: RequiredV2["outfitColor"][] = ["black", "blue", "red", "green", "purple", "orange", "gray", "teal", "pink"];
  const outfitAccentColors: RequiredV2["outfitAccentColor"][] = ["white", "black", "yellow", "blue", "red", "green", "gray", "teal", "pink", "purple", "orange"];
  const hats: RequiredV2["accessoryHat"][] = ["none", "cap", "beanie"];
  const glasses: RequiredV2["accessoryGlasses"][] = ["none", "round", "square"];
  const jerseyStyles: RequiredV2["jerseyStyle"][] = ["solid", "stripes_v", "stripes_h", "sleeves"];

  const number = (h % 99) + 1;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const name = `${letters[(h >> 5) % letters.length]}${letters[(h >> 11) % letters.length]}`;

  return {
    version: 2,
    sex: pick(sexes, h),
    bodyType: pick(bodies, h >> 2),
    skin: pick(skins, h >> 4),
    eyes: pick(eyes, h >> 6),
    hairType: pick(hairTypes, h >> 8),
    hairColor: pick(hairColors, h >> 10),
    eyebrowsType: pick(browTypes, h >> 12),
    eyebrowsColor: pick(hairColors, h >> 14),
    outfitType: pick(outfits, h >> 16),
    outfitColor: pick(outfitColors, h >> 18),
    outfitAccentColor: pick(outfitAccentColors, h >> 19),
    jerseyNumber: number,
    jerseyName: name,
    jerseyStyle: pick(jerseyStyles, h >> 21),
    accessoryHat: pick(hats, h >> 20),
    accessoryGlasses: pick(glasses, h >> 22),
  };
}

export function normalizeAvatar(userId: string, avatarJson?: AvatarConfig | null): RequiredV2 {
  const base = buildDefaultAvatar(userId);
  const merged: any = { ...base, ...(avatarJson || {}) };

  // Backward compat: old payloads may not include these
  merged.version = 2;
  if (!merged.bodyType) merged.bodyType = base.bodyType;
  if (!merged.eyebrowsType) merged.eyebrowsType = base.eyebrowsType;
  if (!merged.eyebrowsColor) merged.eyebrowsColor = merged.hairColor || base.hairColor;
  if (!merged.accessoryHat) merged.accessoryHat = "none";
  if (!merged.accessoryGlasses) merged.accessoryGlasses = "none";
  if (!merged.outfitAccentColor) merged.outfitAccentColor = base.outfitAccentColor;
  if (merged.jerseyNumber == null) merged.jerseyNumber = base.jerseyNumber;
  if (!merged.jerseyName) merged.jerseyName = base.jerseyName;
  if (!merged.jerseyStyle) merged.jerseyStyle = base.jerseyStyle;

  // Guard against unexpected values (keep deterministic fallback)
  if (!(merged.skin in SKIN)) merged.skin = base.skin;
  if (!(merged.eyes in EYES)) merged.eyes = base.eyes;
  if (!(merged.hairColor in HAIR)) merged.hairColor = base.hairColor;
  if (!(merged.eyebrowsColor in HAIR)) merged.eyebrowsColor = merged.hairColor;
  if (!(merged.outfitColor in OUTFIT)) merged.outfitColor = base.outfitColor;
  if (!(merged.outfitAccentColor in ACCENT)) merged.outfitAccentColor = base.outfitAccentColor;
  if (typeof merged.jerseyNumber !== "number" || !Number.isFinite(merged.jerseyNumber)) merged.jerseyNumber = base.jerseyNumber;
  merged.jerseyNumber = Math.max(0, Math.min(99, Math.round(merged.jerseyNumber)));
  if (typeof merged.jerseyName !== "string") merged.jerseyName = base.jerseyName;
  merged.jerseyName = merged.jerseyName.trim().toUpperCase().slice(0, 12);
  if (!["solid", "stripes_v", "stripes_h", "sleeves"].includes(String(merged.jerseyStyle))) merged.jerseyStyle = base.jerseyStyle;

  return merged as RequiredV2;
}

function Eyebrows({ type, color }: { type: RequiredV2["eyebrowsType"]; color: string }) {
  const stroke = color;
  switch (type) {
    case "arched":
      return (
        <>
          <path d="M37 52c5-5 11-6 18-3" stroke={stroke} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
          <path d="M83 52c-5-5-11-6-18-3" stroke={stroke} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </>
      );
    case "thick":
      return (
        <>
          <path d="M35 54c7-6 15-7 23-3" stroke={stroke} strokeWidth="4" strokeLinecap="round" opacity="0.95" />
          <path d="M85 54c-7-6-15-7-23-3" stroke={stroke} strokeWidth="4" strokeLinecap="round" opacity="0.95" />
        </>
      );
    default:
      return (
        <>
          <path d="M36 54c6-4 12-5 19-2" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
          <path d="M84 54c-6-4-12-5-19-2" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        </>
      );
  }
}

function Hair({ type, color }: { type: RequiredV2["hairType"]; color: string }) {
  if (type === "bald") return null;
  switch (type) {
    case "curly":
      return (
        <>
          <path d="M29 50c-2-12 5-22 17-26 12-4 28 0 34 14 2 4 3 9 2 12-2-2-6-6-12-6-5 0-9 2-10 3-1-2-5-6-12-6-6 0-11 4-13 9Z" fill={color} opacity="0.98" />
          <circle cx="38" cy="37" r="4" fill={color} opacity="0.98" />
          <circle cx="50" cy="33" r="4" fill={color} opacity="0.98" />
          <circle cx="64" cy="33" r="4" fill={color} opacity="0.98" />
          <circle cx="76" cy="37" r="4" fill={color} opacity="0.98" />
        </>
      );
    case "long":
      return (
        <>
          <path d="M30 54c-4-18 4-32 20-36 16-4 34 6 34 27 0 10-3 17-6 21-5-8-15-12-24-12S36 58 30 66c0 0 0-7 0-12Z" fill={color} opacity="0.98" />
          <path d="M28 70c2-10 10-20 26-20s24 10 26 20c2 10-3 26-9 34-5 6-9 8-17 8s-12-2-17-8c-6-8-11-24-9-34Z" fill={color} opacity="0.14" />
        </>
      );
    case "medium":
      return <path d="M30 52c-2-15 7-28 23-30 16-2 30 10 30 27 0 7-2 12-4 16-6-6-14-9-22-9s-16 3-22 9c-2-4-4-8-5-13Z" fill={color} opacity="0.98" />;
    default:
      return <path d="M31 54c1-17 13-28 27-28s26 11 27 28c0 6-2 11-4 15-6-7-15-10-23-10s-17 3-23 10c-2-4-4-9-4-15Z" fill={color} opacity="0.98" />;
  }
}

function Hat({ hat, color }: { hat: RequiredV2["accessoryHat"]; color: string }) {
  if (hat === "none") return null;
  if (hat === "beanie") {
    return (
      <>
        <path d="M32 48c1-15 12-26 26-26s25 11 26 26c-7-6-16-9-26-9s-19 3-26 9Z" fill={color} opacity="0.95" />
        <path d="M28 52c10-9 20-12 30-12s20 3 30 12" stroke="#0F172A" strokeWidth="2" opacity="0.25" strokeLinecap="round" />
        <circle cx="58" cy="22" r="4" fill={color} opacity="0.95" />
      </>
    );
  }

  // cap
  return (
    <>
      <path d="M34 46c4-12 14-20 24-20s20 8 24 20c-7-5-15-7-24-7s-17 2-24 7Z" fill={color} opacity="0.95" />
      <path d="M28 52c8-6 18-9 30-9s22 3 30 9" fill="none" stroke="#0F172A" strokeWidth="2" opacity="0.25" strokeLinecap="round" />
      <path d="M30 54c12-6 24-7 36 0 2 1 3 4 1 6-14 9-24 9-38 0-3-2-2-5 1-6Z" fill={color} opacity="0.9" />
    </>
  );
}

function Glasses({ type }: { type: RequiredV2["accessoryGlasses"]; }) {
  if (type === "none") return null;
  if (type === "round") {
    return (
      <>
        <circle cx="44" cy="64" r="9" fill="none" stroke="#0F172A" strokeWidth="2" opacity="0.7" />
        <circle cx="72" cy="64" r="9" fill="none" stroke="#0F172A" strokeWidth="2" opacity="0.7" />
        <path d="M53 64h10" stroke="#0F172A" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      </>
    );
  }
  // square
  return (
    <>
      <rect x="35" y="56" width="18" height="16" rx="4" fill="none" stroke="#0F172A" strokeWidth="2" opacity="0.7" />
      <rect x="67" y="56" width="18" height="16" rx="4" fill="none" stroke="#0F172A" strokeWidth="2" opacity="0.7" />
      <path d="M53 64h14" stroke="#0F172A" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
    </>
  );
}

function Outfit({
  type,
  color,
  accent,
  sex,
  bodyType,
  jerseyNumber,
  jerseyName,
  jerseyStyle,
  renderMode,
  uid,
}: {
  type: RequiredV2["outfitType"];
  color: string;
  accent: string;
  sex: RequiredV2["sex"];
  bodyType: RequiredV2["bodyType"];
  jerseyNumber: number;
  jerseyName: string;
  jerseyStyle: RequiredV2["jerseyStyle"];
  renderMode: "badge" | "full";
  uid: string;
}) {
  // Simple cartoon silhouettes. bodyType affects shoulder width.
  const shoulder = bodyType === "slim" ? 34 : bodyType === "athletic" ? 42 : 38;
  const leftX = 60 - shoulder;
  const rightX = 60 + shoulder;

  if (type === "dress") {
    return (
      <>
        <path d={`M${leftX} 84c6-20 18-28 38-28s32 8 38 28c2 6 3 12 3 16-10 10-22 15-41 15s-31-5-41-15c0-4 1-10 3-16Z`} fill={color} opacity="0.95" />
        <path d="M60 58c-6 7-8 12-8 18 5 2 10 3 16 0 0-6-2-11-8-18Z" fill="#0F172A" opacity="0.12" />
      </>
    );
  }

  if (type === "suit") {
    return (
      <>
        <path d={`M${leftX} 86c6-22 19-32 38-32s32 10 38 32c2 7 3 15 3 22-9 8-22 12-41 12s-32-4-41-12c0-7 1-15 3-22Z`} fill={color} opacity="0.95" />
        <path d="M60 58l-10 14 10 44 10-44-10-14Z" fill="#0F172A" opacity="0.35" />
      </>
    );
  }

  if (type === "jersey") {
    const clip = `jersey-clip-${uid}`;
    return (
      <>
        <defs>
          <clipPath id={clip}>
            <path d={`M${leftX} 86c6-22 19-32 38-32s32 10 38 32c2 7 3 15 3 22-9 8-22 12-41 12s-32-4-41-12c0-7 1-15 3-22Z`} />
          </clipPath>
        </defs>
        {/* torso */}
        <path
          d={`M${leftX} 86c6-22 19-32 38-32s32 10 38 32c2 7 3 15 3 22-9 8-22 12-41 12s-32-4-41-12c0-7 1-15 3-22Z`}
          fill={color}
          stroke={OUTLINE}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* jersey patterns */}
        <g clipPath={`url(#${clip})`} opacity="0.95">
          {jerseyStyle === "stripes_v" ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <rect key={i} x={leftX + 6 + i * 12} y="54" width="7" height="80" fill={accent} opacity={i % 2 === 0 ? 0.28 : 0.12} />
              ))}
            </>
          ) : null}
          {jerseyStyle === "stripes_h" ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <rect key={i} x={leftX} y={64 + i * 12} width={rightX - leftX} height="6" fill={accent} opacity={i % 2 === 0 ? 0.26 : 0.12} />
              ))}
            </>
          ) : null}
          {jerseyStyle === "sleeves" ? (
            <>
              {/* sleeves blocks */}
              <path d={`M${leftX} 84c7-14 15-22 24-26`} stroke={accent} strokeWidth="10" opacity="0.22" strokeLinecap="round" />
              <path d={`M${rightX} 84c-7-14-15-22-24-26`} stroke={accent} strokeWidth="10" opacity="0.22" strokeLinecap="round" />
            </>
          ) : null}
        </g>

        {/* collar */}
        <path d="M52 60c4 6 7 9 8 9s4-3 8-9" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" opacity="0.95" />

        {/* shoulder stripes */}
        <path d={`M${leftX + 10} 74h22`} stroke={accent} strokeWidth="5" opacity="0.9" strokeLinecap="round" />
        <path d={`M${rightX - 32} 74h22`} stroke={accent} strokeWidth="5" opacity="0.9" strokeLinecap="round" />

        {/* chest number + name */}
        <text x="60" y="86" textAnchor="middle" fontSize="18" fontWeight="800" fill={accent} stroke={OUTLINE} strokeWidth="1.5" paintOrder="stroke" style={{ fontFamily: "ui-sans-serif, system-ui" }}>
          {String(jerseyNumber)}
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="7" fontWeight="800" fill={accent} stroke={OUTLINE} strokeWidth="1" paintOrder="stroke" style={{ letterSpacing: "0.8px", fontFamily: "ui-sans-serif, system-ui" }}>
          {jerseyName}
        </text>

        {/* back number (full-body only) */}
        {renderMode === "full" ? (
          <text
            x="60"
            y="112"
            textAnchor="middle"
            fontSize="36"
            fontWeight="900"
            fill={accent}
            opacity="0.32"
            stroke={OUTLINE}
            strokeWidth="2.25"
            paintOrder="stroke"
            style={{ fontFamily: "ui-sans-serif, system-ui" }}
          >
            {String(jerseyNumber)}
          </text>
        ) : null}

        {/* subtle shade */}
        <path d="M60 58c-6 7-8 12-8 18 5 2 10 3 16 0 0-6-2-11-8-18Z" fill="#0F172A" opacity="0.08" />
      </>
    );
  }

  if (type === "tracksuit") {
    return (
      <>
        <path d={`M${leftX} 86c6-22 19-32 38-32s32 10 38 32c2 7 3 15 3 22-9 8-22 12-41 12s-32-4-41-12c0-7 1-15 3-22Z`} fill={color} opacity="0.94" />
        <path d="M60 58v60" stroke="#F8FAFC" strokeWidth="3" opacity="0.55" strokeLinecap="round" />
      </>
    );
  }

  if (type === "tshirt") {
    return <path d={`M${leftX + 2} 88c6-18 18-28 36-28s30 10 36 28c2 6 3 12 3 18-8 7-20 11-39 11s-31-4-39-11c0-6 1-12 3-18Z`} fill={color} opacity="0.92" />;
  }

  // hoodie
  return (
    <>
      <path d={`M${leftX} 86c6-22 19-32 38-32s32 10 38 32c2 7 3 15 3 22-9 8-22 12-41 12s-32-4-41-12c0-7 1-15 3-22Z`} fill={color} opacity="0.95" />
      <path d="M43 82c3-10 10-18 17-20" stroke="#F8FAFC" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
      <path d="M77 62c7 2 14 10 17 20" stroke="#F8FAFC" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
    </>
  );
}

function Legs({ skin, outfitColor }: { skin: string; outfitColor: string }) {
  // pants slightly darker
  return (
    <>
      <path d="M44 118c2-8 9-14 16-14h0c7 0 14 6 16 14l6 38H38l6-38Z" fill="#0F172A" opacity="0.12" />
      <path d="M47 116c2-7 8-12 13-12h0c5 0 11 5 13 12l6 40H41l6-40Z" fill={outfitColor} opacity="0.18" />
      <path d="M49 116c1-6 6-11 11-11h0c5 0 10 5 11 11l6 40H43l6-40Z" fill="#0F172A" opacity="0.08" />

      {/* shoes */}
      <path d="M36 152c4-3 12-4 21-3 7 1 10 3 11 5 1 2-1 4-4 4H40c-4 0-6-4-4-6Z" fill="#111827" opacity="0.9" />
      <path d="M73 152c4-3 12-4 21-3 7 1 10 3 11 5 1 2-1 4-4 4H77c-4 0-6-4-4-6Z" fill="#111827" opacity="0.9" />

      {/* hands peek */}
      <circle cx="26" cy="102" r="7" fill={skin} opacity="0.98" />
      <circle cx="94" cy="102" r="7" fill={skin} opacity="0.98" />
    </>
  );
}

export function UserAvatar({
  userId,
  avatar,
  size = 32,
  className = "",
  mode = "badge",
}: {
  userId: string;
  avatar?: AvatarConfig | null;
  size?: number;
  className?: string;
  mode?: "badge" | "full";
}) {
  const uid = useId();
  const a = useMemo(() => normalizeAvatar(userId, avatar), [userId, avatar]);
  const skin = SKIN[a.skin] || SKIN[DEFAULTS.skin];
  const eye = EYES[a.eyes] || EYES[DEFAULTS.eyes];
  const hair = HAIR[a.hairColor] || HAIR[DEFAULTS.hairColor];
  const brows = HAIR[(a as any).eyebrowsColor] || hair;
  const outfit = OUTFIT[a.outfitColor] || OUTFIT[DEFAULTS.outfitColor];
  const accent = ACCENT[a.outfitAccentColor] || ACCENT[DEFAULTS.outfitAccentColor];

  const viewBox = mode === "full" ? "0 0 120 160" : "0 0 120 120";

  const clipId = `clip-${uid}`;
  const bgId = `bg-${uid}`;

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full bg-white/70 ring-1 ring-slate-200 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox={viewBox} role="img">
        <defs>
          <clipPath id={clipId}>
            <circle cx="60" cy="60" r="58" />
          </clipPath>
          <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F8FAFC" />
            <stop offset="1" stopColor="#EEF2FF" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="120" height="160" fill={`url(#${bgId})`} />

          {/* subtle floor */}
          <ellipse cx="60" cy={mode === "full" ? 150 : 112} rx={mode === "full" ? 36 : 28} ry="10" fill="#E5E7EB" opacity="0.8" />

          {/* Outfit/body */}
          <Outfit
            type={a.outfitType}
            color={outfit}
            accent={accent}
            sex={a.sex}
            bodyType={a.bodyType}
            jerseyNumber={a.jerseyNumber}
            jerseyName={a.jerseyName}
            jerseyStyle={a.jerseyStyle}
            renderMode={mode}
            uid={uid}
          />

          {/* Legs/feet only in full mode */}
          {mode === "full" ? <Legs skin={skin} outfitColor={outfit} /> : null}

          {/* Head */}
          {/* ears */}
          <circle cx="34" cy="70" r="6" fill={skin} stroke={OUTLINE} strokeWidth="3" />
          <circle cx="86" cy="70" r="6" fill={skin} stroke={OUTLINE} strokeWidth="3" />

          {/* head */}
          <circle cx="60" cy="62" r="28" fill={skin} stroke={OUTLINE} strokeWidth="3" />
          {/* soft cheek shade */}
          <path d="M46 74c3 12 10 18 14 18s11-6 14-18" fill="#0F172A" opacity="0.06" />

          {/* Hair */}
          <Hair type={a.hairType} color={hair} />

          {/* Hat (optional) */}
          <Hat hat={a.accessoryHat} color={outfit} />

          {/* Eyebrows */}
          <Eyebrows type={a.eyebrowsType} color={brows} />

          {/* Eyes */}
          <circle cx="48" cy="66" r="6" fill="#FFFFFF" opacity="0.95" stroke={OUTLINE} strokeWidth="2" />
          <circle cx="72" cy="66" r="6" fill="#FFFFFF" opacity="0.95" stroke={OUTLINE} strokeWidth="2" />
          <circle cx="48" cy="66" r="3.3" fill={eye} />
          <circle cx="72" cy="66" r="3.3" fill={eye} />
          <circle cx="49.2" cy="65" r="1" fill="#FFFFFF" opacity="0.9" />
          <circle cx="73.2" cy="65" r="1" fill="#FFFFFF" opacity="0.9" />

          {/* Glasses */}
          <Glasses type={a.accessoryGlasses} />

          {/* Nose */}
          <path d="M60 70c-2 4-2 7 0 10" stroke={OUTLINE} strokeWidth="2" opacity="0.18" strokeLinecap="round" fill="none" />

          {/* Mouth */}
          <path d="M50 86c6 6 14 6 20 0" stroke={OUTLINE} strokeWidth="2.5" strokeLinecap="round" opacity="0.55" fill="none" />
        </g>
      </svg>
    </div>
  );
}
