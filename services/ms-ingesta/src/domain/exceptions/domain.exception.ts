export class DomainException extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DossierNotFoundException extends DomainException {
  constructor(candidateId: string) {
    super(`No existe expediente documental para el candidato ${candidateId}`, 'DOSSIER_NOT_FOUND');
  }
}

export class DossierAlreadyLockedException extends DomainException {
  constructor(candidateId: string) {
    super(`El expediente del candidato ${candidateId} ya está bloqueado`, 'DOSSIER_ALREADY_LOCKED');
  }
}

export class IdempotencyInProgressException extends DomainException {
  constructor() {
    super('Ya existe una solicitud en curso con esta clave de idempotencia', 'IDEMPOTENCY_IN_PROGRESS');
  }
}

export class InvalidApplicationSelectionException extends DomainException {
  constructor(applicationId: string) {
    super(`La postulación ${applicationId} no pertenece al candidato o vacante seleccionados`, 'INVALID_APPLICATION_SELECTION');
  }
}
