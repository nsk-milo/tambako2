import Image from "next/image"


export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center`}>
      <Image src="/logo.svg" alt="Logo" width={50} height={50} className="mr-2" />
    </div>
  )
}
