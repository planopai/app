export class RegraNegocioError extends Error {
  readonly status: number;
  readonly codigo?: string;
  readonly detalhes?: unknown;

  constructor(
    message: string,
    status = 400,
    codigo?: string,
    detalhes?: unknown,
  ) {
    super(message);
    this.name = "RegraNegocioError";
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}
