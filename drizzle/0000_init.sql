CREATE TYPE "public"."aisle" AS ENUM('produce', 'meat_seafood', 'dairy_eggs', 'bakery', 'deli', 'pantry', 'canned_jarred', 'pasta_grains', 'spices_baking', 'condiments', 'frozen', 'beverages', 'snacks', 'household', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('queued', 'fetching', 'reading', 'ready', 'failed', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'pending_approval', 'approved');--> statement-breakpoint
CREATE TYPE "public"."recipe_source" AS ENUM('manual', 'instagram', 'tiktok', 'website', 'image', 'text');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('active', 'disliked', 'archived');--> statement-breakpoint
CREATE TABLE "grocery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"merge_key" text,
	"name" text NOT NULL,
	"quantity" numeric(10, 3),
	"unit" text,
	"aisle" "aisle" DEFAULT 'other' NOT NULL,
	"is_pantry" boolean DEFAULT false NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_by" text,
	"checked_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_list_recipes" (
	"list_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric(6, 2) NOT NULL,
	CONSTRAINT "grocery_list_recipes_list_id_recipe_id_pk" PRIMARY KEY("list_id","recipe_id"),
	CONSTRAINT "grocery_list_recipes_servings" CHECK ("grocery_list_recipes"."servings" > 0)
);
--> statement-breakpoint
CREATE TABLE "grocery_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meal_plan_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "grocery_lists_status" CHECK ("grocery_lists"."status" in ('active','completed'))
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_household_id_user_id_pk" PRIMARY KEY("household_id","user_id"),
	CONSTRAINT "household_members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "household_members_role" CHECK ("household_members"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"invite_code" text,
	"invite_expires_at" timestamp with time zone,
	"aisle_order" "aisle"[] DEFAULT '{produce,meat_seafood,deli,bakery,dairy_eggs,frozen,pasta_grains,canned_jarred,condiments,spices_baking,pantry,snacks,beverages,household,other}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "households_name_length" CHECK (char_length("households"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"source_type" "recipe_source" NOT NULL,
	"source_url" text,
	"image_keys" text[] DEFAULT '{}' NOT NULL,
	"status" "import_status" DEFAULT 'queued' NOT NULL,
	"caption_text" text,
	"thumbnail_url" text,
	"video_key" text,
	"model" text,
	"draft" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"recipe_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "import_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aisle" "aisle" DEFAULT 'other' NOT NULL,
	"is_pantry_staple" boolean DEFAULT false NOT NULL,
	"usda_fdc_id" integer,
	"nutrients" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric(6, 2) NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_plan_entries_servings" CHECK ("meal_plan_entries"."servings" > 0)
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plans_week_start_monday" CHECK (extract(isodow from "meal_plans"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"section" text,
	"raw_text" text NOT NULL,
	"quantity" numeric(10, 3),
	"quantity_max" numeric(10, 3),
	"unit" text,
	"name" text NOT NULL,
	"prep_note" text,
	"is_optional" boolean DEFAULT false NOT NULL,
	"ingredient_id" uuid
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"recipe_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "recipe_tags_recipe_id_tag_id_pk" PRIMARY KEY("recipe_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_user_prefs" (
	"recipe_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" smallint,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_user_prefs_recipe_id_user_id_pk" PRIMARY KEY("recipe_id","user_id"),
	CONSTRAINT "recipe_user_prefs_rating" CHECK ("recipe_user_prefs"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_type" "recipe_source" DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"creator_name" text,
	"creator_handle" text,
	"cover_image_key" text,
	"servings" integer NOT NULL,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"status" "recipe_status" DEFAULT 'active' NOT NULL,
	"disliked_reason" text,
	"disliked_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "recipes_title_length" CHECK (char_length("recipes"."title") between 1 and 200),
	CONSTRAINT "recipes_servings_range" CHECK ("recipes"."servings" between 1 and 50),
	CONSTRAINT "recipes_prep_minutes" CHECK ("recipes"."prep_minutes" >= 0),
	CONSTRAINT "recipes_cook_minutes" CHECK ("recipes"."cook_minutes" >= 0),
	CONSTRAINT "recipes_disliked_reason" CHECK ("recipes"."status" <> 'disliked' or "recipes"."disliked_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_length" CHECK (char_length("tags"."name") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_list_recipes" ADD CONSTRAINT "grocery_list_recipes_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_list_recipes" ADD CONSTRAINT "grocery_list_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_tokens" ADD CONSTRAINT "import_tokens_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_user_prefs" ADD CONSTRAINT "recipe_user_prefs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grocery_items_list" ON "grocery_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "import_jobs_household_created" ON "import_jobs" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_household_name" ON "ingredients" USING btree ("household_id","name");--> statement-breakpoint
CREATE INDEX "meal_plan_entries_plan_day_slot" ON "meal_plan_entries" USING btree ("plan_id","day","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plans_household_week" ON "meal_plans" USING btree ("household_id","week_start");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_position" ON "recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipes_household_status" ON "recipes" USING btree ("household_id","status") WHERE "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_household_lower_name" ON "tags" USING btree ("household_id",lower("name"));