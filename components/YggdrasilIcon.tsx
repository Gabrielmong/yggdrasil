import { Box } from "@mui/material";

interface YggdrasilIconProps {
  color?: string;
  size?: number | string;
}

export default function YggdrasilIcon({ color = "currentColor", size = 32 }: YggdrasilIconProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
        backgroundColor: color,
        maskImage: 'url("/icon.svg")',
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: 'url("/icon.svg")',
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
