export interface ApiResponse<T> {
  code: number;
  status: 'success' | 'error';
  data: T | null;
  message: string;
}
