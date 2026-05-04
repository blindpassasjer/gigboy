interface BrandMarkProps {
  size: number;
}

export default function BrandMark({ size }: BrandMarkProps) {
  return (
    <span className="brand-name" style={{ fontSize: size }}>
      GIGBO<span className="brand-i">i</span>
    </span>
  );
}