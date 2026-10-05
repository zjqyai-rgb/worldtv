// Ai.Alvin_daily brand mark, cropped from the original logo artwork.
export default function BrandMark({ height = 38 }: { height?: number }) {
  return (
    <span className="ai-badge" style={{ height }}>
      <img src="/brand/ai-mark.png" alt="Ai.Alvin_daily" height={height} width={Math.round((height * 177) / 128)} />
    </span>
  );
}
