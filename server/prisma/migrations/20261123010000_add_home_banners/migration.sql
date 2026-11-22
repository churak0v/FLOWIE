CREATE TABLE "HomeBanner" (
  "id" VARCHAR(32) NOT NULL,
  "caption" VARCHAR(100) NOT NULL,
  "subtitle" VARCHAR(220) NOT NULL DEFAULT '',
  "image" VARCHAR(500) NOT NULL,
  "href" VARCHAR(300) NOT NULL DEFAULT '/catalog',
  "imagePosition" VARCHAR(60) NOT NULL DEFAULT 'center 58%',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeBanner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HomeBanner_isActive_sort_idx" ON "HomeBanner"("isActive", "sort");
INSERT INTO "HomeBanner" ("id","caption","subtitle","image","href","imagePosition","sort","isActive") VALUES
('mother', 'Мам, это всё тебе.', 'Цветы ко Дню матери — подарок, который скажет больше слов', '/hero/flowie-hero-wishlist-grounded.jpg', '/catalog', 'center 54%', 0, true),
('birthday', 'С днём рождения. По-настоящему.', 'Выбрать букет, который запомнится', '/hero/flowie-hero-delivery-grounded.jpg', '/catalog', 'center 58%', 1, true),
('premium', 'Большие букеты. Большие эмоции.', 'Для особенного повода — выразительные цветочные композиции', '/hero/flowie-hero-real-gifts-grounded.jpg', '/catalog?sort=price_desc', 'center 58%', 2, true);
