/**
 * StatTile.tsx — Tarjeta de indicador (KPI).
 *
 * POR QUE UNA TARJETA Y NO UN GRAFICO: cada una de estas metricas es UN solo
 * numero en UN instante. Un grafico solo aporta cuando hay comparacion o
 * evolucion; para un valor unico, el numero grande se lee mas rapido desde
 * un proyector, que es el escenario de la demostracion.
 *
 * El texto siempre lleva colores de TEXTO, no el color del dato: el color
 * vive en el medidor, y el numero se mantiene legible en ambos temas.
 */
import type { ReactNode } from 'react';

interface StatTileProps {
  /** Titulo corto del indicador. */
  label: string;
  /** Valor principal, ya formateado. */
  value: string;
  /** Unidad o sufijo pequeno junto al valor (ej. "%", "de 6"). */
  unit?: string;
  /** Linea de contexto bajo el valor. */
  caption?: ReactNode;
  /** Icono decorativo (aria-hidden). */
  icon?: string;
  /** Medidor opcional bajo el valor. */
  meter?: ReactNode;
  /** Estado de carga: muestra un esqueleto en lugar del valor. */
  loading?: boolean;
}

export function StatTile({
  label,
  value,
  unit,
  caption,
  icon,
  meter,
  loading = false,
}: StatTileProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className="text-sm text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </h3>
      </div>

      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="mt-1.5 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {value}
          </span>
          {unit && (
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {unit}
            </span>
          )}
        </p>
      )}

      {meter && <div className="mt-2.5">{meter}</div>}

      {caption && (
        <p className="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
          {caption}
        </p>
      )}
    </div>
  );
}
