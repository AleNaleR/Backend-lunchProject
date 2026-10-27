export interface CustomerPostRequest {
  firstname: string;
  lastname: string;
  phone: string;
  address?: string;
  lat: number;
  lng: number;
}