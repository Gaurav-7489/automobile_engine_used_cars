export class InputError extends Error {}
export class RecordNotFound extends Error {}
export class ConflictError extends Error {}
export class InventoryValidationError extends InputError {
  constructor(public readonly issues: {row:number; field:string; message:string}[]) {
    super("Inventory validation failed.");
  }
}
