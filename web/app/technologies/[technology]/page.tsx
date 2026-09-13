import { TechnologyReleaseList } from "./technology-release-list";

interface ITechnologyPageProps {
  params: Promise<{ technology: string }>;
}

export default async function TechnologyPage({ params }: ITechnologyPageProps) {
  const { technology } = await params;

  return <TechnologyReleaseList technology={technology} />;
}
