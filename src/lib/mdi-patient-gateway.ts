import "server-only";

import {
  createMdiPatient,
  type MdiClientOptions,
} from "@/lib/mdi/client";
import {
  mapMdiPatientClientError,
  type MdiPatientGateway,
} from "@/lib/mdi-patient";

export function createMdiHttpPatientGateway(input: {
  clientOptions?: MdiClientOptions;
} = {}): MdiPatientGateway {
  return {
    async createPatient(patientInput) {
      const result = await createMdiPatient({
        idempotencyKey: patientInput.idempotencyKey,
        patient: patientInput.patient,
      }, input.clientOptions ?? {});
      return result.ok
        ? result
        : { ok: false, error: mapMdiPatientClientError(result.error) };
    },
  };
}
