export interface Product {
  readonly cat: string;
  readonly id: number;
  readonly img: number;
  readonly name: string;
  readonly price: number;
}

export interface CartEntry {
  readonly id: number;
  qty: number;
}
