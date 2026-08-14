-- Earning views: one row per viewer, per title, per calendar month, created
-- once the viewer has watched enough of the title to pay its creator for it.

-- CreateTable
CREATE TABLE "media_views" (
    "view_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "media_id" BIGINT NOT NULL,
    "provider_id" BIGINT,
    "month" VARCHAR(7) NOT NULL,
    "seconds_watched" INTEGER NOT NULL,
    "payout_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_views_pkey" PRIMARY KEY ("view_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_views_user_id_media_id_month_key" ON "media_views"("user_id", "media_id", "month");
CREATE INDEX "media_views_provider_id_month_idx" ON "media_views"("provider_id", "month");
CREATE INDEX "media_views_media_id_month_idx" ON "media_views"("media_id", "month");

-- AddForeignKey
ALTER TABLE "media_views" ADD CONSTRAINT "media_views_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_views" ADD CONSTRAINT "media_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Backfill from the watch history already on record, under the same rules the
-- app now applies live: the furthest point a viewer reached in a title in a
-- given month has to clear the threshold for its category (music two minutes,
-- everything else eight), or the title's whole length when it is shorter than
-- that.
INSERT INTO "media_views" ("user_id", "media_id", "provider_id", "month", "seconds_watched", "payout_amount", "created_at")
SELECT
  w."user_id",
  w."media_id",
  m."provider_id",
  to_char(w."watched_at", 'YYYY-MM'),
  MAX(COALESCE(w."progress", 0)),
  0.08,
  MIN(w."watched_at")
FROM "watch_history" w
JOIN "media" m ON m."media_id" = w."media_id"
JOIN "categories" c ON c."category_id" = m."category_id"
WHERE w."media_id" IS NOT NULL AND w."watched_at" IS NOT NULL
GROUP BY w."user_id", w."media_id", m."provider_id", to_char(w."watched_at", 'YYYY-MM'), c."name", m."duration"
HAVING MAX(COALESCE(w."progress", 0)) >= (
  CASE
    WHEN COALESCE(m."duration", 0) > 0
     AND m."duration" * 60 < (CASE WHEN lower(c."name") = 'music' THEN 120 ELSE 480 END)
    THEN m."duration" * 60
    ELSE (CASE WHEN lower(c."name") = 'music' THEN 120 ELSE 480 END)
  END
)
ON CONFLICT DO NOTHING;
