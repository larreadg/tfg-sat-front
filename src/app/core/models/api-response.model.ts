import { PaginationMeta } from './pagination.model';

export interface ApiResponse<T> {
  code: number;
  status: 'success' | 'error';
  data: T | null;
  message: string;
  /** Presente solo en listados paginados (`GET /admin/reportes`, etc.). */
  meta?: PaginationMeta;
}
