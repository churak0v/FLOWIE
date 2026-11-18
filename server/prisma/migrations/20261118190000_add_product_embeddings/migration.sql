CREATE TABLE "ProductEmbedding" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "documentVersion" VARCHAR(40) NOT NULL,
  "model" VARCHAR(100) NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "vector" DOUBLE PRECISION[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductEmbedding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductEmbedding_dimensions_positive" CHECK ("dimensions" > 0),
  CONSTRAINT "ProductEmbedding_vector_dimensions" CHECK (COALESCE(array_length("vector", 1), 0) = "dimensions")
);

CREATE UNIQUE INDEX "ProductEmbedding_productId_key" ON "ProductEmbedding"("productId");
CREATE INDEX "ProductEmbedding_model_dimensions_documentVersion_idx"
  ON "ProductEmbedding"("model", "dimensions", "documentVersion");
