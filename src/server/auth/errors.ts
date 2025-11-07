// sin "use server"
export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "Permisos insuficientes") {
    super(message);
    this.name = "ForbiddenError";
  }
}
