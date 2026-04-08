import { Suspense } from 'react';
import PassengerWorkspace from '../../components/passenger/PassengerWorkspace';

export default function MapPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
            <PassengerWorkspace pageMode="map" />
        </Suspense>
    );
}
