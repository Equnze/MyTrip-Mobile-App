import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

export function MyTripLogo({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="mytrip-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A72FF" />
          <Stop offset="1" stopColor="#0367FA" />
        </LinearGradient>
      </Defs>
      <Rect width={100} height={100} rx={23} fill="url(#mytrip-logo-bg)" />
      {/* Mountain */}
      <Path
        fill="#FFFFFF"
        d="M0 60 C8 58.5 15 55 21 47.5 L28.5 41 L34 43 L49 28.5 C51.5 26.5 54 26.5 56 28.5 L66 39.5 C74 48 84 55 100 58 L100 63 C82 60.5 64 65.5 46 63.5 C30 61.5 16 61 0 64 Z"
      />
      {/* Ski track */}
      <Path
        d="M64 45 L50.5 57.5"
        stroke="#0A6EFD"
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      {/* Wave */}
      <Path
        d="M28 69 C38 75.5 48 76.5 56 73.5 C64 70.5 72 67.5 79 68.5"
        stroke="#FFFFFF"
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
