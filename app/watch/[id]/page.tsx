// app/watch/[id]/page.tsx

import { use } from "react";

import WatchPageClient from "./WatchPageClient";

type PageProps = {
  params: {
    id: string;
  };
};

export default function WatchPage({ params }: {params: Promise<{ id: string }>}) {
  const { id } = use(params);
  return <WatchPageClient id={id} />;
}