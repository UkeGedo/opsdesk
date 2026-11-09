export type AccountRole = 'administrador' | 'supervisor' | 'tecnico' | 'cliente';
export type CustomerStatus = 'activo' | 'inactivo';
export type TicketStatus =
  | 'abierto'
  | 'asignado'
  | 'en_proceso'
  | 'pendiente_cliente'
  | 'resuelto'
  | 'cerrado'
  | 'reabierto';
export type PageMetadata = { page: number; limit: number; total: number };
export type Paginated<T> = { data: T[]; meta: PageMetadata };
export type CustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  updatedAt: string;
};
