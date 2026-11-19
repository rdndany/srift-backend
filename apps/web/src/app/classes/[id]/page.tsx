import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CLASSES, CLASS_IDS, isClassId } from '@solrift/shared';
import { ClassPage } from '@/components/ClassPage';

/** `/classes/warrior`, `/classes/mage`, `/classes/ranger`: a page for each class, with every ability explained. Nothing else is a page. */
export const dynamicParams = false;

export function generateStaticParams() {
  return CLASS_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isClassId(id)) return {};
  const c = CLASSES[id];
  return {
    title: `${c.name}: ${c.tagline} | SolRift`,
    description: `${c.description} Every ${c.name} ability explained: what it costs, what it does and how to use it.`,
  };
}

export default async function ClassRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isClassId(id)) notFound();
  return (
    <div id="home-layer">
      <div id="home" className="front">
        <ClassPage id={id} />
      </div>
    </div>
  );
}
