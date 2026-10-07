export interface JwtPayload {
  usuarioId: number;
  correoElectronico: string;
  nombres: string;
  apellidos: string;
  documento: string;
  permisos: string[];
  iat: number;
  exp: number;
}
