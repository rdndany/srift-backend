import { notFound } from 'next/navigation';
import WingLab from '@/components/WingLab';

/** `/wing-lab`: a bench for the poses of the figure (development only: it is not there in a build). */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <WingLab />;
}
