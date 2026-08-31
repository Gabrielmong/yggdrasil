-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "BookEdit" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousValues" JSONB NOT NULL,
    "newValues" JSONB NOT NULL,

    CONSTRAINT "BookEdit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookEdit" ADD CONSTRAINT "BookEdit_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookEdit" ADD CONSTRAINT "BookEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
