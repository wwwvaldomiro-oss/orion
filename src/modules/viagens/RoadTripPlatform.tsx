import { CarRoadTripPlanner } from './components/car-planner/CarRoadTripPlanner';
import type { CalculatedRouteResult } from './services/tollEngine';

interface RoadTripPlatformProps {
  onOpenTicketsPlatform?: () => void;
  onSaveRouteToOrion?: (route: CalculatedRouteResult) => Promise<void>;
  orionVehicles?: Array<{ id: string; name: string; plate: string; fuelType?: string }>;
  initialOriginCity?: string;
  initialDestCity?: string;
}

/**
 * RODOVIAS & PEDÁGIOS BRASIL
 * Plataforma de Rotas, Pedágios, Postos da PRF e Gestão de Combustível
 */
export function RoadTripPlatform({
  onOpenTicketsPlatform,
  onSaveRouteToOrion,
  orionVehicles,
  initialOriginCity = 'São Paulo',
  initialDestCity = 'Rio de Janeiro'
}: RoadTripPlatformProps) {
  return (
    <div className="w-full bg-slate-100 flex flex-col font-sans rounded-2xl overflow-hidden border border-[#dce2e6]">
      <CarRoadTripPlanner
        onBackToTickets={onOpenTicketsPlatform}
        onSaveRouteToOrion={onSaveRouteToOrion}
        orionVehicles={orionVehicles}
        initialOriginCity={initialOriginCity}
        initialDestCity={initialDestCity}
      />
    </div>
  );
}

export default RoadTripPlatform;
