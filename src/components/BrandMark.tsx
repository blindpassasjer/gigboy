interface BrandMarkProps {
  size: number;
  scale?: number;
}

export default function BrandMark({ size, scale = 1.1 }: BrandMarkProps) {
  const scaledSize = size * scale;

  return (
    <span className="brand-name" style={{ fontSize: scaledSize }}>
      <span className="brand-name-gig">GI</span><span className="brand-name-mirror-g">G</span><span className="brand-name-boy">BOY</span>
    </span>
  );
}