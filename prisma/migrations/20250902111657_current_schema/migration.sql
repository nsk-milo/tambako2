-- CreateTable
CREATE TABLE "public"."categories" (
    "category_id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "public"."episodes" (
    "episode_id" BIGSERIAL NOT NULL,
    "season_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "episode_number" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "media_id" BIGINT NOT NULL,
    "release_date" DATE,
    "series_id" BIGINT,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("episode_id")
);

-- CreateTable
CREATE TABLE "public"."genres" (
    "genre_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("genre_id")
);

-- CreateTable
CREATE TABLE "public"."media" (
    "media_id" BIGSERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "release_date" DATE,
    "category_id" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "rating" DECIMAL(2,1),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "media_location" VARCHAR NOT NULL,
    "thumbnail_location" VARCHAR,

    CONSTRAINT "media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "public"."media_genres" (
    "media_id" BIGINT NOT NULL,
    "genre_id" INTEGER NOT NULL,

    CONSTRAINT "media_genres_pkey" PRIMARY KEY ("media_id","genre_id")
);

-- CreateTable
CREATE TABLE "public"."seasons" (
    "season_id" BIGSERIAL NOT NULL,
    "season_number" INTEGER NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("season_id")
);

-- CreateTable
CREATE TABLE "public"."series" (
    "series_id" BIGSERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_pkey" PRIMARY KEY ("series_id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "subscription_id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "public"."user_subscriptions" (
    "user_subscription_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("user_subscription_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "user_id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "transaction_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "user_subscription_id" BIGINT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "public"."watch_history" (
    "history_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "media_id" BIGINT,
    "watched_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "progress" INTEGER DEFAULT 0,
    "completed" BOOLEAN DEFAULT false,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "public"."favorites" (
    "favorite_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "media_id" BIGINT NOT NULL,
    "added_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("favorite_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "public"."categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_season_id_episode_number_key" ON "public"."episodes"("season_id", "episode_number");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "public"."genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_season_number_key" ON "public"."seasons"("season_number");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_type_key" ON "public"."subscriptions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "public"."users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_media_id_key" ON "public"."favorites"("user_id", "media_id");

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("season_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."series"("series_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media" ADD CONSTRAINT "media_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."media_genres" ADD CONSTRAINT "media_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("genre_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."media_genres" ADD CONSTRAINT "media_genres_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."user_subscriptions" ADD CONSTRAINT "user_subscriptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("subscription_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_user_subscription_id_fkey" FOREIGN KEY ("user_subscription_id") REFERENCES "public"."user_subscriptions"("user_subscription_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."watch_history" ADD CONSTRAINT "watch_history_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;
