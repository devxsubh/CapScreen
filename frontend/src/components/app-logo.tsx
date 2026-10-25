/** CapScreen brand assets in /public (vector outlines, no font dependency). */
export const APP_LOGO_SRC = "/capscreen-logo.svg";
export const APP_MARK_SRC = "/capscreen-mark.svg";

/** Lockup artboard: 1104 × 391 (circle diameter = height). */
const ASPECT = 1104 / 391;

type AppLogoProps = {
  /** Full lockup (circle + "screen") vs circular "cap" mark */
  variant?: "full" | "mark";
  height?: number;
  className?: string;
};

export function AppLogo({
  variant = "full",
  height = 32,
  className = "",
}: AppLogoProps) {
  if (variant === "mark") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={APP_MARK_SRC}
        alt="CapScreen"
        width={height}
        height={height}
        className={`shrink-0 ${className}`}
        style={{ width: height, height }}
      />
    );
  }

  const width = Math.round(height * ASPECT);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={APP_LOGO_SRC}
      alt="CapScreen"
      height={height}
      width={width}
      className={`shrink-0 ${className}`}
      style={{ height, width: "auto", maxWidth: width }}
    />
  );
}
