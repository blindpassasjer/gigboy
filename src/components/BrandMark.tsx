interface BrandMarkProps {
  size: number;
  scale?: number;
}

export default function BrandMark({ size, scale = 1.1 }: BrandMarkProps) {
  const scaledSize = size * scale;

  return (
    <span className="brand-name" style={{ fontSize: scaledSize }}>
      <span className="brand-name-gig">GIG</span><span className="brand-name-boy">BOY</span>
    </span>
  );
}