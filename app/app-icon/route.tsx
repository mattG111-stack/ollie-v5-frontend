import { ImageResponse } from "next/og";
import { AppTile } from "@/lib/AppTile";
export function GET(request: Request) {
  const size = new URL(request.url).searchParams.get("size") === "192" ? 192 : 512;
  return new ImageResponse(<AppTile />, { width: size, height: size });
}
