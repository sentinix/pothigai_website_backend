import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Records a permanent redirect after a URL changes. Existing redirects that
 * pointed at the old path are re-targeted so visitors never hit a chain, and
 * any redirect *from* the new path is dropped because that URL is live again.
 */
export async function recordRedirect(tx: Tx, fromPath: string, toPath: string) {
  if (fromPath === toPath) return;
  await tx.slugRedirect.deleteMany({ where: { fromPath: toPath } });
  await tx.slugRedirect.updateMany({ where: { toPath: fromPath }, data: { toPath } });
  await tx.slugRedirect.upsert({ where: { fromPath }, create: { fromPath, toPath }, update: { toPath } });
}
