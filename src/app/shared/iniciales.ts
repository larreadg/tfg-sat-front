/**
 * Iniciales para el `p-avatar`: la primera letra del nombre y la del apellido.
 *
 * Vive en `shared/` porque la usan el avatar del encabezado (con el usuario de
 * la sesión) y el hilo de seguimiento de una alerta (con el autor de cada
 * comentario, que viene del backend como un nombre ya armado).
 */
export function iniciales(nombres: string, apellidos: string): string {
  return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
}

/** Iniciales a partir de un nombre completo ("Ada Lovelace" → "AL"). */
export function inicialesDeNombreCompleto(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) {
    return '';
  }
  const primera = partes[0]!.charAt(0);
  // La última palabra es el apellido en el formato que arma el backend
  // (`nombres apellidos`); con una sola palabra se repite la inicial sola.
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : '';
  return `${primera}${ultima}`.toUpperCase();
}
