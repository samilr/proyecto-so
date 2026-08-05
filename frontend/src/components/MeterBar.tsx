/**
 * MeterBar.tsx — Barra fina de magnitud (0–100 % de una capacidad).
 *
 * DECISIONES DE VISUALIZACION:
 *  - Es un MEDIDOR, no un grafico: codifica una magnitud contra un maximo
 *    conocido. Por eso una barra simple, y no una tarta ni un anillo.
 *  - La marca es delgada (6 px) y la pista es gris: el color solo aparece
 *    en el dato, nunca en el marco.
 *  - El color NO es decorativo, es de ESTADO: normal / advertencia / critico.
 *    Se usan los mismos pasos reservados para estados en el resto del panel,
 *    y jamas transmite informacion el color por si solo: siempre hay un
 *    numero visible al lado (obligatorio porque el ambar no alcanza 3:1 de
 *    contraste sobre fondo claro).
 *  - Los pasos de modo oscuro estan ELEGIDOS, no invertidos: en un fondo
 *    oscuro hacen falta tonos mas luminosos para conservar el contraste.
 */

interface MeterBarProps {
  /** Valor a representar, en las mismas unidades que `max`. */
  value: number | null;
  /** Capacidad total que representa el 100 % de la barra. */
  max: number;
  /** Umbrales de color, en porcentaje de la capacidad. */
  warnAt?: number;
  criticalAt?: number;
  /** Descripcion para lectores de pantalla. */
  label: string;
  className?: string;
}

const TONES = {
  normal: 'bg-sky-600 dark:bg-sky-500',
  warn: 'bg-amber-500 dark:bg-amber-500',
  critical: 'bg-red-600 dark:bg-red-500',
  empty: 'bg-slate-300 dark:bg-slate-600',
} as const;

export function MeterBar({
  value,
  max,
  warnAt = 70,
  criticalAt = 90,
  label,
  className = '',
}: MeterBarProps) {
  const hasValue = value !== null && Number.isFinite(value) && max > 0;
  // Se recorta a [0, 100] solo para el ANCHO de la barra: el numero que se
  // muestra al lado conserva el valor real (un servicio puede pasar del 100 %
  // de un nucleo, y eso hay que poder verlo).
  const ratio = hasValue ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const tone = !hasValue
    ? TONES.empty
    : ratio >= criticalAt
      ? TONES.critical
      : ratio >= warnAt
        ? TONES.warn
        : TONES.normal;

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}
      role="meter"
      aria-valuenow={hasValue ? Math.round(ratio) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone}`}
        // El ancho es un dato en vivo: va inline porque Tailwind no puede
        // generar una clase por cada porcentaje posible.
        style={{ width: `${hasValue ? Math.max(ratio, 1.5) : 0}%` }}
      />
    </div>
  );
}
