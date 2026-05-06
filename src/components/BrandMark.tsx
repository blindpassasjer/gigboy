interface BrandMarkProps {
  size: number;
}

export default function BrandMark({ size }: BrandMarkProps) {
  const scaledSize = size * 1.1;

  return (
    <span className="brand-name" style={{ fontSize: scaledSize }}>
      <span className="brand-name-gig">GIG</span><span className="brand-name-boy">BOY</span>
    </span>
  );
}