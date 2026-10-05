// Ai.Alvin_daily logo, cropped from the original artwork.
// The full wordmark is shown on wider screens; phones get the compact "Ai" mark.
export default function BrandMark({ height = 36 }: { height?: number }) {
  return (
    <span className="ai-badge" style={{ height }}>
      <picture>
        <source media="(max-width: 820px)" srcSet="/brand/ai-mark.png" width={Math.round((height * 177) / 128)} height={height} />
        <img
          src="/brand/ai-alvin-daily.png"
          alt="Ai.Alvin_daily"
          height={height}
          width={Math.round((height * 861) / 151)}
        />
      </picture>
    </span>
  );
}
