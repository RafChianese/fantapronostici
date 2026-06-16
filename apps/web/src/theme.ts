import { createTheme, MantineColorsTuple } from "@mantine/core";

const pitchNavy: MantineColorsTuple = [
  "#eef2f7",
  "#d7dee9",
  "#acbbcf",
  "#7f96b4",
  "#59789e",
  "#426891",
  "#365c86",
  "#2b4d72",
  "#233f5d",
  "#15263c",
];

const trophyGold: MantineColorsTuple = [
  "#fff8e6",
  "#faebc0",
  "#efd384",
  "#e4ba47",
  "#dca614",
  "#c89309",
  "#a97605",
  "#875d08",
  "#6d4b0b",
  "#3f2a05",
];

export const appTheme = createTheme({
  primaryColor: "trophyGold",
  colors: {
    pitchNavy,
    trophyGold,
  },
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headings: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: "850",
  },
  radius: {
    xs: "8px",
    sm: "12px",
    md: "16px",
    lg: "20px",
    xl: "26px",
  },
  defaultRadius: "lg",
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
      },
      styles: {
        root: {
          fontWeight: 850,
          letterSpacing: "-0.01em",
        },
      },
    },
    Paper: {
      defaultProps: {
        radius: "xl",
      },
    },
    TextInput: {
      defaultProps: {
        radius: "lg",
      },
    },
    Select: {
      defaultProps: {
        radius: "lg",
      },
    },
    Badge: {
      defaultProps: {
        radius: "xl",
      },
      styles: {
        root: {
          fontWeight: 850,
          letterSpacing: "0.06em",
        },
      },
    },
  },
});
