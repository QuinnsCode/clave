-- CreateTable
CREATE TABLE "site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "domains" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "site_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "site_site_key_key" ON "site"("site_key");

-- CreateIndex
CREATE INDEX "site_user_id_idx" ON "site"("user_id");

-- CreateIndex
CREATE INDEX "site_site_key_idx" ON "site"("site_key");