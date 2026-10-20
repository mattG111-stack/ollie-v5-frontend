import { ImageResponse } from "next/og";
import { AppTile } from "@/lib/AppTile";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(<AppTile />, size);
}
