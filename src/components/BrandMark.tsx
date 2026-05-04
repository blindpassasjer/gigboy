interface BrandMarkProps {
  size: number;
}

export default function BrandMark({ size }: BrandMarkProps) {
  return (
    <>
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="brand-mark-logo"
      />
      <span>Gigboi</span>
    </>
  );
}