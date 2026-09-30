import Image from "next/image";

export function Brand() {
  return (
    <div className="brand" aria-label="Codeedge">
      <Image className="brandLogo" src="/assets/logo.svg" alt="Codeedge" width={150} height={38} priority />
    </div>
  );
}
