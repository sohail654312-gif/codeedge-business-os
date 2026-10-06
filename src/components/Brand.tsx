import Image from "next/image";

export function Brand() {
  return (
    <div className="brand">
      <Image
        className="codeedgeLogo"
        src="/assets/logo.svg"
        alt="Codeedge"
        width={180}
        height={45}
        priority
      />
    </div>
  );
}
