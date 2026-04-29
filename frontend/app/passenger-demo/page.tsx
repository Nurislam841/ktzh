import PassengerDemoWorkspace from '../../components/passenger/PassengerDemoWorkspace';

export default function PassengerDemoPage({
    searchParams,
}: {
    searchParams?: { stationId?: string };
}) {
    return <PassengerDemoWorkspace initialStationId={searchParams?.stationId ?? ''} />;
}
