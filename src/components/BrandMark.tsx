interface BrandMarkProps {
  size: number;
}

export default function BrandMark({ size }: BrandMarkProps) {
  return (
    <span className="brand-name" style={{ fontSize: size }}>
      <span className="brand-name-gig">GIG</span><span className="brand-name-boy">BOY</span>
    </span>
  );
}