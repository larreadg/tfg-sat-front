/**
 * Metadatos de paginación que el backend adjunta en `ApiResponse.meta` para los
 * listados (ver `shared/utils/response.ts` del back). `limit` = tamaño de página.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
