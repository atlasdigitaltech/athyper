import type { PlaneKey } from "../context/execution-context.js";
import type { PlaneTransactionCoordinator } from "./unit-of-work.js";

declare const exactPlaneTransactionBrand: unique symbol;

export type ExactPlaneTransaction<Transaction, Plane extends PlaneKey = PlaneKey> = Transaction & {
  readonly [exactPlaneTransactionBrand]: Plane;
};

const transactionPlanes = new WeakMap<object, PlaneKey>();

export function brandExactPlaneTransaction<Transaction>(transaction: Transaction, planeKey: PlaneKey): ExactPlaneTransaction<Transaction> {
  if ((typeof transaction !== "object" && typeof transaction !== "function") || transaction === null) {
    throw exactPlaneError("EXACT_PLANE_TRANSACTION_REQUIRED", planeKey);
  }
  const object = transaction as object;
  const existing = transactionPlanes.get(object);
  if (existing && existing !== planeKey) throw exactPlaneError("EXACT_PLANE_TRANSACTION_MISMATCH", planeKey, existing);
  transactionPlanes.set(object, planeKey);
  return transaction as ExactPlaneTransaction<Transaction>;
}

export function assertExactPlaneTransaction<Transaction>(transaction: Transaction, planeKey: PlaneKey): asserts transaction is ExactPlaneTransaction<Transaction> {
  if ((typeof transaction !== "object" && typeof transaction !== "function") || transaction === null) {
    throw exactPlaneError("EXACT_PLANE_TRANSACTION_REQUIRED", planeKey);
  }
  const actual = transactionPlanes.get(transaction as object);
  if (!actual) throw exactPlaneError("EXACT_PLANE_TRANSACTION_REQUIRED", planeKey);
  if (actual !== planeKey) throw exactPlaneError("EXACT_PLANE_TRANSACTION_MISMATCH", planeKey, actual);
}

export function exactPlaneOf(transaction: unknown): PlaneKey | undefined {
  return (typeof transaction === "object" && transaction !== null) || typeof transaction === "function"
    ? transactionPlanes.get(transaction as object)
    : undefined;
}

export function createExactPlaneTransactionCoordinator<Transaction>(coordinator: PlaneTransactionCoordinator<Transaction>): PlaneTransactionCoordinator<ExactPlaneTransaction<Transaction>> {
  return {
    run(planeKey, actor, work) {
      return coordinator.run(planeKey, actor, (transaction) => work(brandExactPlaneTransaction(transaction, planeKey)));
    },
  };
}

function exactPlaneError(code: string, requestedPlane: PlaneKey, actualPlane?: PlaneKey): Error {
  return Object.assign(new Error(code), { code, details: { requestedPlane, ...(actualPlane ? { actualPlane } : {}) } });
}
