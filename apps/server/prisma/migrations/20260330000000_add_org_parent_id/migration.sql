-- AlterTable: add nullable parent_org_id to organizations for umbrella/chapter hierarchy
ALTER TABLE "organizations" ADD COLUMN "parent_org_id" TEXT;

-- AddForeignKey: self-referential FK — chapters point up to their parent (umbrella) org
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_org_id_fkey"
  FOREIGN KEY ("parent_org_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
