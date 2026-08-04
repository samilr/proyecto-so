/// <reference types="vite/client" />

/**
 * Tipado de las variables de entorno de Vite.
 * Solo se exponen al navegador las que empiezan por VITE_ (proteccion de Vite
 * para no filtrar secretos del servidor dentro del bundle).
 */
interface ImportMetaEnv {
  /**
   * URL base del backend. Vacia (o ausente) => rutas relativas `/api/...`,
   * que es lo que se usa en produccion detras del proxy de Nginx.
   * Solo se define para `npm run dev` fuera de Docker.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
