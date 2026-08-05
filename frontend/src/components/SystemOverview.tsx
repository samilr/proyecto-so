/**
 * SystemOverview.tsx — Fila de indicadores del servidor anfitrion.
 *
 * NOTA ACADEMICA (util para la defensa): estos numeros son del HOST, no del
 * contenedor. El backend los lee del modulo `os` de Node, que consulta /proc.
 * Y /proc/stat, /proc/loadavg y /proc/meminfo NO estan aislados por ningun
 * namespace: el contenedor comparte el kernel del anfitrion y por eso "ve"
 * la CPU y la memoria reales de la maquina. Una maquina virtual no podria
 * hacer esto, porque tendria su propio kernel.
 */
import { MeterBar } from './MeterBar';
import { StatTile } from './StatTile';
import { formatBytes, formatPercent, formatUptime } from '../lib/format';
import type { ServiceStatus, SystemInfo } from '../types/api';

interface SystemOverviewProps {
  system: SystemInfo | null;
  loading: boolean;
  services: ServiceStatus[];
}

export function SystemOverview({ system, loading, services }: SystemOverviewProps) {
  const activeCount = services.filter((s) => s.status === 'active').length;
  const failedCount = services.filter((s) => s.status === 'failed').length;

  // Suma de la memoria de los servicios que el panel administra. No es la
  // memoria total del sistema: es "cuanto pesa lo que gestionamos".
  const managedMemory = services.reduce((sum, s) => sum + (s.memoryBytes ?? 0), 0);

  // %CPU agregado de los servicios administrados. Se expresa sobre la
  // capacidad total (nucleos x 100 %) para que sea comparable con el medidor.
  const managedCpu = services.reduce((sum, s) => sum + (s.cpuPercent ?? 0), 0);
  const capacity = (system?.cpuCores ?? 1) * 100;

  return (
    <section aria-label="Estado del servidor">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* ---------------- CPU del host ---------------- */}
        <StatTile
          icon="▨"
          label="CPU del servidor"
          value={formatPercent(system?.cpuPercent ?? null, 1).replace(' %', '')}
          unit="%"
          loading={loading && !system}
          meter={
            <MeterBar
              value={system?.cpuPercent ?? null}
              max={100}
              label="Uso de CPU del servidor"
            />
          }
          caption={
            system ? (
              <>
                {system.cpuCores} {system.cpuCores === 1 ? 'nucleo' : 'nucleos'} · carga{' '}
                <span className="font-mono">{system.loadAverage.one.toFixed(2)}</span>{' '}
                <span className="text-slate-400 dark:text-slate-500">
                  / {system.loadAverage.five.toFixed(2)} / {system.loadAverage.fifteen.toFixed(2)}
                </span>
              </>
            ) : (
              'Consultando /proc del host…'
            )
          }
        />

        {/* ---------------- Memoria del host ---------------- */}
        <StatTile
          icon="▦"
          label="Memoria del servidor"
          value={formatPercent(system?.memoryPercent ?? null, 1).replace(' %', '')}
          unit="%"
          loading={loading && !system}
          meter={
            <MeterBar
              value={system?.memoryPercent ?? null}
              max={100}
              warnAt={75}
              criticalAt={90}
              label="Uso de memoria del servidor"
            />
          }
          caption={
            system
              ? `${formatBytes(system.memoryUsedBytes)} usados de ${formatBytes(system.memoryTotalBytes)}`
              : '—'
          }
        />

        {/* ---------------- Servicios administrados ---------------- */}
        <StatTile
          icon="▤"
          label="Servicios activos"
          value={String(activeCount)}
          unit={`de ${services.length}`}
          meter={
            <MeterBar
              value={services.length ? (activeCount / services.length) * 100 : null}
              max={100}
              // Aqui MAS es MEJOR, al reves que en CPU y memoria: se desactivan
              // los umbrales de alarma para que la barra no se ponga roja
              // justamente cuando todo esta funcionando.
              warnAt={101}
              criticalAt={101}
              label="Proporcion de servicios activos"
            />
          }
          caption={
            failedCount > 0 ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                ✕ {failedCount} {failedCount === 1 ? 'servicio fallido' : 'servicios fallidos'}
              </span>
            ) : (
              <>
                CPU {formatPercent(managedCpu, 1)} de {capacity} % · RAM{' '}
                {formatBytes(managedMemory)}
              </>
            )
          }
        />

        {/* ---------------- Sistema ---------------- */}
        <StatTile
          icon="▩"
          label="Tiempo encendido"
          value={formatUptime(system?.uptimeSeconds ?? null)}
          loading={loading && !system}
          caption={
            system ? (
              <>
                Kernel <span className="font-mono">{system.kernel}</span> · {system.arch}
                <br />
                <span className="text-slate-400 dark:text-slate-500">
                  compartido con el contenedor
                </span>
              </>
            ) : (
              '—'
            )
          }
        />
      </div>
    </section>
  );
}
