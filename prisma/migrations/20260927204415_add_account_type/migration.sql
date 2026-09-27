-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'SUMUP');

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "type" "AccountType" NOT NULL DEFAULT 'BANK';
